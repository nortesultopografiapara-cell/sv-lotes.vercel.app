/**
 * Logs seguros — Portal dashboard (sem CPF/tokens; IDs apenas como fingerprint).
 */

export type ClientPortalDashboardLogContext = {
  step: string;
  outcome?: 'success' | 'failure' | 'empty';
  sessionFound?: boolean;
  linkType?: string;
  hasCompanyId?: boolean;
  hasCustomerId?: boolean;
  hasSaleId?: boolean;
  hasContractId?: boolean;
  customerId?: string;
  saleId?: string;
  contractId?: string;
  companyId?: string;
  companyIdResolved?: string;
  table?: string;
  filter?: string;
  rowCount?: number;
  httpStatus?: number;
  supabaseCode?: string;
  supabaseMessage?: string;
  supabaseDetails?: string;
  supabaseHint?: string;
  reason?: string;
  errorMessage?: string;
};

export function scopeIdFingerprint(value?: string | null): string | undefined {
  const trimmed = String(value || '').trim();
  if (!trimmed) return undefined;
  return `${trimmed.length}:${trimmed.slice(0, 8)}`;
}

export function logClientPortalDashboardDiagnostic(context: ClientPortalDashboardLogContext): void {
  console.warn('[client-portal-dashboard:diagnostic]', JSON.stringify(context));
}

export function logClientPortalDashboardException(step: string, err: unknown): void {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack?.split('\n').slice(0, 5).join(' | ') : undefined;
  console.warn(
    '[client-portal-dashboard:exception]',
    JSON.stringify({ step, errorMessage, stack, httpStatus: 500 }),
  );
}

export function summarizeSupabaseError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null): Pick<
  ClientPortalDashboardLogContext,
  'supabaseCode' | 'supabaseMessage' | 'supabaseDetails' | 'supabaseHint'
> {
  if (!error) return {};
  return {
    supabaseCode: error.code || undefined,
    supabaseMessage: error.message || undefined,
    supabaseDetails: error.details || undefined,
    supabaseHint: error.hint || undefined,
  };
}

/** Mesma regra do lookup cross-tenant — sale + customer fallback. */
export function resolvePortalScopeCompanyId(input: {
  saleCompanyId?: string | null;
  saleTenantId?: string | null;
  customerCompanyId?: string | null;
  customerTenantId?: string | null;
}): string {
  return String(
    input.saleCompanyId ||
      input.saleTenantId ||
      input.customerCompanyId ||
      input.customerTenantId ||
      '',
  ).trim();
}

export function logDashboardQueryResult(input: {
  step: string;
  table: string;
  filter: string;
  error?: { code?: string; message?: string; details?: string; hint?: string } | null;
  rowCount?: number;
}): void {
  if (input.error) {
    logClientPortalDashboardDiagnostic({
      step: input.step,
      outcome: 'failure',
      table: input.table,
      filter: input.filter,
      rowCount: 0,
      httpStatus: 200,
      reason: 'supabase_error',
      ...summarizeSupabaseError(input.error),
    });
    return;
  }

  const count = input.rowCount ?? 0;
  logClientPortalDashboardDiagnostic({
    step: input.step,
    outcome: count > 0 ? 'success' : 'empty',
    table: input.table,
    filter: input.filter,
    rowCount: count,
    httpStatus: 200,
    reason: count > 0 ? undefined : 'no_rows',
  });
}
