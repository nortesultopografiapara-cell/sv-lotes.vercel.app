import { NextResponse } from 'next/server';
import {
  assertApiTenantScope,
  resolveApiTenantId,
} from '@/lib/apiTenantContext';
import {
  canManageSaleBrokerCommission,
  resolveManageBrokerCommissionRole,
} from '@/lib/brokerCommissionAccess';
import { readBrokerCommissionPercent } from '@/lib/brokerCommission';
import { normalizeBulkAdjustTarget } from '@/lib/brokerCommissionBulkAdjust';
import { readCommissionFixedAmount } from '@/lib/brokerCommissionMode';
import { runBulkBrokerCommissionAdjust } from '@/lib/brokerCommissionBulkService';
import { SaleBrokerCommissionError } from '@/lib/saleBrokerCommissionManage';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

type Body = {
  mode?: 'preview' | 'apply';
  filters?: {
    brokerIds?: string[] | null;
    projectId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    pendingOnly?: boolean;
  };
  /** PERCENT | FIXED | NONE */
  commission_mode?: string | null;
  new_percent?: number;
  new_fixed_amount?: number;
  confirmed?: boolean;
  confirm_text?: string | null;
  activeTenantId?: string | null;
  tenantId?: string | null;
};

async function authorizeBulkAdjust(request: Request, body: Body) {
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
            'Apenas administradores podem ajustar comissões em massa.',
          code: 'BROKER_COMMISSION_BULK_DENIED',
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
    bodyTenantId: body.activeTenantId || body.tenantId,
    queryTenantId,
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
      metadataTenantId:
        (user.user_metadata?.tenant_id as string | undefined) || null,
    });
  } catch (scopeErr) {
    const message =
      scopeErr instanceof Error
        ? scopeErr.message
        : 'Operação fora do escopo da empresa';
    return {
      error: NextResponse.json(
        { error: message, code: 'TENANT_SCOPE_MISMATCH' },
        { status: 403 },
      ),
    };
  }

  return { user, admin, profile, tenantId, callerRole };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const auth = await authorizeBulkAdjust(request, body);
    if ('error' in auth && auth.error) return auth.error;

    const mode = body.mode === 'apply' ? 'apply' : 'preview';
    const target = normalizeBulkAdjustTarget({
      mode: body.commission_mode,
      newPercent: body.new_percent,
      newFixedAmount: body.new_fixed_amount,
    });

    if (target.mode === 'PERCENT') {
      const p = readBrokerCommissionPercent(target.percent);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        return NextResponse.json(
          { error: 'new_percent inválido (0–100).' },
          { status: 400 },
        );
      }
    }
    if (target.mode === 'FIXED') {
      const fixed = readCommissionFixedAmount(target.fixedAmount);
      if (!Number.isFinite(fixed) || fixed < 0) {
        return NextResponse.json(
          { error: 'new_fixed_amount inválido.' },
          { status: 400 },
        );
      }
    }

    const result = await runBulkBrokerCommissionAdjust(auth.admin, {
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      mode,
      target,
      filters: {
        brokerIds: body.filters?.brokerIds ?? null,
        projectId: body.filters?.projectId ?? null,
        dateFrom: body.filters?.dateFrom ?? null,
        dateTo: body.filters?.dateTo ?? null,
        pendingOnly: body.filters?.pendingOnly !== false,
      },
      confirmed: body.confirmed === true,
      confirmText: body.confirm_text ?? null,
    });

    return NextResponse.json({
      ok: true,
      company_id: auth.tenantId,
      ...result,
    });
  } catch (err) {
    if (err instanceof SaleBrokerCommissionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    const message = err instanceof Error ? err.message : 'Erro interno';
    const status =
      message.includes('Confirmação') || message.includes('Digite exatamente')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
