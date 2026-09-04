/**
 * Montagem pura do snapshot documental a partir do settlement persistido
 * e das partes capturadas no ato. Sem recálculo financeiro.
 */

import {
  buildCustomerObligation,
  emptyImprovementsRecord,
  parseImprovementsFromCalculationSnapshot,
  parseObligationFromCalculationSnapshot,
  resolveImprovementsForDocument,
} from '@/lib/contract-termination/improvements';
import { hashTerminationDocumentHtml } from '@/lib/termination-documents/hash';
import { resolveTerminationDocumentHtmlBuilder } from '@/lib/termination-documents/resolveTemplate';
import {
  parseRefundScheduleFromCalculationSnapshot,
  shouldDefineRefundSchedule,
  undefinedRefundSchedule,
} from '@/lib/termination-documents/refundSchedule';
import { shouldGenerateTerminationDocument, terminationDocumentTitleForType } from '@/lib/termination-documents/titles';
import type {
  TerminationDocumentOperationType,
  TerminationDocumentParty,
  TerminationDocumentSnapshot,
  TerminationRefundSchedule,
} from '@/lib/termination-documents/types';

export type FrozenSettlementFinance = {
  id: string;
  sale_id: string;
  company_id: string;
  contract_id?: string | null;
  block_id?: string | null;
  project_id?: string | null;
  operation_type: string;
  calculation_status?: string | null;
  total_paid?: number | null;
  entry_amount?: number | null;
  signal_amount?: number | null;
  non_refundable_amount?: number | null;
  refundable_base?: number | null;
  retention_percent?: number | null;
  retention_amount?: number | null;
  agreed_refund_amount?: number | null;
  contractual_refund_amount?: number | null;
  refund_installments?: number | null;
  refund_destination?: string | null;
  improvement_status?: string | null;
  policy_snapshot?: Record<string, unknown> | null;
  operator_user_id?: string | null;
  calculation_snapshot?: Record<string, unknown> | null;
  reason?: string | null;
  reason_detail?: string | null;
};

export type TerminationDocumentContext = {
  contractNumber?: string | null;
  contractModel?: string | null;
  forumCitySnapshot?: string | null;
  projectName?: string | null;
  quadra?: string | null;
  lote?: string | null;
  customerId?: string | null;
  vendor: TerminationDocumentParty;
  buyer: TerminationDocumentParty;
  spouse?: TerminationDocumentParty | null;
  pendingObligationsCanceled?: boolean;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function policyField(
  policy: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!policy || typeof policy !== 'object') return null;
  return text(policy[key]);
}

function resolveSnapshotRefundSchedule(input: {
  settlement: FrozenSettlementFinance;
  refundDestination: 'CREDIT_OTHER_UNIT' | 'REFUND_CUSTOMER';
  agreed: number | null;
  refundInstallments: number | null;
  candidate: TerminationRefundSchedule;
  improvementsTotal?: number | null;
  scheduleTotal?: number | null;
}): TerminationRefundSchedule {
  const needed = shouldDefineRefundSchedule({
    destination: input.refundDestination,
    agreedRefundAmount: input.agreed,
    contractualRefundAmount: input.settlement.contractual_refund_amount,
    installmentCount: input.refundInstallments,
    calculationStatus: input.settlement.calculation_status,
    improvementsTotal: input.improvementsTotal,
    scheduleTotal: input.scheduleTotal,
  });
  if (needed && input.candidate.defined) return input.candidate;
  return undefinedRefundSchedule(input.refundInstallments);
}

export function buildTerminationDocumentSnapshot(input: {
  settlement: FrozenSettlementFinance;
  context: TerminationDocumentContext;
  documentNumber: string;
  generatedAt?: string;
  refundSchedule?: TerminationRefundSchedule | null;
}): TerminationDocumentSnapshot {
  const s = input.settlement;
  const operationType = String(s.operation_type || '').trim() as TerminationDocumentOperationType;
  if (!shouldGenerateTerminationDocument(operationType)) {
    throw new Error('TERMINATION_DOCUMENT_TYPE_UNSUPPORTED');
  }
  const destRaw = String(s.refund_destination || 'REFUND_CUSTOMER').toUpperCase();
  const refundDestination =
    destRaw === 'CREDIT_OTHER_UNIT' ? 'CREDIT_OTHER_UNIT' : 'REFUND_CUSTOMER';
  const policy = (s.policy_snapshot || {}) as Record<string, unknown>;
  const refundInstallments =
    s.refund_installments == null ? null : Math.max(0, Math.floor(num(s.refund_installments)));
  const agreed =
    s.agreed_refund_amount == null
      ? s.contractual_refund_amount == null
        ? null
        : num(s.contractual_refund_amount)
      : num(s.agreed_refund_amount);
  const unitLabel =
    text(input.context.quadra) || text(input.context.lote)
      ? `Quadra ${input.context.quadra || '—'} / Lote ${input.context.lote || '—'}`
      : null;

  const improvements = resolveImprovementsForDocument({
    improvementStatus: text(s.improvement_status),
    calculationSnapshot: s.calculation_snapshot,
  });
  const fromSnap = parseImprovementsFromCalculationSnapshot(s.calculation_snapshot);
  const improvementsResolved = fromSnap.declared
    ? fromSnap
    : improvements.declared
      ? improvements
      : emptyImprovementsRecord();
  const obligation = parseObligationFromCalculationSnapshot(
    s.calculation_snapshot,
    agreed || 0,
  );
  const obligationResolved =
    obligation.improvementsTotal > 0 || improvementsResolved.appraisalStatus === 'COMPLETED'
      ? obligation
      : buildCustomerObligation({
          contractualRefund: agreed || 0,
          improvements: improvementsResolved,
        });

  const draft: Omit<TerminationDocumentSnapshot, 'html' | 'contentHash'> = {
    documentNumber: input.documentNumber,
    title: terminationDocumentTitleForType(operationType),
    operationType,
    generatedAt: input.generatedAt || new Date().toISOString(),
    operatorUserId: text(s.operator_user_id),
    settlementId: String(s.id),
    saleId: String(s.sale_id),
    contractId: text(s.contract_id),
    blockId: text(s.block_id),
    projectId: text(s.project_id),
    customerId: text(input.context.customerId),
    companyId: String(s.company_id),
    contractNumber: text(input.context.contractNumber),
    contractModel: text(input.context.contractModel),
    forumCitySnapshot: text(input.context.forumCitySnapshot),
    policyVersion: policyField(policy, 'policyVersion') || policyField(policy, 'policy_version'),
    policySource: policyField(policy, 'policySource') || policyField(policy, 'policy_source'),
    clauseReference: policyField(policy, 'clauseReference') || policyField(policy, 'clause_reference'),
    projectName: text(input.context.projectName),
    quadra: text(input.context.quadra),
    lote: text(input.context.lote),
    unitLabel,
    vendor: input.context.vendor,
    buyer: input.context.buyer,
    spouse: input.context.spouse?.name ? input.context.spouse : null,
    totalPaid: num(s.total_paid),
    entryAmount: num(s.entry_amount),
    signalAmount: num(s.signal_amount),
    nonRefundableAmount: num(s.non_refundable_amount),
    restitutionBase: num(s.refundable_base),
    retentionPercent:
      s.retention_percent == null ? null : num(s.retention_percent),
    retentionAmount: num(s.retention_amount),
    agreedRefundAmount: agreed,
    refundInstallments,
    refundDestination,
    improvementStatus: text(s.improvement_status),
    improvements: improvementsResolved,
    obligation: obligationResolved,
    pendingObligationsCanceled: input.context.pendingObligationsCanceled !== false,
    reasonDetail: text(s.reason_detail),
    refundSchedule: resolveSnapshotRefundSchedule({
      settlement: s,
      refundDestination,
      agreed,
      refundInstallments,
      improvementsTotal: obligationResolved.improvementsTotal,
      scheduleTotal:
        improvementsResolved.appraisalStatus === 'COMPLETED'
          ? obligationResolved.total
          : agreed,
      candidate:
        input.refundSchedule ||
        parseRefundScheduleFromCalculationSnapshot(s.calculation_snapshot) ||
        undefinedRefundSchedule(refundInstallments),
    }),
    signatureStatus: 'NOT_STARTED',
  };

  const html = resolveTerminationDocumentHtmlBuilder({
    operationType,
    contractModel: draft.contractModel,
  })(draft);
  return {
    ...draft,
    html,
    contentHash: hashTerminationDocumentHtml(html),
  };
}

export function snapshotFinanceMatchesSettlement(
  snapshot: TerminationDocumentSnapshot,
  settlement: FrozenSettlementFinance,
): boolean {
  const destRaw = String(settlement.refund_destination || 'REFUND_CUSTOMER').toUpperCase();
  const dest = destRaw === 'CREDIT_OTHER_UNIT' ? 'CREDIT_OTHER_UNIT' : 'REFUND_CUSTOMER';
  const agreed =
    settlement.agreed_refund_amount == null
      ? settlement.contractual_refund_amount == null
        ? null
        : num(settlement.contractual_refund_amount)
      : num(settlement.agreed_refund_amount);
  return (
    snapshot.settlementId === String(settlement.id) &&
    snapshot.saleId === String(settlement.sale_id) &&
    snapshot.companyId === String(settlement.company_id) &&
    snapshot.totalPaid === num(settlement.total_paid) &&
    snapshot.entryAmount === num(settlement.entry_amount) &&
    snapshot.signalAmount === num(settlement.signal_amount) &&
    snapshot.nonRefundableAmount === num(settlement.non_refundable_amount) &&
    snapshot.restitutionBase === num(settlement.refundable_base) &&
    snapshot.retentionAmount === num(settlement.retention_amount) &&
    snapshot.agreedRefundAmount === agreed &&
    snapshot.refundDestination === dest &&
    (snapshot.obligation?.improvementsTotal ?? 0) ===
      parseObligationFromCalculationSnapshot(
        settlement.calculation_snapshot,
        agreed || 0,
      ).improvementsTotal
  );
}

export function parseTerminationDocumentSnapshot(
  raw: unknown,
): TerminationDocumentSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Partial<TerminationDocumentSnapshot>;
  if (!row.documentNumber || !row.html || !row.contentHash || !row.settlementId) {
    return null;
  }
  if (!shouldGenerateTerminationDocument(row.operationType)) return null;
  return row as TerminationDocumentSnapshot;
}
