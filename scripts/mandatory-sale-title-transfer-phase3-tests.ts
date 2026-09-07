/**
 * P3 — seleção do novo titular + dados da cessão + preview A → B.
 * Sem execução. Sem mutação de negócio.
 * npx tsx scripts/mandatory-sale-title-transfer-phase3-tests.ts
 */
import fs from 'node:fs';
import path from 'path';
import { isCanceledFinanceReceipt } from '../lib/finance/saleChargesShared';
import { ensureExternalChargeProvidersRegistered } from '../lib/finance/externalCharges';
import {
  applyDocumentalAgio,
  assertTitleTransferContractUnchanged,
  assertTitleTransferNewTitular,
  assertTitleTransferSaleStillActive,
  customerBelongsToTitleTransferCompany,
  parseDeclaredAgioAmount,
  resolveNextPreviousTransferId,
  TITLE_TRANSFER_CONTRACT_CHANGED,
  TITLE_TRANSFER_CUSTOMER_CROSS_TENANT,
  TITLE_TRANSFER_FUTURE_EXECUTION_ITEMS,
  TITLE_TRANSFER_OPEN_CHARGES_NOTICE,
  TITLE_TRANSFER_SALE_NOT_ACTIVE,
  TITLE_TRANSFER_SAME_TITULAR,
} from '../lib/finance/saleTitleTransferPlan';
import {
  prepareTitleTransferPlanPreview,
  searchTitleTransferCustomers,
} from '../lib/finance/saleTitleTransferPlanService';
import { TitleTransferPreviewError } from '../lib/finance/saleTitleTransferPreviewService';
import { TITLE_TRANSFER_CROSS_TENANT } from '../lib/finance/saleTitleTransferPreview';
import { summarizeTitleTransferFinance } from '../lib/finance/saleTitleTransferPreview';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
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
  insert(): never {
    throw new Error('insert forbidden');
  }
  update(): never {
    throw new Error('update forbidden');
  }
  delete(): never {
    throw new Error('delete forbidden');
  }
  upsert(): never {
    throw new Error('upsert forbidden');
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
        customer_id: 'cust-a',
        contract_id: 'ct-1',
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
        contract_id: 'ct-1',
        project_id: 'proj-1',
        company_id: 'co-1',
        block_name: '01',
        number: '02',
        price: 80,
        customer_id: 'cust-a',
      },
    ],
    customers: [
      {
        id: 'cust-a',
        name: 'Titular A',
        cpf_cnpj: '11111111111',
        phone: '63911111111',
        email: 'a@example.com',
        tenant_id: 'co-1',
        company_id: 'co-1',
      },
      {
        id: 'cust-b',
        name: 'Titular B',
        cpf_cnpj: '22222222222',
        phone: '63922222222',
        email: 'b@example.com',
        tenant_id: 'co-1',
        company_id: 'co-1',
      },
      {
        id: 'cust-c',
        name: 'Titular C',
        cpf_cnpj: '33333333333',
        tenant_id: 'co-1',
        company_id: 'co-1',
      },
      {
        id: 'cust-x',
        name: 'Outro Tenant',
        cpf_cnpj: '99999999999',
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
        id: 'r-pending',
        sale_id: 'sale-1',
        status: 'pendente',
        amount: 30,
        due_date: '2026-08-10',
      },
      {
        id: 'r-future',
        sale_id: 'sale-1',
        status: 'pendente',
        amount: 30,
        due_date: '2026-12-10',
      },
    ],
    sale_title_transfers: [],
    company_asaas_charges: [
      {
        id: 'ch-open',
        company_id: 'co-1',
        sale_id: 'sale-1',
        installment_id: 'r-future',
        status: 'PENDING',
        asaas_payment_id: 'pay_open',
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
    rpc(): never {
      throw new Error('rpc forbidden');
    },
  };
}

function testPureGuardsAndAgio() {
  const same = assertTitleTransferNewTitular({
    fromCustomerId: 'a',
    toCustomerId: 'a',
    customerExists: true,
    customerCompanyId: 'co-1',
    customerTenantId: 'co-1',
    saleCompanyId: 'co-1',
  });
  assert(!same.ok && same.code === TITLE_TRANSFER_SAME_TITULAR, 'impede A → A');
  const cross = assertTitleTransferNewTitular({
    fromCustomerId: 'a',
    toCustomerId: 'x',
    customerExists: true,
    customerCompanyId: 'co-2',
    customerTenantId: 'co-2',
    saleCompanyId: 'co-1',
  });
  assert(!cross.ok && cross.code === TITLE_TRANSFER_CUSTOMER_CROSS_TENANT, 'CROSS_TENANT cliente');
  assert(
    !customerBelongsToTitleTransferCompany({
      companyId: 'co-2',
      tenantId: 'co-2',
      saleCompanyId: 'co-1',
    }),
    'cliente de outro tenant',
  );
  const ok = assertTitleTransferNewTitular({
    fromCustomerId: 'a',
    toCustomerId: 'b',
    customerExists: true,
    customerCompanyId: 'co-1',
    customerTenantId: 'co-1',
    saleCompanyId: 'co-1',
  });
  assert(ok.ok, 'A → B válido');
  const inactive = assertTitleTransferSaleStillActive('cancelado');
  assert(!inactive.ok && inactive.code === TITLE_TRANSFER_SALE_NOT_ACTIVE, 'venda inativa');
  assert(assertTitleTransferSaleStillActive('ACTIVE').ok, 'ACTIVE');
  const changed = assertTitleTransferContractUnchanged({
    expectedContractId: 'ct-old',
    currentContractId: 'ct-1',
  });
  assert(!changed.ok && changed.code === TITLE_TRANSFER_CONTRACT_CHANGED, 'contrato mudou');
  const kpis = summarizeTitleTransferFinance({
    salePrice: 80,
    todayIso: '2026-09-07',
    receipts: [
      { id: 'p', status: 'pago', amount: 20, paid_at: '2026-08-01' },
      { id: 'c1', status: 'cancelado', amount: 80 },
      { id: 'c2', status: 'canceled', amount: 80 },
      { id: 'c3', status: 'cancelled', amount: 80 },
      { id: 'c4', status: 'cancelada', amount: 80 },
      { id: 'n', status: 'pendente', amount: 60, due_date: '2026-12-10' },
    ],
  });
  assert(isCanceledFinanceReceipt({ status: 'cancelada' }), 'helper canônico');
  assert(kpis.canceledCount === 4, 'canceladas excluídas');
  assert(kpis.remainingBalance === 60, 'saldo sem canceladas');
  const agio = parseDeclaredAgioAmount('1.500,00');
  assert(agio.ok && agio.amount === 1500, 'ágio BRL');
  const applied = applyDocumentalAgio({
    finance: kpis,
    salePrice: 80,
    declaredAgioAmount: agio.ok ? agio.amount : 0,
  });
  assert(applied.remainingBalance === 60, 'ágio não altera saldo');
  assert(applied.salePrice === 80, 'ágio não altera valor da venda');
  assert(applied.totalPaid === 20, 'ágio não registra pagamento');
  assert(applied.finance === kpis, 'KPIs intactos');
  const next = resolveNextPreviousTransferId([{ id: 't1' }, { id: 't2' }]);
  assert(next === 't2', 'próximo elo aponta para o último');
  assert(TITLE_TRANSFER_FUTURE_EXECUTION_ITEMS.length === 10, 'plano futuro');
  console.log('OK testPureGuardsAndAgio');
}

async function testSearchAndPlanAB() {
  ensureExternalChargeProvidersRegistered();
  const store = baseStore();
  const before = JSON.stringify(store);
  const search = await searchTitleTransferCustomers(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    query: 'Titular B',
  });
  assert(search.mutation === false, 'busca sem mutação');
  assert(search.customers.some((row) => row.id === 'cust-b'), 'encontrou B');
  assert(!search.customers.some((row) => row.id === 'cust-x'), 'sem outro tenant');
  const current = search.customers.find((row) => row.id === 'cust-a');
  if (current) assert(current.isCurrentTitular, 'A marcado como titular atual');

  const plan = await prepareTitleTransferPlanPreview(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    toCustomerId: 'cust-b',
    transferDate: '2026-09-07',
    declaredAgioAmount: '1.500,00',
    notes: 'cessão homolog',
    expectedContractId: 'ct-1',
    expectedBlockId: 'block-1',
    todayIso: '2026-09-07',
  });
  assert(plan.mutation === false, 'plan sem mutação');
  assert(plan.persistTransfer === false, 'não persiste transferência');
  assert(plan.persistSale === false && plan.persistLot === false, 'não persiste venda/lote');
  assert(plan.persistContract === false && plan.persistReceipts === false, 'não persiste contrato/parcelas');
  assert(plan.cancelCharges === false && plan.generateCharges === false, 'sem banco');
  assert(plan.remoteApiCalled === false, 'sem API remota');
  assert(plan.confirmation.from.id === 'cust-a', 'DE = A');
  assert(plan.confirmation.to.id === 'cust-b', 'PARA = B');
  assert(plan.confirmation.to.phone === '63922222222', 'telefone B');
  assert(plan.confirmation.to.email === 'b@example.com', 'e-mail B');
  assert(plan.confirmation.saleId === 'sale-1', 'mesma sale_id');
  assert(plan.confirmation.blockId === 'block-1', 'mesmo block_id');
  assert(plan.confirmation.property.status === 'Vendido', 'lote vendido');
  assert(plan.confirmation.declaredAgioAmount === 1500, 'ágio documental');
  assert(plan.confirmation.finance.totalPaid === 20, 'pago preservado');
  assert(plan.confirmation.finance.remainingBalance === 60, 'saldo intacto com ágio');
  assert(plan.confirmation.finance.paidCount === 1, '1 paga');
  assert(plan.confirmation.finance.pendingCount === 2, 'pendentes+futuras');
  assert(plan.confirmation.finance.overdueCount === 1, '1 vencida');
  assert(plan.confirmation.finance.futureCount === 1, '1 futura');
  assert(plan.confirmation.finance.canceledCount === 1, 'cancelada fora do KPI');
  assert(plan.confirmation.salePrice === 80, 'valor vigente intacto');
  assert(plan.openChargesNotice === TITLE_TRANSFER_OPEN_CHARGES_NOTICE, 'aviso de cobrança aberta');
  assert(plan.futureExecution.previousTransferId === null, 'primeira cessão');
  assert(
    plan.futureExecution.items.includes('uma futura B → C deverá criar novo elo usando previous_transfer_id.'),
    'menciona B → C',
  );
  assert(JSON.stringify(store) === before, 'store intacto');
  console.log('OK testSearchAndPlanAB');
}

async function testRejectSameTitular() {
  const store = baseStore();
  try {
    await prepareTitleTransferPlanPreview(adminFrom(store) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-a',
      expectedContractId: 'ct-1',
      expectedBlockId: 'block-1',
    });
    throw new Error('deveria recusar A → A');
  } catch (err) {
    assert(err instanceof TitleTransferPreviewError, 'erro tipado');
    assert(err.code === TITLE_TRANSFER_SAME_TITULAR, 'SAME_TITULAR');
  }
  console.log('OK testRejectSameTitular');
}

async function testRejectCrossTenantCustomer() {
  const store = baseStore();
  try {
    await prepareTitleTransferPlanPreview(adminFrom(store) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-x',
      expectedContractId: 'ct-1',
      expectedBlockId: 'block-1',
    });
    throw new Error('deveria recusar CROSS_TENANT');
  } catch (err) {
    assert(err instanceof TitleTransferPreviewError, 'erro tipado');
    assert(err.code === TITLE_TRANSFER_CUSTOMER_CROSS_TENANT, 'cliente outro tenant');
    assert(err.status === 403, '403');
  }
  console.log('OK testRejectCrossTenantCustomer');
}

async function testRejectCallerCrossTenant() {
  const store = baseStore();
  store.users = [{ id: 'user-1', role: 'ADMIN', tenant_id: 'co-2' }];
  try {
    await prepareTitleTransferPlanPreview(adminFrom(store) as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      toCustomerId: 'cust-b',
      expectedContractId: 'ct-1',
    });
    throw new Error('deveria recusar caller CROSS_TENANT');
  } catch (err) {
    assert(err instanceof TitleTransferPreviewError, 'erro tipado');
    assert(err.code === TITLE_TRANSFER_CROSS_TENANT, 'CROSS_TENANT venda');
  }
  console.log('OK testRejectCallerCrossTenant');
}

async function testChainABPresentedForFutureBC() {
  const store = baseStore();
  store.sales[0].customer_id = 'cust-b';
  store.blocks[0].customer_id = 'cust-b';
  store.contracts = [
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
      declared_agio_amount: 0,
      transfer_date: '2026-08-01',
      executed_at: '2026-08-01T10:00:00Z',
    },
  ];
  const plan = await prepareTitleTransferPlanPreview(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    toCustomerId: 'cust-c',
    expectedContractId: 'ct-2',
    expectedBlockId: 'block-1',
    todayIso: '2026-09-07',
  });
  assert(plan.confirmation.from.id === 'cust-b', 'titular atual B');
  assert(plan.confirmation.to.id === 'cust-c', 'cessionário C');
  assert(plan.preview.history.chain.length === 1, 'histórico A → B');
  assert(plan.preview.history.chain[0].fromCustomerName === 'Titular A', 'A no histórico');
  assert(plan.preview.history.chain[0].toCustomerName === 'Titular B', 'B no histórico');
  assert(plan.futureExecution.previousTransferId === 't1', 'futuro B → C usa previous_transfer_id');
  assert(plan.confirmation.saleId === 'sale-1', 'sale intacta');
  assert(plan.confirmation.blockId === 'block-1', 'lote intacto');
  console.log('OK testChainABPresentedForFutureBC');
}

async function testNoOpenChargeNoticeWhenNone() {
  const store = baseStore();
  store.company_asaas_charges = [];
  const plan = await prepareTitleTransferPlanPreview(adminFrom(store) as never, {
    saleId: 'sale-1',
    userId: 'user-1',
    toCustomerId: 'cust-b',
    expectedContractId: 'ct-1',
    expectedBlockId: 'block-1',
    todayIso: '2026-09-07',
  });
  assert(plan.openChargesNotice === null, 'sem aviso se não há cobrança aberta');
  console.log('OK testNoOpenChargeNoticeWhenNone');
}

function testSourceArchitecture() {
  const plan = read('lib/finance/saleTitleTransferPlan.ts');
  const svc = read('lib/finance/saleTitleTransferPlanService.ts');
  const customersRoute = read('app/api/sales/[saleId]/title-transfer/customers/route.ts');
  const planRoute = read('app/api/sales/[saleId]/title-transfer/plan/route.ts');
  const previewRoute = read('app/api/sales/[saleId]/title-transfer/route.ts');
  const panel = read('components/map/TitleTransferPreviewPanel.tsx');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  const previewSvc = read('lib/finance/saleTitleTransferPreviewService.ts');

  assert(!svc.includes('.insert('), 'plan service sem insert');
  assert(!svc.includes('.update('), 'plan service sem update');
  assert(!svc.includes('.delete('), 'plan service sem delete');
  assert(!/\brpc\(\s*['"]execute_sale_lot_swap/.test(svc), 'sem RPC da troca');
  assert(!svc.includes('cancelCancelableCharge'), 'sem cancelar banco');
  assert(!svc.includes('cancelCompanyCharge'), 'sem cancelCompanyCharge');
  assert(!svc.includes('createCompanyInstallmentCharge'), 'sem gerar boleto');
  assert(!svc.includes('generateMissingCharges'), 'sem generateMissingCharges');
  assert(!svc.includes('LOT_SWAP_EXTERNAL_CHARGES_LIVE'), 'sem LIVE da troca');
  assert(!svc.includes('seller_parties_json'), 'sem Mundo Novo');
  assert(svc.includes('mutation: false'), 'payload mutation false');
  assert(svc.includes('persistTransfer: false'), 'não persiste');
  assert(plan.includes(TITLE_TRANSFER_OPEN_CHARGES_NOTICE), 'aviso bancário canônico');

  assert(customersRoute.includes('export async function GET'), 'GET busca');
  assert(!customersRoute.includes('export async function POST'), 'busca sem POST');
  assert(planRoute.includes('export async function POST'), 'POST plan');
  assert(planRoute.includes('persistTransfer: false'), 'POST sem persistir');
  assert(planRoute.includes('TITLE_TRANSFER_EXECUTE_DISABLED'), 'execução bloqueada');
  assert(previewRoute.includes('export async function GET'), 'P2 GET intacto');
  assert(!previewRoute.includes('export async function POST'), 'P2 sem POST');

  assert(panel.includes('Novo titular'), 'UI novo titular');
  assert(panel.includes('Montar preview A → B'), 'UI preview');
  assert(panel.includes('Cadastrar novo cliente'), 'link cadastro existente');
  assert(panel.includes('/customers'), 'não duplica cadastro');
  assert(panel.includes('TITLE_TRANSFER_OPEN_CHARGES_NOTICE'), 'aviso na UI');
  assert(panel.includes('Financeiro preservado'), 'quadro financeiro');
  assert(!panel.includes('CustomerSearchPicker'), 'sem picker da venda');
  assert(!panel.includes('title-transfer/execute'), 'sem execução');
  assert(modal.includes('TitleTransferPreviewPanel'), 'modal usa painel');
  assert(!modal.includes('CustomerSearchPicker'), 'modal sem picker');
  assert(previewSvc.includes('mutation: false'), 'P2 intacto');
  console.log('OK testSourceArchitecture');
}

async function main() {
  testPureGuardsAndAgio();
  await testSearchAndPlanAB();
  await testRejectSameTitular();
  await testRejectCrossTenantCustomer();
  await testRejectCallerCrossTenant();
  await testChainABPresentedForFutureBC();
  await testNoOpenChargeNoticeWhenNone();
  testSourceArchitecture();
  console.log('OK mandatory-sale-title-transfer-phase3-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
