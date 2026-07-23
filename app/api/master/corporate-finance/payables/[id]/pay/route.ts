import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { validateSettlementInput } from '@/lib/master/corporateFinance/arApValidation';
import { payPayable } from '@/lib/master/corporateFinance/payablesService';

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

    const input = validateSettlementInput(body);
    const result = await payPayable(
      supabaseAdmin,
      id,
      input,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao pagar pagável.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
