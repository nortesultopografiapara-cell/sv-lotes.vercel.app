import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import { runAsaasValidateWebhook } from '@/lib/finance/asaasIntegrationService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    void request;
    const validation = await runAsaasValidateWebhook(auth.admin, auth.tenantId);
    return NextResponse.json({ validation });
  } catch (err) {
    console.error('[finance/asaas/validate-webhook]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao validar webhook.' },
      { status: 500 },
    );
  }
}
