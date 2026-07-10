/**
 * Resumo financeiro de balões no contrato — MESMA fonte do formulário de venda.
 *
 * Fonte: buildBalloonFinancePreview (lib/saleBalloonInstallments.ts),
 * usada por SaleBalloonInstallmentsPanel ("Resumo financeiro").
 *
 * NUNCA inferir balão por:
 * - finance_receipts.amount
 * - diferença vs parcela-base
 * - quantidade de linhas em sale_balloon_installments
 *
 * Exibe somente parcelas com adicional > 0.
 */

import { formatCurrencyBRL } from '@/lib/currencyBrl';
import type { ContractFinanceReceiptRef } from '@/lib/contractPaymentDates';
import type { ContractInstallmentScheduleRow } from '@/lib/saleContractPaymentSummary';
import {
  buildBalloonFinancePreview,
  resolveSaleBalloonPlan,
  type SaleBalloonFormConfig,
  type SaleBalloonPlan,
} from '@/lib/saleBalloonInstallments';
import { resolveInstallmentPrincipal } from '@/lib/saleInstallmentCalc';

export type ContractBalloonAddonRef = {
  installment_number: number;
  additional_amount: number;
};

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
  /** Preview idêntico ao formulário (quando disponível). */
  formPreviewMatch: boolean;
};

export const BALLOON_ADDONS_REQUIRED_MESSAGE =
  'Venda marcada com parcelas balão, mas não há configuração de balão (balloon_config) nem addons válidos. Não é permitido inferir balões por diferença de valores.';

export const BALLOON_RECEIPT_MISSING_MESSAGE =
  'Inconsistência: parcela balão cadastrada sem finance_receipt correspondente (installment_number).';

function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
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
 * Monta o plano de balão como o formulário:
 * 1) sales.balloon_config via resolveSaleBalloonPlan
 * 2) fallback: balloonAddons explícitos (já filtrados pelo caller)
 */
export function resolveContractBalloonPlanFromSale(params: {
  sale: Record<string, unknown>;
  balloonAddons?: ContractBalloonAddonRef[] | null;
}): SaleBalloonPlan | null {
  const sale = params.sale;
  const useBalloon = Boolean(sale.use_balloon_installments);
  const installmentsCount = Math.max(1, Number(sale.installments_count) || 0);
  const contractValue =
    Number(sale.total_value) ||
    Number(sale.agreed_price) ||
    Number(sale.final_value) ||
    0;

  const rawConfig = sale.balloon_config as SaleBalloonFormConfig | null | undefined;
  if (useBalloon && rawConfig && typeof rawConfig === 'object') {
    const fromConfig = resolveSaleBalloonPlan({
      useBalloon: true,
      installmentsCount,
      contractValue,
      config: rawConfig,
    });
    if (fromConfig.enabled && fromConfig.items.length > 0) {
      return fromConfig;
    }
  }

  const addons = (params.balloonAddons || []).filter(
    (b) =>
      Number(b.installment_number) >= 1 &&
      money(Number(b.additional_amount) || 0) > 0.009,
  );
  if (addons.length > 0) {
    return {
      enabled: true,
      mode: 'MANUAL',
      items: addons
        .map((b) => ({
          installmentNumber: Number(b.installment_number),
          additionalAmount: money(Number(b.additional_amount) || 0),
        }))
        .sort((a, b) => a.installmentNumber - b.installmentNumber),
      config: null,
    };
  }

  return null;
}

/**
 * Resolve resumo do contrato com a MESMA lógica do Resumo financeiro do formulário.
 * Linhas de balão = apenas preview.balloonRows (adicional > 0).
 */
export function resolveSaleContractBalloonFinance(params: {
  sale: Record<string, unknown>;
  financeReceipts?: ContractFinanceReceiptRef[] | null;
  balloonAddons?: ContractBalloonAddonRef[] | null;
  isCashPayment?: boolean;
  contractModel?: unknown;
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

  const receipts = params.financeReceipts || [];
  const entryReceipt = receipts.find((r) => Number(r.installment_number) === 0);
  const entryFromSale = money(Number(sale.down_payment) || 0);
  const entryAmount = entryReceipt
    ? money(Number(entryReceipt.amount) || 0)
    : entryFromSale;

  const installmentsCount = Math.max(1, Number(sale.installments_count) || 0);
  const principal = money(
    resolveInstallmentPrincipal({
      totalValue: saleTotal,
      downPayment: entryAmount,
      contractModel: params.contractModel ?? sale.contract_model,
    }),
  );

  const plan = isCashPayment
    ? null
    : resolveContractBalloonPlanFromSale({
        sale,
        balloonAddons: params.balloonAddons,
      });

  const useBalloonFlag = Boolean(sale.use_balloon_installments);
  if (!isCashPayment && useBalloonFlag && (!plan || plan.items.length === 0)) {
    throw new Error(BALLOON_ADDONS_REQUIRED_MESSAGE);
  }

  if (!plan || plan.items.length === 0 || isCashPayment) {
    const monthly = receipts
      .filter((r) => Number(r.installment_number) >= 1)
      .map((r) => ({
        installmentNumber: Number(r.installment_number),
        amount: money(Number(r.amount) || 0),
        dueDate: r.due_date ?? null,
        baseAmount: money(Number(r.amount) || 0),
        balloonAddonAmount: 0,
        isBalloon: false,
      }))
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    const monthlySum = money(monthly.reduce((s, r) => s + r.amount, 0));
    return {
      hasBalloon: false,
      isCashPayment,
      installmentsCount: Math.max(monthly.length, installmentsCount, 1),
      entryAmount,
      entryDueDate: entryReceipt?.due_date
        ? String(entryReceipt.due_date).split('T')[0]
        : null,
      saleTotal,
      baseInstallmentValue: monthly[0]?.amount || 0,
      balloonCount: 0,
      balloonTotal: 0,
      commonCount: monthly.length,
      scheduleRows: monthly,
      balloonRows: [],
      monthlySum,
      grandTotal: money(entryAmount + monthlySum),
      totalsMatch: true,
      formPreviewMatch: true,
    };
  }

  // === MESMA função do formulário (SaleBalloonInstallmentsPanel) ===
  const preview = buildBalloonFinancePreview({
    finalValue: saleTotal,
    entryAmount,
    principal,
    installmentsCount,
    plan,
  });

  // Somente parcelas com adicional (já filtrado em buildBalloonFinancePreview).
  const balloonRows: ContractBalloonScheduleRow[] = preview.balloonRows.map(
    (r) => ({
      installmentNumber: r.installmentNumber,
      amount: money(r.finalAmount),
      dueDate: r.dueDateOverride ?? null,
      baseAmount: money(r.baseAmount),
      balloonAddonAmount: money(r.balloonAddonAmount),
      isBalloon: true,
    }),
  );

  const scheduleRows: ContractBalloonScheduleRow[] = preview.compositions.map(
    (c, idx) => ({
      installmentNumber: idx + 1,
      amount: money(c.amount),
      dueDate: c.dueDateOverride ?? null,
      baseAmount: money(c.baseAmount),
      balloonAddonAmount: money(c.balloonAddonAmount),
      isBalloon: money(c.balloonAddonAmount) > 0.009,
    }),
  );

  return {
    hasBalloon: balloonRows.length > 0,
    isCashPayment,
    installmentsCount: preview.installmentsCount,
    entryAmount: preview.entryAmount,
    entryDueDate: entryReceipt?.due_date
      ? String(entryReceipt.due_date).split('T')[0]
      : null,
    saleTotal: preview.saleTotal,
    baseInstallmentValue: preview.baseInstallmentValue,
    balloonCount: balloonRows.length,
    balloonTotal: preview.balloonTotal,
    commonCount: Math.max(0, preview.installmentsCount - balloonRows.length),
    scheduleRows,
    balloonRows,
    monthlySum: preview.installmentsSum,
    grandTotal: preview.grandTotal,
    totalsMatch: preview.totalsMatch,
    formPreviewMatch: true,
  };
}

export type ContractFinanceQuadroExtras = {
  /** Desconto concedido (ex.: R$ 0,00). */
  discountFmt?: string | null;
  /** Correção das parcelas (ex.: Parcelas fixas / IPCA). */
  correctionLabel?: string | null;
  /** Primeiro vencimento das parcelas. */
  firstDueDateFmt?: string | null;
};

/**
 * Célula compacta do Quadro Financeiro (4 colunas).
 */
function financeGridCell(label: string, value: string): string {
  return `<div class="contract-finance-cell">
    <span class="contract-finance-label">${label}</span>
    <span class="contract-finance-value">${value}</span>
  </div>`;
}

function financeQuadroShell(params: {
  gridCellsHtml: string;
  balloonSectionHtml?: string;
  totalFmt: string;
  balloonCount?: number;
  dataSource: string;
}): string {
  const balloonAttr =
    params.balloonCount != null ? ` data-balloon-rows="${params.balloonCount}"` : '';
  // Estilos embutidos: funciona em SV2/PADRAO/Recanto sem depender só do CSS do modelo.
  const scopedCss = `<style type="text/css">
.contract-finance-quadro{margin:0 0 8px 0;padding:6px 8px 5px;border:1px solid #1e40af;border-radius:3px;background:#fff;font-family:'Times New Roman',Times,serif;color:#111;page-break-inside:avoid;break-inside:avoid}
.contract-finance-quadro-title{margin:0 0 4px 0;padding:0 0 3px 0;text-align:center;font-size:10pt;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#1e40af;line-height:1.25;border-bottom:1px dotted #94a3b8;font-family:'Times New Roman',Times,serif}
.contract-finance-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:8px;row-gap:0;margin:0}
.contract-finance-cell{min-width:0;padding:3px 2px 4px;border-bottom:1px dotted #94a3b8}
.contract-finance-label{display:block;font-size:6.5pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#1e40af;margin:0 0 1px 0;line-height:1.15;font-family:'Times New Roman',Times,serif}
.contract-finance-value{display:block;font-size:9pt;font-weight:700;color:#111;line-height:1.2;word-break:break-word;font-family:'Times New Roman',Times,serif}
.contract-finance-balloons{margin:4px 0 0 0;padding:3px 0 2px;border-top:1px dotted #94a3b8;border-bottom:1px dotted #94a3b8}
.contract-finance-balloons-title{margin:0 0 2px 0;font-size:7.5pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#1e40af;line-height:1.2;font-family:'Times New Roman',Times,serif}
.contract-finance-balloon-line{margin:0 0 2px 0;padding:0;font-size:9pt;line-height:1.3;color:#111;font-family:'Times New Roman',Times,serif}
.contract-finance-total{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:4px 0 0 0;padding:3px 0 0 0;line-height:1.25;font-family:'Times New Roman',Times,serif}
.contract-finance-total-label{font-size:8pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#1e40af}
.contract-finance-total-value{font-size:10pt;font-weight:700;color:#111;white-space:nowrap}
</style>`;
  return `
    ${scopedCss}
    <div class="contract-clause contract-balloon-finance contract-payment-block contract-finance-quadro"${balloonAttr} data-source="${params.dataSource}">
      <p class="contract-finance-quadro-title">Quadro Financeiro</p>
      <div class="contract-finance-grid">
        ${params.gridCellsHtml}
      </div>
      ${params.balloonSectionHtml || ''}
      <div class="contract-finance-total">
        <span class="contract-finance-total-label">Valor total do contrato</span>
        <span class="contract-finance-total-value">${params.totalFmt}</span>
      </div>
    </div>`;
}

/**
 * Quadro Financeiro — condições financeiras (texto HTML tipográfico, grid 4 colunas).
 * Com balão: lista APENAS parcelas com adicional.
 * Extras (desconto/correção/vencimento) são só apresentação — sem alterar cálculo.
 */
export function buildCompactBalloonFinanceScheduleHtml(
  summary: SaleContractBalloonFinanceSummary,
  extras?: ContractFinanceQuadroExtras | null,
): string {
  if (!summary.hasBalloon || summary.isCashPayment) return '';
  const balloons = summary.balloonRows.filter(
    (r) => r.isBalloon && money(r.balloonAddonAmount) > 0.009,
  );
  if (balloons.length === 0) return '';

  const saleTotal = summary.saleTotal > 0 ? summary.saleTotal : summary.grandTotal;
  const financed = money(Math.max(0, saleTotal - summary.entryAmount));
  const baseFmt = formatCurrencyBRL(summary.baseInstallmentValue);
  const totalFmt = formatCurrencyBRL(saleTotal);
  const discountFmt = String(extras?.discountFmt || '').trim() || formatCurrencyBRL(0);
  const correctionLabel = String(extras?.correctionLabel || '').trim() || '—';
  const firstDue = String(extras?.firstDueDateFmt || '').trim() || '—';

  const gridCellsHtml = [
    financeGridCell('Valor da venda', totalFmt),
    financeGridCell('Desconto', discountFmt),
    financeGridCell('Entrada', formatCurrencyBRL(summary.entryAmount)),
    financeGridCell('Saldo financiado', formatCurrencyBRL(financed)),
    financeGridCell('Parcelamento', `${summary.installmentsCount} parcelas mensais`),
    financeGridCell('Parcela base', baseFmt),
    financeGridCell('Correção', correctionLabel),
    financeGridCell('Primeiro vencimento', firstDue),
  ].join('');

  const balloonOnlyLines = balloons
    .map((r) => {
      const n = padInstallmentNumber(r.installmentNumber);
      const line = `Parcela ${n} — Base ${formatCurrencyBRL(r.baseAmount)} — Adicional ${formatCurrencyBRL(r.balloonAddonAmount)} — Total ${formatCurrencyBRL(r.amount)}`;
      return `<p class="contract-finance-balloon-line">${line}</p>`;
    })
    .join('');

  const balloonSectionHtml = `
      <div class="contract-finance-balloons contract-balloon-only-table" data-balloon-only="true" data-row-count="${balloons.length}">
        <p class="contract-finance-balloons-title">Parcelas com adicional</p>
        ${balloonOnlyLines}
      </div>`;

  return financeQuadroShell({
    gridCellsHtml,
    balloonSectionHtml,
    totalFmt,
    balloonCount: balloons.length,
    dataSource: 'buildBalloonFinancePreview',
  });
}

/**
 * Quadro Financeiro sem balão — mesmas condições financeiras, sem seção de adicional.
 * Usado no SV2 quando o resumo superior não deve repetir dados financeiros.
 */
export function buildContractFinanceQuadroHtml(params: {
  saleTotalFmt: string;
  discountFmt?: string | null;
  entryFmt: string;
  financedFmt: string;
  parcelamentoLabel: string;
  baseInstallmentFmt: string;
  correctionLabel?: string | null;
  firstDueDateFmt?: string | null;
  isCashPayment?: boolean;
}): string {
  if (params.isCashPayment) {
    const gridCellsHtml = [
      financeGridCell('Valor da venda', params.saleTotalFmt),
      financeGridCell('Desconto', String(params.discountFmt || '').trim() || formatCurrencyBRL(0)),
      financeGridCell('Forma de pagamento', 'À vista'),
      financeGridCell('Correção', String(params.correctionLabel || '').trim() || '—'),
    ].join('');
    return financeQuadroShell({
      gridCellsHtml,
      totalFmt: params.saleTotalFmt,
      dataSource: 'finance-quadro',
    });
  }

  const gridCellsHtml = [
    financeGridCell('Valor da venda', params.saleTotalFmt),
    financeGridCell('Desconto', String(params.discountFmt || '').trim() || formatCurrencyBRL(0)),
    financeGridCell('Entrada', params.entryFmt),
    financeGridCell('Saldo financiado', params.financedFmt),
    financeGridCell('Parcelamento', params.parcelamentoLabel),
    financeGridCell('Parcela base', params.baseInstallmentFmt),
    financeGridCell('Correção', String(params.correctionLabel || '').trim() || '—'),
    financeGridCell(
      'Primeiro vencimento',
      String(params.firstDueDateFmt || '').trim() || '—',
    ),
  ].join('');

  return financeQuadroShell({
    gridCellsHtml,
    totalFmt: params.saleTotalFmt,
    dataSource: 'finance-quadro',
  });
}

/** Campos do resumo da 1ª página quando há balão. */
export function buildBalloonSummaryFieldPairs(
  summary: SaleContractBalloonFinanceSummary,
): Array<[string, string]> {
  if (!summary.hasBalloon) return [];
  return [
    ['PARCELAS', `${summary.installmentsCount} parcela(s)`],
    ['PARCELA BASE', formatCurrencyBRL(summary.baseInstallmentValue)],
    ['PARCELAS COM ADICIONAL', String(summary.balloonCount)],
    ['TOTAL DOS ADICIONAIS', formatCurrencyBRL(summary.balloonTotal)],
    ['FORMA ESPECIAL', 'Com parcelas balão'],
  ];
}

export function buildBalloonAwarePaymentClauseText(params: {
  summary: SaleContractBalloonFinanceSummary;
  valorTotalFmt: string;
  valorTotalExtenso: string;
  valorEntradaFmt: string;
  valorEntradaExtenso: string;
  dataPrimeiraParcelaFmt?: string;
  dataUltimaParcelaFmt?: string;
}): string {
  const s = params.summary;
  const hasEntry = s.entryAmount > 0.009;

  const intro = hasEntry
    ? `O valor da presente compra e venda é de <strong>${params.valorTotalFmt} (${params.valorTotalExtenso})</strong>, sendo <strong>${params.valorEntradaFmt} (${params.valorEntradaExtenso || 'zero reais'})</strong> pagos a título de entrada. `
    : `O valor da presente compra e venda é de <strong>${params.valorTotalFmt} (${params.valorTotalExtenso})</strong>. `;

  return `${intro}O saldo será pago em <strong>${s.installmentsCount} parcelas</strong> mensais, observada a parcela base indicada no Quadro Financeiro. As parcelas com adicional descritas no referido quadro receberão apenas os acréscimos contratados, permanecendo inalteradas as demais parcelas.`;
}
