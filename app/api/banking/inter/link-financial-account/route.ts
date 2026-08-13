import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  createInterFinancialAccount,
  linkFinancialAccountToInterIntegration,
  recoverMislinkedAsaasAndEnsureInterAccount,
} from '@/lib/finance/interFinancialAccountService';
import { listCompanyFinancialAccounts } from '@/lib/finance/companyFinancialAccountRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Contas financeiras x Inter.
 * GET — lista contas + elegíveis (sem provider).
 * POST action=create — cria FA Inter.
 * POST action=link — vincula FA sem provider (nunca Asaas).
 * POST action=recover — restaura FA Asaas mal redirecionada + garante FA Inter.
 */
export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const accounts = await listCompanyFinancialAccounts(auth.admin, auth.tenantId, {
      activeOnly: false,
    });
    const linkable = accounts.filter(
      (a) => a.active && (!a.provider || a.provider === 'INTER'),
    );
    const asaasAccounts = accounts.filter((a) => a.active && a.provider === 'ASAAS_COMPANY');
    const interAccounts = accounts.filter((a) => a.active && a.provider === 'INTER');
    return NextResponse.json({
      ok: true,
      accounts,
      linkable,
      asaasAccounts,
      interAccounts,
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

    if (action === 'recover') {
      const result = await recoverMislinkedAsaasAndEnsureInterAccount(
        auth.admin,
        auth.tenantId,
      );
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === 'link') {
      const accountId = String(body.financialAccountId || '').trim();
      if (!accountId) {
        return NextResponse.json(
          { error: 'Informe financialAccountId de uma conta sem provider.' },
          { status: 400 },
        );
      }
      const account = await linkFinancialAccountToInterIntegration(
        auth.admin,
        auth.tenantId,
        accountId,
      );
      return NextResponse.json({ ok: true, account, financialAccountId: account.id });
    }

    // create (default) — nunca sobrescreve conta padrão Asaas
    const account = await createInterFinancialAccount(auth.admin, auth.tenantId, {
      name: body.name,
      beneficiaryName: body.beneficiaryName,
      createAdditional: Boolean(body.createAdditional),
    });
    return NextResponse.json({ ok: true, account, financialAccountId: account.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro na conta financeira Inter.';
    console.error('[banking/inter/link-financial-account]', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
