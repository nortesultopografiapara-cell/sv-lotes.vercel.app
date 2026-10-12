import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { getInterSaleChargesSummary } from '@/lib/banking/inter/interSaleChargeService';
import { getInterResumeJobView } from '@/lib/banking/inter/interSaleChargesResumeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const saleId = new URL(request.url).searchParams.get('saleId')?.trim() || '';
    if (!saleId) {
      return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    }
    const summary = await getInterSaleChargesSummary(auth.admin, auth.tenantId, saleId);
    let job = null;
    try {
      job = await getInterResumeJobView(auth.admin, auth.tenantId, saleId);
    } catch {
      job = null;
    }
    return NextResponse.json({ ok: true, summary, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar cobranças Inter.';
    console.error('[finance/inter/sale-charges GET]', message);
    const status = /vinculada|não encontrada|não pertence/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
