/**
 * Resumo financeiro central para contratos com parcelas balão.
 * Fonte: finance_receipts.amount (+ sale_balloon_installments quando disponível).
 * Sem balão / valores iguais → hasBalloon=false (templates mantêm texto atual).
 */

import { formatCurrencyBRL } from '@/lib/currencyBrl';
import type { ContractFinanceReceiptRef } from '@/lib/contractPaymentDates';
import {
  hasVariableInstallmentAmounts,
  type ContractInstallmentScheduleRow,
} from '@/lib/saleContractPaymentSummary';

export type ContractBalloonScheduleRow = ContractInstallmentScheduleRow & {
  baseAmount: number;
  balloonAddonAmount: number;
  isBalloon: boolean;
};

export type SaleContractBalloonFinanceSummary = {
  hasBalloon: boolean;
  isCashPayment: boolean;
  installmentsCount: number;
  entryAmount: number;
  entryDueDate: string | null;
  saleTotal: number;
  baseInstallmentValue: number;
  balloonCount: number;
  balloonTotal: number;
  commonCount: number;
  scheduleRows: ContractBalloonScheduleRow[];
  balloonRows: ContractBalloonScheduleRow[];
  monthlySum: number;
  grandTotal: number;
  totalsMatch: boolean;
};

function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function formatDateBr(raw: unknown): string {
  const s = String(raw || '').split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function toScheduleRows(
  receipts: ContractFinanceReceiptRef[] | null | undefined,
): ContractInstallmentScheduleRow[] {
  return (receipts || [])
    .map((r) => ({
      installmentNumber: Number(r.installment_number),
      amount: money(Number(r.amount) || 0),
      dueDate: r.due_date ?? null,
    }))
    .filter((r) => Number.isFinite(r.installmentNumber));
}

/**
 * Resolve resumo a partir dos receipts (fonte oficial dos valores finais).
 * balloonAddons opcional: mapa installment_number → additional_amount.
 */
export function resolveSaleContractBalloonFinance(params: {
  sale: Record<string, unknown>;
  financeReceipts?: ContractFinanceReceiptRef[] | null;
  balloonAddons?: Array<{ installment_number: number; additional_amount: number }> | null;
  isCashPayment?: boolean;
}): SaleContractBalloonFinanceSummary {
  const sale = params.sale;
  const isCashPayment =
    params.isCashPayment ??
    String(sale.payment_type || '')
      .toLowerCase()
      .includes('vista');

  const saleTotal = money(
    Number(sale.total_value) ||
      Number(sale.agreed_price) ||
      Number(sale.final_value) ||
      0,
  );

  const rawRows = toScheduleRows(params.financeReceipts);
  const entryReceipt = rawRows.find((r) => r.installmentNumber === 0);
  const signalReceipt = rawRows.find((r) => r.installmentNumber === -1);
  const entryAmount = money(
    (entryReceipt?.amount || 0) +
      (Number(sale.down_payment) > 0 && !entryReceipt
        ? Number(sale.down_payment) || 0
        : 0),
  );
  // Prefer receipt entry; if only sales.down_payment and no receipt 0, use sale field
  const entryFromSale = money(Number(sale.down_payment) || 0);
  const resolvedEntry = entryReceipt
    ? money(entryReceipt.amount)
    : entryFromSale;

  const monthly = rawRows
    .filter((r) => r.installmentNumber >= 1)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  const installmentsCount = Math.max(
    monthly.length,
    Number(sale.installments_count) || 0,
    1,
  );

  const addonMap = new Map<number, number>();
  for (const b of params.balloonAddons || []) {
    const n = Number(b.installment_number);
    if (n >= 1) addonMap.set(n, money(Number(b.additional_amount) || 0));
  }

  const amounts = monthly.map((r) => money(r.amount));
  const inferredBase =
    amounts.length > 0 ? Math.min(...amounts) : 0;

  // Se temos addons persistidos, base = amount - addon; senão inferir pelo mínimo.
  const scheduleRows: ContractBalloonScheduleRow[] = monthly.map((r) => {
    const addonFromTable = addonMap.get(r.installmentNumber) || 0;
    const amount = money(r.amount);
    let balloonAddonAmount = addonFromTable;
    let baseAmount = money(amount - balloonAddonAmount);
    if (balloonAddonAmount <= 0 && amount > inferredBase + 0.009) {
      balloonAddonAmount = money(amount - inferredBase);
      baseAmount = inferredBase;
    } else if (balloonAddonAmount <= 0) {
      baseAmount = amount;
      balloonAddonAmount = 0;
    }
    return {
      installmentNumber: r.installmentNumber,
      amount,
      dueDate: r.dueDate,
      baseAmount,
      balloonAddonAmount,
      isBalloon: balloonAddonAmount > 0.009,
    };
  });

  const hasBalloon =
    !isCashPayment &&
    (scheduleRows.some((r) => r.isBalloon) ||
      hasVariableInstallmentAmounts(monthly) ||
      Boolean(sale.use_balloon_installments));

  const balloonRows = scheduleRows.filter((r) => r.isBalloon);
  const baseInstallmentValue =
    scheduleRows.find((r) => !r.isBalloon)?.baseAmount ??
    scheduleRows[0]?.baseAmount ??
    inferredBase;
  const balloonTotal = money(
    balloonRows.reduce((s, r) => s + r.balloonAddonAmount, 0),
  );
  const monthlySum = money(scheduleRows.reduce((s, r) => s + r.amount, 0));
  const entryForTotal = entryReceipt
    ? money(entryReceipt.amount)
    : resolvedEntry;
  // Sinal pago (-1) entra no total Recanto; PADRAO normalmente não tem -1 + entry juntos no mesmo sentido
  const signalPaid = signalReceipt ? money(signalReceipt.amount) : 0;
  const grandTotal = money(entryForTotal + monthlySum + (entryReceipt ? 0 : 0));
  // Prefer: entry receipt + monthly; if no entry receipt but down_payment, include it
  const grandWithEntry = entryReceipt
    ? money(money(entryReceipt.amount) + monthlySum)
    : money(resolvedEntry + monthlySum);
  const totalsMatch =
    Math.abs(Math.round(grandWithEntry * 100) - Math.round(saleTotal * 100)) <= 1 ||
    saleTotal <= 0;

  return {
    hasBalloon: Boolean(hasBalloon && balloonRows.length > 0),
    isCashPayment,
    installmentsCount,
    entryAmount: entryForTotal || resolvedEntry,
    entryDueDate: entryReceipt?.dueDate
      ? String(entryReceipt.dueDate).split('T')[0]
      : null,
    saleTotal,
    baseInstallmentValue,
    balloonCount: balloonRows.length,
    balloonTotal,
    commonCount: Math.max(0, scheduleRows.length - balloonRows.length),
    scheduleRows,
    balloonRows,
    monthlySum,
    grandTotal: grandWithEntry,
    totalsMatch,
  };
}

/** Texto dinâmico da cláusula de preço/pagamento (PADRAO Quarta / SV2 Segunda). */
export function buildBalloonAwarePaymentClauseText(params: {
  summary: SaleContractBalloonFinanceSummary;
  valorTotalFmt: string;
  valorTotalExtenso: string;
  valorEntradaFmt: string;
  valorEntradaExtenso: string;
  dataPrimeiraParcelaFmt: string;
  dataUltimaParcelaFmt: string;
  buyerLabel?: string;
}): string {
  const s = params.summary;
  const buyer = params.buyerLabel || 'PROMISSÁRIO COMPRADOR';
  const baseFmt = formatCurrencyBRL(s.baseInstallmentValue);
  const hasEntry = s.entryAmount > 0.009;

  if (hasEntry) {
    return `Fica a cargo exclusivo do ${buyer}, o valor de <strong>${params.valorTotalFmt} (${params.valorTotalExtenso})</strong>, sendo <strong>${params.valorEntradaFmt} (${params.valorEntradaExtenso || 'zero reais'})</strong> a título de entrada, e o saldo restante parcelado em <strong>${s.installmentsCount} parcelas</strong> mensais e sucessivas. As parcelas possuem valor base de <strong>${baseFmt}</strong>, ressalvadas as parcelas balão discriminadas no Quadro Financeiro deste contrato, que terão os respectivos acréscimos e valores finais ali indicados. Sendo a primeira parcela para o dia <strong>${params.dataPrimeiraParcelaFmt}</strong> e a última parcela para o dia <strong>${params.dataUltimaParcelaFmt}</strong>.`;
  }

  return `Fica a cargo exclusivo do ${buyer}, o valor de <strong>${params.valorTotalFmt} (${params.valorTotalExtenso})</strong>, parcelado em <strong>${s.installmentsCount} parcelas</strong> mensais e sucessivas. As parcelas possuem valor base de <strong>${baseFmt}</strong>, ressalvadas as parcelas balão discriminadas no Quadro Financeiro deste contrato, que terão os respectivos acréscimos e valores finais ali indicados. Sendo a primeira parcela para o dia <strong>${params.dataPrimeiraParcelaFmt}</strong> e a última parcela para o dia <strong>${params.dataUltimaParcelaFmt}</strong>.`;
}

/**
 * Quadro financeiro compacto: entrada + comuns resumidas + balões individuais + total.
 * Evita listar dezenas de parcelas iguais.
 */
export function buildCompactBalloonFinanceScheduleHtml(
  summary: SaleContractBalloonFinanceSummary,
): string {
  if (!summary.hasBalloon || summary.isCashPayment) return '';

  const lines: string[] = [];

  if (summary.entryAmount > 0.009) {
    lines.push(
      `<tr><td style="padding:5px 8px;border:1px solid #ddd;">Entrada</td><td style="padding:5px 8px;border:1px solid #ddd;">${formatDateBr(summary.entryDueDate)}</td><td style="padding:5px 8px;border:1px solid #ddd;text-align:right;">${formatCurrencyBRL(summary.entryAmount)}</td></tr>`,
    );
  }

  if (summary.commonCount > 0) {
    lines.push(
      `<tr><td style="padding:5px 8px;border:1px solid #ddd;" colspan="2">${summary.commonCount} parcela(s) comum(ns) de ${formatCurrencyBRL(summary.baseInstallmentValue)}</td><td style="padding:5px 8px;border:1px solid #ddd;text-align:right;">${formatCurrencyBRL(money(summary.commonCount * summary.baseInstallmentValue))}</td></tr>`,
    );
  }

  for (const row of summary.balloonRows) {
    lines.push(
      `<tr style="background:#fff8e7;"><td style="padding:5px 8px;border:1px solid #ddd;"><strong>Parcela ${row.installmentNumber}/${summary.installmentsCount}</strong> — Parcela balão<br/><span style="font-size:9.5pt;color:#555;">Base ${formatCurrencyBRL(row.baseAmount)} + balão ${formatCurrencyBRL(row.balloonAddonAmount)}</span></td><td style="padding:5px 8px;border:1px solid #ddd;">${formatDateBr(row.dueDate)}</td><td style="padding:5px 8px;border:1px solid #ddd;text-align:right;"><strong>${formatCurrencyBRL(row.amount)}</strong></td></tr>`,
    );
  }

  lines.push(
    `<tr><td colspan="2" style="padding:5px 8px;border:1px solid #ddd;font-weight:bold;">Total da venda</td><td style="padding:5px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;">${formatCurrencyBRL(summary.saleTotal > 0 ? summary.saleTotal : summary.grandTotal)}</td></tr>`,
  );

  return `
    <div class="contract-clause contract-balloon-finance" style="margin: 12px 0 20px;">
      <p style="margin:0 0 8px;font-weight:bold;">Quadro Financeiro — condições de pagamento${summary.hasBalloon ? ' (com parcelas balão)' : ''}</p>
      <table style="width:100%;border-collapse:collapse;font-size:10.5pt;">
        <thead>
          <tr>
            <th style="padding:5px 8px;border:1px solid #ddd;text-align:left;">Descrição</th>
            <th style="padding:5px 8px;border:1px solid #ddd;text-align:left;">Vencimento</th>
            <th style="padding:5px 8px;border:1px solid #ddd;text-align:right;">Valor</th>
          </tr>
        </thead>
        <tbody>${lines.join('')}</tbody>
      </table>
    </div>`;
}

/** Campos do resumo da 1ª página quando há balão. */
export function buildBalloonSummaryFieldPairs(
  summary: SaleContractBalloonFinanceSummary,
): Array<[string, string]> {
  if (!summary.hasBalloon) return [];
  return [
    ['PARCELAS', `${summary.installmentsCount} parcela(s)`],
    ['PARCELA BASE', formatCurrencyBRL(summary.baseInstallmentValue)],
    ['PARCELAS BALÃO', String(summary.balloonCount)],
    ['TOTAL DOS BALÕES', formatCurrencyBRL(summary.balloonTotal)],
    ['FORMA ESPECIAL', 'Com parcelas balão'],
  ];
}
