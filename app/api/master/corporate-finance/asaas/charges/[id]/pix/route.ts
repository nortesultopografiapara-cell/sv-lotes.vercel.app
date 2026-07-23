import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { refreshCorporateAsaasPix } from '@/lib/master/corporateFinance/asaas/chargesService';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const auth = await authorizeCorporateFinance(supabaseAdmin, {
      userId: body.userId,
      impersonatingTenantId: body.impersonatingTenantId,
    });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    const charge = await refreshCorporateAsaasPix(
      supabaseAdmin,
      id,
      body.userId ? String(body.userId) : null,
    );
    return NextResponse.json({ charge });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar PIX.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
