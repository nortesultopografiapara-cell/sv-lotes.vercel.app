import type { SupabaseClient, User } from '@supabase/supabase-js';
import { resolveUserCompanyId } from '@/lib/masterCompanyUsers';
import { isPlatformAdmin } from '@/lib/rls';

export type ApiCallerProfile = {
  role?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
} | null;

export type ResolveApiTenantIdInput = {
  admin: SupabaseClient;
  authUser: User;
  profile?: ApiCallerProfile;
  bodyTenantId?: string | null;
  queryTenantId?: string | null;
  saleId?: string | null;
};

function pickTenantId(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = value ? String(value).trim() : '';
    if (normalized) return normalized;
  }
  return null;
}

/** Resolve tenant/empresa ativa em rotas API — espelha resolveActiveTenantId + fallbacks server-side. */
export async function resolveApiTenantId(
  input: ResolveApiTenantIdInput,
): Promise<string | null> {
  const metadata = (input.authUser.user_metadata || {}) as Record<string, unknown>;
  const appMetadata = (input.authUser.app_metadata || {}) as Record<string, unknown>;

  const direct = pickTenantId(
    input.bodyTenantId,
    input.queryTenantId,
    resolveUserCompanyId(input.profile || {}),
    metadata.tenant_id as string | undefined,
    metadata.company_id as string | undefined,
    appMetadata.tenant_id as string | undefined,
    appMetadata.company_id as string | undefined,
  );
  if (direct) return direct;

  const { data: userRow } = await input.admin
    .from('users')
    .select('tenant_id, company_id')
    .eq('id', input.authUser.id)
    .maybeSingle();

  const fromUsers = pickTenantId(userRow?.tenant_id, userRow?.company_id);
  if (fromUsers) return fromUsers;

  if (input.saleId) {
    const { data: sale } = await input.admin
      .from('sales')
      .select('tenant_id, company_id')
      .eq('id', input.saleId)
      .maybeSingle();
    return pickTenantId(sale?.tenant_id, sale?.company_id);
  }

  return null;
}

export function assertApiTenantScope(params: {
  tenantId: string;
  callerRole: string;
  callerTenantId?: string | null;
  metadataTenantId?: string | null;
}): void {
  if (isPlatformAdmin(params.callerRole)) return;

  const callerTenant = pickTenantId(
    params.callerTenantId,
    params.metadataTenantId,
  );

  if (callerTenant && callerTenant !== params.tenantId) {
    const err = new Error('Operação fora do escopo da empresa do usuário.');
    (err as Error & { code?: string; status?: number }).code = 'TENANT_SCOPE_MISMATCH';
    (err as Error & { code?: string; status?: number }).status = 403;
    throw err;
  }
}
