import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import { runAsaasTestConnection } from '@/lib/finance/asaasIntegrationService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    void request;
    const connection = await runAsaasTestConnection(auth.admin, auth.tenantId);
    return NextResponse.json({ connection });
  } catch (err) {
    console.error('[finance/asaas/test-connection]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao testar conexão.' },
      { status: 500 },
    );
  }
}
