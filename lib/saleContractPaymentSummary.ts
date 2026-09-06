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
import {
  type ContractFinanceReceiptRef,
} from '@/lib/contractPaymentDates';
import { resolveSingleFuturePaymentDueDateFmt } from '@/lib/resolveSingleFuturePaymentDueDate';
import {
  resolveSalePaymentMode,
  type SalePaymentMode,
} from '@/lib/salePaymentMode';
import {
  lotSwapContractUsesContinuityPayment,
  readLotSwapContractFinance,
} from '@/lib/finance/saleLotSwapContractContext';

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
  paymentMode: SalePaymentMode;
  netValue: number;
  netValueFmt: string;
  singlePaymentDueRaw: string | null;
  singlePaymentDueFmt: string;
  singlePaymentDueLongFmt: string;
  balloonSummary?: SaleContractBalloonFinanceSummary | null;
  hasLotSwapFinance: boolean;
  lotSwapUsesContinuity: boolean;
  lotSwapCreditedFmt: string | null;
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
  const swapFinance = readLotSwapContractFinance(sale);
  const lotPrice =
    swapFinance?.new_lot_price ||
    Number(sale.lot_price) ||
    Number(sale.agreed_price) ||
    Number(sale.total_value) ||
    0;
  const discountAmount = Math.max(0, Number(sale.discount) || 0);
  const netValue = Math.max(0, lotPrice - discountAmount);
  const entryAmount = swapFinance
    ? 0
    : Math.max(0, Number(sale.down_payment) || 0);
  const remainingCount = swapFinance?.remaining_installments.length || 0;
  const installmentsCount = swapFinance
    ? remainingCount
    : Math.max(1, Number(sale.installments_count) || 1);
  const paymentMode = resolveSalePaymentMode(sale);
  const isCashPayment =
    options?.isCashPayment ?? paymentMode.isImmediateCash;

  const installmentBalance = swapFinance
    ? Math.max(0, swapFinance.new_balance)
    : paymentMode.isImmediateCash || paymentMode.isSingleFuture
      ? 0
      : downPaymentReducesInstallmentBase(options?.contractModel)
        ? Math.max(0, netValue - entryAmount)
        : netValue;

  const balloonSummary =
    swapFinance || !paymentMode.isInstallment || !options?.financeReceipts
      ? null
      : resolveSaleContractBalloonFinance({
          sale,
          financeReceipts: options.financeReceipts,
          balloonAddons: options.balloonAddons,
          isCashPayment: false,
        });

  const installmentValue = swapFinance
    ? swapFinance.remaining_installments[0]?.amount || 0
    : paymentMode.isImmediateCash || paymentMode.isSingleFuture
      ? 0
      : balloonSummary?.hasBalloon
        ? balloonSummary.baseInstallmentValue
        : computeInstallmentDisplayValue({
            finalValue: netValue,
            downPayment: entryAmount,
            installmentsCount,
            contractModel: options?.contractModel,
          });

  const singleDue = resolveSingleFuturePaymentDueDateFmt({
    sale,
    financeReceipts: options?.financeReceipts,
  });
  const singlePaymentDueRaw =
    paymentMode.isImmediateCash || paymentMode.isSingleFuture
      ? singleDue.raw
      : null;

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
    paymentMode: paymentMode.mode,
    netValue,
    netValueFmt: formatBRL(netValue),
    singlePaymentDueRaw,
    singlePaymentDueFmt: singlePaymentDueRaw ? singleDue.fmt : '',
    singlePaymentDueLongFmt: singlePaymentDueRaw ? singleDue.longFmt : '',
    balloonSummary,
    hasLotSwapFinance: Boolean(swapFinance),
    lotSwapUsesContinuity: lotSwapContractUsesContinuityPayment(swapFinance),
    lotSwapCreditedFmt: swapFinance ? formatBRL(swapFinance.total_paid) : null,
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

  if (breakdown.paymentMode === 'SINGLE_FUTURE') {
    const rows: Array<[string, string]> = [
      ['Valor da venda', breakdown.lotPriceFmt],
      ['Desconto', breakdown.discountFmt],
      ['Valor líquido', breakdown.netValueFmt],
      ['Forma de pagamento', 'Pagamento único com vencimento futuro'],
      ['Valor do pagamento', breakdown.netValueFmt],
      ['Data de vencimento', breakdown.singlePaymentDueFmt || '—'],
      ['Correção', breakdown.correctionLabel],
    ];
    const body = rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;width:42%;">${label}</td><td style="padding:6px 10px;border:1px solid #ddd;">${value}</td></tr>`,
      )
      .join('');
    return `
    <div class="contract-clause" style="margin: 16px 0 20px;">
      <p style="margin:0 0 8px;font-weight:bold;">Quadro resumo — condições de pagamento</p>
      <table style="width:100%;border-collapse:collapse;font-size:11pt;">${body}</table>
    </div>`;
  }

  // Com balão persistido: SOMENTE quadro executivo.
  if (breakdown.paymentMode === 'INSTALLMENT' && balloon?.hasBalloon) {
    return buildCompactBalloonFinanceScheduleHtml(balloon, {
      discountFmt: breakdown.discountFmt,
      correctionLabel: breakdown.correctionLabel,
      firstDueDateFmt: options?.firstDueDateFmt ?? null,
    });
  }

  const rows: Array<[string, string]> = breakdown.hasLotSwapFinance
    ? [
        ['Valor do lote', breakdown.lotPriceFmt],
        ['Desconto concedido', breakdown.discountFmt],
        [
          'Valor já pago/aproveitado',
          breakdown.lotSwapCreditedFmt || '—',
        ],
        ['Saldo remanescente', breakdown.installmentBalanceFmt],
        [
          'Quantidade de parcelas',
          breakdown.installmentsCount > 0
            ? `${breakdown.installmentsCount} parcela(s)`
            : '—',
        ],
        [
          'Valor da parcela',
          breakdown.installmentsCount > 0
            ? breakdown.installmentValueFmt
            : '—',
        ],
        ['Correção das parcelas', breakdown.correctionLabel],
      ]
    : [
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

  return `
    <div class="contract-clause" style="margin: 16px 0 20px;">
      <p style="margin:0 0 8px;font-weight:bold;">Quadro resumo — condições de pagamento</p>
      <table style="width:100%;border-collapse:collapse;font-size:11pt;">${body}</table>
    </div>`;
}
