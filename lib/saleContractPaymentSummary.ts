/**
 * Quadro financeiro do contrato padrão (Meneses / SV LOTES 2.0) — não Recanto Primavera.
 */

import {
  computeInstallmentDisplayValue,
  downPaymentReducesInstallmentBase,
} from '@/lib/saleInstallmentCalc';
import { formatInstallmentCorrectionLabel } from '@/lib/installmentCorrectionType';
import {
  buildCompactBalloonFinanceScheduleHtml,
  resolveSaleContractBalloonFinance,
  type SaleContractBalloonFinanceSummary,
} from '@/lib/saleContractBalloonFinance';
import type { ContractFinanceReceiptRef } from '@/lib/contractPaymentDates';

function formatBRL(val: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

export type ContractInstallmentScheduleRow = {
  installmentNumber: number;
  amount: number;
  dueDate?: string | null;
  label?: string;
};

/** Detecta valores distintos nas parcelas 1..N (ex.: balão). */
export function hasVariableInstallmentAmounts(
  rows: ContractInstallmentScheduleRow[],
): boolean {
  const amounts = rows
    .filter((r) => r.installmentNumber >= 1)
    .map((r) => Math.round((Number(r.amount) || 0) * 100) / 100);
  if (amounts.length < 2) return false;
  const first = amounts[0];
  return amounts.some((a) => Math.abs(a - first) > 0.009);
}

/**
 * LEGADO — NÃO listar 1..N e NÃO inferir balão por diferença de valores.
 * Sem balloonAddons persistidos → string vazia.
 * O quadro oficial é buildCompactBalloonFinanceScheduleHtml.
 */
export function buildSaleContractInstallmentScheduleHtml(
  _rows: ContractInstallmentScheduleRow[],
): string {
  // Proibido inferir balões por amount !== base. Sempre vazio aqui.
  return '';
}

export type SaleContractPaymentBreakdown = {
  lotPrice: number;
  lotPriceFmt: string;
  discountAmount: number;
  discountFmt: string;
  entryAmount: number;
  entryFmt: string;
  installmentBalance: number;
  installmentBalanceFmt: string;
  installmentsCount: number;
  installmentValue: number;
  installmentValueFmt: string;
  correctionLabel: string;
  isCashPayment: boolean;
  balloonSummary?: SaleContractBalloonFinanceSummary | null;
};

export function resolveSaleContractPaymentBreakdown(
  sale: Record<string, unknown>,
  options?: {
    contractModel?: unknown;
    isCashPayment?: boolean;
    financeReceipts?: ContractFinanceReceiptRef[] | null;
    balloonAddons?: Array<{ installment_number: number; additional_amount: number }> | null;
  },
): SaleContractPaymentBreakdown {
  const lotPrice =
    Number(sale.lot_price) ||
    Number(sale.agreed_price) ||
    Number(sale.total_value) ||
    0;
  const discountAmount = Math.max(0, Number(sale.discount) || 0);
  const netValue = Math.max(0, lotPrice - discountAmount);
  const entryAmount = Math.max(0, Number(sale.down_payment) || 0);
  const installmentsCount = Math.max(1, Number(sale.installments_count) || 1);
  const isCashPayment =
    options?.isCashPayment ??
    String(sale.payment_type || '')
      .toLowerCase()
      .includes('vista');

  const installmentBalance = isCashPayment
    ? 0
    : downPaymentReducesInstallmentBase(options?.contractModel)
      ? Math.max(0, netValue - entryAmount)
      : netValue;

  const balloonSummary =
    !isCashPayment && options?.financeReceipts
      ? resolveSaleContractBalloonFinance({
          sale,
          financeReceipts: options.financeReceipts,
          balloonAddons: options.balloonAddons,
          isCashPayment,
        })
      : null;

  const installmentValue = isCashPayment
    ? 0
    : balloonSummary?.hasBalloon
      ? balloonSummary.baseInstallmentValue
      : computeInstallmentDisplayValue({
          finalValue: netValue,
          downPayment: entryAmount,
          installmentsCount,
          contractModel: options?.contractModel,
        });

  return {
    lotPrice,
    lotPriceFmt: formatBRL(lotPrice),
    discountAmount,
    discountFmt: formatBRL(discountAmount),
    entryAmount,
    entryFmt: formatBRL(entryAmount),
    installmentBalance,
    installmentBalanceFmt: formatBRL(installmentBalance),
    installmentsCount,
    installmentValue,
    installmentValueFmt: formatBRL(installmentValue),
    correctionLabel: formatInstallmentCorrectionLabel(sale.installment_correction_type),
    isCashPayment,
    balloonSummary,
  };
}

export function buildSaleContractPaymentSummaryHtml(
  breakdown: SaleContractPaymentBreakdown,
  options?: {
    scheduleRows?: ContractInstallmentScheduleRow[];
    hasVariableInstallments?: boolean;
    balloonSummary?: SaleContractBalloonFinanceSummary | null;
    /** Primeiro vencimento das parcelas mensais (não a entrada). */
    firstDueDateFmt?: string | null;
  },
): string {
  const balloon = options?.balloonSummary ?? breakdown.balloonSummary ?? null;

  // Com balão persistido: SOMENTE quadro executivo.
  // Nunca listar 1..N e nunca inferir balão por diferença de valores.
  if (!breakdown.isCashPayment && balloon?.hasBalloon) {
    return buildCompactBalloonFinanceScheduleHtml(balloon, {
      discountFmt: breakdown.discountFmt,
      correctionLabel: breakdown.correctionLabel,
      firstDueDateFmt: options?.firstDueDateFmt ?? null,
    });
  }

  const rows: Array<[string, string]> = [
    ['Valor do lote', breakdown.lotPriceFmt],
    ['Desconto concedido', breakdown.discountFmt],
    ['Valor da entrada', breakdown.isCashPayment ? '—' : breakdown.entryFmt],
    [
      'Saldo parcelado',
      breakdown.isCashPayment ? '—' : breakdown.installmentBalanceFmt,
    ],
    [
      'Quantidade de parcelas',
      breakdown.isCashPayment
        ? 'À vista'
        : `${breakdown.installmentsCount} parcela(s)`,
    ],
    [
      'Valor da parcela',
      breakdown.isCashPayment ? '—' : breakdown.installmentValueFmt,
    ],
    ['Correção das parcelas', breakdown.correctionLabel],
  ];

  const body = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;width:42%;">${label}</td><td style="padding:6px 10px;border:1px solid #ddd;">${value}</td></tr>`,
    )
    .join('');

  // Sem balão: NÃO anexar tabela 1..N (contrato permanece no padrão atual resumido).
  return `
    <div class="contract-clause" style="margin: 16px 0 20px;">
      <p style="margin:0 0 8px;font-weight:bold;">Quadro resumo — condições de pagamento</p>
      <table style="width:100%;border-collapse:collapse;font-size:11pt;">${body}</table>
    </div>`;
}
