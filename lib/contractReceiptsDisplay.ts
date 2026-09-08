/**
 * Apresentação READ-ONLY da aba Parcelas / Dados do Contrato.
 * Não persiste, não recalcula finance_receipts.
 */

/** Colunas reais de finance_receipts usadas na aba Parcelas. */
export const CONTRACT_FINANCE_RECEIPTS_SELECT =
  'id, sale_id, due_date, amount, status, installment_number, paid_amount, paid_at';

export type ContractReceiptDisplayRow = {
  installment_number?: unknown;
  amount?: unknown;
  status?: unknown;
  due_date?: string | null;
  paid_amount?: unknown;
  paid_at?: string | null;
};

export function parseInstallmentNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatContractReceiptInstallmentLabel(value: unknown): string {
  const n = parseInstallmentNumber(value);
  if (n === -1) return 'Sinal/Reserva';
  if (n === 0) return 'Entrada';
  if (n !== null && n >= 1) return String(n);
  return '-';
}

export type ContractReceiptStatusKey =
  | 'pago'
  | 'pendente'
  | 'atrasado'
  | 'cancelado';

export function resolveContractReceiptDisplayStatus(
  status: unknown,
  dueDate?: string | null,
  todayIso?: string,
): { key: ContractReceiptStatusKey; label: string } {
  const raw = String(status || '')
    .toLowerCase()
    .trim();
  if (raw === 'pago' || raw === 'paid') {
    return { key: 'pago', label: 'Pago' };
  }
  if (raw === 'cancelado' || raw === 'canceled' || raw === 'cancelled') {
    return { key: 'cancelado', label: 'Cancelado' };
  }
  if (raw === 'atrasado' || raw === 'overdue') {
    return { key: 'atrasado', label: 'Atrasado' };
  }

  const due = String(dueDate || '').slice(0, 10);
  const today = (todayIso || new Date().toISOString()).slice(0, 10);
  if (
    (raw === 'pendente' || raw === 'pending' || !raw) &&
    due &&
    due < today
  ) {
    return { key: 'atrasado', label: 'Atrasado' };
  }
  return { key: 'pendente', label: 'Pendente' };
}

export function contractReceiptStatusClassName(key: ContractReceiptStatusKey): string {
  if (key === 'pago') {
    return 'bg-green-500/10 text-[var(--color-success)] border border-[var(--color-success)]/20';
  }
  if (key === 'atrasado') {
    return 'bg-red-500/10 text-red-500 border border-red-500/20';
  }
  if (key === 'cancelado') {
    return 'bg-zinc-500/10 text-[var(--text-muted)] border border-[var(--border-color)]/40';
  }
  return 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20';
}

export function resolveContractInstallmentsCount(
  sale: { installments_count?: unknown } | null | undefined,
): number | null {
  const n = Number(sale?.installments_count);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function resolveContractInstallmentAmountDisplay(
  sale: { regular_installment_amount?: unknown } | null | undefined,
  receipts: Array<{ installment_number?: unknown; amount?: unknown }> | null | undefined,
): number | null {
  const regular = Number(sale?.regular_installment_amount);
  if (Number.isFinite(regular) && regular > 0) return regular;

  const monthly = (receipts || []).filter((row) => {
    const n = parseInstallmentNumber(row.installment_number);
    return n !== null && n >= 1;
  });
  for (const row of monthly) {
    const amount = Number(row.amount);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return null;
}

export function formatPaidAmountDisplay(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
