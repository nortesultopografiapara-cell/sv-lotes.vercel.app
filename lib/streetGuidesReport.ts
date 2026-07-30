/**
 * Relatório de Vias — mesma fonte do Quadro de Vias da Prancha Geral.
 * PDF + Excel. Sem jsPDF no cálculo (helpers puros em enterpriseOverviewStreets).
 */

import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  loadImageAsBase64,
  loadReportHeaderLogoBase64,
} from '@/lib/reportBranding';
import {
  buildLocalStreetLinesFromGuides,
  buildStreetTableRows,
  formatLengthMetersPtBr,
  groupEnterpriseStreets,
  type EnterpriseStreetGrouped,
  type EnterpriseStreetTableRow,
} from '@/lib/enterpriseOverviewStreets';

export type StreetGuidesReportMeta = {
  projectName: string;
  companyName: string;
  companyLogoUrl?: string | null;
  userName: string;
  emittedAt: string;
  emittedAtIso?: string;
};

export type StreetGuidesReportData = {
  rows: EnterpriseStreetTableRow[];
  pendingRows: EnterpriseStreetTableRow[];
  streets: EnterpriseStreetGrouped[];
  streetCount: number;
  totalLengthM: number;
  totalLengthLabel: string;
  totalLengthKm: number;
  totalLengthKmLabel: string;
};

export function formatLengthKmPtBr(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  const km = meters / 1000;
  return km.toLocaleString('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

/**
 * Mesma pipeline do Quadro de Vias: normalize → UTM → group → table rows.
 * Origin 0,0: comprimentos são invariantes à translação.
 */
export function buildStreetGuidesReportData(params: {
  guides: Array<Record<string, unknown>>;
  project: Record<string, unknown>;
}): StreetGuidesReportData {
  const { guides, project } = params;
  const built = buildLocalStreetLinesFromGuides({
    guides,
    project,
    originE: 0,
    originN: 0,
    logInvalid: false,
  });
  const grouped = groupEnterpriseStreets({
    guides,
    localLinesByGuideId: built.localLinesByGuideId,
    haversineLengthByGuideId: built.haversineLengthByGuideId,
  });
  const { rows, pendingRows, totalLengthM } = buildStreetTableRows(
    grouped.streets,
  );
  return {
    rows,
    pendingRows,
    streets: grouped.streets,
    streetCount: rows.length,
    totalLengthM,
    totalLengthLabel: formatLengthMetersPtBr(totalLengthM),
    totalLengthKm: totalLengthM / 1000,
    totalLengthKmLabel: formatLengthKmPtBr(totalLengthM),
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFileSlug(name: string): string {
  return String(name || 'empreendimento')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

export async function generateStreetGuidesReportPdf(params: {
  data: StreetGuidesReportData;
  meta: StreetGuidesReportMeta;
}): Promise<jsPDF> {
  const { data, meta } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 14;

  let logoBase64: string | null = null;
  try {
    if (meta.companyLogoUrl) {
      logoBase64 = await loadImageAsBase64(meta.companyLogoUrl);
    }
    if (!logoBase64) {
      logoBase64 = await loadReportHeaderLogoBase64(null);
    }
  } catch {
    logoBase64 = null;
  }

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, y - 2, 18, 18);
    } catch {
      /* ignore */
    }
  }

  const headerX = margin + (logoBase64 ? 22 : 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(11, 58, 102);
  doc.text('RELATÓRIO DE VIAS', headerX, y + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text(meta.companyName || '—', headerX, y + 11);
  doc.text(`Empreendimento: ${meta.projectName || '—'}`, headerX, y + 16);
  doc.text(`Emissão: ${meta.emittedAt}`, headerX, y + 21);
  if (meta.userName) {
    doc.text(`Usuário: ${meta.userName}`, headerX, y + 26);
  }

  y = meta.userName ? 44 : 40;
  doc.setDrawColor(11, 58, 102);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // Mesmas colunas do Quadro de Vias da Prancha Geral: Nº | Via | Comprimento
  const body =
    data.rows.length > 0
      ? data.rows.map((r) => [r.number, r.name, r.lengthLabel])
      : [['—', 'Nenhuma via com geometria válida', '—']];

  autoTable(doc, {
    startY: y,
    head: [['Nº', 'Via', 'Comprimento']],
    body,
    margin: { left: margin, right: margin, bottom: 18 },
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2.2,
      textColor: [30, 30, 30],
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [11, 58, 102],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    columnStyles: {
      0: { cellWidth: 16, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 36, halign: 'right' },
    },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    didDrawPage: () => {
      /* footer aplicado depois — evita duplicar em didDrawPage */
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = ((doc as any).lastAutoTable?.finalY as number) || y + 10;
  let footerY = finalY + 10;
  if (footerY > pageH - 28) {
    doc.addPage();
    footerY = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(11, 58, 102);
  doc.text(`Total de vias: ${data.streetCount}`, margin, footerY);
  footerY += 6;
  doc.text(`Comprimento total: ${data.totalLengthLabel}`, margin, footerY);

  if (data.pendingRows.length > 0) {
    footerY += 8;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Pendências (sem geometria / sem nome): ${data.pendingRows.length}`,
      margin,
      footerY,
    );
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `SV LOTES — Relatório de Vias — pág. ${p}/${pageCount}`,
      pageW / 2,
      pageH - 8,
      { align: 'center' },
    );
  }

  return doc;
}

export function streetGuidesReportFileSlug(
  projectName: string,
  emittedAtIso?: string,
): { project: string; date: string } {
  const project = safeFileSlug(projectName);
  const d = emittedAtIso ? new Date(emittedAtIso) : new Date();
  const date = Number.isFinite(d.getTime())
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : new Date().toISOString().slice(0, 10);
  return { project, date };
}

export async function downloadStreetGuidesReportPdf(params: {
  data: StreetGuidesReportData;
  meta: StreetGuidesReportMeta;
}): Promise<void> {
  const doc = await generateStreetGuidesReportPdf(params);
  const { project, date } = streetGuidesReportFileSlug(
    params.meta.projectName,
    params.meta.emittedAtIso,
  );
  doc.save(`relatorio_de_vias_${project}_${date}.pdf`);
}

export async function generateStreetGuidesReportExcelBuffer(params: {
  data: StreetGuidesReportData;
  meta: StreetGuidesReportMeta;
}): Promise<ArrayBuffer> {
  const { data, meta } = params;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SV LOTES';
  wb.created = new Date();
  const ws = wb.addWorksheet('Relatório de Vias', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { header: 'Número', key: 'number', width: 10 },
    { header: 'Nome', key: 'name', width: 36 },
    { header: 'Tipo', key: 'type', width: 14 },
    { header: 'Comprimento (m)', key: 'meters', width: 16 },
    { header: 'Comprimento (km)', key: 'km', width: 16 },
    { header: 'Projeto', key: 'project', width: 32 },
    { header: 'Data', key: 'date', width: 14 },
    { header: 'Empresa', key: 'company', width: 28 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0B3A66' },
  };
  header.alignment = { vertical: 'middle', horizontal: 'center' };

  for (const r of data.rows) {
    const meters = r.lengthM ?? 0;
    ws.addRow({
      number: r.number,
      name: r.name,
      type: r.type || '—',
      meters: Math.round(meters * 100) / 100,
      km: Math.round((meters / 1000) * 1000) / 1000,
      project: meta.projectName,
      date: meta.emittedAt,
      company: meta.companyName,
    });
  }

  ws.addRow({});
  const totalRow = ws.addRow({
    number: '',
    name: 'TOTAL',
    type: `${data.streetCount} vias`,
    meters: Math.round(data.totalLengthM * 100) / 100,
    km: Math.round(data.totalLengthKm * 1000) / 1000,
    project: meta.projectName,
    date: meta.emittedAt,
    company: meta.companyName,
  });
  totalRow.font = { bold: true };
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EEF5' },
  };

  ws.getColumn('meters').numFmt = '#,##0.00';
  ws.getColumn('km').numFmt = '#,##0.000';

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function downloadStreetGuidesReportExcel(params: {
  data: StreetGuidesReportData;
  meta: StreetGuidesReportMeta;
}): Promise<void> {
  const buffer = await generateStreetGuidesReportExcelBuffer(params);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const { project, date } = streetGuidesReportFileSlug(
    params.meta.projectName,
    params.meta.emittedAtIso,
  );
  downloadBlob(blob, `relatorio_de_vias_${project}_${date}.xlsx`);
}
