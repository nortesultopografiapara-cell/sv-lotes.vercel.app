import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isMasterAuditEntry,
  mapAuditLogRow,
  MASTER_AUDIT_MODULES,
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

/** Máximo de linhas retornadas da tabela (sem count global). */
export const MASTER_AUDIT_ROW_LIMIT = 100;

/** Timeout interno por fase da leitura (ms). */
export const MASTER_AUDIT_QUERY_TIMEOUT_MS = 8_000;

const AUDIT_LOG_SELECT_LEAN =
  'id, action, module, description, created_at, tenant_id, company_id, user_id';

const AUDIT_LOG_SELECT_WITH_DETAILS =
  'id, action, module, description, details, created_at, tenant_id, company_id, user_id';

export function resolveUserDisplayName(user: {
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
}): string {
  return user.full_name || user.name || user.email || 'Usuário';
}

function isMissingColumnError(message: string): boolean {
  return (
    message.includes('column') ||
    message.includes('does not exist') ||
    message.includes('Could not find')
  );
}

export async function withMasterAuditTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} excedeu ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function queryAuditLogsPage(supabase: SupabaseClient, select: string) {
  return supabase
    .from('audit_logs')
    .select(select)
    .in('module', [...MASTER_AUDIT_MODULES])
    .order('created_at', { ascending: false })
    .range(0, MASTER_AUDIT_ROW_LIMIT - 1);
}

async function queryAuditLogs(supabase: SupabaseClient) {
  const lean = await queryAuditLogsPage(supabase, AUDIT_LOG_SELECT_LEAN);
  if (!lean.error) return lean;

  const message = lean.error.message || '';
  if (!isMissingColumnError(message)) return lean;

  if (message.includes('description')) {
    return queryAuditLogsPage(supabase, AUDIT_LOG_SELECT_WITH_DETAILS);
  }

  if (message.includes('details')) {
    return queryAuditLogsPage(supabase, AUDIT_LOG_SELECT_LEAN);
  }

  if (message.includes('module')) {
    return supabase
      .from('audit_logs')
      .select(AUDIT_LOG_SELECT_LEAN)
      .order('created_at', { ascending: false })
      .range(0, MASTER_AUDIT_ROW_LIMIT - 1);
  }

  return lean;
}

export async function loadMasterAuditLogs(
  supabase: SupabaseClient,
  options?: { queryTimeoutMs?: number },
): Promise<MasterAuditLoadResult> {
  const queryTimeoutMs = options?.queryTimeoutMs ?? MASTER_AUDIT_QUERY_TIMEOUT_MS;
  const errors: string[] = [];

  const logsQueryStarted = Date.now();
  let logsRes: Awaited<ReturnType<typeof queryAuditLogs>>;
  try {
    logsRes = await withMasterAuditTimeout(
      queryAuditLogs(supabase),
      queryTimeoutMs,
      'audit_logs',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao consultar audit_logs';
    throw new Error(message);
  }
  const logsQueryMs = Date.now() - logsQueryStarted;

  if (logsRes.error) {
    errors.push(`audit_logs: ${logsRes.error.message}`);
  }

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

  const companyNames: Record<string, string> = {};
  const userNames: Record<string, string> = {};

  const enrichStarted = Date.now();
  const enrichTimeoutMs = Math.max(2_000, queryTimeoutMs - 1_000);

  if (companyIds.length > 0) {
    try {
      const companiesRes = await withMasterAuditTimeout(
        supabase.from('companies').select('id, name').in('id', companyIds),
        enrichTimeoutMs,
        'companies',
      );
      if (companiesRes.error) {
        errors.push(`companies: ${companiesRes.error.message}`);
      } else {
        for (const company of companiesRes.data || []) {
          companyNames[company.id] = company.name || '—';
        }
      }
    } catch (err) {
      errors.push(
        err instanceof Error ? err.message : 'Falha ao resolver nomes de empresas',
      );
    }
  }

  if (userIds.length > 0) {
    try {
      const usersRes = await withMasterAuditTimeout(
        supabase.from('users').select('id, full_name, name, email').in('id', userIds),
        enrichTimeoutMs,
        'users',
      );
      if (usersRes.error) {
        errors.push(`users: ${usersRes.error.message}`);
      } else {
        for (const user of usersRes.data || []) {
          userNames[user.id] = resolveUserDisplayName(user);
        }
      }
    } catch (err) {
      errors.push(
        err instanceof Error ? err.message : 'Falha ao resolver nomes de usuários',
      );
    }
  }

  const rows = filteredLogs.map((row) => mapAuditLogRow(row, companyNames, userNames));
  const enrichMs = Date.now() - enrichStarted;

  return {
    rows,
    errors,
    rawCount: rawLogs.length,
    filteredCount: rows.length,
    logsQueryMs,
    enrichMs,
  };
}
