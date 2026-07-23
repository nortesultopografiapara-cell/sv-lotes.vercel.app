import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import {
  getCorporateAccount,
  logCorporateFinanceAudit,
  setCorporateAccountActive,
  updateCorporateAccount,
} from '@/lib/master/corporateFinance/service';
import { validateCorporateAccountInput } from '@/lib/master/corporateFinance/validation';

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
    const account = await getCorporateAccount(supabaseAdmin, id);
    if (!account) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });
    return NextResponse.json({ account });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao obter conta.';
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

    const existing = await getCorporateAccount(supabaseAdmin, id);
    if (!existing) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });

    if (typeof body.is_active === 'boolean' && Object.keys(body).filter((k) => k !== 'userId' && k !== 'impersonatingTenantId').length <= 2 && body.name == null) {
      const account = await setCorporateAccountActive(supabaseAdmin, id, body.is_active);
      await logCorporateFinanceAudit(supabaseAdmin, {
        userId: body.userId ? String(body.userId) : null,
        action: body.is_active ? 'CORPORATE_ACCOUNT_ACTIVATED' : 'CORPORATE_ACCOUNT_DEACTIVATED',
        entityId: account.id,
        description: `Conta financeira ${body.is_active ? 'ativada' : 'desativada'}: ${account.name}`,
        oldData: { is_active: existing.is_active },
        newData: { is_active: account.is_active },
      });
      return NextResponse.json({ account });
    }

    const input = validateCorporateAccountInput({ ...existing, ...body });
    const account = await updateCorporateAccount(supabaseAdmin, id, input);

    const activated =
      existing.is_active !== account.is_active
        ? account.is_active
          ? 'CORPORATE_ACCOUNT_ACTIVATED'
          : 'CORPORATE_ACCOUNT_DEACTIVATED'
        : null;

    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: activated || 'CORPORATE_ACCOUNT_UPDATED',
      entityId: account.id,
      description: activated
        ? `Conta financeira ${account.is_active ? 'ativada' : 'desativada'}: ${account.name}`
        : `Conta financeira editada: ${account.name}`,
      oldData: existing,
      newData: account,
    });

    return NextResponse.json({ account });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar conta.';
    const status = message.includes('obrigatório') || message.includes('inválid') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
