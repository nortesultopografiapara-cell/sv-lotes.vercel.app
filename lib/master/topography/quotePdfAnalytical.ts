/**
 * PDF Analítico — orçamento detalhado (Fase 5.3 revisão final).
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  drawQuotePdfBrandHeader,
  drawQuotePdfFooter,
  drawQuotePdfSectionTitle,
  drawQuotePdfWrapped,
  ensureQuotePdfSpace,
  loadQuotePdfLogo,
  quotePdfMoney,
  QUOTE_PDF_BRAND,
} from './quotePdfBrand';
import {
  formatQuotePdfDateBr,
  isMeaningfulQuotePdfText,
  preserveQuotePdfUserText,
  filterComplementaryTechnicalNotes,
} from './quotePdfSyntheticLayout';
import {
  buildProfessionalIdentityLines,
  buildQuoteScheduleRows,
  formatQuotePercentBr,
  resolveEquipmentCategory,
  resolveProductCategory,
} from './quotePdfPresentation';
import { topographyCategoryLabel } from './categories';
import { topographyServiceTypeLabel } from './serviceTypes';
import type { QuoteExportPayload } from './quoteExportTypes';
import { itemTotalWithBdi } from './quoteFinancials';

function lastY(doc: jsPDF, fallback: number): number {
  return (
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || fallback
  );
}

export async function renderQuotePdfAnalytical(payload: QuoteExportPayload): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = 14;
  const marginBottom = 16;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const q = payload.quote;

  await loadQuotePdfLogo(doc, 14, 10, 28, 14);
  let y = drawQuotePdfBrandHeader(doc, {
    code: q.code,
    subtitle: 'PDF Analítico',
    marginLeft,
    marginRight,
    pageWidth,
  });

  y = ensureQuotePdfSpace(doc, y, 28, marginBottom);
  y = drawQuotePdfSectionTitle(doc, 'IDENTIFICAÇÃO', marginLeft, y);
  doc.setFontSize(8);
  doc.setTextColor(...QUOTE_PDF_BRAND.ink);
  const idRows: Array<[string, string]> = [
    ['Cliente', preserveQuotePdfUserText(q.client_name)],
    ['Contato', preserveQuotePdfUserText(q.contact_name)],
    ['Município/UF', [q.city, q.state].filter(Boolean).join('/')],
    ['Categoria', topographyCategoryLabel(String(q.category))],
    ['Tipo de serviço', topographyServiceTypeLabel(String(q.service_type))],
    ['Responsável', preserveQuotePdfUserText(q.internal_manager)],
    ['Data da proposta', formatQuotePdfDateBr(q.proposal_date)],
    ['Validade', formatQuotePdfDateBr(q.expiration_date)],
  ].filter(([, v]) => isMeaningfulQuotePdfText(v)) as Array<[string, string]>;

  autoTable(doc, {
    startY: y,
    body: idRows,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.2 },
    columnStyles: {
      0: { cellWidth: 40, textColor: QUOTE_PDF_BRAND.muted, fontStyle: 'bold' },
      1: { cellWidth: contentWidth - 40 },
    },
    margin: { left: marginLeft, right: marginRight },
  });
  y = lastY(doc, y) + 6;

  const objeto = preserveQuotePdfUserText(q.title) || preserveQuotePdfUserText(q.description);
  if (objeto) {
    y = ensureQuotePdfSpace(doc, y, 14, marginBottom);
    y = drawQuotePdfSectionTitle(doc, 'OBJETO', marginLeft, y);
    y = drawQuotePdfWrapped(doc, objeto, marginLeft, y, contentWidth, 4, marginBottom) + 4;
  }

  if (isMeaningfulQuotePdfText(q.description) && preserveQuotePdfUserText(q.title)) {
    y = ensureQuotePdfSpace(doc, y, 14, marginBottom);
    y = drawQuotePdfSectionTitle(doc, 'OBJETIVO DO SERVIÇO', marginLeft, y);
    y =
      drawQuotePdfWrapped(
        doc,
        String(q.description),
        marginLeft,
        y,
        contentWidth,
        4,
        marginBottom,
      ) + 4;
  }

  y = ensureQuotePdfSpace(doc, y, 20, marginBottom);
  y = drawQuotePdfSectionTitle(doc, 'ESCOPO DOS SERVIÇOS', marginLeft, y);
  for (const stage of [...payload.stages].sort((a, b) => a.sort_order - b.sort_order)) {
    y = ensureQuotePdfSpace(doc, y, 24, marginBottom);
    doc.setFillColor(...QUOTE_PDF_BRAND.stageFill);
    doc.rect(marginLeft, y - 3.5, contentWidth, 6, 'F');
    doc.setFontSize(9);
    doc.setTextColor(...QUOTE_PDF_BRAND.ink);
    doc.text(preserveQuotePdfUserText(stage.name) || 'Etapa', marginLeft + 2, y);
    y += 5;

    const body = (stage.items || []).map((item) => {
      const adopted = item.adopted_price ?? item.unit_value;
      return [
        item.description || '',
        String(item.quantity),
        item.unit || 'UN',
        quotePdfMoney(adopted),
        quotePdfMoney(item.reference_price ?? adopted),
        quotePdfMoney(itemTotalWithBdi(item.quantity, adopted, q.bdi_percent)),
      ];
    });

    if (body.length) {
      autoTable(doc, {
        startY: y,
        head: [['Descrição', 'Qtd.', 'Un.', 'Adotado', 'Referência', 'Total']],
        body,
        styles: { fontSize: 7.5, cellPadding: 1.1, overflow: 'linebreak' },
        headStyles: {
          fillColor: QUOTE_PDF_BRAND.primary,
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7.5,
        },
        columnStyles: {
          0: { cellWidth: contentWidth * 0.42 },
          1: { cellWidth: contentWidth * 0.08, halign: 'center' },
          2: { cellWidth: contentWidth * 0.08,halign: 'center' },
          3: { cellWidth: contentWidth * 0.14,halign: 'right' },
          4: { cellWidth: contentWidth * 0.14,halign: 'right' },
          5: { cellWidth: contentWidth * 0.14,halign: 'right' },
        },
        margin: { left: marginLeft, right: marginRight, bottom: marginBottom },
      });
      y = lastY(doc, y) + 3;
      doc.setFontSize(8);
      doc.setTextColor(...QUOTE_PDF_BRAND.muted);
      doc.text(
        `Subtotal da etapa: ${quotePdfMoney(stage.subtotal)} (${formatQuotePercentBr(stage.percentOfBudget, 1)})`,
        marginLeft,
        y,
      );
      y += 6;
    }
  }

  const resources = Array.isArray(q.technical_resources) ? q.technical_resources : [];
  if (resources.length) {
    y = ensureQuotePdfSpace(doc, y, 20, marginBottom);
    y = drawQuotePdfSectionTitle(doc, 'EQUIPAMENTOS UTILIZADOS', marginLeft, y);
    autoTable(doc, {
      startY: y,
      head: [['Equipamento / recurso', 'Categoria']],
      body: resources.map((r) => [
        preserveQuotePdfUserText(r.label),
        resolveEquipmentCategory(r),
      ]),
      styles: { fontSize: 8, cellPadding: 1.2 },
      headStyles: { fillColor: QUOTE_PDF_BRAND.primary, textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.72 },
        1: { cellWidth: contentWidth * 0.28 },
      },
      margin: { left: marginLeft, right: marginRight, bottom: marginBottom },
    });
    y = lastY(doc, y) + 6;
  }

  const deliverables = Array.isArray(q.deliverables) ? q.deliverables : [];
  if (deliverables.length) {
    y = ensureQuotePdfSpace(doc, y, 20, marginBottom);
    y = drawQuotePdfSectionTitle(doc, 'PRODUTOS ENTREGUES', marginLeft, y);
    autoTable(doc, {
      startY: y,
      head: [['Produto / dado', 'Categoria']],
      body: deliverables.map((d) => [
        preserveQuotePdfUserText(d.label),
        resolveProductCategory(d),
      ]),
      styles: { fontSize: 8, cellPadding: 1.2 },
      headStyles: { fillColor: QUOTE_PDF_BRAND.primary, textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.72 },
        1: { cellWidth: contentWidth * 0.28 },
      },
      margin: { left: marginLeft, right: marginRight, bottom: marginBottom },
    });
    y = lastY(doc, y) + 6;
  }

  const complementary = filterComplementaryTechnicalNotes(q.technical_notes, resources);
  if (complementary || (!resources.length && isMeaningfulQuotePdfText(q.technical_notes))) {
    y = ensureQuotePdfSpace(doc, y, 16, marginBottom);
    y = drawQuotePdfSectionTitle(doc, 'INFORMAÇÕES TÉCNICAS', marginLeft, y);
    y =
      drawQuotePdfWrapped(
        doc,
        complementary || String(q.technical_notes),
        marginLeft,
        y,
        contentWidth,
        4,
        marginBottom,
      ) + 4;
  }

  if (isMeaningfulQuotePdfText(q.methodology_notes)) {
    y = ensureQuotePdfSpace(doc, y, 16, marginBottom);
    y = drawQuotePdfSectionTitle(doc, 'METODOLOGIA', marginLeft, y);
    y =
      drawQuotePdfWrapped(
        doc,
        String(q.methodology_notes),
        marginLeft,
        y,
        contentWidth,
        4,
        marginBottom,
      ) + 4;
  }

  const scheduleRows = buildQuoteScheduleRows(q);
  if (scheduleRows.length) {
    y = ensureQuotePdfSpace(doc, y, 18, marginBottom);
    y = drawQuotePdfSectionTitle(doc, 'CRONOGRAMA PREVISTO', marginLeft, y);
    autoTable(doc, {
      startY: y,
      head: [['Fase', 'Previsão']],
      body: scheduleRows.map((r) => [r.phase, r.prevision]),
      styles: { fontSize: 8, cellPadding: 1.2 },
      headStyles: { fillColor: QUOTE_PDF_BRAND.primary, textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.4 },
        1: { cellWidth: contentWidth * 0.6 },
      },
      margin: { left: marginLeft, right: marginRight, bottom: marginBottom },
    });
    y = lastY(doc, y) + 6;
  }

  const commercial: Array<[string, string]> = [];
  if (isMeaningfulQuotePdfText(q.payment_method)) {
    commercial.push(['Forma de pagamento', preserveQuotePdfUserText(q.payment_method)]);
  }
  if (formatQuotePdfDateBr(q.expiration_date)) {
    commercial.push(['Validade', formatQuotePdfDateBr(q.expiration_date)]);
  }
  if (commercial.length) {
    y = ensureQuotePdfSpace(doc, y, 16, marginBottom);
    y = drawQuotePdfSectionTitle(doc, 'CONDIÇÕES COMERCIAIS', marginLeft, y);
    autoTable(doc, {
      startY: y,
      body: commercial,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1.2 },
      columnStyles: {
        0: { cellWidth: 45, fontStyle: 'bold', textColor: QUOTE_PDF_BRAND.muted },
        1: { cellWidth: contentWidth - 45 },
      },
      margin: { left: marginLeft, right: marginRight },
    });
    y = lastY(doc, y) + 6;
  }

  y = ensureQuotePdfSpace(doc, y, 36, marginBottom);
  y = drawQuotePdfSectionTitle(doc, 'COMPOSIÇÃO FINANCEIRA', marginLeft, y);
  const f = payload.financials;
  autoTable(doc, {
    startY: y,
    body: [
      ['Subtotal sem BDI', quotePdfMoney(f.totalWithoutBdi)],
      [`BDI (${formatQuotePercentBr(f.bdiPercent, 0)})`, quotePdfMoney(f.bdiAmount)],
      ['Total com BDI', quotePdfMoney(f.totalWithBdi)],
      [`Desconto (${formatQuotePercentBr(f.discountPercent, 0)})`, quotePdfMoney(f.discountValue)],
      ['TOTAL GERAL', quotePdfMoney(f.totalGeral)],
      [
        `Margem (${formatQuotePercentBr(f.marginPercent, 0)}) — informativa`,
        quotePdfMoney(f.marginValue),
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.4 },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.55, fontStyle: 'bold' },
      1: { cellWidth: contentWidth * 0.45, halign: 'right' },
    },
    margin: { left: marginLeft, right: marginRight, bottom: marginBottom },
  });
  y = lastY(doc, y) + 12;

  y = ensureQuotePdfSpace(doc, y, 32, marginBottom);
  y = drawQuotePdfSectionTitle(doc, 'ASSINATURA', marginLeft, y);
  doc.setFontSize(8);
  doc.setTextColor(...QUOTE_PDF_BRAND.ink);
  doc.text(QUOTE_PDF_BRAND.tradeName, marginLeft, y);
  y += 5;

  const proLines = buildProfessionalIdentityLines(q);
  for (const line of proLines) {
    doc.text(line, marginLeft, y);
    y += 4.5;
  }
  if (!proLines.length && isMeaningfulQuotePdfText(q.internal_manager)) {
    doc.text(`Responsável: ${preserveQuotePdfUserText(q.internal_manager)}`, marginLeft, y);
    y += 5;
  }

  y += 6;
  doc.setDrawColor(...QUOTE_PDF_BRAND.line);
  doc.line(marginLeft, y, marginLeft + 70, y);
  doc.setTextColor(...QUOTE_PDF_BRAND.muted);
  doc.text('Assinatura / carimbo', marginLeft, y + 4);

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawQuotePdfFooter(doc, p, totalPages, q.code, marginLeft, marginRight, pageWidth, pageHeight);
  }
  return doc;
}

export async function exportQuotePdfAnalytical(payload: QuoteExportPayload) {
  const doc = await renderQuotePdfAnalytical(payload);
  doc.save(`${payload.quote.code}-analitico.pdf`);
}

export async function buildQuotePdfAnalyticalBytes(
  payload: QuoteExportPayload,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const prevFetch = globalThis.fetch;
  // @ts-expect-error stub
  globalThis.fetch = async () => ({ ok: false });
  try {
    const doc = await renderQuotePdfAnalytical(payload);
    return {
      bytes: new Uint8Array(doc.output('arraybuffer') as ArrayBuffer),
      pageCount: doc.getNumberOfPages(),
    };
  } finally {
    globalThis.fetch = prevFetch;
  }
}
