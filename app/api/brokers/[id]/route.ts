import { NextResponse } from 'next/server';
import {
  BrokerDeleteError,
  deleteBrokerViaAdmin,
  setBrokerActiveViaAdmin,
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
import type { SupabaseClient, User } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function readAuthInput(request: Request) {
  const url = new URL(request.url);
  return {
    tenantId: url.searchParams.get('tenantId'),
    impersonatingTenantId: url.searchParams.get('impersonatingTenantId'),
  };
}

async function authorizeBrokerMutation(request: Request) {
  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return { error: NextResponse.json({ error: configError || 'Não autenticado.' }, { status: 401 }) };
  }

  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return {
      error: NextResponse.json({ error: adminError || 'Service role não configurada.' }, { status: 503 }),
    };
  }

  const profile = await resolveCallerProfile(admin, user.id);
  const callerRole = normalizeUserRole(profile?.role);
  if (!isPlatformAdmin(callerRole) && !isTenantAdminRole(callerRole)) {
    return { error: NextResponse.json({ error: 'Permissão negada.' }, { status: 403 }) };
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
      return {
        error: NextResponse.json(
          { error: 'Empresa ativa não identificada. Verifique tenant ativo.' },
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
      const message = err instanceof Error ? err.message : 'Escopo inválido.';
      return { error: NextResponse.json({ error: message }, { status: 403 }) };
    }
  }

  return {
    admin: admin as SupabaseClient,
    user: user as User,
    callerRole,
    profile,
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: brokerId } = await context.params;
  if (!brokerId?.trim()) {
    return NextResponse.json({ error: 'ID do corretor é obrigatório.' }, { status: 400 });
  }

  let body: { active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  if (typeof body.active !== 'boolean') {
    return NextResponse.json(
      { error: 'Campo "active" (boolean) é obrigatório.' },
      { status: 400 },
    );
  }

  const auth = await authorizeBrokerMutation(request);
  if ('error' in auth && auth.error) return auth.error;

  const { admin, user, callerRole, profile } = auth as {
    admin: SupabaseClient;
    user: User;
    callerRole: string;
    profile: Awaited<ReturnType<typeof resolveCallerProfile>>;
  };

  try {
    const result = await setBrokerActiveViaAdmin(
      admin,
      brokerId,
      body.active,
      {
        userId: user.id,
        userRole: callerRole,
        userTenantId: profile?.tenant_id || profile?.company_id || null,
      },
      isPlatformAdmin(callerRole),
    );

    return NextResponse.json({
      success: true,
      brokerId: result.brokerId,
      brokerName: result.brokerName,
      effectiveTenantId: result.effectiveTenantId,
      active: result.active,
      status: result.status,
      message: result.active
        ? 'Corretor reativado com sucesso.'
        : 'Corretor desativado com sucesso.',
    });
  } catch (err) {
    if (err instanceof BrokerDeleteError) {
      return NextResponse.json({ error: err.message, diagnostic: err.diagnostic }, { status: 400 });
    }
    const message =
      err instanceof Error ? err.message : 'Não foi possível alterar o status do corretor.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: brokerId } = await context.params;
  if (!brokerId?.trim()) {
    return NextResponse.json({ error: 'ID do corretor é obrigatório.' }, { status: 400 });
  }

  const auth = await authorizeBrokerMutation(request);
  if ('error' in auth && auth.error) return auth.error;

  const { admin, user, callerRole, profile } = auth as {
    admin: SupabaseClient;
    user: User;
    callerRole: string;
    profile: Awaited<ReturnType<typeof resolveCallerProfile>>;
  };

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
