import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import { syncCompanyAsaasCashMovements } from '@/lib/finance/companyAsaasCashSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const fromDate = body.fromDate ? String(body.fromDate).split('T')[0] : null;
    const toDate = body.toDate ? String(body.toDate).split('T')[0] : null;
    const financialAccountId = body.financialAccountId
      ? String(body.financialAccountId).trim()
      : null;

    const sync = await syncCompanyAsaasCashMovements(auth.admin, {
      scope: 'company',
      companyId: auth.tenantId,
      financialAccountId,
      fromDate,
      toDate,
      userId: auth.userId,
    });

    return NextResponse.json({ success: true, sync });
  } catch (err) {
    console.error('[finance/asaas/sync-cash]', err);
    const message =
      err instanceof Error ? err.message : 'Erro ao sincronizar extrato Asaas.';
    const status = message.includes('em andamento') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
