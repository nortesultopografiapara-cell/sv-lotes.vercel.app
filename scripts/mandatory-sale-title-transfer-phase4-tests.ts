/**
 * P4 — execução da Transferência de titularidade (mocks). Sem transferência real.
 * npx tsx scripts/mandatory-sale-title-transfer-phase4-tests.ts
 */
import fs from 'node:fs';
import path from 'path';
import { generateContractHTML } from '../lib/contractTemplate';
import { buildSaleContractClauseQuartaHtml } from '../lib/saleContractLegalTemplate';
import {
  installmentHasBlockingCharge,
  installmentNeedsAsaasCharge,
} from '../lib/finance/saleChargesShared';
import {
  buildTitleTransferContractFinanceContext,
  buildTitleTransferPadraoClauseQuartaHtml,
  TITLE_TRANSFER_CONTRACT_FINANCE_KEY,
} from '../lib/finance/saleTitleTransferContractContext';
import { TITLE_TRANSFER_SAME_TITULAR, TITLE_TRANSFER_CONTRACT_CHANGED } from '../lib/finance/saleTitleTransferPlan';
import { TITLE_TRANSFER_CROSS_TENANT } from '../lib/finance/saleTitleTransferPreview';
import {
  TITLE_TRANSFER_CHARGES_CANCEL_FAILED,
  TITLE_TRANSFER_CHARGES_LIVE_DISABLED,
  TITLE_TRANSFER_CHARGES_NON_CANCELABLE,
  TITLE_TRANSFER_EXECUTE_CONFIRM_TEXT,
  TITLE_TRANSFER_INTER_REMOTE_CANCEL_PENDING,
  TITLE_TRANSFER_INTER_REMOTE_CANCEL_PENDING_MESSAGE,
  TITLE_TRANSFER_TITULAR_CHANGED,
  buildTitleTransferIdempotencyKey,
  parseTitleTransferExecuteRpcError,
} from '../lib/finance/saleTitleTransferExecute';
import {
  isTitleTransferExternalChargesLiveAuthorized,
  setTitleTransferChargesLiveScopeEnvForTests,
  TITLE_TRANSFER_EXTERNAL_CHARGES_LIVE_ENV,
} from '../lib/finance/saleTitleTransferChargesLiveScope';
import {
  executeSaleTitleTransferWithExternalCharges,
  setTitleTransferLocalExecuteForTests,
} from '../lib/finance/saleTitleTransferChargesExecuteService';
import { TitleTransferPreviewError } from '../lib/finance/saleTitleTransferPreviewService';
import { PRODUCTION_PROJECT_REF } from '../lib/homolog/env';
import {
  ensureExternalChargeProvidersRegistered,
  setExternalChargeMutationFnsForTests,
} from '../lib/finance/externalCharges';
import { summarizeTitleTransferFinance } from '../lib/finance/saleTitleTransferPreview';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function asTtError(err: unknown): TitleTransferPreviewError {
  if (!(err instanceof TitleTransferPreviewError)) throw err;
  return err;
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function finance25() {
  return summarizeTitleTransferFinance({
    salePrice: 25,
    todayIso: '2026-09-07',
    receipts: [
      { id: 'p', status: 'pago', amount: 11.67, paid_at: '2026-08-01' },
      { id: 'n', status: 'pendente', amount: 13.33, due_date: '2026-12-10' },
    ],
  });
}

function testContractHtmlContinuity() {
  const finance = finance25();
  const ctx = buildTitleTransferContractFinanceContext({
    salePrice: 25,
    finance,
    declaredAgioAmount: 1500,
    remainingInstallments: [
      { installment_number: 2, amount: 13.33, due_date: '2026-12-10' },
    ],
  });
  assert(ctx.salePatch.down_payment === 0, 'sem nova entrada');
  assert(ctx.snapshot.remaining_balance === finance.remainingBalance, 'saldo intacto');
  assert(ctx.snapshot.declared_agio_amount === 1500, 'ágio documental no snapshot');
  const quarta = buildTitleTransferPadraoClauseQuartaHtml({
    valorTotalFmt: 'R$ 25,00',
    valorTotalExtenso: 'vinte e cinco reais',
    snapshot: ctx.snapshot,
  });
  assert(quarta.includes('cessionário'), 'redação de cessão');
  assert(quarta.includes('R$ 11,67') || quarta.includes('11,67'), 'pago aproveitado');
  assert(quarta.includes('R$ 13,33') || quarta.includes('13,33'), 'saldo assumido');
  assert(!/nova entrada do cessionário, restando/.test(quarta) || quarta.includes('sem constituir nova entrada'), 'não é entrada de B');
  const padrao = buildSaleContractClauseQuartaHtml({
    isCash: false,
    valorTotalFmt: 'R$ 25,00',
    valorTotalExtenso: 'vinte e cinco reais',
    valorEntradaFmt: 'R$ 11,67',
    valorEntradaExtenso: 'onze reais',
    qtdParcelas: 1,
    valorParcelaFmt: 'R$ 13,33',
    valorParcelaExtenso: 'treze reais',
    dataPrimeiraParcelaFmt: '10/12/2026',
    dataUltimaParcelaFmt: '10/12/2026',
    titleTransferSnapshot: ctx.snapshot,
  });
  assert(padrao.includes('cessionário'), 'PADRAO usa ramo de transferência');
  assert(!padrao.includes('entrada de <strong>R$ 11,67'), 'não reabre entrada');

  const html = generateContractHTML({
    tenant: { name: 'Empresa Teste', cnpj: '00000000000191', contract_model: 'PADRAO' },
    customer: {
      name: 'Titular B',
      cpf_cnpj: '39053344705',
      document: '39053344705',
    },
    project: { name: 'Loteamento Homolog', city: 'Parauapebas', uf: 'PA' },
    block: { number: '02', block_name: '01', area: 250 },
    sale: {
      agreed_price: 25,
      ...ctx.salePatch,
    },
    financeReceipts: ctx.financeReceipts,
  });
  assert(html.includes('cessionário') || html.includes('já se encontra pago'), 'HTML B continuidade');
  assert(html.includes(TITLE_TRANSFER_CONTRACT_FINANCE_KEY) === false, 'chave não vaza no HTML');
  assert(!/entrada de <strong>R\$ 11,67/.test(html), 'HTML sem nova entrada');
  console.log('OK testContractHtmlContinuity');
}

function testOfficialChargesMissingAfterCancel() {
  const pending = {
    id: 'r-new',
    sale_id: 'sale-1',
    installment_number: 2,
    amount: 13.33,
    status: 'pendente',
    due_date: '2026-12-10',
  };
  assert(
    installmentHasBlockingCharge({ status: 'PENDING' } as never) === true,
    'aberta bloqueia',
  );
  assert(
    installmentHasBlockingCharge({ status: 'PAID' } as never) === true,
    'paga bloqueia',
  );
  assert(
    installmentHasBlockingCharge({ status: 'CANCELLED' } as never) === false,
    'cancelada não bloqueia',
  );
  assert(
    installmentNeedsAsaasCharge({
      installment: pending,
      charge: { status: 'CANCELLED' } as never,
    }) === true,
    'parcela pendente volta a faltar após cancelar título antigo',
  );
  assert(
    installmentNeedsAsaasCharge({
      installment: { ...pending, id: 'r-old', status: 'cancelado' },
      charge: { status: 'CANCELLED' } as never,
    }) === false,
    'parcela antiga cancelada não entra em Gerar cobranças faltantes',
  );
  console.log('OK testOfficialChargesMissingAfterCancel');
}

function testLiveScopeAndRpcParser() {
  setTitleTransferChargesLiveScopeEnvForTests({
    NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    [TITLE_TRANSFER_EXTERNAL_CHARGES_LIVE_ENV]: 'true',
  });
  const asaas = isTitleTransferExternalChargesLiveAuthorized({
    companyId: 'co-1',
    saleId: 'sale-1',
    providers: ['ASAAS'],
  });
  assert(asaas.live === true, 'Production Asaas LIVE on');
  const inter = isTitleTransferExternalChargesLiveAuthorized({
    companyId: 'co-1',
    saleId: 'sale-1',
    providers: ['INTER'],
  });
  assert(inter.live === false, 'Production Inter LIVE off');
  const mixed = isTitleTransferExternalChargesLiveAuthorized({
    companyId: 'co-1',
    saleId: 'sale-1',
    providers: ['ASAAS', 'INTER'],
  });
  assert(mixed.live === false, 'Production Asaas+Inter LIVE off');
  setTitleTransferChargesLiveScopeEnvForTests(null);
  const parsed = parseTitleTransferExecuteRpcError(
    'TITLE_TRANSFER_EXECUTE:CROSS_TENANT:A venda não pertence à empresa atual.',
  );
  assert(parsed.code === 'CROSS_TENANT', 'parser RPC');
  assert(
    buildTitleTransferIdempotencyKey({
      saleId: 's',
      fromCustomerId: 'a',
      toCustomerId: 'b',
      contractId: 'ct',
    }) === 's:a:b:ct',
    'idempotency',
  );
  console.log('OK testLiveScopeAndRpcParser');
}

type Store = Record<string, Array<Record<string, unknown>>>;

class Query {
  lastInserted: Record<string, unknown> | null = null;
  constructor(
    private store: Store,
    private table: string,
  ) {}
  private filters: Array<[string, unknown]> = [];
  private inFilters: Array<[string, unknown[]]> = [];
  select() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push([key, value]);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.inFilters.push([key, values as unknown[]]);
    return this;
  }
  or() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  insert(row: Record<string, unknown> | Array<Record<string, unknown>>) {
    const rows = Array.isArray(row) ? row : [row];
    for (const item of rows) {
      const saved = { id: item.id || `tr-${this.store[this.table].length + 1}`, ...item };
      this.store[this.table] = this.store[this.table] || [];
      this.store[this.table].push(saved);
      this.lastInserted = saved;
    }
    return this;
  }
  update(patch: Record<string, unknown>) {
    const rows = this.rows();
    for (const row of rows) Object.assign(row, patch);
    return this;
  }
  delete(): never {
    throw new Error('delete forbidden');
  }
  private rows() {
    let rows = this.store[this.table] || [];
    for (const [key, value] of this.filters) {
      rows = rows.filter((row) => String(row[key] ?? '') === String(value ?? ''));
    }
    for (const [key, values] of this.inFilters) {
      const set = new Set(values.map((v) => String(v)));
      rows = rows.filter((row) => set.has(String(row[key] ?? '')));
    }
    return rows;
  }
  maybeSingle() {
    if (this.lastInserted && this.filters.length === 0) {
      return Promise.resolve({ data: this.lastInserted, error: null });
    }
    return Promise.resolve({ data: this.rows()[0] || null, error: null });
  }
  then(
    resolve?: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) {
    return Promise.resolve({ data: this.rows(), error: null }).then(resolve as never, reject);
  }
}

function baseStore(): Store {
  return {
    users: [{ id: 'user-1', role: 'ADMIN', tenant_id: 'co-1' }],
    sales: [
      {
        id: 'sale-1',
        status: 'ACTIVE',
        customer_id: 'cust-a',
        contract_id: 'ct-1',
        block_id: 'block-1',
        project_id: 'proj-1',
        company_id: 'co-1',
        tenant_id: 'co-1',
        agreed_price: 25,
      },
    ],
    blocks: [
      {
        id: 'block-1',
        status: 'Vendido',
        sale_id: 'sale-1',
        contract_id: 'ct-1',
        project_id: 'proj-1',
        company_id: 'co-1',
        block_name: '01',
        number: '02',
        price: 25,
        customer_id: 'cust-a',
      },
    ],
    customers: [
      {
        id: 'cust-a',
        name: 'Titular A',
        cpf_cnpj: '11144477735',
        tenant_id: 'co-1',
        company_id: 'co-1',
      },
      {
        id: 'cust-b',
        name: 'Titular B',
        cpf_cnpj: '39053344705',
        phone: '63922222222',
        email: 'b@example.com',
        tenant_id: 'co-1',
        company_id: 'co-1',
      },
      {
        id: 'cust-c',
        name: 'Titular C',
        cpf_cnpj: '39053344705',
        tenant_id: 'co-1',
        company_id: 'co-1',
      },
      {
        id: 'cust-x',
        name: 'Outro',
        cpf_cnpj: '39053344705',
        tenant_id: 'co-2',
        company_id: 'co-2',
      },
    ],
    projects: [{ id: 'proj-1', name: 'Loteamento Homolog' }],
    contracts: [
      {
        id: 'ct-1',
        sale_id: 'sale-1',
        contract_number: '000000016/2026',
        status: 'ativo',
        is_current: true,
        created_at: '2026-07-01',
      },
    ],
    finance_receipts: [
      {
        id: 'r-paid',
        sale_id: 'sale-1',
        status: 'pago',
        amount: 11.67,
        paid_at: '2026-08-01',
        due_date: '2026-08-01',
        installment_number: 1,
        customer_id: 'cust-a',
      },
      {
        id: 'r-future',
        sale_id: 'sale-1',
        status: 'pendente',
        amount: 13.33,
        due_date: '2026-12-10',
        installment_number: 2,
        customer_id: 'cust-a',
      },
    ],
    sale_title_transfers: [],
    company_asaas_charges: [],
    bank_charges: [],
    bank_integrations: [],
  };
}

function adminFrom(store: Store, rpcImpl?: (name: string, args: unknown) => unknown) {
  return {
    from(table: string) {
      return new Query(store, table);
    },
    rpc(name: string, args: unknown) {
      if (rpcImpl) return rpcImpl(name, args);
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

function localResult(store: Store, transferId: string) {
  return {
    mutation: true as const,
    execute: true as const,
    persistTransfer: true as const,
    generateCharges: false as const,
    reused: false,
    status: 'EXECUTED' as const,
    transferId,
    saleId: 'sale-1',
    blockId: 'block-1',
    fromCustomerId: 'cust-a',
    toCustomerId: 'cust-b',
    fromContractId: 'ct-1',
    toContractId: 'ct-2',
    toContractNumber: '000000017/2026',
    previousTransferId: null,
    saleIdUnchanged: true as const,
    blockIdUnchanged: true as const,
    lotStillSold: true as const,
    receiptsPreserved: true as const,
  };
}

async function testExecuteABNoExternalCharges() {
  ensureExternalChargeProvidersRegistered();
  const store = baseStore();
  const beforeReceipts = JSON.stringify(store.finance_receipts);
  let localCalled = 0;
  setTitleTransferLocalExecuteForTests(async (_admin, input) => {
    localCalled += 1;
    assert(input.saleId === 'sale-1', 'mesma sale');
    assert(JSON.stringify(store.finance_receipts) === beforeReceipts, 'parcelas intactas no Node');
    return localResult(store, input.transferId || 'tr-1');
  });
  const result = await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    toCustomerId: 'cust-b',
    expectedContractId: 'ct-1',
    expectedBlockId: 'block-1',
    confirmTransfer: true,
    declaredAgioAmount: 1500,
    todayIso: '2026-09-07',
  } as never);
  assert(result.generateCharges === false, 'não gera cobrança');
  assert(result.remoteApiCalled === false, 'sem HTTP bancário');
  assert(result.local?.saleIdUnchanged === true, 'sale_id');
  assert(result.local?.blockIdUnchanged === true, 'block_id');
  assert(result.local?.lotStillSold === true, 'lote vendido');
  assert(result.local?.receiptsPreserved === true, 'parcelas preservadas');
  assert(localCalled === 1, 'executou local uma vez');
  assert(store.sale_title_transfers[0]?.status === 'CALCULATED' || store.sale_title_transfers[0]?.charges_phase === 'COMPLETED', 'preparou elo');
  assert(store.sale_title_transfers[0]?.previous_transfer_id == null, 'primeira cessão');
  setTitleTransferLocalExecuteForTests(null);
  console.log('OK testExecuteABNoExternalCharges');
}

async function testCancelOpenThenLocalAndFailureBlocks() {
  ensureExternalChargeProvidersRegistered();
  const store = baseStore();
  store.company_asaas_charges = [
    {
      id: 'ch-paid',
      company_id: 'co-1',
      sale_id: 'sale-1',
      installment_id: 'r-paid',
      status: 'RECEIVED',
      asaas_payment_id: 'pay_paid',
    },
    {
      id: 'ch-open',
      company_id: 'co-1',
      sale_id: 'sale-1',
      installment_id: 'r-future',
      status: 'PENDING',
      asaas_payment_id: 'pay_open',
    },
  ];
  setTitleTransferChargesLiveScopeEnvForTests({
    NEXT_PUBLIC_SUPABASE_URL: 'https://hoynysmynxncdlptuzub.supabase.co',
  });
  const canceled: string[] = [];
  setExternalChargeMutationFnsForTests({
    cancelAsaasCharge: async (_admin, _company, chargeId) => {
      canceled.push(chargeId);
      return { ok: true, reused: false, chargeId, status: 'CANCELLED' };
    },
  });
  let localCalled = 0;
  setTitleTransferLocalExecuteForTests(async (_admin, input) => {
    localCalled += 1;
    assert(canceled.includes('ch-open'), 'cancelou aberta antes da mutação');
    assert(!canceled.includes('ch-paid'), 'não cancelou paga');
    return localResult(store, input.transferId || 'tr-1');
  });
  const ok = await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    toCustomerId: 'cust-b',
    expectedContractId: 'ct-1',
    expectedBlockId: 'block-1',
    confirmTransfer: true,
  });
  assert(ok.canceledChargeIds.includes('ch-open'), 'aberta cancelada');
  assert(ok.preservedPaidChargeIds.includes('ch-paid'), 'paga preservada');
  assert(localCalled === 1, 'local depois do cancel');

  const store2 = baseStore();
  store2.company_asaas_charges = [
    {
      id: 'ch-open',
      company_id: 'co-1',
      sale_id: 'sale-1',
      installment_id: 'r-future',
      status: 'PENDING',
      asaas_payment_id: 'pay_open',
    },
  ];
  setExternalChargeMutationFnsForTests({
    cancelAsaasCharge: async () => {
      throw new Error('asaas down');
    },
  });
  let local2 = 0;
  setTitleTransferLocalExecuteForTests(async () => {
    local2 += 1;
    return localResult(store2, 'x');
  });
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(store2) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-b',
      expectedContractId: 'ct-1',
      expectedBlockId: 'block-1',
      confirmTransfer: true,
    });
    throw new Error('deveria falhar cancelamento');
  } catch (err) {
    const tt = asTtError(err);
    assert(tt.code === TITLE_TRANSFER_CHARGES_CANCEL_FAILED, 'cancel failed');
    assert(local2 === 0, 'não executou mutação local');
  }

  setExternalChargeMutationFnsForTests({});
  setTitleTransferLocalExecuteForTests(null);
  setTitleTransferChargesLiveScopeEnvForTests(null);
  console.log('OK testCancelOpenThenLocalAndFailureBlocks');
}

async function testC6BlockedAndLiveOff() {
  ensureExternalChargeProvidersRegistered();
  const store = baseStore();
  store.bank_charges = [
    {
      id: 'c6-1',
      company_id: 'co-1',
      sale_id: 'sale-1',
      finance_receipt_id: 'r-future',
      status: 'PENDING',
      provider: 'C6',
      external_id: 'c6-ext',
    },
  ];
  let local = 0;
  setTitleTransferLocalExecuteForTests(async () => {
    local += 1;
    return localResult(store, 'x');
  });
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-b',
      expectedContractId: 'ct-1',
      expectedBlockId: 'block-1',
      confirmTransfer: true,
    });
    throw new Error('C6 deveria bloquear');
  } catch (err) {
    const tt = asTtError(err);
    assert(tt.code === TITLE_TRANSFER_CHARGES_NON_CANCELABLE, 'C6 BLOCKED');
    assert(local === 0, 'sem mutação');
  }

  const store3 = baseStore();
  store3.company_asaas_charges = [
    {
      id: 'ch-open',
      company_id: 'co-1',
      sale_id: 'sale-1',
      installment_id: 'r-future',
      status: 'PENDING',
      asaas_payment_id: 'pay_open',
    },
  ];
  setTitleTransferChargesLiveScopeEnvForTests({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    [TITLE_TRANSFER_EXTERNAL_CHARGES_LIVE_ENV]: '',
  });
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(store3) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-b',
      expectedContractId: 'ct-1',
      expectedBlockId: 'block-1',
      confirmTransfer: true,
    });
    throw new Error('LIVE off deveria bloquear');
  } catch (err) {
    const tt = asTtError(err);
    assert(tt.code === TITLE_TRANSFER_CHARGES_LIVE_DISABLED, 'LIVE disabled');
  }
  setTitleTransferLocalExecuteForTests(null);
  setTitleTransferChargesLiveScopeEnvForTests(null);
  console.log('OK testC6BlockedAndLiveOff');
}

async function testProductionAsaasOnInterBlockedWithoutPost() {
  ensureExternalChargeProvidersRegistered();
  const prodUrl = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
  setTitleTransferChargesLiveScopeEnvForTests({
    NEXT_PUBLIC_SUPABASE_URL: prodUrl,
    VERCEL_ENV: 'production',
  });

  const asaasStore = baseStore();
  asaasStore.company_asaas_charges = [
    {
      id: 'ch-open',
      company_id: 'co-1',
      sale_id: 'sale-1',
      installment_id: 'r-future',
      status: 'PENDING',
      asaas_payment_id: 'pay_open',
    },
  ];
  const asaasCanceled: string[] = [];
  setExternalChargeMutationFnsForTests({
    cancelAsaasCharge: async (_admin, _company, chargeId) => {
      asaasCanceled.push(chargeId);
      return { ok: true, reused: false, remoteConfirmed: true, chargeId, status: 'CANCELLED' };
    },
    cancelInterCharge: async () => {
      throw new Error('não deve POST Inter em Production');
    },
  });
  let asaasLocal = 0;
  setTitleTransferLocalExecuteForTests(async (_admin, input) => {
    asaasLocal += 1;
    return localResult(asaasStore, input.transferId || 'tr-asaas');
  });
  const asaasOk = await executeSaleTitleTransferWithExternalCharges(adminFrom(asaasStore) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    toCustomerId: 'cust-b',
    expectedContractId: 'ct-1',
    expectedBlockId: 'block-1',
    confirmTransfer: true,
  });
  assert(asaasCanceled.includes('ch-open'), 'Production cancela Asaas');
  assert(asaasLocal === 1, 'RPC depois do Asaas confirmado');
  assert(asaasOk.canceledChargeIds.includes('ch-open'), 'Asaas na lista cancelada');

  const interStore = baseStore();
  interStore.bank_charges = [
    {
      id: 'i-open',
      company_id: 'co-1',
      sale_id: 'sale-1',
      finance_receipt_id: 'r-future',
      status: 'PENDING',
      provider: 'INTER',
      external_id: 'inter-open',
    },
  ];
  const interPosted: string[] = [];
  setExternalChargeMutationFnsForTests({
    cancelInterCharge: async (_admin, _company, chargeId) => {
      interPosted.push(chargeId);
      return { ok: true, reused: false, remoteConfirmed: true, chargeId, status: 'CANCELLED' };
    },
    cancelAsaasCharge: async () => {
      throw new Error('não deve cancelar Asaas neste caso');
    },
  });
  let interLocal = 0;
  setTitleTransferLocalExecuteForTests(async () => {
    interLocal += 1;
    return localResult(interStore, 'x');
  });
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(interStore) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-b',
      expectedContractId: 'ct-1',
      expectedBlockId: 'block-1',
      confirmTransfer: true,
    });
    throw new Error('Inter Production deveria bloquear');
  } catch (err) {
    const tt = asTtError(err);
    assert(tt.code === TITLE_TRANSFER_INTER_REMOTE_CANCEL_PENDING, 'Inter BLOCKED');
    assert(tt.message === TITLE_TRANSFER_INTER_REMOTE_CANCEL_PENDING_MESSAGE, 'mensagem Inter');
    assert(interPosted.length === 0, 'sem POST Inter');
    assert(interLocal === 0, 'sem RPC');
  }

  const mixed = baseStore();
  mixed.company_asaas_charges = [
    {
      id: 'ch-open',
      company_id: 'co-1',
      sale_id: 'sale-1',
      installment_id: 'r-future',
      status: 'PENDING',
      asaas_payment_id: 'pay_open',
    },
  ];
  mixed.bank_charges = [
    {
      id: 'i-open',
      company_id: 'co-1',
      sale_id: 'sale-1',
      finance_receipt_id: 'r-paid',
      status: 'PENDING',
      provider: 'INTER',
      external_id: 'inter-orphan',
    },
  ];
  const mixedAsaas: string[] = [];
  const mixedInter: string[] = [];
  setExternalChargeMutationFnsForTests({
    cancelAsaasCharge: async (_admin, _company, chargeId) => {
      mixedAsaas.push(chargeId);
      return { ok: true, reused: false, remoteConfirmed: true, chargeId, status: 'CANCELLED' };
    },
    cancelInterCharge: async (_admin, _company, chargeId) => {
      mixedInter.push(chargeId);
      return { ok: true, reused: false, remoteConfirmed: true, chargeId, status: 'CANCELLED' };
    },
  });
  let mixedLocal = 0;
  setTitleTransferLocalExecuteForTests(async () => {
    mixedLocal += 1;
    return localResult(mixed, 'x');
  });
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(mixed) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-b',
      expectedContractId: 'ct-1',
      expectedBlockId: 'block-1',
      confirmTransfer: true,
    });
    throw new Error('Asaas+Inter deveria bloquear antes do Asaas');
  } catch (err) {
    const tt = asTtError(err);
    assert(tt.code === TITLE_TRANSFER_INTER_REMOTE_CANCEL_PENDING, 'mix BLOCKED');
    assert(mixedAsaas.length === 0, 'não cancela Asaas no mix');
    assert(mixedInter.length === 0, 'sem POST Inter no mix');
    assert(mixedLocal === 0, 'sem RPC no mix');
  }

  setExternalChargeMutationFnsForTests({});
  setTitleTransferLocalExecuteForTests(null);
  setTitleTransferChargesLiveScopeEnvForTests(null);
  console.log('OK testProductionAsaasOnInterBlockedWithoutPost');
}

async function testGuardsAACrossTenantAndConfirm() {
  const store = baseStore();
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-a',
      expectedContractId: 'ct-1',
      expectedBlockId: 'block-1',
      confirmTransfer: true,
    });
    throw new Error('A→A');
  } catch (err) {
    const tt = asTtError(err);
    assert(tt.code === TITLE_TRANSFER_SAME_TITULAR, 'A→A');
  }
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-x',
      expectedContractId: 'ct-1',
      expectedBlockId: 'block-1',
      confirmTransfer: true,
    });
    throw new Error('CROSS_TENANT cliente');
  } catch (err) {
    const tt = asTtError(err);
    assert(
      tt.code === 'TITLE_TRANSFER_CUSTOMER_CROSS_TENANT' || tt.code === TITLE_TRANSFER_CROSS_TENANT,
      'CROSS_TENANT',
    );
  }
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-b',
      confirmTransfer: false,
    });
    throw new Error('sem checkbox');
  } catch (err) {
    const tt = asTtError(err);
    assert(tt.code === 'TITLE_TRANSFER_CONFIRM_REQUIRED', 'checkbox');
  }
  store.users = [{ id: 'user-1', role: 'ADMIN', tenant_id: 'co-2' }];
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-b',
      expectedContractId: 'ct-1',
      confirmTransfer: true,
    });
    throw new Error('caller CROSS_TENANT');
  } catch (err) {
    const tt = asTtError(err);
    assert(tt.code === TITLE_TRANSFER_CROSS_TENANT, 'CROSS_TENANT caller');
  }
  console.log('OK testGuardsAACrossTenantAndConfirm');
}

async function testChainPreviousTransferId() {
  const store = baseStore();
  store.sales[0].customer_id = 'cust-b';
  store.blocks[0].customer_id = 'cust-b';
  store.contracts = [
    {
      id: 'ct-2',
      sale_id: 'sale-1',
      contract_number: '000000017/2026',
      status: 'ativo',
      is_current: true,
      created_at: '2026-08-01',
    },
  ];
  store.sale_title_transfers = [
    {
      id: 't1',
      sale_id: 'sale-1',
      block_id: 'block-1',
      status: 'EXECUTED',
      from_customer_id: 'cust-a',
      to_customer_id: 'cust-b',
      from_contract_id: 'ct-1',
      to_contract_id: 'ct-2',
      previous_transfer_id: null,
      executed_at: '2026-08-01T10:00:00Z',
    },
  ];
  setTitleTransferLocalExecuteForTests(async (_admin, input) => ({
    ...localResult(store, input.transferId || 't2'),
    fromCustomerId: 'cust-b',
    toCustomerId: 'cust-c',
    previousTransferId: 't1',
  }));
  await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    toCustomerId: 'cust-c',
    expectedContractId: 'ct-2',
    expectedBlockId: 'block-1',
    confirmTransfer: true,
  });
  const prepared = store.sale_title_transfers.find((row) => row.status === 'CALCULATED');
  assert(prepared?.previous_transfer_id === 't1', 'B→C usa previous_transfer_id');
  setTitleTransferLocalExecuteForTests(null);
  console.log('OK testChainPreviousTransferId');
}

async function testInterEquivalentAndRetry() {
  ensureExternalChargeProvidersRegistered();
  const store = baseStore();
  store.bank_charges = [
    {
      id: 'i-paid',
      company_id: 'co-1',
      sale_id: 'sale-1',
      finance_receipt_id: 'r-paid',
      status: 'PAID',
      provider: 'INTER',
      external_id: 'inter-paid',
    },
    {
      id: 'i-open',
      company_id: 'co-1',
      sale_id: 'sale-1',
      finance_receipt_id: 'r-future',
      status: 'PENDING',
      provider: 'INTER',
      external_id: 'inter-open',
    },
  ];
  setTitleTransferChargesLiveScopeEnvForTests({
    NEXT_PUBLIC_SUPABASE_URL: 'https://hoynysmynxncdlptuzub.supabase.co',
  });
  const canceled: string[] = [];
  setExternalChargeMutationFnsForTests({
    cancelInterCharge: async (_admin, _company, chargeId) => {
      canceled.push(chargeId);
      return { ok: true, reused: false, chargeId, status: 'CANCELLED' };
    },
    generateInterCharges: async () => {
      throw new Error('não deve gerar Inter');
    },
    generateAsaasCharges: async () => {
      throw new Error('não deve gerar Asaas');
    },
  });
  let localCalled = 0;
  setTitleTransferLocalExecuteForTests(async (_admin, input) => {
    localCalled += 1;
    assert(canceled.includes('i-open'), 'Inter aberta cancelada antes da mutação');
    assert(!canceled.includes('i-paid'), 'Inter PAID preservada');
    const row = store.sale_title_transfers.find((item) => String(item.id) === String(input.transferId));
    if (row) {
      row.status = 'EXECUTED';
      row.charges_phase = 'COMPLETED';
      row.to_contract_id = 'ct-2';
    }
    return localResult(store, input.transferId || 'tr-1');
  });
  const first = await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    toCustomerId: 'cust-b',
    expectedContractId: 'ct-1',
    expectedFromCustomerId: 'cust-a',
    expectedBlockId: 'block-1',
    confirmTransfer: true,
  });
  assert(first.canceledChargeIds.includes('i-open'), 'cancelou Inter aberta');
  assert(first.preservedPaidChargeIds.includes('i-paid'), 'preservou Inter paga');
  assert(first.generateCharges === false, 'sem geração');
  assert(localCalled === 1, 'local uma vez');

  const retry = await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    toCustomerId: 'cust-b',
    expectedContractId: 'ct-1',
    expectedFromCustomerId: 'cust-a',
    expectedBlockId: 'block-1',
    confirmTransfer: true,
  });
  assert(retry.local?.reused === true, 'retry reusa EXECUTED');
  assert(canceled.length === 1, 'retry não cancela de novo');
  assert(localCalled === 1, 'retry não chama mutação local de novo');
  assert(store.sale_title_transfers.filter((row) => row.status === 'CALCULATED').length === 0, 'sem segundo elo CALCULATED');
  assert(store.sale_title_transfers.length === 1, 'um único elo');

  setExternalChargeMutationFnsForTests({});
  setTitleTransferLocalExecuteForTests(null);
  setTitleTransferChargesLiveScopeEnvForTests(null);
  console.log('OK testInterEquivalentAndRetry');
}

async function testLocalCancelledStillRequiresRemoteConfirm() {
  ensureExternalChargeProvidersRegistered();
  const store = baseStore();
  store.bank_charges = [
    {
      id: 'i-stale',
      company_id: 'co-1',
      sale_id: 'sale-1',
      finance_receipt_id: 'r-future',
      status: 'CANCELLED',
      provider: 'INTER',
      external_id: 'inter-stale',
    },
  ];
  setTitleTransferChargesLiveScopeEnvForTests({
    NEXT_PUBLIC_SUPABASE_URL: 'https://hoynysmynxncdlptuzub.supabase.co',
  });
  const canceled: string[] = [];
  setExternalChargeMutationFnsForTests({
    cancelInterCharge: async (_admin, _company, chargeId) => {
      canceled.push(chargeId);
      return {
        ok: true as const,
        reused: true,
        remoteConfirmed: false,
        chargeId,
        status: 'CANCELLED',
      };
    },
  });
  let localCalled = 0;
  setTitleTransferLocalExecuteForTests(async () => {
    localCalled += 1;
    return localResult(store, 'x');
  });
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-b',
      expectedContractId: 'ct-1',
      expectedBlockId: 'block-1',
      confirmTransfer: true,
    });
    throw new Error('CANCELLED local sem confirmação remota deveria falhar');
  } catch (err) {
    const tt = asTtError(err);
    assert(tt.code === TITLE_TRANSFER_CHARGES_CANCEL_FAILED, 'cancel failed');
    assert(canceled.includes('i-stale'), 'ainda chama o provider');
    assert(localCalled === 0, 'não executou RPC local');
  }

  canceled.length = 0;
  setExternalChargeMutationFnsForTests({
    cancelInterCharge: async (_admin, _company, chargeId) => {
      canceled.push(chargeId);
      return {
        ok: true as const,
        reused: false,
        remoteConfirmed: true,
        chargeId,
        status: 'CANCELLED',
      };
    },
  });
  const ok = await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    toCustomerId: 'cust-b',
    expectedContractId: 'ct-1',
    expectedBlockId: 'block-1',
    confirmTransfer: true,
  });
  assert(canceled.includes('i-stale'), 'reconfirma Inter stale');
  assert(ok.canceledChargeIds.includes('i-stale'), 'stale entra na lista');
  assert(ok.generateCharges === false, 'sem boleto novo');

  setExternalChargeMutationFnsForTests({});
  setTitleTransferLocalExecuteForTests(null);
  setTitleTransferChargesLiveScopeEnvForTests(null);
  console.log('OK testLocalCancelledStillRequiresRemoteConfirm');
}

async function testPreviewFingerprintGuards() {
  const titularStore = baseStore();
  titularStore.sales[0].customer_id = 'cust-c';
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(titularStore) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-b',
      expectedContractId: 'ct-1',
      expectedFromCustomerId: 'cust-a',
      expectedBlockId: 'block-1',
      confirmTransfer: true,
    });
    throw new Error('titular alterado deveria bloquear');
  } catch (err) {
    const tt = asTtError(err);
    assert(tt.code === TITLE_TRANSFER_TITULAR_CHANGED, 'titular changed');
  }

  const contractStore = baseStore();
  contractStore.contracts = [
    {
      id: 'ct-new',
      sale_id: 'sale-1',
      contract_number: '000000099/2026',
      status: 'ativo',
      is_current: true,
      created_at: '2026-09-01',
    },
  ];
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(contractStore) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-b',
      expectedContractId: 'ct-1',
      expectedFromCustomerId: 'cust-a',
      expectedBlockId: 'block-1',
      confirmTransfer: true,
    });
    throw new Error('contrato alterado deveria bloquear');
  } catch (err) {
    const tt = asTtError(err);
    assert(tt.code === TITLE_TRANSFER_CONTRACT_CHANGED, 'contract changed');
  }
  console.log('OK testPreviewFingerprintGuards');
}

function testSourceArchitecture() {
  const sql = read('supabase/migrations/20261017120200_fix_execute_sale_title_transfer_receipts.sql');
  assert(sql.includes('CREATE OR REPLACE FUNCTION public.execute_sale_title_transfer'), 'RPC');
  assert(!sql.includes('public.execute_sale_lot_swap'), 'não reusa RPC da troca');
  assert(/UPDATE public\.finance_receipts[\s\S]*status = 'cancelado'/.test(sql), 'cancela futuras antigas');
  assert(
    !/UPDATE public\.finance_receipts\s+SET customer_id = v_to_expected/.test(sql),
    'não reatribui pagas ao novo titular',
  );
  assert(sql.includes("p_payload->'new_receipts'"), 'cria parcelas de B');
  assert(sql.includes("p_payload->'cancel_receipt_ids'"), 'cancela por id');
  assert(sql.includes("status = 'superseded'"), 'supersede contrato A');
  assert(sql.includes('v_new_contract_id := gen_random_uuid()'), 'contrato B id novo');
  assert(sql.includes('lote precisa permanecer Vendido'), 'lote vendido');
  assert(sql.includes('CONTRACT_CHANGED'), 'fingerprint contrato na RPC');
  assert(!/\bDROP TABLE\b/i.test(sql), 'sem DROP');
  const p1 = read('supabase/migrations/20261016120000_sale_title_transfers.sql');
  assert(p1.includes('CREATE TABLE IF NOT EXISTS public.sale_title_transfers'), 'P1 intacta');
  const orch = read('lib/finance/saleTitleTransferChargesExecuteService.ts');
  assert(orch.includes('getExternalChargeProvider'), 'registry');
  assert(orch.includes('reduceTitleTransferExternalCharges'), 'execução reduz cobrança vigente');
  assert(!orch.includes("provider === 'ASAAS'"), 'sem if ASAAS');
  assert(!orch.includes("provider === 'INTER'"), 'sem if INTER');
  assert(!orch.includes('generateMissingCharges'), 'sem gerar');
  assert(!orch.includes('createCompanyInstallmentCharge'), 'sem create Asaas');
  assert(!orch.includes('LOT_SWAP_EXTERNAL_CHARGES_LIVE'), 'LIVE isolado');
  assert(!orch.includes('/api/lots/'), 'sem release');
  assert(!orch.includes('seller_parties_json'), 'sem Mundo Novo');
  assert(orch.includes('titleTransferHasProductionInterRemoteCancelPending'), 'gate Inter Production');
  assert(orch.includes('assertExternalChargeCancelConfirmed'), 'exige confirmação remota');
  const panel = read('components/map/TitleTransferPreviewPanel.tsx');
  assert(panel.includes('orphanResolveEnabled'), 'órfãs só fora de Production');
  assert(panel.includes('TITLE_TRANSFER_EXECUTE_CONFIRM_TEXT'), 'checkbox constante');
  assert(panel.includes('Transferência de titularidade concluída'), 'UX sucesso');
  const executeLib = read('lib/finance/saleTitleTransferExecute.ts');
  assert(executeLib.includes(TITLE_TRANSFER_EXECUTE_CONFIRM_TEXT), 'texto do checkbox');
  const cancelInter = read('lib/banking/inter/interSaleChargeService.ts');
  assert(cancelInter.includes('pollInterCobrancaUntilCancelSettled'), 'polling GET após 202');
  assert(cancelInter.includes('InterRemoteCancelError'), 'erro operacional Inter');
  assert(cancelInter.includes('classifyRemoteInterSituacaoForRelease'), 'classifica situacao real');
  console.log('OK testSourceArchitecture');
}

function assertUuidCoalesceSafe(sql: string, label: string) {
  assert(!/coalesce\s*\(\s*v_sale\.company_id\s*,\s*v_sale\.tenant_id\s*\)/i.test(sql), `${label} sale coalesce`);
  assert(
    !/COALESCE\s*\(\s*v_to_customer\.company_id\s*,\s*v_to_customer\.tenant_id\s*\)/i.test(sql),
    `${label} customer coalesce`,
  );
  assert(
    !/COALESCE\s*\(\s*v_old_contract_company\s*,\s*v_old_contract_tenant\s*\)/i.test(sql),
    `${label} contract coalesce`,
  );
  assert(sql.includes("NULLIF(btrim(v_sale.tenant_id::text), '')::uuid"), `${label} sale cast`);
  assert(sql.includes("NULLIF(btrim(v_to_customer.tenant_id::text), '')::uuid"), `${label} customer cast`);
  assert(sql.includes("NULLIF(btrim(v_old_contract_tenant), '')::uuid"), `${label} contract cast`);
  assert(sql.includes("NULLIF(p_payload->>'transfer_id', '')::uuid"), `${label} payload transfer_id`);
  assert(sql.includes("NULLIF(p_payload->>'expected_from_customer_id', '')::uuid"), `${label} payload from`);
  assert(sql.includes("NULLIF(p_payload->>'expected_to_customer_id', '')::uuid"), `${label} payload to`);
  assert(sql.includes("NULLIF(p_payload->>'expected_contract_id', '')::uuid"), `${label} payload contract`);
  assert(sql.includes("NULLIF(p_payload->>'expected_block_id', '')::uuid"), `${label} payload block`);
  assert(sql.includes("NULLIF(btrim(x), '')::uuid"), `${label} receipt ids vazios`);
  assert(sql.includes('previous_transfer_id'), `${label} previous_transfer_id`);
  assert(!/\bALTER TABLE\b/i.test(sql), `${label} sem ALTER TABLE`);
  assert(!/\bDROP TABLE\b/i.test(sql), `${label} sem DROP`);
}

function testRpcUuidCoalesceFix() {
  const original = read('supabase/migrations/20261017120000_execute_sale_title_transfer.sql');
  const fix = read(
    'supabase/migrations/20261017120100_fix_execute_sale_title_transfer_uuid_coalesce.sql',
  );
  const receipts = read(
    'supabase/migrations/20261017120200_fix_execute_sale_title_transfer_receipts.sql',
  );
  assertUuidCoalesceSafe(original, '17120000');
  assertUuidCoalesceSafe(fix, '17120100');
  assertUuidCoalesceSafe(receipts, '17120200');
  assert(fix.includes('CREATE OR REPLACE FUNCTION public.execute_sale_title_transfer'), 'fix OR REPLACE');
  assert(receipts.includes('CREATE OR REPLACE FUNCTION public.execute_sale_title_transfer'), 'receipts OR REPLACE');
  assert(!fix.includes("provider === 'ASAAS'"), 'fix sem Asaas');
  assert(!receipts.includes('execute_sale_lot_swap'), 'receipts sem RPC da troca');
  assert(!receipts.includes('/release'), 'receipts sem release');
  console.log('OK testRpcUuidCoalesceFix');
}

async function testFourInterChargesOneFailureBlocks() {
  ensureExternalChargeProvidersRegistered();
  const store = baseStore();
  store.finance_receipts = [
    store.finance_receipts[0],
    ...[1, 2, 3, 4].map((n) => ({
      id: `r-f${n}`,
      sale_id: 'sale-1',
      status: 'pendente',
      amount: 10,
      due_date: `2026-0${n + 8}-08`,
      installment_number: n,
      customer_id: 'cust-a',
    })),
  ];
  store.bank_charges = [1, 2, 3, 4].map((n) => ({
    id: `i-open-${n}`,
    company_id: 'co-1',
    sale_id: 'sale-1',
    finance_receipt_id: `r-f${n}`,
    status: 'REGISTERED',
    provider: 'INTER',
    external_id: `sol-${n}`,
  }));
  setTitleTransferChargesLiveScopeEnvForTests({
    NEXT_PUBLIC_SUPABASE_URL: 'https://hoynysmynxncdlptuzub.supabase.co',
  });
  const canceled: string[] = [];
  setExternalChargeMutationFnsForTests({
    cancelInterCharge: async (_admin, _company, chargeId) => {
      if (chargeId === 'i-open-2') {
        throw new Error('POST aceito, porém consulta permaneceu A_RECEBER.');
      }
      canceled.push(chargeId);
      return { ok: true as const, reused: false, remoteConfirmed: true, chargeId, status: 'CANCELLED' };
    },
  });
  let localCalled = 0;
  setTitleTransferLocalExecuteForTests(async () => {
    localCalled += 1;
    return localResult(store, 'x');
  });
  try {
    await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-b',
      expectedContractId: 'ct-1',
      expectedBlockId: 'block-1',
      confirmTransfer: true,
    });
    throw new Error('uma falha entre quatro deveria bloquear');
  } catch (err) {
    const tt = asTtError(err);
    assert(tt.code === TITLE_TRANSFER_CHARGES_CANCEL_FAILED, 'cancel failed');
    assert(/Parcela \d\/4/.test(tt.message), `erro operacional parcela N/4: ${tt.message}`);
    assert(/A transferência local não foi executada/.test(tt.message), 'fail-closed na mensagem');
  }
  assert(!canceled.includes('i-open-3') || canceled.length < 4, 'não conclui as quatro após falha');
  assert(localCalled === 0, 'nenhuma transferência local');

  canceled.length = 0;
  setExternalChargeMutationFnsForTests({
    cancelInterCharge: async (_admin, _company, chargeId) => {
      canceled.push(chargeId);
      return { ok: true as const, reused: false, remoteConfirmed: true, chargeId, status: 'CANCELLED' };
    },
  });
  const ok = await executeSaleTitleTransferWithExternalCharges(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    toCustomerId: 'cust-b',
    expectedContractId: 'ct-1',
    expectedBlockId: 'block-1',
    confirmTransfer: true,
  });
  assert(ok.canceledChargeIds.length === 4, 'retry seguro: as quatro confirmadas antes da RPC');
  assert(localCalled === 1, 'RPC só depois das quatro');

  setExternalChargeMutationFnsForTests({});
  setTitleTransferLocalExecuteForTests(null);
  setTitleTransferChargesLiveScopeEnvForTests(null);
  console.log('OK testFourInterChargesOneFailureBlocks');
}

async function main() {
  testContractHtmlContinuity();
  testOfficialChargesMissingAfterCancel();
  testLiveScopeAndRpcParser();
  await testExecuteABNoExternalCharges();
  await testCancelOpenThenLocalAndFailureBlocks();
  await testC6BlockedAndLiveOff();
  await testProductionAsaasOnInterBlockedWithoutPost();
  await testGuardsAACrossTenantAndConfirm();
  await testChainPreviousTransferId();
  await testInterEquivalentAndRetry();
  await testLocalCancelledStillRequiresRemoteConfirm();
  await testFourInterChargesOneFailureBlocks();
  await testPreviewFingerprintGuards();
  testSourceArchitecture();
  testRpcUuidCoalesceFix();
  console.log('OK mandatory-sale-title-transfer-phase4-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
