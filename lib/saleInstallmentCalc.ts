/**
 * Cálculo de parcelas por modelo de contrato.
 * Recanto Primavera: sinal (down_payment) NÃO abate o valor parcelado.
 * PADRAO/Meneses: entrada abate o saldo das parcelas.
 */

import {
  normalizeSaleContractModel,
  type SaleContractModel,
} from '@/lib/contractModel';
import { resolveSalePaymentMode } from '@/lib/salePaymentMode';

export function downPaymentReducesInstallmentBase(
  contractModel: SaleContractModel | unknown,
): boolean {
  return normalizeSaleContractModel(contractModel) !== 'RECANTO_PRIMAVERA';
}

export function resolveInstallmentPrincipal(params: {
  totalValue: number;
  downPayment?: number;
  contractModel?: SaleContractModel | unknown;
}): number {
  const total = Math.max(0, Number(params.totalValue) || 0);
  const down = Math.max(0, Number(params.downPayment) || 0);
  if (downPaymentReducesInstallmentBase(params.contractModel)) {
    return Math.max(0, total - down);
  }
  return total;
}

/** Divide principal em N parcelas com ajuste de centavos na última. */
export function splitInstallmentAmounts(
  principal: number,
  count: number,
): number[] {
  if (count <= 0) return [];
  const totalRestante = Math.max(0, principal);
  const parValue = Math.round((totalRestante / count) * 100) / 100;
  let accumulated = 0;
  const amounts: number[] = [];
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const currentAmount = isLast
      ? Number((totalRestante - accumulated).toFixed(2))
      : parValue;
    accumulated += currentAmount;
    amounts.push(currentAmount);
  }
  return amounts;
}

export function computeInstallmentDisplayValue(params: {
  finalValue: number;
  downPayment?: number;
  installmentsCount: number;
  contractModel?: SaleContractModel | unknown;
}): number {
  const count = params.installmentsCount;
  if (count <= 0) return 0;
  const principal = resolveInstallmentPrincipal({
    totalValue: params.finalValue,
    downPayment: params.downPayment,
    contractModel: params.contractModel,
  });
  return splitInstallmentAmounts(principal, count)[0] ?? 0;
}

/** Total esperado de recebíveis (pagos + pendentes) para validação de recálculo. */
export function expectedSaleFinanceTotal(params: {
  finalValue: number;
  grossDownPayment?: number;
  contractModel?: SaleContractModel | unknown;
  paymentType?: string;
}): number {
  const finalValue = Math.max(0, Number(params.finalValue) || 0);
  const paymentType = params.paymentType || 'Parcelado';
  const mode = resolveSalePaymentMode({ payment_type: paymentType }).mode;
  if (mode === 'IMMEDIATE_CASH' || mode === 'SINGLE_FUTURE') return finalValue;

  if (!downPaymentReducesInstallmentBase(params.contractModel)) {
    return finalValue + Math.max(0, Number(params.grossDownPayment) || 0);
  }
  return finalValue;
}
