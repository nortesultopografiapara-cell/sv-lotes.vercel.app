export const COMPANY_ASAAS_BILLING_TYPES = ['PIX', 'BOLETO', 'UNDEFINED'] as const;
export type CompanyAsaasBillingType = (typeof COMPANY_ASAAS_BILLING_TYPES)[number];

export const COMPANY_ASAAS_CHARGE_STATUSES = [
  'PENDING',
  'REGISTERED',
  'PAID',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'OVERDUE',
] as const;
export type CompanyAsaasChargeStatus = (typeof COMPANY_ASAAS_CHARGE_STATUSES)[number];

export type CompanyAsaasChargeRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  sale_id: string | null;
  installment_id: string;
  asaas_payment_id: string;
  billing_type: CompanyAsaasBillingType;
  status: CompanyAsaasChargeStatus;
  value: number;
  due_date: string;
  invoice_url: string | null;
  bank_slip_url: string | null;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  raw_payload: Record<string, unknown>;
  paid_at: string | null;
  cash_movement_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyAsaasChargeResponse = {
  id: string;
  companyId: string;
  customerId: string | null;
  saleId: string | null;
  installmentId: string;
  asaasPaymentId: string;
  billingType: CompanyAsaasBillingType;
  status: CompanyAsaasChargeStatus;
  value: number;
  dueDate: string;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  paymentLink: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateCompanyInstallmentChargeInput = {
  companyId: string;
  installmentId: string;
  billingType: 'PIX' | 'BOLETO';
  userId?: string | null;
};

export function mapCompanyAsaasChargeRow(row: CompanyAsaasChargeRow): CompanyAsaasChargeResponse {
  return {
    id: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    saleId: row.sale_id,
    installmentId: row.installment_id,
    asaasPaymentId: row.asaas_payment_id,
    billingType: row.billing_type,
    status: row.status,
    value: Number(row.value),
    dueDate: row.due_date,
    invoiceUrl: row.invoice_url,
    bankSlipUrl: row.bank_slip_url,
    pixQrCode: row.pix_qr_code,
    pixCopyPaste: row.pix_copy_paste,
    paymentLink: row.invoice_url || row.bank_slip_url,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAsaasPaymentStatusToCompanyCharge(status?: string | null): CompanyAsaasChargeStatus {
  const key = String(status || '').toUpperCase();
  if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(key)) return 'PAID';
  if (['OVERDUE'].includes(key)) return 'OVERDUE';
  if (['CANCELED', 'DELETED', 'REFUNDED'].includes(key)) return 'CANCELLED';
  if (['PENDING'].includes(key)) return 'PENDING';
  return 'REGISTERED';
}

export function isCompanyAsaasIntegrationReady(config: {
  connectionStatus: string;
  status: string;
  environment: string;
  hasSandboxApiKey: boolean;
  hasProductionApiKey: boolean;
}): boolean {
  const hasKey =
    config.environment === 'PRODUCTION'
      ? config.hasProductionApiKey
      : config.hasSandboxApiKey;
  return hasKey && config.connectionStatus === 'CONNECTED' && config.status === 'ACTIVE';
}
