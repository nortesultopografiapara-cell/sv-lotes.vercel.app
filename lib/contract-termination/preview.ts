/**
 * Helper interno do preview de acerto (somente leitura).
 * Resolve política + classifica recibos + calcula. Sem persistência.
 */

import { calculateTerminationSettlement } from '@/lib/contract-termination/calculateSettlement';
import { formatAppliedRuleLabel } from '@/lib/contract-termination/formatSettlement';
import { classifyTerminationReceipts } from '@/lib/contract-termination/receipts';
import { resolveTerminationPolicy } from '@/lib/contract-termination/resolvePolicy';
import type {
  CalculateTerminationSettlementInput,
  ExceptionOverrideInput,
  SettlementDestination,
  TerminationReceiptInput,
  TerminationSettlementPreview,
} from '@/lib/contract-termination/types';

export type BuildTerminationSettlementPreviewInput = {
  saleContractModel?: string | null;
  contractContractModel?: string | null;
  receipts: TerminationReceiptInput[];
  motiveCode?: string | null;
  hasImprovements?: boolean;
  destination?: SettlementDestination;
  exceptionOverride?: ExceptionOverrideInput | null;
};

export function buildTerminationSettlementPreview(
  input: BuildTerminationSettlementPreviewInput,
): TerminationSettlementPreview {
  const { detectedModel, policy } = resolveTerminationPolicy({
    saleContractModel: input.saleContractModel,
    contractContractModel: input.contractContractModel,
  });

  const receipts = input.receipts || [];
  const classifiedReceipts = classifyTerminationReceipts(receipts);

  const calcInput: CalculateTerminationSettlementInput = {
    policy,
    receipts,
    motiveCode: input.motiveCode || null,
    hasImprovements: Boolean(input.hasImprovements),
    destination: input.destination || 'REFUND_CUSTOMER',
    exceptionOverride: input.exceptionOverride || null,
  };

  const settlement = calculateTerminationSettlement(calcInput);
  const incompleteMessage =
    settlement.calculationStatus === 'INCOMPLETE' ||
    settlement.calculationStatus === 'MISSING_POLICY'
      ? settlement.warnings[0] || policy.incompleteMessage
      : null;

  return {
    detectedModel,
    policyStatus: policy.status,
    policy,
    receipts,
    classifiedReceipts,
    settlement,
    appliedRuleLabel: formatAppliedRuleLabel(policy, settlement),
    incompleteMessage,
  };
}
