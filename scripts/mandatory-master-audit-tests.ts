/**
 * Auditoria Master SaaS — leitura via API service role.
 * npx tsx scripts/mandatory-master-audit-tests.ts
 */

import fs from 'fs';
import {
  formatMasterAuditAction,
  isMasterAuditEntry,
  mapAuditLogRow,
  normalizeAuditLogRow,
  resolveAuditCompanyId,
} from '../lib/masterAudit';
import { loadMasterAuditLogs } from '../lib/masterAuditLoad';

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
  console.log('OK testAuditPageUsesApiRoute');
}

function testAuditLoadExports() {
  assert(typeof loadMasterAuditLogs === 'function', 'load export');
  const loader = fs.readFileSync('lib/masterAuditLoad.ts', 'utf8');
  assert(loader.includes("from('audit_logs')"), 'tabela audit_logs');
  assert(loader.includes('rawCount'), 'contagem bruta');
  assert(loader.includes('AUDIT_LOG_SELECT_FALLBACK'), 'fallback de colunas');
  console.log('OK testAuditLoadExports');
}

function testAuditApiRouteShape() {
  const route = fs.readFileSync('app/api/master/audit/route.ts', 'utf8');
  assert(route.includes('createServiceSupabase'), 'service role');
  assert(route.includes('rawCount'), 'retorna rawCount');
  assert(route.includes('filteredCount'), 'retorna filteredCount');
  console.log('OK testAuditApiRouteShape');
}

function testAuditActionLabels() {
  assert(
    formatMasterAuditAction('SAAS_CHARGE_CREATED').toLowerCase().includes('saas'),
    'ação saas legível',
  );
  console.log('OK testAuditActionLabels');
}

function main() {
  testMasterAuditEntryFilter();
  testNormalizeAuditLogRow();
  testAuditPageUsesApiRoute();
  testAuditLoadExports();
  testAuditApiRouteShape();
  testAuditActionLabels();
  console.log('mandatory-master-audit-tests: all passed');
}

main();
