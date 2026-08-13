import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  getInterSaleChargesSummary,
  refreshInterSaleCharges,
} from '@/lib/banking/inter/interSaleChargeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET-only: materializa/sincroniza cobranças Inter da venda. Não emite. */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const saleId = String(body.saleId || body.sale_id || '').trim();
    if (!saleId) {
      return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    }
    const result = await refreshInterSaleCharges(auth.admin, {
      companyId: auth.tenantId,
      saleId,
    });
    const summary = await getInterSaleChargesSummary(auth.admin, auth.tenantId, saleId);
    return NextResponse.json({
      ok: true,
      created: false,
      ...result,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao sincronizar cobranças Inter.';
    console.error('[finance/inter/sale-charges/sync]', message);
    return NextResponse.json({ error: message, created: false }, { status: 500 });
  }
}
