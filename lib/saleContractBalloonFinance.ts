/**
 * Resumo financeiro central para contratos com parcelas balão.
 * Fonte: finance_receipts.amount (+ sale_balloon_installments quando disponível).
 * Sem balão / valores iguais → hasBalloon=false (templates mantêm texto atual).
 *
 * ATENÇÃO: este módulo altera apenas a APRESENTAÇÃO do contrato.
 * Não altera cálculo, Asaas, financeiro, portal ou persistência.
 */

import { formatCurrencyBRL } from '@/lib/currencyBrl';
import type { ContractFinanceReceiptRef } from '@/lib/contractPaymentDates';
import {
  hasVariableInstallmentAmounts,
  type ContractInstallmentScheduleRow,
} from '@/lib/saleContractPaymentSummary';

const extenso = require('extenso');

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

function formatCurrencyExtenso(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'zero reais';
  try {
    return extenso(value.toFixed(2).replace('.', ','), { mode: 'currency' });
  } catch {
    return '';
  }
}

function padInstallmentNumber(n: number): string {
  return String(n).padStart(2, '0');
}

/** "06, 18, 30 e 42" */
export function formatBalloonIncidentNumbers(nums: number[]): string {
  const parts = nums.map(padInstallmentNumber);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
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
  const inferredBase = amounts.length > 0 ? Math.min(...amounts) : 0;

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
  void signalReceipt;
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
  const hasEntry = s.entryAmount > 0.009;

  const intro = hasEntry
    ? `O valor da presente compra e venda é de <strong>${params.valorTotalFmt} (${params.valorTotalExtenso})</strong>, sendo <strong>${params.valorEntradaFmt} (${params.valorEntradaExtenso || 'zero reais'})</strong> pagos a título de entrada. `
    : `O valor da presente compra e venda é de <strong>${params.valorTotalFmt} (${params.valorTotalExtenso})</strong>. `;

  return `${intro}O saldo será pago em <strong>${s.installmentsCount} parcelas</strong> mensais, observada a parcela base indicada no Quadro Financeiro. As parcelas balão descritas no referido quadro receberão apenas os acréscimos contratados, permanecendo inalteradas as demais parcelas.`;
}

/**
 * Quadro financeiro executivo compacto (~meia página).
 * Lista APENAS as parcelas balão — nunca todas as parcelas do financiamento.
 */
export function buildCompactBalloonFinanceScheduleHtml(
  summary: SaleContractBalloonFinanceSummary,
): string {
  if (!summary.hasBalloon || summary.isCashPayment) return '';

  const saleTotal = summary.saleTotal > 0 ? summary.saleTotal : summary.grandTotal;
  const financed = money(Math.max(0, saleTotal - summary.entryAmount));
  const baseFmt = formatCurrencyBRL(summary.baseInstallmentValue);
  const baseExt = formatCurrencyExtenso(summary.baseInstallmentValue);
  const totalFmt = formatCurrencyBRL(saleTotal);
  const totalExt = formatCurrencyExtenso(saleTotal);

  const addonAmounts = [
    ...new Set(summary.balloonRows.map((r) => money(r.balloonAddonAmount))),
  ];
  const sameAddon = addonAmounts.length === 1;
  const addonFmt = sameAddon ? formatCurrencyBRL(addonAmounts[0]) : '';
  const addonExt = sameAddon ? formatCurrencyExtenso(addonAmounts[0]) : '';
  const addonBlock = sameAddon
    ? `<div><span style="font-weight:bold;">Acréscimo por parcela:</span><br/>${addonFmt}<br/><span style="font-size:8.5pt;color:#444;">(${addonExt})</span></div>`
    : `<div><span style="font-weight:bold;">Acréscimo por parcela:</span><br/><span style="font-weight:normal;">Valores distintos conforme tabela resumida</span></div>`;

  const incidents = formatBalloonIncidentNumbers(
    summary.balloonRows.map((r) => r.installmentNumber),
  );

  const cell =
    'padding:5px 7px;border:1px solid #bbb;font-size:9.5pt;vertical-align:top;';
  const th =
    'padding:4px 6px;border:1px solid #bbb;font-size:9pt;text-align:left;background:#f5f5f5;';

  const balloonTableRows = summary.balloonRows
    .map(
      (r) =>
        `<tr><td style="${cell}text-align:center;width:40%;">${padInstallmentNumber(r.installmentNumber)}</td><td style="${cell}text-align:right;">${formatCurrencyBRL(r.amount)}</td></tr>`,
    )
    .join('');

  return `
    <div class="contract-clause contract-balloon-finance" style="margin:10px 0 14px;page-break-inside:avoid;">
      <div style="border:1px solid #222;padding:8px 10px;">
        <p style="margin:0 0 8px;text-align:center;font-weight:bold;font-size:11pt;letter-spacing:0.6px;text-transform:uppercase;">Quadro Financeiro</p>

        <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
          <tr>
            <td style="${cell}width:33.33%;">
              <div style="font-weight:bold;">Valor da venda:</div>
              ${totalFmt}
            </td>
            <td style="${cell}width:33.33%;">
              <div style="font-weight:bold;">Entrada:</div>
              ${formatCurrencyBRL(summary.entryAmount)}
            </td>
            <td style="${cell}width:33.33%;">
              <div style="font-weight:bold;">Saldo financiado:</div>
              ${formatCurrencyBRL(financed)}
            </td>
          </tr>
          <tr>
            <td style="${cell}">
              <div style="font-weight:bold;">Parcelamento:</div>
              ${summary.installmentsCount} parcelas mensais
            </td>
            <td style="${cell}" colspan="2">
              <div style="font-weight:bold;">Parcela base:</div>
              ${baseFmt}<br/><span style="font-size:8.5pt;color:#444;">(${baseExt})</span>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 6px;font-weight:bold;font-size:10pt;text-transform:uppercase;letter-spacing:0.4px;">Parcelas balão</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
          <tr>
            <td style="${cell}width:33.33%;">
              <div style="font-weight:bold;">Quantidade:</div>
              ${summary.balloonCount} parcela${summary.balloonCount === 1 ? '' : 's'} balão
            </td>
            <td style="${cell}width:33.33%;">${addonBlock}</td>
            <td style="${cell}width:33.33%;">
              <div style="font-weight:bold;">Incidentes nas parcelas:</div>
              ${incidents}
            </td>
          </tr>
        </table>

        <p style="margin:0 0 4px;font-weight:bold;font-size:9.5pt;">Tabela resumida — somente parcelas balão</p>
        <table style="width:100%;max-width:320px;border-collapse:collapse;margin:0 0 8px;">
          <thead>
            <tr>
              <th style="${th}text-align:center;">Parcela</th>
              <th style="${th}text-align:right;">Valor final</th>
            </tr>
          </thead>
          <tbody>${balloonTableRows}</tbody>
        </table>

        <div style="border-top:1px solid #222;padding-top:6px;margin-top:2px;">
          <div style="font-weight:bold;">Valor total do contrato</div>
          <div>${totalFmt}</div>
          <div style="font-size:8.5pt;color:#444;">(${totalExt})</div>
        </div>
      </div>
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
