import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import { runAsaasSyncCharges } from '@/lib/finance/asaasIntegrationService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    void request;
    const sync = await runAsaasSyncCharges(auth.admin, auth.tenantId);
    return NextResponse.json({ sync });
  } catch (err) {
    console.error('[finance/asaas/sync-charges]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao sincronizar cobranças.' },
      { status: 500 },
    );
  }
}
