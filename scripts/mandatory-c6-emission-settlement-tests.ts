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
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';

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
  const reservations: Array<{ key: string; fingerprint: string; status: string; slip: string | null }> = [];

  function from(table: string) {
    const state = {
      op: 'select' as 'select' | 'insert' | 'update',
      filters: [] as Array<[string, unknown]>,
      payload: null as Row | null,
      one: false,
    };
    const exec = () => {
      const rows = tables[table] || (tables[table] = []);
      const matches = rows.filter((row) => state.filters.every(([key, value]) => row[key] === value));
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
    rpc(name: string, args: Record<string, unknown>) {
      const key = `${args.p_company_id}|${args.p_integration_id}|${args.p_external_reference_id}`;
      if (name === 'reserve_c6_boleto') {
        const found = reservations.find((item) => item.key === key);
        if (!found) {
          reservations.push({
            key,
            fingerprint: String(args.p_request_fingerprint),
            status: 'RESERVED',
            slip: null,
          });
          return { data: { accepted: true, reason: 'reserved' }, error: null };
        }
        if (found.fingerprint !== args.p_request_fingerprint) {
          return { data: { accepted: false, reason: 'blocked' }, error: null };
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
        slip = null;
      }
      found.status = status;
      found.slip = slip;
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

function boletoFetch(mode: 'ok' | 'timeout' | 'ambiguous' | 'paid' | 'divergent' | 'pdf', calls: { n: number; body: string }) {
  return async (url: string, init: { body?: string }) => {
    calls.n += 1;
    calls.body = init.body || '';
    if (mode === 'timeout') throw new C6BoletoTransportError('TIMEOUT', 'Timeout ao contatar o C6 Bank (boleto).');
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
  const first = await emitC6InstallmentBoleto(emitted.admin as never, COMPANY_A, INSTALLMENT, {
    allowSimulatedHttp: true,
    fetchFn: boletoFetch('ok', emittedCalls) as never,
    authFetchFn: authFetch() as never,
    credentials: creds,
    now: NOW,
  });
  assert(first.emitted && first.bankSlipId === 'slip-1', 'boleto individual simulado registra o id');
  assert(first.pixCopyPaste === null && first.bolepixSpecInRepo === false, 'Pix não é inventado');
  assert(!emittedCalls.body.includes('pix') && !emittedCalls.body.includes('chave'), 'o POST oficial não leva Pix');
  const sent = JSON.parse(emittedCalls.body) as { amount: number; due_date: string; payer: { tax_id: string } };
  assert(sent.amount === 10.5 && sent.due_date === '2026-12-20', 'valor e vencimento originais são enviados');
  assert(sent.payer.tax_id === '52998224725', 'o pagador da parcela é enviado');
  const receipt = emitted.tables.finance_receipts[0];
  assert(receipt.amount === 10.5 && receipt.due_date === '2026-12-20' && receipt.status === 'pendente', 'a parcela não muda na emissão');
  const second = await emitC6InstallmentBoleto(emitted.admin as never, COMPANY_A, INSTALLMENT, {
    allowSimulatedHttp: true,
    fetchFn: boletoFetch('ok', emittedCalls) as never,
    authFetchFn: authFetch() as never,
    credentials: creds,
    now: NOW,
  });
  assert(second.reused && emittedCalls.n === 1, 'a segunda emissão não chama o banco');

  const timeoutCalls = { n: 0, body: '' };
  const timeout = memory({});
  const timed = await emitC6InstallmentBoleto(timeout.admin as never, COMPANY_A, INSTALLMENT, {
    allowSimulatedHttp: true,
    fetchFn: boletoFetch('timeout', timeoutCalls) as never,
    authFetchFn: authFetch() as never,
    credentials: creds,
    now: NOW,
  });
  assert(timed.needsReconciliation && timeout.reservations[0]?.status === 'UNKNOWN', 'timeout fica ambíguo');
  await emitC6InstallmentBoleto(timeout.admin as never, COMPANY_A, INSTALLMENT, {
    allowSimulatedHttp: true,
    fetchFn: boletoFetch('timeout', timeoutCalls) as never,
    authFetchFn: authFetch() as never,
    credentials: creds,
    now: NOW,
  });
  assert(timeoutCalls.n === 1, 'timeout não gera segunda emissão');

  const ambiguousCalls = { n: 0, body: '' };
  const ambiguous = memory({});
  const unclear = await emitC6InstallmentBoleto(ambiguous.admin as never, COMPANY_A, INSTALLMENT, {
    allowSimulatedHttp: true,
    fetchFn: boletoFetch('ambiguous', ambiguousCalls) as never,
    authFetchFn: authFetch() as never,
    credentials: creds,
    now: NOW,
  });
  assert(!unclear.emitted && unclear.needsReconciliation && ambiguous.tables.bank_charges.length === 0, 'HTTP 201 sem id não grava boleto');

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
  await emitC6InstallmentBoleto(paid.admin as never, COMPANY_A, INSTALLMENT, {
    allowSimulatedHttp: true,
    fetchFn: boletoFetch('ok', { n: 0, body: '' }) as never,
    authFetchFn: authFetch() as never,
    credentials: creds,
    now: NOW,
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
  await emitC6InstallmentBoleto(divergent.admin as never, COMPANY_A, INSTALLMENT, {
    allowSimulatedHttp: true,
    fetchFn: boletoFetch('ok', { n: 0, body: '' }) as never,
    authFetchFn: authFetch() as never,
    credentials: creds,
    now: NOW,
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
  assert(pdf.ok && pdf.httpStatus === 200, 'consulta de PDF simulada');

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
  console.log('C6_EMISSION_SETTLEMENT_OK');
  console.log('SIMULADO: emissão, Pix ausente, idempotência, timeout, consulta, baixa e conexão. Nenhum HTTP real.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
