import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { C6EmissionNotHomologatedError } from '@/lib/banking/c6/c6EmitGuard';
import { resolveSaleChargesProvider } from '@/lib/finance/saleChargesProvider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Identifica Asaas, Banco Inter ou C6 da conta da venda. A leitura não exige emissão. */
export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const saleId = new URL(request.url).searchParams.get('saleId')?.trim() || '';
    if (!saleId) {
      return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    }
    const resolved = await resolveSaleChargesProvider(auth.admin, auth.tenantId, saleId);
    return NextResponse.json({
      ok: true,
      provider: resolved.provider,
      financialAccountId: resolved.financialAccountId,
      financialAccountName: resolved.financialAccountName,
      bankIntegrationId: resolved.bankIntegrationId,
    });
  } catch (err) {
    if (err instanceof C6EmissionNotHomologatedError) {
      return NextResponse.json({ error: err.message, code: 'C6_NOT_HOMOLOGATED' }, { status: 409 });
    }
    console.error(
      '[finance/sale-charges/provider]',
      err instanceof Error ? err.message : 'error',
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao resolver provider.' },
      { status: 500 },
    );
  }
}
