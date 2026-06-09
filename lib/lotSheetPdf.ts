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
  filterSketchSidesForCleanMap,
  findBestInteriorLabelPosition,
  graphicScaleBandRect,
  LOT_SHEET_CLEAN_SKETCH,
  minDistToPolygonRing,
  planFrontStreetLabel,
  computeLotMainAxis,
  placeLotNumberAndArea,
  resolveAreaLabelPlacement,
  resolveLabelClearOfScaleBand,
  resolveMeasureLabelPosition,
  resolvePointAvoidingRects,
  resolveVertexLabelSpacing,
  shouldDrawStreetInSketch,
  wrapConfrontantText,
  type LabelRect,
  type LotSheetSketchSide,
} from '@/lib/lotSheetLayout';
import {
  buildSigefTechnicalData,
  computeSigefPageRegions,
  drawSigefConfrontationsPanel,
  drawSigefGraphicScale,
  drawSigefTechnicalPanel,
  LOT_SHEET_SIGEF_LAYOUT,
  polygonSheetBBox,
  resolveSigefGraphicScaleBox,
  type SigefBox,
} from '@/lib/lotSheetSigefLayout';
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

/** Eixo longitudinal do lote (aresta mais longa + PCA no layout). */
function getLotMainAxis(verts: [number, number][]): LotMainAxis {
  const axis = computeLotMainAxis(verts);
  return {
    center: axis.center,
    axisDx: axis.axisDx,
    axisDy: axis.axisDy,
    angleDeg: axis.angleDeg,
    narrow: axis.narrow,
    internalOffsetMm: axis.narrow
      ? DISTANCE_INTERNAL_OFFSET_NARROW_MM
      : DISTANCE_INTERNAL_OFFSET_NORMAL_MM,
  };
}

/** Escala de fontes/offsets apenas no croqui (não tabelas/rodapés). */
const SKETCH_FONT_SCALE = 2;

/** Profundidade da área: fração frente → fundo (50–52%). */
const AREA_CENTERLINE_DEPTH_RATIO_DEFAULT = 0.51;

/** Tentativas de offset interno das medidas (sempre dentro do lote). */
const DISTANCE_OFFSET_TRY_MM = [6, 5, 4, 3];

/** Offset interno simétrico das medidas (mm no croqui, sem redução por lado). */
const DISTANCE_INTERNAL_OFFSET_NORMAL_MM = 6;
const DISTANCE_INTERNAL_OFFSET_NARROW_MM = 4;
const DISTANCE_MIN_CLEARANCE_FROM_EDGE_MM = LOT_SHEET_SIGEF_LAYOUT ? 6 : 2.5;
const SIGEF_VERTEX_STAGGER_BOOST = 6;

/** Offset externo dos confrontantes (mm no croqui — afastado da divisa). */
const SIDE_CONFRONTANT_LABEL_OFFSET_MM = 15;
const BACK_CONFRONTANT_LABEL_OFFSET_MM = 15;
const CONFRONTANT_MAX_WIDTH_MM = 44;
const MIN_AREA_EDGE_CLEARANCE_MM = 7;
const VERTEX_STAGGER_PROXIMITY_MM = LOT_SHEET_SIGEF_LAYOUT
  ? 15
  : LOT_SHEET_CLEAN_SKETCH
    ? 18
    : 14;
const VERTEX_LABEL_MIN_GAP_MM = LOT_SHEET_SIGEF_LAYOUT
  ? 15
  : LOT_SHEET_CLEAN_SKETCH
    ? 12
    : 8;

/** Vértices: bissetriz externa e afastamento mínimo da divisa. */
const VERTEX_LABEL_OFFSET_MM = 4;
const VERTEX_LABEL_CLEARANCE_MM = 3.5;

/** Refinos de legibilidade (somente vértices e medidas internas). */
const VERTEX_FONT_EXTRA_SCALE = 1.3;
const DISTANCE_FONT_EXTRA_SCALE = 1.2;

function sketchFontSize(base: number): number {
  return base * SKETCH_FONT_SCALE;
}

function sketchOffsetMm(base: number): number {
  return base * SKETCH_FONT_SCALE;
}

function frontStreetLabelOffset(narrow: boolean): number {
  return sketchOffsetMm((narrow ? 14 : 17) + 2);
}

function sideConfrontantLabelOffset(): number {
  return SIDE_CONFRONTANT_LABEL_OFFSET_MM;
}

function backConfrontantLabelOffset(): number {
  return BACK_CONFRONTANT_LABEL_OFFSET_MM;
}

type LotSideSegments = {
  front: EdgeGeometry;
  fundo: EdgeGeometry;
  direito: EdgeGeometry;
  esquerdo: EdgeGeometry;
};

type LotCenterline = {
  frontPoint: [number, number];
  fundoPoint: [number, number];
  depthUx: number;
  depthUy: number;
  maxDepthMm: number;
};

function getSideSegmentsByRole(
  verts: [number, number][],
  frontEdgeIndex: number,
): LotSideSegments {
  const n = verts.length;
  const frenteIdx = ((frontEdgeIndex % n) + n) % n;
  const fundoIdx = (frenteIdx + Math.floor(n / 2)) % n;
  const dirIdx = (frenteIdx + 1) % n;
  const esqIdx = (frenteIdx + n - 1) % n;
  return {
    front: getEdgeGeometry(verts, frenteIdx),
    fundo: getEdgeGeometry(verts, fundoIdx),
    direito: getEdgeGeometry(verts, dirIdx),
    esquerdo: getEdgeGeometry(verts, esqIdx),
  };
}

function intersectLineWithSegment(
  origin: [number, number],
  dir: [number, number],
  segA: [number, number],
  segB: [number, number],
): [number, number] | null {
  const ex = segB[0] - segA[0];
  const ey = segB[1] - segA[1];
  const den = dir[0] * ey - dir[1] * ex;
  if (Math.abs(den) < 1e-9) return null;
  const aox = segA[0] - origin[0];
  const aoy = segA[1] - origin[1];
  const u = (aox * dir[1] - aoy * dir[0]) / den;
  if (u < -0.001 || u > 1.001) return null;
  const t = (aox * ey - aoy * ex) / den;
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t];
}

function distPointToSegment(
  pos: [number, number],
  segA: [number, number],
  segB: [number, number],
): number {
  const dx = segB[0] - segA[0];
  const dy = segB[1] - segA[1];
  const len2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(
    0,
    Math.min(1, ((pos[0] - segA[0]) * dx + (pos[1] - segA[1]) * dy) / len2),
  );
  const px = segA[0] + t * dx;
  const py = segA[1] + t * dy;
  return Math.hypot(pos[0] - px, pos[1] - py);
}

function pointOnEdgeAtInwardDepth(
  edge: EdgeGeometry,
  front: LotFrontContext,
  targetDepthMm: number,
): [number, number] {
  let best: [number, number] = edge.mid;
  let bestErr = Infinity;
  for (let t = 0; t <= 1.001; t += 0.02) {
    const px = edge.p1[0] + (edge.p2[0] - edge.p1[0]) * t;
    const py = edge.p1[1] + (edge.p2[1] - edge.p1[1]) * t;
    const d =
      (px - front.edge.mid[0]) * front.inwardNx +
      (py - front.edge.mid[1]) * front.inwardNy;
    const err = Math.abs(d - targetDepthMm);
    if (err < bestErr) {
      bestErr = err;
      best = [px, py];
    }
  }
  return best;
}

/** Direção transversal (perpendicular à profundidade frente → fundo). */
function depthPerpendicularDir(front: LotFrontContext): [number, number] {
  return [-front.inwardNy, front.inwardNx];
}

/** Ponto médio entre as laterais em um corte perpendicular à profundidade. */
function getCrossSectionMidpointAtDepth(
  front: LotFrontContext,
  sides: LotSideSegments,
  depthMm: number,
): [number, number] {
  const origin: [number, number] = [
    front.edge.mid[0] + front.inwardNx * depthMm,
    front.edge.mid[1] + front.inwardNy * depthMm,
  ];
  const crossDir = depthPerpendicularDir(front);
  const hits: [number, number][] = [];

  for (const edge of [sides.esquerdo, sides.direito]) {
    const h = intersectLineWithSegment(origin, crossDir, edge.p1, edge.p2);
    if (h) hits.push(h);
  }

  if (hits.length >= 2) {
    return [(hits[0][0] + hits[1][0]) / 2, (hits[0][1] + hits[1][1]) / 2];
  }

  const leftPt = pointOnEdgeAtInwardDepth(sides.esquerdo, front, depthMm);
  const rightPt = pointOnEdgeAtInwardDepth(sides.direito, front, depthMm);
  return [(leftPt[0] + rightPt[0]) / 2, (leftPt[1] + rightPt[1]) / 2];
}

/** Linha média entre lado esquerdo e direito (frente → fundo). */
function getLotCenterlineBetweenSides(
  front: LotFrontContext,
  sides: LotSideSegments,
): LotCenterline {
  const frontPoint = getCrossSectionMidpointAtDepth(front, sides, 0);
  const fundoPoint = getCrossSectionMidpointAtDepth(
    front,
    sides,
    front.maxInwardDepthMm,
  );
  const depthUx = front.inwardNx;
  const depthUy = front.inwardNy;
  return {
    frontPoint,
    fundoPoint,
    depthUx,
    depthUy,
    maxDepthMm: front.maxInwardDepthMm,
  };
}

/** Ponto na linha média a `ratio` da frente (0) ao fundo (1). */
function getPointOnCenterlineAtRatio(
  verts: [number, number][],
  front: LotFrontContext,
  sides: LotSideSegments,
  ratio: number,
): [number, number] {
  const depthFraction = Math.max(0, Math.min(1, ratio));
  const depthMm = depthFraction * front.maxInwardDepthMm;
  let pos = getCrossSectionMidpointAtDepth(front, sides, depthMm);
  if (!pointInsidePolygon(pos[0], pos[1], verts)) {
    const line = getLotCenterlineBetweenSides(front, sides);
    pos = [
      line.frontPoint[0] +
        (line.fundoPoint[0] - line.frontPoint[0]) * depthFraction,
      line.frontPoint[1] +
        (line.fundoPoint[1] - line.frontPoint[1]) * depthFraction,
    ];
  }
  return pos;
}

/**
 * Centro real entre laterais: média dos pontos médios esquerdo/direito,
 * ajustada na profundidade (frente → fundo).
 */
function getAreaPositionBetweenLaterals(
  sides: LotSideSegments,
  front: LotFrontContext,
  ratio: number,
): [number, number] {
  const transMid: [number, number] = [
    (sides.esquerdo.mid[0] + sides.direito.mid[0]) / 2,
    (sides.esquerdo.mid[1] + sides.direito.mid[1]) / 2,
  ];
  const currentDepth =
    (transMid[0] - front.edge.mid[0]) * front.inwardNx +
    (transMid[1] - front.edge.mid[1]) * front.inwardNy;
  const targetDepth = front.maxInwardDepthMm * Math.max(0, Math.min(1, ratio));
  const delta = targetDepth - currentDepth;
  return [
    transMid[0] + front.inwardNx * delta,
    transMid[1] + front.inwardNy * delta,
  ];
}

/** Posiciona a área no eixo entre laterais; colisão só altera profundidade. */
function placeAreaOnCenterlineRatio(
  verts: [number, number][],
  front: LotFrontContext,
  frontEdgeIndex: number,
  placedZones: PlacedLabelZone[],
  badgePos: [number, number] | null,
  ratio = AREA_CENTERLINE_DEPTH_RATIO_DEFAULT,
): [number, number] {
  const sides = getSideSegmentsByRole(verts, frontEdgeIndex);
  const areaRadius = sketchOffsetMm(7);
  const depthRatios = [ratio, 0.51, 0.5, 0.52, 0.48, 0.54];

  let best = getAreaPositionBetweenLaterals(sides, front, ratio);

  for (const r of depthRatios) {
    let pos = getAreaPositionBetweenLaterals(sides, front, r);
    if (!pointInsidePolygon(pos[0], pos[1], verts)) continue;

    if (badgePos) {
      const need = areaRadius + LOT_BADGE_RADIUS_MM + sketchOffsetMm(3);
      let d = Math.hypot(pos[0] - badgePos[0], pos[1] - badgePos[1]);
      if (d < need) {
        for (const bump of [0.03, 0.05, 0.08, 0.1]) {
          const pos2 = getAreaPositionBetweenLaterals(
            sides,
            front,
            Math.min(0.58, r + bump),
          );
          if (!pointInsidePolygon(pos2[0], pos2[1], verts)) continue;
          const d2 = Math.hypot(pos2[0] - badgePos[0], pos2[1] - badgePos[1]);
          if (d2 >= need) {
            pos = pos2;
            d = d2;
            break;
          }
        }
      }
    }

    let score = minDistToPolygonEdges(pos, verts);
    if (badgePos) {
      score += Math.hypot(pos[0] - badgePos[0], pos[1] - badgePos[1]) * 0.5;
    }
    const bestScore = minDistToPolygonEdges(best, verts);
    if (score >= bestScore) best = pos;
  }

  return best;
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

function perpendicularDistanceToEdge(
  pos: [number, number],
  edge: EdgeGeometry,
): number {
  return distPointToSegment(pos, edge.p1, edge.p2);
}

/** Escolhe a normal cujo deslocamento cai dentro do polígono. */
function pickInternalNormal(
  edge: EdgeGeometry,
  polygon: [number, number][],
): { nx: number; ny: number } {
  const len = Math.hypot(edge.dx, edge.dy) || 1;
  const perpX = -edge.dy / len;
  const perpY = edge.dx / len;
  const candidates = [
    { nx: perpX, ny: perpY },
    { nx: -perpX, ny: -perpY },
    { nx: edge.inNx, ny: edge.inNy },
    { nx: -edge.inNx, ny: -edge.inNy },
  ];
  for (const n of candidates) {
    const tx = edge.mid[0] + n.nx * 1.5;
    const ty = edge.mid[1] + n.ny * 1.5;
    if (pointInsidePolygon(tx, ty, polygon)) return n;
  }
  return { nx: edge.inNx, ny: edge.inNy };
}

function measureLabelCollides(
  x: number,
  y: number,
  radius: number,
  placed: PlacedLabelZone[],
): boolean {
  for (const z of placed) {
    if (Math.hypot(x - z.pos[0], y - z.pos[1]) < radius + z.radius + 2) {
      return true;
    }
  }
  return false;
}

/** Medida com offset interno/externo 4 mm e rotação 180° (SIGEF). */
function placeDistanceLabelWithSymmetricOffset(
  edge: EdgeGeometry,
  polygon: [number, number][],
  fixedOffsetMm?: number,
  placedZones: PlacedLabelZone[] = [],
): { x: number; y: number; offsetUsed: number; side: 'in' | 'out' } {
  const edgeLenMm = Math.hypot(edge.dx, edge.dy);
  const labelRadius = edgeLenMm < sketchOffsetMm(14) ? 4 : 5;
  const { nx, ny } = pickInternalNormal(edge, polygon);
  const n = polygon.length;
  const vi = edge.index;
  const p1 = polygon[vi];
  const p2 = polygon[(vi + 1) % n];

  const resolved = resolveMeasureLabelPosition(
    {
      mid: edge.mid,
      p1,
      p2,
      inNx: nx,
      inNy: ny,
      exNx: edge.exNx,
      exNy: edge.exNy,
    },
    polygon,
    placedZones.map((z) => ({
      pos: z.pos,
      radius: z.radius,
      kind: z.kind,
    })),
    {
      labelRadius,
      minEdgeClearance: DISTANCE_MIN_CLEARANCE_FROM_EDGE_MM,
      edgeLenMm,
      forceInternalOnly: LOT_SHEET_SIGEF_LAYOUT,
    },
  );

  if (fixedOffsetMm != null && resolved.offsetUsed < fixedOffsetMm) {
    const retry = resolveMeasureLabelPosition(
      {
        mid: edge.mid,
        p1,
        p2,
        inNx: nx,
        inNy: ny,
        exNx: edge.exNx,
        exNy: edge.exNy,
      },
      polygon,
      placedZones.map((z) => ({ pos: z.pos, radius: z.radius, kind: z.kind })),
      {
        labelRadius,
        minEdgeClearance: fixedOffsetMm,
        edgeLenMm,
        forceInternalOnly: LOT_SHEET_SIGEF_LAYOUT,
      },
    );
    return retry;
  }

  return resolved;
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
  frontEdgeIndex: number,
  mainAxis: LotMainAxis,
  placedZones: PlacedLabelZone[] = [],
): { edgeIndex: number; x: number; y: number }[] {
  const verts = preparePolygonVertices(points);
  const n = Math.min(verts.length, measures.length);
  const sides = getSideSegmentsByRole(verts, frontEdgeIndex);
  let lateralOffsetMm: number | null = null;
  const placed: { edgeIndex: number; x: number; y: number }[] = [];
  const measureZones: PlacedLabelZone[] = [...placedZones];

  doc.setTextColor(...BLACK);

  for (let i = 0; i < n; i++) {
    const label = measures[i];
    if (!label || label === '—' || label.includes('inválido')) continue;
    if (String(label).trim() === '') continue;

    const edge = getEdgeGeometry(verts, i);
    const edgeLenMm = Math.hypot(edge.dx, edge.dy);
    const fontSize = distanceLabelFontSize(edgeLenMm, mainAxis.narrow);
    const isLateral =
      edge.index === sides.esquerdo.index || edge.index === sides.direito.index;

    let x: number;
    let y: number;
    if (isLateral) {
      if (lateralOffsetMm == null) {
        const first = placeDistanceLabelWithSymmetricOffset(
          edge,
          verts,
          mainAxis.internalOffsetMm,
          measureZones,
        );
        lateralOffsetMm = first.offsetUsed;
        x = first.x;
        y = first.y;
      } else {
        const pos = placeDistanceLabelWithSymmetricOffset(
          edge,
          verts,
          lateralOffsetMm,
          measureZones,
        );
        x = pos.x;
        y = pos.y;
      }
    } else {
      const pos = placeDistanceLabelWithSymmetricOffset(
        edge,
        verts,
        mainAxis.internalOffsetMm,
        measureZones,
      );
      x = pos.x;
      y = pos.y;
    }

    placed.push({ edgeIndex: i, x, y });
    measureZones.push({ pos: [x, y], radius: 5, kind: 'distance' });

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

/** Logradouro da frente: dentro da prancha, evita escala gráfica. */
function drawFrontStreetLabel(
  doc: jsPDF,
  points: [number, number][],
  frontEdgeIndex: number,
  streetName: string,
  sketchBox: Box,
  scaleBandRect: LabelRect | null,
  placedRects: LabelRect[],
): [number, number] | null {
  const name = String(streetName || '').trim();
  if (!name || name === '—') return null;

  const verts = preparePolygonVertices(points);
  const n = verts.length;
  if (n < 3) return null;

  const fi = ((frontEdgeIndex % n) + n) % n;
  const edge = getEdgeGeometry(verts, fi);
  const narrow = lotSpanOnSheet(verts) < 38;
  const edgeLenMm = Math.hypot(edge.dx, edge.dy);

  const plan = planFrontStreetLabel(
    edge.mid,
    edge.exNx,
    edge.exNy,
    edge.angleDeg,
    edgeLenMm,
    sketchBox,
    scaleBandRect,
    narrow,
  );

  if (!shouldDrawStreetInSketch(name, plan, scaleBandRect, sketchBox)) {
    return null;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(plan.fontSize);
  const lines = doc.splitTextToSize(name, plan.maxWidth) as string[];
  const lineH = plan.fontSize * 0.42;
  const textH = lines.length * lineH;
  const textW = Math.min(
    plan.maxWidth,
    Math.max(...lines.map((l) => doc.getTextWidth(l)), 8),
  );

  let [x, y] = resolvePointAvoidingRects(
    plan.x,
    plan.y,
    textW,
    textH,
    placedRects,
    sketchBox,
  );

  if (scaleBandRect) {
    const rect: LabelRect = {
      x: x - textW / 2,
      y: y - textH / 2,
      w: textW,
      h: textH,
    };
    if (
      rect.y + rect.h > scaleBandRect.y - 1 &&
      rect.x < scaleBandRect.x + scaleBandRect.w
    ) {
      y = scaleBandRect.y - textH / 2 - 2;
      x = Math.min(x, scaleBandRect.x + scaleBandRect.w * 0.35);
    }
  }

  doc.setTextColor(...BLACK);
  if (lines.length === 1) {
    doc.text(lines[0], x, y, {
      angle: plan.angleDeg,
      align: 'center',
      baseline: 'middle',
      maxWidth: plan.maxWidth,
    });
  } else {
    lines.forEach((line, i) => {
      const off = (i - (lines.length - 1) / 2) * lineH;
      const rad = (plan.angleDeg * Math.PI) / 180;
      doc.text(
        line,
        x - Math.sin(rad) * off,
        y + Math.cos(rad) * off,
        {
          angle: plan.angleDeg,
          align: 'center',
          baseline: 'middle',
        },
      );
    });
  }

  let streetRect: LabelRect = {
    x: x - textW / 2,
    y: y - textH / 2,
    w: textW,
    h: textH,
    kind: 'street',
  };
  streetRect = resolveLabelClearOfScaleBand(
    streetRect,
    scaleBandRect,
    sketchBox,
    4,
  );
  if (
    scaleBandRect &&
    streetRect.y + streetRect.h > scaleBandRect.y - 2
  ) {
    if (LOT_SHEET_CLEAN_SKETCH) return null;
    streetRect.y = scaleBandRect.y - streetRect.h - 4;
  }
  if (
    LOT_SHEET_CLEAN_SKETCH &&
    scaleBandRect &&
    streetRect.y + streetRect.h > scaleBandRect.y - 2
  ) {
    return null;
  }
  placedRects.push(streetRect);

  return [
    streetRect.x + streetRect.w / 2,
    streetRect.y + streetRect.h / 2,
  ];
}

function getVertexExternalBisector(
  verts: [number, number][],
  vertexIndex: number,
): [number, number] {
  const n = verts.length;
  const vi = ((vertexIndex % n) + n) % n;
  const edgePrev = getEdgeGeometry(verts, (vi - 1 + n) % n);
  const edgeNext = getEdgeGeometry(verts, vi);
  let bx = edgePrev.exNx + edgeNext.exNx;
  let by = edgePrev.exNy + edgeNext.exNy;
  const len = Math.hypot(bx, by) || 1;
  bx /= len;
  by /= len;
  return [bx, by];
}

function avoidVertexLabelLineCollision(
  pos: [number, number],
  verts: [number, number][],
  minClearance = VERTEX_LABEL_CLEARANCE_MM,
): boolean {
  if (pointInsidePolygon(pos[0], pos[1], verts)) return false;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % n];
    if (distPointToSegment(pos, p1, p2) < minClearance) return false;
  }
  return true;
}

function rotateDir(dir: [number, number], deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [dir[0] * c - dir[1] * s, dir[0] * s + dir[1] * c];
}

function placeVertexLabelOutsideCorner(
  verts: [number, number][],
  vertexIndex: number,
  placedVertexLabels: { x: number; y: number }[],
): { x: number; y: number; angleDeg: number } {
  const n = verts.length;
  const vi = ((vertexIndex % n) + n) % n;
  const vtx = verts[vi];
  const bisector = getVertexExternalBisector(verts, vi);
  const edgeNext = getEdgeGeometry(verts, vi);
  const stagger = resolveVertexLabelSpacing(
    vi,
    verts,
    VERTEX_STAGGER_PROXIMITY_MM,
  );
  const staggerBoost =
    stagger *
    (LOT_SHEET_SIGEF_LAYOUT
      ? SIGEF_VERTEX_STAGGER_BOOST
      : LOT_SHEET_CLEAN_SKETCH
        ? 5
        : 2.5);

  const offsets = [
    VERTEX_LABEL_OFFSET_MM + staggerBoost,
    6 + staggerBoost,
    8 + staggerBoost,
    10 + staggerBoost,
    12 + staggerBoost,
    14 + staggerBoost,
  ];
  const rotations =
    stagger % 2 === 0
      ? [0, 25, -25, 50, -50, 75, -75, 100]
      : [12, -12, 35, -35, 58, -58, 82, -82];

  for (const off of offsets) {
    for (const rot of rotations) {
      const [bx, by] = rotateDir(bisector, rot);
      const x = vtx[0] + bx * off;
      const y = vtx[1] + by * off;
      if (!avoidVertexLabelLineCollision([x, y], verts)) continue;
      const tooClose = placedVertexLabels.some(
        (p) => Math.hypot(p.x - x, p.y - y) < VERTEX_LABEL_MIN_GAP_MM,
      );
      if (tooClose) continue;
      return { x, y, angleDeg: edgeNext.angleDeg };
    }
  }

  const [bx, by] = bisector;
  return {
    x: vtx[0] + bx * (VERTEX_LABEL_OFFSET_MM + 3 + staggerBoost),
    y: vtx[1] + by * (VERTEX_LABEL_OFFSET_MM + 3 + staggerBoost),
    angleDeg: edgeNext.angleDeg,
  };
}

function drawVertexMarkers(
  doc: jsPDF,
  points: [number, number][],
  placedRects: LabelRect[],
) {
  const verts = preparePolygonVertices(points);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(sketchFontSize(5.5) * VERTEX_FONT_EXTRA_SCALE);
  doc.setTextColor(...BLACK);
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.25);
  const placedVertexLabels: { x: number; y: number }[] = [];
  verts.forEach((p, i) => {
    doc.circle(p[0], p[1], 0.9, 'S');
    const { x, y } = placeVertexLabelOutsideCorner(
      verts,
      i,
      placedVertexLabels,
    );
    doc.text(`M-${String(i + 1).padStart(2, '0')}`, x, y, {
      align: 'left',
      baseline: 'middle',
    });
    placedVertexLabels.push({ x, y });
    placedRects.push({
      x: x - 1,
      y: y - 2.5,
      w: 14,
      h: 5,
      kind: 'vertex',
    });
  });
}

function labelAtEdgeExternalResolved(
  doc: jsPDF,
  verts: [number, number][],
  edgeIndex: number,
  text: string,
  offsetMm: number,
  sketchBox: Box,
  placedRects: LabelRect[],
) {
  if (!text || text === '—') return;
  const edge = getEdgeGeometry(verts, edgeIndex);
  const edgeLenMm = Math.hypot(edge.dx, edge.dy);
  const maxWidth = Math.min(CONFRONTANT_MAX_WIDTH_MM, edgeLenMm * 0.95 + 12);
  const lines = wrapConfrontantText(text, Math.round(maxWidth / 2.2), 3);

  let fontSize = sketchFontSize(6);
  if (text.length > 28) fontSize = sketchFontSize(5.5);
  if (text.length > 42) fontSize = sketchFontSize(5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  const lineH = fontSize * 0.42;
  const textH = lines.length * lineH;
  const textW = Math.min(
    maxWidth,
    Math.max(...lines.map((l) => doc.getTextWidth(l)), 10),
  );

  const offsets = [offsetMm, offsetMm + 4, offsetMm + 8, offsetMm + 12, offsetMm + 16];
  let placed = false;

  for (const off of offsets) {
    let [x, y] = edgeExternalLabelPos(edge, off);
    [x, y] = resolvePointAvoidingRects(
      x,
      y,
      textW,
      textH,
      placedRects,
      sketchBox,
    );
    let rect: LabelRect = {
      x: x - textW / 2,
      y: y - textH / 2,
      w: textW,
      h: textH,
      kind: 'confrontant',
    };
    const scaleBand = placedRects.find((r) => r.kind === 'scale') ?? null;
    rect = resolveLabelClearOfScaleBand(rect, scaleBand, sketchBox, 4);
    if (scaleBand && rect.y + rect.h > scaleBand.y - 2) continue;

    let collision = false;
    for (const other of placedRects) {
      if (
        other.x < rect.x + rect.w &&
        other.x + other.w > rect.x &&
        other.y < rect.y + rect.h &&
        other.y + other.h > rect.y
      ) {
        collision = true;
        break;
      }
    }
    if (collision) continue;
    x = rect.x + rect.w / 2;
    y = rect.y + rect.h / 2;

    doc.setTextColor(...BLACK);
    lines.forEach((line, i) => {
      const offY = (i - (lines.length - 1) / 2) * lineH;
      const rad = (edge.angleDeg * Math.PI) / 180;
      doc.text(
        line,
        x - Math.sin(rad) * offY,
        y + Math.cos(rad) * offY,
        {
          angle: edge.angleDeg,
          align: 'center',
          baseline: 'middle',
          maxWidth,
        },
      );
    });
    placedRects.push(rect);
    placed = true;
    break;
  }

  if (!placed) {
    const [x, y] = edgeExternalLabelPos(edge, offsetMm);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(sketchFontSize(5));
    doc.text(lines[0], x, y, {
      angle: edge.angleDeg,
      align: 'center',
      baseline: 'middle',
      maxWidth,
    });
  }
}

/** Confrontantes por lado oficial (segmento representativo do sides.*). */
function placeSideConfrontantLabels(
  doc: jsPDF,
  points: [number, number][],
  sketchSides: LotSheetSketchSide[],
  frontStreet: string,
  sketchBox: Box,
  placedRects: LabelRect[],
) {
  const verts = preparePolygonVertices(points);
  const n = verts.length;
  if (n < 3) return;

  doc.setTextColor(...BLACK);
  const mapSides = filterSketchSidesForCleanMap(sketchSides, frontStreet);
  if (!mapSides.length) return;

  for (const side of mapSides) {
    const edgeIdx = ((side.representativeEdgeIndex % n) + n) % n;
    const offset =
      side.role === 'fundo'
        ? backConfrontantLabelOffset()
        : sideConfrontantLabelOffset();
    labelAtEdgeExternalResolved(
      doc,
      verts,
      edgeIdx,
      side.confrontantLabel,
      offset,
      sketchBox,
      placedRects,
    );
  }
}

const LOT_BADGE_RADIUS_MM = 5.5;
/** Profundidade do círculo em direção à rua (8–12% da profundidade do lote). */
const FRONT_DEPTH_FRACTION = 0.12;
const SIGEF_LOT_BADGE_MIN_EDGE_MM = 6;

/** Círculo do lote no centro visual livre (SIGEF). */
function placeLotNumberInVisualCenter(
  doc: jsPDF,
  points: [number, number][],
  lotNum: string,
  placedZones: PlacedLabelZone[],
): { badgePos: [number, number]; radius: number } {
  const verts = preparePolygonVertices(points);
  const avoid = placedZones.map((z) => ({
    pos: z.pos,
    radius: z.radius + 2,
  }));
  let badgePos = findBestInteriorLabelPosition(verts, {
    minEdgeDist: SIGEF_LOT_BADGE_MIN_EDGE_MM,
    avoid,
  });
  if (minDistToPolygonEdges(badgePos, verts) < SIGEF_LOT_BADGE_MIN_EDGE_MM) {
    badgePos = centroid(verts);
  }
  badgePos = resolveLabelCollisions(
    badgePos,
    LOT_BADGE_RADIUS_MM,
    placedZones,
    4,
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

/** Área no centro visual livre — nunca sobre divisa; fonte adaptativa. */
function placeAreaLabelCenter(
  doc: jsPDF,
  points: [number, number][],
  areaText: string,
  mainAxis: LotMainAxis,
  frontEdgeIndex: number,
  badgePos: [number, number],
  placedZones: PlacedLabelZone[],
): { areaPos: [number, number]; areaFont: number } {
  const verts = preparePolygonVertices(points);
  const front = getLotFrontDirection(verts, frontEdgeIndex);
  let areaPos = placeAreaOnCenterlineRatio(
    verts,
    front,
    frontEdgeIndex,
    placedZones,
    badgePos,
    AREA_CENTERLINE_DEPTH_RATIO_DEFAULT,
  );

  const usefulW = lotUsefulCrossWidthMm(verts, mainAxis);
  const avoid = [
    ...placedZones.map((z) => ({ pos: z.pos, radius: z.radius + 2 })),
    ...(badgePos ? [{ pos: badgePos, radius: LOT_BADGE_RADIUS_MM + 4 }] : []),
  ];
  const placement = resolveAreaLabelPlacement(verts, areaText, {
    crossWidthMm: usefulW,
    inwardDepthMm: front.maxInwardDepthMm,
    vertexCount: verts.length,
    narrow: mainAxis.narrow,
    avoid,
    fallbackPos: areaPos,
  });
  areaPos = placement.pos;
  const centerlineDist = minDistToPolygonRing(areaPos, verts);
  if (
    placement.edgeDist > centerlineDist + 1 ||
    centerlineDist < MIN_AREA_EDGE_CLEARANCE_MM
  ) {
    areaPos = placement.pos;
  }

  const lines = splitAreaLabelLines(areaText, usefulW, mainAxis.narrow);
  const areaFont = placement.fontSize;
  const perpRad = ((mainAxis.angleDeg + 90) * Math.PI) / 180;
  const lineStep = areaFont * 0.38;

  const needsCompact =
    placement.useBox ||
    placement.edgeDist < MIN_AREA_EDGE_CLEARANCE_MM ||
    minDistToPolygonEdges(areaPos, verts) < MIN_AREA_EDGE_CLEARANCE_MM;

  if (LOT_SHEET_SIGEF_LAYOUT && needsCompact && badgePos) {
    areaPos = [
      badgePos[0],
      badgePos[1] + LOT_BADGE_RADIUS_MM + areaFont * 0.75,
    ];
  }

  if (placement.useBox || needsCompact) {
    const boxW = Math.min(usefulW * 0.38, Math.max(20, areaText.length * 0.95));
    const boxH = areaFont * (lines.length > 1 ? 1.7 : 1.15);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(180, 200, 230);
    doc.setLineWidth(0.2);
    doc.rect(
      areaPos[0] - boxW / 2,
      areaPos[1] - boxH / 2,
      boxW,
      boxH,
      'FD',
    );
  }

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

  return { areaPos, areaFont };
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
  const sigef = LOT_SHEET_SIGEF_LAYOUT;
  const titleH = sigef ? 5 : 0;
  const headers = [
    'De',
    'Para',
    'Azimute',
    'Distância',
    sigef ? 'E(X)' : 'Coord. E(X)',
    sigef ? 'N(Y)' : 'Coord. N(Y)',
  ];
  const colWidths = [
    box.w * 0.08,
    box.w * 0.08,
    box.w * 0.18,
    box.w * 0.14,
    box.w * 0.26,
    box.w * 0.26,
  ];
  const rowH = sigef ? 5 : 4.6;
  const headerH = sigef ? 6 : 5.5;
  const tableTop = box.y + titleH;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.25);
  doc.rect(box.x, box.y, box.w, box.h);

  if (sigef) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('TABELA DE COORDENADAS', box.x + 3, box.y + 3.5);
    doc.setLineWidth(0.2);
    doc.line(box.x, box.y + titleH, box.x + box.w, box.y + titleH);
  }

  let x = box.x;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(sigef ? 6 : 6);
  headers.forEach((h, i) => {
    doc.rect(x, tableTop, colWidths[i], headerH);
    doc.text(h, x + colWidths[i] / 2, tableTop + 3.8, { align: 'center' });
    x += colWidths[i];
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(sigef ? 5.8 : 5.5);
  const maxRows = Math.min(
    rows.length,
    Math.floor((box.h - titleH - headerH) / rowH),
  );
  for (let ri = 0; ri < maxRows; ri++) {
    const row = rows[ri];
    const y = tableTop + headerH + ri * rowH;
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
      else doc.setFontSize(sigef ? 5.5 : 5.5);
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

  const titleSize = LOT_SHEET_CLEAN_SKETCH ? 6 : 5.2;
  const rowLabelSize = LOT_SHEET_CLEAN_SKETCH ? 5 : 4.3;
  const rowValueSize = LOT_SHEET_CLEAN_SKETCH ? 4.8 : 4.3;
  const rowGap = LOT_SHEET_CLEAN_SKETCH ? 5 : 4.2;
  const lineStep = LOT_SHEET_CLEAN_SKETCH ? 4.2 : 3.6;

  label(x + padX, y + padTop, 'CONFRONTAÇÕES', true, titleSize);
  let ly = y + padTop + (LOT_SHEET_CLEAN_SKETCH ? 6 : 5);
  const rows: [string, string][] = [
    ['Frente', confrontants.frente || '—'],
    ['Fundo', confrontants.fundo || '—'],
    ['Lado Direito', confrontants.ladoDireito || '—'],
    ['Lado Esquerdo', confrontants.ladoEsquerdo || '—'],
  ];
  const valueMaxW = w - padX * 2 - 22;
  for (const [k, v] of rows) {
    label(x + padX, ly, `${k}:`, false, rowLabelSize);
    const wrapped = wrapConfrontantText(v, 36, 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(
      wrapped.some((ln) => ln.length > 34) ? rowValueSize - 0.4 : rowValueSize,
    );
    let vly = ly;
    for (const line of wrapped) {
      const split = doc.splitTextToSize(line, valueMaxW) as string[];
      for (const sl of split) {
        doc.text(sl, x + padX + 20, vly);
        vly += lineStep;
      }
    }
    ly = Math.max(ly + rowGap, vly + 1);
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

  const sigLineY = y + h - 3;
  doc.setLineWidth(0.25);
  doc.line(leftX, sigLineY, leftX + innerW, sigLineY);

  let ly = contentTop;
  if (hasTechnicalResponsible(tech)) {
    ly = writeLines(leftX, ly, tech.name, leftW, 5.2, true);
    if (tech.title) {
      ly = writeLines(leftX, ly, tech.title, leftW, 4.8);
    }
    const registry = formatTechnicalRegistryLine(tech);
    if (registry) {
      ly = writeLines(leftX, ly, registry, leftW, 4.6);
    }
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
    doc.setLineWidth(0.2);
    doc.line(rightX, imgY + imgBoxH - 1, rightX + rightW, imgY + imgBoxH - 1);
    imgY += imgBoxH + 2;
  }

  if (stampBase64) {
    addPdfImageContained(doc, stampBase64, rightX, imgY, rightW, imgBoxH);
  } else {
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.2);
    doc.rect(rightX, imgY, rightW, imgBoxH, 'S');
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
    layout: LOT_SHEET_SIGEF_LAYOUT ? 'sigef_a4' : 'metrica_topo_a4',
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

  const gap = 2;
  const contentX = innerX + 3;
  const contentW = innerW - 6;

  const sigefRegions = LOT_SHEET_SIGEF_LAYOUT
    ? computeSigefPageRegions(
        pageW,
        pageH,
        input.metricRows.length,
        input.sideConfrontants,
      )
    : null;

  const bottomSplitH = 24;
  const footerH = 40;
  const scaleBandH = 9;
  const tableRowH = 4.6;
  const tableHeaderH = 5.5;
  const tableRows = Math.max(4, Math.min(input.metricRows.length, 12));
  const tableH = tableHeaderH + tableRows * tableRowH + 3;

  const bottomSplitBox: Box = sigefRegions
    ? sigefRegions.bottomSplit
    : {
        x: contentX,
        y: innerY + innerH - bottomSplitH - 1,
        w: contentW,
        h: bottomSplitH,
      };

  const footerBox: Box = sigefRegions
    ? sigefRegions.technical
    : {
        x: contentX,
        y: bottomSplitBox.y - gap - footerH,
        w: contentW,
        h: footerH,
      };

  const tableBox: Box = sigefRegions
    ? sigefRegions.coordinates
    : {
        x: contentX,
        y: footerBox.y - gap - tableH,
        w: contentW,
        h: tableH,
      };

  const scaleY = sigefRegions
    ? sigefRegions.sketchScaleBand.y + 2
    : tableBox.y - gap - scaleBandH;

  const mainTopY = innerY + 3;
  const mainAvailableH = tableBox.y - gap - mainTopY;
  const mainBox: Box = sigefRegions
    ? sigefRegions.sketch
    : {
        x: contentX,
        y: mainTopY,
        w: contentW,
        h: Math.max(120, mainAvailableH),
      };

  const confrontationsBox: SigefBox | null = sigefRegions
    ? sigefRegions.confrontations
    : null;

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

  let sigefScaleDrawBox: SigefBox | null = null;
  let scaleBandRect: LabelRect = sigefRegions
    ? {
        x: sigefRegions.sketchScaleBand.x,
        y: sigefRegions.sketchScaleBand.y,
        w: sigefRegions.sketchScaleBand.w,
        h: sigefRegions.sketchScaleBand.h,
        kind: 'scale',
      }
    : graphicScaleBandRect(contentX, scaleY, contentW);
  if (sigefRegions && confrontationsBox) {
    const lotBBox = polygonSheetBBox(sheetVerts);
    const scalePlan = resolveSigefGraphicScaleBox(
      sigefRegions.sketch,
      confrontationsBox,
      lotBBox,
    );
    sigefScaleDrawBox = scalePlan.box;
    scaleBandRect = {
      x: scalePlan.box.x - 1,
      y: scalePlan.box.y - 3,
      w: scalePlan.box.w + 2,
      h: scalePlan.box.h + 6,
      kind: 'scale',
    };
  }
  const placedRects: LabelRect[] = [scaleBandRect];

  // SIGEF: perímetro → vértices → medidas → nº lote → área (sem confrontantes no croqui)
  drawVertexMarkers(doc, sheetPts, placedRects);

  const vertexZones: PlacedLabelZone[] = placedRects
    .filter((r) => r.kind === 'vertex')
    .map((r) => ({
      pos: [r.x + r.w / 2, r.y + r.h / 2] as [number, number],
      radius: 6,
      kind: 'vertex',
    }));

  const measurePositions = placeDistanceLabelsInsideLot(
    doc,
    sheetPts,
    edgeLabels,
    frontEdge,
    mainAxis,
    vertexZones,
  );
  for (const p of measurePositions) {
    placedRects.push({
      x: p.x - 5,
      y: p.y - 3,
      w: 10,
      h: 6,
      kind: 'distance',
    });
  }

  const frontMeasurePos =
    measurePositions.find((p) => p.edgeIndex === frontEdge) ?? null;

  const placedZones: PlacedLabelZone[] = [
    ...measurePositions.map((p) => ({
      pos: [p.x, p.y] as [number, number],
      radius: 5,
      kind: 'distance',
    })),
    ...(frontMeasurePos
      ? [
          {
            pos: [frontMeasurePos.x, frontMeasurePos.y] as [number, number],
            radius: 5,
            kind: 'front_measure',
          },
        ]
      : []),
  ];

  let lotBadge: { badgePos: [number, number]; radius: number };
  let areaLabel: { areaPos: [number, number]; areaFont: number };

  if (LOT_SHEET_SIGEF_LAYOUT) {
    const usefulW = lotUsefulCrossWidthMm(sheetVerts, mainAxis);
    const front = getLotFrontDirection(sheetVerts, frontEdge);
    const numberArea = placeLotNumberAndArea(
      sheetVerts,
      input.measures.area,
      placedZones.map((z) => ({
        pos: z.pos,
        radius: z.radius,
        kind: z.kind,
      })),
      {
        crossWidthMm: usefulW,
        inwardDepthMm: front.maxInwardDepthMm,
        narrow: mainAxis.narrow,
        vertexCount: sheetVerts.length,
        frontEdgeIndex: frontEdge,
      },
    );
    const r = numberArea.badgeRadius;
    const areaLines = splitAreaLabelLines(
      input.measures.area,
      usefulW,
      mainAxis.narrow,
    );
    const areaLineH = numberArea.areaFontSize * 0.38;
    const perpRad = ((numberArea.areaAngleDeg + 90) * Math.PI) / 180;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(numberArea.areaFontSize);
    doc.setTextColor(...BLUE);
    if (areaLines.length === 1) {
      doc.text(areaLines[0], numberArea.areaPos[0], numberArea.areaPos[1], {
        align: 'center',
        baseline: 'middle',
        angle: numberArea.areaAngleDeg,
      });
    } else {
      areaLines.forEach((line, i) => {
        const off = (i - (areaLines.length - 1) / 2) * areaLineH;
        doc.text(
          line,
          numberArea.areaPos[0] + Math.cos(perpRad) * off,
          numberArea.areaPos[1] + Math.sin(perpRad) * off,
          {
            align: 'center',
            baseline: 'middle',
            angle: numberArea.areaAngleDeg,
          },
        );
      });
    }
    doc.setTextColor(...BLACK);

    doc.setDrawColor(...BLACK);
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(0.45);
    doc.circle(numberArea.badgePos[0], numberArea.badgePos[1], r, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(numberArea.badgeFontSize);
    doc.setTextColor(...RED);
    doc.text(lotNum, numberArea.badgePos[0], numberArea.badgePos[1] + 1.1, {
      align: 'center',
    });
    doc.setTextColor(...BLACK);

    lotBadge = { badgePos: numberArea.badgePos, radius: r };
    areaLabel = {
      areaPos: numberArea.areaPos,
      areaFont: numberArea.areaFontSize,
    };
  } else {
    lotBadge = placeLotNumberNearFront(
      doc,
      sheetPts,
      lotNum,
      frontEdge,
      placedZones,
    );
    areaLabel = placeAreaLabelCenter(
      doc,
      sheetPts,
      input.measures.area,
      mainAxis,
      frontEdge,
      lotBadge.badgePos,
      placedZones,
    );
  }

  placedZones.push({
    pos: lotBadge.badgePos,
    radius: lotBadge.radius + 2,
    kind: 'lot_badge',
  });
  placedRects.push({
    x: lotBadge.badgePos[0] - LOT_BADGE_RADIUS_MM,
    y: lotBadge.badgePos[1] - LOT_BADGE_RADIUS_MM,
    w: LOT_BADGE_RADIUS_MM * 2,
    h: LOT_BADGE_RADIUS_MM * 2,
    kind: 'lot_badge',
  });
  const areaW = Math.max(20, input.measures.area.length * 1.4);
  const areaH = areaLabel.areaFont * (splitAreaLabelLines(
    input.measures.area,
    lotUsefulCrossWidthMm(sheetVerts, mainAxis),
    mainAxis.narrow,
  ).length > 1 ? 1.8 : 1.1);
  placedRects.push({
    x: areaLabel.areaPos[0] - areaW / 2,
    y: areaLabel.areaPos[1] - areaH / 2,
    w: areaW,
    h: areaH,
    kind: 'area',
  });

  let streetPos: [number, number] | null = null;
  if (!LOT_SHEET_SIGEF_LAYOUT) {
    streetPos = drawFrontStreetLabel(
      doc,
      sheetPts,
      frontEdge,
      input.sideConfrontants.frente,
      mainBox,
      scaleBandRect,
      placedRects,
    );
    if (streetPos) {
      placedZones.push({
        pos: streetPos,
        radius: 7,
        kind: 'street',
      });
    }
    placeSideConfrontantLabels(
      doc,
      sheetPts,
      input.sketchSides ?? [],
      input.sideConfrontants.frente,
      mainBox,
      placedRects,
    );
  }

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
  if (sigefRegions) {
    drawCompassRose(
      doc,
      sigefRegions.compass.cx,
      sigefRegions.compass.cy,
      sigefRegions.compass.r,
    );
  } else {
    drawCompassRose(doc, mainBox.x + mainBox.w - 11, mainBox.y + 11, 7);
  }

  if (sigefScaleDrawBox) {
    drawSigefGraphicScale(doc, sigefScaleDrawBox, scaleDenom);
  } else if (sigefRegions) {
    drawSigefGraphicScale(doc, sigefRegions.sketchScaleBand, scaleDenom);
  } else {
    drawGraphicScale(
      doc,
      contentX,
      scaleY + 4,
      contentW,
      scaleDenom,
    );
  }

  if (confrontationsBox) {
    drawSigefConfrontationsPanel(
      doc,
      confrontationsBox,
      input.sideConfrontants,
    );
  }

  drawMetricTable(doc, tableBox, input.metricRows);

  if (LOT_SHEET_SIGEF_LAYOUT && sigefRegions) {
    drawSigefTechnicalPanel(
      doc,
      footerBox,
      buildSigefTechnicalData({
        projectName,
        quadra,
        lotNum,
        area: input.measures.area,
        scale: formatScaleLabel(input.scaleLabel),
        date: new Date().toLocaleDateString('pt-BR'),
        lot,
        owner: input.ownerDetails,
        tech: techProfile,
        logoBase64,
      }),
    );
  } else {
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
  }

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
