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

function dottedLine(label: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;gap:8px;margin:2px 0;font-size:10pt;line-height:1.35;">
    <span style="flex:1;overflow:hidden;white-space:nowrap;">${label}<span style="letter-spacing:1px;"> ${'.'.repeat(48)}</span></span>
    <span style="white-space:nowrap;font-weight:600;">${value}</span>
  </div>`;
}

/**
 * Quadro do contrato alinhado ao Resumo financeiro do formulário.
 * Lista APENAS parcelas com adicional.
 *
 * Formato obrigatório por linha:
 * Parcela 06 — Base R$ 1,96 — Adicional R$ 0,50 — Total R$ 2,46
 */
export function buildCompactBalloonFinanceScheduleHtml(
  summary: SaleContractBalloonFinanceSummary,
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

  const balloonOnlyLines = balloons
    .map((r) => {
      const n = padInstallmentNumber(r.installmentNumber);
      const line = `Parcela ${n} — Base ${formatCurrencyBRL(r.baseAmount)} — Adicional ${formatCurrencyBRL(r.balloonAddonAmount)} — Total ${formatCurrencyBRL(r.amount)}`;
      return `<div style="margin:3px 0;font-size:10pt;line-height:1.4;">${line}</div>`;
    })
    .join('');

  return `
    <div class="contract-clause contract-balloon-finance" style="margin:10px 0 14px;page-break-inside:avoid;" data-balloon-rows="${balloons.length}" data-source="buildBalloonFinancePreview">
      <div style="border:1px solid #222;padding:10px 12px;font-family:'Courier New',Courier,monospace;">
        <p style="margin:0 0 8px;text-align:center;font-weight:bold;font-size:11pt;letter-spacing:1px;text-transform:uppercase;font-family:'Times New Roman',Times,serif;">Quadro Financeiro</p>
        <div style="border-top:1px dashed #666;border-bottom:1px dashed #666;padding:6px 0;margin-bottom:8px;">
          ${dottedLine('Valor da venda', totalFmt)}
          ${dottedLine('Entrada', formatCurrencyBRL(summary.entryAmount))}
          ${dottedLine('Saldo financiado', formatCurrencyBRL(financed))}
          ${dottedLine('Parcelamento', `${summary.installmentsCount} parcelas mensais`)}
          ${dottedLine('Parcela base', baseFmt)}
        </div>
        <p style="margin:0 0 6px;font-weight:bold;font-size:10pt;text-transform:uppercase;letter-spacing:0.5px;font-family:'Times New Roman',Times,serif;">Parcelas com adicional</p>
        <div class="contract-balloon-only-table" data-balloon-only="true" data-row-count="${balloons.length}" style="border-top:1px dashed #666;border-bottom:1px dashed #666;padding:6px 0;margin-bottom:8px;">
          ${balloonOnlyLines}
        </div>
        <div>
          ${dottedLine('Valor total do contrato', totalFmt)}
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
