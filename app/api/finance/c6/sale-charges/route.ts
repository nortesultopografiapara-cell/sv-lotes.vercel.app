import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { listC6ChargesForInstallments } from '@/lib/banking/c6/c6ChargeList';
import { filterC6BolepixAuthorizedReceipts } from '@/lib/banking/c6/c6EmissionAuthorization';
import { resolveSaleChargesProvider } from '@/lib/finance/saleChargesProvider';
import {
  getSaleChargesSummary,
  loadSaleScopedInstallments,
} from '@/lib/finance/saleChargesService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lê parcelas e boletos C6 já gravados. Não emite, não cancela e não baixa o caixa. */
export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const saleId = new URL(request.url).searchParams.get('saleId')?.trim() || '';
    if (!saleId) return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });

    const provider = await resolveSaleChargesProvider(auth.admin, auth.tenantId, saleId);
    if (provider.provider !== 'C6') {
      return NextResponse.json({ error: 'Esta venda não usa o Banco C6.' }, { status: 409 });
    }

    const summary = await getSaleChargesSummary(auth.admin, auth.tenantId, saleId);
    const installments = await loadSaleScopedInstallments(auth.admin, auth.tenantId, saleId);
    const installmentIds = installments.map((row) => String(row.id));
    const charges = await listC6ChargesForInstallments(auth.admin, auth.tenantId, installmentIds);
    const emitAuthorizedReceiptIds = await filterC6BolepixAuthorizedReceipts(
      auth.admin,
      auth.tenantId,
      installmentIds,
    );

    return NextResponse.json({
      ok: true,
      summary,
      installments,
      charges,
      emitAuthorizedReceiptIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao ler as cobranças C6 da venda.';
    console.error('[finance/c6/sale-charges GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
