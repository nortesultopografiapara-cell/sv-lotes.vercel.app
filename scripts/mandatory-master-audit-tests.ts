/**
 * Auditoria Master SaaS — leitura via API service role.
 * npx tsx scripts/mandatory-master-audit-tests.ts
 */

import fs from 'fs';
import {
  formatMasterAuditAction,
  isMasterAuditEntry,
  mapAuditLogRow,
  MASTER_AUDIT_MODULES,
  normalizeAuditLogRow,
  resolveAuditCompanyId,
} from '../lib/masterAudit';
import {
  loadMasterAuditLogs,
  MASTER_AUDIT_QUERY_TIMEOUT_MS,
  MASTER_AUDIT_ROW_LIMIT,
  withMasterAuditTimeout,
} from '../lib/masterAuditLoad';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testMasterAuditEntryFilter() {
  assert(
    isMasterAuditEntry({ module: 'SUBSCRIPTIONS', action: 'SAAS_PAYMENT_REGISTERED' }),
    'pagamento assinatura',
  );
  assert(
    isMasterAuditEntry({ module: 'SAAS_BILLING', action: 'WHATSAPP_TEST_SENT' }),
    'whatsapp saas billing',
  );
  assert(
    isMasterAuditEntry({ module: null, action: 'COMPANY_STATUS_CHANGED' }),
    'status empresa sem module',
  );
  assert(
    !isMasterAuditEntry({ module: 'GIS', action: 'TXT_CIVIL3D_IMPORT' }),
    'gis fora do escopo master',
  );
  console.log('OK testMasterAuditEntryFilter');
}

function testNormalizeAuditLogRow() {
  const normalized = normalizeAuditLogRow({
    id: '1',
    action: 'COMPANY_STATUS_CHANGED',
    details: '{"old_status":"Ativa","new":"Inadimplente"}',
    company_id: 'company-1',
    created_at: '2026-06-01T12:00:00Z',
  });

  assert(normalized.description?.includes('Inadimplente'), 'details vira description');
  assert(resolveAuditCompanyId(normalized) === 'company-1', 'company_id fallback');

  const mapped = mapAuditLogRow(
    normalized,
    { 'company-1': 'Empresa Teste' },
    { 'user-1': 'Admin Master' },
  );
  assert(mapped.company_name === 'Empresa Teste', 'empresa mapeada');
  assert(mapped.action === 'Alteração de status da empresa', 'ação legível');
  console.log('OK testNormalizeAuditLogRow');
}

function testAuditPageUsesApiRoute() {
  const page = fs.readFileSync('app/master/audit/page.tsx', 'utf8');
  assert(page.includes('/api/master/audit'), 'página usa API master audit');
  assert(page.includes('fetchJsonWithTimeout'), 'fetch com timeout');
  assert(!page.includes('loadMasterAuditLogs(supabase)'), 'não lê audit_logs no browser');
  assert(page.includes('authLoading'), 'aguarda auth antes de carregar');
  assert(page.includes('setWarning'), 'falha vira aviso, não erro vermelho');
  console.log('OK testAuditPageUsesApiRoute');
}

function testAuditLoadPerformanceGuards() {
  assert(typeof loadMasterAuditLogs === 'function', 'load export');
  assert(MASTER_AUDIT_ROW_LIMIT === 100, 'limite 100 registros');
  assert(MASTER_AUDIT_QUERY_TIMEOUT_MS > 0, 'timeout interno');

  const loader = fs.readFileSync('lib/masterAuditLoad.ts', 'utf8');
  assert(loader.includes("from('audit_logs')"), 'tabela audit_logs');
  assert(loader.includes('.range(0, MASTER_AUDIT_ROW_LIMIT - 1)'), 'paginação range');
  assert(loader.includes(".in('module',"), 'filtra módulos master na query');
  assert(loader.includes('MASTER_AUDIT_MODULES'), 'usa lista de módulos master');
  assert(!loader.includes('old_data'), 'sem colunas jsonb pesadas');
  assert(!loader.includes('new_data'), 'sem colunas jsonb pesadas');
  assert(loader.includes(".in('id', companyIds)"), 'companies escopadas');
  assert(loader.includes(".in('id', userIds)"), 'users escopados');
  assert(loader.includes('withMasterAuditTimeout'), 'timeout por fase');
  console.log('OK testAuditLoadPerformanceGuards');
}

function testAuditApiRouteShape() {
  const route = fs.readFileSync('app/api/master/audit/route.ts', 'utf8');
  assert(route.includes('createServiceSupabase'), 'service role');
  assert(route.includes('[master-audit] start'), 'log start');
  assert(route.includes('[master-audit] logs_query_ms'), 'log query');
  assert(route.includes('[master-audit] enrich_ms'), 'log enrich');
  assert(route.includes('[master-audit] total_ms'), 'log total');
  assert(route.includes('[master-audit] rows'), 'log rows');
  console.log('OK testAuditApiRouteShape');
}

function testAuditActionLabels() {
  assert(
    formatMasterAuditAction('SAAS_CHARGE_CREATED').toLowerCase().includes('saas'),
    'ação saas legível',
  );
  assert(MASTER_AUDIT_MODULES.includes('SUBSCRIPTIONS'), 'módulo subscriptions');
  console.log('OK testAuditActionLabels');
}

async function testAuditTimeoutHelper() {
  await withMasterAuditTimeout(
    new Promise<string>((resolve) => {
      setTimeout(() => resolve('ok'), 10);
    }),
    500,
    'test',
  );
  let timedOut = false;
  try {
    await withMasterAuditTimeout(
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('late'), 200);
      }),
      50,
      'slow',
    );
  } catch {
    timedOut = true;
  }
  assert(timedOut, 'timeout helper rejeita operação lenta');
  console.log('OK testAuditTimeoutHelper');
}

async function main() {
  testMasterAuditEntryFilter();
  testNormalizeAuditLogRow();
  testAuditPageUsesApiRoute();
  testAuditLoadPerformanceGuards();
  testAuditApiRouteShape();
  testAuditActionLabels();
  await testAuditTimeoutHelper();
  console.log('mandatory-master-audit-tests: all passed');
}

void main();
