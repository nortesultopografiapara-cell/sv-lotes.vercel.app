export type {
  CalculateTerminationSettlementInput,
  ClassifiedTerminationReceipt,
  ExceptionOverrideInput,
  ReceiptKind,
  SettlementDestination,
  TerminationCalculationStatus,
  TerminationPolicy,
  TerminationPolicySource,
  TerminationPolicyStatus,
  TerminationReceiptInput,
  TerminationSettlement,
  TerminationSettlementPreview,
} from '@/lib/contract-termination/types';

export {
  ARAGUAIA_POLICY_V1,
  INCOMPLETE_POLICY_MESSAGE,
  MISSING_POLICY_MESSAGE,
  POLICY_CATALOG,
  POLICY_CATALOG_KEYS,
  getCatalogPolicy,
  missingPolicy,
} from '@/lib/contract-termination/policyCatalog';

export { resolveTerminationPolicy } from '@/lib/contract-termination/resolvePolicy';

export {
  calculateTerminationSettlement,
  roundMoney,
} from '@/lib/contract-termination/calculateSettlement';

export {
  classifyReceiptKind,
  classifyTerminationReceipts,
  isTerminationReceiptPaid,
  paidReceiptValue,
} from '@/lib/contract-termination/receipts';

export {
  formatAppliedRuleLabel,
  formatPolicyOrigin,
  formatRetentionPercent,
} from '@/lib/contract-termination/formatSettlement';

export { buildTerminationSettlementPreview } from '@/lib/contract-termination/preview';
