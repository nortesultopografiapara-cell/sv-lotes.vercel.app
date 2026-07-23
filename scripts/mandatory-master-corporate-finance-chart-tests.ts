/**
 * Testes — agregação mensal do gráfico corporativo (pós-6.4).
 * npx tsx scripts/mandatory-master-corporate-finance-chart-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  aggregateCorporateCashMonthlyFromRows,
  pnlCashEffect,
} from '../lib/master/corporateFinance/cashMath';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testJuly2026Fixture() {
  const rows = [
    {
      movement_date: '2026-07-10',
      type: 'INCOME',
      amount: '4000.00', // string como Supabase
      is_reversed: false,
      origin: 'RECEIVABLE_PAYMENT',
      notes: null,
    },
    {
      movement_date: '2026-07-12',
      type: 'EXPENSE',
      amount: 300,
      is_reversed: false,
      origin: 'PAYABLE_PAYMENT',
      notes: null,
    },
    {
      movement_date: '2026-07-15',
      type: 'EXPENSE',
      amount: '500',
      is_reversed: false,
      origin: 'BACKFILL_PAYABLE',
      notes: null,
    },
    {
      movement_date: '2026-07-20',
      type: 'TRANSFER_OUT',
      amount: 1000,
      is_reversed: false,
      origin: 'ACCOUNT_TRANSFER',
      notes: null,
    },
    {
      movement_date: '2026-07-20',
      type: 'TRANSFER_IN',
      amount: 1000,
      is_reversed: false,
      origin: 'ACCOUNT_TRANSFER',
      notes: null,
    },
    // outro ano não contamina
    {
      movement_date: '2025-07-10',
      type: 'INCOME',
      amount: 9999,
      is_reversed: false,
      origin: 'RECEIVABLE_PAYMENT',
      notes: null,
    },
  ];

  const agg = aggregateCorporateCashMonthlyFromRows(rows, 2026);
  assert(agg.months.length === 12, '12 meses');
  assert(agg.months[0]!.month === 1 && agg.months[11]!.month === 12, 'Jan..Dez');

  const jul = agg.months[6]!;
  assert(jul.income === 4000, `jul income 4000 got ${jul.income}`);
  assert(jul.expense === 800, `jul expense 800 got ${jul.expense}`);
  assert(jul.result === 3200, `jul result 3200 got ${jul.result}`);
  assert(jul.net === 3200, 'jul net = result');
  assert(agg.totals.income === 4000, 'total income');
  assert(agg.totals.expense === 800, 'total expense');
  assert(agg.totals.result === 3200, 'total result 3200');
}

function testBackfillAndReversal() {
  const income = pnlCashEffect({
    type: 'INCOME',
    amount: 100,
    is_reversed: false,
    origin: 'BACKFILL_RECEIVABLE',
  });
  assert(income.income === 100, 'backfill receivable em receita');

  const reversed = pnlCashEffect({
    type: 'INCOME',
    amount: 100,
    is_reversed: true,
    origin: 'RECEIVABLE_PAYMENT',
  });
  assert(reversed.income === 0 && reversed.expense === 0, 'original estornado ignora');

  const rev = pnlCashEffect({
    type: 'REVERSAL',
    amount: 100,
    is_reversed: false,
    origin: 'REVERSAL',
    notes: '[REV:INCOME] motivo',
  });
  assert(rev.income === -100, 'reversão anula receita');

  const transfer = pnlCashEffect({
    type: 'TRANSFER_IN',
    amount: 50,
    is_reversed: false,
    origin: 'ACCOUNT_TRANSFER',
  });
  assert(transfer.income === 0 && transfer.expense === 0, 'transferência fora do P&L');
}

function testDashboardWiring() {
  const dash = read('components/master/dashboard/MasterExecutiveDashboard.tsx');
  assert(
    dash.includes('/api/master/corporate-finance/cash-movements/monthly'),
    'dashboard busca monthly via API',
  );
  assert(!dash.includes('forceEmpty'), 'sem forceEmpty no gráfico topografia');
  assert(dash.includes('saasMonthlyFinancials'), 'gráfico SaaS intacto');

  const math = read('lib/master/corporateFinance/cashMath.ts');
  assert(math.includes('aggregateCorporateCashMonthlyFromRows'), 'função pura');
  assert(math.includes('CORPORATE_PNL_INCOME_ORIGINS'), 'whitelist receita');
  assert(math.includes('BACKFILL_RECEIVABLE'), 'backfill AR');
  assert(math.includes('BACKFILL_PAYABLE'), 'backfill AP');
}

function main() {
  console.log('=== corporate chart aggregation tests ===');
  testJuly2026Fixture();
  console.log('OK july fixture 4000/800/3200');
  testBackfillAndReversal();
  console.log('OK backfill/reversal/transfer');
  testDashboardWiring();
  console.log('OK dashboard wiring');
  console.log('ALL PASS');
}

main();
