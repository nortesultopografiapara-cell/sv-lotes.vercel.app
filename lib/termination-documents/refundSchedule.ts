/**
 * Desdobramento operacional do valor líquido já calculado.
 * Não recalcula retenção, entrada, base nem quantidade de parcelas.
 */

import { roundMoney } from '@/lib/contract-termination/calculateSettlement';
import type { TerminationRefundSchedule } from '@/lib/termination-documents/types';

export type RefundScheduleResolveInput = {
  destination?: string | null;
  agreedRefundAmount?: number | null;
  contractualRefundAmount?: number | null;
  installmentCount?: number | null;
  calculationStatus?: string | null;
  firstDueDate?: string | null;
};

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

export function isIsoDateOnly(value: string | null | undefined): boolean {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function addCalendarMonths(isoDate: string, months: number): string {
  if (!isIsoDateOnly(isoDate)) {
    throw new Error('REFUND_SCHEDULE_INVALID_DATE');
  }
  const [y, m, d] = isoDate.split('-').map(Number);
  const total = y * 12 + (m - 1) + Math.trunc(months);
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatIsoDateBr(isoDate: string | null | undefined): string {
  const raw = String(isoDate || '').trim();
  if (!isIsoDateOnly(raw)) return '—';
  const [y, m, d] = raw.split('-');
  return `${d}/${m}/${y}`;
}

export function restitutionTotalFromSettlement(input: {
  agreedRefundAmount?: number | null;
  contractualRefundAmount?: number | null;
}): number {
  if (input.agreedRefundAmount != null && Number.isFinite(Number(input.agreedRefundAmount))) {
    return roundMoney(Number(input.agreedRefundAmount));
  }
  if (
    input.contractualRefundAmount != null &&
    Number.isFinite(Number(input.contractualRefundAmount))
  ) {
    return roundMoney(Number(input.contractualRefundAmount));
  }
  return 0;
}

export function splitRefundInstallmentAmounts(total: number, count: number): number[] {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n <= 0) return [];
  const cents = Math.round(roundMoney(total) * 100);
  const base = Math.floor(cents / n);
  const remainder = cents - base * n;
  return Array.from({ length: n }, (_, index) => {
    const extra = index === n - 1 ? remainder : 0;
    return roundMoney((base + extra) / 100);
  });
}

export function undefinedRefundSchedule(
  installmentCount?: number | null,
): Extract<TerminationRefundSchedule, { defined: false }> {
  const n =
    installmentCount == null || !Number.isFinite(Number(installmentCount))
      ? null
      : Math.max(0, Math.floor(Number(installmentCount)));
  return {
    defined: false,
    installmentCount: n,
    installments: [],
  };
}

/** Cronograma em dinheiro só é obrigatório com acerto fechado (CALCULATED) e restituição ao cliente. */
export function shouldDefineRefundSchedule(input: RefundScheduleResolveInput): boolean {
  const dest = String(input.destination || 'REFUND_CUSTOMER').trim().toUpperCase();
  if (dest === 'CREDIT_OTHER_UNIT') return false;
  const status = String(input.calculationStatus || '').trim().toUpperCase();
  if (status !== 'CALCULATED') return false;
  const total = restitutionTotalFromSettlement(input);
  const count = Math.max(0, Math.floor(Number(input.installmentCount) || 0));
  return total > 0 && count > 0;
}

export function resolveRefundSchedule(
  input: RefundScheduleResolveInput,
):
  | { ok: true; schedule: TerminationRefundSchedule }
  | { ok: false; error: string; code: string } {
  const countRaw =
    input.installmentCount == null || !Number.isFinite(Number(input.installmentCount))
      ? null
      : Math.max(0, Math.floor(Number(input.installmentCount)));
  if (!shouldDefineRefundSchedule(input)) {
    return { ok: true, schedule: undefinedRefundSchedule(countRaw) };
  }
  const firstDueDate = String(input.firstDueDate || '').trim();
  if (!isIsoDateOnly(firstDueDate)) {
    return {
      ok: false,
      error: 'Informe o vencimento da 1ª parcela de restituição.',
      code: 'REFUND_SCHEDULE_DATE_REQUIRED',
    };
  }
  const total = restitutionTotalFromSettlement(input);
  const count = countRaw || 0;
  const amounts = splitRefundInstallmentAmounts(total, count);
  const installments = amounts.map((amount, index) => ({
    number: index + 1,
    dueDate: addCalendarMonths(firstDueDate, index),
    amount,
  }));
  const sum = roundMoney(installments.reduce((acc, row) => acc + row.amount, 0));
  if (sum !== roundMoney(total)) {
    return {
      ok: false,
      error: 'A soma das parcelas de restituição não confere com o valor acordado.',
      code: 'REFUND_SCHEDULE_SUM_MISMATCH',
    };
  }
  return {
    ok: true,
    schedule: {
      defined: true,
      installmentCount: count,
      firstDueDate,
      frequency: 'MONTHLY',
      installments,
    },
  };
}

export function parseRefundSchedule(raw: unknown): TerminationRefundSchedule | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as {
    defined?: unknown;
    installmentCount?: unknown;
    firstDueDate?: unknown;
    frequency?: unknown;
    installments?: unknown;
  };
  if (row.defined !== true) {
    const count =
      row.installmentCount == null || !Number.isFinite(Number(row.installmentCount))
        ? null
        : Math.max(0, Math.floor(Number(row.installmentCount)));
    return {
      defined: false,
      installmentCount: count,
      installments: [],
    };
  }
  if (!Array.isArray(row.installments) || row.installments.length === 0) return null;
  if (!isIsoDateOnly(String(row.firstDueDate || ''))) return null;
  const installments = row.installments.map((item, index) => {
    const rec = item as { number?: unknown; dueDate?: unknown; amount?: unknown };
    return {
      number: Math.max(1, Math.floor(Number(rec.number) || index + 1)),
      dueDate: String(rec.dueDate || ''),
      amount: roundMoney(Number(rec.amount) || 0),
    };
  });
  if (installments.some((item) => !isIsoDateOnly(item.dueDate))) return null;
  return {
    defined: true,
    installmentCount: Math.max(
      installments.length,
      Math.floor(Number(row.installmentCount) || installments.length),
    ),
    firstDueDate: String(row.firstDueDate),
    frequency: 'MONTHLY',
    installments,
  };
}

export function parseRefundScheduleFromCalculationSnapshot(
  calculationSnapshot: unknown,
): TerminationRefundSchedule | null {
  if (!calculationSnapshot || typeof calculationSnapshot !== 'object') return null;
  const rec = calculationSnapshot as { refundSchedule?: unknown };
  return parseRefundSchedule(rec.refundSchedule);
}
