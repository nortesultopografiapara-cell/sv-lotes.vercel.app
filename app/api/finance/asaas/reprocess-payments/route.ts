import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { runAsaasReprocessPayments } from '@/lib/finance/asaasIntegrationService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    void request;
    const reprocess = await runAsaasReprocessPayments(auth.admin, auth.tenantId);
    return NextResponse.json({ reprocess });
  } catch (err) {
    console.error('[finance/asaas/reprocess-payments]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao reprocessar pagamentos.' },
      { status: 500 },
    );
  }
}
