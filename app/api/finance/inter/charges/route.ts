import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  bankChargeToSummaryLike,
  listInterChargesForInstallments,
} from '@/lib/banking/inter/interSaleChargeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lista cobranças Inter (bank_charges) por installmentIds — uso na Central. */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const rawIds = Array.isArray(body.installmentIds)
      ? body.installmentIds
      : Array.isArray(body.installment_ids)
        ? body.installment_ids
        : [];
    const installmentIds = rawIds
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .slice(0, 200);

    const map = await listInterChargesForInstallments(
      auth.admin,
      auth.tenantId,
      installmentIds,
    );
    const charges = Array.from(map.values()).map((row) =>
      bankChargeToSummaryLike(row, auth.tenantId),
    );
    return NextResponse.json({ ok: true, charges });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar cobranças Inter.';
    console.error('[finance/inter/charges POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
