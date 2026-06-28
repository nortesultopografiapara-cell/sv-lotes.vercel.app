import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import {
  assertCompanyAsaasChargeResponseSafe,
  cancelCompanyCharge,
  getCompanyChargeStatus,
  getCompanyChargeStatusByInstallment,
  CompanyAsaasIntegrationInactiveError,
} from '@/lib/finance/asaasCompanyChargeService';
import {
  CompanyAsaasReconciliationError,
  forceCompanyAsaasPaidInstallmentReconciliation,
  isCompanyAsaasChargeStatusPaid,
  isReceiptPaidStatus,
  loadFinanceReceiptForReconciliation,
} from '@/lib/finance/companyAsaasPaymentReconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(request.url);
    const installmentId = String(url.searchParams.get('installmentId') ?? '').trim();
    const chargeId = String(url.searchParams.get('chargeId') ?? '').trim();

    if (chargeId) {
      const { data: chargeRow } = await auth.admin
        .from('company_asaas_charges')
        .select('installment_id')
        .eq('id', chargeId)
        .eq('company_id', auth.tenantId)
        .maybeSingle();
      const linkedInstallmentId = String(chargeRow?.installment_id || '').trim();

      const charge = await getCompanyChargeStatus(auth.admin, auth.tenantId, chargeId);
      assertCompanyAsaasChargeResponseSafe(charge);

      let receiptUpdated = false;
      if (isCompanyAsaasChargeStatusPaid(charge.status) && linkedInstallmentId) {
        const before = await loadFinanceReceiptForReconciliation(
          auth.admin,
          linkedInstallmentId,
        );
        const reconcile = await forceCompanyAsaasPaidInstallmentReconciliation(
          auth.admin,
          auth.tenantId,
          linkedInstallmentId,
          { eventType: 'MANUAL_STATUS_SYNC' },
        );
        const after = await loadFinanceReceiptForReconciliation(
          auth.admin,
          linkedInstallmentId,
        );
        receiptUpdated =
          Boolean(reconcile.receiptUpdated) ||
          (!isReceiptPaidStatus(before?.status) && isReceiptPaidStatus(after?.status));
      }

      return NextResponse.json({ charge, receiptUpdated });
    }

    if (installmentId) {
      const before = await loadFinanceReceiptForReconciliation(auth.admin, installmentId);

      const charge = await getCompanyChargeStatusByInstallment(
        auth.admin,
        auth.tenantId,
        installmentId,
      );

      let receiptUpdated = false;
      if (charge) {
        assertCompanyAsaasChargeResponseSafe(charge);
        if (isCompanyAsaasChargeStatusPaid(charge.status)) {
          const reconcile = await forceCompanyAsaasPaidInstallmentReconciliation(
            auth.admin,
            auth.tenantId,
            installmentId,
            { eventType: 'MANUAL_STATUS_SYNC' },
          );
          const after = await loadFinanceReceiptForReconciliation(
            auth.admin,
            installmentId,
          );
          receiptUpdated =
            Boolean(reconcile.receiptUpdated) ||
            (!isReceiptPaidStatus(before?.status) && isReceiptPaidStatus(after?.status));
        }
      }

      return NextResponse.json({ charge, receiptUpdated });
    }

    return NextResponse.json({ error: 'installmentId ou chargeId obrigatório.' }, { status: 400 });
  } catch (err) {
    if (err instanceof CompanyAsaasIntegrationInactiveError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof CompanyAsaasReconciliationError) {
      return NextResponse.json(
        {
          error: err.message,
          chargeId: err.chargeId,
          installmentId: err.installmentId,
        },
        { status: 409 },
      );
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
