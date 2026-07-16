import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import { listCompanyAsaasChargesForInstallments } from '@/lib/finance/companyAsaasChargeRepository';
import { assertCompanyAsaasChargeResponseSafe } from '@/lib/finance/asaasCompanyChargeService';
import {
  CompanyAsaasReconciliationError,
  forceCompanyAsaasPaidInstallmentReconciliation,
  isCompanyAsaasChargeStatusPaid,
  isReceiptPaidStatus,
  loadFinanceReceiptForReconciliation,
  needsCompanyAsaasReceiptReconciliation,
} from '@/lib/finance/companyAsaasPaymentReconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseInstallmentIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
  return [];
}

type CompanyAsaasAuth = Exclude<
  Awaited<ReturnType<typeof authorizeCompanyAsaasRoute>>,
  { error: NextResponse }
>;

async function listChargesForAuth(auth: CompanyAsaasAuth, installmentIds: string[]) {
  const charges = await listCompanyAsaasChargesForInstallments(
    auth.admin,
    auth.tenantId,
    installmentIds,
  );

  const receiptSyncErrors: Array<{
    chargeId?: string;
    installmentId: string;
    error: string;
  }> = [];

  for (const charge of charges) {
    if (!isCompanyAsaasChargeStatusPaid(charge.status)) {
      assertCompanyAsaasChargeResponseSafe(charge);
      continue;
    }

    const receipt = await loadFinanceReceiptForReconciliation(
      auth.admin,
      charge.installmentId,
    );
    const needsSync = needsCompanyAsaasReceiptReconciliation({
      chargeStatus: charge.status,
      receiptStatus: receipt?.status,
    });

    if (needsSync) {
      try {
        await forceCompanyAsaasPaidInstallmentReconciliation(
          auth.admin,
          auth.tenantId,
          charge.installmentId,
          { eventType: 'CHARGES_LIST_SYNC' },
        );
      } catch (syncErr) {
        const message = syncErr instanceof Error ? syncErr.message : String(syncErr);
        receiptSyncErrors.push({
          chargeId: charge.id,
          installmentId: charge.installmentId,
          error: message,
        });
        console.error('[finance/asaas/charges] reconcile failed', {
          installmentId: charge.installmentId,
          chargeId: charge.id,
          error: message,
        });
      }
    }

    const receiptAfter = await loadFinanceReceiptForReconciliation(
      auth.admin,
      charge.installmentId,
    );
    if (
      needsSync &&
      !isReceiptPaidStatus(receiptAfter?.status) &&
      !receiptSyncErrors.some((e) => e.installmentId === charge.installmentId)
    ) {
      const message = `Backfill não confirmou parcela paga (charge.id=${charge.id}, installment_id=${charge.installmentId}).`;
      receiptSyncErrors.push({
        chargeId: charge.id,
        installmentId: charge.installmentId,
        error: message,
      });
    }

    assertCompanyAsaasChargeResponseSafe(charge);
  }

  return {
    charges,
    receiptSyncErrors: receiptSyncErrors.length > 0 ? receiptSyncErrors : undefined,
  };
}

export async function GET(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(request.url);
    const installmentIds = parseInstallmentIds(url.searchParams.get('installmentIds') ?? '');
    const result = await listChargesForAuth(auth, installmentIds);
    return NextResponse.json(result);
  } catch (err) {
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
    console.error('[finance/asaas/charges GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao listar cobranças.' },
      { status: 500 },
    );
  }
}

/** POST evita truncar installmentIds em querystring (empresas com muitas parcelas). */
export async function POST(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const installmentIds = parseInstallmentIds(
      (body as { installmentIds?: unknown }).installmentIds,
    );
    const result = await listChargesForAuth(auth, installmentIds);
    return NextResponse.json(result);
  } catch (err) {
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
    console.error('[finance/asaas/charges POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao listar cobranças.' },
      { status: 500 },
    );
  }
}
