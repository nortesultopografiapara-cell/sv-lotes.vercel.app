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
import { buildLegacyContractTenantOrFilter } from '../lib/legacy-contracts/tenantScope';
import {
  isLegacyContractSchemaColumnError,
  LEGACY_CONTRACT_BASE_SELECT,
  LEGACY_CONTRACT_EXTENDED_SELECT,
} from '../lib/legacy-contracts/schemaCompat';
import {
  isLegacyContractStoragePathInTenantScope,
  normalizeLegacyContractStoragePath,
} from '../lib/legacy-contracts/storagePathAccess';
import { LEGACY_CONTRACT_PDF_NOT_FOUND_MESSAGE } from '../lib/legacy-contracts/pdfAccess';

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

function testTenantAndSchemaCompat() {
  const tenantFilter = buildLegacyContractTenantOrFilter('tenant-abc');
  assert(tenantFilter.includes('company_id.eq.tenant-abc'), 'filtro company_id');
  assert(tenantFilter.includes('tenant_id.eq.tenant-abc'), 'filtro tenant_id');

  assert(
    isLegacyContractSchemaColumnError('column legacy_contract_documents.link_type does not exist'),
    'detecta coluna ausente',
  );
  assert(!isLegacyContractSchemaColumnError('permission denied'), 'ignora outros erros');
  assert(LEGACY_CONTRACT_BASE_SELECT.includes('original_file_name'), 'select base');
  assert(LEGACY_CONTRACT_EXTENDED_SELECT.includes('link_type'), 'select estendido');

  console.log('OK testTenantAndSchemaCompat');
}

function testListResilience() {
  const listService = read('lib/legacy-contracts/listService.ts');
  const listClient = read('lib/legacy-contracts/listClient.ts');
  const pageClient = read('components/legacy-contracts/LegacyContractsPageClient.tsx');

  assert(listService.includes('applyTenantScope'), 'listagem usa escopo tenant');
  assert(listService.includes('listWithSchemaFallback'), 'fallback de schema');
  assert(listClient.includes('AbortController'), 'timeout na listagem');
  assert(pageClient.includes('fetchLegacyContractList'), 'page usa cliente com timeout');
  assert(pageClient.includes('resolveActiveTenantId'), 'tenant ativo na página');
  assert(pageClient.includes('Tentar novamente'), 'retry em erro');
  assert(executeRowIncludesFallback(), 'insert com fallback');

  console.log('OK testListResilience');
}

function executeRowIncludesFallback(): boolean {
  const executeRow = read('lib/imports/modules/legacy-contracts/executeRow.ts');
  return executeRow.includes('isLegacyContractSchemaColumnError') && executeRow.includes('extended: false');
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

function testPdfAccessAndFrontend() {
  const pdfRoute = read('app/api/legacy-contracts/[id]/pdf/route.ts');
  const pdfAccess = read('lib/legacy-contracts/pdfAccess.ts');
  const pdfClient = read('lib/legacy-contracts/pdfClient.ts');
  const viewer = read('components/legacy-contracts/LegacyContractPdfViewer.tsx');
  const pageClient = read('components/legacy-contracts/LegacyContractsPageClient.tsx');

  assert(pdfRoute.includes('resolveLegacyContractPdfAccess'), 'rota usa pdfAccess');
  assert(pdfRoute.includes('NextResponse.json({ error:'), 'erros retornam JSON');
  assert(pdfRoute.includes('NextResponse.json(access)'), 'resposta JSON com access completo');
  assert(pdfAccess.includes('mimeType'), 'resposta inclui mimeType');
  assert(pdfAccess.includes('expiresIn'), 'resposta inclui expiresIn');

  assert(
    normalizeLegacyContractStoragePath('legacy-contracts/tenant-1/proj/file.pdf') ===
      'tenant-1/proj/file.pdf',
    'remove prefixo duplicado do bucket',
  );
  assert(
    isLegacyContractStoragePathInTenantScope('tenant-1/proj-1/QD_01-20/file.pdf', 'tenant-1'),
    'path no escopo do tenant',
  );
  assert(
    !isLegacyContractStoragePathInTenantScope('other-tenant/proj/file.pdf', 'tenant-1'),
    'path fora do tenant',
  );
  assert(
    pdfAccess.includes(LEGACY_CONTRACT_PDF_NOT_FOUND_MESSAGE),
    'mensagem arquivo ausente no storage',
  );

  assert(pdfClient.includes('AbortController'), 'timeout no cliente PDF');
  assert(pdfClient.includes('activeTenantId'), 'tenant ativo no cliente PDF');
  assert(pdfClient.includes('openLegacyContractPdfUrl'), 'helper de download');

  assert(viewer.includes('fetchLegacyContractPdfAccess'), 'viewer usa cliente PDF');
  assert(viewer.includes('activeTenantId'), 'viewer recebe tenant ativo');
  assert(viewer.includes('Tentar novamente'), 'retry no modal');
  assert(viewer.includes('finally'), 'viewer limpa loading');
  assert(pageClient.includes('fetchLegacyContractPdfAccess'), 'download usa cliente PDF');
  assert(pageClient.includes('downloadingId'), 'feedback no download da tabela');

  console.log('OK testPdfAccessAndFrontend');
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

  assert(executeRow.includes('isLegacyContractSchemaColumnError'), 'execute fallback schema');

  console.log('OK testRoutesAndUi');
}

function main() {
  testPermissions();
  testTenantAndSchemaCompat();
  testListResilience();
  testStoragePaths();
  testPdfAccessAndFrontend();
  testRoutesAndUi();
  console.log('\nTodos os testes do módulo Contratos Antigos passaram.');
}

main();
