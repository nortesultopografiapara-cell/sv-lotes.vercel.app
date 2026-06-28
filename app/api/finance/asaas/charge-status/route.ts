import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import {
  assertCompanyAsaasChargeResponseSafe,
  cancelCompanyCharge,
  getCompanyChargeStatus,
  getCompanyChargeStatusByInstallment,
  CompanyAsaasIntegrationInactiveError,
} from '@/lib/finance/asaasCompanyChargeService';
import { ensureCompanyAsaasInstallmentReconciledIfNeeded } from '@/lib/finance/companyAsaasPaymentReconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(request.url);
    const installmentId = String(url.searchParams.get('installmentId') ?? '').trim();
    const chargeId = String(url.searchParams.get('chargeId') ?? '').trim();
    let receiptUpdated = false;

    if (chargeId) {
      const charge = await getCompanyChargeStatus(auth.admin, auth.tenantId, chargeId);
      assertCompanyAsaasChargeResponseSafe(charge);
      if (charge.status === 'PAID') {
        const reconcile = await ensureCompanyAsaasInstallmentReconciledIfNeeded(
          auth.admin,
          auth.tenantId,
          charge.installmentId,
          { eventType: 'MANUAL_STATUS_SYNC' },
        );
        receiptUpdated = Boolean(reconcile?.receiptUpdated);
      }
      return NextResponse.json({ charge, receiptUpdated });
    }

    if (installmentId) {
      const charge = await getCompanyChargeStatusByInstallment(
        auth.admin,
        auth.tenantId,
        installmentId,
      );
      if (charge) {
        assertCompanyAsaasChargeResponseSafe(charge);
        if (charge.status === 'PAID') {
          const reconcile = await ensureCompanyAsaasInstallmentReconciledIfNeeded(
            auth.admin,
            auth.tenantId,
            installmentId,
            { eventType: 'MANUAL_STATUS_SYNC' },
          );
          receiptUpdated = Boolean(reconcile?.receiptUpdated);
        }
      }
      return NextResponse.json({ charge, receiptUpdated });
    }

    return NextResponse.json({ error: 'installmentId ou chargeId obrigatório.' }, { status: 400 });
  } catch (err) {
    if (err instanceof CompanyAsaasIntegrationInactiveError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('[finance/asaas/charge-status GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao consultar cobrança.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(request.url);
    const chargeId = String(url.searchParams.get('chargeId') ?? '').trim();
    if (!chargeId) {
      return NextResponse.json({ error: 'chargeId obrigatório.' }, { status: 400 });
    }
    const charge = await cancelCompanyCharge(auth.admin, auth.tenantId, chargeId);
    assertCompanyAsaasChargeResponseSafe(charge);
    return NextResponse.json({ charge });
  } catch (err) {
    console.error('[finance/asaas/charge-status DELETE]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao cancelar cobrança.' },
      { status: 500 },
    );
  }
}
