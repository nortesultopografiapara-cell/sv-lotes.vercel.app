import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getLatestCompanyAsaasChargeForInstallment,
  getCompanyAsaasChargeByPaymentId,
  updateCompanyAsaasCharge,
} from './companyAsaasChargeRepository';
import type { CompanyAsaasChargeResponse } from './companyAsaasChargeTypes';

export const COMPANY_ASAAS_PAID_WEBHOOK_EVENTS = [
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_CREDITED',
  'PAYMENT_RECEIVED_IN_CASH',
] as const;

export type CompanyAsaasPaymentWebhookPayment = {
  id?: string;
  status?: string;
  value?: number;
  paymentDate?: string;
  clientPaymentDate?: string;
  confirmedDate?: string;
  creditDate?: string;
  estimatedCreditDate?: string;
  externalReference?: string;
};

export type CompanyAsaasReconcilePaymentInput = {
  companyId: string;
  asaasPaymentId: string;
  eventType?: string | null;
  paidAt?: string | null;
  paymentDate?: string | null;
  creditedDate?: string | null;
  paymentPayload?: CompanyAsaasPaymentWebhookPayment | Record<string, unknown> | null;
  userId?: string | null;
};

export type CompanyAsaasReconcilePaymentResult = {
  ok: boolean;
  duplicate: boolean;
  chargeId?: string;
  cashMovementId?: string;
  installmentId?: string;
  receiptUpdated?: boolean;
};

type FinanceReceiptRow = {
  id: string;
  status?: string;
  amount?: number;
  installment_number?: number | null;
  sale_id?: string | null;
  customer_id?: string | null;
  block_id?: string | null;
  project_id?: string | null;
  sales?: { contracts?: Array<{ contract_number?: string; id?: string }> } | null;
};

export function isCompanyAsaasPaidWebhookEvent(eventType: string): boolean {
  return (COMPANY_ASAAS_PAID_WEBHOOK_EVENTS as readonly string[]).includes(eventType);
}

export function resolveCompanyAsaasReconcileDates(
  payment?: CompanyAsaasPaymentWebhookPayment | null,
  fallbackPaidAt?: string | null,
): {
  paidAt: string;
  paymentDate: string | null;
  creditedDate: string | null;
} {
  const paymentDate =
    payment?.paymentDate ||
    payment?.clientPaymentDate ||
    payment?.confirmedDate ||
    null;
  const creditedDate =
    payment?.creditDate ||
    payment?.estimatedCreditDate ||
    payment?.confirmedDate ||
    null;
  const paidAt = paymentDate || creditedDate || fallbackPaidAt || new Date().toISOString();
  return { paidAt, paymentDate, creditedDate };
}

export function mergeCompanyAsaasChargeRawPayload(
  existing: Record<string, unknown> | null | undefined,
  paymentPayload: Record<string, unknown> | null | undefined,
  extras: {
    paymentDate?: string | null;
    creditedDate?: string | null;
    eventType?: string | null;
    reconciledAt?: string;
  },
): Record<string, unknown> {
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...(paymentPayload && typeof paymentPayload === 'object' ? paymentPayload : {}),
    payment_date: extras.paymentDate ?? null,
    credited_date: extras.creditedDate ?? null,
    reconciled_event: extras.eventType ?? null,
    reconciled_at: extras.reconciledAt ?? new Date().toISOString(),
  };
}

export function buildCompanyAsaasCashMovementDescription(
  installmentNumber: number | null | undefined,
): string {
  const parcel =
    installmentNumber === 0 ? 'Entrada' : `Parcela ${installmentNumber ?? 1}`;
  return `Recebimento automático Asaas - ${parcel}`;
}

export function buildCompanyAsaasCashMovementInsert(input: {
  companyId: string;
  charge: CompanyAsaasChargeResponse;
  receipt: FinanceReceiptRow;
  paidAt: string;
  paymentDate?: string | null;
  creditedDate?: string | null;
  userId?: string | null;
}): Record<string, unknown> {
  const installmentNumber = input.receipt.installment_number ?? 1;
  return {
    tenant_id: input.companyId,
    company_id: input.companyId,
    project_id: input.receipt.project_id ?? null,
    type: 'entrada',
    category: 'Venda de Lote',
    description: buildCompanyAsaasCashMovementDescription(installmentNumber),
    amount: input.charge.value,
    customer_id: input.charge.customerId ?? input.receipt.customer_id ?? null,
    sale_id: input.charge.saleId ?? input.receipt.sale_id ?? null,
    finance_receipt_id: input.charge.installmentId,
    movement_date: input.paidAt.split('T')[0],
    source_table: 'company_asaas_charges',
    source_id: input.charge.id,
    status: 'ativo',
    created_by: input.userId ?? null,
    metadata: {
      provider: 'ASAAS_COMPANY',
      external_id: input.charge.asaasPaymentId,
      installment_id: input.charge.installmentId,
      charge_id: input.charge.id,
      payment_date: input.paymentDate ?? null,
      credited_date: input.creditedDate ?? null,
      occurred_at: input.paidAt,
    },
  };
}

function isReceiptPaid(status?: string | null): boolean {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'pago' || normalized === 'paid';
}

export function isCompanyAsaasChargeFullyReconciled(input: {
  chargeStatus?: string | null;
  receiptStatus?: string | null;
  cashMovementId?: string | null;
}): boolean {
  return (
    String(input.chargeStatus || '').toUpperCase() === 'PAID' &&
    isReceiptPaid(input.receiptStatus) &&
    Boolean(input.cashMovementId)
  );
}

async function findExistingCompanyAsaasCashMovement(
  admin: SupabaseClient,
  companyId: string,
  chargeId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('cash_movements')
    .select('id')
    .eq('company_id', companyId)
    .eq('source_table', 'company_asaas_charges')
    .eq('source_id', chargeId)
    .eq('status', 'ativo')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : null;
}

async function loadFinanceReceipt(
  admin: SupabaseClient,
  installmentId: string,
): Promise<FinanceReceiptRow | null> {
  const { data, error } = await admin
    .from('finance_receipts')
    .select(
      'id, status, amount, installment_number, sale_id, customer_id, block_id, project_id',
    )
    .eq('id', installmentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as FinanceReceiptRow | null) ?? null;
}

export async function markFinanceReceiptPaidFromCompanyAsaasCharge(
  admin: SupabaseClient,
  input: {
    installmentId: string;
    paidAmount: number;
    paidAt: string;
  },
): Promise<boolean> {
  const receipt = await loadFinanceReceipt(admin, input.installmentId);
  if (!receipt) {
    throw new Error(
      `Parcela financeira não encontrada (installment_id=${input.installmentId}).`,
    );
  }
  if (isReceiptPaid(receipt.status)) return false;

  const { data, error } = await admin
    .from('finance_receipts')
    .update({
      status: 'pago',
      paid_amount: input.paidAmount,
      paid_at: input.paidAt,
    })
    .eq('id', input.installmentId)
    .select('id, status')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      `Não foi possível baixar a parcela ${input.installmentId} em finance_receipts.`,
    );
  }
  return true;
}

export async function ensureCompanyAsaasInstallmentReconciled(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
  options?: Omit<CompanyAsaasReconcilePaymentInput, 'companyId' | 'asaasPaymentId'> & {
    asaasPaymentId?: string | null;
  },
): Promise<CompanyAsaasReconcilePaymentResult> {
  const charge = await getLatestCompanyAsaasChargeForInstallment(admin, companyId, installmentId);
  if (!charge) {
    return { ok: false, duplicate: false, installmentId };
  }
  if (charge.status !== 'PAID') {
    return { ok: false, duplicate: false, installmentId, chargeId: charge.id };
  }

  const asaasPaymentId = String(
    options?.asaasPaymentId || charge.asaasPaymentId || '',
  ).trim();
  if (!asaasPaymentId) {
    throw new Error('Cobrança Asaas paga sem asaas_payment_id para conciliação.');
  }

  return executeCompanyAsaasPaymentReconciliation(admin, {
    companyId,
    asaasPaymentId,
    eventType: options?.eventType ?? 'INSTALLMENT_RECONCILE',
    paidAt: options?.paidAt ?? charge.paidAt,
    paymentDate: options?.paymentDate ?? null,
    creditedDate: options?.creditedDate ?? null,
    paymentPayload: options?.paymentPayload ?? null,
    userId: options?.userId ?? null,
  });
}

export async function ensureCompanyAsaasInstallmentReconciledIfNeeded(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
  options?: Omit<CompanyAsaasReconcilePaymentInput, 'companyId' | 'asaasPaymentId'>,
): Promise<CompanyAsaasReconcilePaymentResult | null> {
  const charge = await getLatestCompanyAsaasChargeForInstallment(admin, companyId, installmentId);
  if (!charge || charge.status !== 'PAID') return null;

  const { data: chargeRow } = await admin
    .from('company_asaas_charges')
    .select('cash_movement_id')
    .eq('id', charge.id)
    .eq('company_id', companyId)
    .maybeSingle();

  const receipt = await loadFinanceReceipt(admin, installmentId);
  if (
    isCompanyAsaasChargeFullyReconciled({
      chargeStatus: charge.status,
      receiptStatus: receipt?.status,
      cashMovementId: chargeRow?.cash_movement_id
        ? String(chargeRow.cash_movement_id)
        : null,
    })
  ) {
    return null;
  }

  return ensureCompanyAsaasInstallmentReconciled(admin, companyId, installmentId, options);
}

export async function executeCompanyAsaasPaymentReconciliation(
  admin: SupabaseClient,
  input: CompanyAsaasReconcilePaymentInput,
): Promise<CompanyAsaasReconcilePaymentResult> {
  const charge = await getCompanyAsaasChargeByPaymentId(
    admin,
    input.companyId,
    input.asaasPaymentId,
  );
  if (!charge) {
    return { ok: false, duplicate: false };
  }

  const dates = resolveCompanyAsaasReconcileDates(
    (input.paymentPayload as CompanyAsaasPaymentWebhookPayment | null) ?? null,
    input.paidAt,
  );
  const paidAt = input.paidAt || dates.paidAt;
  const paymentDate = input.paymentDate ?? dates.paymentDate;
  const creditedDate = input.creditedDate ?? dates.creditedDate;

  const existingMovementId =
    (await findExistingCompanyAsaasCashMovement(admin, input.companyId, charge.id)) ?? null;

  const { data: chargeRow } = await admin
    .from('company_asaas_charges')
    .select('raw_payload, cash_movement_id, status, paid_at')
    .eq('id', charge.id)
    .eq('company_id', input.companyId)
    .maybeSingle();

  const linkedMovementId =
    existingMovementId ||
    (chargeRow?.cash_movement_id ? String(chargeRow.cash_movement_id) : null);

  const receipt = await loadFinanceReceipt(admin, charge.installmentId);
  const receiptAlreadyPaid = receipt ? isReceiptPaid(receipt.status) : false;

  if (
    isCompanyAsaasChargeFullyReconciled({
      chargeStatus: charge.status,
      receiptStatus: receipt?.status,
      cashMovementId: linkedMovementId,
    })
  ) {
    return {
      ok: true,
      duplicate: true,
      chargeId: charge.id,
      cashMovementId: linkedMovementId,
      installmentId: charge.installmentId,
      receiptUpdated: false,
    };
  }

  const rawPayload = mergeCompanyAsaasChargeRawPayload(
    (chargeRow?.raw_payload as Record<string, unknown> | undefined) ?? {},
    (input.paymentPayload as Record<string, unknown> | null) ?? null,
    {
      paymentDate,
      creditedDate,
      eventType: input.eventType ?? null,
    },
  );

  await updateCompanyAsaasCharge(admin, charge.id, input.companyId, {
    status: 'PAID',
    paidAt,
    rawPayload,
    cashMovementId: linkedMovementId ?? undefined,
  });

  let receiptUpdated = false;
  if (receipt && !receiptAlreadyPaid) {
    receiptUpdated = await markFinanceReceiptPaidFromCompanyAsaasCharge(admin, {
      installmentId: charge.installmentId,
      paidAmount: Number(charge.value) || Number(receipt.amount) || 0,
      paidAt,
    });
  } else if (!receipt && charge.status === 'PAID') {
    throw new Error(
      `Parcela vinculada não encontrada para baixa automática (installment_id=${charge.installmentId}).`,
    );
  }

  if (linkedMovementId) {
    await updateCompanyAsaasCharge(admin, charge.id, input.companyId, {
      cashMovementId: linkedMovementId,
    });
    return {
      ok: true,
      duplicate: Boolean(existingMovementId || chargeRow?.cash_movement_id) && receiptUpdated === false,
      chargeId: charge.id,
      cashMovementId: linkedMovementId,
      installmentId: charge.installmentId,
      receiptUpdated,
    };
  }

  if (!receipt) {
    return {
      ok: true,
      duplicate: false,
      chargeId: charge.id,
      installmentId: charge.installmentId,
      receiptUpdated,
    };
  }

  const movementPayload = buildCompanyAsaasCashMovementInsert({
    companyId: input.companyId,
    charge,
    receipt,
    paidAt,
    paymentDate,
    creditedDate,
    userId: input.userId ?? null,
  });

  const { data: movement, error: movementError } = await admin
    .from('cash_movements')
    .insert(movementPayload)
    .select('id')
    .single();

  if (movementError) throw new Error(movementError.message);

  const cashMovementId = String(movement.id);
  await updateCompanyAsaasCharge(admin, charge.id, input.companyId, {
    cashMovementId,
  });

  console.info('[company-asaas-reconcile] parcela baixada automaticamente', {
    companyId: input.companyId,
    chargeId: charge.id,
    installmentId: charge.installmentId,
    asaasPaymentId: charge.asaasPaymentId,
    cashMovementId,
    eventType: input.eventType ?? null,
  });

  return {
    ok: true,
    duplicate: false,
    chargeId: charge.id,
    cashMovementId,
    installmentId: charge.installmentId,
    receiptUpdated,
  };
}

export async function reprocessCompanyAsaasPaidCharges(
  admin: SupabaseClient,
  companyId: string,
  options?: { userId?: string | null },
): Promise<{
  reprocessedCount: number;
  receiptUpdatedCount: number;
  cashMovementCreatedCount: number;
}> {
  const { data: paidCharges, error } = await admin
    .from('company_asaas_charges')
    .select('id, asaas_payment_id, installment_id, paid_at, status, cash_movement_id')
    .eq('company_id', companyId)
    .eq('status', 'PAID');

  if (error) throw new Error(error.message);

  let reprocessedCount = 0;
  let receiptUpdatedCount = 0;
  let cashMovementCreatedCount = 0;

  for (const row of paidCharges ?? []) {
    const asaasPaymentId = String(row.asaas_payment_id || '').trim();
    if (!asaasPaymentId) continue;

    const installmentId = String(row.installment_id || '').trim();
    const receipt = installmentId ? await loadFinanceReceipt(admin, installmentId) : null;
    const alreadyReconciled = isCompanyAsaasChargeFullyReconciled({
      chargeStatus: row.status,
      receiptStatus: receipt?.status,
      cashMovementId: row.cash_movement_id ? String(row.cash_movement_id) : null,
    });
    if (alreadyReconciled) continue;

    const result = await executeCompanyAsaasPaymentReconciliation(admin, {
      companyId,
      asaasPaymentId,
      eventType: 'REPROCESS',
      paidAt: row.paid_at ? String(row.paid_at) : null,
      userId: options?.userId ?? null,
    });

    if (!result.ok) continue;
    reprocessedCount += 1;
    if (result.receiptUpdated) receiptUpdatedCount += 1;
    if (result.cashMovementId && !row.cash_movement_id) cashMovementCreatedCount += 1;
  }

  const { data: failedEvents, error: eventsError } = await admin
    .from('company_asaas_webhook_events')
    .select('id, asaas_payment_id, event_type, raw_payload')
    .eq('company_id', companyId)
    .in('processing_status', ['FAILED', 'PENDING'])
    .not('asaas_payment_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(100);

  if (eventsError) throw new Error(eventsError.message);

  for (const event of failedEvents ?? []) {
    const eventType = String(event.event_type || '');
    if (!isCompanyAsaasPaidWebhookEvent(eventType)) continue;

    const asaasPaymentId = String(event.asaas_payment_id || '').trim();
    if (!asaasPaymentId) continue;

    const rawPayload =
      event.raw_payload && typeof event.raw_payload === 'object'
        ? (event.raw_payload as Record<string, unknown>)
        : {};
    const payment =
      rawPayload.payment && typeof rawPayload.payment === 'object'
        ? (rawPayload.payment as CompanyAsaasPaymentWebhookPayment)
        : null;
    const dates = resolveCompanyAsaasReconcileDates(payment);

    const result = await executeCompanyAsaasPaymentReconciliation(admin, {
      companyId,
      asaasPaymentId,
      eventType,
      paidAt: dates.paidAt,
      paymentDate: dates.paymentDate,
      creditedDate: dates.creditedDate,
      paymentPayload: payment,
      userId: options?.userId ?? null,
    });

    if (result.ok) {
      reprocessedCount += 1;
      if (result.receiptUpdated) receiptUpdatedCount += 1;
      await admin
        .from('company_asaas_webhook_events')
        .update({
          processing_status: result.duplicate ? 'DUPLICATE' : 'PROCESSED',
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', event.id)
        .eq('company_id', companyId);
    }
  }

  return { reprocessedCount, receiptUpdatedCount, cashMovementCreatedCount };
}
