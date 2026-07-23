import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { validatePayableInput } from '@/lib/master/corporateFinance/arApValidation';
import {
  getPayable,
  listPayablePayments,
  updatePayable,
} from '@/lib/master/corporateFinance/payablesService';
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
    const payable = await getPayable(supabaseAdmin, id);
    if (!payable) {
      return NextResponse.json({ error: 'Pagável não encontrado.' }, { status: 404 });
    }
    const payments = await listPayablePayments(supabaseAdmin, id);
    const { findMovementsByPaymentIds } = await import(
      '@/lib/master/corporateFinance/cashMovementsService'
    );
    const cashByPaymentId = await findMovementsByPaymentIds(supabaseAdmin, {
      payablePaymentIds: payments.map((p) => p.id),
    });
    return NextResponse.json({ payable, payments, cashByPaymentId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao obter pagável.';
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

    const existing = await getPayable(supabaseAdmin, id);
    if (!existing) {
      return NextResponse.json({ error: 'Pagável não encontrado.' }, { status: 404 });
    }

    const input = validatePayableInput({ ...existing, ...body });
    const payable = await updatePayable(
      supabaseAdmin,
      id,
      input,
      body.userId ? String(body.userId) : null,
    );

    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'CORPORATE_PAYABLE_UPDATED',
      entityId: id,
      description: `Pagável editado ${payable.code}`,
      oldData: { net_amount: existing.net_amount, status: existing.status },
      newData: { net_amount: payable.net_amount, status: payable.status },
    });

    return NextResponse.json({ payable });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar pagável.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
