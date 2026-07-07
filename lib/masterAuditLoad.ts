import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isMasterAuditEntry,
  mapAuditLogRow,
  type MasterAuditRow,
} from '@/lib/masterAudit';
import { logMasterApiStep } from '@/lib/masterApiPerfLog';

export type MasterAuditLoadResult = {
  rows: MasterAuditRow[];
  errors: string[];
};

export function resolveUserDisplayName(user: {
  full_name?: string | null;
  email?: string | null;
}): string {
  return user.full_name || user.email || 'Usuário';
}

export async function loadMasterAuditLogs(
  supabase: SupabaseClient,
): Promise<MasterAuditLoadResult> {
  const scope = 'loadMasterAuditLogs';
  const errors: string[] = [];

  const auditColumns =
    'id, action, module, description, created_at, tenant_id, user_id';

  const logsRes = await supabase
    .from('audit_logs')
    .select(auditColumns)
    .order('created_at', { ascending: false })
    .limit(500);

  if (logsRes.error) errors.push(`audit_logs: ${logsRes.error.message}`);

  const filteredLogs = (logsRes.data || []).filter(isMasterAuditEntry);
  const companyIds = [
    ...new Set(
      filteredLogs
        .map((row) => (row.tenant_id ? String(row.tenant_id) : ''))
        .filter(Boolean),
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
      ? supabase.from('users').select('id, full_name, email').in('id', userIds)
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

  const rows = filteredLogs
    .map((row) => mapAuditLogRow(row, companyNames, userNames));
  logMasterApiStep(scope, 'process.map_rows', mapStarted, rows.length);

  return { rows, errors };
}
