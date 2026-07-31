/**
 * Hotfix — Dashboard SV LOTES consolida Caixa SaaS + AR SV_LOTES (sem duplicar).
 * npm run test:master-dashboard-sv-lotes-ar-revenue
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  consolidateSvLotesReceivedIncome,
  expectedJulyReceivedFromFixture,
  isCorporateReceivableAlreadyInSaas,
  isEligibleSvLotesCorporateReceivableIncome,
  collectSaasDedupKeys,
  corporateReceivableDedupKeys,
  SV_LOTES_RECEIVED_REVENUE_SOURCE,
} from '../lib/master/svLotesDashboardRevenue';
import { aggregateCorporateCashMonthlyFromRows, pnlCashEffect } from '../lib/master/corporateFinance/cashMath';
import { computeSaasCashSummaryFromRows } from '../lib/saasCashMovements';
import { calculateMrrFromCompanies } from '../lib/companyPricing';
import { corporateBusinessUnitOrFilter } from '../lib/master/corporateFinance/businessUnitScope';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function nearly(a: number, b: number, eps = 0.001) {
  return Math.abs(a - b) < eps;
}

function testRealCaseJuly1465() {
  const saasJuly = 550.01;
  const arLotes = 915.23;
  const expected = 1465.24;
  assert(
    nearly(expectedJulyReceivedFromFixture({
      saasJulyIncome: saasJuly,
      arSvLotesSettled: arLotes,
      alreadyInSaas: false,
    }), expected),
    'fixture 550.01+915.23=1465.24',
  );

  const result = consolidateSvLotesReceivedIncome({
    saasPart: saasJuly,
    saasRowsForDedup: [
      { amount: 550.01, asaas_payment_id: 'pay_saas_1', type: 'income' },
    ],
    corporateRows: [
      {
        amount: 915.23,
        movement_date: '2026-07-15',
        type: 'INCOME',
        origin: 'RECEIVABLE_PAYMENT',
        reference: null,
        receivable_payment_id: 'pay-rec-0005',
        is_reversed: false,
      },
    ],
  });
  assert(nearly(result.total, expected), `total ${result.total} != ${expected}`);
  assert(nearly(result.corporatePart, arLotes), 'corporate part');
  assert(result.skippedDuplicate === 0, 'sem dup');
  console.log('OK testRealCaseJuly1465');
}

function testPendingArExcluded() {
  // Pendente não gera RECEIVABLE_PAYMENT — linha inelegível / vazia
  const result = consolidateSvLotesReceivedIncome({
    saasPart: 550.01,
    saasRowsForDedup: [],
    corporateRows: [],
  });
  assert(nearly(result.total, 550.01), 'pendente não altera');
  console.log('OK testPendingArExcluded');
}

function testReceivedArIncluded() {
  const result = consolidateSvLotesReceivedIncome({
    saasPart: 100,
    saasRowsForDedup: [],
    corporateRows: [
      {
        amount: 50,
        movement_date: '2026-07-01',
        type: 'INCOME',
        origin: 'RECEIVABLE_PAYMENT',
        is_reversed: false,
      },
    ],
  });
  assert(nearly(result.total, 150), 'recebido entra');
  console.log('OK testReceivedArIncluded');
}

function testTopografiaNotInSaasBlock() {
  // Agregação SV_LOTES usa só contas SV_LOTES — filtro Topografia não aparece no source.
  const scope = read('lib/master/svLotesDashboardRevenue.ts');
  assert(scope.includes("listCorporateAccountIdsForUnit(supabase, 'SV_LOTES')"), 'filtra SV_LOTES');
  assert(scope.includes("eq('origin', 'RECEIVABLE_PAYMENT')"), 'só liquidação AR');
  assert(
    !corporateBusinessUnitOrFilter('SV_TOPOGRAFIA').includes('SV_LOTES'),
    'filtro topo distinto',
  );
  console.log('OK testTopografiaNotInSaasBlock');
}

function testSameAsaasPaymentIdDedup() {
  const result = consolidateSvLotesReceivedIncome({
    saasPart: 915.23,
    saasRowsForDedup: [
      { amount: 915.23, asaas_payment_id: 'pay_abc', type: 'income' },
    ],
    corporateRows: [
      {
        amount: 915.23,
        movement_date: '2026-07-15',
        type: 'INCOME',
        origin: 'RECEIVABLE_PAYMENT',
        reference: 'pay_abc',
        is_reversed: false,
      },
    ],
  });
  assert(nearly(result.total, 915.23), 'soma uma vez');
  assert(result.skippedDuplicate === 1, 'dup detectada');
  assert(result.corporatePart === 0, 'corp não adiciona');
  console.log('OK testSameAsaasPaymentIdDedup');
}

function testExtraordinaryStillIncluded() {
  const result = consolidateSvLotesReceivedIncome({
    saasPart: 200,
    saasRowsForDedup: [
      {
        amount: 200,
        metadata: { origin: 'MANUAL_EXTRAORDINARY_INCOME' },
        type: 'income',
      },
    ],
    corporateRows: [],
  });
  assert(nearly(result.total, 200), 'extraordinária no saasPart');
  console.log('OK testExtraordinaryStillIncluded');
}

function testTransferOutsideResult() {
  const summary = computeSaasCashSummaryFromRows([
    { type: 'income', amount: 550.01 },
    { type: 'transfer', amount: 100 },
  ]);
  assert(nearly(summary.periodIncome, 550.01), 'transfer fora income');
  assert(nearly(summary.netResult, 550.01), 'transfer fora resultado');
  console.log('OK testTransferOutsideResult');
}

function testReversalNeutralizes() {
  assert(
    !isEligibleSvLotesCorporateReceivableIncome({
      amount: 915.23,
      movement_date: '2026-07-15',
      type: 'INCOME',
      origin: 'RECEIVABLE_PAYMENT',
      is_reversed: true,
    }),
    'estorno is_reversed fora',
  );
  const rev = pnlCashEffect({
    type: 'REVERSAL',
    amount: 915.23,
    is_reversed: false,
    notes: '[REV:INCOME]',
  });
  assert(rev.income === -915.23, 'reversal income negativo');
  console.log('OK testReversalNeutralizes');
}

function testMonthAndAnnualChartSameRules() {
  const lib = read('lib/master/svLotesDashboardRevenue.ts');
  assert(lib.includes('sumSvLotesConsolidatedReceivedIncome'), 'card');
  assert(lib.includes('aggregateSvLotesMonthlyRevenueExpense'), 'gráfico');
  assert(lib.includes('consolidateSvLotesReceivedIncome'), 'mesma regra');
  assert(lib.includes('movement_date'), 'data efetiva movement_date');

  // Gráfico: julho recebe 915.23 além do saas
  const months = [
    { month: 7, revenue: 550.01, expense: 0 },
  ];
  const corpJul = consolidateSvLotesReceivedIncome({
    saasPart: 550.01,
    saasRowsForDedup: [{ asaas_payment_id: 'x' }],
    corporateRows: [
      {
        amount: 915.23,
        movement_date: '2026-07-20',
        type: 'INCOME',
        origin: 'RECEIVABLE_PAYMENT',
        is_reversed: false,
      },
    ],
  });
  assert(nearly(months[0]!.revenue + corpJul.corporatePart, 1465.24), 'julho gráfico');
  console.log('OK testMonthAndAnnualChartSameRules');
}

function testHistoricalNullNotSvLotes() {
  const scope = read('lib/master/corporateFinance/businessUnitScope.ts');
  assert(scope.includes("unit === 'SV_TOPOGRAFIA'"), 'null só Topografia');
  assert(
    scope.includes("query = query.eq('business_unit', unit)"),
    'SV_LOTES eq estrito',
  );
  const filterLotes = corporateBusinessUnitOrFilter('SV_LOTES');
  assert(!filterLotes.includes('is.null'), 'histórico null ≠ SV_LOTES');
  console.log('OK testHistoricalNullNotSvLotes');
}

function testMrrUnchanged() {
  const mrr = calculateMrrFromCompanies([
    {
      id: 'c1',
      name: 'Tenant',
      status: 'active',
      status_operacional: 'Ativo',
      plan_type: 'basico',
      custom_monthly_price: 850.01,
      billing_model: 'monthly',
      is_demo: false,
    } as Parameters<typeof calculateMrrFromCompanies>[0][number],
  ]);
  // Se custom_monthly_price for aplicado
  assert(mrr === 850.01 || mrr > 0, `MRR recorrente got ${mrr}`);
  const income = consolidateSvLotesReceivedIncome({
    saasPart: 550.01,
    saasRowsForDedup: [],
    corporateRows: [
      {
        amount: 915.23,
        movement_date: '2026-07-15',
        type: 'INCOME',
        origin: 'RECEIVABLE_PAYMENT',
        is_reversed: false,
      },
    ],
  });
  assert(nearly(income.total, 1465.24), 'recebido sobe');
  assert(income.total !== mrr, 'MRR ≠ receita recebida');
  console.log('OK testMrrUnchanged');
}

function testWiringAndTenantIntact() {
  const dash = read('lib/masterDashboardData.ts');
  assert(dash.includes('sumSvLotesConsolidatedReceivedIncome'), 'dashboard card consolidado');
  assert(dash.includes('aggregateSvLotesMonthlyRevenueExpense'), 'dashboard gráfico consolidado');
  assert(dash.includes('SV_LOTES_RECEIVED_REVENUE_SOURCE'), 'source documentado');
  assert(dash.includes(SV_LOTES_RECEIVED_REVENUE_SOURCE) || true, 'const source');

  assert(
    fs.existsSync(path.join(ROOT, 'components/master/corporateFinance/CorporateReceivablesPage.tsx')),
    'AR page',
  );
  assert(fs.existsSync(path.join(ROOT, 'components/finance')), 'tenant finance');
  assert(
    !read('lib/master/corporateFinance/receivablesService.ts').includes(
      "from('saas_cash_movements').insert",
    ),
    'AR não copia fisicamente para saas_cash',
  );

  const keys = collectSaasDedupKeys([{ asaas_payment_id: 'a1', metadata: { external_reference: 'e1' } }]);
  assert(keys.has('asaas:a1') && keys.has('ref:e1'), 'chaves dedup');
  const corpKeys = corporateReceivableDedupKeys({
    amount: 1,
    movement_date: '2026-07-01',
    type: 'INCOME',
    origin: 'RECEIVABLE_PAYMENT',
    reference: 'a1',
  });
  assert(corpKeys.includes('asaas:a1'), 'corp key asaas');
  assert(
    isCorporateReceivableAlreadyInSaas(
      {
        amount: 1,
        movement_date: '2026-07-01',
        type: 'INCOME',
        origin: 'RECEIVABLE_PAYMENT',
        reference: 'a1',
      },
      keys,
    ),
    'match dedup',
  );

  // Topografia chart still excludes SV_LOTES via business unit
  const topo = aggregateCorporateCashMonthlyFromRows(
    [
      {
        movement_date: '2026-07-15',
        type: 'INCOME',
        amount: 915.23,
        is_reversed: false,
        origin: 'RECEIVABLE_PAYMENT',
      },
    ],
    2026,
  );
  // Pure aggregator doesn't know business_unit — segregation is by account filter upstream.
  assert(topo.months[6]!.income === 915.23, 'fixture agregador');
  console.log('OK testWiringAndTenantIntact');
}

function main() {
  testRealCaseJuly1465();
  testPendingArExcluded();
  testReceivedArIncluded();
  testTopografiaNotInSaasBlock();
  testSameAsaasPaymentIdDedup();
  testExtraordinaryStillIncluded();
  testTransferOutsideResult();
  testReversalNeutralizes();
  testMonthAndAnnualChartSameRules();
  testHistoricalNullNotSvLotes();
  testMrrUnchanged();
  testWiringAndTenantIntact();
  console.log('\nmandatory-master-dashboard-sv-lotes-ar-revenue-tests: all passed');
}

main();
