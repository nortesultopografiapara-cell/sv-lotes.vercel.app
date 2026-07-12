/**
 * Contagem de lotes por empresa no Master SaaS (via project_id).
 * npx tsx scripts/mandatory-master-company-lot-counts-tests.ts
 */

import {
  buildCompanyLotCountsFromProjectsAndBlocks,
  groupProjectIdsByCompany,
} from '../lib/masterCompanyLotCounts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testZeroLots() {
  const counts = buildCompanyLotCountsFromProjectsAndBlocks(
    [{ id: 'p1', tenant_id: 'c1' }],
    [],
  );
  assert((counts['c1'] || 0) === 0, 'empresa sem lotes = 0');
  console.log('OK testZeroLots');
}

function testMultipleProjectsSum() {
  const projects = [
    { id: 'p1', tenant_id: 'c1' },
    { id: 'p2', tenant_id: 'c1' },
    { id: 'p3', company_id: 'c2' },
  ];
  const blocks = [
    { id: 'b1', project_id: 'p1' },
    { id: 'b2', project_id: 'p1' },
    { id: 'b3', project_id: 'p2' },
    { id: 'b4', project_id: 'p3' },
  ];
  const counts = buildCompanyLotCountsFromProjectsAndBlocks(projects, blocks);
  assert(counts['c1'] === 3, `c1 soma projetos got ${counts['c1']}`);
  assert(counts['c2'] === 1, `c2 got ${counts['c2']}`);
  console.log('OK testMultipleProjectsSum');
}

function testAllStatusesCount() {
  const projects = [{ id: 'p1', tenant_id: 'c1' }];
  const blocks = [
    { id: '1', project_id: 'p1' },
    { id: '2', project_id: 'p1' },
    { id: '3', project_id: 'p1' },
    { id: '4', project_id: 'p1' },
  ];
  const counts = buildCompanyLotCountsFromProjectsAndBlocks(projects, blocks);
  assert(counts['c1'] === 4, 'todos os status/lotes contam');
  console.log('OK testAllStatusesCount');
}

function testSoftDeletedExcluded() {
  const projects = [{ id: 'p1', tenant_id: 'c1' }];
  const blocks = [
    { id: '1', project_id: 'p1', deleted_at: null },
    { id: '2', project_id: 'p1', deleted_at: '2026-01-01T00:00:00Z' },
    { id: '3', project_id: 'p1' },
  ];
  const counts = buildCompanyLotCountsFromProjectsAndBlocks(projects, blocks);
  assert(counts['c1'] === 2, `soft deleted excluído got ${counts['c1']}`);
  console.log('OK testSoftDeletedExcluded');
}

function testMultiTenantIsolation() {
  const projects = [
    { id: 'p1', tenant_id: 'c1' },
    { id: 'p2', tenant_id: 'c2' },
  ];
  const blocks = [
    { id: '1', project_id: 'p1' },
    { id: '2', project_id: 'p1' },
    { id: '3', project_id: 'p2' },
  ];
  const counts = buildCompanyLotCountsFromProjectsAndBlocks(projects, blocks);
  assert(counts['c1'] === 2, 'c1 isolado');
  assert(counts['c2'] === 1, 'c2 isolado');
  assert(!counts['c3'], 'outra empresa sem lotes');
  console.log('OK testMultiTenantIsolation');
}

function testOverLimitDisplaysRealTotal() {
  const projects = [{ id: 'p1', tenant_id: 'c1' }];
  const blocks = Array.from({ length: 12 }, (_, i) => ({
    id: `b${i}`,
    project_id: 'p1',
  }));
  const counts = buildCompanyLotCountsFromProjectsAndBlocks(projects, blocks);
  const limit = 10;
  assert(counts['c1'] === 12, 'total real acima do limite');
  assert(counts['c1'] > limit, 'sinalização visual usa used > limit (UI existente)');
  console.log('OK testOverLimitDisplaysRealTotal');
}

function testIgnoresNullTenantOnBlockWhenProjectMaps() {
  // Regressão: buildCompanyBlockCounts antigo usava só tenant_id/company_id do block.
  const projects = [{ id: 'p1', tenant_id: 'sv-topo' }];
  const blocks = [
    { id: '1', project_id: 'p1', tenant_id: null, company_id: null },
    { id: '2', project_id: 'p1', tenant_id: null, company_id: null },
  ];
  const counts = buildCompanyLotCountsFromProjectsAndBlocks(projects, blocks);
  assert(counts['sv-topo'] === 2, 'conta via project mesmo com tenant nulo no block');
  console.log('OK testIgnoresNullTenantOnBlockWhenProjectMaps');
}

function testGroupProjectIds() {
  const grouped = groupProjectIdsByCompany([
    { id: 'p1', tenant_id: 'c1' },
    { id: 'p1', tenant_id: 'c1' },
    { id: 'p2', company_id: 'c1' },
  ]);
  assert(grouped['c1'].length === 2, 'dedupe project ids');
  console.log('OK testGroupProjectIds');
}

function testCompaniesPageUsesExactFetcher() {
  const fs = require('node:fs') as typeof import('node:fs');
  const page = fs.readFileSync('app/companies/page.tsx', 'utf8');
  const lib = fs.readFileSync('lib/masterCompanyLotCounts.ts', 'utf8');
  assert(page.includes('fetchCompanyLotCountsExact'), 'página usa count exact');
  assert(!page.includes("blocks').select('tenant_id, company_id')"), 'não carrega rows só para contar');
  assert(lib.includes('tenant_id.eq.'), 'count exact por tenant_id');
  assert(!/\$\.is\('deleted_at', null\)/.test(lib) && !lib.includes("query.is('deleted_at'"), 'não aplica filtro deleted_at no count SQL');
  assert(lib.includes('NÃO filtrar por deleted_at'), 'documenta motivo do skip deleted_at');
  console.log('OK testCompaniesPageUsesExactFetcher');
}

function testDirectTenantOnBlockCounts() {
  const counts = buildCompanyLotCountsFromProjectsAndBlocks(
    [],
    [
      { id: '1', tenant_id: 'c1' },
      { id: '2', tenant_id: 'c1', company_id: 'c1' },
      { id: '3', company_id: 'c2' },
    ],
  );
  assert(counts['c1'] === 2, 'conta por tenant_id do block');
  assert(counts['c2'] === 1, 'conta por company_id legado');
  console.log('OK testDirectTenantOnBlockCounts');
}

function main() {
  testZeroLots();
  testMultipleProjectsSum();
  testAllStatusesCount();
  testSoftDeletedExcluded();
  testMultiTenantIsolation();
  testOverLimitDisplaysRealTotal();
  testIgnoresNullTenantOnBlockWhenProjectMaps();
  testDirectTenantOnBlockCounts();
  testGroupProjectIds();
  testCompaniesPageUsesExactFetcher();
  console.log('ALL mandatory-master-company-lot-counts-tests PASSED');
}

main();
