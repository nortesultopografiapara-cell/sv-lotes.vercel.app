import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { listCompanyAsaasChargesForInstallments } from '@/lib/finance/companyAsaasChargeRepository';
import { assertCompanyAsaasChargeResponseSafe } from '@/lib/finance/asaasCompanyChargeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(request.url);
    const raw = url.searchParams.get('installmentIds') ?? '';
    const installmentIds = raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const charges = await listCompanyAsaasChargesForInstallments(
      auth.admin,
      auth.tenantId,
      installmentIds,
    );

    for (const charge of charges) {
      assertCompanyAsaasChargeResponseSafe(charge);
    }

    return NextResponse.json({ charges });
  } catch (err) {
    console.error('[finance/asaas/charges GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao listar cobranças.' },
      { status: 500 },
    );
  }
}
