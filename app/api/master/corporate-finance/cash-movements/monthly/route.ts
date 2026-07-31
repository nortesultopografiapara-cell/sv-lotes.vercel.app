import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { aggregateCorporateCashMonthlyRevenueExpense } from '@/lib/master/corporateFinance/cashMath';
import { CORPORATE_BUSINESS_UNITS } from '@/lib/master/corporateFinance/businessUnit';

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
    const rawUnit = (searchParams.get('businessUnit') || searchParams.get('business_unit') || '')
      .trim()
      .toUpperCase();
    const businessUnit =
      rawUnit && (CORPORATE_BUSINESS_UNITS as readonly string[]).includes(rawUnit)
        ? rawUnit
        : null;

    const data = await aggregateCorporateCashMonthlyRevenueExpense(supabaseAdmin, year, {
      businessUnit,
    });
    return NextResponse.json({ ...data, businessUnit: businessUnit || 'ALL' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha na agregação mensal.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
