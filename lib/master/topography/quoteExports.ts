/**
 * Exportações reais de orçamento Master Topografia.
 * PDF Analítico permanece preparado para Fase 5.3.
 */
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SAAS_PROVIDER } from '@/lib/saasContractContent';
import { MASTER_TOPOGRAFIA_LOGO_PATH } from '@/lib/master/config';
import { topographyPriceBankLabel } from './priceBanks';
import {
  itemTotalWithBdi,
  itemUnitWithBdi,
  type QuoteFinancialSummary,
} from './quoteFinancials';
import {
  buildQuotePdfCompositionRows,
  buildQuotePdfFinancialBreakdown,
  buildQuotePdfFooterContactLine,
  buildQuotePdfNarrativeSections,
  buildQuotePdfProposalSummary,
  formatQuotePdfMoney,
  QUOTE_PDF_CLIENT_TABLE_HEADERS,
  resolveQuotePdfDisplayUnitPrice,
  type QuotePdfCompositionRow,
} from './quotePdfSyntheticLayout';
import type {
  MasterTopographyQuote,
  MasterTopographyQuoteStageWithItems,
} from './quoteTypes';

export type QuoteExportPayload = {
  quote: MasterTopographyQuote;
  stages: MasterTopographyQuoteStageWithItems[];
  financials: QuoteFinancialSummary;
};

function money(n: number) {
  return formatQuotePdfMoney(n);
}

function flatRows(payload: QuoteExportPayload) {
  const rows: Array<{
    stage: string;
    code: string;
    bank: string;
    description: string;
    unit: string;
    quantity: number;
    reference: number;
    adopted: number;
    unitBdi: number;
    total: number;
    notes: string;
    competence: string;
    uf: string;
  }> = [];

  for (const stage of payload.stages) {
    for (const item of stage.items) {
      const adopted = item.adopted_price ?? item.unit_value;
      rows.push({
        stage: stage.name,
        code: item.code || '',
        bank: topographyPriceBankLabel(item.price_bank),
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        reference: item.reference_price ?? adopted,
        adopted,
        unitBdi: itemUnitWithBdi(adopted, payload.quote.bdi_percent),
        total: itemTotalWithBdi(item.quantity, adopted, payload.quote.bdi_percent),
        notes: item.notes || '',
        competence: item.competence || '',
        uf: item.uf || '',
      });
    }
  }
  return rows;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportQuoteCsv(payload: QuoteExportPayload) {
  const rows = flatRows(payload);
  const header = [
    'Etapa',
    'Código',
    'Banco',
    'Descrição',
    'Unidade',
    'Quantidade',
    'Preço referência',
    'Preço adotado',
    'Unit. c/ BDI',
    'Total',
    'Competência',
    'UF',
    'Observações',
  ];
  const lines = [
    header.join(';'),
    ...rows.map((r) =>
      [
        r.stage,
        r.code,
        r.bank,
        r.description,
        r.unit,
        String(r.quantity).replace('.', ','),
        String(r.reference).replace('.', ','),
        String(r.adopted).replace('.', ','),
        String(r.unitBdi).replace('.', ','),
        String(r.total).replace('.', ','),
        r.competence,
        r.uf,
        r.notes,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(';'),
    ),
    '',
    `"Total sem BDI";"${payload.financials.totalWithoutBdi}"`,
    `"BDI (${payload.financials.bdiPercent}%)";"${payload.financials.bdiAmount}"`,
    `"Total com BDI";"${payload.financials.totalWithBdi}"`,
    `"Desconto (${payload.financials.discountPercent}%)";"${payload.financials.discountValue}"`,
    `"Total Geral";"${payload.financials.totalGeral}"`,
    `"Margem (${payload.financials.marginPercent}%)";"${payload.financials.marginValue}"`,
  ];
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  downloadBlob(blob, `${payload.quote.code}-orcamento.csv`);
}

export async function exportQuoteExcel(payload: QuoteExportPayload) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SV Topografia & Projetos';
  const sheet = wb.addWorksheet('Orçamento');
  sheet.columns = [
    { header: 'Etapa', key: 'stage', width: 24 },
    { header: 'Código', key: 'code', width: 12 },
    { header: 'Banco', key: 'bank', width: 14 },
    { header: 'Descrição', key: 'description', width: 42 },
    { header: 'Unidade', key: 'unit', width: 10 },
    { header: 'Quantidade', key: 'quantity', width: 12 },
    { header: 'Preço ref.', key: 'reference', width: 14 },
    { header: 'Preço adotado', key: 'adopted', width: 14 },
    { header: 'Unit. c/ BDI', key: 'unitBdi', width: 14 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Competência', key: 'competence', width: 12 },
    { header: 'UF', key: 'uf', width: 6 },
    { header: 'Observações', key: 'notes', width: 28 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of flatRows(payload)) sheet.addRow(row);

  const fin = wb.addWorksheet('Resumo');
  fin.addRows([
    ['Código', payload.quote.code],
    ['Cliente', payload.quote.client_name],
    ['Título', payload.quote.title || ''],
    ['Total sem BDI', payload.financials.totalWithoutBdi],
    ['BDI %', payload.financials.bdiPercent],
    ['BDI R$', payload.financials.bdiAmount],
    ['Total com BDI', payload.financials.totalWithBdi],
    ['Desconto %', payload.financials.discountPercent],
    ['Desconto R$', payload.financials.discountValue],
    ['Total Geral', payload.financials.totalGeral],
    ['Margem %', payload.financials.marginPercent],
    ['Margem R$', payload.financials.marginValue],
  ]);

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${payload.quote.code}-orcamento.xlsx`,
  );
}

export function exportQuoteMemorial(payload: QuoteExportPayload) {
  const lines: string[] = [];
  lines.push(`MEMORIAL DE CÁLCULO — ${payload.quote.code}`);
  lines.push(`Cliente: ${payload.quote.client_name}`);
  lines.push(`Objeto: ${payload.quote.title || payload.quote.description || '—'}`);
  lines.push(`BDI: ${payload.quote.bdi_percent}%`);
  lines.push('');

  for (const stage of payload.stages) {
    lines.push(`ETAPA: ${stage.name}`);
    lines.push(`Subtotal: ${money(stage.subtotal)} (${stage.percentOfBudget.toFixed(2)}% do orçamento)`);
    for (const item of stage.items) {
      const adopted = item.adopted_price ?? item.unit_value;
      const unitBdi = itemUnitWithBdi(adopted, payload.quote.bdi_percent);
      const total = itemTotalWithBdi(item.quantity, adopted, payload.quote.bdi_percent);
      lines.push(
        `  - [${item.code || 's/c'}] ${item.description} | ${item.quantity} ${item.unit} × ${money(adopted)} (ref. ${money(item.reference_price ?? adopted)}) × (1+BDI) = ${money(unitBdi)} → ${money(total)}`,
      );
    }
    lines.push('');
  }

  lines.push('RESUMO');
  lines.push(`Total sem BDI: ${money(payload.financials.totalWithoutBdi)}`);
  lines.push(`BDI (${payload.financials.bdiPercent}%): ${money(payload.financials.bdiAmount)}`);
  lines.push(`Total com BDI: ${money(payload.financials.totalWithBdi)}`);
  lines.push(`Desconto (${payload.financials.discountPercent}%): ${money(payload.financials.discountValue)}`);
  lines.push(`TOTAL GERAL: ${money(payload.financials.totalGeral)}`);
  lines.push(`Margem (${payload.financials.marginPercent}%): ${money(payload.financials.marginValue)}`);

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `${payload.quote.code}-memorial-calculo.txt`);
}

async function tryLoadLogo(doc: jsPDF): Promise<boolean> {
  try {
    const res = await fetch(MASTER_TOPOGRAFIA_LOGO_PATH);
    if (!res.ok) return false;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    if (!dataUrl) return false;
    doc.addImage(dataUrl, 'PNG', 14, 8, 28, 14);
    return true;
  } catch {
    return false;
  }
}

function compositionRowsToAutoTableBody(
  rows: QuotePdfCompositionRow[],
  bdiPercent: number,
): Array<Array<string | { content: string; colSpan: number; styles: Record<string, unknown> }>> {
  return rows.map((row) => {
    if (row.kind === 'stage') {
      return [
        {
          content: row.stageName,
          colSpan: 5,
          styles: {
            fillColor: [226, 232, 240],
            textColor: [15, 23, 42],
            fontStyle: 'bold',
            fontSize: 9,
          },
        },
      ];
    }
    return [
      row.description,
      row.quantity,
      row.unit,
      money(resolveQuotePdfDisplayUnitPrice(row.unitPrice, bdiPercent)),
      money(row.total),
    ];
  });
}

function ensureSpace(doc: jsPDF, y: number, needed: number, marginBottom: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed <= pageHeight - marginBottom) return y;
  doc.addPage();
  return 18;
}

function drawWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  marginBottom: number,
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  let cursor = y;
  for (const line of lines) {
    cursor = ensureSpace(doc, cursor, lineHeight, marginBottom);
    doc.text(line, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
}

/** PDF Sintético — paisagem, profissional (layout cliente). */
export async function exportQuotePdfSynthetic(payload: QuoteExportPayload) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = 14;
  const marginBottom = 14;
  const contentWidth = pageWidth - marginLeft - marginRight;

  const tradeName = 'SV Topografia & Projetos';
  const addressLine = `${SAAS_PROVIDER.address}, ${SAAS_PROVIDER.neighborhood} — ${SAAS_PROVIDER.city}/${SAAS_PROVIDER.state}`;
  const footerContact = buildQuotePdfFooterContactLine(
    SAAS_PROVIDER as {
      phone?: string | null;
      email?: string | null;
      website?: string | null;
    },
  );

  const drawFooter = (page: number) => {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const left = footerContact
      ? `${SAAS_PROVIDER.legalName} · ${footerContact}`
      : `${SAAS_PROVIDER.legalName} — Orçamento sintético`;
    doc.text(left, marginLeft, pageHeight - 8);
    doc.text(
      `${payload.quote.code} · página ${page}`,
      pageWidth - marginRight,
      pageHeight - 8,
      { align: 'right' },
    );
  };

  await tryLoadLogo(doc);

  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(tradeName, 48, 14);
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(SAAS_PROVIDER.legalName, 48, 19);
  doc.text(`CNPJ ${SAAS_PROVIDER.cnpj}`, 48, 24);
  doc.text(addressLine, 48, 28);

  doc.setFontSize(12);
  doc.setTextColor(29, 78, 216);
  doc.text(`Orçamento ${payload.quote.code}`, pageWidth - marginRight, 14, {
    align: 'right',
  });
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, pageWidth - marginRight, 19, {
    align: 'right',
  });

  doc.setDrawColor(226, 232, 240);
  doc.line(marginLeft, 32, pageWidth - marginRight, 32);

  let y = 38;
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Cliente: ${payload.quote.client_name}`, marginLeft, y);
  y += 5;
  doc.text(`Objeto: ${payload.quote.title || '—'}`, marginLeft, y);
  y += 5;
  const local = [payload.quote.city, payload.quote.state].filter(Boolean).join('/');
  if (local) {
    doc.text(`Local: ${local}`, marginLeft, y);
    y += 5;
  }

  const summary = buildQuotePdfProposalSummary(payload.quote);
  if (summary.length) {
    y += 2;
    doc.setFontSize(10);
    doc.setTextColor(29, 78, 216);
    doc.text('RESUMO DA PROPOSTA', marginLeft, y);
    y += 2;
    const summaryBody = summary.map((f) => [f.label, f.value]);
    autoTable(doc, {
      startY: y,
      head: [],
      body: summaryBody,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1.2, textColor: [15, 23, 42] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 42, textColor: [51, 65, 85] },
        1: { cellWidth: 'auto' },
      },
      margin: { left: marginLeft, right: marginRight, bottom: marginBottom },
      didDrawPage: (data) => drawFooter(data.pageNumber),
    });
    y =
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) +
      6;
  } else {
    y += 2;
  }

  const composition = buildQuotePdfCompositionRows(
    payload.stages,
    payload.quote.bdi_percent,
  );
  const tableBody = compositionRowsToAutoTableBody(
    composition,
    payload.quote.bdi_percent,
  );

  autoTable(doc, {
    startY: y,
    head: [Array.from(QUOTE_PDF_CLIENT_TABLE_HEADERS)],
    body: tableBody,
    styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak', valign: 'middle' },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 18, halign: 'right' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
    },
    rowPageBreak: 'avoid',
    margin: { left: marginLeft, right: marginRight, bottom: marginBottom },
    didDrawPage: (data) => drawFooter(data.pageNumber),
  });

  let finalY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 6;

  const breakdown = buildQuotePdfFinancialBreakdown(payload.financials);
  const boxHeight =
    18 + (breakdown.showBdi || breakdown.showDiscount || breakdown.showMargin ? 8 : 0);
  finalY = ensureSpace(doc, finalY, boxHeight + 4, marginBottom);

  doc.setDrawColor(29, 78, 216);
  doc.setFillColor(239, 246, 255);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginLeft, finalY, contentWidth, boxHeight, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setTextColor(29, 78, 216);
  doc.text('VALOR GLOBAL DA PROPOSTA', marginLeft + 4, finalY + 7);
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(breakdown.totalGeralFormatted, pageWidth - marginRight - 4, finalY + 8, {
    align: 'right',
  });

  if (breakdown.showBdi || breakdown.showDiscount || breakdown.showMargin) {
    const bits: string[] = [];
    if (breakdown.showBdi) {
      bits.push(`BDI ${breakdown.bdiPercent}%: ${money(breakdown.bdiAmount)}`);
    }
    if (breakdown.showDiscount) {
      bits.push(`Desconto ${breakdown.discountPercent}%: ${money(breakdown.discountValue)}`);
    }
    if (breakdown.showMargin) {
      bits.push(`Margem ${breakdown.marginPercent}%: ${money(breakdown.marginValue)}`);
    }
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(bits.join(' · '), marginLeft + 4, finalY + 15);
  }

  finalY += boxHeight + 8;

  const sections = buildQuotePdfNarrativeSections(payload.quote);
  for (const section of sections) {
    finalY = ensureSpace(doc, finalY, 14, marginBottom);
    doc.setFontSize(10);
    doc.setTextColor(29, 78, 216);
    doc.text(section.title, marginLeft, finalY);
    finalY += 5;
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    finalY = drawWrappedText(
      doc,
      section.body,
      marginLeft,
      finalY,
      contentWidth,
      4,
      marginBottom,
    );
    finalY += 4;
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p);
  }

  doc.save(`${payload.quote.code}-sintetico.pdf`);
}

/** Preparado para Fase 5.3 — não implementa o layout analítico completo. */
export function exportQuotePdfAnalyticalPrepared(_payload: QuoteExportPayload) {
  window.alert(
    'PDF Analítico está preparado para a Fase 5.3 e será liberado na próxima entrega.',
  );
}
