/**
 * KPIs do dashboard — quantidade de lotes não deve usar formatador monetário.
 * npx tsx scripts/mandatory-dashboard-lot-count-kpi-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  formatDashboardKpiPrimaryValue,
  isDashboardLotCountKpiTitle,
} from '../lib/dashboardKpiFormat';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testCountNotFormattedAsCurrency() {
  const count = formatDashboardKpiPrimaryValue(345, false);
  assert(!count.includes('R$'), 'quantidade sem R$');
  assert(count === '345', `esperado 345, recebido ${count}`);

  const reserved = formatDashboardKpiPrimaryValue(38, false);
  assert(reserved === '38', 'reservados 38');

  const sold = formatDashboardKpiPrimaryValue(20, false);
  assert(sold === '20', 'vendidos 20');
  console.log('OK testCountNotFormattedAsCurrency');
}

function testCurrencyFormattedForFinancialKpis() {
  const value = formatDashboardKpiPrimaryValue(20_185_000, true);
  assert(value.includes('R$'), 'valor com R$');
  assert(value.includes('20.185.000'), `valor formatado: ${value}`);
  console.log('OK testCurrencyFormattedForFinancialKpis');
}

function testLotCountKpiTitles() {
  assert(isDashboardLotCountKpiTitle('Lotes disponíveis'), 'disponíveis');
  assert(isDashboardLotCountKpiTitle('LOTES RESERVADOS'), 'reservados');
  assert(isDashboardLotCountKpiTitle('Lotes vendidos'), 'vendidos');
  assert(!isDashboardLotCountKpiTitle('Recebido no mês'), 'não é lote');
  console.log('OK testLotCountKpiTitles');
}

function testDashboardMetricKpiUsesIsCurrencyProp() {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'components/dashboard/DashboardPremiumUI.tsx'),
    'utf8',
  );
  assert(source.includes('isCurrency'), 'prop isCurrency no componente');
  assert(source.includes('formatDashboardKpiPrimaryValue'), 'helper de formatação');
  assert(
    !source.includes("style: 'currency',\n              currency: 'BRL',\n              maximumFractionDigits: 0,\n            }).format(value)"),
    'sem formatador monetário fixo no value',
  );
  console.log('OK testDashboardMetricKpiUsesIsCurrencyProp');
}

function testDashboardPageFinancialKpisMarkedCurrency() {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'app/dashboard/page.tsx'),
    'utf8',
  );
  assert(source.includes('title="Recebido no mês"'), 'card recebido');
  assert(
    /title="Recebido no mês"[\s\S]*?isCurrency/.test(source),
    'Recebido no mês com isCurrency',
  );
  assert(
    /title="Lotes disponíveis"[\s\S]*?formatEnterpriseCurrency\(stats\.availableValue\)/.test(
      source,
    ),
    'Lotes disponíveis com valor no subtitle',
  );
  console.log('OK testDashboardPageFinancialKpisMarkedCurrency');
}

function main() {
  testCountNotFormattedAsCurrency();
  testCurrencyFormattedForFinancialKpis();
  testLotCountKpiTitles();
  testDashboardMetricKpiUsesIsCurrencyProp();
  testDashboardPageFinancialKpisMarkedCurrency();
  console.log('OK — mandatory-dashboard-lot-count-kpi-tests passed');
}

main();
