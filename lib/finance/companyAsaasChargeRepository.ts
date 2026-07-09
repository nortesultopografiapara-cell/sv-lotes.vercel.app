import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CompanyAsaasChargeRow,
  type CompanyAsaasBillingType,
  type CompanyAsaasChargeStatus,
  mapCompanyAsaasChargeRow,
  type CompanyAsaasChargeResponse,
} from './companyAsaasChargeTypes';

export async function insertCompanyAsaasCharge(
  admin: SupabaseClient,
  row: {
    companyId: string;
    customerId: string | null;
    saleId: string | null;
    installmentId: string;
    asaasPaymentId: string;
    billingType: CompanyAsaasBillingType;
    status: CompanyAsaasChargeStatus;
    value: number;
    dueDate: string;
    invoiceUrl?: string | null;
    bankSlipUrl?: string | null;
    bankSlipIdentification?: string | null;
    pixQrCode?: string | null;
    pixCopyPaste?: string | null;
    financialAccountId?: string | null;
    rawPayload?: Record<string, unknown>;
  },
): Promise<CompanyAsaasChargeResponse> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('company_asaas_charges')
    .insert({
      company_id: row.companyId,
      customer_id: row.customerId,
      sale_id: row.saleId,
      installment_id: row.installmentId,
      asaas_payment_id: row.asaasPaymentId,
      billing_type: row.billingType,
      status: row.status,
      value: row.value,
      due_date: row.dueDate,
      invoice_url: row.invoiceUrl ?? null,
      bank_slip_url: row.bankSlipUrl ?? null,
      bank_slip_identification: row.bankSlipIdentification ?? null,
      pix_qr_code: row.pixQrCode ?? null,
      pix_copy_paste: row.pixCopyPaste ?? null,
      financial_account_id: row.financialAccountId ?? null,
      raw_payload: row.rawPayload ?? {},
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return mapCompanyAsaasChargeRow(data as CompanyAsaasChargeRow);
}

export async function updateCompanyAsaasCharge(
  admin: SupabaseClient,
  chargeId: string,
  companyId: string,
  patch: Partial<{
    status: CompanyAsaasChargeStatus;
    invoiceUrl: string | null;
    bankSlipUrl: string | null;
    bankSlipIdentification: string | null;
    pixQrCode: string | null;
    pixCopyPaste: string | null;
    financialAccountId: string | null;
    rawPayload: Record<string, unknown>;
    paidAt: string | null;
    cashMovementId: string | null;
  }>,
): Promise<CompanyAsaasChargeResponse> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.invoiceUrl !== undefined) payload.invoice_url = patch.invoiceUrl;
  if (patch.bankSlipUrl !== undefined) payload.bank_slip_url = patch.bankSlipUrl;
  if (patch.bankSlipIdentification !== undefined) {
    payload.bank_slip_identification = patch.bankSlipIdentification;
  }
  if (patch.pixQrCode !== undefined) payload.pix_qr_code = patch.pixQrCode;
  if (patch.pixCopyPaste !== undefined) payload.pix_copy_paste = patch.pixCopyPaste;
  if (patch.financialAccountId !== undefined) payload.financial_account_id = patch.financialAccountId;
  if (patch.rawPayload !== undefined) payload.raw_payload = patch.rawPayload;
  if (patch.paidAt !== undefined) payload.paid_at = patch.paidAt;
  if (patch.cashMovementId !== undefined) payload.cash_movement_id = patch.cashMovementId;

  const { data, error } = await admin
    .from('company_asaas_charges')
    .update(payload)
    .eq('id', chargeId)
    .eq('company_id', companyId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return mapCompanyAsaasChargeRow(data as CompanyAsaasChargeRow);
}

export async function getCompanyAsaasChargeByPaymentId(
  admin: SupabaseClient,
  companyId: string,
  asaasPaymentId: string,
): Promise<CompanyAsaasChargeResponse | null> {
  const { data, error } = await admin
    .from('company_asaas_charges')
    .select('*')
    .eq('company_id', companyId)
    .eq('asaas_payment_id', asaasPaymentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapCompanyAsaasChargeRow(data as CompanyAsaasChargeRow) : null;
}

export async function getLatestCompanyAsaasChargeForInstallment(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
): Promise<CompanyAsaasChargeResponse | null> {
  const { data, error } = await admin
    .from('company_asaas_charges')
    .select('*')
    .eq('company_id', companyId)
    .eq('installment_id', installmentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapCompanyAsaasChargeRow(data as CompanyAsaasChargeRow) : null;
}

export async function listCompanyAsaasChargesForInstallments(
  admin: SupabaseClient,
  companyId: string,
  installmentIds: string[],
): Promise<CompanyAsaasChargeResponse[]> {
  if (installmentIds.length === 0) return [];
  const { data, error } = await admin
    .from('company_asaas_charges')
    .select('*')
    .eq('company_id', companyId)
    .in('installment_id', installmentIds)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (data as CompanyAsaasChargeRow[]) ?? [];
  const latestByInstallment = new Map<string, CompanyAsaasChargeResponse>();
  for (const row of rows) {
    if (!latestByInstallment.has(row.installment_id)) {
      latestByInstallment.set(row.installment_id, mapCompanyAsaasChargeRow(row));
    }
  }
  return [...latestByInstallment.values()];
}

export async function listPendingCompanyAsaasCharges(
  admin: SupabaseClient,
  companyId: string,
): Promise<CompanyAsaasChargeResponse[]> {
  const { data, error } = await admin
    .from('company_asaas_charges')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['PENDING', 'REGISTERED', 'OVERDUE'])
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data as CompanyAsaasChargeRow[]) ?? []).map(mapCompanyAsaasChargeRow);
}

export async function registerCompanyAsaasWebhookEvent(
  admin: SupabaseClient,
  input: {
    companyId: string;
    eventId: string;
    eventType: string;
    asaasPaymentId?: string | null;
    installmentId?: string | null;
    chargeId?: string | null;
    rawPayload: Record<string, unknown>;
  },
): Promise<{ duplicate: boolean; id: string; processingStatus: string }> {
  const { data: existing } = await admin
    .from('company_asaas_webhook_events')
    .select('id, processing_status')
    .eq('company_id', input.companyId)
    .eq('event_id', input.eventId)
    .maybeSingle();

  if (existing?.id) {
    return {
      duplicate: true,
      id: existing.id as string,
      processingStatus: String(existing.processing_status),
    };
  }

  const { data, error } = await admin
    .from('company_asaas_webhook_events')
    .insert({
      company_id: input.companyId,
      event_id: input.eventId,
      event_type: input.eventType,
      asaas_payment_id: input.asaasPaymentId ?? null,
      installment_id: input.installmentId ?? null,
      charge_id: input.chargeId ?? null,
      raw_payload: input.rawPayload,
      processing_status: 'PENDING',
    })
    .select('id, processing_status')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { duplicate: true, id: '', processingStatus: 'DUPLICATE' };
    }
    throw new Error(error.message);
  }

  return {
    duplicate: false,
    id: data.id as string,
    processingStatus: String(data.processing_status),
  };
}

export async function markCompanyAsaasWebhookEventProcessed(
  admin: SupabaseClient,
  eventRowId: string,
  companyId: string,
  status: 'PROCESSED' | 'IGNORED' | 'FAILED' | 'DUPLICATE',
  errorMessage?: string | null,
): Promise<void> {
  const { error } = await admin
    .from('company_asaas_webhook_events')
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage ?? null,
    })
    .eq('id', eventRowId)
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
}
