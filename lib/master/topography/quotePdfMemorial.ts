/**
 * Memória de Cálculo em PDF — gerada automaticamente (Fase 5.3 revisão final).
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
  quotePdfAutoTableSanitizeCell,
  quotePdfMoney,
  QUOTE_PDF_BRAND,
} from './quotePdfBrand';
import {
  filterComplementaryTechnicalNotes,
  isMeaningfulQuotePdfText,
  preserveQuotePdfUserText,
} from './quotePdfSyntheticLayout';
import { formatQuoteScopeLabelsProse } from './quoteScopeCatalog';
import { formatQuotePercentBr } from './quotePdfPresentation';
import {
  QUOTE_PDF_MEMORIAL_FORMULA_LINES,
} from './quotePdfText';
import { itemTotalWithBdi, itemUnitWithBdi } from './quoteFinancials';
import type { QuoteExportPayload } from './quoteExportTypes';

function lastY(doc: jsPDF, fallback: number): number {
  return (
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || fallback
  );
}

export async function renderQuotePdfMemorial(payload: QuoteExportPayload): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 12;
  const marginRight = 12;
  const marginBottom = 14;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const q = payload.quote;
  const f = payload.financials;
  let sectionNo = 0;
  const nextSection = (title: string) => {
    sectionNo += 1;
    return `${sectionNo}. ${title}`;
  };

  await loadQuotePdfLogo(doc, 12, 8, 24, 12);
  let y = drawQuotePdfBrandHeader(doc, {
    code: q.code,
    subtitle: 'Memória de Cálculo',
    marginLeft,
    marginRight,
    pageWidth,
  });
  // Cabeçalho padrão deixa y=36; compactar um pouco para caber em 1 página.
  if (y > 34) y = 34;

  const beginSection = (needed: number) => {
    y = ensureQuotePdfSpace(doc, y, needed, marginBottom, 14);
  };

  beginSection(16);
  y = drawQuotePdfSectionTitle(doc, nextSection('IDENTIFICAÇÃO'), marginLeft, y);
  y = drawQuotePdfWrapped(
    doc,
    `Cliente: ${preserveQuotePdfUserText(q.client_name)}. Orçamento ${q.code}. Objeto: ${
      preserveQuotePdfUserText(q.title) || preserveQuotePdfUserText(q.description) || 'não informado'
    }.`,
    marginLeft,
    y,
    contentWidth,
    3.6,
    marginBottom,
  );
  y += 3;

  beginSection(14);
  y = drawQuotePdfSectionTitle(doc, nextSection('OBJETIVO'), marginLeft, y);
  y = drawQuotePdfWrapped(
    doc,
    isMeaningfulQuotePdfText(q.description)
      ? String(q.description)
      : 'Composição técnica e financeira do orçamento com base nas etapas e itens cadastrados.',
    marginLeft,
    y,
    contentWidth,
    3.6,
    marginBottom,
  );
  y += 3;

  beginSection(22);
  y = drawQuotePdfSectionTitle(doc, nextSection('FÓRMULAS DE COMPOSIÇÃO'), marginLeft, y);
  y = drawQuotePdfWrapped(
    doc,
    [
      ...QUOTE_PDF_MEMORIAL_FORMULA_LINES,
      `BDI aplicado: ${formatQuotePercentBr(f.bdiPercent, 0)}. Desconto: ${formatQuotePercentBr(f.discountPercent, 0)}.`,
      `Margem (${formatQuotePercentBr(f.marginPercent, 0)}): apenas informativa - não entra no total geral.`,
    ].join('\n'),
    marginLeft,
    y,
    contentWidth,
    3.5,
    marginBottom,
  );
  y += 3;

  if (isMeaningfulQuotePdfText(q.methodology_notes)) {
    beginSection(16);
    y = drawQuotePdfSectionTitle(doc, nextSection('METODOLOGIA'), marginLeft, y);
    y = drawQuotePdfWrapped(
      doc,
      String(q.methodology_notes),
      marginLeft,
      y,
      contentWidth,
      3.6,
      marginBottom,
    );
    y += 3;
  }

  const resources = Array.isArray(q.technical_resources) ? q.technical_resources : [];
  const deliverables = Array.isArray(q.deliverables) ? q.deliverables : [];
  if (resources.length || deliverables.length) {
    beginSection(18);
    y = drawQuotePdfSectionTitle(
      doc,
      nextSection('RECURSOS E ENTREGÁVEIS CONSIDERADOS'),
      marginLeft,
      y,
    );
    if (resources.length) {
      y = drawQuotePdfWrapped(
        doc,
        `Equipamentos/recursos: ${formatQuoteScopeLabelsProse(resources)}.`,
        marginLeft,
        y,
        contentWidth,
        3.6,
        marginBottom,
      );
      y += 1.5;
    }
    if (deliverables.length) {
      y = drawQuotePdfWrapped(
        doc,
        `Produtos/dados entregues: ${formatQuoteScopeLabelsProse(deliverables)}.`,
        marginLeft,
        y,
        contentWidth,
        3.6,
        marginBottom,
      );
      y += 1.5;
    }
    y += 2;
  }

  for (const stage of [...payload.stages].sort((a, b) => a.sort_order - b.sort_order)) {
    beginSection(28);
    y = drawQuotePdfSectionTitle(
      doc,
      nextSection(`ETAPA - ${preserveQuotePdfUserText(stage.name) || 'Etapa'}`),
      marginLeft,
      y,
    );

    const stageHasItemNotes = (stage.items || []).some((it) =>
      isMeaningfulQuotePdfText(it.calculation_notes),
    );
    if (!stageHasItemNotes) {
      y = drawQuotePdfWrapped(
        doc,
        'Premissa da etapa: valores conforme itens cadastrados (quantidade × preço adotado, com BDI).',
        marginLeft,
        y,
        contentWidth,
        3.5,
        marginBottom,
      );
      y += 1.5;
    }

    const body = (stage.items || []).map((item) => {
      const adopted = item.adopted_price ?? item.unit_value;
      const unitBdi = itemUnitWithBdi(adopted, q.bdi_percent);
      const total = itemTotalWithBdi(item.quantity, adopted, q.bdi_percent);
      return [
        item.description || '',
        String(item.quantity),
        item.unit || 'UN',
        quotePdfMoney(adopted),
        quotePdfMoney(unitBdi),
        quotePdfMoney(total),
      ];
    });

    if (body.length) {
      autoTable(doc, {
        startY: y,
        head: [['Item', 'Qtd.', 'Un.', 'Unitário', 'c/ BDI', 'Total']],
        body,
        styles: { fontSize: 7, cellPadding: 0.9, overflow: 'linebreak' },
        headStyles: {
          fillColor: QUOTE_PDF_BRAND.primary,
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7,
        },
        columnStyles: {
          0: { cellWidth: contentWidth * 0.38 },
          1: { cellWidth: contentWidth * 0.09, halign: 'center' },
          2: { cellWidth: contentWidth * 0.08, halign: 'center' },
          3: { cellWidth: contentWidth * 0.15,halign: 'right' },
          4: { cellWidth: contentWidth * 0.15,halign: 'right' },
          5: { cellWidth: contentWidth * 0.15,halign: 'right' },
        },
        margin: { left: marginLeft, right: marginRight, bottom: marginBottom },
        didParseCell: quotePdfAutoTableSanitizeCell,
      });
      y = lastY(doc, y) + 2;
    }

    for (const item of stage.items || []) {
      if (!isMeaningfulQuotePdfText(item.calculation_notes)) continue;
      beginSection(10);
      doc.setFontSize(7);
      doc.setTextColor(...QUOTE_PDF_BRAND.muted);
      y = drawQuotePdfWrapped(
        doc,
        `Justificativa - ${preserveQuotePdfUserText(item.description) || 'item'}: ${preserveQuotePdfUserText(item.calculation_notes)}`,
        marginLeft,
        y,
        contentWidth,
        3.3,
        marginBottom,
      );
      y += 1.5;
    }

    doc.setFontSize(8);
    doc.setTextColor(...QUOTE_PDF_BRAND.ink);
    doc.text(
      `Subtotal da etapa: ${quotePdfMoney(stage.subtotal)} (${formatQuotePercentBr(stage.percentOfBudget)} do orçamento)`,
      marginLeft,
      y,
    );
    y += 5.5;
  }

  beginSection(34);
  y = drawQuotePdfSectionTitle(doc, nextSection('RESUMO FINANCEIRO'), marginLeft, y);
  autoTable(doc, {
    startY: y,
    body: [
      ['Subtotal sem BDI', quotePdfMoney(f.totalWithoutBdi)],
      [`BDI (${formatQuotePercentBr(f.bdiPercent, 0)})`, quotePdfMoney(f.bdiAmount)],
      ['Total com BDI', quotePdfMoney(f.totalWithBdi)],
      [`Desconto (${formatQuotePercentBr(f.discountPercent, 0)})`, quotePdfMoney(f.discountValue)],
      ['TOTAL GERAL', quotePdfMoney(f.totalGeral)],
      [
        `Margem (${formatQuotePercentBr(f.marginPercent, 0)}) - informativa`,
        quotePdfMoney(f.marginValue),
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.1 },
    didParseCell: quotePdfAutoTableSanitizeCell,
    columnStyles: {
      0: { cellWidth: contentWidth * 0.55, fontStyle: 'bold' },
      1: { cellWidth: contentWidth * 0.45,halign: 'right' },
    },
    margin: { left: marginLeft, right: marginRight, bottom: marginBottom },
  });
  y = lastY(doc, y) + 4;

  const premissasParts: string[] = [];
  premissasParts.push(`Preços adotados conforme cadastro do orçamento; BDI ${formatQuotePercentBr(f.bdiPercent, 0)}.`);
  const prazo =
    preserveQuotePdfUserText(q.total_deadline_text) ||
    preserveQuotePdfUserText(q.estimated_deadline);
  if (prazo) premissasParts.push(`Prazo global: ${prazo}.`);
  premissasParts.push('Escopo limitado aos itens e entregáveis selecionados.');
  beginSection(14);
  y = drawQuotePdfSectionTitle(doc, nextSection('PREMISSAS UTILIZADAS'), marginLeft, y);
  y = drawQuotePdfWrapped(
    doc,
    premissasParts.join(' '),
    marginLeft,
    y,
    contentWidth,
    3.5,
    marginBottom,
  );
  y += 3;

  beginSection(14);
  y = drawQuotePdfSectionTitle(doc, nextSection('LIMITAÇÕES'), marginLeft, y);
  y = drawQuotePdfWrapped(
    doc,
    'Esta memória descreve a composição financeira do orçamento. Alterações de escopo, ' +
      'quantidade, BDI ou desconto implicam recálculo. Não substitui memorial descritivo SIGEF/INCRA ' +
      'nem projeto executivo detalhado, quando exigidos.',
    marginLeft,
    y,
    contentWidth,
    3.5,
    marginBottom,
  );
  y += 3;

  const notes = filterComplementaryTechnicalNotes(q.technical_notes, resources);
  if (notes) {
    beginSection(12);
    y = drawQuotePdfSectionTitle(doc, nextSection('OBSERVAÇÕES'), marginLeft, y);
    y = drawQuotePdfWrapped(doc, notes, marginLeft, y, contentWidth, 3.5, marginBottom);
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawQuotePdfFooter(doc, p, totalPages, q.code, marginLeft, marginRight, pageWidth, pageHeight);
  }
  return doc;
}

export async function exportQuotePdfMemorial(payload: QuoteExportPayload) {
  const doc = await renderQuotePdfMemorial(payload);
  doc.save(`${payload.quote.code}-memorial-calculo.pdf`);
}

export async function buildQuotePdfMemorialBytes(
  payload: QuoteExportPayload,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const prevFetch = globalThis.fetch;
  // @ts-expect-error stub
  globalThis.fetch = async () => ({ ok: false });
  try {
    const doc = await renderQuotePdfMemorial(payload);
    return {
      bytes: new Uint8Array(doc.output('arraybuffer') as ArrayBuffer),
      pageCount: doc.getNumberOfPages(),
    };
  } finally {
    globalThis.fetch = prevFetch;
  }
}
