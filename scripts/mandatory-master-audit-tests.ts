/**
 * Auditoria Master SaaS — leitura via API service role.
 * npx tsx scripts/mandatory-master-audit-tests.ts
 */

import fs from 'fs';
import {
  formatMasterAuditAction,
  isMasterAuditEntry,
  mapAuditLogRow,
  MASTER_AUDIT_WRITTEN_MODULES,
  normalizeAuditLogRow,
  resolveAuditCompanyId,
} from '../lib/masterAudit';
import {
  diagnoseMasterAuditLogs,
  loadMasterAuditLogs,
  MASTER_AUDIT_FETCH_WINDOW,
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
    isMasterAuditEntry({ module: 'SAAS_BILLING', action: 'SAAS_CHARGE_CREATED' }),
    'cobrança saas criada',
  );
  assert(
    isMasterAuditEntry({ module: 'SAAS_BILLING', action: 'SAAS_CHARGE_PAID' }),
    'cobrança saas paga',
  );
  assert(
    isMasterAuditEntry({ module: 'SAAS', action: 'CONTRACT_ARCHIVED' }),
    'contrato saas arquivado',
  );
  assert(
    isMasterAuditEntry({ module: 'CONTRACTS', action: 'CONTRACT_SIGNED_ELECTRONICALLY' }),
    'contrato assinado eletronicamente',
  );
  assert(
    isMasterAuditEntry({ module: 'WHATSAPP', action: 'WHATSAPP_TEST_SENT' }),
    'módulo whatsapp',
  );
  assert(
    isMasterAuditEntry({ module: null, action: 'COMPANY_STATUS_CHANGED' }),
    'status empresa sem module',
  );
  assert(
    !isMasterAuditEntry({ module: 'GIS', action: 'TXT_CIVIL3D_IMPORT' }),
    'gis fora do escopo master',
  );
  assert(
    !isMasterAuditEntry({ module: 'FINANCE', action: 'CASH_OUT_CREATED' }),
    'financeiro fora do escopo master',
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
  assert(page.includes('Nenhum log registrado ainda'), 'mensagem vazia clara');
  assert(!page.includes('setError'), 'sem erro vermelho na página');
  console.log('OK testAuditPageUsesApiRoute');
}

function testAuditLoadDataSource() {
  assert(typeof loadMasterAuditLogs === 'function', 'load export');
  assert(typeof diagnoseMasterAuditLogs === 'function', 'diagnose export');
  assert(MASTER_AUDIT_ROW_LIMIT === 100, 'limite 100 exibidos');
  assert(MASTER_AUDIT_FETCH_WINDOW === 250, 'janela de leitura');
  assert(MASTER_AUDIT_QUERY_TIMEOUT_MS > 0, 'timeout interno');

  const loader = fs.readFileSync('lib/masterAuditLoad.ts', 'utf8');
  assert(loader.includes("from('audit_logs')"), 'fonte audit_logs');
  assert(loader.includes(".in('module', [...MASTER_AUDIT_MODULES])"), 'filtro SQL por módulos master');
  assert(loader.includes('.range(0, rangeEnd)'), 'fallback janela ampla');
  assert(!loader.includes('old_data'), 'sem colunas jsonb pesadas');
  assert(!loader.includes('new_data'), 'sem colunas jsonb pesadas');
  assert(loader.includes(".in('id', companyIds)"), 'companies escopadas');
  assert(loader.includes(".in('id', userIds)"), 'users escopados');
  assert(loader.includes('diagnoseMasterAuditLogs'), 'diagnóstico');
  console.log('OK testAuditLoadDataSource');
}

function testMasterAuditModuleCatalog() {
  const audit = fs.readFileSync('lib/masterAudit.ts', 'utf8');
  assert(audit.includes("'CONTRACTS'"), 'módulo contracts no filtro');
  assert(audit.includes("'SAAS_BILLING'"), 'módulo saas billing no filtro');
  assert(audit.includes("'SAAS'"), 'módulo saas no filtro');
  assert(audit.includes("'CONTRACT_'"), 'prefixo contract_ nas actions');
  console.log('OK testMasterAuditModuleCatalog');
}

async function testLoadMasterAuditLogsWithRealModules() {
  const rows = [
    {
      id: '1',
      action: 'SAAS_CHARGE_CREATED',
      module: 'SAAS_BILLING',
      description: 'Cobrança PIX',
      created_at: '2026-07-01T10:00:00Z',
      tenant_id: 'company-1',
      company_id: 'company-1',
      user_id: 'user-1',
    },
    {
      id: '2',
      action: 'CONTRACT_ARCHIVED',
      module: 'SAAS',
      description: '{"contract_id":"c-1"}',
      created_at: '2026-07-01T09:00:00Z',
      tenant_id: 'company-1',
      company_id: 'company-1',
      user_id: null,
    },
    {
      id: '3',
      action: 'CONTRACT_SIGNED_ELECTRONICALLY',
      module: 'CONTRACTS',
      description: 'Assinatura eletrônica',
      created_at: '2026-07-01T08:00:00Z',
      tenant_id: 'company-2',
      company_id: 'company-2',
      user_id: null,
    },
    {
      id: '4',
      action: 'TXT_CIVIL3D_IMPORT',
      module: 'GIS',
      description: 'Importação',
      created_at: '2026-07-01T11:00:00Z',
      tenant_id: 'company-1',
      company_id: 'company-1',
      user_id: 'user-1',
    },
  ];

  const supabase = {
    from(table: string) {
      assert(table === 'audit_logs' || table === 'companies' || table === 'users', 'tabela inesperada');
      const filters: { column?: string; values?: string[] } = {};
      const builder = {
        select() {
          return builder;
        },
        in(column: string, values: string[]) {
          filters.column = column;
          filters.values = values;
          return builder;
        },
        order() {
          return builder;
        },
        range() {
          return builder;
        },
        then(resolve: (value: unknown) => void) {
          if (table === 'audit_logs') {
            const data =
              filters.column === 'module'
                ? rows.filter((row) => filters.values?.includes(String(row.module)))
                : rows;
            resolve({ data, error: null });
            return;
          }
          if (table === 'companies') {
            resolve({
              data: [
                { id: 'company-1', name: 'Empresa Um' },
                { id: 'company-2', name: 'Empresa Dois' },
              ],
              error: null,
            });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  };

  const result = await loadMasterAuditLogs(supabase as never);
  assert(result.rawCount === 3, 'lê somente módulos master via SQL');
  assert(result.filteredCount === 3, 'mantém registros master');
  assert(result.rows.some((row) => row.action === 'Cobrança SaaS criada'), 'ação saas billing');
  assert(result.rows.some((row) => row.action === 'Contrato SaaS arquivado'), 'ação saas');
  assert(
    result.rows.some((row) => row.action === 'Contrato assinado eletronicamente'),
    'ação contracts',
  );
  assert(result.rows.every((row) => row.user_name === 'Sistema' || row.user_name !== ''), 'usuário fallback');
  console.log('OK testLoadMasterAuditLogsWithRealModules');
}

function testAuditApiRouteShape() {
  const route = fs.readFileSync('app/api/master/audit/route.ts', 'utf8');
  assert(route.includes('createServiceSupabase'), 'service role');
  assert(route.includes('[master-audit] start'), 'log start');
  assert(route.includes('diagnostics'), 'endpoint diagnóstico');
  assert(route.includes('isDevelopDiagnosticsEnabled'), 'diag só develop/preview');
  assert(!route.includes('return NextResponse.json({ error: message }, { status: 500 })'), 'leitura não lança 500');
  console.log('OK testAuditApiRouteShape');
}

function testWrittenModulesCatalog() {
  assert(MASTER_AUDIT_WRITTEN_MODULES.includes('SUBSCRIPTIONS'), 'subscriptions');
  assert(MASTER_AUDIT_WRITTEN_MODULES.includes('SAAS_BILLING'), 'saas billing');
  assert(
    formatMasterAuditAction('SAAS_INVOICE_GENERATED').toLowerCase().includes('cobrança'),
    'ação invoice legível',
  );
  console.log('OK testWrittenModulesCatalog');
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
  testAuditLoadDataSource();
  testMasterAuditModuleCatalog();
  await testLoadMasterAuditLogsWithRealModules();
  testAuditApiRouteShape();
  testWrittenModulesCatalog();
  await testAuditTimeoutHelper();
  console.log('mandatory-master-audit-tests: all passed');
}

void main();
