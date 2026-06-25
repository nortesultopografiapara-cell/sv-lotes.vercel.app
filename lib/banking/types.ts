/**
 * Tipos genéricos do Módulo Bancário SV LOTES 2.0 (empresas / parcelas).
 * Separado de lib/payments (Asaas Master SaaS).
 */

export const BANK_PROVIDERS = [
  'SICOOB',
  'SICREDI',
  'BRADESCO',
  'BANCO_DO_BRASIL',
  'CAIXA',
  'ASAAS_COMPANY',
  'MOCK',
] as const;

export type BankProvider = (typeof BANK_PROVIDERS)[number];

export const BANK_ENVIRONMENTS = ['SANDBOX', 'PRODUCTION'] as const;
export type BankEnvironment = (typeof BANK_ENVIRONMENTS)[number];

export const BANK_INTEGRATION_STATUSES = ['DRAFT', 'ACTIVE', 'DISABLED', 'ERROR'] as const;
export type BankIntegrationStatus = (typeof BANK_INTEGRATION_STATUSES)[number];

export const BANK_CHARGE_STATUSES = [
  'PENDING',
  'REGISTERED',
  'PAID',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
] as const;
export type BankChargeStatus = (typeof BANK_CHARGE_STATUSES)[number];

export const BANK_CHARGE_TYPES = ['BOLETO', 'PIX', 'BOLETO_PIX'] as const;
export type BankChargeType = (typeof BANK_CHARGE_TYPES)[number];

export const BANK_WEBHOOK_PROCESSING_STATUSES = [
  'PENDING',
  'PROCESSED',
  'IGNORED',
  'FAILED',
  'DUPLICATE',
] as const;
export type BankWebhookProcessingStatus = (typeof BANK_WEBHOOK_PROCESSING_STATUSES)[number];

export type BankIntegration = {
  id: string;
  companyId: string;
  provider: BankProvider;
  environment: BankEnvironment;
  status: BankIntegrationStatus;
  label?: string | null;
  isDefault: boolean;
};

export type BankCharge = {
  id: string;
  companyId: string;
  integrationId: string;
  financeReceiptId?: string | null;
  saleId?: string | null;
  customerId?: string | null;
  chargeType: BankChargeType;
  provider: BankProvider;
  environment: BankEnvironment;
  externalId?: string | null;
  amount: number;
  dueDate: string;
  status: BankChargeStatus;
  barcode?: string | null;
  digitableLine?: string | null;
  pixQrCode?: string | null;
  pixCopyPaste?: string | null;
  paymentUrl?: string | null;
  pdfUrl?: string | null;
  paidAt?: string | null;
  paidAmount?: number | null;
  feeAmount?: number | null;
  idempotencyKey: string;
};

export type BankBoletoPayload = {
  externalId: string;
  ourNumber: string;
  barcode: string;
  digitableLine: string;
  paymentUrl: string;
  pdfUrl?: string | null;
  status: BankChargeStatus;
};

export type BankPixPayload = {
  externalId: string;
  txid: string;
  pixQrCode: string;
  pixCopyPaste: string;
  paymentUrl: string;
  status: BankChargeStatus;
};

export type BankWebhookEvent = {
  id: string;
  companyId?: string | null;
  integrationId?: string | null;
  provider: BankProvider;
  eventType: string;
  externalEventId?: string | null;
  payload: Record<string, unknown>;
  processingStatus: BankWebhookProcessingStatus;
  idempotencyKey: string;
  signatureValid?: boolean | null;
};

export type CreateBankBoletoInput = {
  companyId: string;
  integrationId: string;
  financeReceiptId: string;
  amount: number;
  dueDate: string;
  payerName: string;
  payerDocument?: string;
  idempotencyKey: string;
};

export type CreateBankPixInput = {
  companyId: string;
  integrationId: string;
  financeReceiptId: string;
  amount: number;
  dueDate: string;
  payerName: string;
  payerDocument?: string;
  idempotencyKey: string;
};

export type BankConnectionTestResult = {
  ok: boolean;
  message: string;
  latencyMs?: number;
};

export type BankWebhookParseResult = {
  event: BankWebhookEvent | null;
  duplicate: boolean;
  error?: string;
};

export type BankReconcileResult = {
  chargeId: string;
  financeReceiptId: string;
  previousStatus: BankChargeStatus;
  newStatus: BankChargeStatus;
  paidAmount: number;
  paidAt: string;
  cashMovement: {
    type: 'entrada' | 'saida';
    category: string;
    amount: number;
    description: string;
  };
  feeMovement?: {
    type: 'saida';
    category: string;
    amount: number;
    description: string;
  } | null;
};
