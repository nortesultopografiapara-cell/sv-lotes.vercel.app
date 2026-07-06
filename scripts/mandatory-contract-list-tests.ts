/**
 * Testes — listagem de contratos (tenant/company, select enxuto, contadores).
 * npx tsx scripts/mandatory-contract-list-tests.ts
 */

import fs from 'node:fs';
import {
  CONTRACT_LIST_OPTIONAL_COLUMNS,
  CONTRACT_LIST_SELECT_CORE,
} from '../lib/contractsListService';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testCoreSelectHasNoGeneratedHtml() {
  assert(!CONTRACT_LIST_SELECT_CORE.includes('generated_html'), 'lista sem generated_html');
  assert(CONTRACT_LIST_SELECT_CORE.includes('tenant_id'), 'core tem tenant_id');
  assert(CONTRACT_LIST_SELECT_CORE.includes('contract_number'), 'core tem contract_number');
  console.log('OK testCoreSelectHasNoGeneratedHtml');
}

function testListServiceTenantCompany() {
  const service = fs.readFileSync('lib/contractsListService.ts', 'utf8');
  assert(service.includes('tenant_id.eq.'), 'filtro tenant_id');
  assert(service.includes('company_id.eq.'), 'filtro company_id');
  assert(service.includes('tenant_id_only'), 'fallback tenant_id only');
  assert(service.includes('[contracts/list]'), 'logs [contracts/list]');
  assert(service.includes('parseMissingContractColumn'), 'fallback de coluna ausente');
  console.log('OK testListServiceTenantCompany');
}

function testContractsPageUsesListService() {
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  assert(page.includes('loadContractsListForTenant'), 'page usa list service');
  assert(page.includes('listLoadError'), 'erro de listagem exposto');
  assert(
    !page.includes('CONTRACT_LIST_SELECT'),
    'select legado removido da page',
  );
  console.log('OK testContractsPageUsesListService');
}

function testOptionalColumnsSeparated() {
  assert(CONTRACT_LIST_OPTIONAL_COLUMNS.includes('company_id'), 'company_id opcional');
  assert(!CONTRACT_LIST_SELECT_CORE.includes('company_id'), 'company_id não no core obrigatório');
  console.log('OK testOptionalColumnsSeparated');
}

function testDashboardStatsFromRows() {
  const stats = fs.readFileSync('lib/saleContractDashboardStats.ts', 'utf8');
  assert(stats.includes('computeSaleContractDashboardStats'), 'contadores centralizados');
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  assert(page.includes('computeSaleContractDashboardStats'), 'page usa contadores');
  console.log('OK testDashboardStatsFromRows');
}

function run() {
  testCoreSelectHasNoGeneratedHtml();
  testListServiceTenantCompany();
  testContractsPageUsesListService();
  testOptionalColumnsSeparated();
  testDashboardStatsFromRows();
  console.log('OK — mandatory-contract-list-tests passed');
}

run();
