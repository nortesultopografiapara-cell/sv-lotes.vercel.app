import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { listC6ChargesForInstallments } from '@/lib/banking/c6/c6ChargeList';
import { filterC6BolepixAuthorizedReceipts } from '@/lib/banking/c6/c6EmissionAuthorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lista boletos C6 já gravados. Não emite e não consulta o banco. */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as { installmentIds?: unknown };
    const installmentIds = Array.isArray(body.installmentIds)
      ? body.installmentIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 200)
      : [];
    const charges = await listC6ChargesForInstallments(auth.admin, auth.tenantId, installmentIds);
    const emitAuthorizedReceiptIds = await filterC6BolepixAuthorizedReceipts(
      auth.admin,
      auth.tenantId,
      installmentIds,
    );
    return NextResponse.json({ ok: true, charges, emitAuthorizedReceiptIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar boletos C6.';
    console.error('[finance/c6/charges POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
