/**
 * Query string de tenant para APIs de contrato (preview, assinatura, regeneração).
 */

import { supabase } from '@/lib/supabase';

const PLATFORM_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'MASTER',
  'MASTER_ADMIN',
  'MASTER-ADMIN',
]);

type ContractApiUser = {
  id?: string;
  role?: string;
  tenant_id?: string;
  company_id?: string;
} | null;

export function readImpersonatingTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('impersonating_tenant_id');
}

export function resolveContractsTenantIdFromUser(user: ContractApiUser): string | null {
  if (!user) return null;
  if (user.tenant_id) return user.tenant_id;
  const impersonating = readImpersonatingTenantId();
  if (impersonating && user.role && PLATFORM_ADMIN_ROLES.has(user.role)) {
    return impersonating;
  }
  return user.company_id || null;
}

export async function resolveActiveContractTenantId(
  user: ContractApiUser,
): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const authUserId = sessionData?.session?.user?.id;

  if (authUserId) {
    const { data, error } = await supabase
      .from('users')
      .select('tenant_id, company_id')
      .eq('id', authUserId)
      .maybeSingle();
    if (!error && data?.tenant_id) return data.tenant_id;
    if (!error && data?.company_id) return data.company_id;
  }

  return resolveContractsTenantIdFromUser(user);
}

export async function buildContractApiTenantQueryString(
  user: ContractApiUser,
): Promise<string> {
  const impersonatingTenantId = readImpersonatingTenantId();
  const activeTenantId = await resolveActiveContractTenantId(user);
  const query = new URLSearchParams();
  if (activeTenantId) query.set('activeTenantId', activeTenantId);
  if (user?.role === 'SUPER_ADMIN' && impersonatingTenantId) {
    query.set('impersonatingTenantId', impersonatingTenantId);
  }
  return query.toString();
}
