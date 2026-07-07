import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isMasterAuditEntry,
  mapAuditLogRow,
  normalizeAuditLogRow,
  resolveAuditCompanyId,
  type MasterAuditRow,
  type RawAuditLogRow,
} from '@/lib/masterAudit';
import { logMasterApiStep } from '@/lib/masterApiPerfLog';

export type MasterAuditLoadResult = {
  rows: MasterAuditRow[];
  errors: string[];
  rawCount: number;
  filteredCount: number;
};

const AUDIT_LOG_SELECT_PRIMARY =
  'id, action, module, description, details, created_at, tenant_id, company_id, user_id, entity_type, old_data, new_data';

const AUDIT_LOG_SELECT_FALLBACK =
  'id, action, module, description, created_at, tenant_id, company_id, user_id';

export function resolveUserDisplayName(user: {
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
}): string {
  return user.full_name || user.name || user.email || 'Usuário';
}

async function queryAuditLogs(supabase: SupabaseClient) {
  const primary = await supabase
    .from('audit_logs')
    .select(AUDIT_LOG_SELECT_PRIMARY)
    .order('created_at', { ascending: false })
    .limit(500);

  if (!primary.error) return primary;

  const message = primary.error.message || '';
  const missingColumn =
    message.includes('column') ||
    message.includes('does not exist') ||
    message.includes('Could not find');

  if (!missingColumn) return primary;

  return supabase
    .from('audit_logs')
    .select(AUDIT_LOG_SELECT_FALLBACK)
    .order('created_at', { ascending: false })
    .limit(500);
}

export async function loadMasterAuditLogs(
  supabase: SupabaseClient,
): Promise<MasterAuditLoadResult> {
  const scope = 'loadMasterAuditLogs';
  const errors: string[] = [];

  const logsRes = await queryAuditLogs(supabase);

  if (logsRes.error) errors.push(`audit_logs: ${logsRes.error.message}`);

  const rawLogs = (logsRes.data || []) as RawAuditLogRow[];
  const normalizedLogs = rawLogs.map(normalizeAuditLogRow);
  const filteredLogs = normalizedLogs.filter(isMasterAuditEntry);

  const companyIds = [
    ...new Set(
      filteredLogs
        .map((row) => resolveAuditCompanyId(row))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const userIds = [
    ...new Set(
      filteredLogs
        .map((row) => (row.user_id ? String(row.user_id) : ''))
        .filter(Boolean),
    ),
  ];

  const parallelStarted = performance.now();
  const [companiesRes, usersRes] = await Promise.all([
    companyIds.length
      ? supabase.from('companies').select('id, name').in('id', companyIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabase.from('users').select('id, full_name, name, email').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  logMasterApiStep(
    scope,
    'supabase.scoped_companies_users',
    parallelStarted,
    (companiesRes.data?.length ?? 0) + (usersRes.data?.length ?? 0),
  );

  if (companiesRes.error) errors.push(`companies: ${companiesRes.error.message}`);
  if (usersRes.error) errors.push(`users: ${usersRes.error.message}`);

  const mapStarted = performance.now();
  const companyNames = Object.fromEntries(
    (companiesRes.data || []).map((c) => [c.id, c.name || '—']),
  );
  const userNames = Object.fromEntries(
    (usersRes.data || []).map((u) => [u.id, resolveUserDisplayName(u)]),
  );

  const rows = filteredLogs.map((row) => mapAuditLogRow(row, companyNames, userNames));
  logMasterApiStep(scope, 'process.map_rows', mapStarted, rows.length);

  return {
    rows,
    errors,
    rawCount: rawLogs.length,
    filteredCount: rows.length,
  };
}
