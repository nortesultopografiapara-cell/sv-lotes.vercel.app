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
  buildQuotePdfSummaryGridRows,
  formatQuotePdfMoney,
  preserveQuotePdfUserText,
  QUOTE_PDF_CLIENT_TABLE_HEADERS,
  resolveQuotePdfDisplayUnitPrice,
  resolveQuotePdfTableColumnWidths,
  type QuotePdfCompositionRow,
  type QuotePdfSummaryField,
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
    doc.addImage(dataUrl, 'PNG', 12, 6, 24, 12);
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
            fontSize: 8,
            cellPadding: { top: 1.2, bottom: 1.2, left: 2, right: 2 },
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
  return 14;
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
  const safe = preserveQuotePdfUserText(text);
  const lines = doc.splitTextToSize(safe, maxWidth) as string[];
  let cursor = y;
  for (const line of lines) {
    cursor = ensureSpace(doc, cursor, lineHeight, marginBottom);
    doc.text(line, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
}

function drawSummaryGrid(
  doc: jsPDF,
  fields: QuotePdfSummaryField[],
  startY: number,
  marginLeft: number,
  contentWidth: number,
  columns: number,
): number {
  if (!fields.length) return startY;
  const rows = buildQuotePdfSummaryGridRows(fields, columns);
  const gap = 2;
  const colW = (contentWidth - gap * (columns - 1)) / columns;
  let y = startY;

  doc.setFontSize(9);
  doc.setTextColor(29, 78, 216);
  doc.text('RESUMO DA PROPOSTA', marginLeft, y);
  y += 3.5;

  for (const row of rows) {
    let x = marginLeft;
    let rowHeight = 7;
    const cells: Array<{ field: QuotePdfSummaryField; x: number; w: number }> = [];

    for (const field of row) {
      const span = Math.min(field.span ?? 1, columns);
      const w = colW * span + gap * (span - 1);
      const valueLines = doc.splitTextToSize(
        preserveQuotePdfUserText(field.value),
        w - 1,
      ) as string[];
      rowHeight = Math.max(rowHeight, 3 + 2.6 + valueLines.length * 3.1);
      cells.push({ field, x, w });
      x += w + gap;
    }

    for (const cell of cells) {
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(cell.field.label, cell.x, y);
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      const valueLines = doc.splitTextToSize(
        preserveQuotePdfUserText(cell.field.value),
        cell.w - 1,
      ) as string[];
      doc.text(valueLines, cell.x, y + 3.2);
    }
    y += rowHeight;
  }

  return y + 1;
}

function drawCommercialGrid(
  doc: jsPDF,
  fields: QuotePdfSummaryField[],
  startY: number,
  marginLeft: number,
  contentWidth: number,
  marginBottom: number,
): number {
  if (!fields.length) return startY;
  let y = ensureSpace(doc, startY, 10, marginBottom);
  doc.setFontSize(9);
  doc.setTextColor(29, 78, 216);
  doc.text('CONDIÇÕES COMERCIAIS', marginLeft, y);
  y += 3.5;

  const columns = Math.min(4, Math.max(2, fields.length));
  const rows = buildQuotePdfSummaryGridRows(
    fields.map((f) => ({
      ...f,
      span: f.span && f.span > 1 ? 2 : 1,
    })),
    columns,
  );
  const gap = 2.5;
  const colW = (contentWidth - gap * (columns - 1)) / columns;

  for (const row of rows) {
    y = ensureSpace(doc, y, 8, marginBottom);
    let x = marginLeft;
    let rowHeight = 7;
    for (const field of row) {
      const span = Math.min(field.span ?? 1, columns);
      const w = colW * span + gap * (span - 1);
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(field.label, x, y);
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      const valueLines = doc.splitTextToSize(
        preserveQuotePdfUserText(field.value),
        w - 1,
      ) as string[];
      doc.text(valueLines, x, y + 3.2);
      rowHeight = Math.max(rowHeight, 3.2 + valueLines.length * 3.1);
      x += w + gap;
    }
    y += rowHeight + 0.5;
  }
  return y;
}

/** PDF Sintético — paisagem compacta (orçamentos pequenos em 1 página). */
async function renderQuotePdfSynthetic(payload: QuoteExportPayload): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 12;
  const marginRight = 12;
  const marginBottom = 11;
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
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    const left = footerContact
      ? `${SAAS_PROVIDER.legalName} · ${footerContact}`
      : `${SAAS_PROVIDER.legalName} — Orçamento sintético`;
    doc.text(left, marginLeft, pageHeight - 6);
    doc.text(
      `${payload.quote.code} · página ${page}`,
      pageWidth - marginRight,
      pageHeight - 6,
      { align: 'right' },
    );
  };

  await tryLoadLogo(doc);

  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(tradeName, 44, 11);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(SAAS_PROVIDER.legalName, 44, 15.5);
  doc.text(`CNPJ ${SAAS_PROVIDER.cnpj} · ${addressLine}`, 44, 19.5);

  doc.setFontSize(11);
  doc.setTextColor(29, 78, 216);
  doc.text(`Orçamento ${payload.quote.code}`, pageWidth - marginRight, 11, {
    align: 'right',
  });
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, pageWidth - marginRight, 15.5, {
    align: 'right',
  });

  doc.setDrawColor(226, 232, 240);
  doc.line(marginLeft, 22, pageWidth - marginRight, 22);

  let y = 26.5;
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Cliente: ${preserveQuotePdfUserText(payload.quote.client_name)}`, marginLeft, y);
  y += 4;
  doc.text(
    `Objeto: ${preserveQuotePdfUserText(payload.quote.title) || '—'}`,
    marginLeft,
    y,
  );
  y += 4;
  const local = [payload.quote.city, payload.quote.state].filter(Boolean).join('/');
  if (local) {
    doc.text(`Local: ${local}`, marginLeft, y);
    y += 3.5;
  }

  const summary = buildQuotePdfProposalSummary(payload.quote);
  if (summary.length) {
    y = drawSummaryGrid(doc, summary, y + 0.5, marginLeft, contentWidth, 5) + 0.8;
  }

  const composition = buildQuotePdfCompositionRows(
    payload.stages,
    payload.quote.bdi_percent,
  );
  const tableBody = compositionRowsToAutoTableBody(
    composition,
    payload.quote.bdi_percent,
  );

  const colW = resolveQuotePdfTableColumnWidths(contentWidth);

  autoTable(doc, {
    startY: y,
    head: [Array.from(QUOTE_PDF_CLIENT_TABLE_HEADERS)],
    body: tableBody,
    tableWidth: contentWidth,
    styles: {
      fontSize: 7.5,
      cellPadding: 1.1,
      overflow: 'linebreak',
      valign: 'middle',
      minCellHeight: 4.5,
    },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.2,
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    // Larguras únicas compartilhadas entre cabeçalho e corpo.
    columnStyles: {
      0: { cellWidth: colW.description, halign: 'left' },
      1: { cellWidth: colW.quantity, halign: 'center' },
      2: { cellWidth: colW.unit, halign: 'center' },
      3: { cellWidth: colW.unitPrice, halign: 'right' },
      4: { cellWidth: colW.total,halign: 'right' },
    },
    didParseCell: (data) => {
      // Cabeçalho: títulos centralizados sobre a mesma largura das células.
      if (data.section === 'head') {
        data.cell.styles.halign = 'center';
        const widths = [
          colW.description,
          colW.quantity,
          colW.unit,
          colW.unitPrice,
          colW.total,
        ];
        data.cell.styles.cellWidth = widths[data.column.index];
        return;
      }
      // Corpo: alinhamentos por coluna (mesmas larguras).
      const alignByCol: Array<'left' | 'center' | 'right'> = [
        'left',
        'center',
        'center',
        'right',
        'right',
      ];
      data.cell.styles.halign = alignByCol[data.column.index] ?? 'left';
    },
    rowPageBreak: 'avoid',
    margin: { left: marginLeft, right: marginRight, bottom: marginBottom },
    didDrawPage: (data) => drawFooter(data.pageNumber),
  });

  let finalY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) +
    2.5;

  const breakdown = buildQuotePdfFinancialBreakdown(payload.financials);
  const boxHeight =
    11 + (breakdown.showBdi || breakdown.showDiscount || breakdown.showMargin ? 5 : 0);
  finalY = ensureSpace(doc, finalY, boxHeight + 2, marginBottom);

  doc.setDrawColor(29, 78, 216);
  doc.setFillColor(239, 246, 255);
  doc.setLineWidth(0.35);
  doc.roundedRect(marginLeft, finalY, contentWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(29, 78, 216);
  doc.text('VALOR GLOBAL DA PROPOSTA', marginLeft + 3, finalY + 5);
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(breakdown.totalGeralFormatted, pageWidth - marginRight - 3, finalY + 6, {
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
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(bits.join(' · '), marginLeft + 3, finalY + 10);
  }

  finalY += boxHeight + 2.5;

  const sections = buildQuotePdfNarrativeSections(payload.quote);
  for (const section of sections) {
    if (section.layout === 'commercial-grid' && section.fields?.length) {
      finalY = drawCommercialGrid(
        doc,
        section.fields,
        finalY,
        marginLeft,
        contentWidth,
        marginBottom,
      );
      finalY += 1.5;
      continue;
    }

    finalY = ensureSpace(doc, finalY, 7, marginBottom);
    doc.setFontSize(9);
    doc.setTextColor(29, 78, 216);
    doc.text(section.title, marginLeft, finalY);
    finalY += 3;
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    finalY = drawWrappedText(
      doc,
      section.body,
      marginLeft,
      finalY,
      contentWidth,
      3.3,
      marginBottom,
    );
    finalY += 1.5;
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p);
  }

  return doc;
}

export async function exportQuotePdfSynthetic(payload: QuoteExportPayload) {
  const doc = await renderQuotePdfSynthetic(payload);
  doc.save(`${payload.quote.code}-sintetico.pdf`);
}

/** Gera bytes do PDF sintético (testes) sem download no browser. */
export async function buildQuotePdfSyntheticBytes(
  payload: QuoteExportPayload,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const prevFetch = globalThis.fetch;
  // @ts-expect-error stub fetch em Node para evitar logo
  globalThis.fetch = async () => ({ ok: false });
  try {
    const doc = await renderQuotePdfSynthetic(payload);
    const bytes = new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
    return { bytes, pageCount: doc.getNumberOfPages() };
  } finally {
    globalThis.fetch = prevFetch;
  }
}

/** Preparado para Fase 5.3 — não implementa o layout analítico completo. */
export function exportQuotePdfAnalyticalPrepared(_payload: QuoteExportPayload) {
  window.alert(
    'PDF Analítico está preparado para a Fase 5.3 e será liberado na próxima entrega.',
  );
}
