/**
 * Fase 3 — plano financeiro persistido CALCULATED (sem execução).
 * npx tsx scripts/mandatory-sale-lot-swap-plan-tests.ts
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
  assertLotSwapPlanPersistable,
  buildLotSwapFinancialPlan,
  LOT_SWAP_PLAN_STATUS,
  LOT_SWAP_REASON_REQUIRED,
  validateLotSwapReason,
} from '../lib/finance/saleLotSwapPlan';
import { LOT_SWAP_PLAN_FORBIDDEN_MUTATION_TABLES } from '../lib/finance/saleLotSwapPlanService';
import { loadSaleLotSwapPreview } from '../lib/finance/saleLotSwapPreviewService';
import { prepareSaleLotSwapPlan } from '../lib/finance/saleLotSwapPlanService';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';
import { LOT_SWAP_CREDIT_EXCEEDS_PRICE } from '../lib/finance/saleLotSwap';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function testReasonRequired() {
  assert(!validateLotSwapReason('').ok, 'motivo vazio recusa');
  assert(!validateLotSwapReason('ab').ok, 'motivo curto recusa');
  assert(validateLotSwapReason('ab').code === LOT_SWAP_REASON_REQUIRED, 'código motivo');
  assert(validateLotSwapReason('Cliente pediu unidade maior').ok, 'motivo válido');
  console.log('OK testReasonRequired');
}

function testPlanClassifiesReceiptsAndCharges() {
  const plan = buildLotSwapFinancialPlan({
    oldSalePrice: 100000,
    newLotPrice: 120000,
    receipts: [
      {
        id: 'r-paid',
        installment_number: 0,
        status: 'pago',
        amount: 20000,
        due_date: '2026-01-10',
      },
      {
        id: 'r-future',
        installment_number: 1,
        status: 'pendente',
        amount: 5000,
        due_date: '2026-10-10',
      },
      {
        id: 'r-canceled',
        installment_number: 9,
        status: 'cancelado',
        amount: 1,
      },
    ],
    balloons: [{ installment_number: 12, additional_amount: 500, due_date: '2027-09-10' }],
    asaasCharges: [
      { id: 'asaas-open', installment_id: 'r-future', status: 'PENDING' },
      { id: 'asaas-paid', installment_id: 'r-paid', status: 'RECEIVED' },
    ],
    interCharges: [{ id: 'inter-open', finance_receipt_id: 'r-future', status: 'PENDING' }],
    correctionLabel: 'Parcelas fixas',
    financialAccountName: 'Conta principal',
    asOf: '2026-09-06',
  });
  assert(plan.status === 'CALCULATED', 'status do plano');
  assert(plan.mutation === false && plan.execute === false, 'sem execução');
  assert(plan.receipts.preserve.length === 1, 'paga preservada');
  assert(plan.receipts.cancel.length === 1, 'pendente será cancelada depois');
  assert(plan.receipts.create.length === 1, 'nova parcela planejada');
  assert(plan.receipts.create[0].receiptId === null, 'nova parcela ainda não existe');
  assert(plan.receipts.create[0].amount === 100000, 'novo saldo 120000-20000');
  assert(plan.receipts.create[0].dueDate === '2026-10-10', 'reusa vencimento futuro');
  assert(plan.receipts.ignoredCanceled === 1, 'cancelada ignorada');
  assert(plan.balloons.length === 1, 'balão no snapshot');
  assert(plan.charges.asaasOpen.length === 1, 'Asaas aberta na Fase 5');
  assert(plan.charges.asaasPaid.length === 1, 'Asaas paga preservada');
  assert(plan.charges.interOpen.length === 1, 'Inter aberta na Fase 5');
  assert(plan.schedule.financialAccountName === 'Conta principal', 'conta financeira');
  assertLotSwapPlanPersistable(plan, 'Troca para lote de esquina');
  console.log('OK testPlanClassifiesReceiptsAndCharges');
}

function testBlockedPlanIsNotPersistable() {
  const plan = buildLotSwapFinancialPlan({
    oldSalePrice: 100000,
    newLotPrice: 50000,
    receipts: [
      { id: 'r1', installment_number: 0, status: 'pago', amount: 80000 },
    ],
  });
  assert(plan.blocked, 'crédito excede preço');
  assert(plan.receipts.create.length === 0, 'não planeja novas parcelas se bloqueado');
  let threw = false;
  try {
    assertLotSwapPlanPersistable(plan, 'Motivo suficiente');
  } catch (err) {
    threw = err instanceof Error && err.message === LOT_SWAP_CREDIT_EXCEEDS_PRICE;
  }
  assert(threw, 'persistência recusa saldo negativo');
  console.log('OK testBlockedPlanIsNotPersistable');
}

function testSourceIsolation() {
  const plan = read('lib/finance/saleLotSwapPlan.ts');
  const svc = read('lib/finance/saleLotSwapPlanService.ts');
  const route = read('app/api/sales/[saleId]/lot-swap/plan/route.ts');
  const ui = read('components/map/LotSwapPreviewPanel.tsx');
  const previewSvc = read('lib/finance/saleLotSwapPreviewService.ts');
  for (const [name, src] of [
    ['plan', plan],
    ['svc', svc],
    ['route', route],
    ['ui', ui],
  ] as const) {
    assert(!src.includes('retention_percent'), `${name} sem retenção`);
    assert(!src.includes('calculateTerminationSettlement'), `${name} sem settlement`);
    assert(!src.includes('releaseLotService'), `${name} sem ReleaseLot`);
    assert(!src.includes('executeLotSwap'), `${name} sem executor`);
  }
  assert(!/\.from\('sales'\)[\s\S]{0,80}\.update\(/.test(svc), 'não atualiza sales');
  assert(!/\.from\('blocks'\)[\s\S]{0,80}\.update\(/.test(svc), 'não atualiza blocks');
  assert(!/\.from\('finance_receipts'\)/.test(svc), 'não toca receipts');
  assert(!/\.from\('contracts'\)/.test(svc), 'não toca contratos');
  assert(!/\.from\('company_asaas_charges'\)/.test(svc), 'não toca Asaas');
  assert(!/\.from\('bank_charges'\)/.test(svc), 'não toca Inter');
  assert(svc.includes(".from(SALE_LOT_SWAP_TABLE)"), 'grava só sale_lot_swaps');
  assert(svc.includes("status: LOT_SWAP_PLAN_STATUS"), 'status CALCULATED');
  assert(!svc.includes("status: 'EXECUTING'"), 'não marca EXECUTING');
  assert(!svc.includes("status: 'EXECUTED'"), 'não marca EXECUTED');
  assert(route.includes('execute: false'), 'API declara sem execução');
  assert(ui.includes('Confirmar plano (sem executar)'), 'botão sem executar');
  assert(ui.includes('/lot-swap/plan'), 'POST do plano');
  assert(previewSvc.includes('buildLotSwapFinancialPlan'), 'GET monta o plano');
  assert(!/\.insert\(/.test(previewSvc), 'GET preview continua sem INSERT');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  const handleSubmit = modal.slice(
    modal.indexOf('const handleSubmit'),
    modal.indexOf('if (!mounted)'),
  );
  assert(!handleSubmit.includes('/lot-swap'), 'submit do modal não executa troca');
  assert(isSaleLotSwapOperation('troca_lote'), 'código da operação');
  assert(!isLotReleaseSaleOperation('troca_lote'), 'não é release');
  assert(!showsTerminationSettlement('troca_lote'), 'sem settlement');
  assert(!isSaleReleaseSettlementOperation('troca_lote'), 'sem persistência de rescisão');
  assert(!isDeferredSaleOperation('troca_lote'), 'tem fluxo próprio');
  assert(LOT_SWAP_PLAN_FORBIDDEN_MUTATION_TABLES.includes('sales'), 'lista de tabelas proibidas');
  const mundo = read('lib/mundoNovoContractSellers.ts');
  assert(mundo.includes('seller_parties_json') || read('lib/project-form.ts').includes('seller_parties_json'), 'Mundo Novo intacto');
  assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'DEVELOP');
  assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'Production');
  console.log('OK testSourceIsolation');
}

type MockRow = Record<string, unknown>;

function planDb() {
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
        area: 200,
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
    company_asaas_charges: [
      { id: 'asaas-1', sale_id: 'sale-real-uuid', installment_id: 'r2', status: 'PENDING' },
    ],
    bank_charges: [],
    sale_lot_swaps: [] as MockRow[],
  };
}

const SALES_COLS = new Set([
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

class PlanQuery {
  private cols = '*';
  private eqFilters: Record<string, unknown> = {};
  private neqFilters: Record<string, unknown> = {};
  private inFilters: Record<string, unknown[]> = {};
  private nullKeys: string[] = [];
  private insertRow: MockRow | null = null;
  private updatePatch: MockRow | null = null;

  constructor(
    private db: ReturnType<typeof planDb>,
    private table: string,
    private writes: { table: string; op: 'insert' | 'update' | 'delete' }[],
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
  in(key: string, values: unknown[]) {
    this.inFilters[key] = values;
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
  insert(row: MockRow) {
    this.writes.push({ table: this.table, op: 'insert' });
    this.insertRow = { id: 'swap-1', ...row };
    return this;
  }
  update(row: MockRow) {
    this.writes.push({ table: this.table, op: 'update' });
    this.updatePatch = row;
    return this;
  }
  delete() {
    this.writes.push({ table: this.table, op: 'delete' });
    return this;
  }

  private salesError() {
    if (this.table !== 'sales' || this.cols === '*') return null;
    const missing = this.cols
      .split(',')
      .map((part) => part.trim())
      .find((col) => col && !SALES_COLS.has(col));
    if (!missing) return null;
    return { message: `Could not find the '${missing}' column of 'sales' in the schema cache` };
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
      for (const [key, values] of Object.entries(this.inFilters)) {
        if (!values.map(String).includes(String(row[key] ?? ''))) return false;
      }
      for (const key of this.nullKeys) {
        if (row[key] != null) return false;
      }
      return true;
    });
  }

  async maybeSingle() {
    if (this.insertRow) {
      (this.db.sale_lot_swaps as MockRow[]).push(this.insertRow);
      return { data: this.insertRow, error: null };
    }
    if (this.updatePatch) {
      const current = this.rows()[0];
      if (!current) return { data: null, error: { message: 'not found' } };
      Object.assign(current, this.updatePatch);
      return { data: current, error: null };
    }
    const error = this.salesError();
    if (error) return { data: null, error };
    return { data: this.rows()[0] || null, error: null };
  }

  then<T>(
    resolve?: ((value: { data: MockRow[] | null; error: { message: string } | null }) => T) | null,
    reject?: ((reason: unknown) => T) | null,
  ) {
    return this.execute().then(resolve as never, reject as never);
  }

  async execute() {
    const error = this.salesError();
    if (error) return { data: null, error };
    return { data: this.rows(), error: null };
  }
}

function createPlanAdmin(db = planDb()) {
  const writes: { table: string; op: 'insert' | 'update' | 'delete' }[] = [];
  return {
    writes,
    from(table: string) {
      return new PlanQuery(db, table, writes);
    },
  };
}

async function testPreviewPlanAndPersistCalculated() {
  const admin = createPlanAdmin();
  const preview = await loadSaleLotSwapPreview(admin as never, {
    saleId: 'sale-real-uuid',
    userId: 'user-1',
    toBlockId: 'block-avail',
  });
  assert(preview.comparison?.plan.receipts.preserve.length === 1, 'preview identifica pagos');
  assert(preview.comparison?.plan.receipts.cancel.length === 1, 'preview identifica pendentes');
  assert(preview.comparison?.plan.receipts.create.length === 1, 'preview planeja novos');
  assert(preview.comparison?.plan.charges.asaasOpen.length === 1, 'preview identifica Asaas aberta');
  assert(preview.mutation === false, 'GET sem mutação');

  try {
    await prepareSaleLotSwapPlan(admin as never, {
      saleId: 'sale-real-uuid',
      userId: 'user-1',
      toBlockId: 'block-avail',
      reason: '',
    });
    throw new Error('deveria exigir motivo');
  } catch (err) {
    assert(
      err instanceof Error && String((err as { code?: string }).code || err.message).includes('REASON'),
      'motivo obrigatório no persist',
    );
  }

  const prepared = await prepareSaleLotSwapPlan(admin as never, {
    saleId: 'sale-real-uuid',
    userId: 'user-1',
    toBlockId: 'block-avail',
    reason: 'Cliente solicitou lote de esquina',
  });
  assert(prepared.status === LOT_SWAP_PLAN_STATUS, 'CALCULATED');
  assert(prepared.execute === false, 'sem execução');
  assert(prepared.swapId === 'swap-1', 'id do plano');
  assert(prepared.plan.financials.new_balance === 100000, 'resumo financeiro');
  assert(prepared.lotsUnchanged && prepared.receiptsUnchanged, 'lotes e parcelas intactos');
  const mutated = new Set(admin.writes.map((w) => `${w.table}:${w.op}`));
  assert(mutated.has('sale_lot_swaps:insert'), 'inseriu sale_lot_swaps');
  for (const table of LOT_SWAP_PLAN_FORBIDDEN_MUTATION_TABLES) {
    assert(!mutated.has(`${table}:insert`), `${table} sem insert`);
    assert(!mutated.has(`${table}:update`), `${table} sem update`);
    assert(!mutated.has(`${table}:delete`), `${table} sem delete`);
  }
  console.log('OK testPreviewPlanAndPersistCalculated');
}

testReasonRequired();
testPlanClassifiesReceiptsAndCharges();
testBlockedPlanIsNotPersistable();
testSourceIsolation();

async function main() {
  await testPreviewPlanAndPersistCalculated();
  console.log('OK mandatory-sale-lot-swap-plan-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
