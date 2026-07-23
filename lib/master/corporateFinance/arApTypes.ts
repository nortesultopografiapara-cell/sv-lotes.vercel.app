/** Tipos — Contas a Receber / Pagar (Fase 6.2). */

export const CORPORATE_PAYMENT_METHODS = [
  'PIX',
  'TED',
  'DOC',
  'BOLETO',
  'CASH',
  'CARD',
  'TRANSFER',
  'CHECK',
  'OTHER',
] as const;

export type CorporatePaymentMethod = (typeof CORPORATE_PAYMENT_METHODS)[number];

export const CORPORATE_PAYMENT_ORIGINS = [
  'MANUAL',
  'ASAAS',
  'LEGACY_PROJECT_RECEIVED',
  'OTHER',
] as const;

export type CorporatePaymentOrigin = (typeof CORPORATE_PAYMENT_ORIGINS)[number];

export const CORPORATE_RECEIVABLE_STATUSES = [
  'DRAFT',
  'OPEN',
  'PARTIAL',
  'RECEIVED',
  'OVERDUE',
  'CANCELED',
  'ARCHIVED',
] as const;

export type CorporateReceivableStatus = (typeof CORPORATE_RECEIVABLE_STATUSES)[number];

export const CORPORATE_PAYABLE_STATUSES = [
  'DRAFT',
  'OPEN',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'CANCELED',
  'ARCHIVED',
] as const;

export type CorporatePayableStatus = (typeof CORPORATE_PAYABLE_STATUSES)[number];

export type MasterCorporateReceivable = {
  id: string;
  code: string;
  description: string;
  customer_name: string;
  customer_document: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  project_id: string | null;
  quote_id: string | null;
  category_id: string;
  cost_center_id: string | null;
  financial_account_id: string | null;
  issue_date: string;
  competence_date: string;
  due_date: string;
  original_amount: number;
  discount_amount: number;
  interest_amount: number;
  fine_amount: number;
  net_amount: number;
  received_amount: number;
  remaining_amount: number;
  status: CorporateReceivableStatus;
  payment_method: CorporatePaymentMethod | null;
  installment_number: number | null;
  installment_total: number | null;
  notes: string | null;
  is_archived: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  canceled_at: string | null;
  canceled_by: string | null;
  cancellation_reason: string | null;
  /** Espelho leve integração Asaas (Fase 7.1) */
  asaas_integration_status: string | null;
  asaas_active_charge_id: string | null;
  asaas_last_sync_at: string | null;
  asaas_last_error: string | null;
};

export type MasterCorporateReceivableInput = {
  description: string;
  customer_name: string;
  customer_document: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  project_id: string | null;
  quote_id: string | null;
  category_id: string;
  cost_center_id: string | null;
  financial_account_id: string | null;
  issue_date: string;
  competence_date: string;
  due_date: string;
  original_amount: number;
  discount_amount: number;
  interest_amount: number;
  fine_amount: number;
  payment_method: CorporatePaymentMethod | null;
  installment_number: number | null;
  installment_total: number | null;
  notes: string | null;
  status?: 'DRAFT' | 'OPEN';
};

export type MasterCorporateReceivablePayment = {
  id: string;
  receivable_id: string;
  financial_account_id: string;
  payment_date: string;
  amount: number;
  payment_method: CorporatePaymentMethod;
  reference: string | null;
  notes: string | null;
  origin: CorporatePaymentOrigin;
  idempotency_key: string | null;
  is_reversed: boolean;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type MasterCorporateSettlementInput = {
  financial_account_id: string;
  payment_date: string;
  amount: number;
  payment_method: CorporatePaymentMethod;
  reference: string | null;
  notes: string | null;
  origin?: CorporatePaymentOrigin;
  idempotency_key?: string | null;
};

export type MasterCorporatePayable = {
  id: string;
  code: string;
  description: string;
  supplier_name: string;
  supplier_document: string | null;
  supplier_phone: string | null;
  supplier_email: string | null;
  project_id: string | null;
  category_id: string;
  cost_center_id: string | null;
  financial_account_id: string | null;
  issue_date: string;
  competence_date: string;
  due_date: string;
  original_amount: number;
  discount_amount: number;
  interest_amount: number;
  fine_amount: number;
  net_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: CorporatePayableStatus;
  payment_method: CorporatePaymentMethod | null;
  installment_number: number | null;
  installment_total: number | null;
  notes: string | null;
  is_archived: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  canceled_at: string | null;
  canceled_by: string | null;
  cancellation_reason: string | null;
};

export type MasterCorporatePayableInput = {
  description: string;
  supplier_name: string;
  supplier_document: string | null;
  supplier_phone: string | null;
  supplier_email: string | null;
  project_id: string | null;
  category_id: string;
  cost_center_id: string | null;
  financial_account_id: string | null;
  issue_date: string;
  competence_date: string;
  due_date: string;
  original_amount: number;
  discount_amount: number;
  interest_amount: number;
  fine_amount: number;
  payment_method: CorporatePaymentMethod | null;
  installment_number: number | null;
  installment_total: number | null;
  notes: string | null;
  status?: 'DRAFT' | 'OPEN';
};

export type MasterCorporatePayablePayment = {
  id: string;
  payable_id: string;
  financial_account_id: string;
  payment_date: string;
  amount: number;
  payment_method: CorporatePaymentMethod;
  reference: string | null;
  notes: string | null;
  origin: 'MANUAL' | 'ASAAS' | 'OTHER';
  idempotency_key: string | null;
  is_reversed: boolean;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type MasterCorporateArApListFilters = {
  q?: string;
  status?: string;
  projectId?: string;
  quoteId?: string;
  categoryId?: string;
  costCenterId?: string;
  financialAccountId?: string;
  overdueOnly?: boolean;
  includeArchived?: boolean;
  fromDate?: string;
  toDate?: string;
  dateField?: 'due_date' | 'issue_date' | 'competence_date' | 'created_at';
  page?: number;
  limit?: number;
};

export type MasterCorporateReceivableKpis = {
  totalOpen: number;
  dueThisMonth: number;
  receivedThisMonth: number;
  overdue: number;
  openCount: number;
  partialCount: number;
  receivedCount: number;
};

export type MasterCorporatePayableKpis = {
  totalOpen: number;
  dueThisMonth: number;
  paidThisMonth: number;
  overdue: number;
  openCount: number;
  partialCount: number;
  paidCount: number;
};

export function corporatePaymentMethodLabel(method: string | null | undefined): string {
  switch (method) {
    case 'PIX':
      return 'PIX';
    case 'TED':
      return 'TED';
    case 'DOC':
      return 'DOC';
    case 'BOLETO':
      return 'Boleto';
    case 'CASH':
      return 'Dinheiro';
    case 'CARD':
      return 'Cartão';
    case 'TRANSFER':
      return 'Transferência';
    case 'CHECK':
      return 'Cheque';
    case 'OTHER':
      return 'Outro';
    default:
      return method || '—';
  }
}

export function corporateReceivableStatusLabel(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'Rascunho';
    case 'OPEN':
      return 'Em aberto';
    case 'PARTIAL':
      return 'Parcial';
    case 'RECEIVED':
      return 'Recebido';
    case 'OVERDUE':
      return 'Vencido';
    case 'CANCELED':
      return 'Cancelado';
    case 'ARCHIVED':
      return 'Arquivado';
    default:
      return status;
  }
}

export function corporatePayableStatusLabel(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'Rascunho';
    case 'OPEN':
      return 'Em aberto';
    case 'PARTIAL':
      return 'Parcial';
    case 'PAID':
      return 'Pago';
    case 'OVERDUE':
      return 'Vencido';
    case 'CANCELED':
      return 'Cancelado';
    case 'ARCHIVED':
      return 'Arquivado';
    default:
      return status;
  }
}

export function corporateReceivableStatusColor(status: string): string {
  switch (status) {
    case 'DRAFT':
      return '#94a3b8';
    case 'OPEN':
      return '#0284c7';
    case 'PARTIAL':
      return '#d97706';
    case 'RECEIVED':
      return '#059669';
    case 'OVERDUE':
      return '#e11d48';
    case 'CANCELED':
      return '#64748b';
    case 'ARCHIVED':
      return '#94a3b8';
    default:
      return '#64748b';
  }
}

export function corporatePayableStatusColor(status: string): string {
  switch (status) {
    case 'PAID':
      return '#059669';
    default:
      return corporateReceivableStatusColor(status === 'PAID' ? 'RECEIVED' : status);
  }
}
