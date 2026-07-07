/**
 * Auditoria Master SaaS — leitura via API service role.
 * npx tsx scripts/mandatory-master-audit-tests.ts
 */

import fs from 'fs';
import {
  formatMasterAuditAction,
  isMasterAuditEntry,
  mapAuditLogRow,
  MASTER_AUDIT_SQL_MODULES,
  MASTER_AUDIT_WRITTEN_MODULES,
  normalizeAuditLogRow,
  resolveAuditCompanyId,
} from '../lib/masterAudit';
import {
  diagnoseMasterAuditLogs,
  loadMasterAuditLogs,
  MASTER_AUDIT_ROW_LIMIT,
  MASTER_AUDIT_SELECT,
  MASTER_AUDIT_QUERY_LOG,
  MASTER_AUDIT_USERS_SELECT,
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
    !isMasterAuditEntry({ module: 'GIS', action: 'TXT_CIVIL3D_IMPORT' }),
    'gis fora do escopo master',
  );
  console.log('OK testMasterAuditEntryFilter');
}

function testNormalizeAuditLogRow() {
  const normalized = normalizeAuditLogRow({
    id: '1',
    action: 'COMPANY_STATUS_CHANGED',
    description: 'Status alterado',
    company_id: 'company-1',
    created_at: '2026-06-01T12:00:00Z',
  });

  assert(normalized.description?.includes('Status'), 'description preservada');
  assert(resolveAuditCompanyId(normalized) === 'company-1', 'company_id fallback');

  const mapped = mapAuditLogRow(
    normalized,
    { 'company-1': 'Empresa Teste' },
    { 'user-1': 'Admin Master' },
  );
  assert(mapped.company_name === 'Empresa Teste', 'empresa mapeada');
  assert(mapped.action === 'Alteração de status da empresa', 'ação legível');

  const withoutIds = mapAuditLogRow(
    {
      id: '2',
      action: 'CONTRACT_ARCHIVED',
      module: 'SAAS',
      description: 'Arquivado',
      created_at: '2026-06-01T12:00:00Z',
    },
    {},
    {},
  );
  assert(withoutIds.user_name === 'Sistema', 'sem user_id → Sistema');
  assert(withoutIds.company_name === '—', 'sem company_id → —');
  console.log('OK testNormalizeAuditLogRow');
}

function testAuditPageUsesApiRoute() {
  const page = fs.readFileSync('app/master/audit/page.tsx', 'utf8');
  assert(page.includes('/api/master/audit'), 'página usa API master audit');
  assert(page.includes('fetchJsonWithTimeout'), 'fetch com timeout');
  assert(!page.includes('loadMasterAuditLogs(supabase)'), 'não lê audit_logs no browser');
  assert(page.includes('Nenhum log registrado ainda'), 'mensagem vazia clara');
  assert(page.includes('Não foi possível carregar os logs de auditoria'), 'mensagem erro exclusiva');
  assert(page.includes("viewState === 'error'"), 'estado erro exclusivo');
  assert(page.includes("viewState === 'empty'"), 'estado vazio exclusivo');
  assert(!page.includes('setEmptyHint'), 'sem emptyHint conflitante com erro');
  console.log('OK testAuditPageUsesApiRoute');
}

function testAuditLoadDataSource() {
  assert(typeof loadMasterAuditLogs === 'function', 'load export');
  assert(typeof diagnoseMasterAuditLogs === 'function', 'diagnose export');
  assert(MASTER_AUDIT_ROW_LIMIT === 100, 'limite 100');
  assert(MASTER_AUDIT_QUERY_LOG.includes('LIMIT 100'), 'sql com limite 100');

  const loader = fs.readFileSync('lib/masterAuditLoad.ts', 'utf8');
  assert(loader.includes("from('audit_logs')"), 'fonte audit_logs');
  assert(loader.includes('MASTER_AUDIT_SELECT'), 'select fixo');
  assert(loader.includes("in('module', [...MASTER_AUDIT_SQL_MODULES])"), 'filtro SQL por módulo');
  assert(loader.includes('Promise.all'), 'enrich paralelo');
  assert(loader.includes("console.time('[audit] query')"), 'timer query');
  assert(loader.includes("console.time('[audit] enrich-companies')"), 'timer enrich companies');
  assert(loader.includes("console.time('[audit] enrich-users')"), 'timer enrich users');
  assert(loader.includes('logSupabaseError'), 'log erro supabase');
  assert(loader.includes('MasterAuditLoadError'), 'erro não mascarado');
  assert(!loader.includes('AUDIT_SELECT_VARIANTS'), 'sem waterfall de variantes');
  assert(!loader.includes('MASTER_AUDIT_FETCH_WINDOW'), 'sem janela operacional');
  assert(!loader.includes('queryAuditLogsWindow'), 'sem fallback 250');
  assert(!loader.includes('Promise.race'), 'sem Promise.race');
  assert(!loader.includes('entity_type'), 'sem coluna antiga entity_type');
  assert(!loader.includes('old_data'), 'sem coluna antiga old_data');
  assert(!loader.includes('new_data'), 'sem coluna antiga new_data');
  assert(MASTER_AUDIT_SELECT.includes('created_at'), 'schema real created_at');
  assert(MASTER_AUDIT_SELECT.includes('company_id'), 'schema real company_id');
  assert(!MASTER_AUDIT_SELECT.includes('reference_id'), 'sem reference_id no select lean');
  assert(loader.includes(".in('id', companyIds)"), 'companies escopadas');
  assert(loader.includes(".in('id', userIds)"), 'users escopados');
  assert(MASTER_AUDIT_USERS_SELECT.includes('full_name'), 'users select full_name');
  assert(MASTER_AUDIT_USERS_SELECT.includes('email'), 'users select email');
  assert(!MASTER_AUDIT_USERS_SELECT.split(',').map((c) => c.trim()).includes('name'), 'users sem coluna name');
  console.log('OK testAuditLoadDataSource');
}

function testSqlModulesCatalog() {
  assert(MASTER_AUDIT_SQL_MODULES.includes('CONTRACTS'), 'sql contracts');
  assert(MASTER_AUDIT_SQL_MODULES.includes('SAAS_BILLING'), 'sql saas billing');
  assert(MASTER_AUDIT_SQL_MODULES.includes('SAAS'), 'sql saas');
  assert(MASTER_AUDIT_SQL_MODULES.includes('COMPANIES'), 'sql companies');
  assert(MASTER_AUDIT_SELECT.includes('created_at'), 'select com created_at');
  assert(!MASTER_AUDIT_SQL_MODULES.includes('GIS' as never), 'gis fora do sql');
  assert(MASTER_AUDIT_SELECT.includes('created_at'), 'select com created_at');
  console.log('OK testSqlModulesCatalog');
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
      tenant_id: null,
      company_id: null,
      user_id: null,
    },
  ];

  let parallelEnrich = false;

  const supabase = {
    from(table: string) {
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
            parallelEnrich = true;
            resolve({
              data: [{ id: 'company-1', name: 'Empresa Um' }],
              error: null,
            });
            return;
          }
          if (table === 'users') {
            parallelEnrich = true;
            resolve({
              data: [{ id: 'user-1', full_name: 'Admin', email: 'admin@example.com' }],
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
  assert(result.rawCount === 3, 'lê módulos master via SQL');
  assert(result.filteredCount === 3, 'mantém todos os registros');
  assert(result.rows.some((row) => row.action === 'Cobrança SaaS criada'), 'saas billing');
  assert(result.rows.some((row) => row.action === 'Contrato SaaS arquivado'), 'saas');
  assert(
    result.rows.some((row) => row.action === 'Contrato assinado eletronicamente'),
    'contracts',
  );
  assert(
    result.rows.some((row) => row.user_name === 'Sistema' && row.company_name === '—'),
    'registro sem ids não descartado',
  );
  assert(parallelEnrich, 'enrich companies/users acionado');
  console.log('OK testLoadMasterAuditLogsWithRealModules');
}

function testAuditApiRouteShape() {
  const route = fs.readFileSync('app/api/master/audit/route.ts', 'utf8');
  assert(route.includes('createServiceSupabase'), 'service role');
  assert(route.includes('loadMasterAuditLogs'), 'loader único');
  assert(route.includes("console.time('[audit] total')"), 'timer total');
  assert(route.includes('MasterAuditLoadError'), 'propaga erro real');
  assert(route.includes('diagnostics'), 'endpoint diagnóstico');
  assert(route.includes('filteredCount'), 'filteredCount na resposta');
  assert(!route.includes('Promise.race'), 'sem race na rota');
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

async function main() {
  testMasterAuditEntryFilter();
  testNormalizeAuditLogRow();
  testAuditPageUsesApiRoute();
  testAuditLoadDataSource();
  testSqlModulesCatalog();
  await testLoadMasterAuditLogsWithRealModules();
  testAuditApiRouteShape();
  testWrittenModulesCatalog();
  console.log('mandatory-master-audit-tests: all passed');
}

void main();
