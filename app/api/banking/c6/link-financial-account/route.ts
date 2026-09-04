import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  createC6FinancialAccount,
  linkFinancialAccountToC6Integration,
} from '@/lib/finance/c6FinancialAccountService';
import { listCompanyFinancialAccounts } from '@/lib/finance/companyFinancialAccountRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Contas financeiras x C6 Bank (Fase 2).
 * GET — lista contas + elegíveis (sem provider ou já C6).
 * POST action=create — cria FA C6.
 * POST action=link — vincula FA sem provider (nunca Asaas/Inter).
 */
export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const accounts = await listCompanyFinancialAccounts(auth.admin, auth.tenantId, {
      activeOnly: false,
    });
    const linkable = accounts.filter(
      (a) => a.active && (!a.provider || a.provider === 'C6'),
    );
    const asaasAccounts = accounts.filter((a) => a.active && a.provider === 'ASAAS_COMPANY');
    const interAccounts = accounts.filter((a) => a.active && a.provider === 'INTER');
    const c6Accounts = accounts.filter((a) => a.active && a.provider === 'C6');
    return NextResponse.json({
      ok: true,
      accounts,
      linkable,
      asaasAccounts,
      interAccounts,
      c6Accounts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar contas.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      financialAccountId?: string;
      name?: string;
      beneficiaryName?: string;
      createAdditional?: boolean;
    };
    const action = String(body.action || 'create').trim().toLowerCase();

    if (action === 'link') {
      const accountId = String(body.financialAccountId || '').trim();
      if (!accountId) {
        return NextResponse.json(
          { error: 'Informe financialAccountId de uma conta sem provider.' },
          { status: 400 },
        );
      }
      const account = await linkFinancialAccountToC6Integration(
        auth.admin,
        auth.tenantId,
        accountId,
      );
      return NextResponse.json({ ok: true, account, financialAccountId: account.id });
    }

    const account = await createC6FinancialAccount(auth.admin, auth.tenantId, {
      name: body.name,
      beneficiaryName: body.beneficiaryName,
      createAdditional: Boolean(body.createAdditional),
    });
    return NextResponse.json({ ok: true, account, financialAccountId: account.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro na conta financeira C6.';
    console.error('[banking/c6/link-financial-account]', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
