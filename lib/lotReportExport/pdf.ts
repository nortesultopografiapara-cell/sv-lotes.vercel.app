import { getReportHeaderLogoUrl } from '@/lib/reportBranding';
import {
  formatLotReportArea,
  formatLotReportCurrency,
  lotReportGroupByLabel,
  lotReportSortByLabel,
} from '@/lib/lotReportExport/format';
import type {
  LotReportBuildResult,
  LotReportGroupBy,
  LotReportMeta,
  LotReportRow,
} from '@/lib/lotReportExport/types';

async function loadLogoBase64(logoUrl?: string | null): Promise<string | null> {
  const url = getReportHeaderLogoUrl(logoUrl);
  if (!url) return null;
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  } catch {
    return null;
  }
}

function pdfTableHead(groupBy: LotReportGroupBy, showProject: boolean): string[] {
  const head: string[] = [];
  if (showProject) head.push('Empreendimento');
  if (groupBy === 'valor' || groupBy === 'status' || groupBy === 'none') {
    head.push('Quadra');
  }
  head.push('Lote');
  head.push('Área (m²)');
  if (groupBy !== 'valor') head.push('Valor (R$)');
  if (groupBy !== 'status') head.push('Status');
  return head;
}

function pdfTableBodyRow(
  row: LotReportRow,
  groupBy: LotReportGroupBy,
  showProject: boolean,
): string[] {
  const cells: string[] = [];
  if (showProject) cells.push(row.projectName);
  if (groupBy === 'valor' || groupBy === 'status' || groupBy === 'none') {
    cells.push(row.blockName);
  }
  cells.push(row.lotNumber);
  cells.push(formatLotReportArea(row.areaM2));
  if (groupBy !== 'valor') cells.push(formatLotReportCurrency(row.price));
  if (groupBy !== 'status') cells.push(row.statusLabel);
  return cells;
}

function addPdfFooters(doc: import('jspdf').jsPDF, totalPages: number) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      'Documento emitido digitalmente pelo SV LOTES GIS',
      14,
      pageHeight - 7,
    );
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 7, {
      align: 'right',
    });
  }
}

export async function generateLotReportPdfBlob(
  result: LotReportBuildResult,
  meta: LotReportMeta,
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const showProject =
    meta.projectLabel.toLowerCase().includes('todos') ||
    new Set(result.rows.map((r) => r.projectId)).size > 1;

  let startY = 18;
  const logo = await loadLogoBase64(meta.companyLogoUrl);
  if (logo) {
    doc.addImage(logo, 'PNG', 14, 10, 28, 14, undefined, 'FAST');
    startY = 28;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text('Relatório de Lotes', logo ? 46 : 14, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(meta.companyName, logo ? 46 : 14, 22);
  doc.text(`Empreendimento: ${meta.projectLabel}`, 14, startY);
  doc.text(`Emitido em: ${meta.issuedAt.toLocaleString('pt-BR')}`, 14, startY + 5);
  doc.text(
    `Agrupamento: ${lotReportGroupByLabel(meta.groupBy)} | Ordenação: ${lotReportSortByLabel(meta.sortBy)}`,
    14,
    startY + 10,
  );

  let cursorY = startY + 16;
  const head = pdfTableHead(meta.groupBy, showProject);

  for (const group of result.groups) {
    if (cursorY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      cursorY = 18;
    }

    if (group.title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 58, 95);
      doc.text(group.title, 14, cursorY);
      cursorY += 6;
    }

    autoTable(doc, {
      head: [head],
      body: group.rows.map((row) => pdfTableBodyRow(row, meta.groupBy, showProject)),
      startY: cursorY,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      margin: { left: 14, right: 14 },
    });

    cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || cursorY) + 4;

    if (meta.groupBy !== 'none') {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `Resumo: ${group.summary.count} lote(s) | Área ${formatLotReportArea(group.summary.totalArea)} | Valor ${formatLotReportCurrency(group.summary.totalValue)}`,
        14,
        cursorY,
      );
      cursorY += 8;
    }
  }

  if (cursorY > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    cursorY = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TOTAL GERAL', 14, cursorY);
  cursorY += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`Quantidade de lotes: ${result.summary.totalLots}`, 14, cursorY);
  cursorY += 4;
  doc.text(`Área total: ${formatLotReportArea(result.summary.totalArea)}`, 14, cursorY);
  cursorY += 4;
  doc.text(`Valor total: ${formatLotReportCurrency(result.summary.totalValue)}`, 14, cursorY);

  const totalPages = doc.internal.getNumberOfPages();
  addPdfFooters(doc, totalPages);

  return doc.output('blob');
}

export async function downloadLotReportPdf(
  result: LotReportBuildResult,
  meta: LotReportMeta,
  filename: string,
): Promise<void> {
  const blob = await generateLotReportPdfBlob(result, meta);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
