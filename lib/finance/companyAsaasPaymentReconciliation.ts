import type { SupabaseClient } from '@supabase/supabase-js';
import {
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
      'id, status, amount, installment_number, sale_id, customer_id, block_id, project_id, sales: sale_id(contracts(contract_number, id))',
    )
    .eq('id', installmentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as FinanceReceiptRow | null) ?? null;
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
    charge.status === 'PAID' &&
    charge.paidAt &&
    linkedMovementId &&
    receiptAlreadyPaid
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
    const paidAmount = Number(charge.value) || Number(receipt.amount) || 0;
    const { error: receiptError } = await admin
      .from('finance_receipts')
      .update({
        status: 'pago',
        paid_amount: paidAmount,
        paid_at: paidAt,
      })
      .eq('id', charge.installmentId);
    if (receiptError) throw new Error(receiptError.message);
    receiptUpdated = true;
  }

  if (linkedMovementId) {
    await updateCompanyAsaasCharge(admin, charge.id, input.companyId, {
      cashMovementId: linkedMovementId,
    });
    return {
      ok: true,
      duplicate: Boolean(existingMovementId || chargeRow?.cash_movement_id),
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
