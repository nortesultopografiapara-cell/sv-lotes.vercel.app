import { addProfessionalFooterAndSignature } from '@/lib/pdfUtils';
import type {
  CanonicalFinanceReport,
  CanonicalSplitLeg,
  CanonicalWalletMovement,
} from './canonicalFinanceTypes';
import {
  financeReportFilename,
  formatMoneyBr,
} from './financeReportFormat';
import { formatReportSharePercent } from './splitForReport';
import {
  formatSplitBeneficiaryLabel,
  formatSplitSharePercentLabel,
} from './splitPresentation';
import {
  FROZEN_BANK_IDENTITY_MISSING_LABEL,
  formatFrozenBankIdentityCompact,
  formatPaidAtDisplay,
  hasFrozenBankIdentity,
} from './frozenBankIdentity';
import {
  COMPANY_BANK_ACCOUNT_KIND_LABELS,
  isCompanyBankAccountKind,
} from '@/lib/finance/companyFinancialAccountBankIdentity';

const NAVY: [number, number, number] = [30, 64, 107];
const TEAL: [number, number, number] = [13, 115, 119];
const HEAD = { fillColor: NAVY as [number, number, number], textColor: 255, fontStyle: 'bold' as const };

type JsPdfDoc = import('jspdf').jsPDF;
type AutoTableFn = (doc: JsPdfDoc, options: Record<string, unknown>) => void;

export type FinancePdfRenderOptions = {
  logoBase64?: string | null;
};

function lastTableY(doc: JsPdfDoc, fallback: number): number {
  return ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || fallback) + 8;
}

function destinationBodyRows(report: CanonicalFinanceReport): any[] {
  if (!report.destinations.rows.length) {
    return [['Sem destinos no período', '—', '—', '—', '—', '—']];
  }
  return report.destinations.rows.map((row) => {
    const frozen = row.frozenBankIdentity;
    const frozenOk = hasFrozenBankIdentity(frozen);
    const inst = frozenOk ? frozen?.destInstitution || '—' : '—';
    const compact = frozenOk
      ? formatFrozenBankIdentityCompact(frozen)
      : row.bankIdentityFrozen === false
        ? FROZEN_BANK_IDENTITY_MISSING_LABEL
        : '—';
    return [
      formatSplitBeneficiaryLabel(row.beneficiaryName),
      inst,
      compact,
      row.sharePercent == null ? '—' : formatReportSharePercent(row.sharePercent),
      formatMoneyBr(row.grossAmount),
      row.amountKindLabel,
    ];
  });
}

function destinationSummaryRows(report: CanonicalFinanceReport): any[] {
  const rows: unknown[] = [
    [
      {
        content: 'Distribuição bruta prevista',
        colSpan: 5,
        styles: { fontStyle: 'bold' },
      },
      formatMoneyBr(report.destinations.grossPredictedTotal),
    ],
    [
      {
        content: 'Líquido confirmado disponível',
        colSpan: 5,
        styles: { fontStyle: 'bold' },
      },
      formatMoneyBr(report.destinations.netConfirmedTotal),
    ],
  ];
  if (report.destinations.persistedFeeTotal != null) {
    rows.splice(1, 0, [
      {
        content: '(−) Tarifa/ajuste persistido',
        colSpan: 5,
      },
      formatMoneyBr(report.destinations.persistedFeeTotal),
    ]);
  }
  return rows;
}

function drawHeader(
  doc: JsPdfDoc,
  report: CanonicalFinanceReport,
  title: string,
  logoBase64: string | null | undefined,
  pageWidth: number,
): number {
  let y = 14;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 14, 10, 22, 12, undefined, 'FAST');
    } catch {
      /* logo opcional */
    }
  }
  const x = logoBase64 ? 40 : 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('SV LOTES', x, y);
  doc.setFontSize(13);
  doc.text(title, x, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(50);
  doc.text(report.meta.companyName, x, y + 13);
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(`CNPJ: ${report.meta.companyDocument}`, x, y + 18);
  doc.text(`Período: ${report.meta.periodLabel}`, x, y + 23);
  doc.text(`Emissão: ${report.meta.generatedAtLabel}`, pageWidth - 14, y + 7, { align: 'right' });
  y = 42;
  doc.setFontSize(7.5);
  doc.setTextColor(80);
  for (const line of [...report.meta.filterLines, ...report.meta.dateSemantics]) {
    doc.text(line, 14, y, { maxWidth: pageWidth - 28 });
    y += 4;
  }
  return y + 2;
}

function kvTable(
  doc: JsPdfDoc,
  autoTable: AutoTableFn,
  startY: number,
  title: string,
  rows: Array<[string, string]>,
) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(title, 14, startY);
  autoTable(doc, {
    startY: startY + 3,
    head: [['Descrição', 'Valor']],
    body: rows,
    styles: { fontSize: 9, cellPadding: 2.2, font: 'helvetica' },
    headStyles: HEAD,
    columnStyles: {
      0: { cellWidth: 120 },
      1: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });
}

function pageFooter(doc: JsPdfDoc) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(200);
    doc.line(14, h - 12, w - 14, h - 12);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text('SV LOTES — Relatório financeiro', 14, h - 7);
    doc.text(`Página ${i}`, w - 14, h - 7, { align: 'right' });
  }
}

async function withFooter(doc: JsPdfDoc, companyName: string, kind: string) {
  pageFooter(doc);
  await addProfessionalFooterAndSignature(doc, companyName, kind);
}

export async function buildFinanceResumidoPdf(
  report: CanonicalFinanceReport,
  options: FinancePdfRenderOptions = {},
): Promise<JsPdfDoc> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = drawHeader(doc, report, 'RELATÓRIO FINANCEIRO RESUMIDO', options.logoBase64, pageWidth);

  kvTable(doc, autoTable, y, 'MOVIMENTAÇÃO DE CAIXA', [
    ['Saldo inicial (caixa anterior ao período)', formatMoneyBr(report.cash.openingBalance)],
    ['(+) Entradas no período', formatMoneyBr(report.cash.inflows)],
    ['(−) Saídas no período', formatMoneyBr(report.cash.outflows)],
    ['(=) Saldo final', formatMoneyBr(report.cash.closingBalance)],
  ]);
  y = lastTableY(doc, y);

  kvTable(doc, autoTable, y, 'CARTEIRA DE PARCELAS', [
    ['Recebido no período (paid_at)', formatMoneyBr(report.wallet.receivedInPeriod)],
    ['A receber (vencimento no período)', formatMoneyBr(report.wallet.toReceive)],
    ['Vencido (vencimento no período)', formatMoneyBr(report.wallet.overdue)],
    ['Parcelas pagas', String(report.wallet.qtyPaid)],
    ['Parcelas pendentes', String(report.wallet.qtyPending)],
    ['Parcelas vencidas', String(report.wallet.qtyOverdue)],
  ]);
  y = lastTableY(doc, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('RECEBIMENTOS POR EMPREENDIMENTO', 14, y);
  autoTable(doc, {
    startY: y + 3,
    head: [['Empreendimento', 'Recebido', 'A receber', 'Vencido']],
    body:
      report.wallet.byProject.length > 0
        ? report.wallet.byProject.map((row) => [
            row.projectName,
            formatMoneyBr(row.received),
            formatMoneyBr(row.toReceive),
            formatMoneyBr(row.overdue),
          ])
        : [['Nenhum empreendimento com movimento no filtro', '—', '—', '—']],
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: HEAD,
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });
  y = lastTableY(doc, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.text('DESTINO DOS RECEBIMENTOS (não é receita adicional)', 14, y);
  autoTable(doc, {
    startY: y + 3,
    head: [['Beneficiário / Destino', 'Instituição', 'Banco/Agência/Conta', '%', 'Bruto previsto', 'Situação']],
    body: [...destinationBodyRows(report), ...destinationSummaryRows(report)],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 4: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = lastTableY(doc, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('SAÍDAS POR CATEGORIA', 14, y);
  autoTable(doc, {
    startY: y + 3,
    head: [['Categoria', 'Valor']],
    body: [
      ...(report.cash.outflowsByCategory.length
        ? report.cash.outflowsByCategory.map((row) => [row.category, formatMoneyBr(row.amount)])
        : [['Sem saídas no período', '—']]),
      ['TOTAL SAÍDAS', formatMoneyBr(report.cash.outflows)],
    ],
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: HEAD,
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  await withFooter(doc, report.meta.companyName, 'Relatório Financeiro Resumido');
  return doc;
}

export const COMPLETO_PDF_BOTTOM_MARGIN_MM = 18;
export const COMPLETO_PDF_TOP_MARGIN_MM = 14;
export const COMPLETO_SPLIT_UNREGISTERED_LABEL = 'Não registrado no congelamento';

export const COMPLETO_WALLET_TABLE_HEAD = [
  'Contrato',
  'Cliente/Pagador',
  'CPF/CNPJ',
  'Empreendimento',
  'QD',
  'LT',
  'Parcela',
  'Vencimento',
  'Pagamento',
  'Valor parcela',
  'Valor pago',
  'Status',
  'Conta',
];

export const COMPLETO_SPLIT_SUBTABLE_HEAD = [
  'Beneficiário',
  '%',
  'Bruto',
  'Valor informado',
  'Situação',
  'Data pgto.',
  'Banco',
  'Agência',
  'Conta',
];

const WALLET_PARCEL_ROW_MM = 10;
const SPLIT_TITLE_MM = 5;
const SPLIT_HEAD_MM = 7;
const SPLIT_PARTICIPANT_ROW_MM = 11;
const SPLIT_PAD_MM = 3;
const NO_SPLIT_DEST_MM = 6;

export function formatCompletoSplitBeneficiaryCell(leg: CanonicalSplitLeg): string {
  const name = formatSplitBeneficiaryLabel(leg.beneficiaryName);
  const titular = String(leg.frozenBankIdentity?.destBeneficiaryName || '').trim() || name;
  return `${name}\n${titular}`;
}

export function formatCompletoSplitBankCell(leg: CanonicalSplitLeg): string {
  if (!hasFrozenBankIdentity(leg.frozenBankIdentity)) {
    return COMPLETO_SPLIT_UNREGISTERED_LABEL;
  }
  const institution = String(leg.frozenBankIdentity.destInstitution || '').trim();
  const bank = String(leg.frozenBankIdentity.destBankName || '').trim();
  if (institution && bank && institution !== bank) return `${institution}\n${bank}`;
  return bank || institution || COMPLETO_SPLIT_UNREGISTERED_LABEL;
}

export function formatCompletoSplitAgencyCell(leg: CanonicalSplitLeg): string {
  if (!hasFrozenBankIdentity(leg.frozenBankIdentity)) return '—';
  return String(leg.frozenBankIdentity.destAgency || '').trim() || '—';
}

export function formatCompletoSplitAccountCell(leg: CanonicalSplitLeg): string {
  if (!hasFrozenBankIdentity(leg.frozenBankIdentity)) return '—';
  const account = String(leg.frozenBankIdentity.destAccountMasked || '').trim();
  const kindRaw = String(leg.frozenBankIdentity.destBankAccountKind || '').trim();
  const kind = isCompanyBankAccountKind(kindRaw)
    ? COMPANY_BANK_ACCOUNT_KIND_LABELS[kindRaw]
    : kindRaw;
  if (account && kind) return `${account}\n${kind}`;
  return account || kind || '—';
}

export function buildCompletoSplitSubtableBody(movement: CanonicalWalletMovement): unknown[][] {
  const paidLabel = formatPaidAtDisplay(movement.paidAt);
  return movement.split.map((leg) => [
    formatCompletoSplitBeneficiaryCell(leg),
    formatSplitSharePercentLabel(leg.sharePercent),
    formatMoneyBr(leg.grossAmount),
    leg.netAmount == null ? '—' : formatMoneyBr(leg.netAmount),
    leg.statusLabel,
    paidLabel,
    formatCompletoSplitBankCell(leg),
    formatCompletoSplitAgencyCell(leg),
    formatCompletoSplitAccountCell(leg),
  ]);
}

export function estimateCompletoWalletGroupHeightMm(movement: CanonicalWalletMovement): number {
  if (movement.hasSplit && movement.split.length) {
    return (
      WALLET_PARCEL_ROW_MM +
      SPLIT_TITLE_MM +
      SPLIT_HEAD_MM +
      movement.split.length * SPLIT_PARTICIPANT_ROW_MM +
      SPLIT_PAD_MM +
      8
    );
  }
  if (movement.paidAmount > 0) return WALLET_PARCEL_ROW_MM + NO_SPLIT_DEST_MM;
  return WALLET_PARCEL_ROW_MM;
}

export function shouldMoveCompletoWalletGroupToNextPage(
  remainingMm: number,
  groupHeightMm: number,
): boolean {
  return remainingMm < groupHeightMm;
}

export function isCompletoWalletGroupIndivisible(movement: CanonicalWalletMovement): boolean {
  if (!movement.hasSplit) return true;
  return movement.split.length <= 4;
}

function buildWalletParcelRow(movement: CanonicalWalletMovement): unknown[] {
  return [
    movement.contractNumber,
    movement.clientName,
    movement.clientDocument,
    movement.projectName,
    movement.blockName,
    movement.lotNumber,
    movement.installmentLabel,
    movement.dueDateLabel,
    movement.paidAtLabel,
    formatMoneyBr(movement.amount),
    formatMoneyBr(movement.paidAmount),
    movement.statusLabel,
    movement.financialAccountLabel,
  ];
}

function drawCompletoWalletMovements(
  doc: JsPdfDoc,
  autoTable: AutoTableFn,
  report: CanonicalFinanceReport,
  startY: number,
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageInnerBottom = pageHeight - COMPLETO_PDF_BOTTOM_MARGIN_MM;
  let y = startY;
  let showHead = true;

  const startNewWalletPage = () => {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text('RELATÓRIO FINANCEIRO COMPLETO — Movimentações da carteira', 14, 10);
    y = COMPLETO_PDF_TOP_MARGIN_MM + 2;
    showHead = true;
  };

  const movements = report.wallet.movements;
  if (!movements.length) {
    autoTable(doc, {
      startY: y,
      head: [COMPLETO_WALLET_TABLE_HEAD],
      body: [['—', 'Sem parcelas no filtro', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—']],
      styles: { fontSize: 8, cellPadding: 1.4, overflow: 'linebreak', valign: 'middle' },
      headStyles: HEAD,
      margin: { left: 14, right: 14 },
    });
    return lastTableY(doc, y);
  }

  for (const movement of movements) {
    const groupHeight = estimateCompletoWalletGroupHeightMm(movement);
    const remaining = pageInnerBottom - y;
    const indivisible = isCompletoWalletGroupIndivisible(movement);
    const minChunk =
      WALLET_PARCEL_ROW_MM +
      (movement.hasSplit ? SPLIT_TITLE_MM + SPLIT_HEAD_MM + 2 * SPLIT_PARTICIPANT_ROW_MM : 0);
    const mustMove = indivisible
      ? shouldMoveCompletoWalletGroupToNextPage(remaining, groupHeight)
      : remaining < minChunk;
    if (mustMove && y > COMPLETO_PDF_TOP_MARGIN_MM + 8) {
      startNewWalletPage();
    }

    autoTable(doc, {
      startY: y,
      head: [COMPLETO_WALLET_TABLE_HEAD],
      body: [buildWalletParcelRow(movement)],
      showHead: showHead ? 'everyPage' : 'never',
      rowPageBreak: 'avoid',
      styles: { fontSize: 8, cellPadding: 1.4, overflow: 'linebreak', valign: 'middle' },
      headStyles: HEAD,
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 38 },
        2: { cellWidth: 22 },
        3: { cellWidth: 32 },
        4: { cellWidth: 12 },
        5: { cellWidth: 12 },
        6: { cellWidth: 18 },
        7: { cellWidth: 18 },
        8: { cellWidth: 22 },
        9: { cellWidth: 22, halign: 'right' },
        10: { cellWidth: 22, halign: 'right' },
        11: { cellWidth: 16 },
        12: { cellWidth: 13 },
      },
      margin: { left: 14, right: 14 },
    });
    y =
      ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y) + 4;
    showHead = false;

    if (movement.hasSplit && movement.split.length) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
      doc.text('DISTRIBUIÇÃO DO RECEBIMENTO (não somar como receita)', 16, y);
      autoTable(doc, {
        startY: y + 2,
        head: [COMPLETO_SPLIT_SUBTABLE_HEAD],
        body: buildCompletoSplitSubtableBody(movement),
        showHead: 'everyPage',
        rowPageBreak: indivisible ? 'avoid' : 'auto',
        styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 48, halign: 'left' },
          1: { cellWidth: 14, halign: 'center' },
          2: { cellWidth: 26, halign: 'right' },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 26, halign: 'center' },
          5: { cellWidth: 24, halign: 'center' },
          6: { cellWidth: 40, halign: 'left' },
          7: { cellWidth: 18, halign: 'center' },
          8: { cellWidth: 41, halign: 'left' },
        },
        margin: { left: 16, right: 14 },
      });
      y =
        ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y) + 4;
    } else if (movement.paidAmount > 0) {
      autoTable(doc, {
        startY: y,
        body: [[`Destino: ${movement.destinationFallbackLabel}`]],
        theme: 'plain',
        styles: { fontSize: 8, textColor: [70, 70, 70], cellPadding: 1.2 },
        margin: { left: 16, right: 14 },
      });
      y =
        ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y) + 4;
    }
  }

  return y;
}

export async function buildFinanceCompletoPdf(
  report: CanonicalFinanceReport,
  options: FinancePdfRenderOptions = {},
): Promise<JsPdfDoc> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = drawHeader(doc, report, 'RELATÓRIO FINANCEIRO COMPLETO', options.logoBase64, pageWidth);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('RESUMO DO PERÍODO — universos separados', 14, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [['Universo', 'Indicador', 'Valor', 'Base de data']],
    body: [
      ['CAIXA', 'Saldo inicial', formatMoneyBr(report.cash.openingBalance), 'Movimentações anteriores a movement_date'],
      ['CAIXA', 'Entradas', formatMoneyBr(report.cash.inflows), 'movement_date no período'],
      ['CAIXA', 'Saídas', formatMoneyBr(report.cash.outflows), 'movement_date no período'],
      ['CAIXA', 'Saldo final', formatMoneyBr(report.cash.closingBalance), 'Saldo inicial + entradas − saídas'],
      ['CARTEIRA', 'Recebido no período', formatMoneyBr(report.wallet.receivedInPeriod), 'paid_at'],
      ['CARTEIRA', 'A receber', formatMoneyBr(report.wallet.toReceive), 'due_date'],
      ['CARTEIRA', 'Vencido', formatMoneyBr(report.wallet.overdue), 'due_date'],
      ['CARTEIRA', 'Parcelas pagas / pendentes / vencidas', `${report.wallet.qtyPaid} / ${report.wallet.qtyPending} / ${report.wallet.qtyOverdue}`, 'paid_at / due_date'],
      ['DISTRIBUIÇÃO', 'Bruto previsto', formatMoneyBr(report.destinations.grossPredictedTotal), 'Não somar à receita'],
      ['DISTRIBUIÇÃO', 'Líquido confirmado', formatMoneyBr(report.destinations.netConfirmedTotal), 'Somente pernas SETTLED'],
    ],
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: HEAD,
    margin: { left: 14, right: 14 },
  });
  y = lastTableY(doc, y) + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('MOVIMENTAÇÕES DA CARTEIRA — 1 linha = 1 parcela', 14, y);
  y = drawCompletoWalletMovements(doc, autoTable, report, y + 3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('MOVIMENTAÇÕES DE CAIXA — somente data (movement_date)', 14, y + 4);
  autoTable(doc, {
    startY: y + 7,
    head: [['Data', 'Tipo', 'Categoria', 'Empreendimento', 'Descrição', 'Conta', 'Valor', 'Status']],
    body:
      report.cash.movements.length > 0
        ? report.cash.movements.map((m) => [
            m.dateLabel,
            m.tipoLabel,
            m.category,
            m.projectName,
            m.description,
            m.accountLabel || '—',
            formatMoneyBr(m.amount),
            m.status,
          ])
        : [['—', '—', '—', '—', 'Sem movimentação de caixa no período', '—', '—', '—']],
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: HEAD,
    columnStyles: { 6: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  await withFooter(doc, report.meta.companyName, 'Relatório Financeiro Completo');
  return doc;
}

export async function downloadFinanceResumidoPdf(
  report: CanonicalFinanceReport,
  options: FinancePdfRenderOptions = {},
): Promise<void> {
  const doc = await buildFinanceResumidoPdf(report, options);
  doc.save(financeReportFilename('resumido', 'pdf'));
}

export async function downloadFinanceCompletoPdf(
  report: CanonicalFinanceReport,
  options: FinancePdfRenderOptions = {},
): Promise<void> {
  const doc = await buildFinanceCompletoPdf(report, options);
  doc.save(financeReportFilename('completo', 'pdf'));
}
