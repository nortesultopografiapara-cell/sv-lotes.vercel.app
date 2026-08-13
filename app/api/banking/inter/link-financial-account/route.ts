import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { linkFinancialAccountToInterIntegration } from '@/lib/finance/saleChargesProvider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Vincula conta financeira (padrão se omitida) à integração INTER. */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      financialAccountId?: string;
    };
    let accountId = String(body.financialAccountId || '').trim();
    if (!accountId) {
      const { data, error } = await auth.admin
        .from('company_financial_accounts')
        .select('id, is_default, active')
        .eq('company_id', auth.tenantId)
        .eq('active', true)
        .order('is_default', { ascending: false })
        .limit(5);
      if (error) throw new Error(error.message);
      const def = (data || []).find((a) => a.is_default) || (data || [])[0];
      accountId = def?.id ? String(def.id) : '';
    }
    if (!accountId) {
      return NextResponse.json(
        { error: 'Nenhuma conta financeira ativa para vincular.' },
        { status: 400 },
      );
    }
    await linkFinancialAccountToInterIntegration(auth.admin, auth.tenantId, accountId);
    return NextResponse.json({ ok: true, financialAccountId: accountId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao vincular conta.';
    console.error('[banking/inter/link-financial-account]', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
