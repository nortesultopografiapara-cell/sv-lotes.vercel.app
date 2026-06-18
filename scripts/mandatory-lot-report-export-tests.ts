/**
 * Testes — exportação de relatório de lotes.
 * npx tsx scripts/mandatory-lot-report-export-tests.ts
 */

import {
  buildLotReport,
  filterBlocksByProjectIds,
  filterLotReportRowsByStatus,
  mapBlocksToLotReportRows,
  sortLotReportRows,
} from '../lib/lotReportExport/buildLotReport';
import {
  buildLotReportFilename,
  formatLotReportArea,
  formatLotReportCurrency,
  sanitizeLotReportText,
} from '../lib/lotReportExport/format';
import { canExportLotReport } from '../lib/rolePermissions';
import type { LotReportBlockRecord } from '../lib/lotReportExport/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertNotIncludes(text: string, needle: string, msg: string) {
  if (text.includes(needle)) throw new Error(`${msg}: contém "${needle}"`);
}

const blocksFixture: LotReportBlockRecord[] = [
  {
    project_id: 'p1',
    block_name: '01',
    number: '01',
    area: 1163.29,
    price: 70960.69,
    status: 'Disponível',
    projects: { id: 'p1', name: 'Meneses Loteamento' },
  },
  {
    project_id: 'p1',
    block_name: '01',
    number: '02',
    area: 1200,
    price: 75000,
    status: 'Reservado',
    projects: { id: 'p1', name: 'Meneses Loteamento' },
  },
  {
    project_id: 'p1',
    block_name: '03',
    number: '15',
    area: 1180,
    price: 75000,
    status: 'Disponível',
    projects: { id: 'p1', name: 'Meneses Loteamento' },
  },
  {
    project_id: 'p2',
    block_name: '02',
    number: '05',
    area: 980.5,
    price: 55000,
    status: 'Vendido',
    projects: { id: 'p2', name: 'Recanto Primavera' },
  },
  {
    project_id: 'p2',
    block_name: '04',
    number: '10',
    area: 1050,
    price: 62000,
    status: 'Quitado',
    projects: { id: 'p2', name: 'Recanto Primavera' },
  },
];

const allFilters = {
  includeAvailable: true,
  includeReserved: true,
  includeSold: true,
  includePaid: true,
};

function testGroupByQuadra() {
  const result = buildLotReport(blocksFixture, {
    groupBy: 'quadra',
    sortBy: 'quadra_lote',
    filters: allFilters,
  });
  assert(result.groups.length >= 3, 'grupos por quadra');
  const g01 = result.groups.find((g) => g.key === '01');
  assert(!!g01, 'quadra 01');
  assert(g01!.rows.length === 2, '2 lotes quadra 01');
  assert(g01!.summary.count === 2, 'resumo quadra 01');
  console.log('OK testGroupByQuadra');
}

function testGroupByValor() {
  const result = buildLotReport(blocksFixture, {
    groupBy: 'valor',
    sortBy: 'valor_asc',
    filters: allFilters,
  });
  const g75 = result.groups.find((g) => g.key === '75000');
  assert(!!g75, 'grupo valor 75000');
  assert(g75!.rows.length === 2, '2 lotes mesmo valor');
  console.log('OK testGroupByValor');
}

function testGroupByStatus() {
  const result = buildLotReport(blocksFixture, {
    groupBy: 'status',
    sortBy: 'status',
    filters: allFilters,
  });
  const disponiveis = result.groups.find((g) => g.key === 'available');
  assert(!!disponiveis, 'grupo disponíveis');
  assert(disponiveis!.rows.length === 2, '2 disponíveis');
  console.log('OK testGroupByStatus');
}

function testNoGrouping() {
  const result = buildLotReport(blocksFixture, {
    groupBy: 'none',
    sortBy: 'quadra_lote',
    filters: allFilters,
  });
  assert(result.groups.length === 1, 'um grupo');
  assert(result.groups[0].rows.length === 5, '5 lotes');
  console.log('OK testNoGrouping');
}

function testFilterOnlyAvailable() {
  const result = buildLotReport(blocksFixture, {
    groupBy: 'none',
    sortBy: 'quadra_lote',
    filters: {
      includeAvailable: true,
      includeReserved: false,
      includeSold: false,
      includePaid: false,
    },
  });
  assert(result.rows.length === 2, 'somente disponíveis');
  assert(result.rows.every((r) => r.statusLabel === 'Disponível'), 'status disponível');
  console.log('OK testFilterOnlyAvailable');
}

function testAllEnterprises() {
  const result = buildLotReport(blocksFixture, {
    groupBy: 'none',
    sortBy: 'quadra_lote',
    filters: allFilters,
  });
  const projects = new Set(result.rows.map((r) => r.projectName));
  assert(projects.size === 2, 'dois empreendimentos');
  console.log('OK testAllEnterprises');
}

function testSpecificProject() {
  const scoped = filterBlocksByProjectIds(blocksFixture, ['p2']);
  const result = buildLotReport(scoped, {
    groupBy: 'quadra',
    sortBy: 'quadra_lote',
    filters: allFilters,
  });
  assert(result.rows.every((r) => r.projectId === 'p2'), 'somente p2');
  assert(result.rows.length === 2, '2 lotes recanto');
  console.log('OK testSpecificProject');
}

function testOwnerProjectScope() {
  const allowed = filterBlocksByProjectIds(blocksFixture, ['p1']);
  assert(allowed.length === 3, 'owner só p1');
  console.log('OK testOwnerProjectScope');
}

function testCurrencyFormat() {
  const formatted = formatLotReportCurrency(70960.69).replace(/\u00a0/g, ' ');
  assert(formatted === 'R$ 70.960,69', `moeda pt-BR, got ${formatted}`);
  console.log('OK testCurrencyFormat');
}

function testAreaFormat() {
  assert(
    formatLotReportArea(1163.29) === '1.163,29 m²',
    `área pt-BR, got ${formatLotReportArea(1163.29)}`,
  );
  console.log('OK testAreaFormat');
}

function testSanitization() {
  const rows = mapBlocksToLotReportRows([
    {
      project_id: 'p1',
      block_name: undefined,
      number: null,
      area: undefined,
      price: 'NaN',
      status: 'null',
      projects: { name: undefined },
    },
  ]);
  const json = JSON.stringify(rows);
  assertNotIncludes(json, 'undefined', 'sem undefined');
  assertNotIncludes(json, 'null', 'sem null');
  assertNotIncludes(json, 'NaN', 'sem NaN');
  assert(rows[0].areaM2 === 0, 'área vazia = 0');
  assert(rows[0].price === 0, 'valor vazio = 0');
  assert(sanitizeLotReportText('undefined') === '', 'sanitize undefined');
  console.log('OK testSanitization');
}

function testPermissions() {
  assert(canExportLotReport('ADMIN'), 'admin exporta');
  assert(canExportLotReport('SUPER_ADMIN'), 'super admin exporta');
  assert(canExportLotReport('OWNER'), 'owner exporta');
  assert(!canExportLotReport('BROKER'), 'broker não exporta');
  assert(!canExportLotReport('CORRETOR'), 'corretor não exporta');
  console.log('OK testPermissions');
}

function testMenesesSample() {
  const meneses = filterBlocksByProjectIds(blocksFixture, ['p1']);
  const result = buildLotReport(meneses, {
    groupBy: 'valor',
    sortBy: 'valor_desc',
    filters: allFilters,
  });
  assert(result.summary.totalLots === 3, 'meneses 3 lotes');
  console.log('OK testMenesesSample');
}

function testRecantoSample() {
  const recanto = filterBlocksByProjectIds(blocksFixture, ['p2']);
  const result = buildLotReport(recanto, {
    groupBy: 'quadra',
    sortBy: 'quadra_lote',
    filters: allFilters,
  });
  assert(result.summary.totalLots === 2, 'recanto 2 lotes');
  assert(result.rows[0].projectName === 'Recanto Primavera', 'nome recanto');
  console.log('OK testRecantoSample');
}

function testFilename() {
  const name = buildLotReportFilename('Recanto Primavera', 'excel', new Date('2026-06-18T12:00:00Z'));
  assert(name.startsWith('relatorio-lotes-recanto-primavera-'), name);
  assert(name.endsWith('.xlsx'), name);
  console.log('OK testFilename');
}

function testSortByValue() {
  const rows = sortLotReportRows(
    mapBlocksToLotReportRows(blocksFixture),
    'valor_asc',
  );
  assert(rows[0].price <= rows[rows.length - 1].price, 'ordenado por valor');
  console.log('OK testSortByValue');
}

function testStatusFilterHelper() {
  const rows = mapBlocksToLotReportRows(blocksFixture);
  const onlySold = filterLotReportRowsByStatus(rows, {
    includeAvailable: false,
    includeReserved: false,
    includeSold: true,
    includePaid: false,
  });
  assert(onlySold.length === 1, 'filtro vendido');
  console.log('OK testStatusFilterHelper');
}

function main() {
  testGroupByQuadra();
  testGroupByValor();
  testGroupByStatus();
  testNoGrouping();
  testFilterOnlyAvailable();
  testAllEnterprises();
  testSpecificProject();
  testOwnerProjectScope();
  testCurrencyFormat();
  testAreaFormat();
  testSanitization();
  testPermissions();
  testMenesesSample();
  testRecantoSample();
  testFilename();
  testSortByValue();
  testStatusFilterHelper();
  console.log('OK — mandatory-lot-report-export-tests passed');
}

main();
