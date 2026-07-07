import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mapAuditLogRow,
  MASTER_AUDIT_SQL_MODULES,
  normalizeAuditLogRow,
  resolveAuditCompanyId,
  type MasterAuditRow,
  type RawAuditLogRow,
} from '@/lib/masterAudit';

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

/** Budget total do servidor (ms) — abaixo do timeout do cliente (15s). */
export const MASTER_AUDIT_SERVER_BUDGET_MS = 10_000;

/** Colunas confirmadas em produção (schema real audit_logs). */
export const MASTER_AUDIT_SELECT =
  'id, action, module, description, company_id, tenant_id, user_id, reference_id, created_at';

export function resolveUserDisplayName(user: {
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
}): string {
  return user.full_name || user.name || user.email || 'Usuário';
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
      notes.push(`count: ${countRes.error.message}`);
    } else {
      totalCount = countRes.count ?? 0;
    }
  } catch (err) {
    notes.push(err instanceof Error ? err.message : 'count failed');
  }

  const sampleRes = await queryMasterAuditLogs(supabase);
  if (sampleRes.error) {
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

  const logsQueryStarted = Date.now();
  const logsRes = await queryMasterAuditLogs(supabase);
  const logsQueryMs = Date.now() - logsQueryStarted;

  if (logsRes.error) {
    errors.push(`audit_logs: ${logsRes.error.message}`);
    return {
      rows: [],
      errors,
      rawCount: 0,
      filteredCount: 0,
      logsQueryMs,
      enrichMs: 0,
    };
  }

  const rawLogs = (logsRes.data || []) as RawAuditLogRow[];
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

  const enrichStarted = Date.now();
  const enrichTasks: Promise<void>[] = [];

  if (companyIds.length > 0) {
    enrichTasks.push(
      (async () => {
        const companiesRes = await supabase
          .from('companies')
          .select('id, name')
          .in('id', companyIds);
        if (companiesRes.error) {
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
        const usersRes = await supabase
          .from('users')
          .select('id, full_name, name, email')
          .in('id', userIds);
        if (usersRes.error) {
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
  const rows = normalizedLogs.map((row) => mapAuditLogRow(row, companyNames, userNames));

  return {
    rows,
    errors,
    rawCount: rawLogs.length,
    filteredCount: rows.length,
    logsQueryMs,
    enrichMs,
  };
}
