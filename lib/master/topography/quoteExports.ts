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
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
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

/** PDF Sintético — paisagem, profissional. */
export async function exportQuotePdfSynthetic(payload: QuoteExportPayload) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  await tryLoadLogo(doc);

  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('SV Topografia & Projetos', 48, 14);
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(SAAS_PROVIDER.legalName, 48, 19);
  doc.text(
    `CNPJ ${SAAS_PROVIDER.cnpj} · ${SAAS_PROVIDER.address}, ${SAAS_PROVIDER.neighborhood} — ${SAAS_PROVIDER.city}/${SAAS_PROVIDER.state}`,
    48,
    24,
  );

  doc.setFontSize(12);
  doc.setTextColor(29, 78, 216);
  doc.text(`Orçamento ${payload.quote.code}`, pageWidth - 14, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, pageWidth - 14, 19, {
    align: 'right',
  });

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 28, pageWidth - 14, 28);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Cliente: ${payload.quote.client_name}`, 14, 36);
  doc.text(`Objeto: ${payload.quote.title || '—'}`, 14, 42);
  doc.text(
    `Local: ${[payload.quote.city, payload.quote.state].filter(Boolean).join('/') || '—'}`,
    14,
    48,
  );
  doc.text(`BDI: ${payload.quote.bdi_percent}%`, pageWidth / 2, 36);
  doc.text(`Desconto: ${payload.quote.discount_percent}%`, pageWidth / 2, 42);
  doc.text(`Margem: ${payload.quote.margin_percent}%`, pageWidth / 2, 48);

  const body = flatRows(payload).map((r) => [
    r.stage,
    r.code,
    r.bank,
    r.description,
    String(r.quantity),
    r.unit,
    money(r.adopted),
    money(r.unitBdi),
    money(r.total),
  ]);

  autoTable(doc, {
    startY: 54,
    head: [['Etapa', 'Código', 'Banco', 'Descrição', 'Qtd', 'Un', 'Unit.', 'c/ BDI', 'Total']],
    body,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [29, 78, 216], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      const page = data.pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `${SAAS_PROVIDER.legalName} — Orçamento sintético · página ${page}`,
        14,
        pageHeight - 8,
      );
      doc.text(payload.quote.code, pageWidth - 14, pageHeight - 8, { align: 'right' });
    },
  });

  const finalY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 54) + 8;
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total sem BDI: ${money(payload.financials.totalWithoutBdi)}`, 14, finalY);
  doc.text(`BDI: ${money(payload.financials.bdiAmount)}`, 80, finalY);
  doc.text(`Total Geral: ${money(payload.financials.totalGeral)}`, 150, finalY);

  doc.save(`${payload.quote.code}-sintetico.pdf`);
}

/** Preparado para Fase 5.3 — não implementa o layout analítico completo. */
export function exportQuotePdfAnalyticalPrepared(_payload: QuoteExportPayload) {
  window.alert(
    'PDF Analítico está preparado para a Fase 5.3 e será liberado na próxima entrega.',
  );
}
