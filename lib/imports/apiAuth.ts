/**
 * Autorização de rotas API — Migração de Dados.
 */

import { NextResponse } from 'next/server';
import { canAccessDataMigrationModule } from '@/lib/imports/permissions';
import {
  assertApiTenantScope,
  resolveApiTenantId,
  type ApiCallerProfile,
} from '@/lib/apiTenantContext';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import { normalizeUserRole } from '@/lib/rolePermissions';

export type DataMigrationApiContext = {
  admin: NonNullable<ReturnType<typeof createAdminSupabase>['client']>;
  user: { id: string; email?: string | null };
  profile: ApiCallerProfile;
  tenantId: string;
  userName: string;
};

export async function authorizeDataMigrationRequest(
  request: Request,
  bodyTenantId?: string | null,
): Promise<{ ctx: DataMigrationApiContext } | { error: NextResponse }> {
  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return {
      error: NextResponse.json(
        { error: configError || 'Não autenticado' },
        { status: 401 },
      ),
    };
  }

  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return {
      error: NextResponse.json(
        { error: adminError || 'Supabase não configurado' },
        { status: 503 },
      ),
    };
  }

  const profile = await resolveCallerProfile(admin, user.id);
  const callerRole = normalizeUserRole(
    profile?.role ||
      (user as { user_metadata?: { role?: string } }).user_metadata?.role ||
      (user as { app_metadata?: { role?: string } }).app_metadata?.role,
  );

  if (!canAccessDataMigrationModule(callerRole)) {
    return {
      error: NextResponse.json(
        { error: 'Acesso negado. Apenas administradores podem usar a migração de dados.' },
        { status: 403 },
      ),
    };
  }

  const queryTenantId = new URL(request.url).searchParams.get('activeTenantId');
  const tenantId = await resolveApiTenantId({
    admin,
    authUser: user,
    profile,
    bodyTenantId,
    queryTenantId,
  });

  if (!tenantId) {
    return {
      error: NextResponse.json(
        { error: 'Empresa ativa não identificada.' },
        { status: 400 },
      ),
    };
  }

  try {
    assertApiTenantScope({
      tenantId,
      callerRole,
      callerTenantId: profile?.tenant_id || profile?.company_id,
      metadataTenantId:
        (user.user_metadata?.tenant_id as string | undefined) ||
        (user.user_metadata?.company_id as string | undefined),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Escopo de empresa inválido.';
    return {
      error: NextResponse.json({ error: message }, { status: 403 }),
    };
  }

  const userName =
    (profile as { full_name?: string | null } | null)?.full_name ||
    user.email ||
    'Administrador';

  return {
    ctx: {
      admin,
      user: { id: user.id, email: user.email },
      profile,
      tenantId,
      userName,
    },
  };
}
