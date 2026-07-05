import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import {
  assertCompanyAsaasChargeResponseSafe,
  CompanyAsaasIntegrationInactiveError,
  getCompanyAsaasChargeDashboardSummary,
} from '@/lib/finance/asaasCompanyChargeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const summary = await getCompanyAsaasChargeDashboardSummary(auth.admin, auth.tenantId);
    return NextResponse.json({ summary });
  } catch (err) {
    if (err instanceof CompanyAsaasIntegrationInactiveError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('[finance/asaas/charge-summary GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao carregar resumo de cobranças.' },
      { status: 500 },
    );
  }
}
