import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  assertCompanyAsaasChargeResponseSafe,
  createCompanyInstallmentCharge,
  CompanyAsaasIntegrationInactiveError,
} from '@/lib/finance/asaasCompanyChargeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const installmentId = String(body.installmentId ?? body.installment_id ?? '').trim();
    const billingTypeRaw = String(body.billingType ?? body.billing_type ?? 'PIX').trim().toUpperCase();
    const billingType = billingTypeRaw === 'BOLETO' ? 'BOLETO' : 'PIX';

    if (!installmentId) {
      return NextResponse.json({ error: 'installmentId obrigatório.' }, { status: 400 });
    }

    const charge = await createCompanyInstallmentCharge(auth.admin, {
      companyId: auth.tenantId,
      installmentId,
      billingType,
      userId: auth.userId,
    });

    assertCompanyAsaasChargeResponseSafe(charge);
    return NextResponse.json({ charge });
  } catch (err) {
    if (err instanceof CompanyAsaasIntegrationInactiveError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('[finance/asaas/create-charge]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao gerar cobrança Asaas.' },
      { status: 500 },
    );
  }
}
