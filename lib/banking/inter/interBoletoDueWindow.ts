/**
 * Janela de antecedência do Banco Inter para boletos.
 * A API rejeita vencimento com 1000 dias ou mais a partir da emissão:
 * "A data de vencimento do documento deve ser menor do que 1000 dias da data de emissão!"
 *
 * Não altera valores nem vencimentos contratuais. Parcelas fora da janela
 * ficam AGUARDANDO_JANELA_BANCARIA até a data efetiva de emissão caber no limite.
 */

import { BRAZIL_TIMEZONE, todayBrazilIsoDate } from '@/lib/companySubscriptionDates';

/** Limite bancário (estritamente menor que este número de dias). */
export const INTER_BOLETO_MAX_ADVANCE_DAYS = 1000;
/** Folga para fuso, virada de dia e relógio do banco. */
export const INTER_BOLETO_ADVANCE_SAFETY_DAYS = 7;
/** Máximo efetivo: days(emissão, vencimento) < 993. */
export const INTER_BOLETO_EFFECTIVE_MAX_ADVANCE_DAYS =
  INTER_BOLETO_MAX_ADVANCE_DAYS - INTER_BOLETO_ADVANCE_SAFETY_DAYS;

export const INTER_WAITING_BANK_WINDOW_CODE = 'AGUARDANDO_JANELA_BANCARIA';

export class InterBoletoWaitingWindowError extends Error {
  readonly code = INTER_WAITING_BANK_WINDOW_CODE;
  readonly daysUntilDue: number | null;
  readonly emitDate: string;
  readonly dueDate: string | null;

  constructor(message: string, meta?: { daysUntilDue?: number | null; emitDate: string; dueDate: string | null }) {
    super(message);
    this.name = 'InterBoletoWaitingWindowError';
    this.daysUntilDue = meta?.daysUntilDue ?? null;
    this.emitDate = meta?.emitDate || '';
    this.dueDate = meta?.dueDate ?? null;
  }
}

export function parseIsoDateOnly(value: string | null | undefined): string | null {
  const raw = String(value || '')
    .trim()
    .slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function isoDateFromMs(ms: number, timeZone: string = BRAZIL_TIMEZONE): string {
  if (!Number.isFinite(ms)) return todayBrazilIsoDate();
  return new Date(ms).toLocaleDateString('en-CA', { timeZone });
}

export function addCalendarDaysIso(iso: string, days: number): string {
  const parsed = parseIsoDateOnly(iso);
  if (!parsed) return iso;
  const [year, month, day] = parsed.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function calendarDaysBetween(fromIso: string, toIso: string): number | null {
  const from = parseIsoDateOnly(fromIso);
  const to = parseIsoDateOnly(toIso);
  if (!from || !to) return null;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  return Math.round((end - start) / 86_400_000);
}

export function resolveInterBoletoEmitDate(params?: {
  emitDate?: string | null;
  nowMs?: number;
}): string {
  return parseIsoDateOnly(params?.emitDate) || isoDateFromMs(params?.nowMs ?? Date.now());
}

/**
 * Banco: vencimento deve ser estritamente menor que `maxAdvanceDays` da emissão.
 * Com margem: days < maxAdvanceDays - safetyDays.
 * Vencimento já passado permanece elegível (não é problema de antecedência).
 */
export function isInterBoletoDueWithinBankWindow(params: {
  dueDate: string | null | undefined;
  emitDate?: string | null;
  nowMs?: number;
  maxAdvanceDays?: number;
  safetyDays?: number;
}): boolean {
  const due = parseIsoDateOnly(params.dueDate);
  if (!due) return false;
  const emit = resolveInterBoletoEmitDate(params);
  const days = calendarDaysBetween(emit, due);
  if (days == null) return false;
  if (days < 0) return true;
  const max = params.maxAdvanceDays ?? INTER_BOLETO_MAX_ADVANCE_DAYS;
  const safety = params.safetyDays ?? INTER_BOLETO_ADVANCE_SAFETY_DAYS;
  const limit = Math.max(1, max - Math.max(0, safety));
  return days < limit;
}

export function classifyInterBoletoDueWindow(params: {
  dueDate: string | null | undefined;
  emitDate?: string | null;
  nowMs?: number;
}): 'eligible' | 'waiting_window' | 'invalid' {
  if (!parseIsoDateOnly(params.dueDate)) return 'invalid';
  return isInterBoletoDueWithinBankWindow(params) ? 'eligible' : 'waiting_window';
}

export function isInterBoletoDueWindowError(
  message?: string | null,
  httpStatus?: number | null,
): boolean {
  const text = String(message || '');
  if (text.includes(INTER_WAITING_BANK_WINDOW_CODE)) return true;
  if (/1000\s*dias/i.test(text)) return true;
  if (/menor do que 1000/i.test(text)) return true;
  if ((httpStatus === 400 || httpStatus === 422) && /vencimento do documento/i.test(text)) {
    return /1000/.test(text);
  }
  return false;
}

export function buildInterWaitingWindowMessage(params: {
  dueDate: string | null | undefined;
  emitDate: string;
  daysUntilDue?: number | null;
}): string {
  const due = parseIsoDateOnly(params.dueDate) || '—';
  const days =
    params.daysUntilDue == null
      ? calendarDaysBetween(params.emitDate, due)
      : params.daysUntilDue;
  const daysText = days == null ? 'n/d' : String(days);
  return (
    `${INTER_WAITING_BANK_WINDOW_CODE}: vencimento ${due} está a ${daysText} dias da emissão ${params.emitDate}. ` +
    `O Banco Inter exige menos de ${INTER_BOLETO_MAX_ADVANCE_DAYS} dias (margem ${INTER_BOLETO_ADVANCE_SAFETY_DAYS}). ` +
    'Valores e vencimentos contratuais foram preservados.'
  );
}

export function assertInterBoletoDueWithinBankWindow(params: {
  dueDate: string | null | undefined;
  emitDate?: string | null;
  nowMs?: number;
}): void {
  const emit = resolveInterBoletoEmitDate(params);
  const due = parseIsoDateOnly(params.dueDate);
  const kind = classifyInterBoletoDueWindow({ ...params, emitDate: emit });
  if (kind === 'eligible') return;
  const days = due ? calendarDaysBetween(emit, due) : null;
  throw new InterBoletoWaitingWindowError(
    buildInterWaitingWindowMessage({ dueDate: due, emitDate: emit, daysUntilDue: days }),
    { daysUntilDue: days, emitDate: emit, dueDate: due },
  );
}

export function partitionInstallmentsByInterDueWindow<
  T extends { id: string; dueDate?: string | null },
>(
  rows: T[],
  params?: { emitDate?: string | null; nowMs?: number },
): { eligible: T[]; waiting: T[]; emitDate: string } {
  const emitDate = resolveInterBoletoEmitDate(params);
  const eligible: T[] = [];
  const waiting: T[] = [];
  for (const row of rows) {
    if (classifyInterBoletoDueWindow({ dueDate: row.dueDate, emitDate }) === 'eligible') {
      eligible.push(row);
    } else {
      waiting.push(row);
    }
  }
  return { eligible, waiting, emitDate };
}
