import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { deleteCorporateAsaasChargeSecure } from '@/lib/master/corporateFinance/secureDeleteService';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id } = await ctx.params;

  try {
    const body = await request.json().catch(() => ({}));
    const auth = await authorizeCorporateFinance(supabaseAdmin, {
      userId: body.userId,
      impersonatingTenantId: body.impersonatingTenantId,
    });
    if (!auth.ok) return auth.response;

    const result = await deleteCorporateAsaasChargeSecure(supabaseAdmin, {
      id,
      confirmWord: String(body.confirmWord || body.confirmation || ''),
      userId: body.userId ? String(body.userId) : null,
      reason: body.reason != null ? String(body.reason) : null,
      forceLocalUnlink: Boolean(body.forceLocalUnlink),
      localOnly: Boolean(body.localOnly),
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao excluir cobrança Asaas.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
