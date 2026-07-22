import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { getCorporateFinanceFoundationKpis } from '@/lib/master/corporateFinance/service';

export async function GET(request: Request) {
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
    const kpis = await getCorporateFinanceFoundationKpis(supabaseAdmin);
    return NextResponse.json({ kpis });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao carregar KPIs.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
