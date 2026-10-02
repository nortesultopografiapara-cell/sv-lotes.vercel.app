/**
 * Resumo comercial das parcelas no contrato.
 * Fonte: snapshot da venda (quantidade, parcela-base, restante do sinal).
 * Não lista ajustes de centavos dos finance_receipts.
 *
 * Campos — não confundir:
 * - baseInstallmentValue = sales.regular_installment_amount OU lote/quantidade
 *   (o mesmo "Valor da Parcela" do formulário). NÃO é sales.installment_value
 *   (coluna órfã, não persiste) e NÃO é signal_remaining_installment_value.
 * - splitDownPaymentInstallmentAmount = sales.signal_remaining_installment_value
 *   (acréscimo do restante do sinal, ex.: R$ 2,33).
 * - valor comercial das primeiras = base + acréscimo.
 */
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import { resolveRecantoLotInstallmentPlan } from '@/lib/recantoFixedInstallmentPlan';
import { normalizeSignalRemainingPaymentMode } from '@/lib/recantoSignalRemaining';
import { usesSplitDownPaymentFinance } from '@/lib/saleFinanceConfig';
import { computeInstallmentDisplayValue } from '@/lib/saleInstallmentCalc';

export type CommercialInstallmentScheduleInput = {
  totalCount?: unknown;
  /** Parcela-base comercial (Y). Nunca o acréscimo do sinal. */
  baseAmount?: unknown;
  remainingMode?: unknown;
  remainingInstallments?: unknown;
  /** Acréscimo comercial por parcela (sinal). Nunca o valor total. */
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
  if (count <= 0 || amount <= 0) return '';
  if (count === 1) return `1 parcela de ${moneyLabel(amount)}`;
  return `${count} parcelas de ${moneyLabel(amount)}`;
}

function positiveMoney(value: unknown): number {
  const num = money(value);
  return num > 0 ? num : 0;
}

/**
 * Parcela-base do formulário (ex.: R$ 12,88).
 * NÃO usa sales.installment_value (órfã) nem o acréscimo do sinal (R$ 2,33).
 */
export function resolveCommercialInstallmentBaseAmount(
  sale: Record<string, unknown> | null | undefined,
  options?: { projectLfConfig?: unknown },
): number {
  if (!sale) return 0;

  const persistedRegular = positiveMoney(sale.regular_installment_amount);
  if (persistedRegular > 0) return persistedRegular;

  const totalCount = Math.max(0, Math.floor(Number(sale.installments_count) || 0));
  const lotValue = positiveMoney(
    sale.total_value ?? sale.agreed_price ?? sale.lot_price,
  );
  if (totalCount <= 0 || lotValue <= 0) return 0;

  const split =
    usesSplitDownPaymentFinance({
      contractModel: sale.contract_model ?? sale.sale_contract_model,
      saleSnapshot: sale,
      projectLfConfig: options?.projectLfConfig,
    }) || Boolean(sale.signal_remaining_payment_mode);

  if (split) {
    const plan = resolveRecantoLotInstallmentPlan({
      lotValue,
      regularCount: totalCount,
      mode: sale.installment_definition_mode,
      regularAmount: Number(sale.regular_installment_amount) || null,
      generateResidual: sale.has_residual_installment !== false,
    });
    if (plan.regularAmount > 0) return money(plan.regularAmount);
  }

  return money(
    computeInstallmentDisplayValue({
      finalValue: lotValue,
      downPayment: Number(sale.signal_contract_value ?? sale.down_payment) || 0,
      installmentsCount: totalCount,
      contractModel: sale.contract_model ?? sale.sale_contract_model,
      reduceByDownPayment: split ? false : undefined,
    }),
  );
}

export function resolveCommercialSignalAddonAmount(
  sale: Record<string, unknown> | null | undefined,
  fallbackAddon?: unknown,
): number {
  if (!sale) return positiveMoney(fallbackAddon);
  const persisted = positiveMoney(sale.signal_remaining_installment_value);
  if (persisted > 0) return persisted;
  const fallback = positiveMoney(fallbackAddon);
  if (fallback > 0) return fallback;
  const remaining = positiveMoney(sale.signal_remaining_value);
  const count = Math.max(0, Math.floor(Number(sale.signal_remaining_installments) || 0));
  if (remaining > 0 && count > 0) return money(remaining / count);
  return 0;
}

export function resolveCommercialInstallmentScheduleFromSale(
  sale: Record<string, unknown> | null | undefined,
  options?: { projectLfConfig?: unknown; remainingAddonFallback?: unknown },
): string {
  if (!sale) return '';
  return formatInstallmentScheduleDescription({
    totalCount: sale.installments_count,
    baseAmount: resolveCommercialInstallmentBaseAmount(sale, options),
    remainingMode: sale.signal_remaining_payment_mode,
    remainingInstallments: sale.signal_remaining_installments,
    remainingAddon: resolveCommercialSignalAddonAmount(
      sale,
      options?.remainingAddonFallback,
    ),
  });
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

  if (base <= 0) {
    if (addon > 0) {
      throw new Error(
        'INSTALLMENTS_SCHEDULE: parcela-base ausente. ' +
          'Não usar signal_remaining_installment_value (acréscimo) como valor da parcela, ' +
          'nem sales.installment_value (coluna órfã). Fonte: regular_installment_amount ou lote/quantidade.',
      );
    }
    return '';
  }

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
