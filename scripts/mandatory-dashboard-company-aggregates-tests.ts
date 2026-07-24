/**
 * Agregados financeiros do Dashboard — paginação >1000, decimais, filtros.
 * npx tsx scripts/mandatory-dashboard-company-aggregates-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  buildEnterpriseBreakdownByProject,
  summarizeEnterpriseFetch,
  takePostgrestDefaultCap,
  type FetchEnterpriseLotsResult,
} from '../lib/enterpriseValueFetch';
import {
  calculateEnterpriseValueSummary,
  filterEnterpriseLotsByProject,
  formatEnterpriseCurrency,
  parseEnterpriseLotPrice,
  type EnterpriseLotRow,
} from '../lib/enterpriseValueSummary';
import {
  formatDashboardKpiPrimaryValue,
} from '../lib/dashboardKpiFormat';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function nearly(a: number, b: number, eps = 0.001): boolean {
  return Math.abs(a - b) < eps;
}

/** Empresa fictícia com >1000 lotes e valores decimais (cenário Meneses). */
function buildCompanyLotsOver1000(): EnterpriseLotRow[] {
  const lots: EnterpriseLotRow[] = [];
  // Corredor Industrial — muitos disponíveis com preço decimal
  for (let i = 0; i < 900; i++) {
    lots.push({
      project_id: 'p-corredor',
      status: 'Disponível',
      price: 238747.4501 + (i % 7) * 0.1,
    });
  }
  // Martini II — mix status
  for (let i = 0; i < 80; i++) {
    lots.push({
      project_id: 'p-martini2',
      status: i < 40 ? 'Disponível' : i < 60 ? 'Reservado' : 'Vendido',
      price: 45500.5,
    });
  }
  // Joaquim — vendidos / reservados
  for (let i = 0; i < 50; i++) {
    lots.push({
      project_id: 'p-joaquim',
      status: i < 20 ? 'Disponível' : i < 25 ? 'Reservado' : 'Vendido',
      price: 38000,
    });
  }
  // Castanheira — extras além do cap 1000
  for (let i = 0; i < 40; i++) {
    lots.push({
      project_id: 'p-castanheira',
      status: 'Disponível',
      price: 45000.75,
    });
  }
  assert(lots.length > 1000, `esperado >1000, got ${lots.length}`);
  return lots;
}

function testCompanyOver1000NotSilentlyCapped() {
  const lots = buildCompanyLotsOver1000();
  const full = calculateEnterpriseValueSummary(lots);
  const capped = calculateEnterpriseValueSummary(takePostgrestDefaultCap(lots, 1000));

  assert(lots.length > 1000, 'fixture >1000');
  assert(full.lotCount === lots.length, 'full lotCount');
  assert(capped.lotCount === 1000, 'capped lotCount 1000');
  assert(full.availableValue > capped.availableValue, 'cap corta disponível');
  assert(
    full.totalValue - capped.totalValue > 0,
    'gap global positivo sob truncamento',
  );
  console.log('OK testCompanyOver1000NotSilentlyCapped', {
    fullLots: full.lotCount,
    cappedLots: capped.lotCount,
    availableGap: full.availableValue - capped.availableValue,
  });
}

function testDecimalPricesPreserved() {
  const summary = calculateEnterpriseValueSummary([
    { project_id: 'p1', status: 'Disponível', price: 214872705.9 },
    { project_id: 'p1', status: 'Disponível', price: '4779629.40' },
    { project_id: 'p1', status: 'Disponível', price: '1.234,56' },
  ]);
  assert(nearly(summary.availableValue, 214872705.9 + 4779629.4 + 1234.56), String(summary.availableValue));
  assert(parseEnterpriseLotPrice('214872705.90') === 214872705.9, 'db decimal string');
  assert(parseEnterpriseLotPrice(0) === 0, 'zero');
  assert(parseEnterpriseLotPrice(null) === 0, 'null');
  console.log('OK testDecimalPricesPreserved');
}

function testAvailablePlusReservedPlusSoldEqualsGlobal() {
  const lots = buildCompanyLotsOver1000();
  const s = calculateEnterpriseValueSummary(lots);
  assert(
    nearly(s.availableValue + s.reservedValue + s.soldValue, s.totalValue),
    `identity failed avail=${s.availableValue} res=${s.reservedValue} sold=${s.soldValue} tot=${s.totalValue}`,
  );
  console.log('OK testAvailablePlusReservedPlusSoldEqualsGlobal');
}

function testMultiProjectBreakdownMatchesMapSum() {
  const lots = buildCompanyLotsOver1000();
  const names = {
    'p-corredor': 'Corredor Industrial',
    'p-martini2': 'Martini II',
    'p-joaquim': 'Joaquim',
    'p-castanheira': 'Castanheira II',
  };
  const breakdown = buildEnterpriseBreakdownByProject(lots, names, {
    pagesFetched: 2,
  });
  assert(breakdown.length === 4, `projects=${breakdown.length}`);
  const sumAvail = breakdown.reduce((a, r) => a + r.availableValue, 0);
  const sumGlobal = breakdown.reduce((a, r) => a + r.globalValue, 0);
  const full = calculateEnterpriseValueSummary(lots);
  assert(nearly(sumAvail, full.availableValue), 'sum available by project');
  assert(nearly(sumGlobal, full.totalValue), 'sum global by project');
  console.log('OK testMultiProjectBreakdownMatchesMapSum');
}

function testProjectFilterAndAllProjects() {
  const lots = buildCompanyLotsOver1000();
  const all = calculateEnterpriseValueSummary(lots);
  const joaquim = calculateEnterpriseValueSummary(
    filterEnterpriseLotsByProject(lots, 'p-joaquim'),
  );
  assert(joaquim.lotCount < all.lotCount, 'filtro reduz lotes');
  assert(joaquim.totalValue < all.totalValue, 'filtro reduz valor');
  const todos = filterEnterpriseLotsByProject(lots, null);
  assert(todos.length === lots.length, 'Todos = todos');
  console.log('OK testProjectFilterAndAllProjects');
}

function testStatusAndPriceChanges() {
  const base: EnterpriseLotRow[] = [
    { project_id: 'p1', status: 'Disponível', price: 100000.5 },
    { project_id: 'p1', status: 'Reservado', price: 200000 },
    { project_id: 'p1', status: 'Vendido', price: 300000 },
  ];
  let s = calculateEnterpriseValueSummary(base);
  assert(nearly(s.availableValue, 100000.5), 'avail');
  assert(nearly(s.reservedValue, 200000), 'reserved');
  assert(nearly(s.soldValue, 300000), 'sold');

  // reserva → venda
  const afterSale = base.map((l, i) =>
    i === 1 ? { ...l, status: 'Vendido' } : l,
  );
  s = calculateEnterpriseValueSummary(afterSale);
  assert(nearly(s.reservedValue, 0), 'reserva zerada');
  assert(nearly(s.soldValue, 500000), 'vendido inclui ex-reserva');

  // cancelamento de venda → disponível
  const afterCancel = afterSale.map((l, i) =>
    i === 2 ? { ...l, status: 'Disponível' } : l,
  );
  s = calculateEnterpriseValueSummary(afterCancel);
  assert(nearly(s.availableValue, 400000.5), 'cancel volta disponível');

  // alteração de preço
  const afterPrice = afterCancel.map((l, i) =>
    i === 0 ? { ...l, price: 99999.99 } : l,
  );
  s = calculateEnterpriseValueSummary(afterPrice);
  assert(nearly(s.availableValue, 99999.99 + 300000), 'preço atualizado');
  console.log('OK testStatusAndPriceChanges');
}

function testCurrencyFormattingShowsCents() {
  const formatted = formatEnterpriseCurrency(251932335.3);
  assert(formatted.includes(',30') || formatted.includes(',3'), formatted);
  assert(formatted.includes('251.932.335'), formatted);

  const kpi = formatDashboardKpiPrimaryValue(251932335.3, true);
  assert(kpi.includes(',30') || kpi.includes(',3'), kpi);
  assert(!/R\$\s*251\.932\.335$/.test(kpi.replace(/\u00a0/g, ' ')), 'não omitir centavos');
  console.log('OK testCurrencyFormattingShowsCents', { formatted, kpi });
}

function testSummarizeEnterpriseFetchShape() {
  const lots = buildCompanyLotsOver1000();
  const summary = calculateEnterpriseValueSummary(lots);
  const meta: FetchEnterpriseLotsResult = {
    rows: lots,
    exactCount: lots.length,
    pagesFetched: 2,
    rowsFetched: lots.length,
    wouldTruncateWithoutPagination: true,
  };
  const consolidated = summarizeEnterpriseFetch(summary, meta, {
    companyId: 'company-meneses',
    projectCount: 4,
  });
  assert(consolidated.companyId === 'company-meneses', 'companyId');
  assert(consolidated.totalRows === lots.length, 'totalRows');
  assert(consolidated.wouldTruncateWithoutPagination === true, 'flag');
  assert(nearly(Number(consolidated.globalValue), summary.totalValue), 'global');
  console.log('OK testSummarizeEnterpriseFetchShape');
}

function testDashboardAndOverlayUseSharedFetch() {
  const dash = fs.readFileSync(
    path.join(process.cwd(), 'app/dashboard/page.tsx'),
    'utf8',
  );
  const overlay = fs.readFileSync(
    path.join(process.cwd(), 'components/enterprise/EnterpriseValueOverlay.tsx'),
    'utf8',
  );
  const finance = fs.readFileSync(
    path.join(process.cwd(), 'app/finance/page.tsx'),
    'utf8',
  );
  const report = fs.readFileSync(
    path.join(process.cwd(), 'lib/lotReportExport/fetchLotReportData.ts'),
    'utf8',
  );
  assert(dash.includes('fetchAllEnterpriseLotRows'), 'dashboard usa fetch paginado');
  assert(overlay.includes('fetchAllEnterpriseLotRows'), 'overlay usa fetch paginado');
  assert(finance.includes('fetchAllEnterpriseLotRows'), 'finance usa fetch paginado');
  assert(report.includes('fetchAllEnterpriseLotRows'), 'export lotes usa fetch paginado');
  assert(
    !dash.includes(".from('blocks')\n          .select('project_id, status, price')"),
    'dashboard sem select único sem range',
  );
  console.log('OK testDashboardAndOverlayUseSharedFetch');
}

function testDiagRoutePreviewOnly() {
  const source = fs.readFileSync(
    path.join(
      process.cwd(),
      'app/api/cron/diagnose-dashboard-enterprise-values/route.ts',
    ),
    'utf8',
  );
  assert(source.includes("VERCEL_ENV === 'production'"), 'bloqueia production');
  assert(source.includes('x-diag-token'), 'exige token');
  assert(source.includes('byProject'), 'retorna byProject');
  assert(source.includes('truncatedSimulation'), 'simula cap 1000');
  console.log('OK testDiagRoutePreviewOnly');
}

function main() {
  testCompanyOver1000NotSilentlyCapped();
  testDecimalPricesPreserved();
  testAvailablePlusReservedPlusSoldEqualsGlobal();
  testMultiProjectBreakdownMatchesMapSum();
  testProjectFilterAndAllProjects();
  testStatusAndPriceChanges();
  testCurrencyFormattingShowsCents();
  testSummarizeEnterpriseFetchShape();
  testDashboardAndOverlayUseSharedFetch();
  testDiagRoutePreviewOnly();
  console.log('mandatory-dashboard-company-aggregates-tests: all passed');
}

main();
