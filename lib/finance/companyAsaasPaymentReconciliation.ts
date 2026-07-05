import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getLatestCompanyAsaasChargeForInstallment,
  getCompanyAsaasChargeByPaymentId,
  updateCompanyAsaasCharge,
} from './companyAsaasChargeRepository';
import type { CompanyAsaasChargeResponse } from './companyAsaasChargeTypes';
import { buildCashMovementEntradaPayload } from './cashMovementsSchema';

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
  asaasPaymentId?: string | null;
  installmentId?: string | null;
  eventType?: string | null;
  paidAt?: string | null;
  paymentDate?: string | null;
  creditedDate?: string | null;
  paymentPayload?: CompanyAsaasPaymentWebhookPayment | Record<string, unknown> | null;
  userId?: string | null;
};

export const FINANCE_RECEIPT_PAID_STATUS = 'pago' as const;

export class CompanyAsaasReconciliationError extends Error {
  chargeId?: string;
  installmentId?: string;

  constructor(message: string, meta?: { chargeId?: string; installmentId?: string }) {
    super(message);
    this.name = 'CompanyAsaasReconciliationError';
    this.chargeId = meta?.chargeId;
    this.installmentId = meta?.installmentId;
  }
}

export type CompanyAsaasReconcilePaymentResult = {
  ok: boolean;
  duplicate: boolean;
  chargeId?: string;
  cashMovementId?: string;
  installmentId?: string;
  receiptUpdated?: boolean;
  /** Erro ao criar caixa — parcela permanece paga se já baixada. */
  cashMovementError?: string;
};

type FinanceReceiptRow = {
  id: string;
  status?: string;
  amount?: number;
  paid_amount?: number | null;
  paid_at?: string | null;
  company_id?: string | null;
  tenant_id?: string | null;
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

export function isCompanyAsaasChargeStatusPaid(status?: string | null): boolean {
  return String(status || '').toUpperCase() === 'PAID';
}

export function isReceiptPaidStatus(status?: string | null): boolean {
  const normalized = String(status || '').toLowerCase();
  return (
    normalized === FINANCE_RECEIPT_PAID_STATUS ||
    normalized === 'paid' ||
    normalized === 'paga'
  );
}

export function needsCompanyAsaasReceiptReconciliation(input: {
  chargeStatus?: string | null;
  receiptStatus?: string | null;
}): boolean {
  return isCompanyAsaasChargeStatusPaid(input.chargeStatus) && !isReceiptPaidStatus(input.receiptStatus);
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
  return buildCashMovementEntradaPayload({
    tenant_id: input.companyId,
    company_id: input.companyId,
    project_id: input.receipt.project_id ?? null,
    type: 'entrada',
    category: 'Venda de Lote',
    description: buildCompanyAsaasCashMovementDescription(installmentNumber),
    amount: input.charge.value,
    customer_id: input.charge.customerId ?? input.receipt.customer_id ?? null,
    sale_id: input.charge.saleId ?? input.receipt.sale_id ?? null,
    movement_date: input.paidAt.split('T')[0],
    status: 'ativo',
    created_by: input.userId ?? null,
    metadata: {
      provider: 'ASAAS_COMPANY',
      asaas_payment_id: input.charge.asaasPaymentId,
      external_id: input.charge.asaasPaymentId,
      receipt_id: input.charge.installmentId,
      installment_id: input.charge.installmentId,
      charge_id: input.charge.id,
      payment_date: input.paymentDate ?? null,
      credited_date: input.creditedDate ?? null,
      occurred_at: input.paidAt,
    },
  });
}

export function isCompanyAsaasChargeFullyReconciled(input: {
  chargeStatus?: string | null;
  receiptStatus?: string | null;
  cashMovementId?: string | null;
}): boolean {
  return (
    isCompanyAsaasReceiptReconciled({
      chargeStatus: input.chargeStatus,
      receiptStatus: input.receiptStatus,
    }) && Boolean(input.cashMovementId)
  );
}

/** Parcela baixada — prioridade absoluta (equivalente a saas_charges PAID no Master). */
export function isCompanyAsaasReceiptReconciled(input: {
  chargeStatus?: string | null;
  receiptStatus?: string | null;
}): boolean {
  return (
    isCompanyAsaasChargeStatusPaid(input.chargeStatus) &&
    isReceiptPaidStatus(input.receiptStatus)
  );
}

/** Idempotência: company_asaas_charges.cash_movement_id ou metadata.charge_id (sem finance_receipt_id). */
async function findExistingCompanyAsaasCashMovement(
  admin: SupabaseClient,
  companyId: string,
  chargeId: string,
  installmentId: string,
): Promise<string | null> {
  const normalizedChargeId = String(chargeId || '').trim();
  const normalizedInstallmentId = String(installmentId || '').trim();

  if (normalizedChargeId) {
    const { data: chargeRow, error: chargeErr } = await admin
      .from('company_asaas_charges')
      .select('cash_movement_id')
      .eq('id', normalizedChargeId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (chargeErr) throw new Error(chargeErr.message);
    if (chargeRow?.cash_movement_id) {
      return String(chargeRow.cash_movement_id);
    }
  }

  if (normalizedChargeId) {
    const { data, error } = await admin
      .from('cash_movements')
      .select('id')
      .eq('company_id', companyId)
      .eq('type', 'entrada')
      .eq('status', 'ativo')
      .filter('metadata->>charge_id', 'eq', normalizedChargeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.id) return String(data.id);
  }

  if (normalizedInstallmentId) {
    const { data, error } = await admin
      .from('cash_movements')
      .select('id')
      .eq('company_id', companyId)
      .eq('type', 'entrada')
      .eq('status', 'ativo')
      .filter('metadata->>installment_id', 'eq', normalizedInstallmentId)
      .filter('metadata->>provider', 'eq', 'ASAAS_COMPANY')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.id) return String(data.id);
  }

  return null;
}

type EnsureCashMovementResult = {
  cashMovementId: string | null;
  created: boolean;
  error: string | null;
};

/**
 * Caixa opcional — espelha ensureSaasCashIncomeForPaidCharge (Master):
 * nunca impede baixa da parcela; falha só gera log/erro no retorno.
 */
async function tryEnsureCompanyAsaasCashMovement(
  admin: SupabaseClient,
  input: {
    companyId: string;
    charge: CompanyAsaasChargeResponse;
    receipt: FinanceReceiptRow;
    paidAt: string;
    paymentDate?: string | null;
    creditedDate?: string | null;
    userId?: string | null;
  },
): Promise<EnsureCashMovementResult> {
  const installmentId = String(input.charge.installmentId || '').trim();
  try {
    const existingId = await findExistingCompanyAsaasCashMovement(
      admin,
      input.companyId,
      input.charge.id,
      installmentId,
    );
    if (existingId) {
      await updateCompanyAsaasCharge(admin, input.charge.id, input.companyId, {
        cashMovementId: existingId,
      });
      return { cashMovementId: existingId, created: false, error: null };
    }

    const movementPayload = buildCompanyAsaasCashMovementInsert({
      companyId: input.companyId,
      charge: input.charge,
      receipt: input.receipt,
      paidAt: input.paidAt,
      paymentDate: input.paymentDate,
      creditedDate: input.creditedDate,
      userId: input.userId ?? null,
    });

    const { data: movement, error: movementError } = await admin
      .from('cash_movements')
      .insert(movementPayload)
      .select('id')
      .single();

    if (movementError) {
      console.error('[company-asaas-reconcile] cash_movements insert failed (parcela mantida paga)', {
        chargeId: input.charge.id,
        installmentId,
        error: movementError.message,
      });
      return { cashMovementId: null, created: false, error: movementError.message };
    }

    const cashMovementId = String(movement.id);
    await updateCompanyAsaasCharge(admin, input.charge.id, input.companyId, {
      cashMovementId,
    });

    console.info('[company-asaas-reconcile] cash_movement criado', {
      chargeId: input.charge.id,
      installmentId,
      cashMovementId,
    });

    return { cashMovementId, created: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[company-asaas-reconcile] cash_movements ensure failed (parcela mantida paga)', {
      chargeId: input.charge.id,
      installmentId,
      error: message,
    });
    return { cashMovementId: null, created: false, error: message };
  }
}

export async function loadFinanceReceiptForReconciliation(
  admin: SupabaseClient,
  installmentId: string,
): Promise<FinanceReceiptRow | null> {
  const normalizedInstallmentId = String(installmentId || '').trim();
  if (!normalizedInstallmentId) return null;

  const { data, error } = await admin
    .from('finance_receipts')
    .select(
      'id, status, amount, paid_amount, paid_at, company_id, tenant_id, installment_number, sale_id, customer_id, block_id, project_id',
    )
    .eq('id', normalizedInstallmentId)
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
    chargeId?: string;
  },
): Promise<boolean> {
  const installmentId = String(input.installmentId || '').trim();
  const chargeId = String(input.chargeId || '').trim() || undefined;
  if (!installmentId) {
    throw new CompanyAsaasReconciliationError(
      'installment_id é obrigatório para baixar finance_receipts.',
      { chargeId, installmentId },
    );
  }

  const receipt = await loadFinanceReceiptForReconciliation(admin, installmentId);
  if (!receipt) {
    throw new CompanyAsaasReconciliationError(
      `Parcela financeira não encontrada (installment_id=${installmentId}).`,
      { chargeId, installmentId },
    );
  }
  if (isReceiptPaidStatus(receipt.status)) return false;

  const paidAt = String(input.paidAt || new Date().toISOString());
  const paidAmount = Number(input.paidAmount) || Number(receipt.amount) || 0;

  console.info('[company-asaas-reconcile] baixando finance_receipts', {
    chargeId,
    installmentId,
    receiptStatusBefore: receipt.status,
    paidAmount,
    paidAt,
  });

  const { data, error } = await admin
    .from('finance_receipts')
    .update({
      status: FINANCE_RECEIPT_PAID_STATUS,
      paid_amount: paidAmount,
      paid_at: paidAt,
    })
    .eq('id', installmentId)
    .select('id, status, paid_amount, paid_at');

  if (error) {
    console.error('[company-asaas-reconcile] finance_receipts UPDATE failed', {
      chargeId,
      installmentId,
      error: error.message,
    });
    throw new CompanyAsaasReconciliationError(error.message, { chargeId, installmentId });
  }

  if (!data || data.length === 0) {
    const message = `UPDATE finance_receipts não afetou linhas (charge.id=${chargeId ?? '—'}, installment_id=${installmentId}).`;
    console.error('[company-asaas-reconcile]', message);
    throw new CompanyAsaasReconciliationError(message, { chargeId, installmentId });
  }

  const verified = await loadFinanceReceiptForReconciliation(admin, installmentId);
  if (!isReceiptPaidStatus(verified?.status)) {
    const message = `Baixa não confirmada após UPDATE (charge.id=${chargeId ?? '—'}, installment_id=${installmentId}, status=${verified?.status ?? 'null'}).`;
    console.error('[company-asaas-reconcile]', message);
    throw new CompanyAsaasReconciliationError(message, { chargeId, installmentId });
  }

  console.info('[company-asaas-reconcile] finance_receipts baixada', {
    chargeId,
    installmentId,
    paidAmount,
    paidAt,
    status: verified?.status,
  });

  return true;
}

async function reconcilePaidCompanyAsaasChargeRecord(
  admin: SupabaseClient,
  companyId: string,
  charge: CompanyAsaasChargeResponse,
  input: Omit<CompanyAsaasReconcilePaymentInput, 'companyId' | 'asaasPaymentId' | 'installmentId'>,
): Promise<CompanyAsaasReconcilePaymentResult> {
  if (!isCompanyAsaasChargeStatusPaid(charge.status)) {
    return {
      ok: false,
      duplicate: false,
      chargeId: charge.id,
      installmentId: charge.installmentId,
    };
  }

  const installmentId = String(charge.installmentId || '').trim();
  if (!installmentId) {
    throw new Error(`Cobrança ${charge.id} sem installment_id vinculado a finance_receipts.`);
  }

  const dates = resolveCompanyAsaasReconcileDates(
    (input.paymentPayload as CompanyAsaasPaymentWebhookPayment | null) ?? null,
    input.paidAt ?? charge.paidAt,
  );
  const paidAt = input.paidAt || dates.paidAt || charge.paidAt || new Date().toISOString();
  const paymentDate = input.paymentDate ?? dates.paymentDate;
  const creditedDate = input.creditedDate ?? dates.creditedDate;

  const receipt = await loadFinanceReceiptForReconciliation(admin, installmentId);
  if (!receipt) {
    throw new Error(
      `Parcela vinculada não encontrada para baixa automática (installment_id=${installmentId}).`,
    );
  }

  const receiptAlreadyPaid = isReceiptPaidStatus(receipt.status);

  const { data: chargeRow } = await admin
    .from('company_asaas_charges')
    .select('raw_payload, cash_movement_id, status, paid_at, installment_id')
    .eq('id', charge.id)
    .eq('company_id', companyId)
    .maybeSingle();

  const linkedMovementId = chargeRow?.cash_movement_id
    ? String(chargeRow.cash_movement_id)
    : null;

  const existingMovementId =
    linkedMovementId ||
    (await findExistingCompanyAsaasCashMovement(admin, companyId, charge.id, installmentId));

  if (
    isCompanyAsaasReceiptReconciled({
      chargeStatus: charge.status,
      receiptStatus: receipt.status,
    }) &&
    existingMovementId
  ) {
    return {
      ok: true,
      duplicate: true,
      chargeId: charge.id,
      cashMovementId: existingMovementId,
      installmentId,
      receiptUpdated: false,
    };
  }

  if (
    isCompanyAsaasReceiptReconciled({
      chargeStatus: charge.status,
      receiptStatus: receipt.status,
    })
  ) {
    const cashResult = await tryEnsureCompanyAsaasCashMovement(admin, {
      companyId,
      charge,
      receipt,
      paidAt,
      paymentDate,
      creditedDate,
      userId: input.userId ?? null,
    });
    return {
      ok: true,
      duplicate: true,
      chargeId: charge.id,
      cashMovementId: cashResult.cashMovementId ?? undefined,
      installmentId,
      receiptUpdated: false,
      cashMovementError: cashResult.error ?? undefined,
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

  await updateCompanyAsaasCharge(admin, charge.id, companyId, {
    status: 'PAID',
    paidAt,
    rawPayload,
  });

  let receiptUpdated = false;
  if (!receiptAlreadyPaid) {
    receiptUpdated = await markFinanceReceiptPaidFromCompanyAsaasCharge(admin, {
      installmentId,
      paidAmount: Number(charge.value) || Number(receipt.amount) || 0,
      paidAt,
      chargeId: charge.id,
    });
  }

  const receiptAfter = receiptUpdated
    ? await loadFinanceReceiptForReconciliation(admin, installmentId)
    : receipt;

  if (!isReceiptPaidStatus(receiptAfter?.status)) {
    throw new CompanyAsaasReconciliationError(
      `Baixa da parcela não confirmada após reconciliação (charge.id=${charge.id}, installment_id=${installmentId}, status=${receiptAfter?.status ?? 'null'}).`,
      { chargeId: charge.id, installmentId },
    );
  }

  const cashResult = await tryEnsureCompanyAsaasCashMovement(admin, {
    companyId,
    charge,
    receipt: receiptAfter ?? receipt,
    paidAt,
    paymentDate,
    creditedDate,
    userId: input.userId ?? null,
  });

  console.info('[company-asaas-reconcile] parcela baixada automaticamente', {
    companyId,
    chargeId: charge.id,
    installmentId,
    asaasPaymentId: charge.asaasPaymentId,
    cashMovementId: cashResult.cashMovementId,
    cashMovementError: cashResult.error,
    eventType: input.eventType ?? null,
    receiptUpdated,
  });

  return {
    ok: true,
    duplicate: receiptAlreadyPaid && !cashResult.created,
    chargeId: charge.id,
    cashMovementId: cashResult.cashMovementId ?? undefined,
    installmentId,
    receiptUpdated,
    cashMovementError: cashResult.error ?? undefined,
  };
}

export async function ensureCompanyAsaasInstallmentReconciled(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
  options?: Omit<CompanyAsaasReconcilePaymentInput, 'companyId' | 'asaasPaymentId' | 'installmentId'> & {
    asaasPaymentId?: string | null;
  },
): Promise<CompanyAsaasReconcilePaymentResult> {
  const normalizedInstallmentId = String(installmentId || '').trim();
  const charge = await getLatestCompanyAsaasChargeForInstallment(
    admin,
    companyId,
    normalizedInstallmentId,
  );
  if (!charge) {
    return { ok: false, duplicate: false, installmentId: normalizedInstallmentId };
  }
  if (!isCompanyAsaasChargeStatusPaid(charge.status)) {
    return {
      ok: false,
      duplicate: false,
      installmentId: normalizedInstallmentId,
      chargeId: charge.id,
    };
  }

  return reconcilePaidCompanyAsaasChargeRecord(admin, companyId, charge, {
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
  options?: Omit<CompanyAsaasReconcilePaymentInput, 'companyId' | 'asaasPaymentId' | 'installmentId'>,
): Promise<CompanyAsaasReconcilePaymentResult | null> {
  const normalizedInstallmentId = String(installmentId || '').trim();
  const charge = await getLatestCompanyAsaasChargeForInstallment(
    admin,
    companyId,
    normalizedInstallmentId,
  );
  if (!charge || !isCompanyAsaasChargeStatusPaid(charge.status)) return null;

  const receipt = await loadFinanceReceiptForReconciliation(admin, normalizedInstallmentId);

  const { data: chargeRow } = await admin
    .from('company_asaas_charges')
    .select('cash_movement_id')
    .eq('id', charge.id)
    .eq('company_id', companyId)
    .maybeSingle();

  const hasCash =
    Boolean(chargeRow?.cash_movement_id) ||
    Boolean(
      await findExistingCompanyAsaasCashMovement(
        admin,
        companyId,
        charge.id,
        normalizedInstallmentId,
      ),
    );

  if (
    isCompanyAsaasReceiptReconciled({
      chargeStatus: charge.status,
      receiptStatus: receipt?.status,
    }) &&
    hasCash
  ) {
    return null;
  }

  if (
    !isCompanyAsaasReceiptReconciled({
      chargeStatus: charge.status,
      receiptStatus: receipt?.status,
    }) &&
    !needsCompanyAsaasReceiptReconciliation({
      chargeStatus: charge.status,
      receiptStatus: receipt?.status,
    })
  ) {
    return null;
  }

  return ensureCompanyAsaasInstallmentReconciled(admin, companyId, normalizedInstallmentId, options);
}

/** Baixa obrigatória quando charge PAID e parcela pendente; falha se não confirmar status pago. */
export async function forceCompanyAsaasPaidInstallmentReconciliation(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
  options?: Omit<CompanyAsaasReconcilePaymentInput, 'companyId' | 'asaasPaymentId' | 'installmentId'>,
): Promise<CompanyAsaasReconcilePaymentResult> {
  const normalizedInstallmentId = String(installmentId || '').trim();
  const charge = await getLatestCompanyAsaasChargeForInstallment(
    admin,
    companyId,
    normalizedInstallmentId,
  );

  if (!charge) {
    throw new CompanyAsaasReconciliationError(
      `Cobrança Asaas Company não encontrada para installment_id=${normalizedInstallmentId}.`,
      { installmentId: normalizedInstallmentId },
    );
  }

  if (!isCompanyAsaasChargeStatusPaid(charge.status)) {
    return {
      ok: false,
      duplicate: false,
      chargeId: charge.id,
      installmentId: normalizedInstallmentId,
    };
  }

  const receiptBefore = await loadFinanceReceiptForReconciliation(admin, normalizedInstallmentId);
  const needsReceipt = needsCompanyAsaasReceiptReconciliation({
    chargeStatus: charge.status,
    receiptStatus: receiptBefore?.status,
  });

  console.info('[company-asaas-reconcile] force reconcile', {
    chargeId: charge.id,
    installmentId: normalizedInstallmentId,
    chargeStatus: charge.status,
    receiptStatusBefore: receiptBefore?.status ?? null,
    chargeCompanyId: charge.companyId,
    receiptCompanyId: receiptBefore?.company_id ?? receiptBefore?.tenant_id ?? null,
    installmentMatch: receiptBefore?.id === normalizedInstallmentId,
    needsReceipt,
  });

  const result = await ensureCompanyAsaasInstallmentReconciled(
    admin,
    companyId,
    normalizedInstallmentId,
    options,
  );

  if (!result.ok) {
    throw new CompanyAsaasReconciliationError(
      `Conciliação falhou (charge.id=${charge.id}, installment_id=${normalizedInstallmentId}).`,
      { chargeId: charge.id, installmentId: normalizedInstallmentId },
    );
  }

  const receiptAfter = await loadFinanceReceiptForReconciliation(admin, normalizedInstallmentId);
  if (needsReceipt && !isReceiptPaidStatus(receiptAfter?.status)) {
    throw new CompanyAsaasReconciliationError(
      `Baixa não confirmada: finance_receipts permanece ${receiptAfter?.status ?? 'ausente'} (charge.id=${charge.id}, installment_id=${normalizedInstallmentId}).`,
      { chargeId: charge.id, installmentId: normalizedInstallmentId },
    );
  }

  return {
    ...result,
    receiptUpdated: result.receiptUpdated || (needsReceipt && isReceiptPaidStatus(receiptAfter?.status)),
  };
}

export async function executeCompanyAsaasPaymentReconciliation(
  admin: SupabaseClient,
  input: CompanyAsaasReconcilePaymentInput,
): Promise<CompanyAsaasReconcilePaymentResult> {
  const asaasPaymentId = String(input.asaasPaymentId || '').trim();
  const installmentId = String(input.installmentId || '').trim();

  let charge: CompanyAsaasChargeResponse | null = null;
  if (asaasPaymentId) {
    charge = await getCompanyAsaasChargeByPaymentId(admin, input.companyId, asaasPaymentId);
  }

  if (!charge && installmentId) {
    charge = await getLatestCompanyAsaasChargeForInstallment(
      admin,
      input.companyId,
      installmentId,
    );
  }

  if (!charge && asaasPaymentId) {
    const paymentPayload = input.paymentPayload as CompanyAsaasPaymentWebhookPayment | null;
    const externalReference = String(paymentPayload?.externalReference || '').trim();
    if (externalReference) {
      charge = await getLatestCompanyAsaasChargeForInstallment(
        admin,
        input.companyId,
        externalReference,
      );
    }
  }

  if (!charge) {
    console.error('[company-asaas-reconcile] cobrança não encontrada', {
      companyId: input.companyId,
      asaasPaymentId,
      installmentId,
    });
    return { ok: false, duplicate: false, installmentId: installmentId || undefined };
  }

  return reconcilePaidCompanyAsaasChargeRecord(admin, input.companyId, charge, {
    eventType: input.eventType ?? null,
    paidAt: input.paidAt,
    paymentDate: input.paymentDate,
    creditedDate: input.creditedDate,
    paymentPayload: input.paymentPayload,
    userId: input.userId,
  });
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
    const installmentId = String(row.installment_id || '').trim();
    if (!installmentId) continue;

    const receipt = await loadFinanceReceiptForReconciliation(admin, installmentId);
    const receiptReconciled = isCompanyAsaasReceiptReconciled({
      chargeStatus: row.status,
      receiptStatus: receipt?.status,
    });
    const hasCash =
      Boolean(row.cash_movement_id) ||
      Boolean(
        await findExistingCompanyAsaasCashMovement(admin, companyId, String(row.id), installmentId),
      );
    if (receiptReconciled && hasCash) continue;

    const result = await ensureCompanyAsaasInstallmentReconciled(admin, companyId, installmentId, {
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
      installmentId: payment?.externalReference ?? null,
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

/** @deprecated use loadFinanceReceiptForReconciliation */
async function loadFinanceReceipt(
  admin: SupabaseClient,
  installmentId: string,
): Promise<FinanceReceiptRow | null> {
  return loadFinanceReceiptForReconciliation(admin, installmentId);
}

export { loadFinanceReceipt };
