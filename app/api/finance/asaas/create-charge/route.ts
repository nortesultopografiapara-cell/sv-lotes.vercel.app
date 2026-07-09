import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import {
  assertCompanyAsaasChargeResponseSafe,
  createCompanyInstallmentCharge,
  CompanyAsaasChargePaidError,
  CompanyAsaasCustomerDocumentMissingError,
  CompanyAsaasIntegrationInactiveError,
} from '@/lib/finance/asaasCompanyChargeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const installmentId = String(body.installmentId ?? body.installment_id ?? '').trim();
    const billingTypeRaw = String(body.billingType ?? body.billing_type ?? 'BOLETO').trim().toUpperCase();
    const billingType = billingTypeRaw === 'PIX' ? 'PIX' : 'BOLETO';

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
    if (err instanceof CompanyAsaasChargePaidError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof CompanyAsaasCustomerDocumentMissingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[finance/asaas/create-charge]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao gerar cobrança Asaas.' },
      { status: 500 },
    );
  }
}
