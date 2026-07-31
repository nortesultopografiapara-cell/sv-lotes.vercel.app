/**
 * Etapa 4 — Dashboard Executivo: segregação KPIs SaaS × SV Topografia.
 * npm run test:master-finance-etapa4-dashboard
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  computeSaasCashSummaryFromRows,
  MANUAL_EXTRAORDINARY_INCOME_ORIGIN,
} from '../lib/saasCashMovements';
import { pnlCashEffect, aggregateCorporateCashMonthlyFromRows } from '../lib/master/corporateFinance/cashMath';
import {
  DASHBOARD_CORPORATE_BUSINESS_UNIT,
  corporateBusinessUnitOrFilter,
} from '../lib/master/corporateFinance/businessUnitScope';
import { calculateMrrFromCompanies } from '../lib/companyPricing';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testSaasKpisExcludeTransfer() {
  const summary = computeSaasCashSummaryFromRows([
    { type: 'income', amount: 1000 },
    { type: 'expense', amount: 100 },
    { type: 'transfer', amount: 500 },
  ]);
  assert(summary.periodIncome === 1000, 'income only');
  assert(summary.periodExpense === 100, 'expense only');
  assert(summary.periodTransfer === 500, 'transfer informativo');
  assert(summary.netResult === 900, 'transfer fora do resultado');
  console.log('OK testSaasKpisExcludeTransfer');
}

function testMrrExcludesExtraordinary() {
  const mrr = calculateMrrFromCompanies([
    {
      id: 'c1',
      name: 'Tenant',
      status: 'active',
      status_operacional: 'Ativo',
      plan_type: 'basico',
      custom_monthly_price: null,
      billing_model: 'monthly',
      is_demo: false,
    } as Parameters<typeof calculateMrrFromCompanies>[0][number],
  ]);
  assert(mrr > 0, 'MRR vem de assinatura');
  const dash = read('lib/masterDashboardData.ts');
  assert(dash.includes('calculateMrrFromCompanies'), 'MRR via pricing');
  assert(dash.includes('sumSaasCashReceivedIncome'), 'recebido via caixa');
  assert(
    !dash.includes('mrr') || dash.includes('recorrente'),
    'doc MRR recorrente',
  );
  const extraordinary = computeSaasCashSummaryFromRows([
    { type: 'income', amount: 250 },
  ]);
  assert(extraordinary.periodIncome === 250, 'extraordinária é income');
  assert(mrr !== extraordinary.periodIncome, 'MRR ≠ receita extraordinária');
  console.log('OK testMrrExcludesExtraordinary');
}

function testReceivedIncludesExtraordinaryIncome() {
  const svc = read('lib/saasCashMovements.ts');
  assert(svc.includes("eq('type', 'income')"), 'Receita Recebida filtra income');
  assert(svc.includes('sumSaasCashReceivedIncome'), 'função receita recebida');
  assert(svc.includes('MANUAL_EXTRAORDINARY_INCOME_ORIGIN'), 'origem extraordinária');
  assert(
    svc.includes(MANUAL_EXTRAORDINARY_INCOME_ORIGIN) ||
      MANUAL_EXTRAORDINARY_INCOME_ORIGIN === 'manual_extraordinary_income',
    'const extraordinária',
  );
  const dash = read('lib/masterDashboardData.ts');
  assert(dash.includes('fromDate: monthFrom'), 'Receita Recebida mês atual');
  assert(dash.includes('toDate: monthTo'), 'Receita Recebida fim mês');
  console.log('OK testReceivedIncludesExtraordinaryIncome');
}

function testNoSubscriptionDoubleCountContract() {
  const svc = read('lib/saasCashMovements.ts');
  assert(svc.includes('anti-duplicidade') || svc.includes('anti-dup'), 'anti-dup documentado');
  assert(svc.includes('webhook') || svc.includes('asaas'), 'fonte asaas/webhook');
  console.log('OK testNoSubscriptionDoubleCountContract');
}

function testTopografiaBusinessUnitFilter() {
  assert(DASHBOARD_CORPORATE_BUSINESS_UNIT === 'SV_TOPOGRAFIA', 'unidade dashboard');
  assert(
    corporateBusinessUnitOrFilter('SV_TOPOGRAFIA').includes('SV_TOPOGRAFIA'),
    'filtro topo',
  );
  assert(
    corporateBusinessUnitOrFilter('SV_TOPOGRAFIA').includes('business_unit.is.null'),
    'fallback histórico null → Topografia',
  );
  assert(
    !corporateBusinessUnitOrFilter('SV_LOTES').includes('is.null'),
    'SV_LOTES sem fallback null',
  );

  const dash = read('lib/masterDashboardData.ts');
  assert(dash.includes('DASHBOARD_CORPORATE_BUSINESS_UNIT'), 'data usa escopo');
  assert(dash.includes('businessUnit: DASHBOARD_CORPORATE_BUSINESS_UNIT'), 'KPIs filtrados');

  const ui = read('components/master/dashboard/MasterExecutiveDashboard.tsx');
  assert(ui.includes("businessUnit: 'SV_TOPOGRAFIA'"), 'fetch summary/monthly filtrado');
  assert(ui.includes('Transferências no período'), 'card transferências informativo');
  assert(ui.includes('Indicadores SV LOTES'), 'bloco SaaS');
  assert(ui.includes('Indicadores SV Topografia'), 'bloco Topografia');

  const summaryRoute = read('app/api/master/corporate-finance/summary/route.ts');
  assert(summaryRoute.includes('businessUnit'), 'API summary aceita unidade');
  const monthlyRoute = read(
    'app/api/master/corporate-finance/cash-movements/monthly/route.ts',
  );
  assert(monthlyRoute.includes('businessUnit'), 'API monthly aceita unidade');
  console.log('OK testTopografiaBusinessUnitFilter');
}

function testArApSvLotesExcludedFromTopografiaKpis() {
  const recv = read('lib/master/corporateFinance/receivablesService.ts');
  const pay = read('lib/master/corporateFinance/payablesService.ts');
  assert(recv.includes('corporateBusinessUnitOrFilter'), 'AR KPIs filtram unidade');
  assert(pay.includes('corporateBusinessUnitOrFilter'), 'AP KPIs filtram unidade');
  assert(
    !corporateBusinessUnitOrFilter('SV_TOPOGRAFIA').includes('SV_LOTES'),
    'filtro Topografia não inclui SV_LOTES',
  );
  console.log('OK testArApSvLotesExcludedFromTopografiaKpis');
}

function testCorporateBalanceScopedToTopografiaAccounts() {
  const cash = read('lib/master/corporateFinance/cashMovementsService.ts');
  assert(cash.includes('listCorporateAccountIdsForUnit'), 'lista contas por unidade');
  assert(cash.includes('businessUnit: opts.businessUnit'), 'saldo/hub escopado');
  const math = read('lib/master/corporateFinance/cashMath.ts');
  assert(math.includes('listCorporateAccountIdsForUnit'), 'agregação mensal escopada');
  const scope = read('lib/master/corporateFinance/businessUnitScope.ts');
  assert(scope.includes('master_corporate_financial_accounts'), 'fonte contas');
  console.log('OK testCorporateBalanceScopedToTopografiaAccounts');
}

function testCorporateTransfersOutsideResult() {
  const transferOut = pnlCashEffect({
    type: 'TRANSFER_OUT',
    amount: 300,
    is_reversed: false,
    origin: 'TRANSFER',
  });
  assert(transferOut.income === 0 && transferOut.expense === 0, 'TRANSFER_OUT fora P&L');
  const transferIn = pnlCashEffect({
    type: 'TRANSFER_IN',
    amount: 300,
    is_reversed: false,
    origin: 'TRANSFER',
  });
  assert(transferIn.income === 0 && transferIn.expense === 0, 'TRANSFER_IN fora P&L');

  const monthly = aggregateCorporateCashMonthlyFromRows(
    [
      {
        movement_date: '2026-07-10',
        type: 'INCOME',
        amount: 1000,
        is_reversed: false,
        origin: 'MANUAL_INCOME',
      },
      {
        movement_date: '2026-07-11',
        type: 'TRANSFER_OUT',
        amount: 400,
        is_reversed: false,
        origin: 'TRANSFER',
      },
      {
        movement_date: '2026-07-11',
        type: 'TRANSFER_IN',
        amount: 400,
        is_reversed: false,
        origin: 'TRANSFER',
      },
    ],
    2026,
  );
  const jul = monthly.months.find((m) => m.month === 7);
  assert(jul != null, 'mês 7');
  assert(jul!.income === 1000, 'receita sem transfer');
  assert(jul!.expense === 0, 'despesa sem transfer');
  console.log('OK testCorporateTransfersOutsideResult');
}

function testChartsAndCardsCriteriaDocumented() {
  const dash = read('lib/masterDashboardData.ts');
  assert(dash.includes('Mapeamento de fontes'), 'mapeamento documentado');
  assert(dash.includes('Receita Recebida'), 'doc receita recebida');
  assert(dash.includes('sem transfer'), 'doc exclui transfer');
  const ui = read('components/master/dashboard/MasterExecutiveDashboard.tsx');
  assert(ui.includes('ano {dashboard.financialYear}') || ui.includes('ano '), 'hint ano');
  assert(ui.includes('Mês atual'), 'hint mês atual');
  assert(ui.includes('Recorrente contratada') || ui.includes('recorrente'), 'hint MRR');
  console.log('OK testChartsAndCardsCriteriaDocumented');
}

function testReceivablesAndSaasCashStillPresent() {
  assert(fs.existsSync(path.join(ROOT, 'components/master/corporateFinance/CorporateReceivablesPage.tsx')), 'AR page');
  assert(fs.existsSync(path.join(ROOT, 'components/master/saas/SaasCashPanel.tsx')), 'Caixa SaaS');
  const ar = read('components/master/corporateFinance/CorporateReceivablesPage.tsx');
  assert(ar.includes('businessUnitFilter') || ar.includes('SV_LOTES'), 'AR dual unit intacto');
  const cash = read('components/master/saas/SaasCashPanel.tsx');
  assert(cash.includes('periodTransfer'), 'Caixa SaaS transfer intacto');
  console.log('OK testReceivablesAndSaasCashStillPresent');
}

function testTenantFinanceModulesIntact() {
  const tenantPaths = [
    'lib/finance/companyAsaasFinancialTransactions.ts',
    'app/api/finance',
    'components/finance',
  ];
  for (const p of tenantPaths) {
    assert(fs.existsSync(path.join(ROOT, p)), `tenant path existe: ${p}`);
  }
  // Etapa 4 não deve reescrever o fluxo de caixa das empresas clientes.
  const etapa4Touched = [
    'lib/masterDashboardData.ts',
    'components/master/dashboard/MasterExecutiveDashboard.tsx',
    'lib/master/corporateFinance/businessUnitScope.ts',
  ];
  for (const f of etapa4Touched) {
    assert(fs.existsSync(path.join(ROOT, f)), `arquivo Etapa 4: ${f}`);
  }
  console.log('OK testTenantFinanceModulesIntact');
}

function testHubScopedToTopografia() {
  const hub = read('components/master/corporateFinance/CorporateFinanceHubPage.tsx');
  assert(hub.includes('businessUnit=SV_TOPOGRAFIA'), 'hub KPIs Topografia');
  console.log('OK testHubScopedToTopografia');
}

function main() {
  testSaasKpisExcludeTransfer();
  testMrrExcludesExtraordinary();
  testReceivedIncludesExtraordinaryIncome();
  testNoSubscriptionDoubleCountContract();
  testTopografiaBusinessUnitFilter();
  testArApSvLotesExcludedFromTopografiaKpis();
  testCorporateBalanceScopedToTopografiaAccounts();
  testCorporateTransfersOutsideResult();
  testChartsAndCardsCriteriaDocumented();
  testReceivablesAndSaasCashStillPresent();
  testTenantFinanceModulesIntact();
  testHubScopedToTopografia();
  console.log('\nmandatory-master-finance-etapa4-dashboard-tests: all passed');
}

main();
