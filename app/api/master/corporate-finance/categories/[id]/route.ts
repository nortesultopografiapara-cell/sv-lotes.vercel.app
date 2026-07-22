import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import {
  deleteCorporateCategory,
  getCorporateCategory,
  logCorporateFinanceAudit,
  setCorporateCategoryActive,
  updateCorporateCategory,
} from '@/lib/master/corporateFinance/service';
import { validateCorporateCategoryInput } from '@/lib/master/corporateFinance/validation';

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
    const category = await getCorporateCategory(supabaseAdmin, id);
    if (!category) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 });
    return NextResponse.json({ category });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao obter categoria.';
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

    const existing = await getCorporateCategory(supabaseAdmin, id);
    if (!existing) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 });

    const onlyToggle =
      typeof body.is_active === 'boolean' &&
      body.name == null &&
      body.type == null &&
      body.parent_id == null &&
      body.parentId == null;

    if (onlyToggle) {
      const category = await setCorporateCategoryActive(supabaseAdmin, id, body.is_active);
      await logCorporateFinanceAudit(supabaseAdmin, {
        userId: body.userId ? String(body.userId) : null,
        action: body.is_active
          ? 'CORPORATE_CATEGORY_ACTIVATED'
          : 'CORPORATE_CATEGORY_DEACTIVATED',
        entityId: category.id,
        description: `Categoria ${body.is_active ? 'ativada' : 'desativada'}: ${category.name}`,
        oldData: { is_active: existing.is_active },
        newData: { is_active: category.is_active },
      });
      return NextResponse.json({ category });
    }

    const input = validateCorporateCategoryInput({ ...existing, ...body });
    const category = await updateCorporateCategory(supabaseAdmin, id, input);

    const activated =
      existing.is_active !== category.is_active
        ? category.is_active
          ? 'CORPORATE_CATEGORY_ACTIVATED'
          : 'CORPORATE_CATEGORY_DEACTIVATED'
        : null;

    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: activated || 'CORPORATE_CATEGORY_UPDATED',
      entityId: category.id,
      description: activated
        ? `Categoria ${category.is_active ? 'ativada' : 'desativada'}: ${category.name}`
        : `Categoria editada: ${category.name}`,
      oldData: existing,
      newData: category,
    });

    return NextResponse.json({ category });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar categoria.';
    const status = message.includes('obrigatório') || message.includes('inválid') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id } = await ctx.params;
  const { searchParams } = new URL(request.url);

  try {
    const body = await request.json().catch(() => ({}));
    const auth = await authorizeCorporateFinance(supabaseAdmin, {
      userId: body.userId || searchParams.get('userId'),
      impersonatingTenantId:
        body.impersonatingTenantId || searchParams.get('impersonatingTenantId'),
    });
    if (!auth.ok) return auth.response;

    const existing = await getCorporateCategory(supabaseAdmin, id);
    if (!existing) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 });

    const result = await deleteCorporateCategory(supabaseAdmin, id);
    if (!result.deleted) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }

    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : searchParams.get('userId'),
      action: 'CORPORATE_CATEGORY_DELETED',
      entityId: id,
      description: `Categoria excluída: ${existing.name}`,
      oldData: existing,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao excluir categoria.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
