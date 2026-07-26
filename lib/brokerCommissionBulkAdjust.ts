/**
 * Ajuste em massa de broker_commissions — lógica pura (preview/apply).
 * Suporta PERCENT | FIXED | NONE. Não altera sales, parcelas, contratos nem
 * comissões pagas/conciliadas.
 */

import {
  isCanceledBrokerCommission,
  isPaidBrokerCommission,
  isPendingBrokerCommission,
  readBrokerCommissionPercent,
  resolveBrokerCommissionAmount,
  resolveSaleValueForCommission,
  type BrokerCommissionRow,
} from '@/lib/brokerCommission';
import {
  buildCommissionSnapshotFields,
  calculateBrokerCommissionPlan,
  inferModeFromCommissionRow,
  normalizeBrokerCommissionMode,
  readCommissionFixedAmount,
  type BrokerCommissionMode,
} from '@/lib/brokerCommissionMode';

export const BULK_ADJUST_CONFIRM_ZERO = 'ZERAR COMISSÕES';
export const BULK_ADJUST_CONFIRM_APPLY = 'APLICAR AJUSTE';
export const BULK_ADJUST_AUDIT_ACTION = 'BROKER_COMMISSIONS_BULK_UPDATED';

export type BulkAdjustIgnoreReason =
  | 'paid'
  | 'canceled'
  | 'already_zero'
  | 'cash_overlap'
  | 'filter_broker'
  | 'filter_project'
  | 'filter_date'
  | 'not_pending'
  | 'no_sale';

export type BulkAdjustFilters = {
  brokerIds?: string[] | null;
  projectId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  pendingOnly?: boolean;
};

export type BulkCommissionCandidate = BrokerCommissionRow & {
  id: string;
  company_id?: string | null;
  tenant_id?: string | null;
  sale?: Record<string, unknown> | null;
  broker_name?: string | null;
  customer_name?: string | null;
  project_name?: string | null;
  lot_label?: string | null;
  sale_date?: string | null;
  commission_mode?: string | null;
  commission_fixed_amount?: number | string | null;
  calculation_base?: number | string | null;
};

export type CashOverlapKey = {
  sale_id: string;
  broker_id: string;
};

export type BulkAdjustTarget = {
  mode: BrokerCommissionMode;
  percent?: number;
  fixedAmount?: number;
};

export type BulkAdjustRowPreview = {
  id: string;
  sale_id: string | null;
  broker_id: string | null;
  broker_name: string | null;
  customer_name: string | null;
  project_name: string | null;
  lot_label: string | null;
  sale_date: string | null;
  current_mode: BrokerCommissionMode;
  current_percent: number;
  current_fixed_amount: number;
  current_amount: number;
  new_mode: BrokerCommissionMode;
  new_percent: number;
  new_fixed_amount: number;
  new_amount: number;
  new_calculation_base: number | null;
  new_status: string;
  difference: number;
  eligible: boolean;
  ignore_reason?: BulkAdjustIgnoreReason;
};

export type BulkAdjustPreviewSummary = {
  eligible_count: number;
  ignored_count: number;
  ignored_by_reason: Partial<Record<BulkAdjustIgnoreReason, number>>;
  current_total: number;
  new_total: number;
  difference_total: number;
  sale_count: number;
  broker_count: number;
  target_mode: BrokerCommissionMode;
  rows: BulkAdjustRowPreview[];
  warnings: string[];
};

export type BulkCommissionPatch = {
  commission_percent: number;
  commission_mode: BrokerCommissionMode;
  commission_fixed_amount: number | null;
  calculation_base: number | null;
  amount: number;
  status: string;
  paid_at?: null;
};

export function normalizeBulkAdjustTarget(input: {
  mode?: string | null;
  newPercent?: number | string | null;
  newFixedAmount?: number | string | null;
}): BulkAdjustTarget {
  // Compat: se só vier percentual (API antiga), assume PERCENT.
  const rawMode = String(input.mode || '').trim();
  const mode = rawMode
    ? normalizeBrokerCommissionMode(rawMode)
    : 'PERCENT';
  return {
    mode,
    percent: readBrokerCommissionPercent(input.newPercent),
    fixedAmount: readCommissionFixedAmount(input.newFixedAmount),
  };
}

export function requiredConfirmText(
  targetOrPercent: BulkAdjustTarget | number,
): string {
  const target =
    typeof targetOrPercent === 'number'
      ? ({ mode: 'PERCENT' as const, percent: targetOrPercent })
      : targetOrPercent;
  if (target.mode === 'NONE') return BULK_ADJUST_CONFIRM_ZERO;
  if (target.mode === 'FIXED' && (target.fixedAmount || 0) <= 0) {
    return BULK_ADJUST_CONFIRM_ZERO;
  }
  if (target.mode === 'PERCENT' && (target.percent || 0) <= 0) {
    return BULK_ADJUST_CONFIRM_ZERO;
  }
  return BULK_ADJUST_CONFIRM_APPLY;
}

/** @deprecated Prefer requiredConfirmText(target). */
export function requiredConfirmTextForPercent(newPercent: number): string {
  return requiredConfirmText({ mode: 'PERCENT', percent: newPercent });
}

export function assertBulkAdjustConfirm(params: {
  target?: BulkAdjustTarget;
  newPercent?: number;
  confirmText?: string | null;
  confirmed?: boolean;
}): void {
  if (!params.confirmed) {
    throw new Error('Confirmação obrigatória (confirmed: true).');
  }
  const target =
    params.target ||
    ({ mode: 'PERCENT' as const, percent: params.newPercent || 0 });
  const expected = requiredConfirmText(target);
  if (String(params.confirmText || '').trim() !== expected) {
    throw new Error(`Digite exatamente: ${expected}`);
  }
}

export function buildBulkCommissionPatch(params: {
  sale: Record<string, unknown> | null | undefined;
  target?: BulkAdjustTarget;
  newPercent?: number;
}): BulkCommissionPatch {
  const target =
    params.target ||
    ({ mode: 'PERCENT' as const, percent: params.newPercent || 0 });
  const saleValue = resolveSaleValueForCommission(params.sale);
  const plan = calculateBrokerCommissionPlan({
    mode: target.mode,
    percent: target.percent,
    fixedAmount: target.fixedAmount,
    saleValue,
  });
  const snapshot = buildCommissionSnapshotFields(plan);
  if (plan.mode === 'NONE' || plan.amount <= 0) {
    const zero = buildCommissionSnapshotFields(
      calculateBrokerCommissionPlan({
        mode: 'NONE',
        percent: 0,
        fixedAmount: 0,
        saleValue: 0,
      }),
    );
    return {
      ...zero,
      status: 'cancelado',
      paid_at: null,
    };
  }
  return {
    ...snapshot,
    status: 'pendente',
  };
}

export function cashOverlapKey(
  saleId?: string | null,
  brokerId?: string | null,
): string | null {
  if (!saleId || !brokerId) return null;
  return `${saleId}::${brokerId}`;
}

export function isActiveCommissionCashOut(row: {
  type?: string | null;
  status?: string | null;
  category?: string | null;
  description?: string | null;
}): boolean {
  const type = String(row.type || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const status = String(row.status || 'ativo').trim().toLowerCase();
  if (status === 'estornado' || status === 'cancelado' || status === 'inativo') {
    return false;
  }
  if (!['saida', 'despesa', 'expense', 'commission', 'comissao'].includes(type)) {
    return false;
  }
  const cat = String(row.category || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const desc = String(row.description || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    cat.includes('comiss') ||
    desc.includes('comiss') ||
    cat === 'commission' ||
    desc.includes('pagamento de comiss')
  );
}

function saleDateIso(candidate: BulkCommissionCandidate): string | null {
  if (candidate.sale_date) return String(candidate.sale_date).slice(0, 10);
  const sale = candidate.sale;
  if (!sale) return null;
  const raw = sale.sale_date || sale.created_at;
  if (!raw) return null;
  return String(raw).slice(0, 10);
}

function matchesDateFilter(
  saleDate: string | null,
  dateFrom?: string | null,
  dateTo?: string | null,
): boolean {
  if (!dateFrom && !dateTo) return true;
  if (!saleDate) return false;
  if (dateFrom && saleDate < String(dateFrom).slice(0, 10)) return false;
  if (dateTo && saleDate > String(dateTo).slice(0, 10)) return false;
  return true;
}

function hasMonetaryCommission(row: BrokerCommissionRow): boolean {
  const amount = resolveBrokerCommissionAmount(row);
  const percent = readBrokerCommissionPercent(row.commission_percent);
  const fixed = readCommissionFixedAmount(
    (row as BulkCommissionCandidate).commission_fixed_amount,
  );
  return amount > 0 || percent > 0 || fixed > 0;
}

export function classifyBulkCommissionRow(params: {
  row: BulkCommissionCandidate;
  filters: BulkAdjustFilters;
  target?: BulkAdjustTarget;
  newPercent?: number;
  cashOverlapKeys: Set<string>;
}): BulkAdjustRowPreview {
  const target =
    params.target ||
    ({ mode: 'PERCENT' as const, percent: params.newPercent || 0 });
  const { row, filters, cashOverlapKeys } = params;
  const saleId = row.sale_id ? String(row.sale_id) : null;
  const brokerId = row.broker_id ? String(row.broker_id) : null;
  const currentAmount = resolveBrokerCommissionAmount(row);
  const currentPercent = readBrokerCommissionPercent(row.commission_percent);
  const currentFixed = readCommissionFixedAmount(row.commission_fixed_amount);
  const currentMode = inferModeFromCommissionRow(row);
  const patch = buildBulkCommissionPatch({
    sale: row.sale,
    target,
  });
  const saleDate = saleDateIso(row);
  const projectId = row.sale?.project_id ? String(row.sale.project_id) : null;

  const base: Omit<BulkAdjustRowPreview, 'eligible' | 'ignore_reason'> = {
    id: row.id,
    sale_id: saleId,
    broker_id: brokerId,
    broker_name: row.broker_name ?? null,
    customer_name: row.customer_name ?? null,
    project_name: row.project_name ?? null,
    lot_label: row.lot_label ?? null,
    sale_date: saleDate,
    current_mode: currentMode,
    current_percent: currentPercent,
    current_fixed_amount: currentFixed,
    current_amount: currentAmount,
    new_mode: patch.commission_mode,
    new_percent: patch.commission_percent,
    new_fixed_amount: patch.commission_fixed_amount ?? 0,
    new_amount: patch.amount,
    new_calculation_base: patch.calculation_base,
    new_status: patch.status,
    difference: Math.round((patch.amount - currentAmount) * 100) / 100,
  };

  const brokerFilter = (filters.brokerIds || []).filter(Boolean);
  if (brokerFilter.length > 0 && (!brokerId || !brokerFilter.includes(brokerId))) {
    return { ...base, eligible: false, ignore_reason: 'filter_broker' };
  }

  if (filters.projectId && projectId !== String(filters.projectId)) {
    return { ...base, eligible: false, ignore_reason: 'filter_project' };
  }

  if (!matchesDateFilter(saleDate, filters.dateFrom, filters.dateTo)) {
    return { ...base, eligible: false, ignore_reason: 'filter_date' };
  }

  if (!saleId || !row.sale) {
    return { ...base, eligible: false, ignore_reason: 'no_sale' };
  }

  if (isPaidBrokerCommission(row.status)) {
    return { ...base, eligible: false, ignore_reason: 'paid' };
  }

  if (isCanceledBrokerCommission(row.status)) {
    return { ...base, eligible: false, ignore_reason: 'canceled' };
  }

  const pendingOnly = filters.pendingOnly !== false;
  if (pendingOnly && !isPendingBrokerCommission(row.status)) {
    return { ...base, eligible: false, ignore_reason: 'not_pending' };
  }

  if (!hasMonetaryCommission(row) && target.mode !== 'FIXED' && target.mode !== 'PERCENT') {
    return { ...base, eligible: false, ignore_reason: 'already_zero' };
  }
  if (!hasMonetaryCommission(row) && patch.amount <= 0) {
    return { ...base, eligible: false, ignore_reason: 'already_zero' };
  }

  const key = cashOverlapKey(saleId, brokerId);
  if (key && cashOverlapKeys.has(key)) {
    return { ...base, eligible: false, ignore_reason: 'cash_overlap' };
  }

  return { ...base, eligible: true };
}

export function buildBulkAdjustPreview(params: {
  rows: BulkCommissionCandidate[];
  filters: BulkAdjustFilters;
  target?: BulkAdjustTarget;
  newPercent?: number;
  cashOverlapKeys: Set<string>;
}): BulkAdjustPreviewSummary {
  const target =
    params.target ||
    ({ mode: 'PERCENT' as const, percent: params.newPercent || 0 });
  const classified = params.rows.map((row) =>
    classifyBulkCommissionRow({
      row,
      filters: params.filters,
      target,
      cashOverlapKeys: params.cashOverlapKeys,
    }),
  );

  const eligible = classified.filter((r) => r.eligible);
  const ignored = classified.filter((r) => !r.eligible);
  const ignored_by_reason: Partial<Record<BulkAdjustIgnoreReason, number>> = {};
  for (const row of ignored) {
    if (!row.ignore_reason) continue;
    ignored_by_reason[row.ignore_reason] =
      (ignored_by_reason[row.ignore_reason] || 0) + 1;
  }

  const warnings: string[] = [];
  if ((ignored_by_reason.paid || 0) > 0) {
    warnings.push(
      `${ignored_by_reason.paid} comissão(ões) paga(s) serão preservadas (sem alteração).`,
    );
  }
  if ((ignored_by_reason.cash_overlap || 0) > 0) {
    warnings.push(
      `${ignored_by_reason.cash_overlap} pendente(s) com saída de caixa ativa serão ignoradas.`,
    );
  }
  if ((ignored_by_reason.canceled || 0) > 0) {
    warnings.push(`${ignored_by_reason.canceled} cancelada(s) ignoradas.`);
  }

  const saleIds = new Set(eligible.map((r) => r.sale_id).filter(Boolean));
  const brokerIds = new Set(eligible.map((r) => r.broker_id).filter(Boolean));
  const current_total = eligible.reduce((s, r) => s + r.current_amount, 0);
  const new_total = eligible.reduce((s, r) => s + r.new_amount, 0);

  return {
    eligible_count: eligible.length,
    ignored_count: ignored.length,
    ignored_by_reason,
    current_total,
    new_total,
    difference_total: Math.round((new_total - current_total) * 100) / 100,
    sale_count: saleIds.size,
    broker_count: brokerIds.size,
    target_mode: target.mode,
    rows: classified,
    warnings,
  };
}

export function eligibleIdsFromPreview(preview: BulkAdjustPreviewSummary): string[] {
  return preview.rows.filter((r) => r.eligible).map((r) => r.id);
}

/** Agrupa patches idênticos para UPDATE ... WHERE id IN (...). */
export function groupEligiblePatches(
  preview: BulkAdjustPreviewSummary,
): Array<{ ids: string[]; patch: BulkCommissionPatch }> {
  const map = new Map<string, { ids: string[]; patch: BulkCommissionPatch }>();
  for (const row of preview.rows) {
    if (!row.eligible) continue;
    const patch: BulkCommissionPatch = {
      ...buildCommissionSnapshotFields({
        mode: row.new_mode,
        percent: row.new_percent,
        fixedAmount: row.new_fixed_amount,
        calculationBase: row.new_calculation_base ?? 0,
        amount: row.new_amount,
      }),
      status: row.new_status,
      ...(row.new_amount <= 0 ? { paid_at: null } : {}),
    };

    const key = `${patch.commission_mode}|${patch.commission_percent}|${patch.commission_fixed_amount}|${patch.calculation_base}|${patch.amount}|${patch.status}`;
    const existing = map.get(key);
    if (existing) {
      existing.ids.push(row.id);
    } else {
      map.set(key, { ids: [row.id], patch });
    }
  }
  return Array.from(map.values());
}

export function buildCashOverlapKeySet(
  movements: Array<{
    sale_id?: string | null;
    broker_id?: string | null;
    type?: string | null;
    status?: string | null;
    category?: string | null;
    description?: string | null;
  }>,
): Set<string> {
  const keys = new Set<string>();
  for (const m of movements) {
    if (!isActiveCommissionCashOut(m)) continue;
    const key = cashOverlapKey(m.sale_id, m.broker_id);
    if (key) keys.add(key);
  }
  return keys;
}
