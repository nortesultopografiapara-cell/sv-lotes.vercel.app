/**
 * P2 — preview somente leitura da Transferência de titularidade.
 * npx tsx scripts/mandatory-sale-title-transfer-phase2-tests.ts
 */
import fs from 'node:fs';
import path from 'path';
import { isCanceledFinanceReceipt } from '../lib/finance/saleChargesShared';
import { ensureExternalChargeProvidersRegistered } from '../lib/finance/externalCharges';
import {
  assertTitleTransferCallerOwnsCompany,
  assertTitleTransferLotUnchanged,
  buildTitleTransferHistoryChain,
  summarizeTitleTransferFinance,
  titleTransferHistoryNotice,
  TITLE_TRANSFER_CROSS_TENANT,
  TITLE_TRANSFER_LOT_NOT_SOLD,
  TITLE_TRANSFER_ORIGINAL_HOLDER_NOTICE,
  TITLE_TRANSFER_PREVIEW_NOTICE,
} from '../lib/finance/saleTitleTransferPreview';
import {
  loadSaleTitleTransferPreview,
  TitleTransferPreviewError,
} from '../lib/finance/saleTitleTransferPreviewService';
import {
  reduceTitleTransferExternalCharges,
  TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES,
  TITLE_TRANSFER_ORPHAN_OPEN_CHARGES,
} from '../lib/finance/saleTitleTransferExternalCharges';
import type { ExternalChargeRecord } from '../lib/finance/externalCharges/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function charge(partial: Partial<ExternalChargeRecord> & { chargeId: string }): ExternalChargeRecord {
  return {
    provider: 'INTER',
    companyId: 'co-1',
    saleId: 'sale-1',
    receiptId: null,
    status: 'REGISTERED',
    externalId: partial.chargeId,
    classification: 'cancelable',
    ...partial,
  };
}

function testReduceTitleTransferCharges() {
  const receipts = [
    { id: 'r-paid', status: 'pago' },
    { id: 'r-1', status: 'pendente' },
    { id: 'r-2', status: 'pendente' },
    { id: 'r-old', status: 'cancelado' },
  ];
  const lt22 = reduceTitleTransferExternalCharges({
    receipts,
    charges: [
      charge({
        chargeId: 'orphan-oct',
        receiptId: null,
        classification: 'cancelable',
      }),
      charge({
        chargeId: 'orphan-nov',
        receiptId: null,
        classification: 'cancelable',
      }),
      charge({
        chargeId: 'paid-entry',
        receiptId: 'r-paid',
        status: 'PAID',
        classification: 'paid',
      }),
      charge({
        chargeId: 'open-1',
        receiptId: 'r-1',
        classification: 'cancelable',
      }),
      charge({
        chargeId: 'open-2',
        receiptId: 'r-2',
        classification: 'cancelable',
      }),
    ],
  });
  assert(lt22.paid.length === 1, 'LT22: 1 paga');
  assert(lt22.open.length === 2, 'LT22: 2 abertas vigentes');
  assert(lt22.open.map((row) => row.chargeId).sort().join() === 'open-1,open-2', 'LT22: só parcelas 1 e 2');
  assert(lt22.orphans.length === 2, 'LT22: 2 órfãs');
  assert(lt22.blockCode === TITLE_TRANSFER_ORPHAN_OPEN_CHARGES, 'LT22: bloqueia órfãs');

  const asaasOk = reduceTitleTransferExternalCharges({
    receipts: [
      { id: 'r-paid', status: 'pago' },
      { id: 'r-new', status: 'pendente' },
    ],
    charges: [
      charge({
        provider: 'ASAAS',
        chargeId: 'asaas-paid',
        receiptId: 'r-paid',
        classification: 'paid',
      }),
      charge({
        provider: 'ASAAS',
        chargeId: 'asaas-open',
        receiptId: 'r-new',
        classification: 'cancelable',
      }),
    ],
  });
  assert(asaasOk.paid.length === 1 && asaasOk.open.length === 1, 'Asaas homolog: 1+1');
  assert(asaasOk.blockCode === null, 'Asaas homolog: sem bloqueio');

  const dup = reduceTitleTransferExternalCharges({
    receipts: [{ id: 'r-1', status: 'pendente' }],
    charges: [
      charge({ chargeId: 'a', receiptId: 'r-1', classification: 'cancelable' }),
      charge({ chargeId: 'b', receiptId: 'r-1', classification: 'cancelable' }),
    ],
  });
  assert(dup.open.length === 0, 'duplicata: não escolhe uma');
  assert(dup.ambiguousReceiptIds.join() === 'r-1', 'duplicata: parcela marcada');
  assert(dup.blockCode === TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES, 'duplicata: bloqueia');
  console.log('OK testReduceTitleTransferCharges');
}

function testCanceledExcludedFromKpis() {
  const kpis = summarizeTitleTransferFinance({
    salePrice: 80,
    todayIso: '2026-09-07',
    receipts: [
      { id: 'paid', status: 'pago', amount: 20, paid_at: '2026-08-01', due_date: '2026-08-01' },
      { id: 'old-1', status: 'cancelado', amount: 20, due_date: '2026-09-01' },
      { id: 'old-2', status: 'canceled', amount: 20, due_date: '2026-10-01' },
      { id: 'old-3', status: 'cancelled', amount: 20, due_date: '2026-11-01' },
      { id: 'old-4', status: 'cancelada', amount: 20, due_date: '2026-12-01' },
      { id: 'n1', status: 'pendente', amount: 15, due_date: '2026-10-10' },
      { id: 'n2', status: 'pendente', amount: 15, due_date: '2026-11-10' },
      { id: 'n3', status: 'pendente', amount: 15, due_date: '2026-12-10' },
      { id: 'n4', status: 'pendente', amount: 15, due_date: '2027-01-10' },
    ],
  });
  assert(isCanceledFinanceReceipt({ status: 'cancelada' }), 'reusa saleChargesShared');
  assert(kpis.activeCount === 5, '5 vigentes');
  assert(kpis.paidCount === 1, '1 paga');
  assert(kpis.pendingCount === 4, '4 pendentes');
  assert(kpis.futureCount === 4, '4 futuras');
  assert(kpis.overdueCount === 0, '0 vencidas');
  assert(kpis.canceledCount === 4, '4 históricas');
  assert(kpis.totalPaid === 20, 'pago 20');
  assert(kpis.pendingAmount === 60, 'pendente 60');
  assert(kpis.remainingBalance === 60, 'saldo 60');
  console.log('OK testCanceledExcludedFromKpis');
}

function testNormalSaleUnchangedWithoutTransfer() {
  const kpis = summarizeTitleTransferFinance({
    salePrice: 80,
    todayIso: '2026-09-07',
    receipts: [
      { id: 'p0', status: 'pago', amount: 20, paid_at: '2026-08-01' },
      { id: 'p1', status: 'pendente', amount: 15, due_date: '2026-10-10' },
      { id: 'p2', status: 'atrasado', amount: 15, due_date: '2026-08-10' },
      { id: 'p3', status: 'pendente', amount: 15, due_date: '2026-11-10' },
      { id: 'p4', status: 'pendente', amount: 15, due_date: '2027-01-10' },
    ],
  });
  assert(kpis.activeCount === 5, 'venda normal 5');
  assert(kpis.paidCount === 1, '1 paga');
  assert(kpis.overdueCount === 1, '1 vencida');
  assert(kpis.futureCount === 3, '3 futuras');
  assert(kpis.pendingCount === 4, '4 pendentes');
  assert(kpis.totalPaid === 20, 'pago 20');
  assert(kpis.remainingBalance === 60, 'saldo 60');
  console.log('OK testNormalSaleUnchangedWithoutTransfer');
}

function testHistoryChain() {
  const empty = buildTitleTransferHistoryChain([]);
  assert(empty.length === 0, 'sem cadeia');
  assert(
    titleTransferHistoryNotice(empty) === TITLE_TRANSFER_ORIGINAL_HOLDER_NOTICE,
    'titular original',
  );
  const chain = buildTitleTransferHistoryChain([
    {
      id: 't2',
      fromCustomerId: 'b',
      toCustomerId: 'c',
      fromCustomerName: 'B',
      toCustomerName: 'C',
      fromContractId: 'ct-b',
      toContractId: 'ct-c',
      transferDate: '2026-08-02',
      declaredAgioAmount: 0,
      previousTransferId: 't1',
      executedAt: '2026-08-02T12:00:00Z',
    },
    {
      id: 't1',
      fromCustomerId: 'a',
      toCustomerId: 'b',
      fromCustomerName: 'A',
      toCustomerName: 'B',
      fromContractId: 'ct-a',
      toContractId: 'ct-b',
      transferDate: '2026-07-01',
      declaredAgioAmount: 0,
      previousTransferId: null,
      executedAt: '2026-07-01T12:00:00Z',
    },
  ]);
  assert(chain.map((row) => row.id).join() === 't1,t2', 'ordem A→B depois B→C');
  assert(chain[0].fromCustomerName === 'A' && chain[0].toCustomerName === 'B', 'A→B');
  assert(chain[1].previousTransferId === 't1', 'elo da cadeia');
  console.log('OK testHistoryChain');
}

function testLotAndTenantGuards() {
  const sameLot = assertTitleTransferLotUnchanged({
    saleId: 'sale-1',
    saleBlockId: 'block-1',
    blockId: 'block-1',
    blockSaleId: 'sale-1',
    blockStatus: 'Vendido',
  });
  assert(sameLot.ok, 'mesmo lote vendido');
  const available = assertTitleTransferLotUnchanged({
    saleId: 'sale-1',
    saleBlockId: 'block-1',
    blockId: 'block-1',
    blockSaleId: 'sale-1',
    blockStatus: 'Disponível',
  });
  assert(!available.ok && available.code === TITLE_TRANSFER_LOT_NOT_SOLD, 'recusa Disponível');
  const cross = assertTitleTransferCallerOwnsCompany({
    callerTenantId: 'co-2',
    resourceCompanyId: 'co-1',
    callerRole: 'ADMIN',
  });
  assert(!cross.ok && cross.code === TITLE_TRANSFER_CROSS_TENANT, 'CROSS_TENANT');
  const ok = assertTitleTransferCallerOwnsCompany({
    callerTenantId: 'co-1',
    resourceCompanyId: 'co-1',
    callerRole: 'ADMIN',
  });
  assert(ok.ok, 'mesmo tenant');
  console.log('OK testLotAndTenantGuards');
}

type Store = Record<string, Array<Record<string, unknown>>>;

class Query {
  constructor(
    private store: Store,
    private table: string,
  ) {}
  private filters: Array<[string, unknown]> = [];
  select() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push([key, value]);
    return this;
  }
  in() {
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
  private rows() {
    let rows = this.store[this.table] || [];
    for (const [key, value] of this.filters) {
      rows = rows.filter((row) => String(row[key] ?? '') === String(value ?? ''));
    }
    return rows;
  }
  maybeSingle() {
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
        customer_id: 'cust-b',
        contract_id: 'ct-2',
        block_id: 'block-1',
        project_id: 'proj-1',
        company_id: 'co-1',
        tenant_id: 'co-1',
        agreed_price: 80,
        lot_price: 80,
        total_value: 80,
      },
    ],
    blocks: [
      {
        id: 'block-1',
        status: 'Vendido',
        sale_id: 'sale-1',
        contract_id: 'ct-2',
        project_id: 'proj-1',
        company_id: 'co-1',
        block_name: '01',
        number: '02',
        price: 80,
        customer_id: 'cust-b',
      },
    ],
    customers: [
      { id: 'cust-a', name: 'Titular A', cpf_cnpj: '11111111111' },
      { id: 'cust-b', name: 'Titular B', cpf_cnpj: '22222222222' },
    ],
    projects: [{ id: 'proj-1', name: 'Loteamento Homolog' }],
    contracts: [
      {
        id: 'ct-1',
        sale_id: 'sale-1',
        contract_number: '000000016/2026',
        status: 'superseded',
        is_current: false,
        created_at: '2026-07-01',
      },
      {
        id: 'ct-2',
        sale_id: 'sale-1',
        contract_number: '000000017/2026',
        status: 'ativo',
        is_current: true,
        created_at: '2026-08-01',
      },
    ],
    finance_receipts: [
      {
        id: 'r-paid',
        sale_id: 'sale-1',
        status: 'pago',
        amount: 20,
        paid_at: '2026-08-01',
        due_date: '2026-08-01',
      },
      {
        id: 'r-old',
        sale_id: 'sale-1',
        status: 'cancelado',
        amount: 80,
        due_date: '2026-09-01',
      },
      {
        id: 'r-new',
        sale_id: 'sale-1',
        status: 'pendente',
        amount: 60,
        due_date: '2026-12-10',
      },
    ],
    sale_title_transfers: [],
    company_asaas_charges: [
      {
        id: 'ch-open',
        company_id: 'co-1',
        sale_id: 'sale-1',
        installment_id: 'r-new',
        status: 'PENDING',
        asaas_payment_id: 'pay_open',
      },
      {
        id: 'ch-paid',
        company_id: 'co-1',
        sale_id: 'sale-1',
        installment_id: 'r-paid',
        status: 'RECEIVED',
        asaas_payment_id: 'pay_paid',
      },
    ],
    bank_charges: [],
    bank_integrations: [],
  };
}

function adminFrom(store: Store) {
  return {
    from(table: string) {
      return new Query(store, table);
    },
  };
}

async function testPreviewOriginalHolderNoMutation() {
  ensureExternalChargeProvidersRegistered();
  const store = baseStore();
  const before = JSON.stringify(store);
  const payload = await loadSaleTitleTransferPreview(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    todayIso: '2026-09-07',
  });
  assert(payload.mutation === false, 'mutation false');
  assert(payload.persistTransfer === false, 'não persiste transferência');
  assert(payload.cancelCharges === false && payload.generateCharges === false, 'sem banco');
  assert(payload.current.saleId === 'sale-1', 'mesma sale_id');
  assert(payload.current.property.blockId === 'block-1', 'mesmo block_id');
  assert(payload.current.property.status === 'Vendido', 'lote vendido');
  assert(payload.current.titular.name === 'Titular B', 'titular atual');
  assert(payload.current.finance.totalPaid === 20, 'pago preservado');
  assert(payload.current.finance.remainingBalance === 60, 'saldo');
  assert(payload.current.finance.canceledCount === 1, 'cancelada fora do total');
  assert(payload.current.finance.activeCount === 2, 'paga + pendente');
  assert(payload.history.isOriginalHolder === true, 'titular original');
  assert(payload.externalCharges.paid.length === 1, '1 paga preservar');
  assert(payload.externalCharges.open.length === 1, '1 aberta');
  assert(payload.externalCharges.blockCode === null, 'Asaas sem órfã');
  assert(payload.externalCharges.remoteApiCalled === false, 'sem API remota');
  assert(JSON.stringify(store) === before, 'store intacto');
  assert(payload.notice === TITLE_TRANSFER_PREVIEW_NOTICE, 'aviso somente leitura');
  console.log('OK testPreviewOriginalHolderNoMutation');
}

async function testPreviewChainAB() {
  const store = baseStore();
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
      declared_agio_amount: 0,
      transfer_date: '2026-08-01',
      executed_at: '2026-08-01T10:00:00Z',
    },
  ];
  const payload = await loadSaleTitleTransferPreview(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    todayIso: '2026-09-07',
  });
  assert(payload.history.isOriginalHolder === false, 'já houve cessão');
  assert(payload.history.chain.length === 1, '1 elo');
  assert(payload.history.chain[0].fromCustomerName === 'Titular A', 'A');
  assert(payload.history.chain[0].toCustomerName === 'Titular B', 'B');
  assert(payload.current.property.blockId === 'block-1', 'block inalterado');
  console.log('OK testPreviewChainAB');
}

async function testPreviewCrossTenant() {
  const store = baseStore();
  store.users = [{ id: 'user-1', role: 'ADMIN', tenant_id: 'co-2' }];
  try {
    await loadSaleTitleTransferPreview(adminFrom(store) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
    });
    throw new Error('deveria recusar CROSS_TENANT');
  } catch (err) {
    assert(err instanceof TitleTransferPreviewError, 'erro tipado');
    assert(err.code === TITLE_TRANSFER_CROSS_TENANT, 'CROSS_TENANT');
    assert(err.status === 403, '403');
  }
  console.log('OK testPreviewCrossTenant');
}

function testSourceArchitecture() {
  const svc = read('lib/finance/saleTitleTransferPreviewService.ts');
  assert(svc.includes('mutation: false'), 'payload mutation false');
  assert(!svc.includes('.insert('), 'serviço sem insert');
  assert(!svc.includes('.update('), 'serviço sem update');
  assert(!svc.includes('.delete('), 'serviço sem delete');
  assert(!/\brpc\(\s*['"]execute_sale_lot_swap/.test(svc), 'sem RPC da troca');
  assert(!svc.includes('/api/lots/'), 'sem release');
  assert(!svc.includes('cancelCancelableCharge'), 'sem cancelar banco');
  assert(svc.includes('reduceTitleTransferExternalCharges'), 'preview reduz cobrança vigente');
  assert(!svc.includes('createCompanyInstallmentCharge'), 'sem gerar boleto');
  assert(!svc.includes('LOT_SWAP_EXTERNAL_CHARGES_LIVE'), 'sem LIVE da troca');
  assert(!svc.includes('seller_parties_json'), 'sem Mundo Novo');
  const route = read('app/api/sales/[saleId]/title-transfer/route.ts');
  assert(route.includes('export async function GET'), 'GET');
  assert(!route.includes('export async function POST'), 'sem POST');
  const panel = read('components/map/TitleTransferPreviewPanel.tsx');
  assert(panel.includes('Titular atual'), 'UI titular');
  assert(panel.includes('Histórico de titularidade'), 'UI histórico');
  assert(panel.includes('/api/sales/'), 'GET oficial');
  assert(!panel.includes('CustomerSearchPicker'), 'P2 sem cessionário');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('TitleTransferPreviewPanel'), 'modal usa painel');
  assert(modal.includes("fetch(`/api/lots/${encodeURIComponent(lot.id)}/release`"), 'release intacto');
  console.log('OK testSourceArchitecture');
}

async function main() {
  testCanceledExcludedFromKpis();
  testReduceTitleTransferCharges();
  testNormalSaleUnchangedWithoutTransfer();
  testHistoryChain();
  testLotAndTenantGuards();
  await testPreviewOriginalHolderNoMutation();
  await testPreviewChainAB();
  await testPreviewCrossTenant();
  testSourceArchitecture();
  console.log('OK mandatory-sale-title-transfer-phase2-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
