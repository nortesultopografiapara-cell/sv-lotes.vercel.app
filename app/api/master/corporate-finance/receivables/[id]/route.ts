import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { validateReceivableInput } from '@/lib/master/corporateFinance/arApValidation';
import {
  getReceivable,
  listReceivablePayments,
  updateReceivable,
} from '@/lib/master/corporateFinance/receivablesService';
import { logCorporateFinanceAudit } from '@/lib/master/corporateFinance/service';

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
    const receivable = await getReceivable(supabaseAdmin, id);
    if (!receivable) {
      return NextResponse.json({ error: 'Recebível não encontrado.' }, { status: 404 });
    }
    const payments = await listReceivablePayments(supabaseAdmin, id);
    return NextResponse.json({ receivable, payments });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao obter recebível.';
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

    const existing = await getReceivable(supabaseAdmin, id);
    if (!existing) {
      return NextResponse.json({ error: 'Recebível não encontrado.' }, { status: 404 });
    }

    const input = validateReceivableInput({ ...existing, ...body });
    const receivable = await updateReceivable(
      supabaseAdmin,
      id,
      input,
      body.userId ? String(body.userId) : null,
    );

    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'CORPORATE_RECEIVABLE_UPDATED',
      entityId: id,
      description: `Recebível editado ${receivable.code}`,
      oldData: { net_amount: existing.net_amount, status: existing.status },
      newData: { net_amount: receivable.net_amount, status: receivable.status },
    });

    return NextResponse.json({ receivable });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar recebível.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
