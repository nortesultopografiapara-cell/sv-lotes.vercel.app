import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  C6_CHARGES_ROUTE_BLOCKED_CODE,
  C6EmissionNotHomologatedError,
} from '@/lib/banking/c6/c6EmitGuard';
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
    if (err instanceof C6EmissionNotHomologatedError) {
      return NextResponse.json(
        { error: err.message, code: C6_CHARGES_ROUTE_BLOCKED_CODE },
        { status: 409 },
      );
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
