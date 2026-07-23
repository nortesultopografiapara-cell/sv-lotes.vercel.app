/** PDF profissional A4 paisagem — Financeiro Corporativo Master. */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CORPORATE_BRAND,
  formatCorporateDateTimeBr,
  formatCorporateMoneyBr,
  loadCorporateLogoDataUrlSync,
} from './corporateBranding';
import type {
  CorporateArApExportSummary,
  CorporateCashExportRow,
  CorporateCashExportSummary,
  CorporateExportMeta,
  CorporatePayableExportRow,
  CorporateReceivableExportRow,
} from './exportTypes';

const COLOR = {
  ink: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  blue: [29, 78, 216] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [185, 28, 28] as [number, number, number],
  amber: [180, 83, 9] as [number, number, number],
  head: [29, 78, 216] as [number, number, number],
  alt: [248, 250, 252] as [number, number, number],
};

function drawChrome(
  doc: jsPDF,
  meta: CorporateExportMeta,
  logo: string | null,
  summaryLine: (y: number) => void,
) {
  const pageW = doc.internal.pageSize.getWidth();
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', 14, 6, 26, 12);
    } catch {
      /* logo opcional */
    }
  }
  doc.setFontSize(12);
  doc.setTextColor(...COLOR.ink);
  doc.text(CORPORATE_BRAND.companyName, logo ? 44 : 14, 11);
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR.muted);
  doc.text(CORPORATE_BRAND.legalName, logo ? 44 : 14, 15.5);
  doc.text(CORPORATE_BRAND.reportFooter, logo ? 44 : 14, 19);

  doc.setFontSize(10);
  doc.setTextColor(...COLOR.blue);
  doc.text(meta.title, pageW - 14, 10, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR.muted);
  doc.text(`Período: ${meta.periodLabel}`, pageW - 14, 14.5, { align: 'right' });
  doc.text(`Gerado em: ${formatCorporateDateTimeBr(meta.generatedAt)}`, pageW - 14, 18.5, {
    align: 'right',
  });

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 22, pageW - 14, 22);

  doc.setFontSize(7);
  doc.setTextColor(...COLOR.muted);
  const filterLines = doc.splitTextToSize(`Filtros: ${meta.filtersLabel}`, pageW - 28);
  doc.text(filterLines.slice(0, 2), 14, 26);

  summaryLine(34);

  const pageH = doc.internal.pageSize.getHeight();
  const page = doc.getCurrentPageInfo().pageNumber;
  const total = doc.getNumberOfPages();
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR.muted);
  doc.text(
    `${CORPORATE_BRAND.legalName} — ${CORPORATE_BRAND.reportFooter}`,
    14,
    pageH - 8,
  );
  doc.text(`Página ${page} de ${total}`, pageW - 14, pageH - 8, { align: 'right' });
}

function moneyCell(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return formatCorporateMoneyBr(n);
}

export async function buildCashFlowPdfBuffer(params: {
  meta: CorporateExportMeta;
  summary: CorporateCashExportSummary;
  rows: CorporateCashExportRow[];
}): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const logo = loadCorporateLogoDataUrlSync();
  const s = params.summary;

  autoTable(doc, {
    startY: 40,
    head: [
      [
        'Data',
        'Código',
        'Descrição',
        'Categoria',
        'Conta',
        'Origem',
        'Entrada',
        'Saída',
        'Saldo acum.',
      ],
    ],
    body: params.rows.map((r) => [
      r.date,
      r.code,
      r.description,
      r.category,
      r.account,
      r.origin,
      moneyCell(r.income),
      moneyCell(r.expense),
      moneyCell(r.runningBalance),
    ]),
    styles: { fontSize: 7, cellPadding: 1.4, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: COLOR.head, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: COLOR.alt },
    columnStyles: {
      0: { halign: 'center', cellWidth: 18 },
      1: { cellWidth: 22 },
      2: { cellWidth: 55 },
      3: { cellWidth: 28 },
      4: { cellWidth: 28 },
      5: { cellWidth: 28 },
      6: { halign: 'right', cellWidth: 24, textColor: COLOR.green },
      7: { halign: 'right', cellWidth: 24, textColor: COLOR.red },
      8: { halign: 'right', cellWidth: 26, textColor: COLOR.blue },
    },
    margin: { left: 14, right: 14, top: 40, bottom: 14 },
    didDrawPage: () => {
      drawChrome(doc, params.meta, logo, (y) => {
        doc.setFontSize(8);
        doc.setTextColor(...COLOR.ink);
        doc.text(`Saldo inicial: ${formatCorporateMoneyBr(s.openingBalance)}`, 14, y);
        doc.setTextColor(...COLOR.green);
        doc.text(`Entradas: ${formatCorporateMoneyBr(s.periodIncome)}`, 70, y);
        doc.setTextColor(...COLOR.red);
        doc.text(`Saídas: ${formatCorporateMoneyBr(s.periodExpense)}`, 120, y);
        doc.setTextColor(...COLOR.blue);
        doc.text(`Resultado: ${formatCorporateMoneyBr(s.netResult)}`, 170, y);
        doc.setTextColor(...COLOR.ink);
        doc.text(`Saldo final: ${formatCorporateMoneyBr(s.closingBalance)}`, 220, y);
        doc.setTextColor(...COLOR.muted);
        doc.text(`Movimentos: ${s.movementCount}`, 270, y);
      });
    },
  });

  const finalY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 50) +
    6;
  if (finalY < doc.internal.pageSize.getHeight() - 16) {
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.ink);
    doc.text(
      `Totais — Entradas ${formatCorporateMoneyBr(s.periodIncome)} · Saídas ${formatCorporateMoneyBr(s.periodExpense)} · Resultado ${formatCorporateMoneyBr(s.netResult)}`,
      14,
      finalY,
    );
  }

  return Buffer.from(doc.output('arraybuffer'));
}

export async function buildReceivablesPdfBuffer(params: {
  meta: CorporateExportMeta;
  summary: CorporateArApExportSummary;
  rows: CorporateReceivableExportRow[];
}): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const logo = loadCorporateLogoDataUrlSync();
  const s = params.summary;

  autoTable(doc, {
    startY: 40,
    head: [['Código', 'Cliente', 'Descrição', 'Vencimento', 'Líquido', 'Recebido', 'Saldo', 'Status']],
    body: params.rows.map((r) => [
      r.code,
      r.customer,
      r.description,
      r.dueDate,
      moneyCell(r.netAmount),
      moneyCell(r.received),
      moneyCell(r.remaining),
      r.status,
    ]),
    styles: { fontSize: 7, cellPadding: 1.4, overflow: 'linebreak' },
    headStyles: { fillColor: COLOR.head, textColor: 255 },
    alternateRowStyles: { fillColor: COLOR.alt },
    columnStyles: {
      3: { halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    margin: { left: 14, right: 14, top: 40, bottom: 14 },
    didDrawPage: () => {
      drawChrome(doc, params.meta, logo, (y) => {
        doc.setFontSize(8);
        doc.setTextColor(...COLOR.ink);
        doc.text(`Em aberto: ${formatCorporateMoneyBr(s.openAmount)}`, 14, y);
        doc.text(`Vencendo no mês: ${formatCorporateMoneyBr(s.dueThisMonthAmount)}`, 70, y);
        doc.setTextColor(...COLOR.green);
        doc.text(`Recebido no mês: ${formatCorporateMoneyBr(s.settledThisMonthAmount)}`, 130, y);
        doc.setTextColor(...COLOR.amber);
        doc.text(`Vencido: ${formatCorporateMoneyBr(s.overdueAmount)}`, 200, y);
        doc.setTextColor(...COLOR.muted);
        doc.text(`Títulos: ${s.rowCount}`, 250, y);
      });
    },
  });

  return Buffer.from(doc.output('arraybuffer'));
}

export async function buildPayablesPdfBuffer(params: {
  meta: CorporateExportMeta;
  summary: CorporateArApExportSummary;
  rows: CorporatePayableExportRow[];
}): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const logo = loadCorporateLogoDataUrlSync();
  const s = params.summary;

  autoTable(doc, {
    startY: 40,
    head: [
      ['Código', 'Fornecedor', 'Descrição', 'Vencimento', 'Líquido', 'Pago', 'Saldo', 'Status'],
    ],
    body: params.rows.map((r) => [
      r.code,
      r.supplier,
      r.description,
      r.dueDate,
      moneyCell(r.netAmount),
      moneyCell(r.paid),
      moneyCell(r.remaining),
      r.status,
    ]),
    styles: { fontSize: 7, cellPadding: 1.4, overflow: 'linebreak' },
    headStyles: { fillColor: COLOR.head, textColor: 255 },
    alternateRowStyles: { fillColor: COLOR.alt },
    columnStyles: {
      3: { halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    margin: { left: 14, right: 14, top: 40, bottom: 14 },
    didDrawPage: () => {
      drawChrome(doc, params.meta, logo, (y) => {
        doc.setFontSize(8);
        doc.setTextColor(...COLOR.ink);
        doc.text(`Em aberto: ${formatCorporateMoneyBr(s.openAmount)}`, 14, y);
        doc.text(`Vencendo no mês: ${formatCorporateMoneyBr(s.dueThisMonthAmount)}`, 70, y);
        doc.setTextColor(...COLOR.red);
        doc.text(`Pago no mês: ${formatCorporateMoneyBr(s.settledThisMonthAmount)}`, 130, y);
        doc.setTextColor(...COLOR.amber);
        doc.text(`Vencido: ${formatCorporateMoneyBr(s.overdueAmount)}`, 200, y);
        doc.setTextColor(...COLOR.muted);
        doc.text(`Títulos: ${s.rowCount}`, 250, y);
      });
    },
  });

  return Buffer.from(doc.output('arraybuffer'));
}

export function isValidPdfBuffer(buf: Buffer): boolean {
  return buf.length > 4 && buf.subarray(0, 5).toString('utf8') === '%PDF-';
}

export function pdfContainsText(buf: Buffer, needle: string): boolean {
  return buf.toString('latin1').includes(needle) || buf.toString('utf8').includes(needle);
}
