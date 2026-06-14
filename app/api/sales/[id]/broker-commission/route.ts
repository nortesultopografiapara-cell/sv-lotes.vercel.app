import { NextResponse } from 'next/server';
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
import { isPlatformAdmin } from '@/lib/rls';

export const runtime = 'nodejs';

async function authorizeBrokerCommissionManage(request: Request) {
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

  let bodyTenant: string | null = null;
  try {
    const body = await request.clone().json();
    bodyTenant = body?.tenantId || body?.activeTenantId || null;
  } catch {
    /* GET sem body */
  }

  const tenantId =
    (isPlatformAdmin(callerRole) && bodyTenant) ||
    profile?.tenant_id ||
    profile?.company_id ||
    null;

  if (!tenantId && !isPlatformAdmin(callerRole)) {
    return {
      error: NextResponse.json(
        { error: 'Empresa não identificada para o usuário' },
        { status: 403 },
      ),
    };
  }

  return { user, admin, profile, tenantId: tenantId as string, callerRole };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeBrokerCommissionManage(request);
    if ('error' in auth && auth.error) return auth.error;

    const { id: saleId } = await params;
    const state = await getSaleBrokerCommissionState(
      auth.admin!,
      saleId,
      auth.tenantId,
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
    const auth = await authorizeBrokerCommissionManage(request);
    if ('error' in auth && auth.error) return auth.error;

    const { id: saleId } = await params;
    const body = await request.json();

    const result = await executeManageSaleBrokerCommission(auth.admin!, {
      saleId,
      tenantId: auth.tenantId,
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
