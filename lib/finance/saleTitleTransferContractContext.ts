/**
 * Contexto financeiro do NOVO contrato na Transferência de titularidade.
 * Isolado de lot_swap_finance. Sem I/O. Sem RPC. Sem Mundo Novo sellers.
 *
 * O gerador oficial continua generateContractHTML. Aqui só se monta o snapshot
 * de continuidade: valor do imóvel, pago aproveitado (não é entrada de B),
 * saldo assumido pelo cessionário e parcelas vigentes.
 */

import { formatContractDueDateBr } from '@/lib/contractPaymentDates';
import { PAYMENT_TYPE_INSTALLMENT } from '@/lib/salePaymentMode';
import type { TitleTransferFinanceKpis } from '@/lib/finance/saleTitleTransferPreview';

export const TITLE_TRANSFER_CONTRACT_FINANCE_KEY = 'title_transfer_finance';

export type TitleTransferContractRemainingInstallment = {
  installment_number: number;
  amount: number;
  due_date: string | null;
  status: 'pendente';
};

export type TitleTransferContractFinanceSnapshot = {
  sale_price: number;
  total_paid: number;
  remaining_balance: number;
  declared_agio_amount: number;
  remaining_installments: TitleTransferContractRemainingInstallment[];
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

export function readTitleTransferContractFinance(
  sale?: Record<string, unknown> | null,
): TitleTransferContractFinanceSnapshot | null {
  const raw = sale?.[TITLE_TRANSFER_CONTRACT_FINANCE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<TitleTransferContractFinanceSnapshot>;
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
    sale_price: money2(row.sale_price),
    total_paid: money2(row.total_paid),
    remaining_balance: money2(row.remaining_balance),
    declared_agio_amount: money2(row.declared_agio_amount),
    remaining_installments: remaining,
  };
}

export function hasTitleTransferContractFinance(
  snapshot: TitleTransferContractFinanceSnapshot | null | undefined,
): boolean {
  return Boolean(snapshot);
}

export function buildTitleTransferRemainingSchedulePhrase(
  rows: TitleTransferContractRemainingInstallment[],
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

export function buildTitleTransferContractFinanceSnapshot(input: {
  salePrice: number;
  finance: TitleTransferFinanceKpis;
  declaredAgioAmount?: number;
  remainingInstallments: Array<{
    installment_number?: number | null;
    amount?: number | string | null;
    due_date?: string | null;
  }>;
}): TitleTransferContractFinanceSnapshot {
  const remaining = (input.remainingInstallments || [])
    .map((item, idx) => ({
      installment_number: Number(item.installment_number) || idx + 1,
      amount: money2(item.amount),
      due_date: item.due_date ? String(item.due_date).slice(0, 10) : null,
      status: 'pendente' as const,
    }))
    .filter((item) => item.amount > 0);
  return {
    sale_price: money2(input.salePrice),
    total_paid: money2(input.finance.totalPaid),
    remaining_balance: money2(input.finance.remainingBalance),
    declared_agio_amount: money2(input.declaredAgioAmount),
    remaining_installments: remaining,
  };
}

export function buildTitleTransferContractSalePatch(
  snapshot: TitleTransferContractFinanceSnapshot,
): Record<string, unknown> {
  const remaining = snapshot.remaining_installments;
  return {
    agreed_price: snapshot.sale_price,
    lot_price: snapshot.sale_price,
    total_value: snapshot.sale_price,
    down_payment: 0,
    installments_count: remaining.length,
    installment_value: remaining[0]?.amount || 0,
    payment_type: PAYMENT_TYPE_INSTALLMENT,
    receipts_sum: snapshot.sale_price,
    use_balloon_installments: false,
    [TITLE_TRANSFER_CONTRACT_FINANCE_KEY]: snapshot,
  };
}

export function buildTitleTransferContractFinanceContext(input: {
  salePrice: number;
  finance: TitleTransferFinanceKpis;
  declaredAgioAmount?: number;
  remainingInstallments: Array<{
    installment_number?: number | null;
    amount?: number | string | null;
    due_date?: string | null;
  }>;
}): {
  snapshot: TitleTransferContractFinanceSnapshot;
  salePatch: Record<string, unknown>;
  financeReceipts: TitleTransferContractRemainingInstallment[];
} {
  const snapshot = buildTitleTransferContractFinanceSnapshot(input);
  return {
    snapshot,
    salePatch: buildTitleTransferContractSalePatch(snapshot),
    financeReceipts: snapshot.remaining_installments,
  };
}

export function buildTitleTransferContinuityNarrative(input: {
  pricePhrase: string;
  paidPhrase: string;
  balancePhrase: string;
  hasPaid: boolean;
  hasRemaining: boolean;
  parcelsCountPhrase?: string;
  schedulePhrase?: string;
}): string {
  const paid = input.hasPaid
    ? `do qual já se encontra pago e aproveitado nesta mesma negociação o valor de ${input.paidPhrase}, sem constituir nova entrada do cessionário`
    : 'sem constituir nova entrada do cessionário';
  if (!input.hasRemaining) {
    return `${paid}, não restando saldo parcelado a assumir.`;
  }
  const parcels = input.parcelsCountPhrase
    ? ` nas ${input.parcelsCountPhrase} parcelas vigentes`
    : ' nas parcelas vigentes';
  const schedule = input.schedulePhrase ? `, assim discriminadas: ${input.schedulePhrase}` : '';
  return `${paid}, restando o saldo de ${input.balancePhrase} assumido pelo cessionário${parcels}${schedule}`;
}

export function buildTitleTransferPadraoClauseQuartaHtml(input: {
  valorTotalFmt: string;
  valorTotalExtenso: string;
  snapshot: TitleTransferContractFinanceSnapshot;
  taxes?: string;
}): string {
  const remaining = input.snapshot.remaining_installments;
  const narrative = buildTitleTransferContinuityNarrative({
    pricePhrase: `<strong>${input.valorTotalFmt}</strong>`,
    paidPhrase: `<strong>${formatBRL(input.snapshot.total_paid)}</strong>`,
    balancePhrase: `<strong>${formatBRL(input.snapshot.remaining_balance)}</strong>`,
    hasPaid: input.snapshot.total_paid > 0,
    hasRemaining: remaining.length > 0 && input.snapshot.remaining_balance > 0,
    parcelsCountPhrase: remaining.length ? `<strong>${remaining.length}</strong>` : undefined,
    schedulePhrase: remaining.length
      ? buildTitleTransferRemainingSchedulePhrase(remaining)
      : undefined,
  });
  return `<p style="margin-bottom: 0;">
                    <strong>Cláusula Quarta:</strong> Fica a cargo exclusivo do PROMISSÁRIO COMPRADOR (cessionário) o valor de <strong>${input.valorTotalFmt} (${input.valorTotalExtenso})</strong>, ${narrative}.${input.taxes || ''}
                </p>`;
}

export function buildTitleTransferAraguaiaStyleItem1Html(input: {
  pricePhrase: string;
  paidPhrase: string;
  balancePhrase: string;
  parcelsCountPhrase: string;
  schedulePhrase: string;
  reajusteSuffix: string;
  hasPaid: boolean;
}): string {
  const hasRemaining = Boolean(String(input.schedulePhrase || '').trim());
  const narrative = buildTitleTransferContinuityNarrative({
    pricePhrase: input.pricePhrase,
    paidPhrase: input.paidPhrase,
    balancePhrase: input.balancePhrase,
    hasPaid: input.hasPaid,
    hasRemaining,
    parcelsCountPhrase: hasRemaining ? input.parcelsCountPhrase : undefined,
    schedulePhrase: input.schedulePhrase || undefined,
  });
  if (!hasRemaining) {
    return `<strong>1</strong> – O preço certo e total ajustado para a presente promessa de compra e venda do imóvel descrito na cláusula segunda deste contrato é de ${input.pricePhrase}, ${narrative}`;
  }
  return `<strong>1</strong> – O preço certo e total ajustado para a presente promessa de compra e venda do imóvel descrito na cláusula segunda deste contrato é de ${input.pricePhrase}, ${narrative}${input.reajusteSuffix}`;
}
