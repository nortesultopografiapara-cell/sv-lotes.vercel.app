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
const SKETCH_SCALE_BAND_H = 14;
const CONFRONTATIONS_PANEL_H = 24;
const CONFRONTATIONS_COORDS_GAP_MM = 4;
const COORDINATES_TITLE_H = 5;

/** Caixa fixa da escala no canto inferior esquerdo do croqui. */
export const SIGEF_SCALE_LEFT_INSET_MM = 8;
export const SIGEF_SCALE_BOTTOM_INSET_MM = 18;
export const SIGEF_SCALE_BOX_W_MM = 75;
export const SIGEF_SCALE_BOX_H_MM = 8;
/** Largura mínima da barra (dentro da caixa). */
export const SIGEF_SCALE_BAR_MIN_W_MM = 70;
/** Altura da barra da escala gráfica SIGEF (mm). */
export const SIGEF_SCALE_BAR_H_MM = 6;

export type LotSheetBBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function polygonSheetBBox(verts: [number, number][]): LotSheetBBox {
  const xs = verts.map((v) => v[0]);
  const ys = verts.map((v) => v[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function sigefLotBBoxOverlapsScaleBox(
  lotBBox: LotSheetBBox,
  scaleBox: SigefBox,
  margin = 3,
): boolean {
  return !(
    lotBBox.maxX + margin <= scaleBox.x ||
    scaleBox.x + scaleBox.w + margin <= lotBBox.minX ||
    lotBBox.maxY + margin <= scaleBox.y ||
    scaleBox.y + scaleBox.h + margin <= lotBBox.minY
  );
}

/** Posição da escala: canto inferior esquerdo do croqui ou acima das confrontações. */
export function resolveSigefGraphicScaleBox(
  sketch: SigefBox,
  confrontations: SigefBox,
  lotBBox: LotSheetBBox,
): { box: SigefBox; placement: 'sketch-bottom-left' | 'above-confrontations' } {
  const insetBox: SigefBox = {
    x: sketch.x + SIGEF_SCALE_LEFT_INSET_MM,
    y: sketch.y + sketch.h - SIGEF_SCALE_BOTTOM_INSET_MM,
    w: SIGEF_SCALE_BOX_W_MM,
    h: SIGEF_SCALE_BOX_H_MM,
  };
  if (!sigefLotBBoxOverlapsScaleBox(lotBBox, insetBox)) {
    return { box: insetBox, placement: 'sketch-bottom-left' };
  }
  const fallback: SigefBox = {
    x: confrontations.x + 4,
    y: confrontations.y - SIGEF_SCALE_BOX_H_MM - 5,
    w: SIGEF_SCALE_BOX_W_MM,
    h: SIGEF_SCALE_BOX_H_MM,
  };
  return { box: fallback, placement: 'above-confrontations' };
}

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
  const confrontationsH = CONFRONTATIONS_PANEL_H;
  const tableRowH = 5;
  const tableHeaderH = 6;
  const tableRows = Math.max(4, Math.min(metricRowCount, 12));
  const coordinatesH =
    COORDINATES_TITLE_H + tableHeaderH + tableRows * tableRowH + 3;

  const stackBelowSketch =
    confrontationsH +
    CONFRONTATIONS_COORDS_GAP_MM +
    coordinatesH +
    gap +
    technicalH +
    gap +
    bottomSplitH;
  const sketchH = Math.max(88, innerH - 3 - stackBelowSketch - gap);

  const sketch: SigefBox = {
    x: contentX,
    y: inner.y + 3,
    w: contentW,
    h: sketchH,
  };

  const sketchScaleBand: SigefBox = {
    x: sketch.x + SIGEF_SCALE_LEFT_INSET_MM,
    y: sketch.y + sketch.h - SIGEF_SCALE_BOTTOM_INSET_MM,
    w: SIGEF_SCALE_BOX_W_MM,
    h: SIGEF_SCALE_BOX_H_MM,
  };

  let y = sketch.y + sketch.h + gap;
  const confrontations: SigefBox = {
    x: contentX,
    y,
    w: contentW,
    h: confrontationsH,
  };
  y += confrontationsH + CONFRONTATIONS_COORDS_GAP_MM;
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

function drawSigefDottedLeader(
  doc: jsPDF,
  x1: number,
  x2: number,
  y: number,
) {
  const dotStep = 1.8;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.15);
  for (let x = x1; x < x2; x += dotStep) {
    doc.line(x, y, Math.min(x + 0.9, x2), y);
  }
}

/** Quadro CONFRONTAÇÕES — layout SIGEF com líderes pontilhados. */
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

  const sepY = box.y + padTop + 2.5;
  doc.setLineWidth(0.2);
  doc.line(box.x + padX, sepY, box.x + box.w - padX, sepY);

  const rows: [string, string][] = [
    ['FRENTE', confrontants.frente || '—'],
    ['FUNDO', confrontants.fundo || '—'],
    ['LADO DIREITO', confrontants.ladoDireito || '—'],
    ['LADO ESQUERDO', confrontants.ladoEsquerdo || '—'],
  ];

  let ly = box.y + padTop + 6.5;
  const lineStep = 4.8;
  const labelColW = 32;
  const valueX = box.x + box.w - padX;

  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.text(label, box.x + padX, ly);
    const labelEndX = box.x + padX + labelColW;
    const wrapped = wrapConfrontantText(value, 52, 2);
    const display = wrapped.join(' / ');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    const valueW = doc.getTextWidth(display);
    const dotsEnd = valueX - valueW - 2;
    if (dotsEnd > labelEndX + 4) {
      drawSigefDottedLeader(doc, labelEndX, dotsEnd, ly - 0.6);
    }
    doc.text(display, valueX, ly, { align: 'right', maxWidth: box.w - labelColW - padX * 2 });
    ly += lineStep;
  }

  doc.setLineWidth(0.2);
  doc.line(box.x + padX, box.y + box.h - 2, box.x + box.w - padX, box.y + box.h - 2);
}

export type SigefMetricTableRow = {
  from: string;
  to: string;
  azimute: string;
  distancia: string;
  coordE: string;
  coordN: string;
};

/** Cabeçalhos da tabela SIGEF — colunas De | Para (sem seta Unicode no PDF). */
export function sigefMetricTableHeaders(): readonly string[] {
  return ['De', 'Para', 'Azimute', 'Distância', 'E(X)', 'N(Y)'];
}

export function sigefMetricTableCells(row: SigefMetricTableRow): string[] {
  return [row.from, row.to, row.azimute, row.distancia, row.coordE, row.coordN];
}

/** Valida células — evita "M-01 !' M-02" (seta → corrompida no jsPDF). */
export function sigefMetricTableTextValid(cells: string[]): boolean {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (/→|\u2192/.test(c)) return false;
    if (/!'|!\u2019/.test(c)) return false;
    if (i <= 1 && /!/.test(c)) return false;
  }
  return true;
}

/** Escala gráfica SIGEF — canto inferior esquerdo, alinhada à esquerda. */
export function drawSigefGraphicScale(
  doc: jsPDF,
  band: SigefBox,
  scaleDenom: number,
) {
  const barRealM = 50;
  let barMm = (barRealM * 1000) / scaleDenom;
  barMm = Math.max(
    SIGEF_SCALE_BAR_MIN_W_MM,
    Math.min(barMm, band.w - 2),
  );
  const segments = 5;
  const segMm = barMm / segments;
  const segM = barRealM / segments;
  const barX = band.x;
  const barY = band.y + 1;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(...BLACK);
  doc.text('ESCALA GRÁFICA', band.x, band.y - 1.2);

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);
  for (let i = 0; i < segments; i++) {
    if (i % 2 === 0) doc.setFillColor(255, 255, 255);
    else doc.setFillColor(40, 40, 40);
    doc.rect(barX + i * segMm, barY, segMm, SIGEF_SCALE_BAR_H_MM, 'FD');
  }
  doc.setDrawColor(...BLACK);
  doc.rect(barX, barY, barMm, SIGEF_SCALE_BAR_H_MM, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  for (let i = 0; i <= segments; i++) {
    doc.text(String(Math.round(i * segM)), barX + i * segMm, barY + SIGEF_SCALE_BAR_H_MM + 3.5, {
      align: 'center',
    });
  }
  doc.text('m', barX + barMm + 3, barY + SIGEF_SCALE_BAR_H_MM / 2 + 1);
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
