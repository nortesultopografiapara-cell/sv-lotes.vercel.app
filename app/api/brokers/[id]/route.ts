import { NextResponse } from 'next/server';
import {
  BrokerDeleteError,
  deleteBrokerViaAdmin,
} from '@/lib/brokerDelete';
import { resolveApiTenantId, assertApiTenantScope } from '@/lib/apiTenantContext';
import { isPlatformAdmin } from '@/lib/rls';
import { isTenantAdminRole } from '@/lib/ownerProjectAccess';
import { normalizeUserRole } from '@/lib/rolePermissions';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

function readAuthInput(request: Request) {
  const url = new URL(request.url);
  return {
    tenantId: url.searchParams.get('tenantId'),
    impersonatingTenantId: url.searchParams.get('impersonatingTenantId'),
  };
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: brokerId } = await context.params;
  if (!brokerId?.trim()) {
    return NextResponse.json({ error: 'ID do corretor é obrigatório.' }, { status: 400 });
  }

  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return NextResponse.json({ error: configError || 'Não autenticado.' }, { status: 401 });
  }

  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return NextResponse.json({ error: adminError || 'Service role não configurada.' }, { status: 503 });
  }

  const profile = await resolveCallerProfile(admin, user.id);
  const callerRole = normalizeUserRole(profile?.role);
  if (!isPlatformAdmin(callerRole) && !isTenantAdminRole(callerRole)) {
    return NextResponse.json({ error: 'Permissão negada para excluir corretor.' }, { status: 403 });
  }

  const authInput = readAuthInput(request);
  const tenantId = await resolveApiTenantId({
    admin,
    authUser: user,
    profile,
    bodyTenantId: authInput.impersonatingTenantId || authInput.tenantId,
    queryTenantId: authInput.impersonatingTenantId || authInput.tenantId,
  });

  if (!isPlatformAdmin(callerRole)) {
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Empresa ativa não identificada. Verifique tenant ativo.' },
        { status: 400 },
      );
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
      const message = err instanceof Error ? err.message : 'Escopo inválido.';
      return NextResponse.json({ error: message }, { status: 403 });
    }
  }

  try {
    const result = await deleteBrokerViaAdmin(
      admin,
      brokerId,
      {
        userId: user.id,
        userRole: callerRole,
        userTenantId: profile?.tenant_id || profile?.company_id || null,
      },
      isPlatformAdmin(callerRole),
    );

    return NextResponse.json({
      success: true,
      mode: result.mode,
      brokerId: result.brokerId,
      brokerName: result.brokerName,
      effectiveTenantId: result.effectiveTenantId,
      message:
        result.mode === 'soft'
          ? 'Corretor desativado. Histórico preservado.'
          : 'Corretor removido com sucesso.',
    });
  } catch (err) {
    if (err instanceof BrokerDeleteError) {
      return NextResponse.json({ error: err.message, diagnostic: err.diagnostic }, { status: 400 });
    }
    const message =
      err instanceof Error ? err.message : 'Não foi possível excluir o corretor.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
