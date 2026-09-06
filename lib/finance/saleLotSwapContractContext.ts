/**
 * Contexto financeiro do NOVO contrato na Troca de lote.
 * Puro: sem I/O. Sem RPC. Sem hardcode de empresa, venda, lote ou valores.
 *
 * O gerador oficial continua o mesmo. Aqui só se monta o snapshot congelado
 * do plano CALCULATED para não reapresentar entrada/parcelas da venda antiga.
 */

import { formatContractDueDateBr } from '@/lib/contractPaymentDates';
import type { LotSwapFinancialPlan } from '@/lib/finance/saleLotSwapPlan';
import { PAYMENT_TYPE_INSTALLMENT } from '@/lib/salePaymentMode';

export const LOT_SWAP_CONTRACT_FINANCE_KEY = 'lot_swap_finance';

export type LotSwapContractRemainingInstallment = {
  installment_number: number;
  amount: number;
  due_date: string | null;
  status: 'pendente';
};

export type LotSwapContractFinanceSnapshot = {
  new_lot_price: number;
  total_paid: number;
  transferable_credit: number;
  new_balance: number;
  remaining_installments: LotSwapContractRemainingInstallment[];
};

function money2(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function formatBRL(val: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

export function readLotSwapContractFinance(
  sale?: Record<string, unknown> | null,
): LotSwapContractFinanceSnapshot | null {
  const raw = sale?.[LOT_SWAP_CONTRACT_FINANCE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<LotSwapContractFinanceSnapshot>;
  const remaining = Array.isArray(row.remaining_installments)
    ? row.remaining_installments
        .map((item) => ({
          installment_number: Number(item?.installment_number) || 0,
          amount: money2(item?.amount),
          due_date: item?.due_date ? String(item.due_date).slice(0, 10) : null,
          status: 'pendente' as const,
        }))
        .filter((item) => item.amount > 0)
    : [];
  return {
    new_lot_price: money2(row.new_lot_price),
    total_paid: money2(row.total_paid),
    transferable_credit: money2(row.transferable_credit),
    new_balance: money2(row.new_balance),
    remaining_installments: remaining,
  };
}

export function buildLotSwapRemainingSchedulePhrase(
  rows: LotSwapContractRemainingInstallment[],
): string {
  return rows
    .map((row) => {
      const due = formatContractDueDateBr(row.due_date);
      return due
        ? `${formatBRL(row.amount)} com vencimento em ${due}`
        : formatBRL(row.amount);
    })
    .join('; ');
}

/**
 * Recibos que o gerador deve usar na cláusula financeira da troca:
 * somente as parcelas NOVAS do saldo. Pagos preservados não entram
 * como entrada 0 nem como parcela futura.
 */
export function buildLotSwapContractFinanceReceipts(
  plan: LotSwapFinancialPlan,
): LotSwapContractRemainingInstallment[] {
  return plan.receipts.create.map((item) => ({
    installment_number: item.installmentNumber,
    amount: money2(item.amount),
    due_date: item.dueDate,
    status: 'pendente' as const,
  }));
}

export function buildLotSwapContractFinanceSnapshot(
  plan: LotSwapFinancialPlan,
): LotSwapContractFinanceSnapshot {
  const remaining = buildLotSwapContractFinanceReceipts(plan);
  return {
    new_lot_price: money2(plan.financials.new_lot_price),
    total_paid: money2(plan.financials.total_paid),
    transferable_credit: money2(plan.financials.transferable_credit),
    new_balance: money2(plan.financials.new_balance),
    remaining_installments: remaining,
  };
}

/**
 * Campos da venda injetados só na geração do contrato da troca.
 * down_payment=0: o valor já pago não é nova entrada.
 */
export function buildLotSwapContractSalePatch(
  plan: LotSwapFinancialPlan,
): Record<string, unknown> {
  const snapshot = buildLotSwapContractFinanceSnapshot(plan);
  const remaining = snapshot.remaining_installments;
  const firstRemaining = remaining[0]?.amount || 0;
  return {
    agreed_price: snapshot.new_lot_price,
    lot_price: snapshot.new_lot_price,
    total_value: snapshot.new_lot_price,
    down_payment: 0,
    installments_count: remaining.length,
    installment_value: firstRemaining,
    payment_type: PAYMENT_TYPE_INSTALLMENT,
    receipts_sum: snapshot.new_lot_price,
    use_balloon_installments: false,
    [LOT_SWAP_CONTRACT_FINANCE_KEY]: snapshot,
  };
}

export function buildLotSwapContractFinanceContext(plan: LotSwapFinancialPlan): {
  snapshot: LotSwapContractFinanceSnapshot;
  salePatch: Record<string, unknown>;
  financeReceipts: LotSwapContractRemainingInstallment[];
} {
  const snapshot = buildLotSwapContractFinanceSnapshot(plan);
  return {
    snapshot,
    salePatch: buildLotSwapContractSalePatch(plan),
    financeReceipts: snapshot.remaining_installments,
  };
}

export function lotSwapContractUsesContinuityPayment(
  snapshot: LotSwapContractFinanceSnapshot | null | undefined,
): boolean {
  return Boolean(snapshot && snapshot.total_paid > 0);
}

/** Frase compartilhada: valor já pago da mesma negociação, sem nova entrada. */
export function buildLotSwapContinuityPaymentNarrative(input: {
  creditedPhrase: string;
  balancePhrase: string;
  hasRemaining: boolean;
  parcelsCountPhrase?: string;
  schedulePhrase?: string;
  installmentPhrase?: string;
  firstDueHtml?: string;
}): string {
  const credited =
    `do qual já se encontra pago e aproveitado nesta mesma negociação o valor de ${input.creditedPhrase}, sem constituir nova entrada`;
  if (!input.hasRemaining) {
    return `${credited}, não restando saldo parcelado.`;
  }
  const parcels = input.parcelsCountPhrase
    ? ` a ser quitado em ${input.parcelsCountPhrase} parcelas mensais e consecutivas`
    : '';
  const schedule = input.schedulePhrase
    ? `, assim discriminadas: ${input.schedulePhrase}`
    : input.installmentPhrase
      ? ` no valor de ${input.installmentPhrase}`
      : '';
  const due = input.firstDueHtml
    ? `, vencendo a primeira em ${input.firstDueHtml}`
    : '';
  return `${credited}, restando o saldo de ${input.balancePhrase},${parcels}${schedule}${due}`;
}

export function buildLotSwapPadraoClauseQuartaHtml(input: {
  valorTotalFmt: string;
  valorTotalExtenso: string;
  snapshot: LotSwapContractFinanceSnapshot;
  dataPrimeiraParcelaFmt: string;
  dataUltimaParcelaFmt: string;
  taxes?: string;
}): string {
  const taxes = input.taxes || '';
  const credited = formatBRL(input.snapshot.total_paid);
  const balance = formatBRL(input.snapshot.new_balance);
  const remaining = input.snapshot.remaining_installments;
  const schedule = buildLotSwapRemainingSchedulePhrase(remaining);
  const count = remaining.length;
  const narrative = buildLotSwapContinuityPaymentNarrative({
    creditedPhrase: `<strong>${credited}</strong>`,
    balancePhrase: `<strong>${balance}</strong>`,
    hasRemaining: count > 0 && input.snapshot.new_balance > 0,
    parcelsCountPhrase: count > 0 ? `<strong>${count}</strong>` : undefined,
    schedulePhrase: schedule || undefined,
    firstDueHtml: input.dataPrimeiraParcelaFmt
      ? `<strong>${input.dataPrimeiraParcelaFmt}</strong>`
      : undefined,
  });
  const last =
    count > 1 && input.dataUltimaParcelaFmt
      ? ` A última parcela vence em <strong>${input.dataUltimaParcelaFmt}</strong>.`
      : '';
  return `<p style="margin-bottom: 0;">
                    <strong>Cláusula Quarta:</strong> Fica a cargo exclusivo do PROMISSÁRIO COMPRADOR o valor de <strong>${input.valorTotalFmt} (${input.valorTotalExtenso})</strong>, ${narrative}.${last}${taxes}
                </p>`;
}

export function buildLotSwapAraguaiaStyleItem1Html(input: {
  pricePhrase: string;
  creditedPhrase: string;
  balancePhrase: string;
  parcelsCountPhrase: string;
  schedulePhrase: string;
  firstDueHtml: string;
  reajusteSuffix: string;
}): string {
  const hasRemaining = Boolean(String(input.schedulePhrase || '').trim());
  const narrative = buildLotSwapContinuityPaymentNarrative({
    creditedPhrase: input.creditedPhrase,
    balancePhrase: input.balancePhrase,
    hasRemaining,
    parcelsCountPhrase: hasRemaining ? input.parcelsCountPhrase : undefined,
    schedulePhrase: input.schedulePhrase || undefined,
    firstDueHtml: hasRemaining ? input.firstDueHtml : undefined,
  });
  if (!hasRemaining) {
    return `<strong>1</strong> – O preço certo e total ajustado para a presente promessa de compra e venda do imóvel descrito na cláusula segunda deste contrato é de ${input.pricePhrase}, ${narrative}`;
  }
  return `<strong>1</strong> – O preço certo e total ajustado para a presente promessa de compra e venda do imóvel descrito na cláusula segunda deste contrato é de ${input.pricePhrase}, ${narrative}${input.reajusteSuffix}`;
}
