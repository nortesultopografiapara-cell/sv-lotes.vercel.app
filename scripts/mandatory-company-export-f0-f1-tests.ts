/**
 * Testes obrigatórios — Exportação completa de empresa F0/F1 (polimento).
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
  COMPANY_EXPORT_SCHEMA_VERSION_F1,
  emptyStepCursor,
  isCompanyExportReason,
} from '../lib/master/companyExport/types';
import {
  exportPackagePath,
  exportStagingFilePath,
} from '../lib/master/companyExport/storagePaths';
import {
  buildBlockGeoFeature,
  blocksRowsToGeoJson,
  geometryFromBlockGeometry,
  geometryFromSegmentsJson,
} from '../lib/master/companyExport/blockGeoJson';
import {
  classifyPostgrestError,
  sanitizeExportWarning,
} from '../lib/master/companyExport/postgrestErrors';
import { readStoredContractHtml } from '../lib/contractHtmlGlobal';

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
      assert(col.toLowerCase() !== 'geojson', 'no nonexistent geojson column in registry');
    }
  }
  assert(COMPANY_EXPORT_CONTENT_SUMMARY.length >= 5, 'content summary');
  assert(COMPANY_EXPORT_TABLES.some((t) => t.id === 'companies' && t.scope === 'self_id'), 'companies self_id');
}

function testUsersRegistrySchema(): void {
  const users = COMPANY_EXPORT_TABLES.find((t) => t.id === 'users');
  assert(Boolean(users), 'users spec');
  assert(users!.scope === 'tenant_id', 'users scoped by tenant_id');
  assert(users!.columns.includes('full_name'), 'full_name');
  assert(users!.columns.includes('email'), 'email');
  assert(users!.columns.includes('role'), 'role');
  assert(users!.columns.includes('status'), 'status');
  assert(users!.columns.includes('tenant_id'), 'tenant_id col');
  assert(!users!.columns.includes('name'), 'no name column');
  assert(!users!.columns.includes('company_id'), 'no company_id on users');
  assert(!users!.columns.includes('password'), 'no password');
  assert(!users!.columns.includes('password_hash'), 'no password_hash');
  assert(!users!.columns.includes('refresh_token'), 'no refresh_token');
}

function testDenyList(): void {
  assert(isForbiddenExportField('api_key'), 'api_key');
  assert(isForbiddenExportField('sandbox_api_key'), 'sandbox');
  assert(isForbiddenExportField('encrypted_payload'), 'encrypted');
  assert(isForbiddenExportField('signature_token'), 'token');
  assert(isForbiddenExportField('otp_hash'), 'otp');
  assert(isForbiddenExportField('refresh_token'), 'refresh');
  assert(isForbiddenExportField('provider_token'), 'provider');
  assert(!isForbiddenExportField('name'), 'name ok');
  assert(!isForbiddenExportField('amount'), 'amount ok');

  const cleaned = stripForbiddenColumns(
    { name: 'X', api_key: 'SECRET', amount: 10, unknown_extra: 'nope' },
    ['name', 'api_key', 'amount'],
  );
  assert(cleaned.name === 'X', 'kept name');
  assert(cleaned.amount === 10, 'kept amount');
  assert(!('api_key' in cleaned), 'stripped api_key');
  assert(!('unknown_extra' in cleaned), 'allow-list drops unknown');

  const blob = sanitizeJsonBlob({
    ok: true,
    access_token: 'abc',
    nested: { webhook_secret: 'x', value: 1 },
  }) as Record<string, unknown>;
  assert(blob.access_token === '[REDACTED]', 'redacted token');
  assert((blob.nested as Record<string, unknown>).value === 1, 'kept nested');
  assert(COMPANY_EXPORT_FORBIDDEN_FIELDS.length > 5, 'fields list');
}

function testBlockGeoJson(): void {
  const withGeom = buildBlockGeoFeature({
    id: 'b1',
    project_id: 'p1',
    block_name: 'Q1',
    lot_number: '01',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-49.8, -6.1],
          [-49.7, -6.1],
          [-49.7, -6.0],
          [-49.8, -6.0],
          [-49.8, -6.1],
        ],
      ],
    },
  });
  assert(withGeom.source === 'geometry', 'geometry source');
  assert(withGeom.feature.geometry?.type === 'Polygon', 'polygon');

  const g = geometryFromBlockGeometry({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-49, -6] },
  });
  assert(g?.type === 'Point', 'feature unwrap');

  const fromSeg = geometryFromSegmentsJson([
    { lat: -6.1, lng: -49.8 },
    { lat: -6.1, lng: -49.7 },
    { lat: -6.0, lng: -49.7 },
    { lat: -6.0, lng: -49.8 },
  ]);
  assert(fromSeg?.type === 'Polygon', 'segments lat/lng polygon');

  const utmOnly = buildBlockGeoFeature({
    id: 'b2',
    segments_json: [
      { coordE: 500000, coordN: 9300000 },
      { coordE: 500010, coordN: 9300000 },
    ],
  });
  assert(utmOnly.source === 'none', 'utm segments not used as WGS84');
  assert(utmOnly.feature.geometry === null, 'null geometry');

  const collection = blocksRowsToGeoJson([
    {
      id: 'b1',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    },
    {
      id: 'b2',
      segments_json: [
        { lat: -6.1, lng: -49.8 },
        { lat: -6.1, lng: -49.7 },
        { lat: -6.0, lng: -49.7 },
        { lat: -6.0, lng: -49.8 },
      ],
    },
    { id: 'b3', segments_json: [{ coordE: 1, coordN: 2 }] },
  ]);
  const parsed = JSON.parse(collection.geojson);
  assert(parsed.type === 'FeatureCollection', 'fc');
  assert(parsed.features.length === 3, '3 features');
  assert(collection.withGeometry === 2, '2 with geom');
  assert(collection.withoutGeometry === 1, '1 without');
  assert(collection.sources.segments_json === 1, '1 from segments');
}

function testContractHtmlSource(): void {
  const withHtml = readStoredContractHtml({
    generated_html: '<html><body>OK</body></html>',
    contract_html: '<html>legacy</html>',
  });
  assert(Boolean(withHtml && withHtml.includes('OK')), 'prefers generated_html');

  const empty = readStoredContractHtml({ id: 'c1', contract_number: 'X' });
  assert(empty === null, 'no html');

  const processSrc = read('lib/master/companyExport/processStep.ts');
  assert(processSrc.includes("select('id, contract_number, generated_html')"), 'select generated_html only');
  assert(processSrc.includes('06_contratos/${sanitizeFilePart(id)}/contract.html') || processSrc.includes('contract.html'), 'html path');
  assert(!processSrc.includes('contract_html, content, html'), 'no multi missing cols');
  assert(!processSrc.includes("geojson, coordinates"), 'no geojson col select');
}

function testPostgrestClassification(): void {
  assert(
    classifyPostgrestError(
      "Could not find the 'document' column of 'companies' in the schema cache",
    ) === 'column_missing',
    'column schema cache',
  );
  assert(
    classifyPostgrestError("Could not find the table 'foo' in the schema cache") ===
      'table_missing',
    'table missing',
  );
  assert(classifyPostgrestError('permission denied for table x') === 'permission', 'permission');
  assert(classifyPostgrestError('fetch failed') === 'network', 'network');
  const w = sanitizeExportWarning('users', 'tables', 'coluna ausente');
  assert(w.startsWith('users/tables:'), 'warning format');
  assert(!w.includes('\n'), 'no multiline');
}

function testCsvUtf8Bom(): void {
  const csv = rowsToCsv([{ a: '1', b: 'olá,"x"' }], ['a', 'b']);
  assert(csv.charCodeAt(0) === 0xfeff, 'BOM');
  assert(csv.includes('olá'), 'utf8');
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
  assert(html.includes(COMPANY_EXPORT_SCHEMA_VERSION_F1), 'schema');
  const cursor = emptyStepCursor();
  assert(cursor.phase === 'tables', 'cursor');
  assert(cursor.tableIndex === 0, 'cursor starts at table 0');
}

function testApiAndUiWiring(): void {
  const route = read('app/api/master/companies/[id]/exports/route.ts');
  assert(route.includes('authorizeCompanyExport'), 'auth');
  assert(route.includes('createCompanyExportJob'), 'create');
  assert(route.includes('advanceCompanyExportJob'), 'kick advance');
  assert(route.includes('impersonatingTenantId'), 'block impersonation');

  const detail = read('app/api/master/companies/[id]/exports/[exportId]/route.ts');
  assert(detail.includes('advanceCompanyExportJob'), 'poll advances');
  assert(detail.includes('authorizeCompanyExport'), 'detail auth');

  const download = read('app/api/master/companies/[id]/exports/[exportId]/download/route.ts');
  assert(download.includes('createExportDownloadUrl'), 'download');
  assert(download.includes('authorizeCompanyExport'), 'download auth');

  const cancel = read('app/api/master/companies/[id]/exports/[exportId]/cancel/route.ts');
  assert(cancel.includes('cancelCompanyExportJob'), 'cancel');
  assert(cancel.includes('authorizeCompanyExport'), 'cancel auth');

  const file = read('app/api/master/companies/[id]/exports/[exportId]/file/route.ts');
  assert(file.includes('deleteExportPackageFile'), 'delete package');
  assert(file.includes('authorizeCompanyExport'), 'file auth');

  const cron = read('app/api/cron/process-company-exports/route.ts');
  assert(cron.includes('isCronSecretValid'), 'cron secret');
  assert(cron.includes('runCompanyExportWorker'), 'worker');
  assert(!cron.includes('authorizeCompanyExport'), 'cron not master auth');

  const expire = read('app/api/cron/expire-company-exports/route.ts');
  assert(expire.includes('expireCompanyExportPackages'), 'expire');
  assert(expire.includes('isCronSecretValid'), 'expire cron secret');

  assert(!fs.existsSync(path.join(root, 'app/api/cron/homolog-company-export-f0-f1/route.ts')), 'homolog route removed');
  assert(!fs.existsSync(path.join(root, 'scripts/run-company-export-homolog-preview.ts')), 'homolog driver removed');
  assert(!fs.existsSync(path.join(root, 'scripts/apply-company-export-f0-migration.ts')), 'apply ddl script removed');

  const page = read('app/companies/[id]/page.tsx');
  assert(page.includes('Exportar dados'), 'button');
  assert(page.includes('CompanyExportPanel'), 'panel');

  const panel = read('components/master/CompanyExportPanel.tsx');
  assert(panel.includes('expires_at') || panel.includes('expir'), 'expiry UI');
  assert(panel.includes('CANCELLED') || panel.includes('cancel'), 'cancel UI');
  assert(panel.includes('COMPLETED'), 'completed status');

  const migration = read('supabase/migrations/20261004120000_company_export_jobs.sql');
  assert(migration.includes('company_export_jobs'), 'migration table');
  assert(migration.includes('company-exports'), 'bucket');
  assert(migration.includes('company_export_jobs_super_admin_all'), 'rls policy');
  assert(migration.includes('ENABLE ROW LEVEL SECURITY'), 'rls enabled');
  assert(migration.includes('public = false'), 'private bucket');
  assert(!/^\s*DROP\s+POLICY/im.test(migration), 'no drop policy');

  const vercel = read('vercel.json');
  assert(vercel.includes('process-company-exports'), 'cron process');
  assert(vercel.includes('expire-company-exports'), 'cron expire');
  assert(!vercel.includes('homolog-company-export'), 'no homolog cron config');

  const mw = read('middleware.ts');
  assert(mw.includes('isCompanyExportApi'), 'export APIs reachable without session HTML redirect');
  assert(
    /isCompanyExportApi[\s\S]*isPublicRoute/.test(mw.replace(/\n/g, ' ')),
    'export api only bypasses session gate',
  );
}

function testAuthorizationGuards(): void {
  const auth = read('lib/master/companyExport/apiAuth.ts');
  assert(auth.includes('assertSuperAdmin'), 'assertSuperAdmin');
  assert(auth.includes('impersonatingTenantId'), 'impersonation param');
  assert(auth.includes("status: 403"), '403 on deny');
  assert(auth.includes('Exportação indisponível durante impersonation'), 'impersonation message');

  const routes = [
    'app/api/master/companies/[id]/exports/route.ts',
    'app/api/master/companies/[id]/exports/[exportId]/route.ts',
    'app/api/master/companies/[id]/exports/[exportId]/download/route.ts',
    'app/api/master/companies/[id]/exports/[exportId]/cancel/route.ts',
    'app/api/master/companies/[id]/exports/[exportId]/file/route.ts',
  ];
  for (const r of routes) {
    const src = read(r);
    assert(src.includes('authorizeCompanyExport'), `${r} authorize`);
    assert(!src.includes('isCronSecretValid'), `${r} not cron`);
  }

  const svc = read('lib/master/companyExport/jobService.ts');
  assert(svc.includes(".eq('company_id', companyId)"), 'multi-tenant eq');
  assert(svc.includes('cancelCompanyExportJob'), 'cancel fn');
  assert(svc.includes('expireCompanyExportPackages'), 'expire fn');
  assert(svc.includes('deleteExportPackageFile'), 'delete fn');
  assert(svc.includes('Exportação não encontrada'), 'cross-company miss');
}

function testIsolationGuards(): void {
  const svc = read('lib/master/companyExport/jobService.ts');
  assert(svc.includes(".eq('company_id', companyId)"), 'job scoped by company');
  const process = read('lib/master/companyExport/processStep.ts');
  assert(process.includes('stripForbiddenColumns'), 'sanitize');
  assert(process.includes('usedStarFallback'), 'fallback tracked');
  assert(process.includes('classifyPostgrestError'), 'error classify');
  assert(process.includes('generated_html'), 'contract html source');
  assert(process.includes('blocksRowsToGeoJson') || process.includes('blockGeoJson'), 'geojson helper');
}

function main(): void {
  testRegistrySecurity();
  testUsersRegistrySchema();
  testDenyList();
  testBlockGeoJson();
  testContractHtmlSource();
  testPostgrestClassification();
  testCsvUtf8Bom();
  testZipAndPaths();
  testReadmeAndReasons();
  testApiAndUiWiring();
  testAuthorizationGuards();
  testIsolationGuards();
  console.log('mandatory-company-export-f0-f1-tests: OK');
}

main();
