/**
 * Testes obrigatórios — backfill AR/AP → caixa corporativo.
 * npx tsx scripts/mandatory-master-corporate-finance-cash-backfill-tests.ts
 */
import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { backfillCashMovements } from '../lib/master/corporateFinance/cashMovementsService';
import { aggregateCorporateCashMonthlyFromRows } from '../lib/master/corporateFinance/cashMath';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

type Row = Record<string, unknown>;

type Store = {
  accounts: Row[];
  receivables: Row[];
  payables: Row[];
  receivablePayments: Row[];
  payablePayments: Row[];
  movements: Row[];
  users: Row[];
  auditLogs: Row[];
  movSeq: number;
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function tableRows(store: Store, table: string): Row[] {
  switch (table) {
    case 'master_corporate_financial_accounts':
      return store.accounts;
    case 'master_corporate_receivables':
      return store.receivables;
    case 'master_corporate_payables':
      return store.payables;
    case 'master_corporate_receivable_payments':
      return store.receivablePayments;
    case 'master_corporate_payable_payments':
      return store.payablePayments;
    case 'master_corporate_cash_movements':
      return store.movements;
    case 'users':
      return store.users;
    case 'audit_logs':
      return store.auditLogs;
    default:
      return [];
  }
}

type Filter = (row: Row) => boolean;

class QueryBuilder {
  private filters: Filter[] = [];
  private limitN: number | null = null;
  private insertRows: Row[] | null = null;
  private wantSingle = false;
  private wantMaybe = false;

  constructor(
    private store: Store,
    private table: string,
  ) {}

  select(_cols?: string) {
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }

  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }

  in(col: string, vals: unknown[]) {
    const set = new Set(vals.map(String));
    this.filters.push((r) => set.has(String(r[col])));
    return this;
  }

  order(_col: string, _opts?: { ascending?: boolean }) {
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.insertRows = Array.isArray(payload) ? payload.map(clone) : [clone(payload)];
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantMaybe = true;
    return this;
  }

  private applyFilters(rows: Row[]) {
    let out = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.limitN != null) out = out.slice(0, this.limitN);
    return out;
  }

  private execute(): { data: unknown; error: { message: string; code?: string } | null } {
    if (this.insertRows) {
      const target = tableRows(this.store, this.table);
      const inserted: Row[] = [];
      for (const row of this.insertRows) {
        if (this.table === 'master_corporate_cash_movements') {
          const key = row.idempotency_key ? String(row.idempotency_key) : null;
          if (key && target.some((m) => m.idempotency_key === key)) {
            return {
              data: null,
              error: { message: 'duplicate key', code: '23505' },
            };
          }
          const id = `mov-${++this.store.movSeq}`;
          const full = {
            id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_reversed: false,
            reversed_at: null,
            reversed_by: null,
            ...row,
          };
          target.push(full);
          inserted.push(full);
        } else {
          const full = { id: `row-${Math.random().toString(36).slice(2, 8)}`, ...row };
          target.push(full);
          inserted.push(full);
        }
      }
      if (this.wantSingle || this.wantMaybe) {
        return { data: inserted[0] || null, error: null };
      }
      return { data: inserted, error: null };
    }

    const rows = this.applyFilters(tableRows(this.store, this.table).map(clone));
    if (this.wantSingle) {
      if (rows.length !== 1) {
        return { data: null, error: { message: 'single() expected 1 row' } };
      }
      return { data: rows[0], error: null };
    }
    if (this.wantMaybe) {
      return { data: rows[0] || null, error: null };
    }
    return { data: rows, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string; code?: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

function createMockClient(store: Store): SupabaseClient {
  return {
    from(table: string) {
      return new QueryBuilder(store, table);
    },
    rpc(fn: string) {
      if (fn === 'generate_next_corporate_cash_movement_code') {
        const year = new Date().getFullYear();
        const n = String(store.movSeq + 1).padStart(4, '0');
        return Promise.resolve({ data: `MOV-${year}-${n}`, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `rpc ${fn} missing` } });
    },
  } as unknown as SupabaseClient;
}

function seedPreviewLikeStore(opts?: { noAccount?: boolean }): Store {
  const accountId = 'acc-default';
  const catIncome = 'cat-income';
  const catExpense = 'cat-expense';
  return {
    accounts: opts?.noAccount
      ? []
      : [
          {
            id: accountId,
            name: 'Caixa Principal',
            is_active: true,
            is_default: true,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
    receivables: [
      {
        id: 'rec-1',
        code: 'REC-2026-0001',
        category_id: catIncome,
        cost_center_id: null,
        project_id: 'proj-1',
        quote_id: null,
        competence_date: '2026-07-01',
        customer_name: 'Cliente Teste',
      },
    ],
    payables: [
      {
        id: 'pay-1',
        code: 'PAG-2026-0001',
        category_id: catExpense,
        cost_center_id: null,
        project_id: 'proj-1',
        competence_date: '2026-07-01',
        supplier_name: 'Fornecedor A',
        description: 'Despesa A',
      },
      {
        id: 'pay-2',
        code: 'PAG-2026-0002',
        category_id: catExpense,
        cost_center_id: null,
        project_id: null,
        competence_date: '2026-07-01',
        supplier_name: 'Fornecedor B',
        description: 'Despesa B',
      },
    ],
    receivablePayments: [
      {
        id: 'rp-4000',
        receivable_id: 'rec-1',
        financial_account_id: accountId,
        payment_date: '2026-07-10',
        amount: 4000,
        payment_method: 'PIX',
        reference: null,
        notes: null,
        is_reversed: false,
      },
      // estornado — não elegível
      {
        id: 'rp-rev',
        receivable_id: 'rec-1',
        financial_account_id: accountId,
        payment_date: '2026-07-11',
        amount: 99,
        payment_method: 'PIX',
        reference: null,
        notes: null,
        is_reversed: true,
      },
    ],
    payablePayments: [
      {
        id: 'pp-300',
        payable_id: 'pay-1',
        financial_account_id: accountId,
        payment_date: '2026-07-12',
        amount: 300,
        payment_method: 'PIX',
        reference: null,
        notes: null,
        is_reversed: false,
      },
      {
        id: 'pp-500',
        payable_id: 'pay-2',
        financial_account_id: null, // força fallback conta padrão
        payment_date: '2026-07-15',
        amount: 500,
        payment_method: 'TED',
        reference: null,
        notes: null,
        is_reversed: false,
      },
      {
        id: 'pp-rev',
        payable_id: 'pay-1',
        financial_account_id: accountId,
        payment_date: '2026-07-16',
        amount: 50,
        payment_method: 'PIX',
        reference: null,
        notes: null,
        is_reversed: true,
      },
    ],
    movements: [],
    users: [],
    auditLogs: [],
    movSeq: 0,
  };
}

function testStaticContracts() {
  const svc = read('lib/master/corporateFinance/cashMovementsService.ts');
  assert(svc.includes('wouldCreate'), 'report wouldCreate');
  assert(svc.includes('eligible'), 'report eligible');
  assert(svc.includes('failed'), 'report failed');
  assert(svc.includes('resolveDefaultCorporateAccount'), 'conta padrão');
  assert(svc.includes('BACKFILL_RECEIVABLE'), 'origin backfill AR');
  assert(svc.includes('BACKFILL_PAYABLE'), 'origin backfill AP');
  assert(svc.includes('RECEIVABLE_PAYMENT:'), 'idempotency AR');
  assert(svc.includes('PAYABLE_PAYMENT:'), 'idempotency AP');

  const ui = read('components/master/corporateFinance/CorporateCashFlowPage.tsx');
  assert(ui.includes('formatBackfillReport'), 'UI relatório detalhado');
  assert(ui.includes('confirmAndExecuteBackfill'), 'UI confirmação');
  assert(ui.includes('wouldCreate'), 'UI dry-run wouldCreate');
  assert(ui.includes('corporate-finance-cash-updated'), 'evento refresh');

  const route = read(
    'app/api/master/corporate-finance/cash-movements/backfill/route.ts',
  );
  assert(route.includes('authorizeCorporateFinance'), 'auth backfill');
  assert(route.includes('getCorporateFinanceServiceClient'), 'service role');
  assert(route.includes('dryRun'), 'dryRun obrigatório');
}

async function testDryRunNoWrite() {
  const store = seedPreviewLikeStore();
  const client = createMockClient(store);
  const report = await backfillCashMovements(client, { dryRun: true, userId: null });
  assert(report.dryRun === true, 'dryRun flag');
  assert(report.found === 3, `found=3 got ${report.found}`);
  assert(report.eligible === 3, `eligible=3 got ${report.eligible}`);
  assert(report.wouldCreate === 3, `wouldCreate=3 got ${report.wouldCreate}`);
  assert(report.created === 0, 'dry-run created=0');
  assert(store.movements.length === 0, 'dry-run não escreve movimentos');
}

async function testExecuteCreatesThreeAndIdempotent() {
  const store = seedPreviewLikeStore();
  const client = createMockClient(store);

  const first = await backfillCashMovements(client, { dryRun: false, userId: 'u1' });
  assert(first.created === 3, `created=3 got ${first.created}`);
  assert(first.failed === 0, `failed=0 got ${first.failed}`);
  assert(store.movements.length === 3, '3 movimentos no store');

  const incomes = store.movements.filter((m) => m.type === 'INCOME');
  const expenses = store.movements.filter((m) => m.type === 'EXPENSE');
  assert(incomes.length === 1, '1 entrada');
  assert(expenses.length === 2, '2 saídas');
  assert(Number(incomes[0]!.amount) === 4000, 'entrada 4000');
  const expenseSum = expenses.reduce((s, m) => s + Number(m.amount), 0);
  assert(expenseSum === 800, `saídas 800 got ${expenseSum}`);
  assert(
    incomes[0]!.origin === 'BACKFILL_RECEIVABLE',
    'origin BACKFILL_RECEIVABLE',
  );
  assert(
    expenses.every((m) => m.origin === 'BACKFILL_PAYABLE'),
    'origin BACKFILL_PAYABLE',
  );
  assert(incomes[0]!.project_id === 'proj-1', 'project_id preservado');
  assert(incomes[0]!.receivable_id === 'rec-1', 'receivable_id');
  assert(incomes[0]!.category_id === 'cat-income', 'category_id');
  assert(String(incomes[0]!.movement_date).startsWith('2026-07-10'), 'payment_date');

  const second = await backfillCashMovements(client, { dryRun: false, userId: 'u1' });
  assert(second.created === 0, '2ª execução created=0');
  assert(second.skipped === 3, `skipped=3 got ${second.skipped}`);
  assert(store.movements.length === 3, 'sem duplicados');
}

async function testMissingDefaultAccount() {
  const store = seedPreviewLikeStore({ noAccount: true });
  const client = createMockClient(store);
  let msg = '';
  try {
    await backfillCashMovements(client, { dryRun: true, userId: null });
  } catch (err) {
    msg = err instanceof Error ? err.message : String(err);
  }
  assert(msg.includes('conta financeira'), `erro claro conta: ${msg}`);
  assert(store.movements.length === 0, 'sem escrita sem conta');
}

async function testReversedPaymentNotMaterialized() {
  const store = seedPreviewLikeStore();
  // já existe movimento estornado para um pagamento ativo — não recria
  store.movements.push({
    id: 'mov-existing',
    code: 'MOV-2026-0001',
    movement_date: '2026-07-10',
    competence_date: '2026-07-01',
    type: 'INCOME',
    amount: 4000,
    description: 'Recebimento REC-2026-0001',
    financial_account_id: 'acc-default',
    category_id: 'cat-income',
    cost_center_id: null,
    project_id: 'proj-1',
    quote_id: null,
    receivable_id: 'rec-1',
    receivable_payment_id: 'rp-4000',
    payable_id: null,
    payable_payment_id: null,
    origin: 'RECEIVABLE_PAYMENT',
    payment_method: 'PIX',
    reference: null,
    notes: null,
    idempotency_key: 'RECEIVABLE_PAYMENT:rp-4000',
    is_reversed: true,
    created_at: '2026-07-10T12:00:00Z',
    updated_at: '2026-07-10T13:00:00Z',
    created_by: null,
  });
  store.movSeq = 1;

  const client = createMockClient(store);
  const report = await backfillCashMovements(client, { dryRun: false, userId: null });
  assert(report.skipped >= 1, 'pagamento com movimento (mesmo estornado) é skipped');
  const incomesForPayment = store.movements.filter(
    (m) => m.receivable_payment_id === 'rp-4000',
  );
  assert(incomesForPayment.length === 1, 'não recria movimento estornado');
  assert(report.created === 2, `cria só as 2 saídas got ${report.created}`);
}

async function testMonthlyChartFromBackfill() {
  const store = seedPreviewLikeStore();
  const client = createMockClient(store);
  await backfillCashMovements(client, { dryRun: false, userId: null });

  const agg = aggregateCorporateCashMonthlyFromRows(
    store.movements.map((m) => ({
      movement_date: String(m.movement_date),
      type: String(m.type),
      amount: m.amount as number | string,
      is_reversed: Boolean(m.is_reversed),
      origin: String(m.origin),
      notes: m.notes ? String(m.notes) : null,
    })),
    2026,
  );
  const jul = agg.months[6]!;
  assert(jul.income === 4000, `jul receita 4000 got ${jul.income}`);
  assert(jul.expense === 800, `jul despesa 800 got ${jul.expense}`);
  assert(jul.result === 3200, `jul resultado 3200 got ${jul.result}`);
}

async function main() {
  console.log('=== Corporate cash backfill tests ===');
  testStaticContracts();
  console.log('OK static');
  await testDryRunNoWrite();
  console.log('OK dry-run');
  await testExecuteCreatesThreeAndIdempotent();
  console.log('OK execute + idempotent');
  await testMissingDefaultAccount();
  console.log('OK missing account');
  await testReversedPaymentNotMaterialized();
  console.log('OK reversed not recreated');
  await testMonthlyChartFromBackfill();
  console.log('OK monthly chart');
  console.log('ALL PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
