/**
 * Tipos do acerto financeiro de encerramento contratual (engine puro).
 * Sem queries, sem side effects, sem dependência de contract_model no cálculo.
 */

export type TerminationPolicyStatus = 'COMPLETE' | 'INCOMPLETE';

export type TerminationPolicySource = 'catalog' | 'missing';

export type RefundInstallmentCountRule = 'PAID_REGULAR_INSTALLMENTS' | 'NOT_DEFINED';

export type SettlementDestination = 'REFUND_CUSTOMER' | 'CREDIT_OTHER_UNIT';

export type TerminationCalculationStatus =
  | 'CALCULATED'
  | 'INCOMPLETE'
  | 'MISSING_POLICY'
  | 'WAITING_IMPROVEMENT_APPRAISAL';

export type ReceiptKind = 'signal' | 'entry' | 'installment' | 'other';

/** Recibo no formato mínimo do engine (finance_receipts). */
export type TerminationReceiptInput = {
  id?: string | null;
  installment_number?: number | string | null;
  status?: string | null;
  paid_at?: string | null;
  amount?: number | string | null;
  paid_amount?: number | string | null;
};

export type ClassifiedTerminationReceipt = TerminationReceiptInput & {
  kind: ReceiptKind;
  paid: boolean;
  paidValue: number;
};

/**
 * Política já resolvida. O cálculo opera só nestes campos —
 * nunca no nome do modelo de contrato.
 */
export type TerminationPolicy = {
  status: TerminationPolicyStatus;
  policyVersion: string;
  policySource: TerminationPolicySource;
  /** Chave do catálogo (ex.: ARAGUAIA). Somente metadado de origem. */
  catalogKey: string | null;
  catalogLabel: string;
  clauseReference: string | null;
  incompleteMessage: string | null;
  entryRefundable: boolean;
  signalRefundable: boolean;
  otherRefundable: boolean;
  /** Percentual contratual. null = não homologado; nunca inventar. */
  contractualRetentionPercent: number | null;
  refundInstallmentCountRule: RefundInstallmentCountRule;
  improvementsBlockFinalCalculation: boolean;
  creditOtherUnitAllowed: boolean;
  /** Sempre false nesta fase — crédito nunca é automático. */
  creditOtherUnitAutomatic: false;
};

export type ExceptionOverrideInput = {
  enabled: boolean;
  refundAmount?: number | null;
  retentionPercent?: number | null;
  justification?: string | null;
};

export type CalculateTerminationSettlementInput = {
  policy: TerminationPolicy;
  receipts: TerminationReceiptInput[];
  motiveCode?: string | null;
  hasImprovements: boolean;
  destination: SettlementDestination;
  exceptionOverride?: ExceptionOverrideInput | null;
};

export type TerminationSettlement = {
  totalPaid: number;
  entryPaid: number;
  signalPaid: number;
  installmentPaid: number;
  otherPaid: number;
  paidInstallmentCount: number;
  nonRefundableAmount: number;
  refundableBase: number;
  contractualRetentionPercent: number | null;
  contractualRetentionAmount: number;
  contractualRefundAmount: number;
  agreedRefundAmount: number | null;
  refundInstallmentCount: number | null;
  calculationStatus: TerminationCalculationStatus;
  warnings: string[];
  policyVersion: string;
  policySource: TerminationPolicySource;
  clauseReference: string | null;
  catalogKey: string | null;
  destination: SettlementDestination;
  creditOtherUnitAutomatic: false;
  exceptionApplied: boolean;
  isFinal: boolean;
};

export type TerminationSettlementPreview = {
  detectedModel: string | null;
  policyStatus: TerminationPolicyStatus;
  policy: TerminationPolicy;
  receipts: TerminationReceiptInput[];
  classifiedReceipts: ClassifiedTerminationReceipt[];
  settlement: TerminationSettlement;
  appliedRuleLabel: string;
  incompleteMessage: string | null;
};
