/**
 * Logs temporários seguros — Portal dashboard (sem PII/tokens/UUIDs).
 */

export type ClientPortalDashboardLogContext = {
  step: string;
  sessionFound?: boolean;
  linkType?: string;
  hasCompanyId?: boolean;
  hasCustomerId?: boolean;
  hasSaleId?: boolean;
  supabaseCode?: string;
  supabaseMessage?: string;
  supabaseDetails?: string;
  supabaseHint?: string;
  reason?: string;
  errorMessage?: string;
};

export function logClientPortalDashboardDiagnostic(context: ClientPortalDashboardLogContext): void {
  console.warn('[client-portal-dashboard:diagnostic]', JSON.stringify(context));
}

export function logClientPortalDashboardException(step: string, err: unknown): void {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack?.split('\n').slice(0, 5).join(' | ') : undefined;
  console.warn(
    '[client-portal-dashboard:exception]',
    JSON.stringify({ step, errorMessage, stack }),
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
