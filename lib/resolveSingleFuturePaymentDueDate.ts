/**
 * Resolução centralizada do vencimento de pagamento único
 * (à vista imediato ou pagamento único futuro).
 *
 * Fonte canônica no schema atual: finance_receipts (não coluna sales.*).
 */

import type { ContractFinanceReceiptRef } from '@/lib/contractPaymentDates';
import {
  formatContractDueDateBr,
  formatContractDueDateLongBr,
} from '@/lib/contractPaymentDates';
import { resolveSalePaymentMode } from '@/lib/salePaymentMode';

function toIsoDateOnly(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const iso = String(raw).trim().split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function isCancelledReceipt(status: unknown): boolean {
  const st = String(status || '').toLowerCase().trim();
  return st === 'cancelado' || st === 'cancelled' || st === 'canceled';
}

/**
 * Localiza o vencimento do pagamento único.
 *
 * Prioridade:
 * 1. finance_receipts com installment_number >= 1 (principal; ignora entrada 0)
 * 2. finance_receipts sem número válido (legado de 1 linha)
 * 3. sale.down_payment_due_date (quando ainda injetado em memória na criação)
 */
export function resolveSingleFuturePaymentDueDate(params: {
  sale?: Record<string, unknown> | null;
  financeReceipts?: ContractFinanceReceiptRef[] | null;
}): string | null {
  const sale = params.sale || {};
  const mode = resolveSalePaymentMode(sale);
  if (!mode.isSingleFuture && !mode.isImmediateCash) {
    return null;
  }

  const receipts = (
    params.financeReceipts ??
    (sale.finance_receipts as ContractFinanceReceiptRef[] | undefined) ??
    []
  ).filter((r) => r && !isCancelledReceipt(r.status));

  const principal = receipts
    .filter((r) => {
      const n = Number(r.installment_number);
      return Number.isFinite(n) && n >= 1;
    })
    .sort((a, b) => Number(a.installment_number) - Number(b.installment_number));

  for (const row of principal) {
    const due = toIsoDateOnly(row.due_date);
    if (due) return due;
  }

  // Legado: único recebível sem installment_number confiável (não usar entrada 0).
  for (const row of receipts) {
    const n = Number(row.installment_number);
    if (Number.isFinite(n) && n === 0) continue;
    const due = toIsoDateOnly(row.due_date);
    if (due) return due;
  }

  return (
    toIsoDateOnly(sale.down_payment_due_date) ||
    toIsoDateOnly(sale.payment_due_date) ||
    null
  );
}

export function resolveSingleFuturePaymentDueDateFmt(params: {
  sale?: Record<string, unknown> | null;
  financeReceipts?: ContractFinanceReceiptRef[] | null;
}): {
  raw: string | null;
  fmt: string;
  longFmt: string;
} {
  const raw = resolveSingleFuturePaymentDueDate(params);
  return {
    raw,
    fmt: raw ? formatContractDueDateBr(raw) : '',
    longFmt: raw ? formatContractDueDateLongBr(raw) : '',
  };
}
