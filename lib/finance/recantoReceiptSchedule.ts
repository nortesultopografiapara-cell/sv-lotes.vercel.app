/**
 * Compatibilidade dos recebíveis do sinal separado.
 * schedule_group ausente ou nulo continua sendo venda antiga.
 * Não emite cobrança e não grava banco.
 */

import {
  RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED,
  RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED,
} from '@/lib/recantoSeparateSignalPersistence';

export const SEPARATE_SIGNAL_CHARGE_BLOCKED_MESSAGE =
  'A emissão de boletos e Pix do sinal separado permanece bloqueada até a cobrança distinguir sinal e lote.';

export const SEPARATE_SIGNAL_RECALC_BLOCKED_MESSAGE =
  'A edição financeira do sinal separado ainda não está disponível. Parcelas do sinal e do lote não são recalculadas juntas.';

export const SEPARATE_SIGNAL_RELEASE_BLOCKED_MESSAGE =
  'O distrato do sinal separado ainda não separa sinal recebido, sinal pendente e saldo do lote. Esta liberação permanece bloqueada.';

export const AMBIGUOUS_INSTALLMENT_MESSAGE =
  'Há parcela de sinal e parcela de lote com o mesmo número. Use o id do recebível ou o grupo.';

export type ReceiptScheduleGroup = 'SIGNAL' | 'LOT' | 'LEGACY';

export type ScheduleReceiptRef = {
  id?: string | null;
  sale_id?: string | null;
  saleId?: string | null;
  schedule_group?: string | null;
  scheduleGroup?: string | null;
  installment_number?: number | string | null;
  installmentNumber?: number | string | null;
  amount?: number | string | null;
  amountCents?: number | null;
  paid_amount?: number | string | null;
  paidAmountCents?: number | null;
  status?: string | null;
  due_date?: string | null;
  dueDate?: string | null;
  paid_at?: string | null;
  settlementEventId?: string | null;
};

export function separateSignalConsumersEnabled(): boolean {
  return Boolean(RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED && RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED);
}

export function isMissingScheduleGroupColumn(error: { message?: string } | null | undefined): boolean {
  return /schedule_group/i.test(String(error?.message || ''));
}

export function withScheduleGroupColumn(columns: string): string {
  const trimmed = columns.trim();
  if (trimmed === '*' || /(^|,\s*)schedule_group(\s*,|$)/i.test(trimmed.replace(/\s+/g, ' '))) {
    return columns;
  }
  return `${trimmed}, schedule_group`;
}

export function mergeScheduleGroups<T extends { id?: string | null }>(
  rows: T[],
  groups: Array<{ id?: string | null; schedule_group?: string | null }> | null,
): Array<T & { schedule_group: string | null }> {
  if (!groups) return rows.map((row) => ({ ...row, schedule_group: null }));
  const byId = new Map(groups.map((group) => [String(group.id || ''), group.schedule_group ?? null]));
  return rows.map((row) => ({
    ...row,
    schedule_group: byId.get(String(row.id || '')) ?? null,
  }));
}

export function readReceiptScheduleGroup(row: ScheduleReceiptRef | null | undefined): ReceiptScheduleGroup {
  const raw = String(row?.schedule_group ?? row?.scheduleGroup ?? '').trim().toUpperCase();
  if (raw === 'SIGNAL' || raw === 'LOT') return raw;
  return 'LEGACY';
}

export function saleHasSeparateSchedule(rows: ScheduleReceiptRef[]): boolean {
  return rows.some((row) => readReceiptScheduleGroup(row) !== 'LEGACY');
}

function saleOf(row: ScheduleReceiptRef): string {
  return String(row.sale_id ?? row.saleId ?? '').trim();
}

function numberOf(row: ScheduleReceiptRef): number {
  return Number(row.installment_number ?? row.installmentNumber);
}

export function receiptLogicalKey(row: ScheduleReceiptRef): string {
  const group = readReceiptScheduleGroup(row);
  return `${group}:${saleOf(row)}:${numberOf(row)}`;
}

export function findReceiptById<T extends ScheduleReceiptRef>(rows: T[], receiptId: string): T | null {
  const id = String(receiptId || '').trim();
  if (!id) return null;
  return rows.find((row) => String(row.id || '') === id) ?? null;
}

export function findReceiptByLogicalSlot<T extends ScheduleReceiptRef>(
  rows: T[],
  input: { saleId: string; group: ReceiptScheduleGroup; installmentNumber: number },
): T | null {
  return rows.find((row) =>
    saleOf(row) === input.saleId
    && readReceiptScheduleGroup(row) === input.group
    && numberOf(row) === input.installmentNumber,
  ) ?? null;
}

export function findReceiptByInstallmentNumber<T extends ScheduleReceiptRef>(
  rows: T[],
  saleId: string,
  installmentNumber: number,
): T | null {
  const matches = rows.filter((row) => saleOf(row) === saleId && numberOf(row) === installmentNumber);
  const groups = new Set(matches.map((row) => readReceiptScheduleGroup(row)));
  if (groups.size > 1) {
    throw new Error(AMBIGUOUS_INSTALLMENT_MESSAGE);
  }
  return matches[0] ?? null;
}

export function separateScheduleChargeAllowed(row: ScheduleReceiptRef): boolean {
  return readReceiptScheduleGroup(row) === 'LEGACY';
}

export function assertSeparateScheduleChargeAllowed(row: ScheduleReceiptRef): void {
  if (!separateScheduleChargeAllowed(row)) {
    throw new Error(SEPARATE_SIGNAL_CHARGE_BLOCKED_MESSAGE);
  }
}

export function assertNoActiveChargeForReceipt(
  charges: Array<{ receiptId: string; active: boolean }>,
  receiptId: string,
): void {
  const id = String(receiptId || '').trim();
  if (charges.some((charge) => charge.active && charge.receiptId === id)) {
    throw new Error('Esta parcela já possui cobrança ativa.');
  }
}

export function assertSeparateScheduleRecalcSupported(rows: ScheduleReceiptRef[]): void {
  if (saleHasSeparateSchedule(rows)) {
    throw new Error(SEPARATE_SIGNAL_RECALC_BLOCKED_MESSAGE);
  }
}

export function assertSeparateScheduleReleaseSupported(rows: ScheduleReceiptRef[]): void {
  if (saleHasSeparateSchedule(rows)) {
    throw new Error(SEPARATE_SIGNAL_RELEASE_BLOCKED_MESSAGE);
  }
}

export function assertSettlementTargetsReceipt(
  chargeReceiptId: string | null | undefined,
  receiptId: string | null | undefined,
): void {
  const chargeId = String(chargeReceiptId || '').trim();
  const targetId = String(receiptId || '').trim();
  if (!chargeId || !targetId || chargeId !== targetId) {
    throw new Error('A baixa precisa do id do recebível vinculado à cobrança.');
  }
}

function centsOf(row: ScheduleReceiptRef): number {
  if (Number.isInteger(row.amountCents)) return Number(row.amountCents);
  const amount = Number(row.amount);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function paidCentsOf(row: ScheduleReceiptRef): number {
  if (Number.isInteger(row.paidAmountCents)) return Number(row.paidAmountCents);
  const paid = Number(row.paid_amount);
  if (Number.isFinite(paid) && paid > 0) return Math.round(paid * 100);
  return centsOf(row);
}

function isPaid(row: ScheduleReceiptRef): boolean {
  const status = String(row.status || '').toLowerCase();
  return status === 'pago' || status === 'paid' || Boolean(row.paid_at);
}

function isCancelled(row: ScheduleReceiptRef): boolean {
  const status = String(row.status || '').toLowerCase();
  return status === 'cancelado' || status === 'cancelled' || status === 'canceled';
}

export type ScheduleMoneySummary = {
  signalReceivedCents: number;
  signalPendingCents: number;
  signalOverdueCents: number;
  lotReceivedCents: number;
  lotPendingCents: number;
  lotOverdueCents: number;
  legacyReceivedCents: number;
  legacyPendingCents: number;
  legacyOverdueCents: number;
  totalReceivedCents: number;
  totalPendingCents: number;
};

export function summarizeReceiptSchedules(
  rows: ScheduleReceiptRef[],
  today = '2026-11-05',
): ScheduleMoneySummary {
  const summary: ScheduleMoneySummary = {
    signalReceivedCents: 0,
    signalPendingCents: 0,
    signalOverdueCents: 0,
    lotReceivedCents: 0,
    lotPendingCents: 0,
    lotOverdueCents: 0,
    legacyReceivedCents: 0,
    legacyPendingCents: 0,
    legacyOverdueCents: 0,
    totalReceivedCents: 0,
    totalPendingCents: 0,
  };
  for (const row of rows) {
    if (isCancelled(row)) continue;
    const group = readReceiptScheduleGroup(row);
    const amount = centsOf(row);
    const received = isPaid(row);
    const due = String(row.due_date ?? row.dueDate ?? '').slice(0, 10);
    const overdue = !received && Boolean(due) && due < today;
    const paid = received ? paidCentsOf(row) : 0;
    if (group === 'SIGNAL') {
      if (received) summary.signalReceivedCents += paid;
      else {
        summary.signalPendingCents += amount;
        if (overdue) summary.signalOverdueCents += amount;
      }
    } else if (group === 'LOT') {
      if (received) summary.lotReceivedCents += paid;
      else {
        summary.lotPendingCents += amount;
        if (overdue) summary.lotOverdueCents += amount;
      }
    } else if (received) {
      summary.legacyReceivedCents += paid;
    } else {
      summary.legacyPendingCents += amount;
      if (overdue) summary.legacyOverdueCents += amount;
    }
    if (received) summary.totalReceivedCents += paid;
    else summary.totalPendingCents += amount;
  }
  return summary;
}

export function distratoScheduleBalances(rows: ScheduleReceiptRef[]): {
  blocked: boolean;
  message: string | null;
  signalReceivedCents: number;
  signalPendingCents: number;
  lotReceivedCents: number;
  lotPendingCents: number;
  legacyReceivedCents: number;
  legacyPendingCents: number;
} {
  const summary = summarizeReceiptSchedules(rows);
  const blocked = saleHasSeparateSchedule(rows);
  return {
    blocked,
    message: blocked ? SEPARATE_SIGNAL_RELEASE_BLOCKED_MESSAGE : null,
    signalReceivedCents: summary.signalReceivedCents,
    signalPendingCents: summary.signalPendingCents,
    lotReceivedCents: summary.lotReceivedCents,
    lotPendingCents: summary.lotPendingCents,
    legacyReceivedCents: summary.legacyReceivedCents,
    legacyPendingCents: summary.legacyPendingCents,
  };
}

export type SettledReceipt = ScheduleReceiptRef & {
  id: string;
  status: string;
  paidAmountCents: number;
  settlementEventId: string | null;
};

export function settleReceiptById(
  rows: SettledReceipt[],
  input: { receiptId: string; eventId: string; amountCents?: number },
): { receipts: SettledReceipt[]; duplicate: boolean; cashEntries: number } {
  const target = findReceiptById(rows, input.receiptId);
  if (!target) throw new Error('Recebível não encontrado.');
  if (target.settlementEventId && target.settlementEventId === input.eventId) {
    return { receipts: rows, duplicate: true, cashEntries: 0 };
  }
  if (isPaid(target)) {
    return { receipts: rows, duplicate: true, cashEntries: 0 };
  }
  const amount = Number.isInteger(input.amountCents) ? Number(input.amountCents) : centsOf(target);
  const receipts = rows.map((row) => {
    if (String(row.id) !== String(target.id)) return row;
    return {
      ...row,
      status: 'pago',
      paidAmountCents: amount,
      paid_amount: amount / 100,
      settlementEventId: input.eventId,
    };
  });
  return { receipts, duplicate: false, cashEntries: 1 };
}

export function cashFlowFromSeparateSale(input: {
  receipts: ScheduleReceiptRef[];
  manualOutflowsCents?: number[];
  paidCommissionCents?: number[];
}): { entriesCents: number; exitsCents: number; commissionEntries: number } {
  const summary = summarizeReceiptSchedules(input.receipts);
  const manual = (input.manualOutflowsCents ?? []).reduce((sum, value) => sum + value, 0);
  const commissions = input.paidCommissionCents ?? [];
  const unmatchedCommissions = commissions.filter((amount) =>
    !(input.manualOutflowsCents ?? []).some((outflow) => outflow === amount),
  );
  return {
    entriesCents: summary.totalReceivedCents,
    exitsCents: manual + unmatchedCommissions.reduce((sum, value) => sum + value, 0),
    commissionEntries: 0,
  };
}
