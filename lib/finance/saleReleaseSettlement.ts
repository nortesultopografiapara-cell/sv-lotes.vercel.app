/**
 * Persistência do acerto de encerramento (Fase 3A).
 * Recalcula no servidor e grava em sale_release_settlements na sale_id original.
 * Documento do termo: lib/termination-documents (não zera snapshot/document_id no upsert financeiro).
 * Sem cash_movements, sem crédito efetivo em outra unidade.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateTerminationSettlement } from '@/lib/contract-termination/calculateSettlement';
import {
  buildCustomerObligation,
  buildImprovementsRecord,
  emptyImprovementsRecord,
  engineHasImprovementsFlag,
  improvementStatusForPersist,
  parseImprovementsOperatorFields,
  validateImprovementsForRelease,
  type CustomerObligationBreakdown,
  type ImprovementAppraisalStatus,
  type ImprovementItemInput,
  type ImprovementsRecord,
} from '@/lib/contract-termination/improvements';
import { classifyTerminationReceipts } from '@/lib/contract-termination/receipts';
import { resolveOperationalTerminationPolicy } from '@/lib/contract-termination/resolvePolicy';
import { parseTerminationPolicySnapshot } from '@/lib/contract-termination/snapshot';
import type {
  ExceptionOverrideInput,
  SettlementDestination,
  TerminationCalculationStatus,
  TerminationPolicy,
  TerminationPolicyOriginKind,
  TerminationReceiptInput,
  TerminationSettlement,
} from '@/lib/contract-termination/types';
import {
  classifyFinanceReceiptForRelease,
  isLotReleaseSaleOperation,
  money2,
  type ReleaseLotMotiveCode,
} from '@/lib/finance/releaseLotShared';
import type { TerminationRefundSchedule } from '@/lib/termination-documents/types';
import { undefinedRefundSchedule } from '@/lib/termination-documents/refundSchedule';

export const SALE_RELEASE_SETTLEMENT_OPERATION_TYPES = [
  'desistencia',
  'distrato',
  'inadimplencia',
  'erro_cadastro',
  'cancelamento_administrativo',
] as const;

export type SaleReleaseSettlementOperationType =
  (typeof SALE_RELEASE_SETTLEMENT_OPERATION_TYPES)[number];

export type SaleReleaseSettlementStatus =
  | 'DRAFT'
  | 'CALCULATED'
  | 'EXECUTED'
  | 'FAILED_DOCUMENT'
  | 'VOID';

export type ReleaseSettlementOperatorInput = {
  hasImprovements: boolean;
  improvementsAppraisalStatus: ImprovementAppraisalStatus;
  improvementItems: ImprovementItemInput[];
  refundDestination: SettlementDestination;
  exceptionalAgreement: boolean;
  exceptionalReason: string | null;
  exceptionalRefundAmount: number | null;
  exceptionalRetentionPercent: number | null;
  refundFirstDueDate: string | null;
};

export type ReleaseReceiptSnapshotRow = TerminationReceiptInput & {
  id?: string | null;
  due_date?: string | null;
  bucket?: string;
};

export type ReleaseReceiptsSnapshot = {
  capturedAt: string;
  classified: ReturnType<typeof classifyTerminationReceipts>;
  overdue: {
    count: number;
    amount: number;
    receiptIds: string[];
    rows: ReleaseReceiptSnapshotRow[];
  };
  paid: { count: number; amount: number; receiptIds: string[] };
  pending: { count: number; receiptIds: string[] };
  canceled: { count: number; receiptIds: string[] };
};

export type PreparedReleaseSettlement = {
  operationType: SaleReleaseSettlementOperationType;
  policy: TerminationPolicy;
  policyOrigin: TerminationPolicyOriginKind;
  policySnapshot: Record<string, unknown>;
  receiptsSnapshot: ReleaseReceiptsSnapshot;
  settlement: TerminationSettlement;
  calculationStatus: TerminationCalculationStatus;
  improvementStatus: string | null;
  exceptionalAgreement: boolean;
  exceptionalReason: string | null;
  exceptionalRefundAmount: number | null;
  refundDestination: SettlementDestination;
  hasImprovements: boolean;
  improvements: ImprovementsRecord;
  obligation: CustomerObligationBreakdown;
  refundSchedule: TerminationRefundSchedule;
};

export type SaleReleaseSettlementRow = {
  id: string;
  sale_id: string;
  status: SaleReleaseSettlementStatus;
  calculation_status: string;
  operation_type: string;
  executed_at?: string | null;
};

export function isSaleReleaseSettlementOperation(
  code?: string | null,
): code is SaleReleaseSettlementOperationType {
  return SALE_RELEASE_SETTLEMENT_OPERATION_TYPES.includes(
    String(code || '').trim() as SaleReleaseSettlementOperationType,
  );
}

/** Só persiste contract_id se a linha de contracts foi carregada. Nunca usa blocks.contract_id. */
export function resolveSettlementContractId(
  contract?: { id?: unknown } | null,
): string | null {
  const id = contract?.id != null ? String(contract.id).trim() : '';
  return id || null;
}

export type SettlementDbErrorFields = {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
};

export function readSettlementDbError(error: unknown): SettlementDbErrorFields {
  const e = error as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const text = (value: unknown): string | null => {
    if (value == null) return null;
    const s = String(value).trim();
    return s || null;
  };
  return {
    message: text(e?.message) || String(error),
    code: text(e?.code),
    details: text(e?.details),
    hint: text(e?.hint),
  };
}

export class SettlementPersistError extends Error {
  db: SettlementDbErrorFields;
  constructor(prefix: string, error: unknown) {
    const db = readSettlementDbError(error);
    super(`${prefix}: ${db.message}`);
    this.name = 'SettlementPersistError';
    this.db = db;
  }
}

export function parseReleaseSettlementOperatorInput(
  body: Record<string, unknown>,
): ReleaseSettlementOperatorInput {
  const destRaw = String(body.refundDestination || body.destination || 'REFUND_CUSTOMER')
    .trim()
    .toUpperCase();
  const refundDestination: SettlementDestination =
    destRaw === 'CREDIT_OTHER_UNIT' ? 'CREDIT_OTHER_UNIT' : 'REFUND_CUSTOMER';
  const refundAmountRaw = body.exceptionalRefundAmount ?? body.exceptionRefundAmount;
  const retentionRaw = body.exceptionalRetentionPercent ?? body.exceptionRetentionPercent;
  const refundNum =
    refundAmountRaw == null || refundAmountRaw === ''
      ? null
      : Number(refundAmountRaw);
  const retentionNum =
    retentionRaw == null || retentionRaw === '' ? null : Number(retentionRaw);
  const improvementsFields = parseImprovementsOperatorFields(body);
  return {
    hasImprovements: improvementsFields.hasImprovements,
    improvementsAppraisalStatus: improvementsFields.improvementsAppraisalStatus,
    improvementItems: improvementsFields.improvementItems,
    refundDestination,
    exceptionalAgreement:
      body.exceptionalAgreement === true || body.exceptionOverride === true,
    exceptionalReason:
      body.exceptionalReason != null
        ? String(body.exceptionalReason).trim() || null
        : body.exceptionJustification != null
          ? String(body.exceptionJustification).trim() || null
          : null,
    exceptionalRefundAmount:
      refundNum != null && Number.isFinite(refundNum) ? refundNum : null,
    exceptionalRetentionPercent:
      retentionNum != null && Number.isFinite(retentionNum) ? retentionNum : null,
    refundFirstDueDate: (() => {
      const raw = body.refundFirstDueDate ?? body.firstDueDate;
      if (raw == null) return null;
      const s = String(raw).trim();
      return s || null;
    })(),
  };
}

export function validateReleaseSettlementOperatorInput(input: {
  motiveCode: string;
  operator: ReleaseSettlementOperatorInput;
}): { ok: true } | { ok: false; error: string; code: string } {
  const motive = String(input.motiveCode || '').trim();
  if (!isLotReleaseSaleOperation(motive) || !isSaleReleaseSettlementOperation(motive)) {
    return { ok: false, error: 'Operação de encerramento inválida.', code: 'MOTIVE_REQUIRED' };
  }
  if (input.operator.exceptionalAgreement && motive !== 'distrato') {
    return {
      ok: false,
      error: 'Condição excepcional é permitida somente no distrato.',
      code: 'EXCEPTION_NOT_ALLOWED',
    };
  }
  if (motive === 'distrato' && input.operator.exceptionalAgreement) {
    if (!input.operator.exceptionalReason || input.operator.exceptionalReason.length < 3) {
      return {
        ok: false,
        error: 'Informe a justificativa da condição excepcional do distrato.',
        code: 'EXCEPTION_JUSTIFICATION_REQUIRED',
      };
    }
    const hasAmount =
      input.operator.exceptionalRefundAmount != null &&
      Number.isFinite(input.operator.exceptionalRefundAmount);
    const hasPercent =
      input.operator.exceptionalRetentionPercent != null &&
      Number.isFinite(input.operator.exceptionalRetentionPercent);
    if (!hasAmount && !hasPercent) {
      return {
        ok: false,
        error: 'Informe o valor acordado ou o percentual de retenção excepcional.',
        code: 'EXCEPTION_VALUE_REQUIRED',
      };
    }
  }
  const improvementsCheck = validateImprovementsForRelease({
    hasImprovements: input.operator.hasImprovements,
    appraisalStatus: input.operator.improvementsAppraisalStatus,
    items: input.operator.improvementItems,
    destination: input.operator.refundDestination,
  });
  if (!improvementsCheck.ok) {
    return {
      ok: false,
      error: improvementsCheck.error,
      code: improvementsCheck.code,
    };
  }
  return { ok: true };
}

export function buildReleaseReceiptsSnapshot(
  receipts: ReleaseReceiptSnapshotRow[],
  capturedAt = new Date().toISOString(),
): ReleaseReceiptsSnapshot {
  const classified = classifyTerminationReceipts(receipts);
  const overdueRows: ReleaseReceiptSnapshotRow[] = [];
  const paidIds: string[] = [];
  const pendingIds: string[] = [];
  const canceledIds: string[] = [];
  let paidAmount = 0;
  let overdueAmount = 0;

  const today = new Date().toISOString().slice(0, 10);
  for (const row of receipts) {
    const bucket = classifyFinanceReceiptForRelease(row);
    const id = row.id ? String(row.id) : '';
    if (bucket === 'paid') {
      if (id) paidIds.push(id);
      paidAmount = money2(paidAmount + money2(row.paid_amount ?? row.amount));
      continue;
    }
    if (bucket === 'canceled') {
      if (id) canceledIds.push(id);
      continue;
    }
    const dueDate = row.due_date ? String(row.due_date).slice(0, 10) : '';
    const overdueByDate = Boolean(dueDate && dueDate < today);
    if (bucket === 'overdue' || overdueByDate) {
      overdueRows.push({ ...row, bucket: 'overdue' });
      overdueAmount = money2(overdueAmount + money2(row.amount));
      continue;
    }
    if (id) pendingIds.push(id);
  }

  const overdueIds = overdueRows
    .map((r) => (r.id ? String(r.id) : ''))
    .filter(Boolean);

  return {
    capturedAt,
    classified,
    overdue: {
      count: overdueRows.length,
      amount: overdueAmount,
      receiptIds: overdueIds,
      rows: overdueRows,
    },
    paid: { count: paidIds.length, amount: money2(paidAmount), receiptIds: paidIds },
    pending: { count: pendingIds.length, receiptIds: pendingIds },
    canceled: { count: canceledIds.length, receiptIds: canceledIds },
  };
}

function emptySettlement(
  policy: TerminationPolicy,
  destination: SettlementDestination,
  status: TerminationCalculationStatus,
  warnings: string[],
): TerminationSettlement {
  return {
    totalPaid: 0,
    entryPaid: 0,
    signalPaid: 0,
    installmentPaid: 0,
    otherPaid: 0,
    paidInstallmentCount: 0,
    nonRefundableAmount: 0,
    refundableBase: 0,
    contractualRetentionPercent: null,
    contractualRetentionAmount: 0,
    contractualRefundAmount: 0,
    agreedRefundAmount: null,
    refundInstallmentCount: null,
    calculationStatus: status,
    warnings,
    policyVersion: policy.policyVersion,
    policySource: policy.policySource,
    clauseReference: policy.clauseReference,
    catalogKey: policy.catalogKey,
    destination,
    creditOtherUnitAutomatic: false,
    exceptionApplied: false,
    isFinal: false,
  };
}

function policySnapshotForPersist(
  originKind: TerminationPolicyOriginKind,
  saleSnapshot: unknown,
  contractSnapshot: unknown,
  policy: TerminationPolicy,
): Record<string, unknown> {
  if (originKind === 'sale_snapshot') {
    const parsed = parseTerminationPolicySnapshot(saleSnapshot);
    if (parsed.ok) return parsed.snapshot as unknown as Record<string, unknown>;
  }
  if (originKind === 'contract_snapshot') {
    const parsed = parseTerminationPolicySnapshot(contractSnapshot);
    if (parsed.ok) return parsed.snapshot as unknown as Record<string, unknown>;
  }
  return {
    status: policy.status,
    policyVersion: policy.policyVersion,
    policySource: policy.policySource,
    catalogKey: policy.catalogKey,
    catalogLabel: policy.catalogLabel,
    clauseReference: policy.clauseReference,
    entryRefundable: policy.entryRefundable,
    signalRefundable: policy.signalRefundable,
    otherRefundable: policy.otherRefundable,
    contractualRetentionPercent: policy.contractualRetentionPercent,
    incompleteMessage: policy.incompleteMessage,
    inferred: originKind === 'legacy_inferred' || originKind === 'missing',
  };
}

function fillPaidTotals(
  settlement: TerminationSettlement,
  receipts: TerminationReceiptInput[],
): TerminationSettlement {
  const classified = classifyTerminationReceipts(receipts);
  const entryPaid = money2(
    classified.filter((r) => r.paid && r.kind === 'entry').reduce((a, r) => a + r.paidValue, 0),
  );
  const signalPaid = money2(
    classified.filter((r) => r.paid && r.kind === 'signal').reduce((a, r) => a + r.paidValue, 0),
  );
  const installmentPaid = money2(
    classified.filter((r) => r.paid && r.kind === 'installment').reduce((a, r) => a + r.paidValue, 0),
  );
  const otherPaid = money2(
    classified.filter((r) => r.paid && r.kind === 'other').reduce((a, r) => a + r.paidValue, 0),
  );
  return {
    ...settlement,
    totalPaid: money2(entryPaid + signalPaid + installmentPaid + otherPaid),
    entryPaid,
    signalPaid,
    installmentPaid,
    otherPaid,
    paidInstallmentCount: classified.filter((r) => r.paid && r.kind === 'installment').length,
  };
}

export function prepareReleaseSettlement(input: {
  motiveCode: ReleaseLotMotiveCode | string;
  receipts: ReleaseReceiptSnapshotRow[];
  saleSnapshot?: unknown;
  contractSnapshot?: unknown;
  salePersistSource?: string | null;
  contractPersistSource?: string | null;
  saleContractModel?: string | null;
  contractContractModel?: string | null;
  operator: ReleaseSettlementOperatorInput;
}): PreparedReleaseSettlement {
  const operationType = String(input.motiveCode || '').trim() as SaleReleaseSettlementOperationType;
  const resolved = resolveOperationalTerminationPolicy({
    saleSnapshot: input.saleSnapshot,
    contractSnapshot: input.contractSnapshot,
    salePersistSource: input.salePersistSource,
    contractPersistSource: input.contractPersistSource,
    saleContractModel: input.saleContractModel,
    contractContractModel: input.contractContractModel,
  });
  const receiptsSnapshot = buildReleaseReceiptsSnapshot(input.receipts);
  const policySnapshot = policySnapshotForPersist(
    resolved.origin.kind,
    input.saleSnapshot,
    input.contractSnapshot,
    resolved.policy,
  );

  const skipFinancialCalc =
    operationType === 'erro_cadastro' ||
    (operationType === 'cancelamento_administrativo' && receiptsSnapshot.paid.count === 0);

  if (skipFinancialCalc) {
    const base = fillPaidTotals(
      emptySettlement(
        resolved.policy,
        'REFUND_CUSTOMER',
        'NOT_APPLICABLE',
        operationType === 'erro_cadastro'
          ? ['Erro de cadastro: acerto financeiro de distrato não se aplica.']
          : ['Cancelamento administrativo sem pagamentos: acerto financeiro não se aplica.'],
      ),
      input.receipts,
    );
    return {
      operationType,
      policy: resolved.policy,
      policyOrigin: resolved.origin.kind,
      policySnapshot,
      receiptsSnapshot,
      settlement: base,
      calculationStatus: 'NOT_APPLICABLE',
      improvementStatus: null,
      exceptionalAgreement: false,
      exceptionalReason: null,
      exceptionalRefundAmount: null,
      refundDestination: 'REFUND_CUSTOMER',
      hasImprovements: false,
      improvements: emptyImprovementsRecord(),
      obligation: { contractualRefund: 0, improvementsTotal: 0, total: 0 },
      refundSchedule: undefinedRefundSchedule(null),
    };
  }

  const exceptionOverride: ExceptionOverrideInput | null =
    operationType === 'distrato' && input.operator.exceptionalAgreement
      ? {
          enabled: true,
          refundAmount: input.operator.exceptionalRefundAmount,
          retentionPercent: input.operator.exceptionalRetentionPercent,
          justification: input.operator.exceptionalReason,
        }
      : null;

  const improvements = buildImprovementsRecord({
    hasImprovements: input.operator.hasImprovements,
    appraisalStatus: input.operator.improvementsAppraisalStatus,
    items: input.operator.improvementItems,
  });

  const settlement = calculateTerminationSettlement({
    policy: resolved.policy,
    receipts: input.receipts,
    motiveCode: operationType,
    hasImprovements: engineHasImprovementsFlag({
      hasImprovements: input.operator.hasImprovements,
      improvementsAppraisalStatus: input.operator.improvementsAppraisalStatus,
    }),
    destination: input.operator.refundDestination,
    exceptionOverride,
  });

  const improvementStatus = improvementStatusForPersist(improvements);
  const obligation = buildCustomerObligation({
    contractualRefund:
      settlement.agreedRefundAmount != null
        ? settlement.agreedRefundAmount
        : settlement.contractualRefundAmount,
    improvements,
  });

  return {
    operationType,
    policy: resolved.policy,
    policyOrigin: resolved.origin.kind,
    policySnapshot,
    receiptsSnapshot,
    settlement,
    calculationStatus: settlement.calculationStatus,
    improvementStatus,
    exceptionalAgreement: Boolean(settlement.exceptionApplied),
    exceptionalReason: settlement.exceptionApplied ? input.operator.exceptionalReason : null,
    exceptionalRefundAmount: settlement.exceptionApplied
      ? settlement.agreedRefundAmount
      : null,
    refundDestination: settlement.destination,
    hasImprovements: input.operator.hasImprovements,
    improvements,
    obligation,
    refundSchedule: undefinedRefundSchedule(settlement.refundInstallmentCount),
  };
}

export async function loadActiveReleaseSettlement(
  admin: SupabaseClient,
  saleId: string,
): Promise<SaleReleaseSettlementRow | null> {
  const { data, error } = await admin
    .from('sale_release_settlements')
    .select('id, sale_id, status, calculation_status, operation_type, executed_at')
    .eq('sale_id', saleId)
    .in('status', ['CALCULATED', 'EXECUTED', 'FAILED_DOCUMENT'])
    .maybeSingle();
  if (error) {
    throw new SettlementPersistError('SETTLEMENT_LOAD_FAILED', error);
  }
  return (data as SaleReleaseSettlementRow) || null;
}

export async function upsertCalculatedReleaseSettlement(
  admin: SupabaseClient,
  params: {
    companyId: string;
    saleId: string;
    contractId: string | null;
    blockId: string;
    projectId: string | null;
    motiveLabel: string;
    motiveDetail: string | null;
    operatorUserId: string;
    idempotencyKey: string | null;
    prepared: PreparedReleaseSettlement;
    existingId?: string | null;
  },
): Promise<{ id: string; reused: boolean; status: SaleReleaseSettlementStatus }> {
  const s = params.prepared.settlement;
  const now = new Date().toISOString();
  const row = {
    company_id: params.companyId,
    tenant_id: params.companyId,
    sale_id: params.saleId,
    contract_id: params.contractId,
    block_id: params.blockId,
    project_id: params.projectId,
    operation_type: params.prepared.operationType,
    reason: params.motiveLabel,
    reason_detail: params.motiveDetail,
    status: 'CALCULATED' as const,
    policy_snapshot: params.prepared.policySnapshot,
    policy_origin: params.prepared.policyOrigin,
    calculation_snapshot: {
      ...s,
      refundSchedule: params.prepared.refundSchedule,
      improvements: params.prepared.improvements,
      obligation: params.prepared.obligation,
    },
    receipts_snapshot: params.prepared.receiptsSnapshot,
    total_paid: s.totalPaid,
    entry_amount: s.entryPaid,
    signal_amount: s.signalPaid,
    installment_paid: s.installmentPaid,
    other_paid: s.otherPaid,
    non_refundable_amount: s.nonRefundableAmount,
    refundable_base: s.refundableBase,
    retention_percent: s.contractualRetentionPercent,
    retention_amount: s.contractualRetentionAmount,
    contractual_refund_amount: s.contractualRefundAmount,
    agreed_refund_amount: s.agreedRefundAmount,
    refund_installments: s.refundInstallmentCount,
    refund_destination: params.prepared.refundDestination,
    credit_other_unit_id: null,
    has_improvements: params.prepared.hasImprovements,
    improvement_status: params.prepared.improvementStatus,
    exceptional_agreement: params.prepared.exceptionalAgreement,
    exceptional_reason: params.prepared.exceptionalReason,
    exceptional_refund_amount: params.prepared.exceptionalRefundAmount,
    calculation_status: params.prepared.calculationStatus,
    is_final: Boolean(s.isFinal),
    operator_user_id: params.operatorUserId,
    executed_at: null,
    idempotency_key: params.idempotencyKey,
    updated_at: now,
  };

  if (params.existingId) {
    const { data, error } = await admin
      .from('sale_release_settlements')
      .update(row)
      .eq('id', params.existingId)
      .eq('sale_id', params.saleId)
      .in('status', ['CALCULATED', 'FAILED_DOCUMENT'])
      .select('id, status')
      .maybeSingle();
    if (error) {
      throw new SettlementPersistError('SETTLEMENT_UPDATE_FAILED', error);
    }
    if (!data?.id) {
      const existing = await loadActiveReleaseSettlement(admin, params.saleId);
      if (existing?.status === 'EXECUTED') {
        return { id: existing.id, reused: true, status: 'EXECUTED' };
      }
      throw new Error('SETTLEMENT_UPDATE_FAILED: row not updatable');
    }
    return { id: params.existingId, reused: true, status: 'CALCULATED' };
  }

  const { data, error } = await admin
    .from('sale_release_settlements')
    .insert({ ...row, created_at: now })
    .select('id')
    .maybeSingle();

  if (error) {
    if (/duplicate|unique|sale_release_settlements_sale_active/i.test(error.message)) {
      const existing = await loadActiveReleaseSettlement(admin, params.saleId);
      if (existing?.status === 'EXECUTED') {
        return { id: existing.id, reused: true, status: 'EXECUTED' };
      }
      if (existing?.id) {
        return upsertCalculatedReleaseSettlement(admin, {
          ...params,
          existingId: existing.id,
        });
      }
    }
    throw new SettlementPersistError('SETTLEMENT_INSERT_FAILED', error);
  }
  if (!data?.id) {
    throw new Error('SETTLEMENT_INSERT_FAILED: empty id');
  }
  return { id: String(data.id), reused: false, status: 'CALCULATED' };
}

export async function markReleaseSettlementExecuted(
  admin: SupabaseClient,
  settlementId: string,
  saleId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from('sale_release_settlements')
    .update({
      status: 'EXECUTED',
      executed_at: now,
      updated_at: now,
    })
    .eq('id', settlementId)
    .eq('sale_id', saleId)
    .in('status', ['CALCULATED', 'FAILED_DOCUMENT']);
  if (error) {
    throw new SettlementPersistError('SETTLEMENT_EXECUTE_FAILED', error);
  }
}
