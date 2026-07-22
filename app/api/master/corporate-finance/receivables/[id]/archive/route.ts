import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { archiveReceivable } from '@/lib/master/corporateFinance/receivablesService';

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

    const receivable = await archiveReceivable(
      supabaseAdmin,
      id,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json({ receivable });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao arquivar recebível.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
