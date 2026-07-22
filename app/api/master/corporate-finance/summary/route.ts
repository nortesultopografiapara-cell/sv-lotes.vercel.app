import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { getCashHubKpis } from '@/lib/master/corporateFinance/cashMovementsService';
import { computePayableKpis } from '@/lib/master/corporateFinance/payablesService';
import { computeReceivableKpis } from '@/lib/master/corporateFinance/receivablesService';
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
    const [foundation, receivables, payables, cash] = await Promise.all([
      getCorporateFinanceFoundationKpis(supabaseAdmin),
      computeReceivableKpis(supabaseAdmin),
      computePayableKpis(supabaseAdmin),
      getCashHubKpis(supabaseAdmin),
    ]);
    return NextResponse.json({
      kpis: {
        ...foundation,
        receivableOpen: receivables.totalOpen,
        receivableOverdue: receivables.overdue,
        payableOpen: payables.totalOpen,
        payableOverdue: payables.overdue,
        cashCurrentBalance: cash.currentBalance,
        cashMonthIncome: cash.monthIncome,
        cashMonthExpense: cash.monthExpense,
        cashMonthNet: cash.monthNet,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao carregar KPIs.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
