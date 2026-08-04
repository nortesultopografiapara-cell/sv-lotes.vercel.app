/**
 * Testes obrigatórios — Exportação completa de empresa F2.
 * Executar: npx tsx scripts/mandatory-company-export-f2-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  assertStorageRegistrySecurity,
  COMPANY_EXPORT_ALLOWED_BUCKETS,
  COMPANY_EXPORT_FORBIDDEN_BUCKETS,
  COMPANY_EXPORT_PACKAGE_SPLIT_BYTES,
  COMPANY_EXPORT_STORAGE_SOURCES,
  isAllowedExportBucket,
} from '../lib/master/companyExport/storageRegistry';
import {
  folderContract,
  folderCustomer,
  folderProject,
  sanitizeFolderName,
} from '../lib/master/companyExport/friendlyNames';
import {
  extractStoragePathFromUrl,
  pathBelongsToCompany,
  proveStorageLink,
} from '../lib/master/companyExport/storageInventory';
import { assembleExportPackage, shouldSplitPackage } from '../lib/master/companyExport/packageAssemble';
import {
  COMPANY_EXPORT_SCHEMA_VERSION,
  COMPANY_EXPORT_SCHEMA_VERSION_F1,
  emptyStepCursor,
  normalizeExportOptions,
  normalizeExportVersion,
} from '../lib/master/companyExport/types';
import { isF2Phase } from '../lib/master/companyExport/processF2';
import { blockHasValidGeometry } from '../lib/master/companyExport/generatePlans';

const root = path.join(__dirname, '..');

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function testStorageRegistry(): void {
  assertStorageRegistrySecurity();
  assert(COMPANY_EXPORT_ALLOWED_BUCKETS.includes('company-assets'), 'company-assets');
  assert(COMPANY_EXPORT_ALLOWED_BUCKETS.includes('sale-documents'), 'sale-documents');
  assert(COMPANY_EXPORT_ALLOWED_BUCKETS.includes('legacy-contracts'), 'legacy');
  assert(!isAllowedExportBucket('master-topography-operations'), 'no topo');
  assert(
    (COMPANY_EXPORT_FORBIDDEN_BUCKETS as readonly string[]).includes('contracts'),
    'unused contracts bucket forbidden',
  );
  const asaas = COMPANY_EXPORT_STORAGE_SOURCES.find((s) => s.id === 'asaas_charge_refs');
  assert(Boolean(asaas?.externalReferenceOnly), 'asaas external only');
  assert(asaas?.bucket === null, 'asaas no bucket');
}

function testFriendlyNames(): void {
  assert(sanitizeFolderName('A/B:C*').includes('_') || !sanitizeFolderName('A/B:C*').includes('/'), 'sanitize');
  assert(folderContract('123/2024', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee').includes('Contrato_'), 'contract');
  assert(folderCustomer('João Silva', 'id1').length > 4, 'customer');
  assert(folderProject('Residencial X', 'pid').includes('Residencial'), 'project');
}

function testLinkProof(): void {
  const parents = {
    companyId: 'co-1',
    projectIds: new Set(['p1']),
    saleIds: new Set(['s1']),
    contractIds: new Set(['c1']),
    customerIds: new Set(['u1']),
  };
  assert(proveStorageLink({ companyId: 'co-1' }, parents), 'direct company');
  assert(proveStorageLink({ saleId: 's1' }, parents), 'via sale');
  assert(!proveStorageLink({ saleId: 'other' }, parents), 'reject foreign sale');
  assert(pathBelongsToCompany('co-1/logo.png', 'co-1'), 'path prefix');
  assert(pathBelongsToCompany('contracts/sale-signed/co-1/x.pdf', 'co-1'), 'sale-signed');
  assert(!pathBelongsToCompany('other/logo.png', 'co-1'), 'reject other path');
  const extracted = extractStoragePathFromUrl(
    'https://xyz.supabase.co/storage/v1/object/public/company-assets/co-1/logo.png',
    'co-1',
  );
  assert(extracted === 'co-1/logo.png', `extract url got ${extracted}`);
}

function testPackageSplit(): void {
  assert(!shouldSplitPackage(100), 'small no split');
  assert(shouldSplitPackage(COMPANY_EXPORT_PACKAGE_SPLIT_BYTES + 1), 'over threshold');
  const small = assembleExportPackage([
    { path: '01_empresa/a.csv', data: Buffer.from('a') },
    { path: '05_vendas/b.pdf', data: Buffer.from('b') },
  ]);
  assert(!small.split, 'small package not split');
  assert(small.packageZip.length > 0, 'zip bytes');

  // Force split by mocking large buffers via threshold check only —
  // full multi-hundred-MB not practical in unit test.
  assert(COMPANY_EXPORT_PACKAGE_SPLIT_BYTES === 450 * 1024 * 1024, '450MB threshold');
}

function testTypesAndPhases(): void {
  assert(normalizeExportVersion('F2_COMPLETE') === 'F2_COMPLETE', 'f2');
  assert(normalizeExportVersion('nope') === 'F1_TABULAR', 'fallback f1');
  assert(normalizeExportOptions({}).include_generated_plans === true, 'plans default on');
  assert(normalizeExportOptions({ include_generated_plans: false }).include_generated_plans === false, 'plans off');
  const c = emptyStepCursor('F2_COMPLETE');
  assert(c.exportVersion === 'F2_COMPLETE', 'cursor version');
  assert(c.phase === 'tables', 'start tables');
  assert(isF2Phase('inventory_storage'), 'inventory is f2');
  assert(isF2Phase('generate_memorials'), 'memorials is f2');
  assert(!isF2Phase('readme'), 'readme not f2');
  assert(COMPANY_EXPORT_SCHEMA_VERSION.includes('f2'), 'schema f2');
  assert(COMPANY_EXPORT_SCHEMA_VERSION_F1.includes('f1'), 'schema f1');
}

function testGeometryGate(): void {
  assert(!blockHasValidGeometry({ id: '1' }), 'empty no geo');
  assert(
    blockHasValidGeometry({
      id: '1',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    }),
    'geometry ok',
  );
}

function testWiringFiles(): void {
  const processStep = read('lib/master/companyExport/processStep.ts');
  assert(processStep.includes('processF2Phase'), 'wired processF2');
  assert(processStep.includes('phaseAfterGeojson'), 'geojson branch');
  assert(processStep.includes('assembleExportPackage'), 'package assemble');
  assert(processStep.includes('zip_domains'), 'zip_domains phase');

  const mig = read('supabase/migrations/20261005120000_company_export_f2.sql');
  assert(mig.includes('export_version'), 'migration version');
  assert(mig.includes('F2_COMPLETE'), 'migration f2');
  assert(mig.includes('ADD COLUMN IF NOT EXISTS'), 'additive');
  assert(!/DROP\s+TABLE/i.test(mig), 'no drop table');

  const panel = read('components/master/CompanyExportPanel.tsx');
  assert(panel.includes('includeGeneratedPlans'), 'panel plans');
  assert(panel.includes('F2_COMPLETE'), 'panel f2');

  const saas = read('components/master/saas/SaasCompanyWorkspace.tsx');
  assert(saas.includes('CompanyExportPanel'), 'saas panel');
  assert(saas.includes('exportacoes'), 'saas tab');

  const job = read('lib/master/companyExport/jobService.ts');
  assert(job.includes('export_version'), 'job version');
  assert(job.includes('assertStorageRegistrySecurity'), 'storage assert');

  // No signed URL persistence in package helpers
  const copy = read('lib/master/companyExport/storageCopy.ts');
  assert(!copy.includes('createSignedUrl'), 'copy no signed url');
}

function main(): void {
  testStorageRegistry();
  testFriendlyNames();
  testLinkProof();
  testPackageSplit();
  testTypesAndPhases();
  testGeometryGate();
  testWiringFiles();
  console.log('OK mandatory-company-export-f2-tests');
}

main();
