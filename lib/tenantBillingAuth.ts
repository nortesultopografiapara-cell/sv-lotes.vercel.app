import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isPlatformAdmin } from '@/lib/rls';
import { resolveUsersTenantId } from '@/lib/ownersAdmin';
import {
  isTenantEnterpriseAdminRole,
  normalizeUserRole,
} from '@/lib/rolePermissions';
import {
  CALLER_PROFILE_SELECT,
  createAdminSupabase,
  getRequestAuthUser,
} from '@/lib/supabase/server';

export type TenantBillingAuth = {
  admin: SupabaseClient;
  userId: string;
  role: string;
  tenantId: string;
};

export async function authorizeTenantBilling(
  request: Request,
): Promise<{ error: NextResponse } | TenantBillingAuth> {
  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return {
      error: NextResponse.json(
        { error: configError || 'Não autenticado.' },
        { status: 401 },
      ),
    };
  }

  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return {
      error: NextResponse.json(
        { error: adminError || 'Service role indisponível.' },
        { status: 503 },
      ),
    };
  }

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select(CALLER_PROFILE_SELECT)
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.warn('[authorizeTenantBilling] profile', profileError.message);
  }

  const role = normalizeUserRole(profile?.role);
  const tenantId = resolveUsersTenantId(profile);

  const canAccess =
    isTenantEnterpriseAdminRole(role) ||
    (isPlatformAdmin(role) && Boolean(tenantId));

  if (!canAccess) {
    return {
      error: NextResponse.json({ error: 'Permissão negada.' }, { status: 403 }),
    };
  }

  if (!tenantId) {
    return {
      error: NextResponse.json(
        { error: 'Empresa não identificada.' },
        { status: 400 },
      ),
    };
  }

  return { admin, userId: user.id, role, tenantId };
}
