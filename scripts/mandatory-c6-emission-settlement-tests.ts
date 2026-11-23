/**
 * Emissão, consulta, baixa e isolamento C6. Tudo simulado: nenhum HTTP real.
 * npx tsx scripts/mandatory-c6-emission-settlement-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { C6BoletoTransportError } from '../lib/banking/c6/c6BoletoClient';
import { C6EmissionNotHomologatedError } from '../lib/banking/c6/c6EmitGuard';
import {
  emitC6InstallmentBoleto,
  fetchC6InstallmentPdf,
  queryC6InstallmentBoleto,
} from '../lib/banking/c6/c6InstallmentCharge';
import { probeC6Connection, runC6ConnectionTest } from '../lib/banking/c6/c6ConnectionTest';
import { buildC6CarnePdfBytes } from '../lib/banking/c6/c6CarnePdf';
import { c6BankChargeToResponse } from '../lib/banking/c6/c6ChargeList';
import { resolveC6ChargeActions } from '../lib/charges/c6ChargeActions';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';
import { applyC6SettlementTransaction } from '../lib/banking/c6/c6SettlementTransaction';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const COMPANY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INSTALLMENT = 'cccccccc-cccc-4ccc-8ccc-eeeeeeeeeeee';
const NOW = new Date('2026-11-22T12:00:00-03:00');
const PEM_CERT = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
const PEM_KEY = '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----';
const LINE = '33690000000000000000000000000000000000000000000';

type Row = Record<string, unknown> & { id?: string };

function memory(seed: {
  companyId?: string;
  amount?: number;
  due?: string;
  integrationCompany?: string;
}) {
  const companyId = seed.companyId || COMPANY_A;
  const tables: Record<string, Row[]> = {
    finance_receipts: [
      {
        id: INSTALLMENT,
        company_id: companyId,
        tenant_id: companyId,
        sale_id: 'sale-1',
        customer_id: 'customer-1',
        financial_account_id: 'fa-1',
        amount: seed.amount ?? 10.5,
        due_date: seed.due || '2026-12-20',
        status: 'pendente',
        installment_number: 3,
        project_id: 'project-1',
      },
    ],
    customers: [
      {
        id: 'customer-1',
        company_id: companyId,
        name: 'Pagador Teste',
        cpf_cnpj: '52998224725',
        email: 'pagador@example.com',
        address: 'Rua A',
        address_number: '10',
        city: 'Sao Paulo',
        state_uf: 'SP',
        cep: '01313000',
      },
    ],
    company_financial_accounts: [
      { id: 'fa-1', company_id: companyId, bank_integration_id: 'int-1' },
    ],
    bank_integrations: [
      {
        id: 'int-1',
        company_id: seed.integrationCompany || companyId,
        provider: 'C6',
        environment: 'SANDBOX',
      },
    ],
    bank_charges: [],
    cash_movements: [],
    audit_logs: [],
  };
  const reservations: Array<{
    key: string;
    fingerprint: string;
    status: string;
    slip: string | null;
    httpStatus: number | null;
    retryAllowed: boolean;
  }> = [];

  function from(table: string) {
    const state = {
      op: 'select' as 'select' | 'insert' | 'update',
      filters: [] as Array<[string, unknown]>,
      inFilters: [] as Array<[string, unknown[]]>,
      payload: null as Row | null,
      one: false,
    };
    const exec = () => {
      const rows = tables[table] || (tables[table] = []);
      const matches = rows.filter(
        (row) =>
          state.filters.every(([key, value]) => row[key] === value) &&
          state.inFilters.every(([key, values]) => values.includes(row[key])),
      );
      if (state.op === 'insert' && state.payload) {
        const row = { id: `${table}-${rows.length + 1}`, ...state.payload };
        rows.push(row);
        return { data: state.one ? row : [row], error: null };
      }
      if (state.op === 'update' && state.payload) {
        for (const row of matches) Object.assign(row, state.payload);
        return { data: matches, error: null };
      }
      if (state.one) {
        if (matches.length > 1) return { data: null, error: { message: 'multiple' } };
        return { data: matches[0] || null, error: null };
      }
      return { data: matches, error: null };
    };
    const api = {
      select() { return api; },
      eq(key: string, value: unknown) { state.filters.push([key, value]); return api; },
      in(key: string, values: unknown[]) { state.inFilters.push([key, values]); return api; },
      filter() { return api; },
      insert(payload: Row) { state.op = 'insert'; state.payload = payload; return api; },
      update(payload: Row) { state.op = 'update'; state.payload = payload; return api; },
      maybeSingle() { state.one = true; return exec(); },
      single() { state.one = true; return exec(); },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(exec()).then(resolve, reject);
      },
    };
    return api;
  }

  const admin = {
    from,
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === 'settle_company_c6_bank_slip') {
        const result = await applyC6SettlementTransaction(tables, {
          companyId: String(args.p_company_id || ''),
          chargeId: String(args.p_charge_id || ''),
          receiptId: String(args.p_receipt_id || ''),
          integrationId: String(args.p_integration_id || ''),
          financialAccountId: String(args.p_financial_account_id || ''),
          bankSlipId: String(args.p_bank_slip_id || ''),
          paidAmount: Number(args.p_paid_amount),
          paidOn: String(args.p_paid_on || ''),
        });
        return { data: result, error: null };
      }
      const key = `${args.p_company_id}|${args.p_integration_id}|${args.p_external_reference_id}`;
      if (name === 'reserve_c6_boleto') {
        const found = reservations.find((item) => item.key === key);
        if (!found) {
          reservations.push({
            key,
            fingerprint: String(args.p_request_fingerprint),
            status: 'RESERVED',
            slip: null,
            httpStatus: null,
            retryAllowed: false,
          });
          return { data: { accepted: true, reason: 'reserved' }, error: null };
        }
        const definitive =
          found.status === 'FAILED' &&
          found.retryAllowed &&
          !found.slip &&
          [400, 401, 403, 404, 422].includes(Number(found.httpStatus));
        if (definitive) {
          found.status = 'RESERVED';
          found.fingerprint = String(args.p_request_fingerprint);
          found.retryAllowed = false;
          found.httpStatus = null;
          return { data: { accepted: true, reason: 'retry' }, error: null };
        }
        if (found.status === 'UNKNOWN') {
          return { data: { accepted: false, reason: 'needs_reconciliation' }, error: null };
        }
        return { data: { accepted: false, reason: 'blocked' }, error: null };
      }
      const found = reservations.find((item) => item.key === key);
      if (!found) return { data: null, error: { message: 'Reserva inexistente.' } };
      if (['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(found.status)) {
        return { data: { accepted: false, reason: 'blocked' }, error: null };
      }
      let status = String(args.p_status);
      let slip = args.p_c6_bank_slip_id ? String(args.p_c6_bank_slip_id) : null;
      if (status === 'SUCCEEDED' && (args.p_http_status !== 201 || !slip)) {
        status = 'UNKNOWN';
      }
      if (status === 'FAILED') slip = null;
      found.status = status;
      found.slip = status === 'FAILED' ? null : slip;
      found.httpStatus = args.p_http_status == null ? null : Number(args.p_http_status);
      found.retryAllowed =
        args.p_retry_allowed === true &&
        status === 'FAILED' &&
        !found.slip &&
        [400, 401, 403, 404, 422].includes(Number(found.httpStatus));
      return { data: { accepted: true, reason: status }, error: null };
    },
  };

  return { admin, tables, reservations };
}

const creds = {
  companyId: COMPANY_A,
  environment: 'SANDBOX' as const,
  clientId: 'client-publico',
  clientSecret: 'segredo-que-nao-pode-sair',
  certificatePem: PEM_CERT,
  privateKeyPem: PEM_KEY,
};

function authFetch() {
  return async () => ({
    status: 200,
    bodyText: JSON.stringify({
      access_token: 'token-que-nao-pode-sair',
      token_type: 'Bearer',
      expires_in: 600,
    }),
  });
}

function boletoFetch(
  mode: 'ok' | 'timeout' | 'ambiguous' | 'paid' | 'divergent' | 'pdf' | 'rejected' | 'conflict' | 'rejected-with-id',
  calls: { n: number; body: string },
) {
  return async (url: string, init: { body?: string }) => {
    calls.n += 1;
    calls.body = init.body || '';
    if (mode === 'timeout') throw new C6BoletoTransportError('TIMEOUT', 'Timeout ao contatar o C6 Bank (boleto).');
    if (mode === 'rejected' || mode === 'conflict' || mode === 'rejected-with-id') {
      return {
        status: mode === 'conflict' ? 409 : 400,
        bodyText: JSON.stringify({
          title: 'Invalid request',
          detail: 'campo recusado access_token segredo-que-nao-pode-sair',
          ...(mode === 'rejected-with-id' ? { id: 'slip-oculto' } : {}),
        }),
      };
    }
    if (url.includes('/pdf')) {
      return { status: 200, bodyText: '%PDF-1.4', contentType: 'application/pdf', pdfMagic: true };
    }
    if (mode === 'ambiguous') return { status: 201, bodyText: '{"amount":10.5}' };
    if (mode === 'paid' || mode === 'divergent') {
      return {
        status: 200,
        bodyText: JSON.stringify({
          id: 'slip-1',
          status: 'PAID',
          amount: mode === 'divergent' ? 1 : 10.5,
          due_date: '2026-12-20',
          payments: [{ date: '2026-12-21', amount: mode === 'divergent' ? 1 : 10.5 }],
          pix_qr: 'nao-documentado',
        }),
      };
    }
    return {
      status: 201,
      bodyText: JSON.stringify({
        id: 'slip-1',
        amount: 10.5,
        due_date: '2026-12-20',
        digitable_line: LINE,
        bar_code: '33690000000000000000000000000000000000000000',
        our_number: '998877',
        pix_qr: 'nao-documentado',
      }),
    };
  };
}

async function main() {
  const blocked = memory({});
  let blockedError = false;
  try {
    await emitC6InstallmentBoleto(blocked.admin as never, COMPANY_A, INSTALLMENT);
  } catch (error) {
    blockedError = error instanceof C6EmissionNotHomologatedError;
  }
  assert(blockedError && blocked.reservations.length === 0, 'sem autorização a emissão nem reserva');

  const emittedCalls = { n: 0, body: '' };
  const emitted = memory({});
  let v1Retired = false;
  try {
    await emitC6InstallmentBoleto(emitted.admin as never, COMPANY_A, INSTALLMENT, {
      allowSimulatedHttp: true,
      fetchFn: boletoFetch('ok', emittedCalls) as never,
      authFetchFn: authFetch() as never,
      credentials: creds,
      now: NOW,
    });
  } catch (error) {
    v1Retired = error instanceof Error && error.message.includes('Bolepix v2');
  }
  assert(v1Retired && emittedCalls.n === 0 && emitted.reservations.length === 0, 'nova emissão não chama a API v1 nem reserva');
  assert(!emittedCalls.body.includes('/v1/bank_slips/'), 'não há fallback para o POST v1');
  const receipt = emitted.tables.finance_receipts[0];
  assert(receipt.amount === 10.5 && receipt.due_date === '2026-12-20' && receipt.status === 'pendente', 'a parcela não muda na emissão');

  const foreign = memory({ companyId: COMPANY_B });
  let foreignError = false;
  try {
    await emitC6InstallmentBoleto(foreign.admin as never, COMPANY_A, INSTALLMENT, {
      allowSimulatedHttp: true,
      fetchFn: boletoFetch('ok', { n: 0, body: '' }) as never,
      authFetchFn: authFetch() as never,
      credentials: { ...creds, companyId: COMPANY_A },
      now: NOW,
    });
  } catch (error) {
    foreignError = error instanceof Error && error.message.includes('outra empresa');
  }
  assert(foreignError && foreign.reservations.length === 0, 'empresa A não emite parcela da empresa B');

  const paid = memory({});
  paid.tables.bank_charges.push({
    id: 'charge-hist',
    company_id: COMPANY_A,
    integration_id: 'int-1',
    finance_receipt_id: INSTALLMENT,
    provider: 'C6',
    external_id: 'slip-1',
    amount: 10.5,
    due_date: '2026-12-20',
    status: 'REGISTERED',
    digitable_line: LINE,
    barcode: '33690000000000000000000000000000000000000000',
  });
  const consulted = await queryC6InstallmentBoleto(paid.admin as never, COMPANY_A, INSTALLMENT, {
    allowSimulatedHttp: true,
    fetchFn: boletoFetch('paid', { n: 0, body: '' }) as never,
    authFetchFn: authFetch() as never,
    credentials: creds,
  });
  assert(consulted.slip?.status === 'PAID' && consulted.settlement?.paid === true, 'consulta paga baixa a parcela');
  assert(paid.tables.finance_receipts[0].status === 'pago', 'a parcela fica paga');
  assert(paid.tables.cash_movements.length === 1, 'há uma movimentação');
  const again = await queryC6InstallmentBoleto(paid.admin as never, COMPANY_A, INSTALLMENT, {
    allowSimulatedHttp: true,
    fetchFn: boletoFetch('paid', { n: 0, body: '' }) as never,
    authFetchFn: authFetch() as never,
    credentials: creds,
  });
  assert(again.settlement?.duplicate === true && paid.tables.cash_movements.length === 1, 'a segunda baixa não duplica o caixa');

  const divergent = memory({});
  divergent.tables.bank_charges.push({
    id: 'charge-div',
    company_id: COMPANY_A,
    integration_id: 'int-1',
    finance_receipt_id: INSTALLMENT,
    provider: 'C6',
    external_id: 'slip-1',
    amount: 10.5,
    due_date: '2026-12-20',
    status: 'REGISTERED',
  });
  const diverged = await queryC6InstallmentBoleto(divergent.admin as never, COMPANY_A, INSTALLMENT, {
    allowSimulatedHttp: true,
    fetchFn: boletoFetch('divergent', { n: 0, body: '' }) as never,
    authFetchFn: authFetch() as never,
    credentials: creds,
  });
  assert(diverged.settlement?.divergent === true && divergent.tables.finance_receipts[0].status === 'pendente', 'valor divergente não baixa');

  const pdf = await fetchC6InstallmentPdf(paid.admin as never, COMPANY_A, INSTALLMENT, {
    allowSimulatedHttp: true,
    fetchFn: boletoFetch('pdf', { n: 0, body: '' }) as never,
    authFetchFn: authFetch() as never,
    credentials: creds,
  });
  assert(pdf.ok && pdf.httpStatus === 200 && pdf.bytes?.subarray(0, 4).toString() === '%PDF', 'consulta de PDF simulada devolve os bytes');

  const missingCalls = { n: 0, body: '' };
  const missingNumber = memory({});
  missingNumber.tables.customers[0].address = 'RUA 27 DE MARCO';
  missingNumber.tables.customers[0].address_number = '';
  let missingMessage = '';
  try {
    await emitC6InstallmentBoleto(missingNumber.admin as never, COMPANY_A, INSTALLMENT, {
      allowSimulatedHttp: true,
      fetchFn: boletoFetch('ok', missingCalls) as never,
      authFetchFn: authFetch() as never,
      credentials: creds,
      now: NOW,
    });
  } catch (error) {
    missingMessage = error instanceof Error ? error.message : '';
  }
  assert(
    missingMessage ===
      'O Banco C6 exige o número do endereço do comprador. Atualize o cadastro do cliente antes de gerar o boleto.' &&
      missingCalls.n === 0 &&
      missingNumber.reservations.length === 0,
    'número ausente falha antes do banco e da reserva',
  );

  const withoutNumberCalls = { n: 0, body: '' };
  const withoutNumber = memory({});
  withoutNumber.tables.customers[0].address_number = 'S/N';
  let withoutNumberMessage = '';
  try {
    await emitC6InstallmentBoleto(withoutNumber.admin as never, COMPANY_A, INSTALLMENT, {
      allowSimulatedHttp: true,
      fetchFn: boletoFetch('ok', withoutNumberCalls) as never,
      authFetchFn: authFetch() as never,
      credentials: creds,
      now: NOW,
    });
  } catch (error) {
    withoutNumberMessage = error instanceof Error ? error.message : '';
  }
  assert(
    withoutNumberMessage.includes('não aceita texto nem S/N') &&
      withoutNumberCalls.n === 0 &&
      withoutNumber.reservations.length === 0,
    'S/N não vira zero e não reserva boleto',
  );

  const pending = resolveC6ChargeActions({
    installmentPaid: false,
    ownerReadOnly: false,
    uncertain: false,
  });
  const registered = resolveC6ChargeActions({
    externalId: 'slip-1',
    status: 'REGISTERED',
    digitableLine: LINE,
    installmentPaid: false,
    ownerReadOnly: false,
    uncertain: false,
  });
  const paidActions = resolveC6ChargeActions({
    externalId: 'slip-1',
    status: 'PAID',
    installmentPaid: true,
    ownerReadOnly: false,
    uncertain: false,
  });
  const uncertain = resolveC6ChargeActions({
    installmentPaid: false,
    ownerReadOnly: false,
    uncertain: true,
    rejectionMessage: 'Resposta ambígua do C6.',
  });
  assert(pending.showGenerate && !pending.showDownload, 'parcela sem boleto oferece gerar');
  assert(registered.showDownload && registered.showView && !registered.showGenerate, 'boleto registrado não gera outro');
  assert(
    Boolean(registered.notice && registered.notice.includes('não informa')),
    'emissão confirmada não afirma que a rede bancária já aceita o boleto',
  );
  assert(paidActions.showPaid && !paidActions.showGenerate, 'parcela paga não gera outro boleto');
  assert(!uncertain.showGenerate && Boolean(uncertain.notice), 'resultado incerto bloqueia nova emissão');

  const carne = await buildC6CarnePdfBytes({
    items: [{
      charge: {
        id: 'charge-1',
        companyId: COMPANY_B,
        customerId: null,
        saleId: 'sale-1',
        installmentId: INSTALLMENT,
        asaasPaymentId: 'slip-1',
        billingType: 'BOLETO',
        status: 'PENDING',
        value: 10.5,
        dueDate: '2026-12-20',
        invoiceUrl: null,
        bankSlipUrl: null,
        bankSlipIdentification: LINE,
        pixQrCode: null,
        pixCopyPaste: null,
        financialAccountId: null,
        paymentLink: null,
        paidAt: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      } satisfies CompanyAsaasChargeResponse,
      parcelLabel: '03/12',
      totalParcels: 12,
    }],
    totalParcels: 12,
    summary: {
      saleId: 'sale-1',
      companyId: COMPANY_B,
      customerName: 'Pagador Teste',
      customerEmail: null,
      customerPhone: null,
      projectName: 'Empreendimento',
      quadra: '01',
      lote: '02',
      lotLabel: 'QD 01 LT 02',
      contractNumber: null,
      financialAccountId: null,
      financialAccountName: 'C6',
      hasFinancialAccount: true,
      financialAccountBlockReason: null,
      totalInstallments: 12,
      paidInstallments: 0,
      eligibleInstallments: 12,
      chargesGenerated: 1,
      chargesMissing: 11,
      printableChargesCount: 1,
      chargesFailed: 0,
      chargesCancelled: 0,
      firstDueDate: '2026-12-20',
      lastDueDate: '2026-12-20',
      totalAmount: 10.5,
      totalPaid: 0,
      totalPending: 10.5,
      missingInstallmentIds: [],
      missingInstallments: [],
      errorInstallmentIds: [],
      installmentCorrectionType: null,
      carneReady: true,
      carneBlockReason: null,
      uiState: 'carne_ready',
    },
  });
  assert(carne.included === 1, 'carnê C6 usa a linha oficial da parcela');
  let lineWithoutIdRejected = false;
  try {
    await buildC6CarnePdfBytes({
      items: [{
        charge: {
          asaasPaymentId: '',
          bankSlipIdentification: LINE,
        } as CompanyAsaasChargeResponse,
        parcelLabel: 'Entrada',
        totalParcels: 1,
      }],
      totalParcels: 1,
      summary: {} as never,
    });
  } catch (error) {
    lineWithoutIdRejected = error instanceof Error && error.message.includes('oficiais');
  }
  assert(lineWithoutIdRejected, 'linha sem identificador oficial não vira carnê');
  const mapped = c6BankChargeToResponse(
    {
      id: 'charge-1',
      external_id: 'slip-1',
      finance_receipt_id: INSTALLMENT,
      amount: 10,
      due_date: '2026-11-22',
      status: 'REGISTERED',
      our_number: '998877',
      digitable_line: LINE,
    },
    COMPANY_A,
  );
  assert(
    mapped.nossoNumero === '998877' && mapped.pixCopyPaste == null && mapped.pixQrCode == null,
    'o retorno C6 preenche nosso número e não fabrica Pix',
  );

  let bankCalls = 0;
  const production = await probeC6Connection(
    { ...creds, companyId: COMPANY_A, environment: 'PRODUCTION' },
    {
      allowProduction: true,
      fetchFn: async () => {
        bankCalls += 1;
        return { status: 200, bodyText: '{"access_token":"nao"}' };
      },
    },
  );
  assert(production.ok === true && bankCalls === 1 && !JSON.stringify(production).includes('nao'), 'o teste explícito de Production não devolve o token');
  const sandbox = await probeC6Connection(creds, {
    fetchFn: async () => ({
      status: 200,
      bodyText: JSON.stringify({ access_token: 'token-que-nao-pode-sair', token_type: 'Bearer', expires_in: 60, scope: 'bankslip.read' }),
    }),
  });
  assert(sandbox.ok === true && !JSON.stringify(sandbox).includes('token-que-nao-pode-sair'), 'o teste simulado não devolve o token');
  const incomplete = await runC6ConnectionTest({
    from() {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  } as never, COMPANY_B);
  assert(incomplete.executed === false && incomplete.ok === false, 'sem credencial o teste não chama o banco');

  const root = path.resolve(__dirname, '..');
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
  const asaas = read('lib/finance/asaasCompanyChargeService.ts');
  const inter = read('lib/banking/inter/interSaleChargeService.ts');
  const webhook = read('app/api/banking/c6/webhook/route.ts');
  const charges = read('app/api/banking/c6/charges/route.ts');
  assert(!asaas.includes('emitC6InstallmentBoleto') && !inter.includes('emitC6InstallmentBoleto'), 'Asaas e Inter não emitem pelo C6');
  assert(asaas.includes('A conta C6 não usa o fluxo do Asaas.'), 'Asaas continua recusando C6');
  assert(!webhook.includes('finance_receipts') && webhook.includes('inboundSchema'), 'webhook não baixa parcela');
  assert(charges.indexOf('isC6EmissionActivated') < charges.indexOf('emitC6InstallmentBoleto'), 'a rota só emite depois da ativação da empresa');
  const migration = read('supabase/migrations/20261122180000_c6_boleto_definitive_rejection_retry.sql');
  assert(migration.includes('retry_allowed'), 'a migration registra a rejeição reabrível');
  assert(migration.includes('last_http_status IN (400, 401, 403, 404, 422)'), 'só rejeição definitiva reabre');
  assert(migration.includes("status = 'FAILED'"), 'resposta incerta não entra na reabertura');
  assert(migration.includes('c6_bank_slip_id IS NULL'), 'boleto identificado não reabre');
  assert(migration.includes('bank_charges'), 'cobrança já registrada impede a reabertura');
  assert(!/update\s+public\.finance_receipts/i.test(migration), 'a migration não altera recebíveis');
  assert(!/update\s+public\.sales/i.test(migration), 'a migration não altera vendas');
  console.log('C6_EMISSION_SETTLEMENT_OK');
  console.log('SIMULADO: emissão, Pix ausente, idempotência, timeout, consulta, baixa e conexão. Nenhum HTTP real.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
