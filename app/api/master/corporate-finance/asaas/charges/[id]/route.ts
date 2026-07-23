import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { getCorporateAsaasChargeById } from '@/lib/master/corporateFinance/asaas/chargesService';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  const auth = await authorizeCorporateFinance(supabaseAdmin, {
    userId: searchParams.get('userId'),
    impersonatingTenantId: searchParams.get('impersonatingTenantId'),
  });
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    const charge = await getCorporateAsaasChargeById(supabaseAdmin, id);
    if (!charge) {
      return NextResponse.json({ error: 'Cobrança não encontrada.' }, { status: 404 });
    }
    return NextResponse.json({ charge });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao obter cobrança.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
