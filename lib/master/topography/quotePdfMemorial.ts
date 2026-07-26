/**
 * Memória de Cálculo em PDF — gerada automaticamente (Fase 5.3).
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
  filterComplementaryTechnicalNotes,
  isMeaningfulQuotePdfText,
  preserveQuotePdfUserText,
} from './quotePdfSyntheticLayout';
import { formatQuoteScopeLabelsProse } from './quoteScopeCatalog';
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
  const marginLeft = 14;
  const marginRight = 14;
  const marginBottom = 16;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const q = payload.quote;
  const f = payload.financials;

  await loadQuotePdfLogo(doc, 14, 10, 28, 14);
  let y = drawQuotePdfBrandHeader(doc, {
    code: q.code,
    subtitle: 'Memória de Cálculo',
    marginLeft,
    marginRight,
    pageWidth,
  });

  y = drawQuotePdfSectionTitle(doc, '1. IDENTIFICAÇÃO', marginLeft, y);
  y = drawQuotePdfWrapped(
    doc,
    `Cliente: ${preserveQuotePdfUserText(q.client_name)}. Orçamento ${q.code}. Objeto: ${
      preserveQuotePdfUserText(q.title) || preserveQuotePdfUserText(q.description) || 'não informado'
    }.`,
    marginLeft,
    y,
    contentWidth,
    4,
    marginBottom,
  );
  y += 4;

  y = drawQuotePdfSectionTitle(doc, '2. OBJETIVO', marginLeft, y);
  y = drawQuotePdfWrapped(
    doc,
    isMeaningfulQuotePdfText(q.description)
      ? String(q.description)
      : 'Composição técnica e financeira do orçamento com base nas etapas e itens cadastrados.',
    marginLeft,
    y,
    contentWidth,
    4,
    marginBottom,
  );
  y += 4;

  y = drawQuotePdfSectionTitle(doc, '3. METODOLOGIA DE COMPOSIÇÃO', marginLeft, y);
  y = drawQuotePdfWrapped(
    doc,
    `Os valores foram obtidos pela fórmula: Quantidade × Preço adotado × (1 + BDI/100). ` +
      `BDI aplicado: ${f.bdiPercent}%. Desconto: ${f.discountPercent}%. Margem informativa: ${f.marginPercent}%. ` +
      `O total geral corresponde ao total com BDI menos o desconto.`,
    marginLeft,
    y,
    contentWidth,
    4,
    marginBottom,
  );
  y += 4;

  const resources = Array.isArray(q.technical_resources) ? q.technical_resources : [];
  const deliverables = Array.isArray(q.deliverables) ? q.deliverables : [];
  if (resources.length || deliverables.length) {
    y = drawQuotePdfSectionTitle(doc, '4. RECURSOS E ENTREGÁVEIS CONSIDERADOS', marginLeft, y);
    if (resources.length) {
      y = drawQuotePdfWrapped(
        doc,
        `Equipamentos/recursos: ${formatQuoteScopeLabelsProse(resources)}.`,
        marginLeft,
        y,
        contentWidth,
        4,
        marginBottom,
      );
      y += 2;
    }
    if (deliverables.length) {
      y = drawQuotePdfWrapped(
        doc,
        `Produtos/dados entregues: ${formatQuoteScopeLabelsProse(deliverables)}.`,
        marginLeft,
        y,
        contentWidth,
        4,
        marginBottom,
      );
      y += 2;
    }
    y += 2;
  }

  let stageIndex = 0;
  for (const stage of [...payload.stages].sort((a, b) => a.sort_order - b.sort_order)) {
    stageIndex += 1;
    y = ensureQuotePdfSpace(doc, y, 24, marginBottom);
    y = drawQuotePdfSectionTitle(
      doc,
      `${4 + (resources.length || deliverables.length ? 1 : 0) + stageIndex}. ETAPA — ${preserveQuotePdfUserText(stage.name) || 'Etapa'}`,
      marginLeft,
      y,
    );
    y = drawQuotePdfWrapped(
      doc,
      `Justificativa: composição dos serviços e insumos necessários à execução desta etapa do objeto orçado.`,
      marginLeft,
      y,
      contentWidth,
      4,
      marginBottom,
    );
    y += 2;

    const body = (stage.items || []).map((item) => {
      const adopted = item.adopted_price ?? item.unit_value;
      const unitBdi = itemUnitWithBdi(adopted, q.bdi_percent);
      const total = itemTotalWithBdi(item.quantity, adopted, q.bdi_percent);
      return [
        item.description || '',
        `${item.quantity} ${item.unit || 'UN'}`,
        quotePdfMoney(adopted),
        quotePdfMoney(unitBdi),
        quotePdfMoney(total),
      ];
    });

    if (body.length) {
      autoTable(doc, {
        startY: y,
        head: [['Item', 'Qtd/Un', 'Adotado', 'c/ BDI', 'Total']],
        body,
        styles: { fontSize: 7.5, cellPadding: 1.1, overflow: 'linebreak' },
        headStyles: {
          fillColor: QUOTE_PDF_BRAND.primary,
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7.5,
        },
        columnStyles: {
          0: { cellWidth: contentWidth * 0.4 },
          1: { cellWidth: contentWidth * 0.14,halign: 'center' },
          2: { cellWidth: contentWidth * 0.15,halign: 'right' },
          3: { cellWidth: contentWidth * 0.15,halign: 'right' },
          4: { cellWidth: contentWidth * 0.16,halign: 'right' },
        },
        margin: { left: marginLeft, right: marginRight, bottom: marginBottom },
      });
      y = lastY(doc, y) + 3;
    }
    doc.setFontSize(8);
    doc.setTextColor(...QUOTE_PDF_BRAND.ink);
    doc.text(
      `Valor da etapa: ${quotePdfMoney(stage.subtotal)} (${stage.percentOfBudget.toFixed(2)}% do orçamento)`,
      marginLeft,
      y,
    );
    y += 7;
  }

  y = ensureQuotePdfSpace(doc, y, 36, marginBottom);
  y = drawQuotePdfSectionTitle(doc, 'RESUMO FINANCEIRO', marginLeft, y);
  autoTable(doc, {
    startY: y,
    body: [
      ['Subtotal sem BDI', quotePdfMoney(f.totalWithoutBdi)],
      [`BDI (${f.bdiPercent}%)`, quotePdfMoney(f.bdiAmount)],
      ['Total com BDI', quotePdfMoney(f.totalWithBdi)],
      [`Desconto (${f.discountPercent}%)`, quotePdfMoney(f.discountValue)],
      ['TOTAL GERAL', quotePdfMoney(f.totalGeral)],
      [`Margem (${f.marginPercent}%)`, quotePdfMoney(f.marginValue)],
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.4 },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.55, fontStyle: 'bold' },
      1: { cellWidth: contentWidth * 0.45,halign: 'right' },
    },
    margin: { left: marginLeft, right: marginRight },
  });
  y = lastY(doc, y) + 6;

  y = drawQuotePdfSectionTitle(doc, 'PREMISSAS UTILIZADAS', marginLeft, y);
  y = drawQuotePdfWrapped(
    doc,
    `Preços adotados conforme cadastro do orçamento; BDI ${f.bdiPercent}%; ` +
      `prazo estimado ${preserveQuotePdfUserText(q.estimated_deadline) || 'conforme proposta'}; ` +
      `escopo limitado aos itens e entregáveis selecionados.`,
    marginLeft,
    y,
    contentWidth,
    4,
    marginBottom,
  );
  y += 4;

  y = drawQuotePdfSectionTitle(doc, 'LIMITAÇÕES', marginLeft, y);
  y = drawQuotePdfWrapped(
    doc,
    'Esta memória descreve a composição financeira do orçamento. Alterações de escopo, ' +
      'quantidade, BDI ou desconto implicam recálculo. Não substitui memorial descritivo SIGEF/INCRA ' +
      'nem projeto executivo detalhado, quando exigidos.',
    marginLeft,
    y,
    contentWidth,
    4,
    marginBottom,
  );
  y += 4;

  const notes = filterComplementaryTechnicalNotes(q.technical_notes, resources);
  if (notes) {
    y = drawQuotePdfSectionTitle(doc, 'OBSERVAÇÕES', marginLeft, y);
    y = drawQuotePdfWrapped(doc, notes, marginLeft, y, contentWidth, 4, marginBottom);
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
