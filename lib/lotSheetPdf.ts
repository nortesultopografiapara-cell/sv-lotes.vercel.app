/**
 * Prancha técnica do lote — layout Métrica Topo (A4 retrato).
 */

import { jsPDF } from 'jspdf';
import type { LotSheetPayload } from '@/lib/lotSheetData';
import type {
  LotSheetBlockSketch,
  LotSheetMetricRow,
  LotSheetSideConfrontants,
} from '@/lib/lotSheetEnrichment';
import {
  loadImageAsBase64,
  loadReportHeaderLogoBase64,
} from '@/lib/reportBranding';
import {
  formatTechnicalRegistryLine,
  hasTechnicalResponsible,
  normalizeTechnicalResponsibleFromCompany,
  type TechnicalResponsibleProfile,
} from '@/lib/technicalResponsible';

const TECH_NOT_INFORMED_MSG =
  'Responsável técnico não informado nas configurações da empresa.';

export type GenerateLotSheetPdfInput = LotSheetPayload;

const BLACK: [number, number, number] = [0, 0, 0];
const RED: [number, number, number] = [200, 30, 30];
const BLUE: [number, number, number] = [30, 80, 180];
const HIGHLIGHT: [number, number, number] = [251, 146, 60];

const MARGIN = 5;

/** Aviso legal — caráter informativo da prancha (não altera medidas do croqui). */
const LOT_SHEET_LEGAL_DISCLAIMER = {
  title: 'OBSERVAÇÕES:',
  paragraphs: [
    'Esta prancha possui caráter exclusivamente informativo.',
    'Sua validade está condicionada à apresentação conjunta do contrato de compra e venda e/ou comprovante de quitação emitido pela empreendedora.',
    'Este documento não constitui prova de propriedade, posse ou domínio do imóvel.',
  ],
} as const;

type Box = { x: number; y: number; w: number; h: number };

function formatScaleLabel(label: string): string {
  const m = String(label).match(/1\s*[:/]\s*(\d+)/i);
  return m ? `1 / ${m[1]}` : label;
}

function parseScaleDenom(label: string): number {
  const m = String(label).match(/1\s*[:/]\s*(\d+)/i);
  return m?.[1] ? Number(m[1]) || 500 : 500;
}

function centroid(pts: [number, number][]): [number, number] {
  let sx = 0;
  let sy = 0;
  const n = pts.length || 1;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  return [sx / n, sy / n];
}

function preparePolygonVertices(points: [number, number][]): [number, number][] {
  if (points.length < 2) return points;
  const eps = 0.05;
  const verts: [number, number][] = [];
  for (const p of points) {
    const last = verts[verts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > eps) {
      verts.push(p);
    }
  }
  if (verts.length > 2) {
    const first = verts[0];
    const last = verts[verts.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= eps) {
      verts.pop();
    }
  }
  return verts.length >= 3 ? verts : points;
}

function projectRingToSheet(
  localRing: [number, number][],
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
  box: Box,
): [number, number][] {
  const width = bbox.maxX - bbox.minX || 1;
  const height = bbox.maxY - bbox.minY || 1;
  const pad = 14;
  const scale = Math.min(
    (box.w - pad * 2) / width,
    (box.h - pad * 2) / height,
  );
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;

  return localRing.map(([lx, ly]) => [
    box.x + box.w / 2 + (lx - cx) * scale,
    box.y + box.h / 2 - (ly - cy) * scale,
  ]);
}

function projectRingsToBox(
  items: { localRing: [number, number][] }[],
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
  box: Box,
): Map<string, [number, number][]> {
  const width = bbox.maxX - bbox.minX || 1;
  const height = bbox.maxY - bbox.minY || 1;
  const pad = 4;
  const scale = Math.min(
    (box.w - pad * 2) / width,
    (box.h - pad * 2) / height,
  );
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const out = new Map<string, [number, number][]>();

  items.forEach((item, idx) => {
    const pts = item.localRing.map(
      ([lx, ly]) =>
        [
          box.x + box.w / 2 + (lx - cx) * scale,
          box.y + box.h / 2 - (ly - cy) * scale,
        ] as [number, number],
    );
    out.set(String(idx), pts);
  });
  return out;
}

function drawPolygonLines(
  doc: jsPDF,
  points: [number, number][],
  opts: {
    fill?: [number, number, number];
    stroke?: [number, number, number];
    lw?: number;
  },
) {
  const verts = preparePolygonVertices(points);
  if (verts.length < 3) return;
  doc.setDrawColor(...(opts.stroke || BLACK));
  doc.setLineWidth(opts.lw ?? 0.45);
  doc.setFillColor(...(opts.fill || [255, 255, 255]));
  for (let i = 0; i < verts.length; i++) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[(i + 1) % verts.length];
    doc.line(x1, y1, x2, y2);
  }
}

function drawLotPolygon(doc: jsPDF, points: [number, number][]): [number, number][] {
  const verts = preparePolygonVertices(points);
  if (verts.length < 3) return verts;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.65);
  doc.setFillColor(255, 255, 255);
  for (let i = 0; i < verts.length; i++) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[(i + 1) % verts.length];
    doc.line(x1, y1, x2, y2);
  }
  return verts;
}

/** Ângulo legível no PDF (paralelo ao segmento, sem texto invertido). */
function getReadableRotation(dx: number, dy: number): number {
  let angleDeg = (-Math.atan2(dy, dx) * 180) / Math.PI;
  while (angleDeg > 90) angleDeg -= 180;
  while (angleDeg <= -90) angleDeg += 180;
  return angleDeg;
}

function computePdfAxisTextAngle(dx: number, dy: number): number {
  return getReadableRotation(dx, dy);
}

type LotMainAxis = {
  center: [number, number];
  axisDx: number;
  axisDy: number;
  angleDeg: number;
  narrow: boolean;
  internalOffsetMm: number;
};

/** Eixo longitudinal do lote (aresta mais longa no croqui). */
function getLotMainAxis(verts: [number, number][]): LotMainAxis {
  const center = centroid(verts);
  const narrow = lotSpanOnSheet(verts) < 38;
  let bestLen = 0;
  let axisDx = 1;
  let axisDy = 0;

  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % n];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy);
    if (len > bestLen) {
      bestLen = len;
      axisDx = dx / len;
      axisDy = dy / len;
    }
  }

  return {
    center,
    axisDx,
    axisDy,
    angleDeg: getReadableRotation(axisDx, axisDy),
    narrow,
    internalOffsetMm: narrow ? 5 : 8,
  };
}

/** Escala de fontes/offsets apenas no croqui (não tabelas/rodapés). */
const SKETCH_FONT_SCALE = 2;

/** Ajuste fino da área no plano da prancha (após zona preferencial). */
const AREA_LABEL_FINE_TUNE_TOWARD_FUNDO_MM = 18;
const AREA_LABEL_FINE_TUNE_SHEET_RIGHT_MM = 5;

/** Refinos de legibilidade (somente vértices e medidas internas). */
const VERTEX_FONT_EXTRA_SCALE = 1.3;
const DISTANCE_FONT_EXTRA_SCALE = 1.2;

type InnerUsableLotBox = {
  origin: [number, number];
  alongUx: number;
  alongUy: number;
  crossUx: number;
  crossUy: number;
  alongMin: number;
  alongMax: number;
  crossMin: number;
  crossMax: number;
};

function sketchFontSize(base: number): number {
  return base * SKETCH_FONT_SCALE;
}

function sketchOffsetMm(base: number): number {
  return base * SKETCH_FONT_SCALE;
}

/** Retângulo interno útil do lote (projeção along/cross, com margem). */
function getInnerUsableLotBox(
  verts: [number, number][],
  mainAxis: LotMainAxis,
  front: LotFrontContext,
): InnerUsableLotBox {
  const origin = front.edge.mid;
  const alongUx = front.inwardNx;
  const alongUy = front.inwardNy;
  const crossUx = -mainAxis.axisDy;
  const crossUy = mainAxis.axisDx;

  let alongMin = Infinity;
  let alongMax = -Infinity;
  let crossMin = Infinity;
  let crossMax = -Infinity;

  for (const v of verts) {
    const da = (v[0] - origin[0]) * alongUx + (v[1] - origin[1]) * alongUy;
    const dc = (v[0] - origin[0]) * crossUx + (v[1] - origin[1]) * crossUy;
    alongMin = Math.min(alongMin, da);
    alongMax = Math.max(alongMax, da);
    crossMin = Math.min(crossMin, dc);
    crossMax = Math.max(crossMax, dc);
  }

  const alongSpan = alongMax - alongMin || 1;
  const crossSpan = crossMax - crossMin || 1;
  const alongInset = alongSpan * 0.14;
  const crossInset = crossSpan * 0.14;

  return {
    origin,
    alongUx,
    alongUy,
    crossUx,
    crossUy,
    alongMin: alongMin + alongInset,
    alongMax: alongMax - alongInset,
    crossMin: crossMin + crossInset,
    crossMax: crossMax - crossInset,
  };
}

function pointFromInnerBox(
  inner: InnerUsableLotBox,
  alongT: number,
  crossT: number,
): [number, number] {
  return [
    inner.origin[0] +
      inner.alongUx * alongT +
      inner.crossUx * crossT,
    inner.origin[1] +
      inner.alongUy * alongT +
      inner.crossUy * crossT,
  ];
}

/**
 * Posição preferencial da área: ~50% da profundidade (fundo→frente), centro lateral no retângulo útil.
 */
function getAreaPreferredPosition(
  verts: [number, number][],
  mainAxis: LotMainAxis,
  front: LotFrontContext,
): [number, number] {
  const inner = getInnerUsableLotBox(verts, mainAxis, front);
  const alongSpan = inner.alongMax - inner.alongMin;
  const depthFromFundo = 0.5;
  const alongT = inner.alongMax - alongSpan * depthFromFundo;
  const crossT = (inner.crossMin + inner.crossMax) / 2;
  let pos = pointFromInnerBox(inner, alongT, crossT);

  if (!pointInsidePolygon(pos[0], pos[1], verts)) {
    pos = pointFromInnerBox(
      inner,
      inner.alongMin + alongSpan * 0.48,
      crossT,
    );
  }
  if (!pointInsidePolygon(pos[0], pos[1], verts)) {
    pos = centroid(verts);
  }
  return pos;
}

/** Desloca a área em mm: +fundo (eixo interno da frente) e +direita na prancha. */
function applyAreaLabelFineTune(
  pos: [number, number],
  front: LotFrontContext,
): [number, number] {
  return [
    pos[0] +
      front.inwardNx * AREA_LABEL_FINE_TUNE_TOWARD_FUNDO_MM +
      AREA_LABEL_FINE_TUNE_SHEET_RIGHT_MM,
    pos[1] + front.inwardNy * AREA_LABEL_FINE_TUNE_TOWARD_FUNDO_MM,
  ];
}

type LotFrontContext = {
  edge: EdgeGeometry;
  inwardNx: number;
  inwardNy: number;
  maxInwardDepthMm: number;
};

type PlacedLabelZone = {
  pos: [number, number];
  radius: number;
  kind: string;
};

function getFrontSideSegment(
  verts: [number, number][],
  frontEdgeIndex: number,
): EdgeGeometry {
  return getEdgeGeometry(verts, frontEdgeIndex);
}

/** Direção da frente (normal interna) e profundidade útil do lote no croqui. */
function getLotFrontDirection(
  verts: [number, number][],
  frontEdgeIndex: number,
): LotFrontContext {
  const edge = getFrontSideSegment(verts, frontEdgeIndex);
  let maxInwardDepthMm = 0;
  for (const v of verts) {
    const d =
      (v[0] - edge.mid[0]) * edge.inNx + (v[1] - edge.mid[1]) * edge.inNy;
    if (d > maxInwardDepthMm) maxInwardDepthMm = d;
  }
  if (maxInwardDepthMm < 8) maxInwardDepthMm = 8;
  return {
    edge,
    inwardNx: edge.inNx,
    inwardNy: edge.inNy,
    maxInwardDepthMm,
  };
}

function resolveLabelCollisions(
  pos: [number, number],
  radius: number,
  placed: PlacedLabelZone[],
  minGap = 3,
): [number, number] {
  let [x, y] = pos;
  for (let pass = 0; pass < 10; pass++) {
    let moved = false;
    for (const zone of placed) {
      const dx = x - zone.pos[0];
      const dy = y - zone.pos[1];
      const d = Math.hypot(dx, dy) || 0.001;
      const need = radius + zone.radius + minGap;
      if (d < need) {
        const push = (need - d) / d;
        x += dx * push;
        y += dy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [x, y];
}

function minDistToPolygonEdges(
  pos: [number, number],
  verts: [number, number][],
): number {
  let min = Infinity;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % n];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((pos[0] - p1[0]) * dx + (pos[1] - p1[1]) * dy) / len2,
      ),
    );
    const px = p1[0] + t * dx;
    const py = p1[1] + t * dy;
    min = Math.min(min, Math.hypot(pos[0] - px, pos[1] - py));
  }
  return min;
}

function lotUsefulCrossWidthMm(
  verts: [number, number][],
  mainAxis: LotMainAxis,
): number {
  const crossX = -mainAxis.axisDy;
  const crossY = mainAxis.axisDx;
  const c = mainAxis.center;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const v of verts) {
    const t = (v[0] - c[0]) * crossX + (v[1] - c[1]) * crossY;
    minT = Math.min(minT, t);
    maxT = Math.max(maxT, t);
  }
  return maxT - minT;
}

function areaPlacementScore(
  pos: [number, number],
  verts: [number, number][],
  mainAxis: LotMainAxis,
  badgePos: [number, number] | null,
  placedZones: PlacedLabelZone[],
  preferred: [number, number],
): number {
  if (!pointInsidePolygon(pos[0], pos[1], verts)) return -Infinity;

  let score = minDistToPolygonEdges(pos, verts) * 2;
  score -= Math.hypot(pos[0] - preferred[0], pos[1] - preferred[1]) * 6;

  const areaRadius = sketchOffsetMm(7);
  for (const zone of placedZones) {
    const d = Math.hypot(pos[0] - zone.pos[0], pos[1] - zone.pos[1]);
    const need = areaRadius + zone.radius + sketchOffsetMm(3);
    if (d < need) score -= (need - d) * 8;
    if (zone.kind === 'lot_badge' && d < need + 6) score -= 120;
  }

  if (badgePos) {
    score += Math.min(Math.hypot(pos[0] - badgePos[0], pos[1] - badgePos[1]), 50);
  }

  return score;
}

function placeAreaLabelPreferredZone(
  preferred: [number, number],
  verts: [number, number][],
  mainAxis: LotMainAxis,
  front: LotFrontContext,
  placedZones: PlacedLabelZone[],
  badgePos: [number, number] | null,
): [number, number] {
  const inner = getInnerUsableLotBox(verts, mainAxis, front);
  const alongSpan = inner.alongMax - inner.alongMin;
  const crossSpan = inner.crossMax - inner.crossMin;
  const areaRadius = sketchOffsetMm(7);

  const candidates: [number, number][] = [preferred];

  for (const df of [0.45, 0.5, 0.55, 0.48, 0.52]) {
    candidates.push(
      pointFromInnerBox(
        inner,
        inner.alongMax - alongSpan * df,
        (inner.crossMin + inner.crossMax) / 2,
      ),
    );
  }

  for (const ct of [-0.2, -0.1, 0, 0.1, 0.2]) {
    candidates.push(
      pointFromInnerBox(
        inner,
        inner.alongMax - alongSpan * 0.5,
        (inner.crossMin + inner.crossMax) / 2 + crossSpan * ct,
      ),
    );
  }

  if (badgePos) {
    let awayX = preferred[0] - badgePos[0];
    let awayY = preferred[1] - badgePos[1];
    const len = Math.hypot(awayX, awayY) || 1;
    awayX /= len;
    awayY /= len;
    for (const d of [10, 14, 18, 22]) {
      candidates.push([
        preferred[0] + awayX * d,
        preferred[1] + awayY * d,
      ]);
    }
  }

  let best = preferred;
  let bestScore = -Infinity;

  for (let cand of candidates) {
    cand = resolveLabelCollisions(cand, areaRadius, placedZones, sketchOffsetMm(3));
    const s = areaPlacementScore(
      cand,
      verts,
      mainAxis,
      badgePos,
      placedZones,
      preferred,
    );
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  }

  return best;
}

function splitAreaLabelLines(
  areaText: string,
  usefulCrossWidthMm: number,
  narrow: boolean,
): string[] {
  const unitMatch = areaText.match(/\s*(m²|M²|m2)\s*$/i);
  const unit = unitMatch ? unitMatch[0].trim() : 'm²';
  const value = areaText.replace(/\s*(m²|M²|m2)\s*$/i, '').trim();

  if (!narrow && usefulCrossWidthMm >= sketchOffsetMm(26)) {
    return [areaText];
  }
  if (usefulCrossWidthMm >= sketchOffsetMm(22) && value.length <= 10) {
    return [areaText];
  }
  return [value, unit];
}

function pointInsidePolygon(
  x: number,
  y: number,
  polygon: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

type EdgeGeometry = {
  index: number;
  p1: [number, number];
  p2: [number, number];
  dx: number;
  dy: number;
  mid: [number, number];
  angleDeg: number;
  inNx: number;
  inNy: number;
  exNx: number;
  exNy: number;
};

function getEdgeGeometry(
  verts: [number, number][],
  edgeIndex: number,
): EdgeGeometry {
  const n = verts.length;
  const i = ((edgeIndex % n) + n) % n;
  const p1 = verts[i];
  const p2 = verts[(i + 1) % n];
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1;
  let inNx = -dy / len;
  let inNy = dx / len;
  const c = centroid(verts);
  const mx = (p1[0] + p2[0]) / 2;
  const my = (p1[1] + p2[1]) / 2;
  if (inNx * (c[0] - mx) + inNy * (c[1] - my) < 0) {
    inNx = -inNx;
    inNy = -inNy;
  }
  return {
    index: i,
    p1,
    p2,
    dx,
    dy,
    mid: [mx, my],
    angleDeg: computePdfAxisTextAngle(dx, dy),
    inNx,
    inNy,
    exNx: -inNx,
    exNy: -inNy,
  };
}

function positionAlongNormal(
  mid: [number, number],
  nx: number,
  ny: number,
  offsetMm: number,
): [number, number] {
  return [mid[0] + nx * offsetMm, mid[1] + ny * offsetMm];
}

/** Offset perpendicular fixo (simétrico em todos os lados equivalentes). */
function getSegmentInternalLabelPosition(
  edge: EdgeGeometry,
  polygon: [number, number][],
  baseOffsetMm: number,
): { x: number; y: number; offsetUsed: number } {
  const [x, y] = positionAlongNormal(
    edge.mid,
    edge.inNx,
    edge.inNy,
    baseOffsetMm,
  );
  if (pointInsidePolygon(x, y, polygon)) {
    return { x, y, offsetUsed: baseOffsetMm };
  }

  for (const off of [baseOffsetMm - 0.5, baseOffsetMm - 1, baseOffsetMm - 1.5]) {
    if (off < 2) continue;
    const [tx, ty] = positionAlongNormal(edge.mid, edge.inNx, edge.inNy, off);
    if (pointInsidePolygon(tx, ty, polygon)) {
      return { x: tx, y: ty, offsetUsed: off };
    }
  }

  return { x, y, offsetUsed: baseOffsetMm };
}

/** Rótulo no lado externo do polígono (normal oposta ao centroide). */
function edgeExternalLabelPos(edge: EdgeGeometry, offsetMm: number): [number, number] {
  return positionAlongNormal(edge.mid, edge.exNx, edge.exNy, offsetMm);
}

function lotSpanOnSheet(verts: [number, number][]): number {
  const xs = verts.map((p) => p[0]);
  const ys = verts.map((p) => p[1]);
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function distanceLabelFontSize(
  edgeLenMm: number,
  narrow: boolean,
): number {
  let size = sketchFontSize(narrow ? 5.5 : 6) * DISTANCE_FONT_EXTRA_SCALE;
  if (edgeLenMm < sketchOffsetMm(18)) {
    size = Math.min(size, sketchFontSize(5) * DISTANCE_FONT_EXTRA_SCALE);
  }
  if (edgeLenMm < sketchOffsetMm(12)) {
    size = sketchFontSize(4.5) * DISTANCE_FONT_EXTRA_SCALE;
  }
  return size;
}

/** Distâncias oficiais: offset interno uniforme, paralelas às divisas. */
function placeDistanceLabelsInsideLot(
  doc: jsPDF,
  points: [number, number][],
  measures: string[],
  _frontEdgeIndex: number,
  mainAxis: LotMainAxis,
): { edgeIndex: number; x: number; y: number }[] {
  const verts = preparePolygonVertices(points);
  const n = Math.min(verts.length, measures.length);
  const baseOffset = mainAxis.internalOffsetMm;
  const placed: { edgeIndex: number; x: number; y: number }[] = [];

  doc.setTextColor(...BLACK);

  for (let i = 0; i < n; i++) {
    const label = measures[i];
    if (!label || label === '—' || label.includes('inválido')) continue;

    const edge = getEdgeGeometry(verts, i);
    const edgeLenMm = Math.hypot(edge.dx, edge.dy);
    const fontSize = distanceLabelFontSize(edgeLenMm, mainAxis.narrow);
    const { x, y } = getSegmentInternalLabelPosition(edge, verts, baseOffset);

    placed.push({ edgeIndex: i, x, y });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.text(label, x, y, {
      angle: edge.angleDeg,
      align: 'center',
      baseline: 'middle',
    });
  }

  return placed;
}

function drawEdgeMeasures(
  doc: jsPDF,
  points: [number, number][],
  measures: string[],
  frontEdgeIndex: number,
): { edgeIndex: number; x: number; y: number }[] {
  const verts = preparePolygonVertices(points);
  return placeDistanceLabelsInsideLot(
    doc,
    points,
    measures,
    frontEdgeIndex,
    getLotMainAxis(verts),
  );
}

type LabelAvoidBand = { yMin: number; yMax: number; pad?: number };

function nudgeLabelOutsideBands(
  x: number,
  y: number,
  bands: LabelAvoidBand[],
): [number, number] {
  let ny = y;
  for (const band of bands) {
    const pad = band.pad ?? 4;
    if (ny >= band.yMin - pad && ny <= band.yMax + pad) {
      ny = band.yMin - pad - 2;
    }
  }
  return [x, Math.max(2, ny)];
}

/** Logradouro da frente: fora do lote, paralelo à divisa. */
function drawFrontStreetLabel(
  doc: jsPDF,
  points: [number, number][],
  frontEdgeIndex: number,
  streetName: string,
  avoidBands?: LabelAvoidBand[],
): [number, number] | null {
  const name = String(streetName || '').trim();
  if (!name || name === '—') return null;

  const verts = preparePolygonVertices(points);
  const n = verts.length;
  if (n < 3) return null;

  const fi = ((frontEdgeIndex % n) + n) % n;
  const edge = getEdgeGeometry(verts, fi);
  const narrow = lotSpanOnSheet(verts) < 38;
  const streetOffset = sketchOffsetMm((narrow ? 12 : 15) + 2);
  let [x, y] = edgeExternalLabelPos(edge, streetOffset);
  if (avoidBands?.length) {
    [x, y] = nudgeLabelOutsideBands(x, y, avoidBands);
  }

  console.log('LOT_SHEET_FRONT_EDGE_DETECTED', {
    frontEdgeIndex: fi,
    midpoint: edge.mid,
    dx: edge.dx,
    dy: edge.dy,
  });
  console.log('LOT_SHEET_STREET_LABEL_POSITION', {
    streetName: name,
    x,
    y,
    offsetMm: streetOffset,
    outside: !pointInsidePolygon(x, y, verts),
  });
  console.log('LOT_SHEET_STREET_LABEL_ROTATION', {
    streetName: name,
    angleDeg: edge.angleDeg,
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(sketchFontSize(narrow ? 6 : 7));
  doc.setTextColor(...BLACK);
  doc.text(name, x, y, {
    angle: edge.angleDeg,
    align: 'center',
    baseline: 'middle',
    maxWidth: sketchOffsetMm(58),
  });

  return [x, y];
}

function drawVertexMarkers(doc: jsPDF, points: [number, number][]) {
  const verts = preparePolygonVertices(points);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(sketchFontSize(5.5) * VERTEX_FONT_EXTRA_SCALE);
  doc.setTextColor(...BLACK);
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.25);
  verts.forEach((p, i) => {
    doc.circle(p[0], p[1], 0.9, 'S');
    doc.text(
      `M-${String(i + 1).padStart(2, '0')}`,
      p[0] + sketchOffsetMm(2.2),
      p[1] - sketchOffsetMm(1.2),
    );
  });
}

function labelAtEdgeExternal(
  doc: jsPDF,
  verts: [number, number][],
  edgeIndex: number,
  text: string,
  offsetMm: number,
) {
  if (!text || text === '—') return;
  const edge = getEdgeGeometry(verts, edgeIndex);
  const [x, y] = edgeExternalLabelPos(edge, offsetMm);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(sketchFontSize(6));
  doc.setTextColor(...BLACK);
  doc.text(text, x, y, {
    angle: edge.angleDeg,
    align: 'center',
    baseline: 'middle',
    maxWidth: sketchOffsetMm(52),
  });
}

/** Confrontantes laterais/fundos (frente = logradouro em drawFrontStreetLabel). */
function placeSideConfrontantLabels(
  doc: jsPDF,
  points: [number, number][],
  sides: {
    frente: string;
    fundo: string;
    ladoDireito: string;
    ladoEsquerdo: string;
  },
  frontEdgeIndex: number,
) {
  const verts = preparePolygonVertices(points);
  const n = verts.length;
  if (n < 3) return;

  const frenteIdx = ((frontEdgeIndex % n) + n) % n;
  const fundoIdx = (frenteIdx + Math.floor(n / 2)) % n;
  const dirIdx = (frenteIdx + 1) % n;
  const esqIdx = (frenteIdx + n - 1) % n;

  doc.setTextColor(...BLACK);

  const extOffset = sketchOffsetMm(10);
  labelAtEdgeExternal(doc, verts, fundoIdx, sides.fundo, extOffset);
  labelAtEdgeExternal(doc, verts, dirIdx, sides.ladoDireito, extOffset);
  labelAtEdgeExternal(doc, verts, esqIdx, sides.ladoEsquerdo, extOffset);
}

const LOT_BADGE_RADIUS_MM = 5.5;
/** Profundidade do círculo em direção à rua (8–12% da profundidade do lote). */
const FRONT_DEPTH_FRACTION = 0.1;
const AREA_FONT_PT_NORMAL = 21;
const AREA_FONT_PT_NARROW = 18;

/** Círculo do lote voltado para a frente (próximo à rua). */
function placeLotNumberNearFront(
  doc: jsPDF,
  points: [number, number][],
  lotNum: string,
  frontEdgeIndex: number,
  placedZones: PlacedLabelZone[],
): { badgePos: [number, number]; radius: number } {
  const verts = preparePolygonVertices(points);
  const front = getLotFrontDirection(verts, frontEdgeIndex);
  const depthMm = front.maxInwardDepthMm * FRONT_DEPTH_FRACTION;

  let badgePos: [number, number] = [
    front.edge.mid[0] + front.inwardNx * depthMm,
    front.edge.mid[1] + front.inwardNy * depthMm,
  ];

  if (!pointInsidePolygon(badgePos[0], badgePos[1], verts)) {
    badgePos = [
      front.edge.mid[0] + front.inwardNx * depthMm * 0.65,
      front.edge.mid[1] + front.inwardNy * depthMm * 0.65,
    ];
  }

  badgePos = resolveLabelCollisions(
    badgePos,
    LOT_BADGE_RADIUS_MM,
    placedZones,
    3,
  );

  const r = LOT_BADGE_RADIUS_MM;
  doc.setDrawColor(...BLACK);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.45);
  doc.circle(badgePos[0], badgePos[1], r, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...RED);
  doc.text(lotNum, badgePos[0], badgePos[1] + 1.1, { align: 'center' });
  doc.setTextColor(...BLACK);

  return { badgePos, radius: r };
}

/** Área na zona preferencial central (retângulo útil), separada do círculo. */
function placeAreaLabelCenter(
  doc: jsPDF,
  points: [number, number][],
  areaText: string,
  mainAxis: LotMainAxis,
  frontEdgeIndex: number,
  badgePos: [number, number],
  placedZones: PlacedLabelZone[],
): { areaPos: [number, number] } {
  const verts = preparePolygonVertices(points);
  const front = getLotFrontDirection(verts, frontEdgeIndex);
  const preferred = getAreaPreferredPosition(verts, mainAxis, front);
  let areaPos = placeAreaLabelPreferredZone(
    preferred,
    verts,
    mainAxis,
    front,
    placedZones,
    badgePos,
  );
  areaPos = applyAreaLabelFineTune(areaPos, front);
  if (!pointInsidePolygon(areaPos[0], areaPos[1], verts)) {
    areaPos = placeAreaLabelPreferredZone(
      preferred,
      verts,
      mainAxis,
      front,
      placedZones,
      badgePos,
    );
  }

  const usefulW = lotUsefulCrossWidthMm(verts, mainAxis);
  const lines = splitAreaLabelLines(areaText, usefulW, mainAxis.narrow);
  const areaFont = mainAxis.narrow ? AREA_FONT_PT_NARROW : AREA_FONT_PT_NORMAL;
  const perpRad = ((mainAxis.angleDeg + 90) * Math.PI) / 180;
  const lineStep = mainAxis.narrow ? 5 : 5.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(areaFont);
  doc.setTextColor(...BLUE);

  if (lines.length === 1) {
    doc.text(lines[0], areaPos[0], areaPos[1], {
      align: 'center',
      baseline: 'middle',
      angle: mainAxis.angleDeg,
    });
  } else {
    lines.forEach((line, i) => {
      const off = (i - (lines.length - 1) / 2) * lineStep;
      doc.text(line, areaPos[0] + Math.cos(perpRad) * off, areaPos[1] + Math.sin(perpRad) * off, {
        align: 'center',
        baseline: 'middle',
        angle: mainAxis.angleDeg,
      });
    });
  }

  doc.setTextColor(...BLACK);

  return { areaPos };
}

function drawCompassRose(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.2);
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r, 'S');
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const x2 = cx + Math.cos(a) * r;
    const y2 = cy + Math.sin(a) * r;
    doc.line(cx, cy, x2, y2);
  }
  doc.setFillColor(...BLACK);
  doc.triangle(
    cx,
    cy - r,
    cx - 2.8,
    cy - r + 6,
    cx + 2.8,
    cy - r + 6,
    'F',
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('N', cx - 2.2, cy - r - 2.5);
}

function drawMetricTable(
  doc: jsPDF,
  box: Box,
  rows: LotSheetMetricRow[],
) {
  const headers = ['De', 'Para', 'Azimute', 'Distância', 'Coord. E(X)', 'Coord. N(Y)'];
  const colWidths = [
    box.w * 0.08,
    box.w * 0.08,
    box.w * 0.18,
    box.w * 0.14,
    box.w * 0.26,
    box.w * 0.26,
  ];
  const rowH = 4.6;
  const headerH = 5.5;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.25);
  doc.rect(box.x, box.y, box.w, box.h);

  let x = box.x;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  headers.forEach((h, i) => {
    doc.rect(x, box.y, colWidths[i], headerH);
    doc.text(h, x + colWidths[i] / 2, box.y + 3.5, { align: 'center' });
    x += colWidths[i];
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  const maxRows = Math.min(
    rows.length,
    Math.floor((box.h - headerH) / rowH),
  );
  for (let ri = 0; ri < maxRows; ri++) {
    const row = rows[ri];
    const y = box.y + headerH + ri * rowH;
    x = box.x;
    const cells = [
      row.from,
      row.to,
      row.azimute,
      row.distancia,
      row.coordE,
      row.coordN,
    ];
    cells.forEach((cell, ci) => {
      doc.rect(x, y, colWidths[ci], rowH);
      const isCoordCol = ci >= 4;
      const longMsg = cell.includes('não disponíveis');
      if (isCoordCol && longMsg) doc.setFontSize(4.2);
      else doc.setFontSize(5.5);
      doc.text(cell, x + colWidths[ci] / 2, y + 3.1, {
        align: 'center',
        maxWidth: colWidths[ci] - 1,
      });
      x += colWidths[ci];
    });
  }
}

function drawGraphicScale(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  scaleDenom: number,
) {
  const barRealM = 50;
  const barMm = Math.min(w * 0.55, (barRealM * 1000) / scaleDenom);
  const segments = 5;
  const segMm = barMm / segments;
  const segM = barRealM / segments;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('Escala Gráfica:', x, y);

  const barX = x + 28;
  const barY = y - 1.5;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);
  doc.setFillColor(255, 255, 255);

  for (let i = 0; i < segments; i++) {
    if (i % 2 === 0) doc.setFillColor(255, 255, 255);
    else doc.setFillColor(40, 40, 40);
    doc.rect(barX + i * segMm, barY, segMm, 3, 'FD');
  }
  doc.setDrawColor(...BLACK);
  doc.rect(barX, barY, barMm, 3, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(...BLACK);
  for (let i = 0; i <= segments; i++) {
    const label = String(Math.round(i * segM));
    doc.text(label, barX + i * segMm, barY + 5.5, { align: 'center' });
  }
  doc.text('m', barX + barMm + 3, barY + 1.5);
}

function drawQuadraLocation(
  doc: jsPDF,
  box: Box,
  sketch: LotSheetBlockSketch | null,
  streetNames: string[],
) {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.rect(box.x, box.y, box.w, box.h);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5);
  doc.text('LOCALIZAÇÃO NA QUADRA (sem escala)', box.x + 2, box.y + 4);

  const inner: Box = {
    x: box.x + 3,
    y: box.y + 6,
    w: box.w - 6,
    h: box.h - 9,
  };

  if (!sketch?.lots.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text('Croqui indisponível — sem geometria na quadra', inner.x + inner.w / 2, inner.y + inner.h / 2, {
      align: 'center',
    });
    return;
  }

  const projected = projectRingsToBox(sketch.lots, sketch.bbox, inner);
  sketch.lots.forEach((lot, idx) => {
    const pts = projected.get(String(idx));
    if (!pts) return;
    drawPolygonLines(doc, pts, {
      fill: lot.isSelected ? HIGHLIGHT : [255, 255, 255],
      stroke: BLACK,
      lw: lot.isSelected ? 0.55 : 0.3,
    });
    const c = centroid(pts);
    doc.setFont('helvetica', lot.isSelected ? 'bold' : 'normal');
    doc.setFontSize(lot.isSelected ? 6 : 4.5);
    doc.setTextColor(...BLACK);
    doc.text(lot.number, c[0], c[1], { align: 'center' });
    if (lot.areaLabel) {
      doc.setFontSize(3.8);
      doc.text(lot.areaLabel, c[0], c[1] + 2.8, { align: 'center' });
    }
  });

  const streets = streetNames.filter(Boolean);
  if (streets.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.5);
    if (streets[0]) {
      doc.text(streets[0], inner.x + inner.w / 2, inner.y - 0.5, {
        align: 'center',
        maxWidth: inner.w,
      });
    }
    if (streets[1]) {
      doc.text(streets[1], inner.x + inner.w / 2, inner.y + inner.h + 2, {
        align: 'center',
        maxWidth: inner.w,
      });
    }
    if (streets[2]) {
      doc.text(streets[2], inner.x - 1, inner.y + inner.h / 2, {
        align: 'right',
        angle: 90,
        maxWidth: inner.h,
      });
    }
    if (streets[3]) {
      doc.text(streets[3], inner.x + inner.w + 1, inner.y + inner.h / 2, {
        align: 'left',
        angle: 90,
        maxWidth: inner.h,
      });
    }
  }

  drawCompassRose(doc, box.x + box.w - 8, box.y + 8, 3.5);
}

async function loadOptionalImage(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    return await loadImageAsBase64(url);
  } catch {
    return null;
  }
}

function drawConfrontationsBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  confrontants: LotSheetSideConfrontants,
) {
  const padX = 3;
  const padTop = 4;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, h);

  const label = (
    lx: number,
    ly: number,
    text: string,
    bold = false,
    size = 4.5,
  ) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...BLACK);
    doc.text(text, lx, ly, { maxWidth: w - padX * 2 });
  };

  label(x + padX, y + padTop, 'CONFRONTAÇÕES', true, 5.2);
  let ly = y + padTop + 5;
  const rows: [string, string][] = [
    ['Frente', confrontants.frente || '—'],
    ['Fundo', confrontants.fundo || '—'],
    ['Lado Direito', confrontants.ladoDireito || '—'],
    ['Lado Esquerdo', confrontants.ladoEsquerdo || '—'],
  ];
  const rowStep = (h - padTop - 6) / rows.length;
  for (const [k, v] of rows) {
    label(x + padX, ly, `${k}:`, false, 4.3);
    label(x + padX + 18, ly, v, false, 4.3);
    ly += Math.max(4.2, rowStep);
  }
}

const RT_LINE_STEP_MM = 3;
const RT_IMG_MAX_H_MM = 18;

function addPdfImageContained(
  doc: jsPDF,
  base64: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  format: 'PNG' | 'JPEG' = 'PNG',
): number {
  try {
    const props = doc.getImageProperties(base64);
    const scale = Math.min(boxW / props.width, boxH / props.height);
    const dw = props.width * scale;
    const dh = props.height * scale;
    const ix = boxX + (boxW - dw) / 2;
    doc.addImage(base64, format, ix, boxY, dw, dh);
    return dh;
  } catch {
    return 0;
  }
}

function drawTechnicalResponsiblePanel(
  doc: jsPDF,
  box: Box,
  tech: TechnicalResponsibleProfile,
  signatureBase64: string | null,
  stampBase64: string | null,
) {
  const { x, y, w, h } = box;
  const pad = 3;
  const colGap = 2;
  const innerW = w - pad * 2;
  const leftW = innerW * 0.56;
  const rightW = innerW - leftW - colGap;
  const leftX = x + pad;
  const rightX = leftX + leftW + colGap;
  const contentTop = y + 7;
  const lineStep = RT_LINE_STEP_MM;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, h);

  const writeLines = (
    lx: number,
    ly: number,
    text: string,
    maxW: number,
    size = 4.6,
    bold = false,
  ): number => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...BLACK);
    const lines = doc.splitTextToSize(text, maxW) as string[];
    let cy = ly;
    for (const line of lines) {
      doc.text(line, lx, cy);
      cy += lineStep;
    }
    return cy;
  };

  writeLines(leftX, y + 4, 'RESPONSÁVEL TÉCNICO', innerW, 6, true);

  if (!hasTechnicalResponsible(tech)) {
    writeLines(leftX, contentTop, TECH_NOT_INFORMED_MSG, innerW, 4.8);
    return;
  }

  let ly = contentTop;
  const pushField = (label: string, value: string) => {
    if (!value) return;
    ly = writeLines(leftX, ly, `${label}: ${value}`, leftW, 4.6);
  };

  pushField('Nome', tech.name);
  pushField('Cargo/Função', tech.title);
  pushField('CREA/CFT/CAU', formatTechnicalRegistryLine(tech));
  pushField('CPF', tech.cpf);
  pushField('Telefone', tech.phone);
  if (tech.email) {
    ly = writeLines(leftX, ly, `E-mail: ${tech.email}`, leftW, 4.6);
  }

  let imgY = contentTop;
  const imgBoxH = RT_IMG_MAX_H_MM;

  if (signatureBase64) {
    const usedH = addPdfImageContained(
      doc,
      signatureBase64,
      rightX,
      imgY,
      rightW,
      imgBoxH,
    );
    imgY += (usedH > 0 ? usedH : imgBoxH) + 2;
  } else {
    writeLines(
      rightX,
      imgY + 2,
      'Assinatura não cadastrada',
      rightW,
      4.2,
    );
    imgY += 7;
  }

  if (stampBase64) {
    addPdfImageContained(doc, stampBase64, rightX, imgY, rightW, imgBoxH);
  } else {
    writeLines(rightX, imgY + 2, 'Carimbo não cadastrado', rightW, 4.2);
  }
}

function drawObservationsPanel(doc: jsPDF, box: Box) {
  const { x, y, w, h } = box;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, h);

  const lineH = 2.75;
  let ly = y + 3.5;
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.text('OBSERVAÇÕES E VALIDADE DA PRANCHA', x + 3, ly);
  ly += lineH + 0.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.4);
  for (const paragraph of LOT_SHEET_LEGAL_DISCLAIMER.paragraphs) {
    const lines = doc.splitTextToSize(paragraph, w - 6) as string[];
    for (const line of lines) {
      doc.text(line, x + 3, ly);
      ly += lineH;
    }
    ly += 0.3;
  }
}

function drawBottomFooterSplit(
  doc: jsPDF,
  box: Box,
  tech: TechnicalResponsibleProfile,
  signatureBase64: string | null,
  stampBase64: string | null,
) {
  const gap = 2;
  const leftW = box.w * 0.49;
  const leftBox: Box = { x: box.x, y: box.y, w: leftW, h: box.h };
  const rightBox: Box = {
    x: box.x + leftW + gap,
    y: box.y,
    w: box.w - leftW - gap,
    h: box.h,
  };
  drawObservationsPanel(doc, leftBox);
  drawTechnicalResponsiblePanel(
    doc,
    rightBox,
    tech,
    signatureBase64,
    stampBase64,
  );
}

function drawMetricTopoFooter(
  doc: jsPDF,
  box: Box,
  data: {
    projectName: string;
    owner: LotSheetPayload['ownerDetails'];
    lotNum: string;
    quadra: string;
    area: string;
    scale: string;
    date: string;
    confrontants: LotSheetSideConfrontants;
    logoBase64: string | null;
  },
) {
  const { x, y, w, h } = box;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);
  doc.rect(x, y, w, h);

  const leftW = w * 0.58;
  doc.line(x + leftW, y, x + leftW, y + h);

  const label = (lx: number, ly: number, text: string, bold = false, size = 6) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...BLACK);
    doc.text(text, lx, ly, { maxWidth: leftW - 6 });
  };

  let ly = y + 4;
  if (data.logoBase64) {
    try {
      doc.addImage(data.logoBase64, 'PNG', x + 2, y + 2, 16, 8);
      ly = y + 12;
    } catch {
      /* ignore */
    }
  }

  label(x + 2, ly, `EMPREENDIMENTO: ${data.projectName}`, true);
  ly += 4.2;
  label(x + 2, ly, `LOTE: ${data.lotNum}`);
  ly += 4;
  label(x + 2, ly, `PROPRIETÁRIO: ${data.owner.name}`);
  ly += 4;
  label(x + 2, ly, `CPF/CNPJ: ${data.owner.cpf}`);
  ly += 4;
  label(x + 2, ly, `ENDEREÇO: ${data.owner.address}`);
  ly += 4;
  label(x + 2, ly, `BAIRRO: ${data.owner.neighborhood}`);
  ly += 4;
  if (data.owner.cadastralInscription !== '—') {
    label(x + 2, ly, `INSCRIÇÃO CADASTRAL: ${data.owner.cadastralInscription}`);
    ly += 4;
  }
  label(x + 2, ly, `MUNICÍPIO: ${data.owner.municipality}`);

  const rx = x + leftW + 2;
  const rw = w - leftW - 4;
  const col = rw / 3;

  label(rx, y + 5, `LOTE: ${data.lotNum}`, true);
  label(rx + col, y + 5, `QUADRA: ${data.quadra}`, true);
  label(rx + col * 2, y + 5, `ÁREA: ${data.area}`, true);
  label(rx, y + 10, `ESCALA: ${data.scale}`, true);
  label(rx + col * 1.15, y + 10, `DATA: ${data.date}`, true);

  const confrontBoxY = y + 14;
  const confrontBoxH = h - 14 - 2;
  drawConfrontationsBox(doc, rx, confrontBoxY, rw, confrontBoxH, data.confrontants);
}

/**
 * Gera PDF A4 retrato no padrão Métrica Topo.
 */
export async function generateLotSheetPdf(
  input: GenerateLotSheetPdfInput,
): Promise<jsPDF> {
  console.log('LOT_SHEET_PDF_GENERATED', {
    lot: input.lot.id,
    layout: 'metrica_topo_a4',
  });

  const company = input.company;
  const logoBase64 = await loadReportHeaderLogoBase64(
    (company?.logo_url as string) || null,
  );
  const techProfile = normalizeTechnicalResponsibleFromCompany(
    company as Record<string, unknown> | null,
  );
  const signatureBase64 = await loadOptionalImage(techProfile.signature_url);
  const stampBase64 = await loadOptionalImage(techProfile.stamp_url);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const innerX = MARGIN;
  const innerY = MARGIN;
  const innerW = pageW - MARGIN * 2;
  const innerH = pageH - MARGIN * 2;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.4);
  doc.rect(innerX, innerY, innerW, innerH);

  const bottomSplitH = 24;
  const footerH = 40;
  const scaleBandH = 9;
  const tableRowH = 4.6;
  const tableHeaderH = 5.5;
  const tableRows = Math.max(4, Math.min(input.metricRows.length, 12));
  const tableH = tableHeaderH + tableRows * tableRowH + 3;
  const gap = 2;
  const contentX = innerX + 3;
  const contentW = innerW - 6;

  const bottomSplitBox: Box = {
    x: contentX,
    y: innerY + innerH - bottomSplitH - 1,
    w: contentW,
    h: bottomSplitH,
  };

  const footerBox: Box = {
    x: contentX,
    y: bottomSplitBox.y - gap - footerH,
    w: contentW,
    h: footerH,
  };

  const tableBox: Box = {
    x: contentX,
    y: footerBox.y - gap - tableH,
    w: contentW,
    h: tableH,
  };

  const scaleY = tableBox.y - gap - scaleBandH;

  const mainTopY = innerY + 3;
  const mainAvailableH = tableBox.y - gap - mainTopY;
  const mainBox: Box = {
    x: contentX,
    y: mainTopY,
    w: contentW,
    h: Math.max(120, mainAvailableH),
  };

  const project = input.project;
  const lot = input.lot;
  const lotNum = String(lot.number || lot.lot || '—');
  const quadra = String(lot.block_name || lot.block || lot.quadra || '—');
  const projectName = String(project.name || '—').toUpperCase();
  const scaleDenom = parseScaleDenom(input.scaleLabel);

  const sheetPts = drawLotPolygon(
    doc,
    projectRingToSheet(
      input.geometry.localRing,
      input.geometry.bboxMeters,
      mainBox,
    ),
  );

  const frontEdge = input.frontEdgeIndex ?? 0;
  const edgeLabels = input.officialEdgeLengths ?? [];
  if (
    !edgeLabels.length ||
    !edgeLabels.some((l) => l && l !== '—' && !l.includes('inválido'))
  ) {
    console.log('INVALID_OFFICIAL_DISTANCE', {
      reason: 'no_official_edge_labels_for_pdf',
      lot: lotNum,
    });
  }

  if (input.ignoredSegmentNote) {
    console.log('LOT_SHEET_PDF_IGNORED_SEGMENTS', {
      note: input.ignoredSegmentNote,
      lot: lotNum,
    });
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5);
    doc.setTextColor(120, 0, 0);
    doc.text(input.ignoredSegmentNote, mainBox.x + 2, tableBox.y - 2);
    doc.setTextColor(...BLACK);
  }

  const sheetVerts = preparePolygonVertices(sheetPts);
  const mainAxis = getLotMainAxis(sheetVerts);

  const measurePositions = placeDistanceLabelsInsideLot(
    doc,
    sheetPts,
    edgeLabels,
    frontEdge,
    mainAxis,
  );
  drawVertexMarkers(doc, sheetPts);

  const frontMeasurePos =
    measurePositions.find((p) => p.edgeIndex === frontEdge) ?? null;
  const labelAvoidBands: LabelAvoidBand[] = [
    { yMin: scaleY - 1, yMax: scaleY + scaleBandH + 8, pad: 6 },
    { yMin: tableBox.y - 2, yMax: tableBox.y + tableBox.h + 2, pad: 5 },
  ];
  const streetPos = drawFrontStreetLabel(
    doc,
    sheetPts,
    frontEdge,
    input.sideConfrontants.frente,
    labelAvoidBands,
  );

  const placedZones: PlacedLabelZone[] = [
    ...measurePositions.map((p) => ({
      pos: [p.x, p.y] as [number, number],
      radius: 4,
      kind: 'distance',
    })),
    ...(streetPos
      ? [{ pos: streetPos, radius: 6, kind: 'street' as const }]
      : []),
    ...(frontMeasurePos
      ? [
          {
            pos: [frontMeasurePos.x, frontMeasurePos.y] as [number, number],
            radius: 4,
            kind: 'front_measure',
          },
        ]
      : []),
  ];

  const lotBadge = placeLotNumberNearFront(
    doc,
    sheetPts,
    lotNum,
    frontEdge,
    placedZones,
  );
  placedZones.push({
    pos: lotBadge.badgePos,
    radius: lotBadge.radius + 2,
    kind: 'lot_badge',
  });

  const areaLabel = placeAreaLabelCenter(
    doc,
    sheetPts,
    input.measures.area,
    mainAxis,
    frontEdge,
    lotBadge.badgePos,
    placedZones,
  );

  placeSideConfrontantLabels(doc, sheetPts, input.sideConfrontants, frontEdge);

  console.log('LOT_SHEET_FINAL_FRONT_LAYOUT', {
    frontEdgeIndex: frontEdge,
    streetName: input.sideConfrontants.frente,
    frontMeasurePos,
    streetPos,
    lotBadge: lotBadge.badgePos,
    areaPos: areaLabel.areaPos,
    mainAxisAngleDeg: mainAxis.angleDeg,
    distanceOffsetMm: mainAxis.internalOffsetMm,
    minGapMeasureToStreet:
      frontMeasurePos && streetPos
        ? Math.hypot(
            frontMeasurePos.x - streetPos[0],
            frontMeasurePos.y - streetPos[1],
          )
        : null,
  });
  drawCompassRose(doc, mainBox.x + mainBox.w - 11, mainBox.y + 11, 7);

  drawMetricTable(doc, tableBox, input.metricRows);
  drawGraphicScale(doc, contentX, scaleY + 4, contentW, scaleDenom);

  drawMetricTopoFooter(doc, footerBox, {
    projectName,
    owner: input.ownerDetails,
    lotNum,
    quadra,
    area: input.measures.area,
    scale: formatScaleLabel(input.scaleLabel),
    date: new Date().toLocaleDateString('pt-BR'),
    confrontants: input.sideConfrontants,
    logoBase64,
  });

  drawBottomFooterSplit(
    doc,
    bottomSplitBox,
    techProfile,
    signatureBase64,
    stampBase64,
  );

  return doc;
}

export function lotSheetPdfToBlob(doc: jsPDF): Blob {
  return doc.output('blob');
}

export function downloadLotSheetPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function openLotSheetPdfPreview(doc: jsPDF) {
  const blob = lotSheetPdfToBlob(doc);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
