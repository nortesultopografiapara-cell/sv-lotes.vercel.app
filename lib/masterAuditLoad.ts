import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  mapAuditLogRow,
  MASTER_AUDIT_SQL_MODULES,
  normalizeAuditLogRow,
  resolveAuditCompanyId,
  type MasterAuditRow,
  type RawAuditLogRow,
} from '@/lib/masterAudit';

export class MasterAuditLoadError extends Error {
  readonly stage: string;

  constructor(stage: string, message: string) {
    super(message);
    this.name = 'MasterAuditLoadError';
    this.stage = stage;
  }
}

export type MasterAuditLoadResult = {
  rows: MasterAuditRow[];
  errors: string[];
  rawCount: number;
  filteredCount: number;
  logsQueryMs: number;
  enrichMs: number;
};

export type MasterAuditDiagnostics = {
  table: 'audit_logs';
  totalCount: number | null;
  sampleSize: number;
  withTenantId: number;
  withCompanyId: number;
  byModule: Record<string, number>;
  byAction: Record<string, number>;
  masterSampleCount: number;
  notes: string[];
};

/** Linhas retornadas pela API. */
export const MASTER_AUDIT_ROW_LIMIT = 100;

/** Colunas confirmadas no schema real de audit_logs (Supabase produção). */
export const MASTER_AUDIT_SELECT =
  'id, action, module, description, company_id, tenant_id, user_id, created_at';

/** SQL lógico executado (PostgREST). */
export const MASTER_AUDIT_QUERY_LOG = `SELECT ${MASTER_AUDIT_SELECT}
FROM audit_logs
WHERE module IN (${MASTER_AUDIT_SQL_MODULES.join(', ')})
ORDER BY created_at DESC
LIMIT ${MASTER_AUDIT_ROW_LIMIT}`;

export function logSupabaseError(stage: string, error: PostgrestError) {
  console.error('[audit]', {
    stage,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

/** Colunas confirmadas em public.users (produção). */
export const MASTER_AUDIT_USERS_SELECT = 'id, full_name, email';

export function resolveUserDisplayName(user: {
  full_name?: string | null;
  email?: string | null;
}): string {
  const fullName = String(user.full_name || '').trim();
  if (fullName) return fullName;
  const email = String(user.email || '').trim();
  if (email) return email;
  return 'Usuário';
}

function countBucket(map: Record<string, number>, key: string | null | undefined) {
  const bucket = String(key || '(vazio)').trim() || '(vazio)';
  map[bucket] = (map[bucket] || 0) + 1;
}

async function queryMasterAuditLogs(supabase: SupabaseClient) {
  return supabase
    .from('audit_logs')
    .select(MASTER_AUDIT_SELECT)
    .in('module', [...MASTER_AUDIT_SQL_MODULES])
    .order('created_at', { ascending: false })
    .range(0, MASTER_AUDIT_ROW_LIMIT - 1);
}

export async function diagnoseMasterAuditLogs(
  supabase: SupabaseClient,
): Promise<MasterAuditDiagnostics> {
  const notes: string[] = [];
  let totalCount: number | null = null;

  try {
    const countRes = await supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true });
    if (countRes.error) {
      logSupabaseError('diagnostics.count', countRes.error);
      notes.push(`count: ${countRes.error.message}`);
    } else {
      totalCount = countRes.count ?? 0;
    }
  } catch (err) {
    notes.push(err instanceof Error ? err.message : 'count failed');
  }

  const sampleRes = await queryMasterAuditLogs(supabase);
  if (sampleRes.error) {
    logSupabaseError('diagnostics.sample', sampleRes.error);
    notes.push(`sample: ${sampleRes.error.message}`);
  }

  const sample = (sampleRes.data || []) as RawAuditLogRow[];
  const byModule: Record<string, number> = {};
  const byAction: Record<string, number> = {};
  let withTenantId = 0;
  let withCompanyId = 0;

  for (const row of sample) {
    const normalized = normalizeAuditLogRow(row);
    if (normalized.tenant_id) withTenantId += 1;
    if (normalized.company_id) withCompanyId += 1;
    countBucket(byModule, normalized.module);
    countBucket(byAction, normalized.action);
  }

  if (sample.length === 0) {
    notes.push('Nenhum log Master SaaS nos módulos filtrados.');
  }

  return {
    table: 'audit_logs',
    totalCount,
    sampleSize: sample.length,
    withTenantId,
    withCompanyId,
    byModule,
    byAction,
    masterSampleCount: sample.length,
    notes,
  };
}

export async function loadMasterAuditLogs(
  supabase: SupabaseClient,
): Promise<MasterAuditLoadResult> {
  const errors: string[] = [];

  console.log('[audit] sql', MASTER_AUDIT_QUERY_LOG.replace(/\s+/g, ' ').trim());

  console.time('[audit] query');
  const logsQueryStarted = Date.now();
  const logsRes = await queryMasterAuditLogs(supabase);
  const logsQueryMs = Date.now() - logsQueryStarted;
  console.timeEnd('[audit] query');

  if (logsRes.error) {
    logSupabaseError('audit_logs', logsRes.error);
    throw new MasterAuditLoadError(
      'audit_logs',
      logsRes.error.message || 'Falha ao consultar audit_logs',
    );
  }

  const rawLogs = (logsRes.data || []) as RawAuditLogRow[];
  console.log('[audit] rows', rawLogs.length, 'query_ms', logsQueryMs);

  const normalizedLogs = rawLogs.map(normalizeAuditLogRow);

  const companyIds = [
    ...new Set(
      normalizedLogs
        .map((row) => resolveAuditCompanyId(row))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const userIds = [
    ...new Set(
      normalizedLogs
        .map((row) => (row.user_id ? String(row.user_id) : ''))
        .filter(Boolean),
    ),
  ];

  const companyNames: Record<string, string> = {};
  const userNames: Record<string, string> = {};

  console.time('[audit] enrich');
  const enrichStarted = Date.now();
  const enrichTasks: Promise<void>[] = [];

  if (companyIds.length > 0) {
    enrichTasks.push(
      (async () => {
        console.time('[audit] enrich-companies');
        const companiesRes = await supabase
          .from('companies')
          .select('id, name')
          .in('id', companyIds);
        console.timeEnd('[audit] enrich-companies');
        if (companiesRes.error) {
          logSupabaseError('companies', companiesRes.error);
          errors.push(`companies: ${companiesRes.error.message}`);
          return;
        }
        for (const company of companiesRes.data || []) {
          companyNames[company.id] = company.name || '—';
        }
      })(),
    );
  }

  if (userIds.length > 0) {
    enrichTasks.push(
      (async () => {
        console.time('[audit] enrich-users');
        const usersRes = await supabase
          .from('users')
          .select(MASTER_AUDIT_USERS_SELECT)
          .in('id', userIds);
        console.timeEnd('[audit] enrich-users');
        if (usersRes.error) {
          logSupabaseError('users', usersRes.error);
          errors.push(`users: ${usersRes.error.message}`);
          return;
        }
        for (const user of usersRes.data || []) {
          userNames[user.id] = resolveUserDisplayName(user);
        }
      })(),
    );
  }

  if (enrichTasks.length > 0) {
    await Promise.all(enrichTasks);
  }

  const enrichMs = Date.now() - enrichStarted;
  console.timeEnd('[audit] enrich');
  console.log('[audit] enrich_ms', enrichMs, 'company_ids', companyIds.length, 'user_ids', userIds.length);

  const rows = normalizedLogs.map((row) => mapAuditLogRow(row, companyNames, userNames));
  console.log('[audit] filtered', rows.length);

  return {
    rows,
    errors,
    rawCount: rawLogs.length,
    filteredCount: rows.length,
    logsQueryMs,
    enrichMs,
  };
}
