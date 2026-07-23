import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { aggregateCorporateCashMonthlyRevenueExpense } from '@/lib/master/corporateFinance/cashMath';

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
    const year = Number(searchParams.get('year') || new Date().getUTCFullYear());
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      throw new Error('Ano inválido.');
    }
    const data = await aggregateCorporateCashMonthlyRevenueExpense(supabaseAdmin, year);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha na agregação mensal.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
