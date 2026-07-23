/** Mapeamento de linhas — Asaas Corporativo MASTER. */

import type {
  MasterCorporateAsaasCharge,
  MasterCorporateAsaasCustomer,
  MasterCorporateAsaasWebhookEvent,
} from './types';

export function mapCorporateAsaasCustomerRow(
  row: Record<string, unknown>,
): MasterCorporateAsaasCustomer {
  return {
    id: String(row.id),
    customer_name: String(row.customer_name),
    cpf_cnpj: String(row.cpf_cnpj),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    mobile_phone: row.mobile_phone ? String(row.mobile_phone) : null,
    postal_code: row.postal_code ? String(row.postal_code) : null,
    address: row.address ? String(row.address) : null,
    address_number: row.address_number ? String(row.address_number) : null,
    complement: row.complement ? String(row.complement) : null,
    province: row.province ? String(row.province) : null,
    city: row.city ? String(row.city) : null,
    state: row.state ? String(row.state) : null,
    asaas_customer_id: String(row.asaas_customer_id),
    environment: row.environment === 'production' ? 'production' : 'sandbox',
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapCorporateAsaasChargeRow(
  row: Record<string, unknown>,
): MasterCorporateAsaasCharge {
  return {
    id: String(row.id),
    receivable_id: String(row.receivable_id),
    project_id: row.project_id ? String(row.project_id) : null,
    quote_id: row.quote_id ? String(row.quote_id) : null,
    financial_account_id: String(row.financial_account_id),
    corporate_customer_id: row.corporate_customer_id
      ? String(row.corporate_customer_id)
      : null,
    asaas_customer_id: String(row.asaas_customer_id),
    asaas_payment_id: String(row.asaas_payment_id),
    billing_type: row.billing_type as MasterCorporateAsaasCharge['billing_type'],
    local_status: row.local_status as MasterCorporateAsaasCharge['local_status'],
    asaas_status: row.asaas_status ? String(row.asaas_status) : null,
    original_value: Number(row.original_value),
    net_value: row.net_value != null ? Number(row.net_value) : null,
    due_date: String(row.due_date).slice(0, 10),
    description: String(row.description),
    domain: 'MASTER_CORPORATE_FINANCE',
    external_reference: String(row.external_reference),
    idempotency_key: String(row.idempotency_key),
    environment: row.environment === 'production' ? 'production' : 'sandbox',
    invoice_url: row.invoice_url ? String(row.invoice_url) : null,
    bank_slip_url: row.bank_slip_url ? String(row.bank_slip_url) : null,
    transaction_receipt_url: row.transaction_receipt_url
      ? String(row.transaction_receipt_url)
      : null,
    identification_field: row.identification_field
      ? String(row.identification_field)
      : null,
    pix_payload: row.pix_payload ? String(row.pix_payload) : null,
    pix_qr_code: row.pix_qr_code ? String(row.pix_qr_code) : null,
    pix_expiration_at: row.pix_expiration_at ? String(row.pix_expiration_at) : null,
    paid_at: row.paid_at ? String(row.paid_at) : null,
    confirmed_at: row.confirmed_at ? String(row.confirmed_at) : null,
    canceled_at: row.canceled_at ? String(row.canceled_at) : null,
    refunded_at: row.refunded_at ? String(row.refunded_at) : null,
    last_sync_at: row.last_sync_at ? String(row.last_sync_at) : null,
    last_error: row.last_error ? String(row.last_error) : null,
    receivable_payment_id: row.receivable_payment_id
      ? String(row.receivable_payment_id)
      : null,
    cash_movement_id: row.cash_movement_id ? String(row.cash_movement_id) : null,
    is_archived: Boolean(row.is_archived),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapCorporateAsaasWebhookEventRow(
  row: Record<string, unknown>,
): MasterCorporateAsaasWebhookEvent {
  return {
    id: String(row.id),
    event_id: String(row.event_id),
    event_type: String(row.event_type),
    asaas_payment_id: row.asaas_payment_id ? String(row.asaas_payment_id) : null,
    charge_id: row.charge_id ? String(row.charge_id) : null,
    receivable_id: row.receivable_id ? String(row.receivable_id) : null,
    external_reference: row.external_reference ? String(row.external_reference) : null,
    domain: 'MASTER_CORPORATE_FINANCE',
    processing_status:
      row.processing_status as MasterCorporateAsaasWebhookEvent['processing_status'],
    attempts: Number(row.attempts || 0),
    payload_sanitized:
      row.payload_sanitized && typeof row.payload_sanitized === 'object'
        ? (row.payload_sanitized as Record<string, unknown>)
        : {},
    error_message: row.error_message ? String(row.error_message) : null,
    processed_at: row.processed_at ? String(row.processed_at) : null,
    created_at: String(row.created_at),
  };
}
