/**
 * Layout SIGEF/INCRA da prancha PDF — somente desenho (sem alterar cálculos GIS).
 */

import type { jsPDF } from 'jspdf';
import type { LotSheetSideConfrontants } from '@/lib/lotSheetEnrichment';
import { wrapConfrontantText } from '@/lib/lotSheetLayout';
import { getOfficialLotMeasurements } from '@/lib/officialLotMeasurements';
import {
  formatTechnicalRegistryLine,
  hasTechnicalResponsible,
  type TechnicalResponsibleProfile,
} from '@/lib/technicalResponsible';

export const LOT_SHEET_SIGEF_LAYOUT = true;

export type SigefBox = { x: number; y: number; w: number; h: number };

export type SigefPageRegions = {
  margin: number;
  inner: SigefBox;
  sketch: SigefBox;
  /** Faixa protegida no rodapé do croqui (escala gráfica). */
  sketchScaleBand: SigefBox;
  confrontations: SigefBox;
  coordinates: SigefBox;
  technical: SigefBox;
  bottomSplit: SigefBox;
  compass: { cx: number; cy: number; r: number };
};

const SIGEF_MARGIN = 5;
const SKETCH_SCALE_BAND_H = 11;

export function formatPerimeterDisplay(
  lot: Record<string, unknown>,
): string {
  const m = getOfficialLotMeasurements(lot, lot.number);
  if (m.perimeter == null || !Number.isFinite(m.perimeter)) return '—';
  return `${m.perimeter.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m`;
}

/** Regiões da página A4 — croqui, confrontações, tabela, bloco técnico, RT. */
export function computeSigefPageRegions(
  pageW: number,
  pageH: number,
  metricRowCount: number,
): SigefPageRegions {
  const innerW = pageW - SIGEF_MARGIN * 2;
  const innerH = pageH - SIGEF_MARGIN * 2;
  const inner: SigefBox = {
    x: SIGEF_MARGIN,
    y: SIGEF_MARGIN,
    w: innerW,
    h: innerH,
  };
  const contentX = inner.x + 3;
  const contentW = inner.w - 6;
  const gap = 2;

  const bottomSplitH = 24;
  const technicalH = 34;
  const confrontationsH = 20;
  const tableRowH = 5;
  const tableHeaderH = 6;
  const tableRows = Math.max(4, Math.min(metricRowCount, 12));
  const coordinatesH = tableHeaderH + tableRows * tableRowH + 2;

  const stackBelowSketch =
    confrontationsH + gap + coordinatesH + gap + technicalH + gap + bottomSplitH;
  const sketchH = Math.max(88, innerH - 3 - stackBelowSketch - gap);

  const sketch: SigefBox = {
    x: contentX,
    y: inner.y + 3,
    w: contentW,
    h: sketchH,
  };

  const sketchScaleBand: SigefBox = {
    x: sketch.x,
    y: sketch.y + sketch.h - SKETCH_SCALE_BAND_H,
    w: sketch.w,
    h: SKETCH_SCALE_BAND_H,
  };

  let y = sketch.y + sketch.h + gap;
  const confrontations: SigefBox = {
    x: contentX,
    y,
    w: contentW,
    h: confrontationsH,
  };
  y += confrontationsH + gap;
  const coordinates: SigefBox = {
    x: contentX,
    y,
    w: contentW,
    h: coordinatesH,
  };
  y += coordinatesH + gap;
  const technical: SigefBox = { x: contentX, y, w: contentW, h: technicalH };
  y += technicalH + gap;
  const bottomSplit: SigefBox = {
    x: contentX,
    y,
    w: contentW,
    h: bottomSplitH,
  };

  const compass = {
    cx: sketch.x + sketch.w - 12,
    cy: sketch.y + 12,
    r: 7,
  };

  return {
    margin: SIGEF_MARGIN,
    inner,
    sketch,
    sketchScaleBand,
    confrontations,
    coordinates,
    technical,
    bottomSplit,
    compass,
  };
}

/** Verifica se duas caixas se sobrepõem (com folga opcional). */
export function sigefBoxesOverlap(
  a: SigefBox,
  b: SigefBox,
  gap = 0.5,
): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

const BLACK: [number, number, number] = [0, 0, 0];

/** Quadro CONFRONTAÇÕES — dados de buildLotConfrontationAudit / confrontantsFromAudit. */
export function drawSigefConfrontationsPanel(
  doc: jsPDF,
  box: SigefBox,
  confrontants: LotSheetSideConfrontants,
) {
  const padX = 4;
  const padTop = 4;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.rect(box.x, box.y, box.w, box.h);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...BLACK);
  doc.text('CONFRONTAÇÕES', box.x + padX, box.y + padTop);

  const colW = (box.w - padX * 2) / 2;
  const rows: [string, string][] = [
    ['Frente', confrontants.frente || '—'],
    ['Fundo', confrontants.fundo || '—'],
    ['Lado Direito', confrontants.ladoDireito || '—'],
    ['Lado Esquerdo', confrontants.ladoEsquerdo || '—'],
  ];

  let ly = box.y + padTop + 5.5;
  const lineStep = 4.5;
  for (let i = 0; i < rows.length; i++) {
    const col = i % 2;
    const rowIdx = Math.floor(i / 2);
    const lx = box.x + padX + col * colW;
    const rowY = ly + rowIdx * lineStep * 2.2;
    const [label, value] = rows[i];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.text(`${label}:`, lx, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    const wrapped = wrapConfrontantText(value, 38, 2);
    let vy = rowY;
    for (const line of wrapped) {
      const split = doc.splitTextToSize(line, colW - 22) as string[];
      for (const sl of split) {
        doc.text(sl, lx + 20, vy);
        vy += 3.8;
      }
    }
  }
}

export type SigefTechnicalData = {
  projectName: string;
  quadra: string;
  lotNum: string;
  area: string;
  perimeter: string;
  scale: string;
  municipality: string;
  date: string;
  clientName: string;
  clientDoc: string;
  technicalName: string;
  technicalRegistry: string;
  logoBase64: string | null;
};

/** Bloco técnico inferior — estilo planta SIGEF. */
export function drawSigefTechnicalPanel(
  doc: jsPDF,
  box: SigefBox,
  data: SigefTechnicalData,
) {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);
  doc.rect(box.x, box.y, box.w, box.h);

  const leftW = box.w * 0.42;
  const midW = box.w * 0.33;
  const rightW = box.w - leftW - midW;
  const lx = box.x + 3;
  const mx = box.x + leftW;
  const rx = box.x + leftW + midW;

  doc.line(mx, box.y, mx, box.y + box.h);
  doc.line(rx, box.y, rx, box.y + box.h);

  const label = (
    x: number,
    y: number,
    text: string,
    bold = false,
    size = 5.5,
    maxW = leftW - 6,
  ) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...BLACK);
    doc.text(text, x, y, { maxWidth: maxW });
  };

  let ly = box.y + 5;
  if (data.logoBase64) {
    try {
      doc.addImage(data.logoBase64, 'PNG', lx, box.y + 2, 14, 7);
      ly = box.y + 11;
    } catch {
      /* ignore */
    }
  }

  label(lx, ly, 'PROJETO', true, 5.8);
  ly += 4;
  label(lx, ly, data.projectName, false, 5.5, leftW - 6);
  ly += 5;
  label(lx, ly, `CLIENTE: ${data.clientName}`);
  ly += 4.2;
  label(lx, ly, `CPF/CNPJ: ${data.clientDoc}`);

  let my = box.y + 5;
  const fields: [string, string][] = [
    ['QUADRA', data.quadra],
    ['LOTE', data.lotNum],
    ['ÁREA', data.area],
    ['PERÍMETRO', data.perimeter],
    ['ESCALA', data.scale],
    ['MUNICÍPIO', data.municipality],
    ['DATA', data.date],
  ];
  for (const [k, v] of fields) {
    label(mx + 2, my, `${k}: ${v}`, k === 'LOTE' || k === 'ÁREA', 5.3, midW - 4);
    my += 4.2;
  }

  let ry = box.y + 5;
  label(rx + 2, ry, 'RESPONSÁVEL TÉCNICO', true, 5.8, rightW - 4);
  ry += 5;
  if (data.technicalName && data.technicalName !== '—') {
    label(rx + 2, ry, data.technicalName, true, 5.3, rightW - 4);
    ry += 4.2;
    label(rx + 2, ry, data.technicalRegistry, false, 5, rightW - 4);
  } else {
    label(rx + 2, ry, 'Não informado', false, 5, rightW - 4);
  }
}

export function buildSigefTechnicalData(input: {
  projectName: string;
  quadra: string;
  lotNum: string;
  area: string;
  scale: string;
  date: string;
  lot: Record<string, unknown>;
  owner: { name: string; cpf: string; municipality: string };
  tech: TechnicalResponsibleProfile;
  logoBase64: string | null;
}): SigefTechnicalData {
  return {
    projectName: input.projectName,
    quadra: input.quadra,
    lotNum: input.lotNum,
    area: input.area,
    perimeter: formatPerimeterDisplay(input.lot),
    scale: input.scale,
    municipality: input.owner.municipality || '—',
    date: input.date,
    clientName: input.owner.name || '—',
    clientDoc: input.owner.cpf || '—',
    technicalName: hasTechnicalResponsible(input.tech) ? input.tech.name : '—',
    technicalRegistry: hasTechnicalResponsible(input.tech)
      ? formatTechnicalRegistryLine(input.tech)
      : '—',
    logoBase64: input.logoBase64,
  };
}
