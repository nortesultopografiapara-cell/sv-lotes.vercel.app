/**
 * Formatação e relatório PDF — Medir Área (SV LOTES GIS).
 * Cálculos geodésicos permanecem em areaMeasure.ts (inalterados).
 */

import type { jsPDF } from 'jspdf';
import type { AreaSide } from '@/lib/gis/areaMeasure';
import { formatGisAreaM2, formatGisLengthM } from '@/lib/gis/areaMeasure';

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
  /** Reservado para captura futura do mapa com polígono. */
  mapSnapshotDataUrl?: string | null;
};

export type AreaMeasureReportSections = {
  title: string;
  subtitle: string;
  infoRows: [string, string][];
  areaLabel: string;
  areaValue: string;
  perimeterLabel: string;
  perimeterValue: string;
  sidesHeaders: [string, string];
  sidesRows: [string, string][];
  observations: string | null;
  footerLines: string[];
};

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

export async function generateAreaMeasurePdfBlob(
  input: AreaMeasurePdfInput,
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const sections = buildAreaMeasureReportSections(input);
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
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
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Observações', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const obsLines = doc.splitTextToSize(sections.observations, pageW - margin * 2);
    doc.text(obsLines, margin, y);
    y += obsLines.length * 4.5 + 4;
  }

  if (input.mapSnapshotDataUrl) {
    // Estrutura preparada para versão futura com imagem do mapa.
    const imgW = pageW - margin * 2;
    const imgH = 60;
    if (y + imgH < doc.internal.pageSize.getHeight() - 24) {
      doc.addImage(input.mapSnapshotDataUrl, 'PNG', margin, y, imgW, imgH);
      y += imgH + 6;
    }
  }

  const footerY = doc.internal.pageSize.getHeight() - 14;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  sections.footerLines.forEach((line, i) => {
    doc.text(line, pageW / 2, footerY + i * 4, { align: 'center' });
  });

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
