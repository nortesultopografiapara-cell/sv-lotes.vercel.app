/**
 * Sinal contratual Recanto Primavera — não abate o valor do lote.
 * Restante do sinal pode ser acrescido às primeiras parcelas ou diluído em todas.
 */

import { normalizeSaleContractModel } from '@/lib/contractModel';
import { splitInstallmentAmounts } from '@/lib/saleInstallmentCalc';

export const SIGNAL_REMAINING_PAYMENT_MODES = [
  'FIRST_INSTALLMENTS',
  'ALL_INSTALLMENTS',
] as const;

export type SignalRemainingPaymentMode =
  (typeof SIGNAL_REMAINING_PAYMENT_MODES)[number];

export type RecantoSignalPlanInput = {
  contractValue?: number | null;
  paidAtSale?: number | null;
  paymentMode?: string | null;
  remainingInstallments?: number | null;
  totalInstallments?: number | null;
};

export type RecantoSignalPlan = {
  contractValue: number;
  paidAtSale: number;
  remainingValue: number;
  paymentMode: SignalRemainingPaymentMode | null;
  remainingInstallments: number | null;
  remainingInstallmentValue: number;
  hasRemaining: boolean;
};

export type InstallmentAmountComposition = {
  baseAmount: number;
  signalAddonAmount: number;
  amount: number;
};

function money(value: number): number {
  return Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
}

export function isRecantoPrimaveraSaleModel(contractModel?: unknown): boolean {
  return normalizeSaleContractModel(contractModel) === 'RECANTO_PRIMAVERA';
}

export function normalizeSignalRemainingPaymentMode(
  value?: string | null,
): SignalRemainingPaymentMode | null {
  const mode = String(value || '')
    .trim()
    .toUpperCase();
  if (mode === 'FIRST_INSTALLMENTS' || mode === 'ALL_INSTALLMENTS') {
    return mode;
  }
  return null;
}

/**
 * Resolve plano do sinal Recanto.
 * Sem campos novos (legado): remaining = 0 e paidAtSale = contractValue
 * quando só há down_payment histórico sem paid_at_sale explícito.
 */
export function resolveRecantoSignalPlan(
  input: RecantoSignalPlanInput,
  options?: { legacyFullSignalAsPaidLine?: boolean },
): RecantoSignalPlan {
  const contractValue = money(input.contractValue);
  const paidRaw = input.paidAtSale;
  const paidExplicit = paidRaw != null && paidRaw !== ('' as unknown);
  const paidAtSale = paidExplicit
    ? money(Number(paidRaw))
    : options?.legacyFullSignalAsPaidLine
      ? 0
      : contractValue;
  const remainingValue = money(Math.max(0, contractValue - paidAtSale));
  const hasRemaining = remainingValue > 0.009;
  const paymentMode = hasRemaining
    ? normalizeSignalRemainingPaymentMode(input.paymentMode) ||
      'FIRST_INSTALLMENTS'
    : null;

  let remainingInstallments: number | null = null;
  let remainingInstallmentValue = 0;

  if (hasRemaining && paymentMode === 'ALL_INSTALLMENTS') {
    const total = Math.max(0, Math.floor(Number(input.totalInstallments) || 0));
    remainingInstallments = total > 0 ? total : null;
    if (remainingInstallments) {
      remainingInstallmentValue =
        splitInstallmentAmounts(remainingValue, remainingInstallments)[0] ?? 0;
    }
  } else if (hasRemaining && paymentMode === 'FIRST_INSTALLMENTS') {
    const n = Math.max(0, Math.floor(Number(input.remainingInstallments) || 0));
    remainingInstallments = n > 0 ? n : null;
    if (remainingInstallments) {
      remainingInstallmentValue =
        splitInstallmentAmounts(remainingValue, remainingInstallments)[0] ?? 0;
    }
  }

  return {
    contractValue,
    paidAtSale,
    remainingValue,
    paymentMode,
    remainingInstallments,
    remainingInstallmentValue,
    hasRemaining,
  };
}

export function validateRecantoSignalPlan(
  input: RecantoSignalPlanInput,
): { valid: true; plan: RecantoSignalPlan } | { valid: false; message: string } {
  const contractValue = money(input.contractValue);
  const paidAtSale = money(input.paidAtSale);
  const totalInstallments = Math.max(
    0,
    Math.floor(Number(input.totalInstallments) || 0),
  );

  if (contractValue < 0) {
    return { valid: false, message: 'O valor do sinal contratado não pode ser negativo.' };
  }
  if (paidAtSale < 0) {
    return { valid: false, message: 'O valor pago no ato do sinal não pode ser negativo.' };
  }
  if (paidAtSale > contractValue + 0.009) {
    return {
      valid: false,
      message: 'O valor pago no ato não pode ser maior que o sinal contratado.',
    };
  }

  const remainingValue = money(contractValue - paidAtSale);
  if (remainingValue < 0) {
    return { valid: false, message: 'O restante do sinal não pode ser negativo.' };
  }

  if (remainingValue <= 0.009) {
    return {
      valid: true,
      plan: resolveRecantoSignalPlan(input),
    };
  }

  const mode = normalizeSignalRemainingPaymentMode(input.paymentMode);
  if (!mode) {
    return {
      valid: false,
      message: 'Selecione a forma de cobrança do restante do sinal.',
    };
  }

  if (mode === 'FIRST_INSTALLMENTS') {
    const n = Math.floor(Number(input.remainingInstallments) || 0);
    if (n <= 0) {
      return {
        valid: false,
        message:
          'Informe a quantidade de parcelas para cobrar o restante do sinal.',
      };
    }
    if (totalInstallments > 0 && n > totalInstallments) {
      return {
        valid: false,
        message:
          'A quantidade de parcelas do restante do sinal não pode ser maior que o total de parcelas da venda.',
      };
    }
  }

  if (mode === 'ALL_INSTALLMENTS' && totalInstallments <= 0) {
    return {
      valid: false,
      message: 'Informe a quantidade total de parcelas da venda.',
    };
  }

  return { valid: true, plan: resolveRecantoSignalPlan(input) };
}

/** Aplica acréscimo do restante do sinal sobre as parcelas-base do lote. */
export function applySignalAddonToInstallmentAmounts(
  baseAmounts: number[],
  plan: RecantoSignalPlan,
): InstallmentAmountComposition[] {
  const bases = baseAmounts.map((v) => money(v));
  if (!plan.hasRemaining || bases.length === 0) {
    return bases.map((baseAmount) => ({
      baseAmount,
      signalAddonAmount: 0,
      amount: baseAmount,
    }));
  }

  let addonCount = 0;
  if (plan.paymentMode === 'ALL_INSTALLMENTS') {
    addonCount = bases.length;
  } else {
    addonCount = Math.min(
      bases.length,
      Math.max(0, Number(plan.remainingInstallments) || 0),
    );
  }

  if (addonCount <= 0) {
    return bases.map((baseAmount) => ({
      baseAmount,
      signalAddonAmount: 0,
      amount: baseAmount,
    }));
  }

  const addons = splitInstallmentAmounts(plan.remainingValue, addonCount);
  return bases.map((baseAmount, index) => {
    const signalAddonAmount = index < addonCount ? money(addons[index] ?? 0) : 0;
    return {
      baseAmount,
      signalAddonAmount,
      amount: money(baseAmount + signalAddonAmount),
    };
  });
}

export function buildRecantoSignalClauseText(plan: RecantoSignalPlan, totalInstallments: number): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

  if (plan.contractValue <= 0) {
    return '';
  }

  if (!plan.hasRemaining) {
    return `O COMPRADOR pagará, a título de sinal contratual, o valor de ${fmt(plan.contractValue)}, o qual não será abatido do valor do lote nem do saldo parcelado. O sinal foi pago integralmente no ato da assinatura/celebração da venda.`;
  }

  if (plan.paymentMode === 'ALL_INSTALLMENTS') {
    return `O COMPRADOR pagará, a título de sinal contratual, o valor de ${fmt(plan.contractValue)}, o qual não será abatido do valor do lote nem do saldo parcelado. Desse sinal, ${fmt(plan.paidAtSale)} será pago no ato da assinatura/celebração da venda, ficando o saldo de ${fmt(plan.remainingValue)} diluído nas ${totalInstallments} parcelas do saldo parcelado do lote, com acréscimo de ${fmt(plan.remainingInstallmentValue)} em cada parcela.`;
  }

  const n = plan.remainingInstallments || 0;
  return `O COMPRADOR pagará, a título de sinal contratual, o valor de ${fmt(plan.contractValue)}, o qual não será abatido do valor do lote nem do saldo parcelado. Desse sinal, ${fmt(plan.paidAtSale)} será pago no ato da assinatura/celebração da venda, ficando o saldo de ${fmt(plan.remainingValue)} parcelado em ${n} parcelas de ${fmt(plan.remainingInstallmentValue)}, acrescidas às primeiras parcelas do saldo parcelado do lote.`;
}
