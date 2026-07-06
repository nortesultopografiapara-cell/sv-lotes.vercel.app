/**
 * Autenticação/autorização — APIs do módulo Contratos Antigos.
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canAccessLegacyContractsModule,
  canManageLegacyContractsModule,
} from '@/lib/legacy-contracts/permissions';
import { assertApiTenantScope, resolveApiTenantId } from '@/lib/apiTenantContext';
import { loadOwnerAccessContext } from '@/lib/ownerProjectAccess';
import { createAdminSupabase, getRequestAuthUser, resolveCallerProfile } from '@/lib/supabase/server';
import { normalizeUserRole, isOwnerRole } from '@/lib/rolePermissions';

export type LegacyContractsApiContext = {
  admin: SupabaseClient;
  userId: string;
  tenantId: string;
  callerRole: string;
  ownerProjectIds: string[] | null;
};

export async function authorizeLegacyContractsRequest(
  request: Request,
  options?: { requireManage?: boolean; bodyTenantId?: string | null },
): Promise<{ ctx: LegacyContractsApiContext } | { error: NextResponse }> {
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

  if (!canAccessLegacyContractsModule(callerRole)) {
    return {
      error: NextResponse.json(
        { error: 'Acesso negado ao módulo Contratos Antigos.' },
        { status: 403 },
      ),
    };
  }

  if (options?.requireManage && !canManageLegacyContractsModule(callerRole)) {
    return {
      error: NextResponse.json(
        { error: 'Sem permissão para alterar contratos antigos.' },
        { status: 403 },
      ),
    };
  }

  const queryTenantId = new URL(request.url).searchParams.get('activeTenantId');
  const tenantId = await resolveApiTenantId({
    admin,
    authUser: user,
    profile,
    bodyTenantId: options?.bodyTenantId,
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
    return {
      error: NextResponse.json(
        { error: err instanceof Error ? err.message : 'Escopo de tenant inválido.' },
        { status: 403 },
      ),
    };
  }

  let ownerProjectIds: string[] | null = null;
  if (isOwnerRole(callerRole)) {
    const ownerCtx = await loadOwnerAccessContext(admin, user, tenantId);
    ownerProjectIds = ownerCtx.rows
      .filter((row) => row.can_view_contracts)
      .map((row) => String(row.project_id))
      .filter(Boolean);
  }

  return {
    ctx: {
      admin,
      userId: user.id,
      tenantId,
      callerRole,
      ownerProjectIds,
    },
  };
}
