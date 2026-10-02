/**
 * Resumo comercial das parcelas no contrato.
 * Fonte: snapshot da venda (quantidade, parcela-base, restante do sinal).
 * Não lista ajustes de centavos dos finance_receipts.
 */
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import { normalizeSignalRemainingPaymentMode } from '@/lib/recantoSignalRemaining';

export type CommercialInstallmentScheduleInput = {
  totalCount?: unknown;
  baseAmount?: unknown;
  remainingMode?: unknown;
  remainingInstallments?: unknown;
  remainingAddon?: unknown;
};

function money(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(Math.max(0, num) * 100) / 100;
}

function moneyLabel(value: number): string {
  return formatCurrencyBRL(value).replace(/\u00a0/g, ' ');
}

function ordinalFem(n: number): string {
  return `${n}ª`;
}

function uniqueLine(count: number, amount: number): string {
  if (count <= 0 || amount < 0) return '';
  if (count === 1) return `1 parcela de ${moneyLabel(amount)}`;
  return `${count} parcelas de ${moneyLabel(amount)}`;
}

export function formatInstallmentScheduleDescription(
  input: CommercialInstallmentScheduleInput,
): string {
  const total = Math.max(0, Math.floor(Number(input.totalCount) || 0));
  const base = money(input.baseAmount);
  if (total <= 0) return '';

  const mode = normalizeSignalRemainingPaymentMode(
    input.remainingMode == null ? null : String(input.remainingMode),
  );
  const addon = money(input.remainingAddon);
  const firstCount =
    mode === 'ALL_INSTALLMENTS'
      ? total
      : Math.max(0, Math.floor(Number(input.remainingInstallments) || 0));
  const firstAmount = money(base + addon);

  if (!mode || addon <= 0 || firstCount <= 0 || firstAmount === base) {
    return uniqueLine(total, base);
  }

  if (firstCount >= total) {
    return uniqueLine(total, firstAmount);
  }

  return `${total} parcelas — ${ordinalFem(1)} à ${ordinalFem(firstCount)} de ${moneyLabel(
    firstAmount,
  )}; ${ordinalFem(firstCount + 1)} à ${ordinalFem(total)} de ${moneyLabel(base)}`;
}
