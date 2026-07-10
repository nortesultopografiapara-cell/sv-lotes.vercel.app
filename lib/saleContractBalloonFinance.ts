/**
 * Resumo financeiro central para contratos com parcelas balão.
 *
 * FONTE OBRIGATÓRIA DE BALÕES: sale_balloon_installments (via balloonAddons).
 * NUNCA inferir balão por diferença de finance_receipts.amount vs parcela base.
 * Diferenças de centavos por arredondamento NÃO criam balão.
 *
 * ATENÇÃO: este módulo altera apenas a APRESENTAÇÃO do contrato.
 * Não altera cálculo, Asaas, financeiro, portal ou persistência.
 */

import { formatCurrencyBRL } from '@/lib/currencyBrl';
import type { ContractFinanceReceiptRef } from '@/lib/contractPaymentDates';
import type { ContractInstallmentScheduleRow } from '@/lib/saleContractPaymentSummary';

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
};

export const BALLOON_ADDONS_REQUIRED_MESSAGE =
  'Venda marcada com parcelas balão, mas sale_balloon_installments não foi carregado ou está vazio. Não é permitido inferir balões por diferença de valores.';

export const BALLOON_RECEIPT_MISSING_MESSAGE =
  'Inconsistência: parcela balão cadastrada sem finance_receipt correspondente (installment_number).';

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

/** Moda dos valores (centavos) — ignora outliers de arredondamento. */
function modeAmount(amounts: number[]): number {
  if (amounts.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const a of amounts) {
    const k = money(a);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = amounts[0];
  let bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) {
      best = val;
      bestCount = count;
    }
  }
  return money(best);
}

/**
 * Resolve resumo a partir dos receipts + sale_balloon_installments.
 * balloonAddons é a ÚNICA fonte de quais parcelas são balão.
 */
export function resolveSaleContractBalloonFinance(params: {
  sale: Record<string, unknown>;
  financeReceipts?: ContractFinanceReceiptRef[] | null;
  balloonAddons?: ContractBalloonAddonRef[] | null;
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

  // Fonte exclusiva: registros persistidos (nunca inferir por amount).
  const balloonByInstallmentNumber = new Map<number, number>();
  for (const b of params.balloonAddons || []) {
    const n = Number(b.installment_number);
    const addon = money(Number(b.additional_amount) || 0);
    if (n >= 1 && addon > 0.009) {
      balloonByInstallmentNumber.set(n, addon);
    }
  }

  const useBalloonFlag = Boolean(sale.use_balloon_installments);
  if (
    !isCashPayment &&
    useBalloonFlag &&
    balloonByInstallmentNumber.size === 0
  ) {
    throw new Error(BALLOON_ADDONS_REQUIRED_MESSAGE);
  }

  const receiptByNumber = new Map(
    monthly.map((r) => [r.installmentNumber, r] as const),
  );

  // Integridade: cada balão persistido deve ter finance_receipt.
  for (const n of balloonByInstallmentNumber.keys()) {
    if (!receiptByNumber.has(n)) {
      throw new Error(`${BALLOON_RECEIPT_MISSING_MESSAGE} Parcela nº ${n}.`);
    }
  }

  const scheduleRows: ContractBalloonScheduleRow[] = monthly.map((r) => {
    const amount = money(r.amount);
    const addon = balloonByInstallmentNumber.get(r.installmentNumber) || 0;
    const isBalloon = addon > 0.009;
    return {
      installmentNumber: r.installmentNumber,
      amount,
      dueDate: r.dueDate,
      baseAmount: isBalloon ? money(amount - addon) : amount,
      balloonAddonAmount: isBalloon ? addon : 0,
      isBalloon,
    };
  });

  // Linhas do quadro = exatamente os registros persistidos (ordem por número).
  const balloonRows = [...balloonByInstallmentNumber.keys()]
    .sort((a, b) => a - b)
    .map((n) => {
      const row = scheduleRows.find((r) => r.installmentNumber === n)!;
      return row;
    });

  const commonAmounts = scheduleRows
    .filter((r) => !r.isBalloon)
    .map((r) => r.amount);
  const baseFromBalloon =
    balloonRows.length > 0 ? balloonRows[0].baseAmount : 0;
  const baseInstallmentValue =
    commonAmounts.length > 0
      ? modeAmount(commonAmounts)
      : baseFromBalloon;

  const balloonTotal = money(
    balloonRows.reduce((s, r) => s + r.balloonAddonAmount, 0),
  );
  const monthlySum = money(scheduleRows.reduce((s, r) => s + r.amount, 0));
  const entryForTotal = entryReceipt
    ? money(entryReceipt.amount)
    : resolvedEntry;
  const grandWithEntry = entryReceipt
    ? money(money(entryReceipt.amount) + monthlySum)
    : money(resolvedEntry + monthlySum);
  const totalsMatch =
    Math.abs(Math.round(grandWithEntry * 100) - Math.round(saleTotal * 100)) <=
      1 || saleTotal <= 0;

  const hasBalloon = !isCashPayment && balloonRows.length > 0;

  return {
    hasBalloon,
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

function dottedLine(label: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;gap:8px;margin:2px 0;font-size:10pt;line-height:1.35;">
    <span style="flex:1;overflow:hidden;white-space:nowrap;">${label}<span style="letter-spacing:1px;"> ${'.'.repeat(48)}</span></span>
    <span style="white-space:nowrap;font-weight:600;">${value}</span>
  </div>`;
}

/**
 * Quadro financeiro executivo compacto (~meia página).
 * REGRA OBRIGATÓRIA: a lista/tabela contém EXCLUSIVAMENTE as parcelas balão persistidas.
 * Linhas = balloonRows.length === sale_balloon_installments.length.
 */
export function buildCompactBalloonFinanceScheduleHtml(
  summary: SaleContractBalloonFinanceSummary,
): string {
  if (!summary.hasBalloon || summary.isCashPayment) return '';
  const balloons = summary.balloonRows.filter((r) => r.isBalloon);
  if (balloons.length === 0) return '';

  const saleTotal = summary.saleTotal > 0 ? summary.saleTotal : summary.grandTotal;
  const financed = money(Math.max(0, saleTotal - summary.entryAmount));
  const baseFmt = formatCurrencyBRL(summary.baseInstallmentValue);
  const totalFmt = formatCurrencyBRL(saleTotal);

  const addonAmounts = [
    ...new Set(balloons.map((r) => money(r.balloonAddonAmount))),
  ];
  const sameAddon = addonAmounts.length === 1;
  const addonLabel = sameAddon
    ? formatCurrencyBRL(addonAmounts[0])
    : 'valores distintos (ver linhas abaixo)';

  const incidents = formatBalloonIncidentNumbers(
    balloons.map((r) => r.installmentNumber),
  );

  const balloonOnlyLines = balloons
    .map((r) =>
      dottedLine(
        `Parcela ${padInstallmentNumber(r.installmentNumber)}`,
        formatCurrencyBRL(r.amount),
      ),
    )
    .join('');

  return `
    <div class="contract-clause contract-balloon-finance" style="margin:10px 0 14px;page-break-inside:avoid;" data-balloon-rows="${balloons.length}">
      <div style="border:1px solid #222;padding:10px 12px;font-family:'Courier New',Courier,monospace;">
        <p style="margin:0 0 8px;text-align:center;font-weight:bold;font-size:11pt;letter-spacing:1px;text-transform:uppercase;font-family:'Times New Roman',Times,serif;">Quadro Financeiro</p>
        <div style="border-top:1px dashed #666;border-bottom:1px dashed #666;padding:6px 0;margin-bottom:8px;">
          ${dottedLine('Valor da venda', totalFmt)}
          ${dottedLine('Entrada', formatCurrencyBRL(summary.entryAmount))}
          ${dottedLine('Saldo financiado', formatCurrencyBRL(financed))}
          ${dottedLine('Parcelamento', `${summary.installmentsCount} parcelas mensais`)}
          ${dottedLine('Parcela base', baseFmt)}
        </div>
        <p style="margin:0 0 6px;font-weight:bold;font-size:10pt;text-transform:uppercase;letter-spacing:0.5px;font-family:'Times New Roman',Times,serif;">Parcelas balão</p>
        <div style="margin:0 0 8px;font-size:10pt;line-height:1.45;">
          <div>Quantidade: <strong>${String(balloons.length).padStart(2, '0')}</strong></div>
          <div>Acréscimo: <strong>${addonLabel}</strong></div>
          <div>Incidem nas parcelas: <strong>${incidents}</strong></div>
        </div>
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
    ['PARCELAS BALÃO', String(summary.balloonCount)],
    ['TOTAL DOS BALÕES', formatCurrencyBRL(summary.balloonTotal)],
    ['FORMA ESPECIAL', 'Com parcelas balão'],
  ];
}
