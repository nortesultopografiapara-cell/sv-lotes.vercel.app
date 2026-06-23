/**
 * Quadro financeiro do contrato padrão (Meneses / SV LOTES 2.0) — não Recanto Primavera.
 */

import {
  computeInstallmentDisplayValue,
  downPaymentReducesInstallmentBase,
} from '@/lib/saleInstallmentCalc';
import { formatInstallmentCorrectionLabel } from '@/lib/installmentCorrectionType';

function formatBRL(val: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
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
};

export function resolveSaleContractPaymentBreakdown(
  sale: Record<string, unknown>,
  options?: { contractModel?: unknown; isCashPayment?: boolean },
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

  const installmentValue = isCashPayment
    ? 0
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
  };
}

export function buildSaleContractPaymentSummaryHtml(
  breakdown: SaleContractPaymentBreakdown,
): string {
  const rows = [
    ['Valor do lote', breakdown.lotPriceFmt],
    ['Desconto concedido', breakdown.discountFmt],
    ['Valor da entrada', breakdown.isCashPayment ? '—' : breakdown.entryFmt],
    [
      'Saldo parcelado',
      breakdown.isCashPayment ? '—' : breakdown.installmentBalanceFmt,
    ],
    [
      'Quantidade de parcelas',
      breakdown.isCashPayment ? 'À vista' : String(breakdown.installmentsCount),
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
