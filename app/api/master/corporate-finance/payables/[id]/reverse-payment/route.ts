import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { reversePayablePayment } from '@/lib/master/corporateFinance/payablesService';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
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

    const paymentId = body.paymentId ? String(body.paymentId) : '';
    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId é obrigatório.' }, { status: 400 });
    }

    const result = await reversePayablePayment(
      supabaseAdmin,
      id,
      paymentId,
      body.reason != null ? String(body.reason) : '',
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao estornar pagamento.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
