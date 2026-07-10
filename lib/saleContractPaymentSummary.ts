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

function formatDateBr(raw: unknown): string {
  const s = String(raw || '').split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
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

/** Tabela de parcelas com valores reais (usada quando há balão / valores variáveis). */
export function buildSaleContractInstallmentScheduleHtml(
  rows: ContractInstallmentScheduleRow[],
): string {
  const monthly = rows
    .filter((r) => r.installmentNumber >= 1)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  if (monthly.length === 0) return '';

  const amounts = monthly.map((r) => Math.round((Number(r.amount) || 0) * 100) / 100);
  const baseAmount = Math.min(...amounts);
  const total = amounts.reduce((s, a) => s + a, 0);

  const body = monthly
    .map((r) => {
      const amount = Math.round((Number(r.amount) || 0) * 100) / 100;
      const isBalloon = amount > baseAmount + 0.009;
      const label =
        r.label ||
        (isBalloon
          ? `Parcela ${r.installmentNumber} (balão)`
          : `Parcela ${r.installmentNumber}`);
      const rowStyle = isBalloon ? 'background:#fff8e7;' : '';
      return `<tr style="${rowStyle}"><td style="padding:5px 8px;border:1px solid #ddd;">${label}</td><td style="padding:5px 8px;border:1px solid #ddd;">${formatDateBr(r.dueDate)}</td><td style="padding:5px 8px;border:1px solid #ddd;text-align:right;">${formatBRL(amount)}</td></tr>`;
    })
    .join('');

  const totalRow = `<tr><td colspan="2" style="padding:5px 8px;border:1px solid #ddd;font-weight:bold;">Total das parcelas</td><td style="padding:5px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;">${formatBRL(total)}</td></tr>`;

  return `
    <div class="contract-clause" style="margin: 12px 0 20px;">
      <p style="margin:0 0 8px;font-weight:bold;">Quadro de parcelas</p>
      <table style="width:100%;border-collapse:collapse;font-size:10.5pt;">
        <thead>
          <tr>
            <th style="padding:5px 8px;border:1px solid #ddd;text-align:left;">Parcela</th>
            <th style="padding:5px 8px;border:1px solid #ddd;text-align:left;">Vencimento</th>
            <th style="padding:5px 8px;border:1px solid #ddd;text-align:right;">Valor</th>
          </tr>
        </thead>
        <tbody>${body}${totalRow}</tbody>
      </table>
    </div>`;
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
  },
): string {
  const balloon = options?.balloonSummary ?? breakdown.balloonSummary ?? null;
  const variable =
    balloon?.hasBalloon === true ||
    options?.hasVariableInstallments === true ||
    (options?.scheduleRows
      ? hasVariableInstallmentAmounts(options.scheduleRows)
      : false);

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
  ];

  if (variable && balloon?.hasBalloon) {
    rows.push(
      ['Parcela base', breakdown.installmentValueFmt],
      ['Parcelas balão', String(balloon.balloonCount)],
      ['Total dos balões', formatBRL(balloon.balloonTotal)],
      ['Forma especial', 'Com parcelas balão'],
    );
  } else {
    rows.push([
      variable ? 'Valor base da parcela' : 'Valor da parcela',
      breakdown.isCashPayment
        ? '—'
        : variable
          ? `${breakdown.installmentValueFmt} (valores por parcela no quadro abaixo)`
          : breakdown.installmentValueFmt,
    ]);
  }

  rows.push(['Correção das parcelas', breakdown.correctionLabel]);

  const body = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;width:42%;">${label}</td><td style="padding:6px 10px;border:1px solid #ddd;">${value}</td></tr>`,
    )
    .join('');

  let scheduleHtml = '';
  if (!breakdown.isCashPayment && variable) {
    if (balloon?.hasBalloon) {
      scheduleHtml = buildCompactBalloonFinanceScheduleHtml(balloon);
    } else if (options?.scheduleRows?.length) {
      scheduleHtml = buildSaleContractInstallmentScheduleHtml(options.scheduleRows);
    }
  }

  return `
    <div class="contract-clause" style="margin: 16px 0 20px;">
      <p style="margin:0 0 8px;font-weight:bold;">Quadro resumo — condições de pagamento</p>
      <table style="width:100%;border-collapse:collapse;font-size:11pt;">${body}</table>
    </div>${scheduleHtml}`;
}
