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

/** Linhas exibidas na UI. */
export const MASTER_AUDIT_ROW_LIMIT = 100;

/** Janela lida do banco antes do filtro Master (sem filtro SQL por module). */
export const MASTER_AUDIT_FETCH_WINDOW = 250;

/** Timeout interno por fase da leitura (ms). */
export const MASTER_AUDIT_QUERY_TIMEOUT_MS = 12_000;

const AUDIT_SELECT_LEAN =
  'id, action, module, description, created_at, tenant_id, company_id, user_id';

const AUDIT_SELECT_VARIANTS = [
  AUDIT_SELECT_LEAN,
  'id, action, module, description, details, created_at, tenant_id, company_id, user_id',
  'id, action, module, description, created_at, tenant_id, user_id',
  'id, action, entity_type, description, created_at, tenant_id, user_id',
  'id, action, entity_type, created_at, tenant_id, user_id',
  'id, action, module, details, created_at, tenant_id, user_id',
  'id, action, created_at, tenant_id, user_id',
] as const;

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

function countBucket(map: Record<string, number>, key: string | null | undefined) {
  const bucket = String(key || '(vazio)').trim() || '(vazio)';
  map[bucket] = (map[bucket] || 0) + 1;
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

  let sample: RawAuditLogRow[] = [];
  for (const select of [
    'module, action, tenant_id, company_id, entity_type',
    'action, tenant_id, entity_type',
    'action, tenant_id',
  ]) {
    const res = await supabase
      .from('audit_logs')
      .select(select)
      .order('created_at', { ascending: false })
      .range(0, 499);
    if (!res.error) {
      sample = (res.data || []) as RawAuditLogRow[];
      break;
    }
    if (!isMissingColumnError(res.error.message || '')) {
      notes.push(`sample: ${res.error.message}`);
      break;
    }
  }

  const byModule: Record<string, number> = {};
  const byAction: Record<string, number> = {};
  let withTenantId = 0;
  let withCompanyId = 0;
  let masterSampleCount = 0;

  for (const row of sample) {
    const normalized = normalizeAuditLogRow(row);
    if (normalized.tenant_id) withTenantId += 1;
    if (normalized.company_id) withCompanyId += 1;
    countBucket(byModule, normalized.module);
    countBucket(byAction, normalized.action);
    if (isMasterAuditEntry(normalized)) masterSampleCount += 1;
  }

  if (sample.length === 0) {
    notes.push('Amostra recente vazia em audit_logs.');
  }

  return {
    table: 'audit_logs',
    totalCount,
    sampleSize: sample.length,
    withTenantId,
    withCompanyId,
    byModule,
    byAction,
    masterSampleCount,
    notes,
  };
}

async function queryAuditLogsWindow(
  supabase: SupabaseClient,
  select: string,
  rangeEnd: number = MASTER_AUDIT_FETCH_WINDOW - 1,
) {
  return supabase
    .from('audit_logs')
    .select(select)
    .order('created_at', { ascending: false })
    .range(0, rangeEnd);
}

async function queryMasterModuleAuditLogs(supabase: SupabaseClient, select: string) {
  return supabase
    .from('audit_logs')
    .select(select)
    .in('module', [...MASTER_AUDIT_MODULES])
    .order('created_at', { ascending: false })
    .range(0, MASTER_AUDIT_ROW_LIMIT - 1);
}

async function queryAuditLogs(supabase: SupabaseClient) {
  let lastError: { message?: string } | null = null;

  for (const select of AUDIT_SELECT_VARIANTS) {
    const moduleRes = await queryMasterModuleAuditLogs(supabase, select);
    if (!moduleRes.error && (moduleRes.data?.length ?? 0) > 0) {
      return moduleRes;
    }
    if (moduleRes.error && !isMissingColumnError(moduleRes.error.message || '')) {
      lastError = moduleRes.error;
    }

    const res = await queryAuditLogsWindow(supabase, select);
    if (!res.error) return res;

    lastError = res.error;
    if (!isMissingColumnError(res.error.message || '')) {
      return res;
    }
  }

  return {
    data: [] as RawAuditLogRow[],
    error: lastError,
    status: 400,
    statusText: 'Bad Request',
    count: null,
  };
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
    errors.push(message);
    return {
      rows: [],
      errors,
      rawCount: 0,
      filteredCount: 0,
      logsQueryMs: Date.now() - logsQueryStarted,
      enrichMs: 0,
    };
  }
  const logsQueryMs = Date.now() - logsQueryStarted;

  if (logsRes.error) {
    errors.push(`audit_logs: ${logsRes.error.message}`);
  }

  const rawLogs = (logsRes.data || []) as RawAuditLogRow[];
  const normalizedLogs = rawLogs.map(normalizeAuditLogRow);
  const filteredLogs = normalizedLogs
    .filter(isMasterAuditEntry)
    .slice(0, MASTER_AUDIT_ROW_LIMIT);

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
  const enrichTimeoutMs = Math.max(3_000, Math.floor(queryTimeoutMs / 2));

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
