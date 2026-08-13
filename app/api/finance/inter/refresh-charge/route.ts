import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { refreshInterChargeArtifacts } from '@/lib/banking/inter/interSaleChargeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET-only materialização de cobrança Inter já emitida.
 * Nunca cria nova cobrança / nunca insere bank_charges.
 */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const installmentId = String(body.installmentId ?? body.installment_id ?? '').trim();
    const externalId = String(body.externalId ?? body.external_id ?? '').trim();
    if (!installmentId && !externalId) {
      return NextResponse.json(
        { error: 'Informe installmentId ou externalId.' },
        { status: 400 },
      );
    }

    const result = await refreshInterChargeArtifacts(auth.admin, {
      companyId: auth.tenantId,
      installmentId: installmentId || null,
      externalId: externalId || null,
    });

    return NextResponse.json({
      ok: true,
      created: false,
      inserted: false,
      reused: true,
      paid: Boolean(result.paid),
      receiptUpdated: Boolean(result.receiptUpdated),
      receipt: result.receiptStatus
        ? {
            status: result.receiptStatus,
            paidAt: result.receiptPaidAt,
            paidAmount: result.receiptPaidAmount,
          }
        : null,
      artifactsReady: Boolean(
        result.charge.bankSlipIdentification ||
          result.charge.barCode ||
          result.charge.pixCopyPaste ||
          result.charge.nossoNumero,
      ),
      charge: result.charge,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar cobrança Inter.';
    console.error('[finance/inter/refresh-charge]', message);
    const status = /não encontrada|sem external_id|ausentes/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message, created: false, inserted: false }, { status });
  }
}
