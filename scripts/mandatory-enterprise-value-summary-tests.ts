/**
 * Resumo de valor do empreendimento.
 * npx tsx scripts/mandatory-enterprise-value-summary-tests.ts
 */

import {
  calculateEnterpriseValueSummary,
  filterEnterpriseLotsByProject,
  formatEnterpriseCurrency,
  parseEnterpriseLotPrice,
  type EnterpriseLotRow,
} from '../lib/enterpriseValueSummary';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const joaquimLots: EnterpriseLotRow[] = [
  { project_id: 'p-joaquim', status: 'Disponível', price: 100000 },
  { project_id: 'p-joaquim', status: 'Disponível', price: 80000 },
  { project_id: 'p-joaquim', status: 'Reservado', price: 120000 },
  { project_id: 'p-joaquim', status: 'Vendido', price: 150000 },
];

const martiniLots: EnterpriseLotRow[] = [
  { project_id: 'p-martini', status: 'Disponível', price: 50000 },
  { project_id: 'p-martini', status: 'Vendido', price: 70000 },
  { project_id: 'p-martini', status: 'Quitado', price: 90000 },
];

function testTotalSum() {
  const summary = calculateEnterpriseValueSummary(joaquimLots);
  assert(summary.totalValue === 450000, `total=${summary.totalValue}`);
  assert(summary.lotCount === 4, `lotCount=${summary.lotCount}`);
  console.log('OK testTotalSum');
}

function testAvailableSum() {
  const summary = calculateEnterpriseValueSummary(joaquimLots);
  assert(summary.availableValue === 180000, `available=${summary.availableValue}`);
  assert(summary.availableCount === 2, `availableCount=${summary.availableCount}`);
  console.log('OK testAvailableSum');
}

function testReservedSum() {
  const summary = calculateEnterpriseValueSummary(joaquimLots);
  assert(summary.reservedValue === 120000, `reserved=${summary.reservedValue}`);
  assert(summary.reservedCount === 1, `reservedCount=${summary.reservedCount}`);
  console.log('OK testReservedSum');
}

function testSoldAndPaidSum() {
  const summary = calculateEnterpriseValueSummary(martiniLots);
  assert(summary.soldValue === 160000, `soldValue=${summary.soldValue}`);
  assert(summary.soldCount === 1, `soldCount=${summary.soldCount}`);
  assert(summary.paidCount === 1, `paidCount=${summary.paidCount}`);
  assert(summary.paidValue === 90000, `paidValue=${summary.paidValue}`);
  console.log('OK testSoldAndPaidSum');
}

function testEmptyPricesAsZero() {
  const summary = calculateEnterpriseValueSummary([
    { project_id: 'p1', status: 'Disponível', price: null },
    { project_id: 'p1', status: 'Disponível', price: '' },
    { project_id: 'p1', status: 'Disponível', price: 'abc' },
    { project_id: 'p1', status: 'Disponível', price: -10 },
  ]);
  assert(summary.totalValue === 0, `total=${summary.totalValue}`);
  assert(summary.availableCount === 4, `count=${summary.availableCount}`);
  console.log('OK testEmptyPricesAsZero');
}

function testCurrencyFormat() {
  assert(
    formatEnterpriseCurrency(1500000) === 'R$\u00a01.500.000,00' ||
      formatEnterpriseCurrency(1500000).includes('1.500.000,00'),
    formatEnterpriseCurrency(1500000),
  );
  assert(formatEnterpriseCurrency(0) === 'R$\u00a00,00' || formatEnterpriseCurrency(0).includes('0,00'), 'zero');
  console.log('OK testCurrencyFormat');
}

function testProjectFilter() {
  const all = [...joaquimLots, ...martiniLots];
  const filtered = filterEnterpriseLotsByProject(all, 'p-martini');
  assert(filtered.length === 3, `filtered=${filtered.length}`);
  const summary = calculateEnterpriseValueSummary(filtered);
  assert(summary.totalValue === 210000, `martini total=${summary.totalValue}`);
  console.log('OK testProjectFilter');
}

function testAllSoldProject() {
  const summary = calculateEnterpriseValueSummary([
    { project_id: 'p2', status: 'Vendido', price: 100 },
    { project_id: 'p2', status: 'Quitado', price: 200 },
  ]);
  assert(summary.availableCount === 0, 'no available');
  assert(summary.totalValue === 300, 'total 300');
  assert(summary.soldValue === 300, 'sold 300');
  console.log('OK testAllSoldProject');
}

function testMixedStatusesMartiniScenario() {
  const summary = calculateEnterpriseValueSummary(martiniLots);
  assert(summary.availableValue === 50000, 'available value');
  assert(summary.availableCount === 1, 'available count');
  console.log('OK testMixedStatusesMartiniScenario');
}

function testParsePrice() {
  assert(parseEnterpriseLotPrice('125000.50') === 125000.5, 'parse string');
  assert(parseEnterpriseLotPrice(undefined) === 0, 'undefined');
  console.log('OK testParsePrice');
}

function main() {
  testTotalSum();
  testAvailableSum();
  testReservedSum();
  testSoldAndPaidSum();
  testEmptyPricesAsZero();
  testCurrencyFormat();
  testProjectFilter();
  testAllSoldProject();
  testMixedStatusesMartiniScenario();
  testParsePrice();
  console.log('mandatory-enterprise-value-summary-tests: all passed');
}

main();
