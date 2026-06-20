/**
 * Exportação do Livro Caixa SaaS (Excel e PDF) — client-side.
 */

import {
  saasCashSourceLabel,
  saasCashTypeLabel,
  type SaasCashMovement,
  type SaasCashSummary,
} from '@/lib/saasCashMovements';
import { formatSaasCurrency } from '@/lib/companyPricing';

export type SaasCashExportParams = {
  movements: SaasCashMovement[];
  summary: SaasCashSummary;
  fromDate: string;
  toDate: string;
  exportedAt?: Date;
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
    const signed = movement.type === 'expense' ? -movement.amount : movement.amount;
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

function downloadBlob(buffer: ArrayBuffer | Blob, filename: string, mime: string) {
  const blob = buffer instanceof Blob ? buffer : new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportSaasCashExcel(params: SaasCashExportParams): Promise<void> {
  const exportedAt = params.exportedAt ?? new Date();
  const rows = mapMovementsToExportRows(params.movements);
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SV LOTES';
  workbook.created = exportedAt;

  const ws = workbook.addWorksheet('Livro Caixa', {
    views: [{ state: 'frozen', ySplit: 7 }],
  });

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = 'SV LOTES';
  ws.getCell('A1').font = { size: 16, bold: true };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  ws.mergeCells('A2:G2');
  ws.getCell('A2').value = 'Livro Caixa SaaS';
  ws.getCell('A2').font = { size: 13, bold: true };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  ws.mergeCells('A3:G3');
  ws.getCell('A3').value = `Período: ${formatPeriod(params.fromDate, params.toDate)}`;
  ws.getCell('A3').alignment = { horizontal: 'center' };

  ws.mergeCells('A4:G4');
  ws.getCell('A4').value = `Exportado em: ${exportedAt.toLocaleString('pt-BR')}`;
  ws.getCell('A4').font = { size: 10, italic: true };
  ws.getCell('A4').alignment = { horizontal: 'center' };

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
  header.font = { bold: true };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A5F' },
  };
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };

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
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SV LOTES', pageW / 2, y, { align: 'center' });
  y += 22;

  doc.setFontSize(14);
  doc.text('Livro Caixa SaaS', pageW / 2, y, { align: 'center' });
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Período: ${formatPeriod(params.fromDate, params.toDate)}`, margin, y);
  y += 16;

  doc.text(`Entradas: ${formatSaasCurrency(params.summary.periodIncome)}`, margin, y);
  doc.text(`Saídas: ${formatSaasCurrency(params.summary.periodExpense)}`, margin + 180, y);
  doc.text(`Saldo: ${formatSaasCurrency(params.summary.netResult)}`, margin + 340, y);
  y += 22;

  const colWidths = [70, 120, 55, 90, 180, 70, 80];
  const headers = ['Data', 'Empresa', 'Tipo', 'Categoria', 'Descrição', 'Origem', 'Valor'];

  const drawTableHeader = () => {
    doc.setFillColor(30, 58, 95);
    doc.rect(margin, y, colWidths.reduce((a, b) => a + b, 0), 18, 'F');
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

  drawTableHeader();

  for (const row of rows) {
    if (y > pageH - 60) {
      doc.addPage();
      y = margin;
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

  const footerY = pageH - 24;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Emitido em ${exportedAt.toLocaleString('pt-BR')} — SV LOTES`,
    pageW / 2,
    footerY,
    { align: 'center' },
  );

  doc.save(buildSaasCashExportFilename('pdf', exportedAt));
}
