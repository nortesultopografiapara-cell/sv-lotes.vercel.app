/**
 * Classificação pura de finance_receipts para o acerto de encerramento.
 * Não soma cash_movements. Sem queries.
 */

import type {
  ClassifiedTerminationReceipt,
  ReceiptKind,
  TerminationReceiptInput,
} from '@/lib/contract-termination/types';

const PAID_STATUSES = new Set(['paid', 'pago']);

export function classifyReceiptKind(installmentNumber: unknown): ReceiptKind {
  if (installmentNumber == null || installmentNumber === '') return 'other';
  const n = Number(installmentNumber);
  if (!Number.isFinite(n)) return 'other';
  if (n === -1) return 'signal';
  if (n === 0) return 'entry';
  if (n >= 1) return 'installment';
  return 'other';
}

export function isTerminationReceiptPaid(row: {
  status?: string | null;
  paid_at?: string | null;
}): boolean {
  const st = String(row.status || '')
    .toLowerCase()
    .trim();
  if (PAID_STATUSES.has(st)) return true;
  return Boolean(row.paid_at);
}

/**
 * Valor pago: paid_amount se numérico finito (inclusive 0); senão amount.
 */
export function paidReceiptValue(row: {
  paid_amount?: number | string | null;
  amount?: number | string | null;
}): number {
  if (row.paid_amount != null && row.paid_amount !== '') {
    const paid = Number(row.paid_amount);
    if (Number.isFinite(paid)) return paid;
  }
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? amount : 0;
}

export function classifyTerminationReceipts(
  receipts: TerminationReceiptInput[] | null | undefined,
): ClassifiedTerminationReceipt[] {
  return (receipts || []).map((row) => {
    const paid = isTerminationReceiptPaid(row);
    return {
      ...row,
      kind: classifyReceiptKind(row.installment_number),
      paid,
      paidValue: paid ? paidReceiptValue(row) : 0,
    };
  });
}

export function sumPaidByKind(
  classified: ClassifiedTerminationReceipt[],
  kind: ReceiptKind,
): number {
  return classified
    .filter((r) => r.paid && r.kind === kind)
    .reduce((acc, r) => acc + r.paidValue, 0);
}

export function countPaidByKind(
  classified: ClassifiedTerminationReceipt[],
  kind: ReceiptKind,
): number {
  return classified.filter((r) => r.paid && r.kind === kind).length;
}
