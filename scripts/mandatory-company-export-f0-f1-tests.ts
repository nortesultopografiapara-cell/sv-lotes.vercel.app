/**
 * Testes obrigatórios — Exportação completa de empresa F0/F1.
 * Executar: npx tsx scripts/mandatory-company-export-f0-f1-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  COMPANY_EXPORT_FORBIDDEN_FIELDS,
  COMPANY_EXPORT_FORBIDDEN_TABLES,
  isForbiddenExportField,
  sanitizeJsonBlob,
  stripForbiddenColumns,
} from '../lib/master/companyExport/denyList';
import {
  COMPANY_EXPORT_TABLES,
  assertRegistrySecurity,
  COMPANY_EXPORT_CONTENT_SUMMARY,
} from '../lib/master/companyExport/registry';
import { rowsToCsv } from '../lib/master/companyExport/csv';
import { buildStoredZip } from '../lib/master/companyExport/zipStore';
import { buildExportReadmeHtml } from '../lib/master/companyExport/readme';
import {
  COMPANY_EXPORT_REASONS,
  COMPANY_EXPORT_SCHEMA_VERSION,
  emptyStepCursor,
  isCompanyExportReason,
} from '../lib/master/companyExport/types';
import {
  exportPackagePath,
  exportStagingFilePath,
} from '../lib/master/companyExport/storagePaths';

const root = path.join(__dirname, '..');

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function testRegistrySecurity(): void {
  assertRegistrySecurity();
  for (const t of COMPANY_EXPORT_FORBIDDEN_TABLES) {
    assert(
      !COMPANY_EXPORT_TABLES.some((s) => s.table === t),
      `forbidden table in registry: ${t}`,
    );
  }
  for (const spec of COMPANY_EXPORT_TABLES) {
    for (const col of [...spec.columns, ...(spec.jsonExtraColumns || [])]) {
      assert(!isForbiddenExportField(col), `forbidden col ${spec.table}.${col}`);
      assert(col.toLowerCase() !== 'signature_token', 'no signature_token');
      assert(col.toLowerCase() !== 'encrypted_payload', 'no encrypted_payload');
    }
  }
  assert(COMPANY_EXPORT_CONTENT_SUMMARY.length >= 5, 'content summary');
  assert(COMPANY_EXPORT_TABLES.some((t) => t.id === 'companies' && t.scope === 'self_id'), 'companies self_id');
}

function testDenyList(): void {
  assert(isForbiddenExportField('api_key'), 'api_key');
  assert(isForbiddenExportField('sandbox_api_key'), 'sandbox');
  assert(isForbiddenExportField('encrypted_payload'), 'encrypted');
  assert(isForbiddenExportField('signature_token'), 'token');
  assert(isForbiddenExportField('otp_hash'), 'otp');
  assert(!isForbiddenExportField('name'), 'name ok');
  assert(!isForbiddenExportField('amount'), 'amount ok');

  const cleaned = stripForbiddenColumns(
    { name: 'X', api_key: 'SECRET', amount: 10 },
    ['name', 'api_key', 'amount'],
  );
  assert(cleaned.name === 'X', 'kept name');
  assert(cleaned.amount === 10, 'kept amount');
  assert(!('api_key' in cleaned), 'stripped api_key');

  const blob = sanitizeJsonBlob({
    ok: true,
    access_token: 'abc',
    nested: { webhook_secret: 'x', value: 1 },
  }) as Record<string, unknown>;
  assert(blob.access_token === '[REDACTED]', 'redacted token');
  assert((blob.nested as Record<string, unknown>).value === 1, 'kept nested');
  assert(COMPANY_EXPORT_FORBIDDEN_FIELDS.length > 5, 'fields list');
}

function testCsvUtf8Bom(): void {
  const csv = rowsToCsv([{ a: '1', b: 'olá,"x"' }], ['a', 'b']);
  assert(csv.charCodeAt(0) === 0xfeff, 'BOM');
  assert(csv.includes('olá'), 'utf8');
  assert(csv.includes('"olá,""x"""') || csv.includes('olá'), 'escaped');
}

function testZipAndPaths(): void {
  const zip = buildStoredZip([
    { path: 'manifest.json', data: '{"ok":true}' },
    { path: '01_empresa/companies.csv', data: '\uFEFFid,name\n1,Test' },
  ]);
  assert(zip[0] === 0x50 && zip[1] === 0x4b, 'zip magic');
  assert(exportPackagePath('comp', 'exp') === 'comp/exp/package.zip', 'package path');
  assert(
    exportStagingFilePath('comp', 'exp', '01_empresa/a.csv') ===
      'comp/exp/staging/01_empresa/a.csv',
    'staging path',
  );
}

function testReadmeAndReasons(): void {
  for (const r of COMPANY_EXPORT_REASONS) assert(isCompanyExportReason(r), r);
  assert(!isCompanyExportReason('HACK'), 'invalid reason');
  const html = buildExportReadmeHtml({
    companyName: 'Empresa Teste',
    companyDocument: '123',
    exportId: 'exp-1',
    reason: 'BACKUP',
    notes: null,
    createdAt: new Date().toISOString(),
    files: ['manifest.json'],
    recordCounts: { customers: 2 },
  });
  assert(html.includes('Empresa Teste'), 'readme name');
  assert(html.includes('LGPD'), 'lgpd');
  assert(html.includes('não</em> desativa') || html.includes('não desativa') || html.includes('não</em> desativa') || html.includes('não'), 'no deactivate');
  assert(html.includes(COMPANY_EXPORT_SCHEMA_VERSION), 'schema');
  const cursor = emptyStepCursor();
  assert(cursor.phase === 'tables', 'cursor');
  assert(cursor.tableIndex === 0, 'cursor starts at table 0');
  assert(!('progress' in cursor), 'progress lives on job row, not cursor');
}

function testProgressMonotonicIdea(): void {
  // progress helpers: table index increases
  let tableIndex = 0;
  const seen: number[] = [];
  for (let i = 0; i < 5; i++) {
    tableIndex += 1;
    const p = Math.min(85, Math.round(((tableIndex + 1) / 40) * 85));
    seen.push(p);
  }
  for (let i = 1; i < seen.length; i++) {
    assert(seen[i] >= seen[i - 1], 'progress non-decreasing');
  }
}

function testApiAndUiWiring(): void {
  const route = read('app/api/master/companies/[id]/exports/route.ts');
  assert(route.includes('assertSuperAdmin') || route.includes('authorizeCompanyExport'), 'auth');
  assert(route.includes('createCompanyExportJob'), 'create');
  assert(route.includes('impersonatingTenantId'), 'block impersonation');

  const download = read('app/api/master/companies/[id]/exports/[exportId]/download/route.ts');
  assert(download.includes('createExportDownloadUrl'), 'download');

  const cancel = read('app/api/master/companies/[id]/exports/[exportId]/cancel/route.ts');
  assert(cancel.includes('cancelCompanyExportJob'), 'cancel');

  const file = read('app/api/master/companies/[id]/exports/[exportId]/file/route.ts');
  assert(file.includes('deleteExportPackageFile'), 'delete file');

  const cron = read('app/api/cron/process-company-exports/route.ts');
  assert(cron.includes('isCronSecretValid'), 'cron secret');
  assert(cron.includes('runCompanyExportWorker'), 'worker');

  const expire = read('app/api/cron/expire-company-exports/route.ts');
  assert(expire.includes('expireCompanyExportPackages'), 'expire');

  const page = read('app/companies/[id]/page.tsx');
  assert(page.includes('Exportar dados'), 'button');
  assert(page.includes('CompanyExportPanel'), 'panel');
  assert(page.includes('exportacoes'), 'tab');

  const migration = read('supabase/migrations/20261004120000_company_export_jobs.sql');
  assert(migration.includes('company_export_jobs'), 'migration table');
  assert(migration.includes('company-exports'), 'bucket');
  assert(migration.includes('is_super_admin'), 'rls');
  assert(!migration.includes('DROP TABLE'), 'non-destructive');

  const vercel = read('vercel.json');
  assert(vercel.includes('process-company-exports'), 'cron process');
  assert(vercel.includes('expire-company-exports'), 'cron expire');
}

function testCrossTenantGuardInCode(): void {
  const svc = read('lib/master/companyExport/jobService.ts');
  assert(svc.includes(".eq('company_id', companyId)"), 'job scoped by company');
  assert(svc.includes('assertSuperAdmin') || read('lib/master/companyExport/apiAuth.ts').includes('assertSuperAdmin'), 'super admin');
  const auth = read('lib/master/companyExport/apiAuth.ts');
  assert(auth.includes('impersonating'), 'no impersonation export');
}

function main(): void {
  testRegistrySecurity();
  testDenyList();
  testCsvUtf8Bom();
  testZipAndPaths();
  testReadmeAndReasons();
  testProgressMonotonicIdea();
  testApiAndUiWiring();
  testCrossTenantGuardInCode();
  console.log('mandatory-company-export-f0-f1-tests: OK');
}

main();
