import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import {
  getCorporateCostCenter,
  logCorporateFinanceAudit,
  setCorporateCostCenterActive,
  updateCorporateCostCenter,
} from '@/lib/master/corporateFinance/service';
import { validateCorporateCostCenterInput } from '@/lib/master/corporateFinance/validation';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const auth = await authorizeCorporateFinance(supabaseAdmin, {
    userId: searchParams.get('userId'),
    impersonatingTenantId: searchParams.get('impersonatingTenantId'),
  });
  if (!auth.ok) return auth.response;

  try {
    const costCenter = await getCorporateCostCenter(supabaseAdmin, id);
    if (!costCenter) {
      return NextResponse.json({ error: 'Centro não encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ costCenter });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao obter centro.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id } = await ctx.params;

  try {
    const body = await request.json();
    const auth = await authorizeCorporateFinance(supabaseAdmin, {
      userId: body.userId,
      impersonatingTenantId: body.impersonatingTenantId,
    });
    if (!auth.ok) return auth.response;

    const existing = await getCorporateCostCenter(supabaseAdmin, id);
    if (!existing) {
      return NextResponse.json({ error: 'Centro não encontrado.' }, { status: 404 });
    }

    const onlyToggle =
      typeof body.is_active === 'boolean' && body.name == null && body.code == null;

    if (onlyToggle) {
      const costCenter = await setCorporateCostCenterActive(supabaseAdmin, id, body.is_active);
      await logCorporateFinanceAudit(supabaseAdmin, {
        userId: body.userId ? String(body.userId) : null,
        action: body.is_active
          ? 'CORPORATE_COST_CENTER_ACTIVATED'
          : 'CORPORATE_COST_CENTER_DEACTIVATED',
        entityId: costCenter.id,
        description: `Centro ${body.is_active ? 'ativado' : 'desativado'}: ${costCenter.code}`,
        oldData: { is_active: existing.is_active },
        newData: { is_active: costCenter.is_active },
      });
      return NextResponse.json({ costCenter });
    }

    const input = validateCorporateCostCenterInput({ ...existing, ...body });
    const costCenter = await updateCorporateCostCenter(supabaseAdmin, id, input);

    const activated =
      existing.is_active !== costCenter.is_active
        ? costCenter.is_active
          ? 'CORPORATE_COST_CENTER_ACTIVATED'
          : 'CORPORATE_COST_CENTER_DEACTIVATED'
        : null;

    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: activated || 'CORPORATE_COST_CENTER_UPDATED',
      entityId: costCenter.id,
      description: activated
        ? `Centro ${costCenter.is_active ? 'ativado' : 'desativado'}: ${costCenter.code}`
        : `Centro editado: ${costCenter.code} — ${costCenter.name}`,
      oldData: existing,
      newData: costCenter,
    });

    return NextResponse.json({ costCenter });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar centro.';
    const status =
      message.includes('obrigatório') ||
      message.includes('inválid') ||
      message.includes('Já existe')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
