/** Tipos — Asaas Corporativo MASTER (Fase 7.1). */

export const CORPORATE_ASAAS_BILLING_TYPES = ['PIX', 'BOLETO'] as const;
export type CorporateAsaasBillingType = (typeof CORPORATE_ASAAS_BILLING_TYPES)[number];

export const CORPORATE_ASAAS_LOCAL_STATUSES = [
  'PENDING',
  'AWAITING_PAYMENT',
  'RECEIVED',
  'CONFIRMED',
  'OVERDUE',
  'CANCELLED',
  'REFUNDED',
  'ERROR',
] as const;
export type CorporateAsaasLocalStatus = (typeof CORPORATE_ASAAS_LOCAL_STATUSES)[number];

export const CORPORATE_ASAAS_ACTIVE_STATUSES: readonly CorporateAsaasLocalStatus[] = [
  'PENDING',
  'AWAITING_PAYMENT',
  'OVERDUE',
  'ERROR',
];

export const CORPORATE_ASAAS_PAID_STATUSES: readonly CorporateAsaasLocalStatus[] = [
  'RECEIVED',
  'CONFIRMED',
];

export const CORPORATE_ASAAS_WEBHOOK_PROCESSING_STATUSES = [
  'PENDING',
  'PROCESSED',
  'IGNORED',
  'FAILED',
  'DUPLICATE',
  'REJECTED',
] as const;
export type CorporateAsaasWebhookProcessingStatus =
  (typeof CORPORATE_ASAAS_WEBHOOK_PROCESSING_STATUSES)[number];

export type CorporateAsaasEnvironment = 'sandbox' | 'production';

export type MasterCorporateAsaasCustomer = {
  id: string;
  customer_name: string;
  cpf_cnpj: string;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  postal_code: string | null;
  address: string | null;
  address_number: string | null;
  complement: string | null;
  province: string | null;
  city: string | null;
  state: string | null;
  asaas_customer_id: string;
  environment: CorporateAsaasEnvironment;
  created_at: string;
  updated_at: string;
};

export type MasterCorporateAsaasCharge = {
  id: string;
  receivable_id: string;
  project_id: string | null;
  quote_id: string | null;
  financial_account_id: string;
  corporate_customer_id: string | null;
  asaas_customer_id: string;
  asaas_payment_id: string;
  billing_type: CorporateAsaasBillingType;
  local_status: CorporateAsaasLocalStatus;
  asaas_status: string | null;
  original_value: number;
  net_value: number | null;
  due_date: string;
  description: string;
  domain: 'MASTER_CORPORATE_FINANCE';
  external_reference: string;
  idempotency_key: string;
  environment: CorporateAsaasEnvironment;
  invoice_url: string | null;
  bank_slip_url: string | null;
  transaction_receipt_url: string | null;
  identification_field: string | null;
  pix_payload: string | null;
  pix_qr_code: string | null;
  pix_expiration_at: string | null;
  paid_at: string | null;
  confirmed_at: string | null;
  canceled_at: string | null;
  refunded_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  receivable_payment_id: string | null;
  cash_movement_id: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterCorporateAsaasWebhookEvent = {
  id: string;
  event_id: string;
  event_type: string;
  asaas_payment_id: string | null;
  charge_id: string | null;
  receivable_id: string | null;
  external_reference: string | null;
  domain: 'MASTER_CORPORATE_FINANCE';
  processing_status: CorporateAsaasWebhookProcessingStatus;
  attempts: number;
  payload_sanitized: Record<string, unknown>;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
};

export type CorporateAsaasCreateChargeInput = {
  receivable_id: string;
  billing_type: CorporateAsaasBillingType;
  financial_account_id: string;
  value?: number;
  due_date?: string;
  description?: string;
  customer_name?: string;
  cpf_cnpj?: string;
  email?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  /** Justificativa obrigatória se value < remaining (parcial). */
  partial_justification?: string | null;
};

export function corporateAsaasLocalStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Pendente';
    case 'AWAITING_PAYMENT':
      return 'Aguardando pagamento';
    case 'RECEIVED':
      return 'Recebida';
    case 'CONFIRMED':
      return 'Confirmada';
    case 'OVERDUE':
      return 'Vencida';
    case 'CANCELLED':
      return 'Cancelada';
    case 'REFUNDED':
      return 'Estornada';
    case 'ERROR':
      return 'Erro de sincronização';
    case 'NONE':
      return 'Não gerada';
    default:
      return status || '—';
  }
}

export function corporateAsaasBillingTypeLabel(type: string): string {
  switch (type) {
    case 'PIX':
      return 'PIX';
    case 'BOLETO':
      return 'Boleto';
    default:
      return type;
  }
}

export function isCorporateAsaasActiveStatus(status: string): boolean {
  return (CORPORATE_ASAAS_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function isCorporateAsaasPaidStatus(status: string): boolean {
  return (CORPORATE_ASAAS_PAID_STATUSES as readonly string[]).includes(status);
}

/** Status pago não pode ser rebaixado por evento posterior. */
export function canDowngradeCorporateAsaasStatus(
  current: string,
  next: string,
): boolean {
  if (isCorporateAsaasPaidStatus(current) && !isCorporateAsaasPaidStatus(next)) {
    if (next === 'REFUNDED') return true;
    return false;
  }
  return true;
}
