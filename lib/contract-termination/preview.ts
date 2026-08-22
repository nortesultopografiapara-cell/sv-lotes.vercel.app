/**
 * Helper interno do preview de acerto (somente leitura).
 * Resolve política (snapshot > legado) + classifica recibos + calcula. Sem persistência.
 */

import { calculateTerminationSettlement } from '@/lib/contract-termination/calculateSettlement';
import { formatAppliedRuleLabel } from '@/lib/contract-termination/formatSettlement';
import { classifyTerminationReceipts } from '@/lib/contract-termination/receipts';
import { resolveOperationalTerminationPolicy } from '@/lib/contract-termination/resolvePolicy';
import type {
  CalculateTerminationSettlementInput,
  ExceptionOverrideInput,
  SettlementDestination,
  TerminationReceiptInput,
  TerminationSettlementPreview,
} from '@/lib/contract-termination/types';

export type BuildTerminationSettlementPreviewInput = {
  saleSnapshot?: unknown;
  contractSnapshot?: unknown;
  salePersistSource?: string | null;
  contractPersistSource?: string | null;
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
  const resolved = resolveOperationalTerminationPolicy({
    saleSnapshot: input.saleSnapshot,
    contractSnapshot: input.contractSnapshot,
    salePersistSource: input.salePersistSource,
    contractPersistSource: input.contractPersistSource,
    saleContractModel: input.saleContractModel,
    contractContractModel: input.contractContractModel,
  });

  const receipts = input.receipts || [];
  const classifiedReceipts = classifyTerminationReceipts(receipts);

  const calcInput: CalculateTerminationSettlementInput = {
    policy: resolved.policy,
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
      ? settlement.warnings[0] || resolved.policy.incompleteMessage
      : null;

  return {
    detectedModel: resolved.detectedModel,
    policyStatus: resolved.policy.status,
    policy: resolved.policy,
    receipts,
    classifiedReceipts,
    settlement,
    appliedRuleLabel: formatAppliedRuleLabel(resolved.policy, settlement),
    incompleteMessage,
    origin: resolved.origin,
  };
}
