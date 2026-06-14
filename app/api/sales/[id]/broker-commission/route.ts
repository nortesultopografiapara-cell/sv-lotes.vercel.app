import { NextResponse } from 'next/server';
import {
  assertApiTenantScope,
  resolveApiTenantId,
} from '@/lib/apiTenantContext';
import {
  canManageSaleBrokerCommission,
  resolveManageBrokerCommissionRole,
} from '@/lib/brokerCommissionAccess';
import {
  executeManageSaleBrokerCommission,
  getSaleBrokerCommissionState,
} from '@/lib/saleBrokerCommissionService';
import { SaleBrokerCommissionError } from '@/lib/saleBrokerCommissionManage';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

type AuthorizeOptions = {
  saleId: string;
  bodyTenantId?: string | null;
};

async function authorizeBrokerCommissionManage(
  request: Request,
  options: AuthorizeOptions,
) {
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
  const callerRole = resolveManageBrokerCommissionRole(
    profile?.role,
    (user as { user_metadata?: { role?: string } }).user_metadata?.role,
    (user as { app_metadata?: { role?: string } }).app_metadata?.role,
  );

  if (!canManageSaleBrokerCommission(callerRole)) {
    return {
      error: NextResponse.json(
        {
          error:
            'Apenas administradores podem gerenciar corretor/comissão da venda.',
          code: 'BROKER_COMMISSION_MANAGE_DENIED',
        },
        { status: 403 },
      ),
    };
  }

  const queryTenantId = new URL(request.url).searchParams.get('activeTenantId');

  const tenantId = await resolveApiTenantId({
    admin,
    authUser: user,
    profile,
    bodyTenantId: options.bodyTenantId,
    queryTenantId,
    saleId: options.saleId,
  });

  if (!tenantId) {
    return {
      error: NextResponse.json(
        { error: 'Empresa não identificada para o usuário' },
        { status: 403 },
      ),
    };
  }

  try {
    assertApiTenantScope({
      tenantId,
      callerRole,
      callerTenantId: profile?.tenant_id || profile?.company_id || null,
      metadataTenantId: (user.user_metadata?.tenant_id as string | undefined) || null,
    });
  } catch (scopeErr) {
    const message =
      scopeErr instanceof Error
        ? scopeErr.message
        : 'Operação fora do escopo da empresa';
    return {
      error: NextResponse.json({ error: message, code: 'TENANT_SCOPE_MISMATCH' }, { status: 403 }),
    };
  }

  return { user, admin, profile, tenantId, callerRole };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: saleId } = await params;
    const auth = await authorizeBrokerCommissionManage(request, { saleId });
    if ('error' in auth && auth.error) return auth.error;

    const state = await getSaleBrokerCommissionState(
      auth.admin!,
      saleId,
      auth.tenantId!,
    );

    return NextResponse.json({ success: true, ...state });
  } catch (err) {
    if (err instanceof SaleBrokerCommissionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error('[broker-commission GET]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: saleId } = await params;
    const body = await request.json();

    const auth = await authorizeBrokerCommissionManage(request, {
      saleId,
      bodyTenantId: body?.tenantId || body?.activeTenantId || null,
    });
    if ('error' in auth && auth.error) return auth.error;

    const result = await executeManageSaleBrokerCommission(auth.admin!, {
      saleId,
      tenantId: auth.tenantId!,
      userId: auth.user!.id,
      input: body,
    });

    return NextResponse.json({ success: true, result });
  } catch (err) {
    if (err instanceof SaleBrokerCommissionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error('[broker-commission PATCH]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
