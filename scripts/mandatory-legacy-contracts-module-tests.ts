/**
 * Testes — módulo Contratos Antigos (gestão).
 * npm run test:legacy-contracts-module
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildLegacyContractDefinitiveStoragePath,
  resolveLegacyContractUploadStoragePath,
} from '../lib/legacy-contracts/storagePaths';
import {
  canAccessLegacyContractsModule,
  canManageLegacyContractsModule,
} from '../lib/legacy-contracts/permissions';
import { LEGACY_CONTRACTS_ROUTE } from '../lib/legacy-contracts/constants';
import { isBrokerBlockedRoute } from '../lib/rolePermissions';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testPermissions() {
  assert(canAccessLegacyContractsModule('ADMIN'), 'ADMIN acessa');
  assert(canAccessLegacyContractsModule('OWNER'), 'OWNER acessa leitura');
  assert(!canAccessLegacyContractsModule('BROKER'), 'BROKER bloqueado');
  assert(canManageLegacyContractsModule('ADMIN'), 'ADMIN gerencia');
  assert(!canManageLegacyContractsModule('OWNER'), 'OWNER não exclui');
  console.log('OK testPermissions');
}

function testStoragePaths() {
  const definitive = buildLegacyContractDefinitiveStoragePath({
    tenantId: 'tenant-1',
    projectId: 'proj-1',
    quadra: 'QD 01',
    lote: '20',
    fileName: 'contrato severino.pdf',
  });
  assert(definitive.includes('tenant-1/proj-1/'), 'prefixo tenant/projeto');
  assert(definitive.includes('QD_01-20/'), 'quadra-lote normalizados');
  assert(definitive.endsWith('.pdf'), 'extensão pdf');

  const fallback = resolveLegacyContractUploadStoragePath({
    tenantId: 'tenant-1',
    saleId: 'sale-1',
    fileName: 'legado.pdf',
  });
  assert(fallback === 'tenant-1/sale-1/legado.pdf', 'fallback por saleId');

  console.log('OK testStoragePaths');
}

function testRoutesAndUi() {
  assert(fs.existsSync(path.join(ROOT, 'app/legacy-contracts/page.tsx')), 'página');
  assert(fs.existsSync(path.join(ROOT, 'app/api/legacy-contracts/route.ts')), 'api list');
  assert(
    fs.existsSync(path.join(ROOT, 'app/api/legacy-contracts/[id]/route.ts')),
    'api detail/delete',
  );
  assert(
    fs.existsSync(path.join(ROOT, 'app/api/legacy-contracts/[id]/pdf/route.ts')),
    'api pdf',
  );

  const layout = read('components/Layout.tsx');
  assert(layout.includes('Contratos Antigos'), 'menu lateral');
  assert(layout.includes(LEGACY_CONTRACTS_ROUTE), 'rota no menu');

  const pageClient = read('components/legacy-contracts/LegacyContractsPageClient.tsx');
  assert(pageClient.includes('LegacyContractSummaryCards'), 'cards resumo');
  assert(pageClient.includes('LegacyContractsFilters'), 'filtros');
  assert(pageClient.includes('LegacyContractsTable'), 'tabela');

  const migration = read('supabase/migrations/20260706120000_legacy_contract_documents_module.sql');
  assert(migration.includes('link_type'), 'migration link_type');
  assert(migration.includes('is_active'), 'migration soft delete');

  const executeRow = read('lib/imports/modules/legacy-contracts/executeRow.ts');
  assert(executeRow.includes('link_type'), 'execute grava link_type');
  assert(executeRow.includes('migration_id'), 'execute grava migration_id');

  assert(isBrokerBlockedRoute('/legacy-contracts'), 'broker bloqueado na rota');

  console.log('OK testRoutesAndUi');
}

function main() {
  testPermissions();
  testStoragePaths();
  testRoutesAndUi();
  console.log('\nTodos os testes do módulo Contratos Antigos passaram.');
}

main();
