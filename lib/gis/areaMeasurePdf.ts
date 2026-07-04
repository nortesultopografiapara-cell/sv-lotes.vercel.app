/**
 * Formatação e relatório PDF — Medir Área (SV LOTES GIS).
 * Cálculos geodésicos permanecem em areaMeasure.ts (inalterados).
 */

import type { jsPDF } from 'jspdf';
import type { AreaSide } from '@/lib/gis/areaMeasure';
import { formatGisAreaM2, formatGisLengthM } from '@/lib/gis/areaMeasure';
import {
  buildAreaMeasureCroquiLayout,
  CROQUI_DISCLAIMER,
  CROQUI_SECTION_TITLE,
  type AreaMeasureCroquiLayout,
} from '@/lib/gis/areaMeasureCroqui';
import type { GisLatLng } from '@/lib/gis/distanceMeasure';

export { CROQUI_SECTION_TITLE, CROQUI_DISCLAIMER };

export type AreaMeasureExportForm = {
  propertyName: string;
  ownerName: string;
  observations: string;
};

export type AreaMeasurePdfInput = {
  propertyName: string;
  ownerName: string;
  observations?: string | null;
  projectName: string;
  companyName: string;
  userName: string;
  measuredAt: Date;
  areaM2: number;
  perimeterM: number;
  sides: Pick<AreaSide, 'panelLabel' | 'distanceM'>[];
  /** Vértices do polígono finalizado (WGS84). */
  points: GisLatLng[];
};

export type AreaMeasureReportSections = {
  title: string;
  subtitle: string;
  infoRows: [string, string][];
  areaLabel: string;
  areaValue: string;
  perimeterLabel: string;
  perimeterValue: string;
  croquiTitle: string;
  croquiDisclaimer: string;
  sidesHeaders: [string, string];
  sidesRows: [string, string][];
  observations: string | null;
  footerLines: string[];
};

const CROQUI_BOX_HEIGHT_MM = 82;
const FOOTER_RESERVE_MM = 22;

export function validateAreaMeasureExportForm(
  form: AreaMeasureExportForm,
): { ok: true } | { ok: false; error: string } {
  const propertyName = form.propertyName.trim();
  const ownerName = form.ownerName.trim();
  if (!propertyName) {
    return { ok: false, error: 'Informe o nome da propriedade.' };
  }
  if (!ownerName) {
    return { ok: false, error: 'Informe o nome do proprietário.' };
  }
  return { ok: true };
}

export function canExportAreaMeasurePdf(
  areaM2: number | null | undefined,
  pointsCount: number,
): boolean {
  return (
    pointsCount >= 3 &&
    areaM2 != null &&
    Number.isFinite(areaM2) &&
    areaM2 > 0
  );
}

function formatDateBr(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTimeBr(d: Date): string {
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function buildAreaMeasureReportSections(
  input: AreaMeasurePdfInput,
): AreaMeasureReportSections {
  const observations = String(input.observations ?? '').trim();
  return {
    title: 'RELATÓRIO DE MEDIÇÃO DE ÁREA',
    subtitle: 'SV LOTES GIS',
    infoRows: [
      ['Nome da propriedade', input.propertyName.trim()],
      ['Nome do proprietário', input.ownerName.trim()],
      ['Empreendimento', input.projectName.trim() || '—'],
      ['Empresa', input.companyName.trim() || '—'],
      ['Usuário', input.userName.trim() || '—'],
      ['Data', formatDateBr(input.measuredAt)],
      ['Hora', formatTimeBr(input.measuredAt)],
    ],
    areaLabel: 'Área',
    areaValue: formatGisAreaM2(input.areaM2),
    perimeterLabel: 'Perímetro',
    perimeterValue: formatGisLengthM(input.perimeterM),
    croquiTitle: CROQUI_SECTION_TITLE,
    croquiDisclaimer: CROQUI_DISCLAIMER,
    sidesHeaders: ['Lado', 'Distância'],
    sidesRows: input.sides.map((s) => [
      s.panelLabel,
      formatGisLengthM(s.distanceM),
    ]),
    observations: observations || null,
    footerLines: [
      'Documento gerado automaticamente pelo SV LOTES GIS.',
      'As medidas apresentadas são calculadas sobre a base cartográfica disponível no sistema.',
    ],
  };
}

export function buildAreaMeasureCroquiForPdf(
  input: AreaMeasurePdfInput,
  box: { x: number; y: number; width: number; height: number },
): AreaMeasureCroquiLayout | null {
  return buildAreaMeasureCroquiLayout({
    points: input.points,
    sides: input.sides,
    areaM2: input.areaM2,
    perimeterM: input.perimeterM,
    box,
  });
}

function drawPdfFooter(
  doc: jsPDF,
  footerLines: string[],
  pageW: number,
  pageH: number,
) {
  const footerY = pageH - 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  footerLines.forEach((line, i) => {
    doc.text(line, pageW / 2, footerY + i * 4, { align: 'center' });
  });
  doc.setTextColor(0, 0, 0);
}

/** Desenha croqui vetorial; retorna Y final (mm). */
export function drawAreaMeasureCroquiOnPdf(
  doc: jsPDF,
  layout: AreaMeasureCroquiLayout,
  startY: number,
): number {
  const { box } = layout;
  let y = startY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(layout.sectionTitle, box.x, y);
  y += 5;

  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(box.x, y, box.width, box.height, 2, 2, 'FD');

  const pts = layout.pdfPoints;
  if (pts.length >= 3) {
    doc.setFillColor(191, 219, 254);
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.45);

    const lines: [number, number][] = [];
    for (let i = 1; i < pts.length; i++) {
      lines.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y]);
    }
    lines.push([
      pts[0].x - pts[pts.length - 1].x,
      pts[0].y - pts[pts.length - 1].y,
    ]);
    doc.lines(lines, pts[0].x, pts[0].y, [1, 1], 'FD', true);

    for (const side of layout.sideLabels) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(30, 64, 175);
      doc.text(side.text, side.pdf.x, side.pdf.y, {
        align: 'center',
        baseline: 'middle',
      });
    }

    for (const v of layout.vertices) {
      doc.setDrawColor(59, 130, 246);
      doc.setFillColor(255, 255, 255);
      doc.circle(v.pdf.x, v.pdf.y, 1.2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(30, 64, 175);
      doc.text(v.label, v.pdf.x + 2.2, v.pdf.y - 1.8);
    }
  }

  const na = layout.northArrow;
  doc.setFillColor(59, 130, 246);
  doc.triangle(
    na.tip.x,
    na.tip.y,
    na.baseLeft.x,
    na.baseLeft.y,
    na.baseRight.x,
    na.baseRight.y,
    'F',
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(30, 64, 175);
  doc.text('N', na.label.x, na.label.y, { align: 'center' });

  const statsY = y + box.height - 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Área: ${layout.areaText}`, box.x + 4, statsY);
  doc.text(`Perímetro: ${layout.perimeterText}`, box.x + box.width / 2, statsY, {
    align: 'center',
  });

  y += box.height + 3;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(layout.disclaimer, box.x, y);
  doc.setTextColor(0, 0, 0);

  return y + 5;
}

function ensureSpace(
  doc: jsPDF,
  y: number,
  needed: number,
  pageH: number,
  margin: number,
): number {
  if (y + needed <= pageH - FOOTER_RESERVE_MM) return y;
  doc.addPage();
  return margin;
}

export async function generateAreaMeasurePdfBlob(
  input: AreaMeasurePdfInput,
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const sections = buildAreaMeasureReportSections(input);
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(sections.title, pageW / 2, y, { align: 'center' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(sections.subtitle, pageW / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 10;

  doc.setFontSize(10);
  for (const [label, value] of sections.infoRows) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(value, pageW - margin * 2 - 42);
    doc.text(lines, margin + 42, y);
    y += Math.max(5, lines.length * 5);
  }

  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(sections.areaLabel, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(sections.areaValue, margin + 28, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.text(sections.perimeterLabel, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(sections.perimeterValue, margin + 28, y);
  y += 10;

  const croquiNeeded = 6 + CROQUI_BOX_HEIGHT_MM + 14;
  y = ensureSpace(doc, y, croquiNeeded, pageH, margin);

  const croquiBox = {
    x: margin,
    y: y + 6,
    width: pageW - margin * 2,
    height: CROQUI_BOX_HEIGHT_MM,
  };
  const croquiLayout = buildAreaMeasureCroquiForPdf(input, croquiBox);
  if (croquiLayout) {
    y = drawAreaMeasureCroquiOnPdf(doc, croquiLayout, y);
  }

  y = ensureSpace(doc, y, 36, pageH, margin);

  autoTable(doc, {
    startY: y,
    head: [sections.sidesHeaders],
    body: sections.sidesRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    theme: 'grid',
  });

  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY ?? y) + 8;

  if (sections.observations) {
    y = ensureSpace(doc, y, 24, pageH, margin);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Observações', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const obsLines = doc.splitTextToSize(sections.observations, pageW - margin * 2);
    doc.text(obsLines, margin, y);
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawPdfFooter(doc, sections.footerLines, pageW, pageH);
  }

  return doc.output('blob');
}

export async function downloadAreaMeasurePdf(input: AreaMeasurePdfInput): Promise<void> {
  const blob = await generateAreaMeasurePdfBlob(input);
  const url = URL.createObjectURL(blob);
  const safeName = input.propertyName
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  const a = document.createElement('a');
  a.href = url;
  a.download = `medicao_area_${safeName || 'sv_lotes'}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
