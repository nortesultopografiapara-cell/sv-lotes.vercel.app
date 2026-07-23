/**
 * Serviços de cobrança Asaas — Financeiro Corporativo MASTER (Fase 7.2).
 * Criar cobrança NÃO liquida AR nem gera movimento de caixa.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getReceivable } from '../receivablesService';
import { logCorporateFinanceAudit } from '../service';
import {
  buildCorporateAsaasExternalReference,
  MASTER_CORPORATE_ASAAS_DOMAIN,
  resolveCorporateAsaasEnvironment,
} from './domain';
import {
  corporateAsaasCancelPayment,
  corporateAsaasCreateCustomer,
  corporateAsaasCreatePayment,
  corporateAsaasFetchPixQrCode,
  corporateAsaasFindCustomerIdByCpfCnpj,
  corporateAsaasGetPayment,
  mapAsaasRemoteStatusToLocal,
  normalizeCorporatePixQrImage,
} from './client';
import { mapCorporateAsaasChargeRow, mapCorporateAsaasCustomerRow } from './mappers';
import type {
  CorporateAsaasCreateChargeInput,
  MasterCorporateAsaasCharge,
  MasterCorporateAsaasCustomer,
} from './types';
import { isCorporateAsaasActiveStatus, isCorporateAsaasPaidStatus } from './types';
import {
  normalizeCpfCnpj,
  sanitizeCorporateAsaasErrorMessage,
  validateCorporateAsaasCreateChargeInput,
} from './validation';
import { settleCorporateAsaasChargeFromRemote } from './webhookSettlement';

function nowIso() {
  return new Date().toISOString();
}

async function findLocalCustomer(
  supabase: SupabaseClient,
  cpfCnpj: string,
  environment: string,
): Promise<MasterCorporateAsaasCustomer | null> {
  const { data, error } = await supabase
    .from('master_corporate_asaas_customers')
    .select('*')
    .eq('cpf_cnpj', cpfCnpj)
    .eq('environment', environment)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapCorporateAsaasCustomerRow(data as Record<string, unknown>) : null;
}

async function upsertLocalCustomer(
  supabase: SupabaseClient,
  params: {
    customer_name: string;
    cpf_cnpj: string;
    email: string | null;
    phone: string | null;
    mobile_phone: string | null;
    asaas_customer_id: string;
    environment: 'sandbox' | 'production';
  },
): Promise<MasterCorporateAsaasCustomer> {
  const existing = await findLocalCustomer(supabase, params.cpf_cnpj, params.environment);
  if (existing) {
    const { data, error } = await supabase
      .from('master_corporate_asaas_customers')
      .update({
        customer_name: params.customer_name,
        email: params.email,
        phone: params.phone,
        mobile_phone: params.mobile_phone,
        asaas_customer_id: params.asaas_customer_id,
        updated_at: nowIso(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return mapCorporateAsaasCustomerRow(data as Record<string, unknown>);
  }
  const { data, error } = await supabase
    .from('master_corporate_asaas_customers')
    .insert({
      ...params,
      created_at: nowIso(),
      updated_at: nowIso(),
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapCorporateAsaasCustomerRow(data as Record<string, unknown>);
}

export async function getActiveCorporateAsaasCharge(
  supabase: SupabaseClient,
  receivableId: string,
): Promise<MasterCorporateAsaasCharge | null> {
  const { data, error } = await supabase
    .from('master_corporate_asaas_charges')
    .select('*')
    .eq('receivable_id', receivableId)
    .eq('is_archived', false)
    .in('local_status', ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE', 'ERROR'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapCorporateAsaasChargeRow(data as Record<string, unknown>) : null;
}

export async function getCorporateAsaasChargeById(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterCorporateAsaasCharge | null> {
  const { data, error } = await supabase
    .from('master_corporate_asaas_charges')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapCorporateAsaasChargeRow(data as Record<string, unknown>) : null;
}

export async function listCorporateAsaasCharges(
  supabase: SupabaseClient,
  filters: {
    q?: string;
    status?: string;
    billingType?: string;
    receivableId?: string;
    projectId?: string;
    fromDate?: string;
    toDate?: string;
    includeArchived?: boolean;
    page?: number;
    limit?: number;
  } = {},
): Promise<{ charges: MasterCorporateAsaasCharge[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from('master_corporate_asaas_charges')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (!filters.includeArchived) q = q.eq('is_archived', false);
  if (filters.status) q = q.eq('local_status', filters.status);
  if (filters.billingType) q = q.eq('billing_type', filters.billingType);
  if (filters.receivableId) q = q.eq('receivable_id', filters.receivableId);
  if (filters.projectId) q = q.eq('project_id', filters.projectId);
  if (filters.fromDate) q = q.gte('due_date', filters.fromDate);
  if (filters.toDate) q = q.lte('due_date', filters.toDate);
  if (filters.q) {
    const pat = `%${filters.q.replace(/%/g, '').trim()}%`;
    q = q.or(
      `description.ilike.${pat},asaas_payment_id.ilike.${pat},external_reference.ilike.${pat}`,
    );
  }

  const { data, error, count } = await q.range(from, to);
  if (error) throw new Error(error.message);
  return {
    charges: (data || []).map((r) => mapCorporateAsaasChargeRow(r as Record<string, unknown>)),
    total: count ?? 0,
    page,
    limit,
  };
}

async function updateReceivableAsaasMirror(
  supabase: SupabaseClient,
  receivableId: string,
  patch: {
    asaas_integration_status: string | null;
    asaas_active_charge_id: string | null;
    asaas_last_sync_at?: string | null;
    asaas_last_error?: string | null;
  },
) {
  const { error } = await supabase
    .from('master_corporate_receivables')
    .update({
      ...patch,
      updated_at: nowIso(),
    })
    .eq('id', receivableId);
  if (error) throw new Error(error.message);
}

export async function createCorporateAsaasCharge(
  supabase: SupabaseClient,
  raw: Record<string, unknown>,
  userId: string | null,
): Promise<MasterCorporateAsaasCharge> {
  const receivableId = String(raw.receivable_id || '').trim();
  const receivable = await getReceivable(supabase, receivableId);
  if (!receivable) throw new Error('Conta a receber não encontrada.');
  if (receivable.is_archived) throw new Error('Conta a receber arquivada.');
  if (receivable.canceled_at) throw new Error('Conta a receber cancelada.');
  if (receivable.remaining_amount <= 0) {
    throw new Error('Conta a receber sem saldo pendente.');
  }

  const active = await getActiveCorporateAsaasCharge(supabase, receivable.id);
  if (active) {
    throw new Error(
      `Já existe cobrança Asaas ativa (${active.local_status}) para este título. Cancele ou aguarde antes de gerar outra.`,
    );
  }

  const input: CorporateAsaasCreateChargeInput = validateCorporateAsaasCreateChargeInput(raw, {
    remainingAmount: receivable.remaining_amount,
    receivableDueDate: receivable.due_date,
  });

  const customerName = (input.customer_name || receivable.customer_name || '').trim();
  const docRaw = input.cpf_cnpj || receivable.customer_document;
  if (!docRaw) {
    throw new Error('CPF/CNPJ do cliente é obrigatório para gerar cobrança Asaas.');
  }
  const cpfCnpj = normalizeCpfCnpj(docRaw);
  if (!customerName) throw new Error('Nome do cliente é obrigatório.');

  const email = input.email !== undefined ? input.email : receivable.customer_email;
  const phone = input.phone !== undefined ? input.phone : receivable.customer_phone;
  const mobile = input.mobile_phone !== undefined ? input.mobile_phone : receivable.customer_phone;

  const environment = resolveCorporateAsaasEnvironment();
  const value = input.value!;
  const dueDate = input.due_date!;
  const description =
    input.description ||
    `${receivable.code} — ${receivable.description}`.slice(0, 480);

  const idempotencyKey = `CORP_ASAAS:${receivable.id}:${input.billing_type}:${value.toFixed(2)}:${dueDate}`;
  const { data: byKey } = await supabase
    .from('master_corporate_asaas_charges')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (byKey) {
    return mapCorporateAsaasChargeRow(byKey as Record<string, unknown>);
  }

  // Cliente Asaas
  let asaasCustomerId =
    (await findLocalCustomer(supabase, cpfCnpj, environment))?.asaas_customer_id || null;
  if (!asaasCustomerId) {
    asaasCustomerId = await corporateAsaasFindCustomerIdByCpfCnpj(cpfCnpj);
  }
  if (!asaasCustomerId) {
    asaasCustomerId = await corporateAsaasCreateCustomer({
      name: customerName,
      cpfCnpj,
      email,
      phone,
      mobilePhone: mobile,
      externalReference: `MCF_CUSTOMER:${cpfCnpj}`,
    });
  }
  const localCustomer = await upsertLocalCustomer(supabase, {
    customer_name: customerName,
    cpf_cnpj: cpfCnpj,
    email: email || null,
    phone: phone || null,
    mobile_phone: mobile || null,
    asaas_customer_id: asaasCustomerId,
    environment,
  });

  const chargeId = crypto.randomUUID();
  const externalReference = buildCorporateAsaasExternalReference(receivable.id, chargeId);

  let remote;
  try {
    remote = await corporateAsaasCreatePayment({
      customer: asaasCustomerId,
      billingType: input.billing_type,
      value,
      dueDate,
      description,
      externalReference,
      metadata: {
        domain: MASTER_CORPORATE_ASAAS_DOMAIN,
        receivable_id: receivable.id,
        charge_id: chargeId,
        project_id: receivable.project_id || '',
        quote_id: receivable.quote_id || '',
        code: receivable.code,
      },
    });
  } catch (err) {
    const msg = sanitizeCorporateAsaasErrorMessage(err);
    await updateReceivableAsaasMirror(supabase, receivable.id, {
      asaas_integration_status: 'ERROR',
      asaas_active_charge_id: null,
      asaas_last_sync_at: nowIso(),
      asaas_last_error: msg,
    });
    throw new Error(msg);
  }

  const paymentId = String(remote.id || '').trim();
  if (!paymentId) throw new Error('Asaas não retornou id da cobrança.');

  let pix_payload: string | null = null;
  let pix_qr_code: string | null = null;
  let pix_expiration_at: string | null = null;
  if (input.billing_type === 'PIX') {
    try {
      const pix = await corporateAsaasFetchPixQrCode(paymentId);
      pix_payload = String(pix.payload || '').trim() || null;
      pix_qr_code = normalizeCorporatePixQrImage(pix.encodedImage);
      pix_expiration_at = pix.expirationDate ? String(pix.expirationDate) : null;
    } catch {
      /* QR pode demorar — sync posterior */
    }
  }

  const localStatus = mapAsaasRemoteStatusToLocal(remote.status);
  const row = {
    id: chargeId,
    receivable_id: receivable.id,
    project_id: receivable.project_id,
    quote_id: receivable.quote_id,
    financial_account_id: input.financial_account_id,
    corporate_customer_id: localCustomer.id,
    asaas_customer_id: asaasCustomerId,
    asaas_payment_id: paymentId,
    billing_type: input.billing_type,
    local_status: localStatus === 'PENDING' ? 'AWAITING_PAYMENT' : localStatus,
    asaas_status: remote.status || null,
    original_value: value,
    net_value: remote.netValue != null ? Number(remote.netValue) : null,
    due_date: dueDate,
    description,
    domain: MASTER_CORPORATE_ASAAS_DOMAIN,
    external_reference: externalReference,
    idempotency_key: idempotencyKey,
    environment,
    invoice_url: remote.invoiceUrl || null,
    bank_slip_url: remote.bankSlipUrl || null,
    transaction_receipt_url: remote.transactionReceiptUrl || null,
    identification_field: remote.identificationField || remote.nossoNumero || null,
    pix_payload,
    pix_qr_code,
    pix_expiration_at,
    last_sync_at: nowIso(),
    last_error: null,
    created_by: userId,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const { data: inserted, error } = await supabase
    .from('master_corporate_asaas_charges')
    .insert(row)
    .select('*')
    .single();
  if (error) {
    // Concorrência / idempotência
    if (error.code === '23505') {
      const again = await getActiveCorporateAsaasCharge(supabase, receivable.id);
      if (again) return again;
      const byIdem = await supabase
        .from('master_corporate_asaas_charges')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (byIdem.data) {
        return mapCorporateAsaasChargeRow(byIdem.data as Record<string, unknown>);
      }
    }
    throw new Error(error.message);
  }

  const charge = mapCorporateAsaasChargeRow(inserted as Record<string, unknown>);
  await updateReceivableAsaasMirror(supabase, receivable.id, {
    asaas_integration_status: charge.local_status,
    asaas_active_charge_id: charge.id,
    asaas_last_sync_at: nowIso(),
    asaas_last_error: null,
  });

  await logCorporateFinanceAudit(supabase, {
    userId,
    action: 'CORPORATE_ASAAS_CHARGE_CREATED',
    entityId: charge.id,
    description: `Cobrança Asaas ${charge.billing_type} ${charge.asaas_payment_id} para ${receivable.code}`,
    newData: {
      billing_type: charge.billing_type,
      value: charge.original_value,
      receivable_id: receivable.id,
      asaas_payment_id: charge.asaas_payment_id,
      // sem QR/payload
    },
  });

  return charge;
}

export async function syncCorporateAsaasCharge(
  supabase: SupabaseClient,
  chargeId: string,
  userId: string | null,
): Promise<MasterCorporateAsaasCharge> {
  const charge = await getCorporateAsaasChargeById(supabase, chargeId);
  if (!charge) throw new Error('Cobrança não encontrada.');

  const remote = await corporateAsaasGetPayment(charge.asaas_payment_id);
  let next = mapAsaasRemoteStatusToLocal(remote.status);

  if (isCorporateAsaasPaidStatus(charge.local_status) && !isCorporateAsaasPaidStatus(next)) {
    if (next !== 'REFUNDED') {
      next = charge.local_status;
    }
  }

  let pix_payload = charge.pix_payload;
  let pix_qr_code = charge.pix_qr_code;
  if (charge.billing_type === 'PIX' && !pix_payload) {
    try {
      const pix = await corporateAsaasFetchPixQrCode(charge.asaas_payment_id);
      pix_payload = String(pix.payload || '').trim() || null;
      pix_qr_code = normalizeCorporatePixQrImage(pix.encodedImage);
    } catch {
      /* ignore */
    }
  }

  const { data, error } = await supabase
    .from('master_corporate_asaas_charges')
    .update({
      local_status: next,
      asaas_status: remote.status || null,
      net_value: remote.netValue != null ? Number(remote.netValue) : charge.net_value,
      invoice_url: remote.invoiceUrl || charge.invoice_url,
      bank_slip_url: remote.bankSlipUrl || charge.bank_slip_url,
      transaction_receipt_url:
        remote.transactionReceiptUrl || charge.transaction_receipt_url,
      identification_field:
        remote.identificationField || remote.nossoNumero || charge.identification_field,
      pix_payload,
      pix_qr_code,
      paid_at:
        isCorporateAsaasPaidStatus(next) && !charge.paid_at
          ? remote.paymentDate || remote.clientPaymentDate || nowIso()
          : charge.paid_at,
      confirmed_at:
        next === 'CONFIRMED' && !charge.confirmed_at
          ? remote.confirmedDate || nowIso()
          : charge.confirmed_at,
      last_sync_at: nowIso(),
      last_error: null,
      updated_at: nowIso(),
    })
    .eq('id', charge.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  let updated = mapCorporateAsaasChargeRow(data as Record<string, unknown>);

  // Sync pago sem webhook: materializa recebimento/caixa de forma idempotente
  if (isCorporateAsaasPaidStatus(updated.local_status) && !updated.receivable_payment_id) {
    const settled = await settleCorporateAsaasChargeFromRemote(
      supabase,
      updated,
      remote,
      updated.local_status,
    );
    updated = settled.charge;
  }

  await updateReceivableAsaasMirror(supabase, charge.receivable_id, {
    asaas_integration_status: updated.local_status,
    asaas_active_charge_id: isCorporateAsaasActiveStatus(updated.local_status)
      ? updated.id
      : isCorporateAsaasPaidStatus(updated.local_status)
        ? updated.id
        : null,
    asaas_last_sync_at: nowIso(),
    asaas_last_error: null,
  });

  await logCorporateFinanceAudit(supabase, {
    userId,
    action: 'CORPORATE_ASAAS_CHARGE_SYNCED',
    entityId: charge.id,
    description: `Sync Asaas ${charge.asaas_payment_id} → ${updated.local_status}`,
    newData: {
      local_status: updated.local_status,
      asaas_status: updated.asaas_status,
      receivable_payment_id: updated.receivable_payment_id,
    },
  });

  return updated;
}

export async function cancelCorporateAsaasCharge(
  supabase: SupabaseClient,
  chargeId: string,
  userId: string | null,
): Promise<MasterCorporateAsaasCharge> {
  const charge = await getCorporateAsaasChargeById(supabase, chargeId);
  if (!charge) throw new Error('Cobrança não encontrada.');
  if (isCorporateAsaasPaidStatus(charge.local_status)) {
    throw new Error('Cobrança já paga não pode ser cancelada.');
  }
  if (charge.local_status === 'CANCELLED') return charge;

  const remote = await corporateAsaasCancelPayment(charge.asaas_payment_id);
  if (!remote.ok && remote.httpStatus !== 404) {
    throw new Error(remote.message);
  }

  const { data, error } = await supabase
    .from('master_corporate_asaas_charges')
    .update({
      local_status: 'CANCELLED',
      asaas_status: 'DELETED',
      canceled_at: nowIso(),
      last_sync_at: nowIso(),
      last_error: null,
      updated_at: nowIso(),
    })
    .eq('id', charge.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  const updated = mapCorporateAsaasChargeRow(data as Record<string, unknown>);
  await updateReceivableAsaasMirror(supabase, charge.receivable_id, {
    asaas_integration_status: 'CANCELLED',
    asaas_active_charge_id: null,
    asaas_last_sync_at: nowIso(),
    asaas_last_error: null,
  });

  await logCorporateFinanceAudit(supabase, {
    userId,
    action: 'CORPORATE_ASAAS_CHARGE_CANCELLED',
    entityId: charge.id,
    description: `Cancelamento Asaas ${charge.asaas_payment_id} (AR permanece intacta)`,
  });

  return updated;
}

export async function refreshCorporateAsaasPix(
  supabase: SupabaseClient,
  chargeId: string,
  userId: string | null,
): Promise<MasterCorporateAsaasCharge> {
  const charge = await getCorporateAsaasChargeById(supabase, chargeId);
  if (!charge) throw new Error('Cobrança não encontrada.');
  if (charge.billing_type !== 'PIX') throw new Error('Cobrança não é PIX.');

  const pix = await corporateAsaasFetchPixQrCode(charge.asaas_payment_id);
  const { data, error } = await supabase
    .from('master_corporate_asaas_charges')
    .update({
      pix_payload: String(pix.payload || '').trim() || null,
      pix_qr_code: normalizeCorporatePixQrImage(pix.encodedImage),
      pix_expiration_at: pix.expirationDate ? String(pix.expirationDate) : null,
      last_sync_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('id', charge.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  await logCorporateFinanceAudit(supabase, {
    userId,
    action: 'CORPORATE_ASAAS_PIX_REFRESHED',
    entityId: charge.id,
    description: `PIX atualizado ${charge.asaas_payment_id}`,
  });

  return mapCorporateAsaasChargeRow(data as Record<string, unknown>);
}
