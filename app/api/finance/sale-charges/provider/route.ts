import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { resolveSaleChargesProvider } from '@/lib/finance/saleChargesProvider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Resolve ASAAS_COMPANY vs INTER para a venda (conta financeira). */
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
