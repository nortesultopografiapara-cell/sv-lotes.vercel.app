/**
 * Exportação do Livro Caixa SaaS (Excel e PDF) — client-side.
 */

import { SV_LOTES_BRAND, SV_LOTES_LOGO_PATH } from '@/lib/brand';
import {
  saasCashSourceLabel,
  saasCashTypeLabel,
  type SaasCashMovement,
  type SaasCashSummary,
} from '@/lib/saasCashMovements';
import { formatSaasCurrency } from '@/lib/companyPricing';
import { formatSaasCashStartAtLabel } from '@/lib/saasFinanceSettings';

export type SaasCashExportParams = {
  movements: SaasCashMovement[];
  summary: SaasCashSummary;
  fromDate: string;
  toDate: string;
  exportedAt?: Date;
  cashStartAt?: string | null;
  issuedBy?: string | null;
};

export type SaasCashExportRow = {
  date: string;
  company: string;
  type: string;
  category: string;
  description: string;
  source: string;
  amount: number;
  amountLabel: string;
};

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatPeriod(fromDate: string, toDate: string): string {
  return `${formatDateBr(fromDate)} — ${formatDateBr(toDate)}`;
}

export function buildSaasCashExportFilename(ext: 'xlsx' | 'pdf', at: Date = new Date()): string {
  const iso = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  return `caixa-saas-${iso}.${ext}`;
}

export function mapMovementsToExportRows(movements: SaasCashMovement[]): SaasCashExportRow[] {
  return movements.map((movement) => {
    const signed =
      movement.type === 'expense' || movement.type === 'transfer'
        ? -movement.amount
        : movement.amount;
    return {
      date: formatDateBr(movement.movement_date),
      company: movement.company_name || '—',
      type: saasCashTypeLabel(movement.type),
      category: movement.category,
      description: movement.description || '—',
      source: saasCashSourceLabel(movement.source),
      amount: signed,
      amountLabel: `${signed < 0 ? '−' : '+'}${formatSaasCurrency(Math.abs(signed))}`,
    };
  });
}

async function loadSvLotesLogoDataUrlClient(): Promise<string | null> {
  try {
    const res = await fetch(SV_LOTES_LOGO_PATH);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function downloadBlob(buffer: ArrayBuffer | Blob, filename: string, mime: string) {
  const blob = buffer instanceof Blob ? buffer : new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportMetaLines(params: SaasCashExportParams, exportedAt: Date) {
  const startLabel = formatSaasCashStartAtLabel(params.cashStartAt);
  return {
    period: formatPeriod(params.fromDate, params.toDate),
    exportedAtLabel: exportedAt.toLocaleString('pt-BR'),
    issuedBy: params.issuedBy?.trim() || 'Super Admin',
    startLabel,
  };
}

export async function exportSaasCashExcel(params: SaasCashExportParams): Promise<void> {
  const exportedAt = params.exportedAt ?? new Date();
  const rows = mapMovementsToExportRows(params.movements);
  const meta = exportMetaLines(params, exportedAt);
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = SV_LOTES_BRAND.name;
  workbook.created = exportedAt;

  const ws = workbook.addWorksheet('Livro Caixa', {
    views: [{ state: 'frozen', ySplit: 10 }],
  });

  let rowIdx = 1;
  const titleRow = (text: string, size = 14, bold = true) => {
    ws.mergeCells(`A${rowIdx}:G${rowIdx}`);
    const cell = ws.getCell(`A${rowIdx}`);
    cell.value = text;
    cell.font = { size, bold };
    cell.alignment = { horizontal: 'center' };
    rowIdx += 1;
  };

  titleRow(SV_LOTES_BRAND.name, 16);
  titleRow(SV_LOTES_BRAND.tagline, 11, false);
  titleRow('Livro Caixa SaaS', 13);
  titleRow(`Período: ${meta.period}`, 10, false);
  titleRow(`Emitido por: ${meta.issuedBy}`, 10, false);
  titleRow(`Exportado em: ${meta.exportedAtLabel}`, 10, false);
  if (meta.startLabel) {
    titleRow(`Financeiro contabilizado a partir de ${meta.startLabel}`, 10, false);
  }

  ws.addRow([]);
  rowIdx += 1;

  ws.addRow([
    'Entradas',
    formatSaasCurrency(params.summary.periodIncome),
    'Despesas',
    formatSaasCurrency(params.summary.periodExpense),
    'Transferências',
    formatSaasCurrency(params.summary.periodTransfer || 0),
    'Resultado',
    formatSaasCurrency(params.summary.netResult),
    `${params.summary.movementCount} mov.`,
  ]).font = { bold: true };

  ws.addRow([]);

  const header = ws.addRow([
    'Data',
    'Empresa',
    'Tipo',
    'Categoria',
    'Descrição',
    'Origem',
    'Valor',
  ]);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A5F' },
  };

  if (rows.length === 0) {
    const emptyRow = ws.addRow(['Nenhuma movimentação no período selecionado.']);
    ws.mergeCells(`A${emptyRow.number}:G${emptyRow.number}`);
    emptyRow.getCell(1).alignment = { horizontal: 'center' };
    emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
  } else {
    for (const row of rows) {
      const dataRow = ws.addRow([
        row.date,
        row.company,
        row.type,
        row.category,
        row.description,
        row.source,
        row.amount,
      ]);
      dataRow.getCell(7).numFmt = 'R$ #,##0.00';
      if (row.amount < 0) {
        dataRow.getCell(7).font = { color: { argb: 'FFB91C1C' } };
      }
    }
  }

  ws.columns = [
    { width: 12 },
    { width: 28 },
    { width: 12 },
    { width: 18 },
    { width: 36 },
    { width: 14 },
    { width: 16 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    buffer,
    buildSaasCashExportFilename('xlsx', exportedAt),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

export async function exportSaasCashPdf(params: SaasCashExportParams): Promise<void> {
  const exportedAt = params.exportedAt ?? new Date();
  const rows = mapMovementsToExportRows(params.movements);
  const meta = exportMetaLines(params, exportedAt);
  const logo = await loadSvLotesLogoDataUrlClient();
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const footerY = pageH - 28;

  const drawFooter = (pageNum: number, pageCount: number) => {
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`${SV_LOTES_BRAND.name} — Relatório gerado automaticamente`, margin, footerY);
    doc.text(`Página ${pageNum} de ${pageCount}`, pageW - margin, footerY, { align: 'right' });
  };

  const drawHeader = (startY: number): number => {
    let y = startY;
    if (logo) {
      try {
        doc.addImage(logo, 'PNG', margin, y - 4, 48, 48);
      } catch {
        // segue sem logo se falhar decode
      }
    }

    const textX = logo ? margin + 58 : margin;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(SV_LOTES_BRAND.name, textX, y + 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(SV_LOTES_BRAND.tagline, textX, y + 26);
    doc.text('Livro Caixa SaaS', textX, y + 40);
    y += logo ? 58 : 48;

    doc.setFontSize(9);
    doc.text(`Emitido por: ${meta.issuedBy}`, margin, y);
    y += 13;
    doc.text(`Data/hora da emissão: ${meta.exportedAtLabel}`, margin, y);
    y += 13;
    doc.text(`Período do relatório: ${meta.period}`, margin, y);
    y += 13;
    if (meta.startLabel) {
      doc.setTextColor(180, 120, 0);
      doc.text(`Financeiro contabilizado a partir de ${meta.startLabel}`, margin, y);
      doc.setTextColor(0, 0, 0);
      y += 13;
    }

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Entradas: ${formatSaasCurrency(params.summary.periodIncome)}`, margin, y);
    doc.text(`Despesas: ${formatSaasCurrency(params.summary.periodExpense)}`, margin + 130, y);
    doc.text(
      `Transfer.: ${formatSaasCurrency(params.summary.periodTransfer || 0)}`,
      margin + 260,
      y,
    );
    doc.text(`Resultado: ${formatSaasCurrency(params.summary.netResult)}`, margin + 390, y);
    y += 20;
    return y;
  };

  let y = drawHeader(margin);

  const colWidths = [70, 120, 55, 90, 180, 70, 80];
  const headers = ['Data', 'Empresa', 'Tipo', 'Categoria', 'Descrição', 'Origem', 'Valor'];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  const drawTableHeader = () => {
    doc.setFillColor(30, 58, 95);
    doc.rect(margin, y, tableWidth, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    let x = margin + 4;
    headers.forEach((header, i) => {
      doc.text(header, x, y + 12);
      x += colWidths[i];
    });
    y += 20;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
  };

  if (rows.length === 0) {
    drawTableHeader();
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('Nenhuma movimentação no período selecionado.', pageW / 2, y + 20, {
      align: 'center',
    });
    doc.setTextColor(0, 0, 0);
  } else {
    drawTableHeader();

    for (const row of rows) {
      if (y > pageH - 70) {
        doc.addPage();
        y = drawHeader(margin);
        drawTableHeader();
      }

      const cells = [
        row.date,
        row.company.slice(0, 24),
        row.type,
        row.category.slice(0, 18),
        row.description.slice(0, 40),
        row.source,
        row.amountLabel.replace('+', '').replace('−', '-'),
      ];

      let x = margin + 4;
      doc.setFontSize(8);
      cells.forEach((cell, i) => {
        if (i === 6 && row.amount < 0) {
          doc.setTextColor(185, 28, 28);
        } else {
          doc.setTextColor(0, 0, 0);
        }
        doc.text(String(cell), x, y + 10);
        x += colWidths[i];
      });
      y += 16;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawFooter(page, pageCount);
  }

  doc.save(buildSaasCashExportFilename('pdf', exportedAt));
}
