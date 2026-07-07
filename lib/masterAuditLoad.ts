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

  const parallelStarted = performance.now();
  const [logsRes, companiesRes, usersRes] = await Promise.all([
    supabase
      .from('audit_logs')
      .select(auditColumns)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('companies').select('id, name'),
    supabase.from('users').select('id, full_name, email'),
  ]);
  logMasterApiStep(
    scope,
    'supabase.parallel_audit_companies_users',
    parallelStarted,
    (logsRes.data?.length ?? 0) + (companiesRes.data?.length ?? 0) + (usersRes.data?.length ?? 0),
  );

  if (logsRes.error) errors.push(`audit_logs: ${logsRes.error.message}`);
  if (companiesRes.error) errors.push(`companies: ${companiesRes.error.message}`);
  if (usersRes.error) errors.push(`users: ${usersRes.error.message}`);

  const mapStarted = performance.now();
  const companyNames = Object.fromEntries(
    (companiesRes.data || []).map((c) => [c.id, c.name || '—']),
  );
  const userNames = Object.fromEntries(
    (usersRes.data || []).map((u) => [u.id, resolveUserDisplayName(u)]),
  );

  const rows = (logsRes.data || [])
    .filter(isMasterAuditEntry)
    .map((row) => mapAuditLogRow(row, companyNames, userNames));
  logMasterApiStep(scope, 'process.map_rows', mapStarted, rows.length);

  return { rows, errors };
}
