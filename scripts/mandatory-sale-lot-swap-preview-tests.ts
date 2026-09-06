/**
 * Fase 2 — preview/simulação da Troca de lote (sem mutação).
 * npx tsx scripts/mandatory-sale-lot-swap-preview-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  isDeferredSaleOperation,
  isLotReleaseSaleOperation,
  showsTerminationSettlement,
} from '../lib/finance/releaseLotShared';
import { isSaleReleaseSettlementOperation } from '../lib/finance/saleReleaseSettlement';
import { isSaleLotSwapOperation } from '../lib/finance/saleLotSwap';
import {
  assertOriginBelongsToSale,
  assertSaleEligibleForLotSwapPreview,
  deriveLotSwapPreviewFinancials,
  evaluateLotSwapDestination,
  LOT_SWAP_CREDIT_EXCEEDS_PRICE,
  LOT_SWAP_CREDIT_EXCEEDS_PRICE_MESSAGE,
  LOT_SWAP_CROSS_PROJECT,
  LOT_SWAP_CROSS_TENANT,
  LOT_SWAP_DESTINATION_HAS_CONTRACT,
  LOT_SWAP_DESTINATION_HAS_SALE,
  LOT_SWAP_DESTINATION_NOT_AVAILABLE,
  LOT_SWAP_DESTINATION_RESERVED,
  LOT_SWAP_ORIGIN_MISMATCH,
  LOT_SWAP_PREVIEW_GENERIC_LOAD_SALE_MESSAGE,
  LOT_SWAP_SALE_CANCELLED,
  LOT_SWAP_SALE_NOT_ACTIVE,
  LOT_SWAP_SAME_BLOCK,
  LOT_SWAP_SCHEDULE_PREVIEW_NOTICE,
  mapLotSwapPreviewUserMessage,
  parseMissingSelectColumn,
  resolveLotSwapPreviewSaleId,
  SALE_LOT_SWAP_SALE_SELECT_COLUMNS,
  lotSwapPreviewBlockMessage,
  simulateLotSwapSchedule,
  sumLotSwapPaidAmount,
  type LotSwapBlockSnapshot,
} from '../lib/finance/saleLotSwapPreview';
import {
  loadSaleLotSwapPreview,
  loadSaleRowForLotSwapPreview,
  LotSwapPreviewError,
} from '../lib/finance/saleLotSwapPreviewService';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function block(
  extra: Partial<LotSwapBlockSnapshot> & Pick<LotSwapBlockSnapshot, 'id'>,
): LotSwapBlockSnapshot {
  return {
    projectId: 'proj-a',
    status: 'Disponível',
    saleId: null,
    contractId: null,
    quadra: '01',
    lote: extra.lote || '02',
    area: 200,
    price: 120,
    ...extra,
  };
}

const origin: LotSwapBlockSnapshot = {
  id: 'lot-origin',
  projectId: 'proj-a',
  status: 'Vendido',
  saleId: 'sale-1',
  contractId: 'ct-1',
  quadra: '01',
  lote: '01',
  area: 180,
  price: 100,
};

function testDestinationFilters() {
  assert(evaluateLotSwapDestination(block({ id: 'lot-av' }), origin).ok, 'Disponível aparece');
  assert(
    evaluateLotSwapDestination(block({ id: 'lot-sold', status: 'Vendido' }), origin).code ===
      LOT_SWAP_DESTINATION_NOT_AVAILABLE,
    'Vendido não aparece',
  );
  assert(
    evaluateLotSwapDestination(block({ id: 'lot-res', status: 'Reservado' }), origin).code ===
      LOT_SWAP_DESTINATION_RESERVED,
    'Reservado não aparece',
  );
  assert(
    evaluateLotSwapDestination(block({ id: 'lot-other', projectId: 'proj-b' }), origin).code ===
      LOT_SWAP_CROSS_PROJECT,
    'outro empreendimento não aparece',
  );
  assert(
    evaluateLotSwapDestination(block({ id: origin.id }), origin).code === LOT_SWAP_SAME_BLOCK,
    'origem não aparece como destino',
  );
  assert(
    evaluateLotSwapDestination(block({ id: 'lot-sale', saleId: 'sale-x' }), origin).code ===
      LOT_SWAP_DESTINATION_HAS_SALE,
    'destino com sale_id recusado',
  );
  assert(
    evaluateLotSwapDestination(block({ id: 'lot-ct', contractId: 'ct-x' }), origin).code ===
      LOT_SWAP_DESTINATION_HAS_CONTRACT,
    'destino com contract_id recusado',
  );
  assert(
    evaluateLotSwapDestination(
      block({ id: 'lot-foreign', companyId: 'company-2' }),
      { ...origin, companyId: 'company-1' },
    ).code === LOT_SWAP_CROSS_TENANT,
    'lote de outra empresa recusado mesmo conhecendo o UUID',
  );
  console.log('OK testDestinationFilters');
}

function testCancelledSaleBlocks() {
  assert(
    assertSaleEligibleForLotSwapPreview({ saleStatus: 'CANCELLED' }).code ===
      LOT_SWAP_SALE_CANCELLED,
    'venda CANCELLED bloqueia',
  );
  assert(
    assertSaleEligibleForLotSwapPreview({ saleStatus: 'ACTIVE' }).ok,
    'venda ACTIVE segue',
  );
  assert(
    assertOriginBelongsToSale({
      saleId: 'sale-1',
      saleBlockId: 'lot-other',
      origin,
    }).code === LOT_SWAP_ORIGIN_MISMATCH,
    'origem de outra venda bloqueia',
  );
  console.log('OK testCancelledSaleBlocks');
}

function testFinancialScenarios() {
  const a = deriveLotSwapPreviewFinancials({
    oldSalePrice: 100,
    newLotPrice: 120,
    appropriatedToAcquisitionPrice: 20,
  });
  assert(a.fields.total_paid === 20, 'A total_paid');
  assert(a.fields.transferable_credit === 20, 'A crédito V1 separado');
  assert(a.fields.new_balance === 100, 'A 100→120 com 20 pagos = saldo 100');
  assert(!a.blocked, 'A não bloqueia');

  const b = deriveLotSwapPreviewFinancials({
    oldSalePrice: 100,
    newLotPrice: 90,
    appropriatedToAcquisitionPrice: 20,
  });
  assert(b.fields.new_balance === 70, 'B 100→90 com 20 pagos = saldo 70');
  assert(!b.blocked, 'B não bloqueia');

  const c = deriveLotSwapPreviewFinancials({
    oldSalePrice: 100,
    newLotPrice: 80,
    appropriatedToAcquisitionPrice: 95,
  });
  assert(c.blocked, 'C crédito > novo lote bloqueia');
  assert(c.blockCode === LOT_SWAP_CREDIT_EXCEEDS_PRICE, 'C código');
  assert(
    lotSwapPreviewBlockMessage(c.blockCode) === LOT_SWAP_CREDIT_EXCEEDS_PRICE_MESSAGE,
    'C mensagem homologada',
  );
  assert(c.fields.total_paid !== undefined && c.fields.transferable_credit !== undefined, 'campos separados');
  console.log('OK testFinancialScenarios');
}

function testScheduleSimulationDoesNotCreateReceipts() {
  const paid = sumLotSwapPaidAmount([
    { installment_number: 0, status: 'pago', amount: 20 },
    { installment_number: 1, status: 'pendente', amount: 10, due_date: '2026-10-10' },
    { installment_number: 2, status: 'pendente', amount: 10, due_date: '2026-11-10' },
  ]);
  assert(paid.totalPaid === 20 && paid.paidCount === 1, 'pago preservado na soma');
  const schedule = simulateLotSwapSchedule({
    newBalance: 100,
    futureReceipts: [
      { installment_number: 1, status: 'pendente', amount: 10, due_date: '2026-10-10' },
      { installment_number: 2, status: 'pendente', amount: 10, due_date: '2026-11-10' },
    ],
    balloons: [{ installment_number: 12, additional_amount: 500, due_date: '2027-09-10' }],
    correctionLabel: 'IPCA',
  });
  assert(schedule.futureInstallmentCount === 2, 'parcelas futuras atuais');
  assert(schedule.estimatedAverageAmount === 50, 'média 100/2');
  assert(schedule.firstFutureDueDate === '2026-10-10', 'primeira data futura');
  assert(schedule.balloons.length === 1, 'balão existente');
  assert(schedule.notice === LOT_SWAP_SCHEDULE_PREVIEW_NOTICE, 'aviso da próxima fase');
  console.log('OK testScheduleSimulationDoesNotCreateReceipts');
}

function testNoMutationAndNoSettlement() {
  const preview = read('lib/finance/saleLotSwapPreview.ts');
  const svc = read('lib/finance/saleLotSwapPreviewService.ts');
  const route = read('app/api/sales/[saleId]/lot-swap/route.ts');
  const ui = read('components/map/LotSwapPreviewPanel.tsx');
  for (const [name, src] of [
    ['preview', preview],
    ['svc', svc],
    ['route', route],
    ['ui', ui],
  ] as const) {
    assert(!src.includes('retention_percent'), `${name} sem retenção`);
    assert(!src.includes('calculateTerminationSettlement'), `${name} sem settlement`);
    assert(!src.includes('saleReleaseSettlement'), `${name} sem settlement persistido`);
    assert(!src.includes('releaseLotService'), `${name} sem ReleaseLot`);
  }
  assert(!/\.insert\(/.test(svc), 'serviço sem INSERT');
  assert(!/\.update\(/.test(svc), 'serviço sem UPDATE');
  assert(!/\.delete\(/.test(svc), 'serviço sem DELETE');
  assert(!svc.includes(".from('sale_lot_swaps')"), 'serviço não lê/grava sale_lot_swaps');
  assert(svc.includes('FOR UPDATE'), 'lock da Fase 4 documentado');
  assert(route.includes('mutation: false'), 'API declara sem mutação');
  assert(route.includes('export async function GET'), 'GET preview');
  assert(route.includes('export async function POST'), 'POST preview sem execute');
  assert(!route.includes('executeLotSwap'), 'sem executor');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  const handleSubmit = modal.slice(
    modal.indexOf('const handleSubmit'),
    modal.indexOf('if (!mounted)'),
  );
  assert(handleSubmit.includes('isLotReleaseSaleOperation(motiveCode)'), 'submit não executa troca');
  assert(!handleSubmit.includes('/lot-swap'), 'submit não posta execução de troca');
  assert(isSaleLotSwapOperation('troca_lote'), 'código da operação');
  assert(!isLotReleaseSaleOperation('troca_lote'), 'não é release');
  assert(!showsTerminationSettlement('troca_lote'), 'sem acerto de rescisão');
  assert(!isSaleReleaseSettlementOperation('troca_lote'), 'sem settlement');
  assert(!isDeferredSaleOperation('troca_lote'), 'não fica só diferida');
  console.log('OK testNoMutationAndNoSettlement');
}

function testProtectedFlowsIntact() {
  assert(isLotReleaseSaleOperation('desistencia'), 'Desistência intacta');
  assert(isLotReleaseSaleOperation('distrato'), 'Distrato intacto');
  assert(isLotReleaseSaleOperation('inadimplencia'), 'Inadimplência intacta');
  assert(showsTerminationSettlement('desistencia'), 'settlement Desistência');
  assert(showsTerminationSettlement('distrato'), 'settlement Distrato');
  assert(showsTerminationSettlement('inadimplencia'), 'settlement Inadimplência');
  const mundo = read('lib/mundoNovoContractSellers.ts');
  assert(mundo.includes('resolveMundoNovoPromitenteVendors'), 'Mundo Novo intacto');
  assert(mundo.includes('seller_parties_json') || read('lib/project-form.ts').includes('seller_parties_json'), 'seller_parties_json permanece no projeto');
  assert(!mundo.includes('saleLotSwapPreview'), 'Mundo Novo sem preview de troca');
  const release = read('lib/finance/releaseLotService.ts');
  assert(!release.includes('saleLotSwapPreview'), 'ReleaseLot não chama a troca');
  assert(!release.includes(".from('sale_lot_swaps')"), 'ReleaseLot não grava swap');
  assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'DEVELOP');
  assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'Production');
  console.log('OK testProtectedFlowsIntact');
}

function testSaleSelectNeverIncludesMissingSalePrice() {
  assert(
    !(SALE_LOT_SWAP_SALE_SELECT_COLUMNS as readonly string[]).includes('sale_price'),
    'select oficial sem sale_price',
  );
  assert(
    (SALE_LOT_SWAP_SALE_SELECT_COLUMNS as readonly string[]).includes('agreed_price'),
    'select usa agreed_price',
  );
  const svc = read('lib/finance/saleLotSwapPreviewService.ts');
  assert(!svc.includes('sale_price'), 'serviço não seleciona sale_price');
  assert(
    parseMissingSelectColumn(
      "Could not find the 'sale_price' column of 'sales' in the schema cache",
    ) === 'sale_price',
    'parser PostgREST de coluna ausente',
  );
  console.log('OK testSaleSelectNeverIncludesMissingSalePrice');
}

function testGisModalPassesSaleIdNotBlockOrContract() {
  const gisLot = {
    id: 'block-origin-uuid',
    saleId: 'sale-real-uuid',
    contractId: 'contract-uuid',
  };
  const previewFromReleaseGet = { saleId: 'sale-real-uuid' };
  const resolved = resolveLotSwapPreviewSaleId({
    previewSaleId: previewFromReleaseGet.saleId,
    lotSaleId: gisLot.saleId,
    lotId: gisLot.id,
    contractId: gisLot.contractId,
  });
  assert(resolved === 'sale-real-uuid', 'usa saleId da venda já carregada');
  assert(resolved !== gisLot.id, 'não usa blockId como saleId');
  assert(resolved !== gisLot.contractId, 'não usa contractId como saleId');
  assert(
    resolveLotSwapPreviewSaleId({
      lotSaleId: gisLot.id,
      lotId: gisLot.id,
      contractId: gisLot.contractId,
    }) === '',
    'rejeita blockId disfarçado de saleId',
  );
  assert(
    resolveLotSwapPreviewSaleId({
      lotSaleId: gisLot.contractId,
      lotId: gisLot.id,
      contractId: gisLot.contractId,
    }) === '',
    'rejeita contractId disfarçado de saleId',
  );
  const gis = read('components/map/GISMap.tsx');
  assert(gis.includes('saleId: b.sale_id || null'), 'GIS passa blocks.sale_id');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('resolveLotSwapPreviewSaleId'), 'modal resolve saleId do contexto');
  assert(modal.includes('previewSaleId: preview?.saleId'), 'prefere saleId do GET release');
  const ui = read('components/map/LotSwapPreviewPanel.tsx');
  assert(ui.includes('credentials: \'include\''), 'fetch envia a sessão');
  assert(ui.includes('mapLotSwapPreviewUserMessage'), 'UI mapeia erros');
  console.log('OK testGisModalPassesSaleIdNotBlockOrContract');
}

function testMappedPreviewErrors() {
  assert(
    mapLotSwapPreviewUserMessage({
      status: 500,
      code: 'LOAD_SALE_FAILED',
      message: LOT_SWAP_PREVIEW_GENERIC_LOAD_SALE_MESSAGE,
    }) === 'Erro interno inesperado ao carregar a prévia.',
    'não esconde 500 atrás da mensagem genérica antiga',
  );
  assert(
    mapLotSwapPreviewUserMessage({ status: 404, code: 'SALE_NOT_FOUND' }) ===
      'Venda não encontrada.',
    '404 venda',
  );
  assert(
    mapLotSwapPreviewUserMessage({ status: 403, code: 'CROSS_TENANT' }) ===
      'A venda não pertence à empresa atual.',
    '403 tenant',
  );
  assert(
    mapLotSwapPreviewUserMessage({
      status: 409,
      code: LOT_SWAP_SALE_NOT_ACTIVE,
    }) === 'A troca de lote exige uma venda ativa.',
    '409 venda inativa',
  );
  assert(
    mapLotSwapPreviewUserMessage({ status: 401, code: 'UNAUTHORIZED' }) ===
      'Sessão ou autorização inválida.',
    '401 sessão',
  );
  assert(
    mapLotSwapPreviewUserMessage({ status: 500, code: 'LOAD_FINANCE_FAILED' }) ===
      'Erro ao carregar dados financeiros da venda.',
    '500 financeiro',
  );
  console.log('OK testMappedPreviewErrors');
}

type MockRow = Record<string, unknown>;

const DEVELOP_SALES_COLUMNS = new Set([
  'id',
  'status',
  'customer_id',
  'broker_id',
  'contract_id',
  'block_id',
  'tenant_id',
  'company_id',
  'agreed_price',
  'lot_price',
  'total_value',
  'financial_account_id',
  'installment_correction_type',
]);

function homologPreviewDb() {
  return {
    users: [{ id: 'user-1', role: 'ADMIN', tenant_id: 'company-1' }],
    sales: [
      {
        id: 'sale-real-uuid',
        status: 'ACTIVE',
        customer_id: 'cust-1',
        broker_id: 'broker-1',
        contract_id: 'contract-uuid',
        block_id: 'block-origin-uuid',
        tenant_id: 'company-1',
        company_id: 'company-1',
        agreed_price: 100000,
        lot_price: 100000,
        total_value: 100000,
        financial_account_id: 'acc-1',
        installment_correction_type: 'NONE',
      },
    ],
    blocks: [
      {
        id: 'block-origin-uuid',
        status: 'Vendido',
        price: 100000,
        sale_id: 'sale-real-uuid',
        contract_id: 'contract-uuid',
        project_id: 'proj-a',
        tenant_id: 'company-1',
        company_id: 'company-1',
        block_name: '01',
        name: '01',
        number: '01',
        lot_number: '01',
        area: 180,
      },
      {
        id: 'block-avail',
        status: 'Disponível',
        price: 120000,
        sale_id: null,
        contract_id: null,
        project_id: 'proj-a',
        tenant_id: 'company-1',
        company_id: 'company-1',
        block_name: '01',
        name: '01',
        number: '02',
        lot_number: '02',
        area: 200,
      },
      {
        id: 'block-sold',
        status: 'Vendido',
        price: 110000,
        sale_id: 'other-sale',
        contract_id: 'ct-other',
        project_id: 'proj-a',
        tenant_id: 'company-1',
        company_id: 'company-1',
        block_name: '01',
        name: '01',
        number: '03',
        lot_number: '03',
        area: 190,
      },
      {
        id: 'block-res',
        status: 'Reservado',
        price: 110000,
        sale_id: null,
        contract_id: null,
        project_id: 'proj-a',
        tenant_id: 'company-1',
        company_id: 'company-1',
        block_name: '01',
        name: '01',
        number: '04',
        lot_number: '04',
        area: 190,
      },
      {
        id: 'block-other-proj',
        status: 'Disponível',
        price: 90000,
        sale_id: null,
        contract_id: null,
        project_id: 'proj-b',
        tenant_id: 'company-1',
        company_id: 'company-1',
        block_name: '99',
        name: '99',
        number: '01',
        lot_number: '01',
        area: 150,
      },
      {
        id: 'block-foreign-company',
        status: 'Disponível',
        price: 80000,
        sale_id: null,
        contract_id: null,
        project_id: 'proj-a',
        tenant_id: 'company-2',
        company_id: 'company-2',
        block_name: '02',
        name: '02',
        number: '99',
        lot_number: '99',
        area: 140,
      },
    ],
    projects: [{ id: 'proj-a', name: 'Residencial Homolog' }],
    customers: [{ id: 'cust-1', name: 'Maria Compradora' }],
    brokers: [{ id: 'broker-1', name: 'João Corretor' }],
    contracts: [
      {
        id: 'contract-uuid',
        contract_number: 'CT-100',
        status: 'ativo',
        sale_id: 'sale-real-uuid',
        is_current: true,
      },
    ],
    finance_receipts: [
      {
        id: 'r1',
        sale_id: 'sale-real-uuid',
        installment_number: 0,
        status: 'pago',
        paid_at: '2026-01-10',
        amount: 20000,
        due_date: '2026-01-10',
      },
      {
        id: 'r2',
        sale_id: 'sale-real-uuid',
        installment_number: 1,
        status: 'pendente',
        amount: 5000,
        due_date: '2026-10-10',
      },
    ],
    sale_balloon_installments: [],
    company_financial_accounts: [{ id: 'acc-1', name: 'Conta principal' }],
  };
}

class HomologQuery {
  private cols = '*';
  private eqFilters: Record<string, unknown> = {};
  private neqFilters: Record<string, unknown> = {};
  private nullKeys: string[] = [];

  constructor(
    private db: ReturnType<typeof homologPreviewDb>,
    private table: string,
  ) {}

  select(cols: string) {
    this.cols = cols;
    return this;
  }
  eq(key: string, value: unknown) {
    this.eqFilters[key] = value;
    return this;
  }
  neq(key: string, value: unknown) {
    this.neqFilters[key] = value;
    return this;
  }
  is(key: string, value: unknown) {
    if (value === null) this.nullKeys.push(key);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }

  private salesSelectError(): { message: string } | null {
    if (this.table !== 'sales' || this.cols === '*') return null;
    const requested = this.cols
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const missing = requested.find((col) => !DEVELOP_SALES_COLUMNS.has(col));
    if (!missing) return null;
    return {
      message: `Could not find the '${missing}' column of 'sales' in the schema cache`,
    };
  }

  private rows(): MockRow[] {
    const table = (this.db as Record<string, MockRow[]>)[this.table] || [];
    return table.filter((row) => {
      for (const [key, value] of Object.entries(this.eqFilters)) {
        if (String(row[key] ?? '') !== String(value ?? '')) return false;
      }
      for (const [key, value] of Object.entries(this.neqFilters)) {
        if (String(row[key] ?? '') === String(value ?? '')) return false;
      }
      for (const key of this.nullKeys) {
        if (row[key] != null) return false;
      }
      return true;
    });
  }

  async maybeSingle() {
    const error = this.salesSelectError();
    if (error) return { data: null, error };
    const rows = this.rows();
    return { data: rows[0] || null, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    resolve?: ((value: { data: MockRow[] | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(resolve as never, reject as never);
  }

  async execute() {
    const error = this.salesSelectError();
    if (error) return { data: null, error };
    return { data: this.rows(), error: null };
  }
}

function createHomologAdmin(db = homologPreviewDb()) {
  return {
    from(table: string) {
      return new HomologQuery(db, table);
    },
  };
}

async function testLoadSaleRowStripsMissingColumns() {
  const admin = createHomologAdmin();
  const row = await loadSaleRowForLotSwapPreview(admin as never, 'sale-real-uuid');
  assert(row.id === 'sale-real-uuid', 'carregou a venda pelo saleId');
  assert(row.agreed_price === 100000, 'preço agreed_price');
  try {
    await loadSaleRowForLotSwapPreview(admin as never, 'block-origin-uuid');
    throw new Error('deveria 404 para blockId');
  } catch (err) {
    assert(err instanceof LotSwapPreviewError, 'erro tipado');
    assert((err as LotSwapPreviewError).code === 'SALE_NOT_FOUND', 'blockId não acha venda');
    assert((err as LotSwapPreviewError).status === 404, 'HTTP 404');
  }
  console.log('OK testLoadSaleRowStripsMissingColumns');
}

async function testGisOperationsLotSwapPreviewLoad() {
  const gisLot = {
    id: 'block-origin-uuid',
    saleId: 'sale-real-uuid',
    contractId: 'contract-uuid',
  };
  const previewFromModal = { saleId: 'sale-real-uuid' };
  const saleId = resolveLotSwapPreviewSaleId({
    previewSaleId: previewFromModal.saleId,
    lotSaleId: gisLot.saleId,
    lotId: gisLot.id,
    contractId: gisLot.contractId,
  });
  assert(saleId === 'sale-real-uuid', 'GIS → modal → saleId da venda');

  const payload = await loadSaleLotSwapPreview(createHomologAdmin() as never, {
    saleId,
    userId: 'user-1',
  });
  assert(payload.mutation === false, 'stateless');
  assert(payload.current.saleId === 'sale-real-uuid', '1 venda atual');
  assert(payload.current.projectName === 'Residencial Homolog', '2 empreendimento');
  assert(payload.current.origin.quadra === '01', '3 quadra');
  assert(payload.current.origin.lote === '01', '3 lote');
  assert(payload.current.customerName === 'Maria Compradora', '4 cliente');
  assert(payload.current.contractNumber === 'CT-100', '5 contrato');
  assert(payload.current.oldSalePrice === 100000, '6 valor da venda');
  assert(payload.current.totalPaid === 20000, '7 total pago');
  assert(payload.current.oldBalance === 80000, '8 saldo');
  const destIds = payload.destinations.map((d) => d.id);
  assert(destIds.includes('block-avail'), '9 disponível do mesmo empreendimento');
  assert(!destIds.includes('block-sold'), '10 vendido não aparece');
  assert(!destIds.includes('block-res'), '11 reservado não aparece');
  assert(!destIds.includes('block-origin-uuid'), '12 origem não aparece');
  assert(!destIds.includes('block-other-proj'), '13 outro empreendimento não aparece');
  assert(
    !destIds.includes('block-foreign-company'),
    'lote de outra empresa não aparece mesmo no mesmo project_id',
  );
  console.log('OK testGisOperationsLotSwapPreviewLoad');
}

async function testPreviewErrorCases() {
  const db = homologPreviewDb();
  db.users[0].tenant_id = 'outra-empresa';
  try {
    await loadSaleLotSwapPreview(createHomologAdmin(db) as never, {
      saleId: 'sale-real-uuid',
      userId: 'user-1',
    });
    throw new Error('deveria bloquear tenant');
  } catch (err) {
    assert(err instanceof LotSwapPreviewError, 'erro tenant');
    assert((err as LotSwapPreviewError).code === 'CROSS_TENANT', 'CROSS_TENANT');
    assert((err as LotSwapPreviewError).status === 403, 'HTTP 403');
  }
  console.log('OK testPreviewErrorCases');
}

testDestinationFilters();
testCancelledSaleBlocks();
testFinancialScenarios();
testScheduleSimulationDoesNotCreateReceipts();
testNoMutationAndNoSettlement();
testProtectedFlowsIntact();
testSaleSelectNeverIncludesMissingSalePrice();
testGisModalPassesSaleIdNotBlockOrContract();
testMappedPreviewErrors();

async function main() {
  await testLoadSaleRowStripsMissingColumns();
  await testGisOperationsLotSwapPreviewLoad();
  await testPreviewErrorCases();
  console.log('OK mandatory-sale-lot-swap-preview-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
