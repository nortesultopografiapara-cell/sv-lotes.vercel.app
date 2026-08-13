import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  bankChargeToSummaryLike,
  createInterInstallmentCharge,
  findActiveInterBankChargeForReceipt,
} from '@/lib/banking/inter/interSaleChargeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Emissão individual Inter Cobrança V3 (Central de Cobranças).
 * Idempotente: reutiliza bank_charges ativo se já existir.
 * Só responde sucesso com id local + external_id persistidos.
 */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const installmentId = String(body.installmentId ?? body.installment_id ?? '').trim();
    if (!installmentId) {
      return NextResponse.json({ error: 'installmentId obrigatório.' }, { status: 400 });
    }

    const result = await createInterInstallmentCharge(auth.admin, {
      companyId: auth.tenantId,
      installmentId,
      userId: auth.userId,
    });

    if (!result.chargeId || !result.codigoSolicitacao) {
      return NextResponse.json(
        { error: 'Emissão Inter não retornou identificador externo.' },
        { status: 502 },
      );
    }

    const persisted = await findActiveInterBankChargeForReceipt(
      auth.admin,
      auth.tenantId,
      installmentId,
    );
    const externalId = String(persisted?.external_id || result.codigoSolicitacao || '').trim();
    if (!persisted?.id || !externalId) {
      return NextResponse.json(
        { error: 'Cobrança Inter sem registro local consistente (id/external_id).' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      reused: result.reused,
      charge: bankChargeToSummaryLike(persisted, auth.tenantId),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar cobrança Inter.';
    console.error('[finance/inter/create-charge]', message);
    const status = /já está paga|não encontrada|não pertence|não vinculada|ausentes/i.test(
      message,
    )
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
