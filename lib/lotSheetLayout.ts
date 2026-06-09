/**
 * Layout da prancha PDF — medidas agrupadas, lados oficiais e confrontações.
 * Não altera cálculo GIS/memorial; apenas prepara dados de desenho.
 */

import {
  buildLotConfrontationAudit,
  confrontantsFromAudit,
  type LotConfrontationAudit,
} from '@/lib/assistedConfrontation';
import { concatDistinctSideConfrontants } from '@/lib/confrontantTypes';
import {
  getOfficialLotMeasurements,
  getOfficialLotSegmentTable,
  officialSegmentTableToEdgeLabels,
  parseOfficialSegmentsFromBlock,
  type OfficialLotMeasuresSides,
} from '@/lib/officialLotMeasurements';
import type { SideRole } from '@/lib/lotSegmentConfrontation';
import { getSegmentConfrontantRecord } from '@/lib/segmentConfrontantPersist';

export type LotSheetSketchSide = {
  role: SideRole;
  segmentIndexes: number[];
  representativeEdgeIndex: number;
  measureLabel: string;
  confrontantLabel: string;
};

export type LabelRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: string;
};

export type SketchBox = { x: number; y: number; w: number; h: number };

/** Prioridade visual no croqui (menor = desenhar antes). */
export const LOT_SHEET_VISUAL_PRIORITY = {
  perimeter: 1,
  vertices: 4,
  measures: 3,
  lotNumber: 2,
  area: 1,
  confrontants: 6,
} as const;

/** ETAPA 3.2 — croqui limpo: confrontações completas só no rodapé. */
export const LOT_SHEET_CLEAN_SKETCH = true;

/** Máximo de caracteres para confrontante/logradouro no croqui. */
export const SKETCH_LABEL_MAX_CHARS = 12;

const MIN_AREA_EDGE_CLEARANCE_MM = 7;

/** Confrontantes que devem aparecer apenas no quadro CONFRONTAÇÕES. */
const SKETCH_FOOTER_ONLY_PATTERNS = [
  'app',
  'faixa de dominio',
  'propriedade particular',
];

const SIDE_ROLE_MAP: [keyof OfficialLotMeasuresSides, SideRole][] = [
  ['front', 'frente'],
  ['back', 'fundo'],
  ['right', 'ladoDireito'],
  ['left', 'ladoEsquerdo'],
];

function formatMeasureM(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return '—';
  return `${val.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m`;
}

function segmentDistanceMap(
  block: Record<string, unknown>,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const seg of parseOfficialSegmentsFromBlock(block)) {
    map.set(seg.segment_index, seg.distance);
  }
  return map;
}

function pickRepresentativeSegmentIndex(
  indexes: number[],
  distances: Map<number, number>,
): number {
  if (!indexes.length) return 0;
  let best = indexes[0];
  let bestLen = -1;
  for (const idx of indexes) {
    const d = distances.get(idx) ?? 0;
    if (d > bestLen) {
      bestLen = d;
      best = idx;
    }
  }
  return best;
}

/**
 * Rótulos por aresta: total oficial do lado no segmento representativo;
 * demais segmentos do mesmo lado ficam vazios (sem duplicar medida quebrada).
 */
export function buildGroupedOfficialEdgeLabels(
  block: Record<string, unknown>,
  edgeCount: number,
  project?: Record<string, unknown> | null,
): string[] {
  const table = getOfficialLotSegmentTable(block, project);
  const perSegment = officialSegmentTableToEdgeLabels(table, edgeCount);
  const measures = getOfficialLotMeasurements(block, block.number);
  const sides = measures.sides;
  if (!sides) return perSegment;

  const distances = segmentDistanceMap(block);
  const labels = Array<string>(edgeCount).fill('');
  const claimed = new Set<number>();

  for (const [sideKey] of SIDE_ROLE_MAP) {
    const side = sides[sideKey];
    const indexes = side.segmentIndexes ?? [];
    if (!indexes.length) continue;
    const rep = pickRepresentativeSegmentIndex(indexes, distances);
    if (rep >= 0 && rep < edgeCount) {
      labels[rep] = formatMeasureM(side.total);
    }
    for (const idx of indexes) claimed.add(idx);
  }

  for (let i = 0; i < edgeCount; i++) {
    if (labels[i]) continue;
    if (claimed.has(i)) continue;
    const fallback = perSegment[i];
    if (fallback && fallback !== '—') labels[i] = fallback;
  }

  return labels;
}

/** Confrontante do lado — manual por segmento tem prioridade; múltiplos com " / ". */
export function formatSideConfrontantForSheet(
  block: Record<string, unknown>,
  audit: LotConfrontationAudit | null,
  role: SideRole,
  segmentIndexes: number[],
): string {
  if (!audit) return '—';
  const manualLabels: string[] = [];
  for (const idx of segmentIndexes) {
    const edge = audit.segmentEdges.find((e) => e.segmentIndex === idx);
    if (edge?.status === 'manual' && edge.confrontant) {
      manualLabels.push(edge.confrontant);
      continue;
    }
    const rec = getSegmentConfrontantRecord(block, idx);
    if (rec?.confrontant_source === 'manual' && rec.confrontant) {
      manualLabels.push(rec.confrontant);
    }
  }
  if (manualLabels.length) {
    return concatDistinctSideConfrontants(manualLabels);
  }
  return (
    audit.confrontants[role] || audit.sides[role]?.label || '—'
  );
}

export function buildLotSheetSketchSides(
  block: Record<string, unknown>,
  audit: LotConfrontationAudit | null,
): LotSheetSketchSide[] {
  const measures = getOfficialLotMeasurements(block, block.number);
  const sides = measures.sides;
  const distances = segmentDistanceMap(block);
  const out: LotSheetSketchSide[] = [];

  for (const [sideKey, role] of SIDE_ROLE_MAP) {
    const side = sides?.[sideKey];
    const indexes = side?.segmentIndexes ?? [];
    if (!indexes.length) continue;
    const rep = pickRepresentativeSegmentIndex(indexes, distances);
    out.push({
      role,
      segmentIndexes: indexes,
      representativeEdgeIndex: rep,
      measureLabel: formatMeasureM(side?.total ?? null),
      confrontantLabel: formatSideConfrontantForSheet(
        block,
        audit,
        role,
        indexes,
      ),
    });
  }
  return out;
}

export function normalizeConfrontantKey(text: string): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Evita repetir o mesmo logradouro/confrontante em vários lados do croqui.
 * Frente é desenhada separadamente; rodapé mantém todos os lados.
 */
export function filterSketchSidesForMapLabels(
  sketchSides: LotSheetSketchSide[],
  frontStreet: string,
): LotSheetSketchSide[] {
  const frontKey = normalizeConfrontantKey(frontStreet);
  const seen = new Set<string>();
  const out: LotSheetSketchSide[] = [];

  for (const side of sketchSides) {
    if (side.role === 'frente') continue;
    const key = normalizeConfrontantKey(side.confrontantLabel);
    if (!key || key === '—' || key.includes('a definir')) continue;
    if (frontKey && key === frontKey) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(side);
  }
  return out;
}

/** Confrontante reservado ao rodapé (APP, faixa de domínio, propriedade particular…). */
export function isFooterOnlyConfrontant(text: string): boolean {
  const key = normalizeConfrontantKey(text);
  if (!key) return false;
  return SKETCH_FOOTER_ONLY_PATTERNS.some((pat) => key.includes(pat));
}

/** Indica se o confrontante pode ser desenhado no croqui (modo clean). */
export function shouldDrawConfrontantInSketch(text: string): boolean {
  if (!LOT_SHEET_CLEAN_SKETCH) return true;
  const raw = String(text || '').trim();
  if (!raw || raw === '—') return false;
  if (raw.length > SKETCH_LABEL_MAX_CHARS) return false;
  if (isFooterOnlyConfrontant(raw)) return false;
  return true;
}

/** Lados do croqui no modo clean — confrontações completas só no rodapé. */
export function filterSketchSidesForCleanMap(
  sketchSides: LotSheetSketchSide[],
  frontStreet: string,
): LotSheetSketchSide[] {
  if (!LOT_SHEET_CLEAN_SKETCH) {
    return filterSketchSidesForMapLabels(sketchSides, frontStreet);
  }
  void sketchSides;
  void frontStreet;
  return [];
}

/** Logradouro principal no croqui — somente se couber com segurança. */
export function shouldDrawStreetInSketch(
  streetName: string,
  plan: StreetLabelPlan | null,
  scaleBandRect: LabelRect | null,
  sketchBox: SketchBox,
): boolean {
  if (!LOT_SHEET_CLEAN_SKETCH) return true;
  const name = String(streetName || '').trim();
  if (!name || name === '—' || !plan) return false;
  if (name.length > SKETCH_LABEL_MAX_CHARS) return false;
  if (isFooterOnlyConfrontant(name)) return false;

  const rect: LabelRect = {
    x: plan.x - plan.maxWidth / 2,
    y: plan.y - plan.fontSize * 0.45,
    w: plan.maxWidth,
    h: plan.fontSize * 1.4,
    kind: 'street',
  };
  const cleared = resolveLabelClearOfScaleBand(
    rect,
    scaleBandRect,
    sketchBox,
    4,
  );
  if (scaleBandRect && rectsOverlap(cleared, scaleBandRect, 2)) return false;
  return true;
}

function ringCentroid(verts: [number, number][]): [number, number] {
  let sx = 0;
  let sy = 0;
  const n = verts.length || 1;
  for (const [x, y] of verts) {
    sx += x;
    sy += y;
  }
  return [sx / n, sy / n];
}

export function pointInsideRing(
  x: number,
  y: number,
  ring: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function minDistToPolygonRing(
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

/** Índice de afastamento alternado para vértices próximos (stagger). */
export function vertexLabelStaggerIndex(
  vertexIndex: number,
  verts: [number, number][],
  proximityMm = LOT_SHEET_CLEAN_SKETCH ? 18 : 14,
): number {
  const v = verts[vertexIndex];
  if (!v) return 0;
  let close = 0;
  for (let j = 0; j < vertexIndex; j++) {
    const o = verts[j];
    if (!o) continue;
    if (Math.hypot(v[0] - o[0], v[1] - o[1]) < proximityMm) close++;
  }
  return close;
}

export type AreaFontInput = {
  crossWidthMm: number;
  inwardDepthMm: number;
  vertexCount: number;
  areaText: string;
  narrow: boolean;
};

/** Fonte da área azul — reduz em lotes estreitos/irregulares (modo clean: teto menor). */
export function resolveAreaFontSize(input: AreaFontInput): number {
  const maxPt = LOT_SHEET_CLEAN_SKETCH ? 16 : 20;
  const baseNormal = LOT_SHEET_CLEAN_SKETCH ? 15 : 17;
  const baseNarrow = LOT_SHEET_CLEAN_SKETCH ? 12 : 14;
  let size = input.narrow ? baseNarrow : baseNormal;
  if (input.vertexCount > 4) size -= 1;
  if (input.vertexCount > 6) size -= 1;
  if (input.crossWidthMm < 38) size -= 1;
  if (input.crossWidthMm < 28) size -= 2;
  if (input.inwardDepthMm < 28) size -= 1;
  const digits = input.areaText.replace(/\D/g, '').length;
  if (digits > 5) size -= 1;
  if (digits > 7) size -= 1;
  return Math.max(10, Math.min(size, maxPt));
}

/** Fonte do número do lote (sempre menor que a área). */
export const LOT_BADGE_FONT_SIZE_PT = 10;

export type LotMainAxisLayout = {
  center: [number, number];
  axisDx: number;
  axisDy: number;
  angleDeg: number;
  narrow: boolean;
  longestEdgeMm: number;
  crossWidthMm: number;
};

function readableAxisAngleDeg(dx: number, dy: number): number {
  let angleDeg = (-Math.atan2(dy, dx) * 180) / Math.PI;
  while (angleDeg > 90) angleDeg -= 180;
  while (angleDeg <= -90) angleDeg += 180;
  return angleDeg;
}

function lotSpanExtent(
  verts: [number, number][],
  axisDx: number,
  axisDy: number,
  origin: [number, number],
): number {
  let minT = Infinity;
  let maxT = -Infinity;
  for (const v of verts) {
    const t = (v[0] - origin[0]) * axisDx + (v[1] - origin[1]) * axisDy;
    minT = Math.min(minT, t);
    maxT = Math.max(maxT, t);
  }
  return maxT - minT;
}

/** Eixo longitudinal — maior aresta + PCA como reforço em lotes irregulares. */
export function computeLotMainAxis(verts: [number, number][]): LotMainAxisLayout {
  const center = ringCentroid(verts);
  let longestEdgeMm = 0;
  let axisDx = 1;
  let axisDy = 0;

  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % n];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy);
    if (len > longestEdgeMm) {
      longestEdgeMm = len;
      axisDx = dx / (len || 1);
      axisDy = dy / (len || 1);
    }
  }

  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (const v of verts) {
    const dx = v[0] - center[0];
    const dy = v[1] - center[1];
    cxx += dx * dx;
    cyy += dy * dy;
    cxy += dx * dy;
  }
  const count = Math.max(1, n);
  cxx /= count;
  cyy /= count;
  cxy /= count;
  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const lambda1 = trace / 2 + Math.sqrt(Math.max(0, (trace / 2) ** 2 - det));
  let pcaDx = cxy;
  let pcaDy = lambda1 - cxx;
  const pcaLen = Math.hypot(pcaDx, pcaDy);
  if (pcaLen > 1e-6) {
    pcaDx /= pcaLen;
    pcaDy /= pcaLen;
    const dot = Math.abs(axisDx * pcaDx + axisDy * pcaDy);
    if (dot < 0.55) {
      axisDx = pcaDx;
      axisDy = pcaDy;
    }
  }

  const crossDx = -axisDy;
  const crossDy = axisDx;
  const crossWidthMm = lotSpanExtent(verts, crossDx, crossDy, center);

  return {
    center,
    axisDx,
    axisDy,
    angleDeg: readableAxisAngleDeg(axisDx, axisDy),
    narrow: crossWidthMm < 38,
    longestEdgeMm,
    crossWidthMm,
  };
}

function estimateRotatedTextExtents(
  text: string,
  fontSize: number,
  angleDeg: number,
): { halfW: number; halfH: number } {
  const charW = fontSize * 0.48;
  const w = Math.max(fontSize * 2, text.length * charW);
  const h = fontSize * 1.15;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    halfW: cos * (w / 2) + sin * (h / 2),
    halfH: sin * (w / 2) + cos * (h / 2),
  };
}

export type AreaLabelPlacement = {
  pos: [number, number];
  fontSize: number;
  useBox: boolean;
  edgeDist: number;
};

/** Posição da área — interior seguro ou caixa central deslocada. */
export function resolveAreaLabelPlacement(
  verts: [number, number][],
  areaText: string,
  options: {
    crossWidthMm: number;
    inwardDepthMm: number;
    vertexCount: number;
    narrow: boolean;
    avoid?: { pos: [number, number]; radius: number }[];
    fallbackPos?: [number, number];
  },
): AreaLabelPlacement {
  const fontSize = resolveAreaFontSize({
    crossWidthMm: options.crossWidthMm,
    inwardDepthMm: options.inwardDepthMm,
    vertexCount: options.vertexCount,
    areaText,
    narrow: options.narrow,
  });

  const freeCenter = findBestInteriorLabelPosition(verts, {
    minEdgeDist: MIN_AREA_EDGE_CLEARANCE_MM,
    avoid: options.avoid,
  });
  let edgeDist = minDistToPolygonRing(freeCenter, verts);
  let pos = freeCenter;
  let useBox = false;

  if (edgeDist < MIN_AREA_EDGE_CLEARANCE_MM) {
    const relaxed = findBestInteriorLabelPosition(verts, {
      minEdgeDist: 3,
      avoid: options.avoid,
    });
    edgeDist = minDistToPolygonRing(relaxed, verts);
    pos = relaxed;
    useBox = true;
  }

  if (edgeDist < 3 && options.fallbackPos) {
    pos = options.fallbackPos;
    useBox = true;
  }

  if (useBox && edgeDist < 2) {
    pos = ringCentroid(verts);
  }

  return { pos, fontSize, useBox, edgeDist };
}

/** Melhor posição interior — maximiza distância às divisas e evita colisões. */
export function findBestInteriorLabelPosition(
  verts: [number, number][],
  options?: {
    minEdgeDist?: number;
    avoid?: { pos: [number, number]; radius: number }[];
  },
): [number, number] {
  const minEdge = options?.minEdgeDist ?? MIN_AREA_EDGE_CLEARANCE_MM;
  if (verts.length < 3) return ringCentroid(verts);

  const xs = verts.map((v) => v[0]);
  const ys = verts.map((v) => v[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const steps = 14;
  let best = ringCentroid(verts);
  let bestScore = -Infinity;

  for (let xi = 1; xi < steps; xi++) {
    for (let yi = 1; yi < steps; yi++) {
      const x = minX + (xi / steps) * (maxX - minX);
      const y = minY + (yi / steps) * (maxY - minY);
      if (!pointInsideRing(x, y, verts)) continue;
      let score = minDistToPolygonRing([x, y], verts);
      if (score < minEdge) continue;
      for (const a of options?.avoid ?? []) {
        const d = Math.hypot(x - a.pos[0], y - a.pos[1]);
        if (d < a.radius) score -= (a.radius - d) * 3;
      }
      if (score > bestScore) {
        bestScore = score;
        best = [x, y];
      }
    }
  }
  return best;
}

export function resolveLabelClearOfScaleBand(
  rect: LabelRect,
  scaleBand: LabelRect | null,
  sketchBox: SketchBox,
  gap = 3,
): LabelRect {
  if (!scaleBand || !rectsOverlap(rect, scaleBand, gap)) return rect;
  const next = { ...rect };
  next.y = scaleBand.y - next.h - gap;
  next.x = Math.min(
    next.x,
    scaleBand.x + scaleBand.w * 0.38 - next.w / 2,
  );
  const cx = next.x + next.w / 2;
  const cy = next.y + next.h / 2;
  const [cx2, cy2] = clampPointToBox(cx, cy, sketchBox, 4);
  next.x = cx2 - next.w / 2;
  next.y = cy2 - next.h / 2;
  return next;
}

export function buildLotSheetConfrontantsFromAudit(
  audit: LotConfrontationAudit | null,
): {
  frente: string;
  fundo: string;
  ladoDireito: string;
  ladoEsquerdo: string;
} {
  return confrontantsFromAudit(audit);
}

/** Quebra confrontante longo para caixa da prancha (rodapé). */
export function wrapConfrontantText(
  text: string,
  maxCharsPerLine = 42,
  maxLines = 3,
): string[] {
  const raw = String(text || '').trim();
  if (!raw || raw === '—') return ['—'];
  if (raw.length <= maxCharsPerLine) return [raw];

  const parts = raw.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) lines.push(current.trim());
    current = '';
  };

  for (const part of parts) {
    const candidate = current ? `${current} / ${part}` : part;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      flush();
      if (part.length <= maxCharsPerLine) {
        current = part;
      } else {
        let rest = part;
        while (rest.length > maxCharsPerLine && lines.length < maxLines) {
          let cut = maxCharsPerLine;
          const space = rest.lastIndexOf(' ', cut);
          if (space > maxCharsPerLine * 0.45) cut = space;
          lines.push(rest.slice(0, cut).trim());
          rest = rest.slice(cut).trim();
        }
        if (rest && lines.length < maxLines) lines.push(rest);
        current = '';
      }
    }
    if (lines.length >= maxLines) break;
  }
  flush();
  if (!lines.length) return [raw.slice(0, maxCharsPerLine)];
  return lines.slice(0, maxLines);
}

export function clampPointToBox(
  x: number,
  y: number,
  box: SketchBox,
  margin = 2,
): [number, number] {
  return [
    Math.min(Math.max(x, box.x + margin), box.x + box.w - margin),
    Math.min(Math.max(y, box.y + margin), box.y + box.h - margin),
  ];
}

export function rectsOverlap(
  a: LabelRect,
  b: LabelRect,
  gap = 1.5,
): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

/** Desloca ponto até não colidir com retângulos já colocados. */
export function resolvePointAvoidingRects(
  x: number,
  y: number,
  w: number,
  h: number,
  placed: LabelRect[],
  box: SketchBox,
  maxPasses = 12,
): [number, number] {
  let cx = x;
  let cy = y;
  const halfW = w / 2;
  const halfH = h / 2;

  for (let pass = 0; pass < maxPasses; pass++) {
    const rect: LabelRect = {
      x: cx - halfW,
      y: cy - halfH,
      w,
      h,
    };
    let hit = false;
    for (const other of placed) {
      if (rectsOverlap(rect, other)) {
        hit = true;
        const dx = cx - (other.x + other.w / 2);
        const dy = cy - (other.y + other.h / 2);
        const len = Math.hypot(dx, dy) || 1;
        cx += (dx / len) * 2.5;
        cy += (dy / len) * 2.5;
        [cx, cy] = clampPointToBox(cx, cy, box, 2);
        break;
      }
    }
    if (!hit) break;
  }
  return [cx, cy];
}

export type StreetLabelPlan = {
  x: number;
  y: number;
  fontSize: number;
  maxWidth: number;
  angleDeg: number;
};

/** Plano do logradouro — dentro da prancha, evita faixa da escala gráfica. */
export function planFrontStreetLabel(
  edgeMid: [number, number],
  edgeExNx: number,
  edgeExNy: number,
  edgeAngleDeg: number,
  edgeLenMm: number,
  sketchBox: SketchBox,
  scaleBandRect: LabelRect | null,
  narrow: boolean,
): StreetLabelPlan {
  const fontSizes = narrow ? [11, 10, 9, 8] : [13, 12, 11, 10];
  const baseOffset = narrow ? 30 : 36;
  const maxWidth = Math.min(
    sketchBox.w * 0.38,
    Math.max(24, edgeLenMm * 0.8),
  );

  for (const offset of [baseOffset, baseOffset + 8, baseOffset + 14, baseOffset + 20]) {
    for (const fontSize of fontSizes) {
      let x = edgeMid[0] + edgeExNx * offset;
      let y = edgeMid[1] + edgeExNy * offset;
      [x, y] = clampPointToBox(x, y, sketchBox, 4);
      let rect: LabelRect = {
        x: x - maxWidth / 2,
        y: y - fontSize * 0.4,
        w: maxWidth,
        h: fontSize * (1 + 0.35),
      };
      rect = resolveLabelClearOfScaleBand(rect, scaleBandRect, sketchBox, 4);
      if (scaleBandRect && rectsOverlap(rect, scaleBandRect, 2)) continue;
      return {
        x: rect.x + rect.w / 2,
        y: rect.y + rect.h / 2,
        fontSize,
        maxWidth,
        angleDeg: edgeAngleDeg,
      };
    }
  }

  const [x, y] = clampPointToBox(
    edgeMid[0] + edgeExNx * baseOffset,
    edgeMid[1] + edgeExNy * baseOffset,
    sketchBox,
    3,
  );
  return {
    x,
    y,
    fontSize: fontSizes[fontSizes.length - 1],
    maxWidth,
    angleDeg: edgeAngleDeg,
  };
}

export function graphicScaleBandRect(
  contentX: number,
  scaleY: number,
  contentW: number,
): LabelRect {
  return {
    x: contentX - 1,
    y: scaleY - 2,
    w: contentW + 2,
    h: 14,
    kind: 'scale',
  };
}

/** ETAPA 4.1/4.2 — anti-colisão e espaçamento SIGEF (somente layout). */
export const MEASURE_LABEL_INTERNAL_OFFSET_MM = 6;
export const MEASURE_LABEL_EXTERNAL_OFFSET_MM = 5;
export const MEASURE_LABEL_MIN_EDGE_CLEARANCE_MM = 6;
export const LOT_NUMBER_AREA_MIN_GAP_MM = 10;
export const LOT_NUMBER_AREA_MAX_GAP_MM = 14;
export const VERTEX_LABEL_MIN_SPACING_MM = 15;
/** Profundidade do número do lote a partir da frente oficial (10%). */
export const LOT_FRONT_BADGE_DEPTH_FRACTION = 0.1;

export type LotFrontLayoutContext = {
  frontMid: [number, number];
  inwardNx: number;
  inwardNy: number;
  maxInwardDepthMm: number;
};

type SheetEdgeGeometry = {
  mid: [number, number];
  inNx: number;
  inNy: number;
  exNx: number;
  exNy: number;
};

function edgeGeometryAt(
  verts: [number, number][],
  index: number,
): SheetEdgeGeometry {
  const n = verts.length;
  const i = ((index % n) + n) % n;
  const p1 = verts[i];
  const p2 = verts[(i + 1) % n];
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1e-12;
  const mid: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const exNx = dy / len;
  const exNy = -dx / len;
  let inNx = -exNx;
  let inNy = -exNy;
  const probe: [number, number] = [mid[0] + inNx * 2, mid[1] + inNy * 2];
  if (!pointInsideRing(probe[0], probe[1], verts)) {
    inNx = exNx;
    inNy = exNy;
  }
  return { mid, inNx, inNy, exNx, exNy };
}

/** Frente oficial → ponto médio + normal interna + profundidade útil. */
export function computeLotFrontLayoutContext(
  verts: [number, number][],
  frontEdgeIndex: number,
): LotFrontLayoutContext {
  const edge = edgeGeometryAt(verts, frontEdgeIndex);
  let maxInwardDepthMm = 0;
  for (const v of verts) {
    const d =
      (v[0] - edge.mid[0]) * edge.inNx + (v[1] - edge.mid[1]) * edge.inNy;
    if (d > maxInwardDepthMm) maxInwardDepthMm = d;
  }
  if (maxInwardDepthMm < 8) maxInwardDepthMm = 8;
  return {
    frontMid: edge.mid,
    inwardNx: edge.inNx,
    inwardNy: edge.inNy,
    maxInwardDepthMm,
  };
}

export type MeasureLabelEdgeInput = {
  mid: [number, number];
  p1: [number, number];
  p2: [number, number];
  inNx: number;
  inNy: number;
  exNx: number;
  exNy: number;
};

export type MeasureLabelZone = {
  pos: [number, number];
  radius: number;
  kind?: string;
};

function perpendicularDistanceToMeasureEdge(
  pos: [number, number],
  edge: MeasureLabelEdgeInput,
): number {
  const dx = edge.p2[0] - edge.p1[0];
  const dy = edge.p2[1] - edge.p1[1];
  const len = Math.hypot(dx, dy) || 1e-12;
  return (
    Math.abs(
      dy * pos[0] -
        dx * pos[1] +
        edge.p2[0] * edge.p1[1] -
        edge.p2[1] * edge.p1[0],
    ) / len
  );
}

function measureLabelHitsZones(
  x: number,
  y: number,
  radius: number,
  placed: MeasureLabelZone[],
  minGap = 2,
): boolean {
  for (const z of placed) {
    if (Math.hypot(x - z.pos[0], y - z.pos[1]) < radius + z.radius + minGap) {
      return true;
    }
  }
  return false;
}

/**
 * Posição da medida: offset interno 5 mm → externo 5 mm → rotação 180° se colidir.
 */
export function resolveMeasureLabelPosition(
  edge: MeasureLabelEdgeInput,
  polygon: [number, number][],
  placedZones: MeasureLabelZone[],
  options?: {
    labelRadius?: number;
    minEdgeClearance?: number;
    edgeLenMm?: number;
    /** SIGEF: medidas sempre dentro do lote (sem offset externo). */
    forceInternalOnly?: boolean;
  },
): {
  x: number;
  y: number;
  offsetUsed: number;
  side: 'in' | 'out';
  rotated: boolean;
} {
  const labelRadius = options?.labelRadius ?? 5;
  const minClear =
    options?.minEdgeClearance ?? MEASURE_LABEL_MIN_EDGE_CLEARANCE_MM;
  const shortEdge = (options?.edgeLenMm ?? 999) < 22;
  const forceInternal = options?.forceInternalOnly === true;
  const internalOffsets = shortEdge
    ? [6, 7, 8, 9, 10, 12, 14]
    : [6, 7, 8, 9, 10, 11, 12, 14];
  const externalOffsets = shortEdge
    ? [8, 10, 12, 14, 16, 18]
    : [5, 6, 7, 8, 10, 12, 14];

  const tryCandidate = (
    nx: number,
    ny: number,
    off: number,
    requireInside: boolean,
    side: 'in' | 'out',
    rotated: boolean,
  ) => {
    const x = edge.mid[0] + nx * off;
    const y = edge.mid[1] + ny * off;
    const inside = pointInsideRing(x, y, polygon);
    if (requireInside && !inside) return null;
    if (!requireInside && inside) return null;
    if (perpendicularDistanceToMeasureEdge([x, y], edge) < minClear) return null;
    if (measureLabelHitsZones(x, y, labelRadius, placedZones)) return null;
    return { x, y, offsetUsed: off, side, rotated };
  };

  const normalSets: Array<{
    inNx: number;
    inNy: number;
    exNx: number;
    exNy: number;
    rotated: boolean;
  }> = [
    {
      inNx: edge.inNx,
      inNy: edge.inNy,
      exNx: edge.exNx,
      exNy: edge.exNy,
      rotated: false,
    },
    {
      inNx: -edge.inNx,
      inNy: -edge.inNy,
      exNx: -edge.exNx,
      exNy: -edge.exNy,
      rotated: true,
    },
  ];

  for (const normals of normalSets) {
    const tryOrder = forceInternal
      ? ([['in', internalOffsets, true] as const] as const)
      : shortEdge
        ? ([
            ['ex', externalOffsets, false] as const,
            ['in', internalOffsets, true] as const,
          ] as const)
        : ([
            ['in', internalOffsets, true] as const,
            ['ex', externalOffsets, false] as const,
          ] as const);
    for (const [kind, offsets, inside] of tryOrder) {
      for (const off of offsets) {
        const hit = tryCandidate(
          kind === 'in' ? normals.inNx : normals.exNx,
          kind === 'in' ? normals.inNy : normals.exNy,
          off,
          inside,
          inside ? 'in' : 'out',
          normals.rotated,
        );
        if (hit) return hit;
      }
    }
  }

  const fallbackNx = forceInternal ? edge.inNx : edge.exNx;
  const fallbackNy = forceInternal ? edge.inNy : edge.exNy;
  const fallbackOff = forceInternal
    ? internalOffsets[internalOffsets.length - 1]
    : MEASURE_LABEL_EXTERNAL_OFFSET_MM;
  return {
    x: edge.mid[0] + fallbackNx * fallbackOff,
    y: edge.mid[1] + fallbackNy * fallbackOff,
    offsetUsed: fallbackOff,
    side: forceInternal ? 'in' : 'out',
    rotated: false,
  };
}

export type LotNumberAreaLayout = {
  badgePos: [number, number];
  badgeRadius: number;
  badgeFontSize: number;
  areaPos: [number, number];
  areaFontSize: number;
  areaAngleDeg: number;
  numberAreaGapMm: number;
  useCombinedBox: boolean;
  areaInsidePolygon: boolean;
};

function areaPositionSafe(
  verts: [number, number][],
  pos: [number, number],
  placedZones: MeasureLabelZone[],
  minEdge = 5,
): boolean {
  if (!pointInsideRing(pos[0], pos[1], verts)) return false;
  if (minDistToPolygonRing(pos, verts) < minEdge) return false;
  if (measureLabelHitsZones(pos[0], pos[1], 10, placedZones, 5)) return false;
  return true;
}

function badgePositionSafe(
  verts: [number, number][],
  pos: [number, number],
  radius: number,
  placedZones: MeasureLabelZone[],
): boolean {
  if (!pointInsideRing(pos[0], pos[1], verts)) return false;
  if (minDistToPolygonRing(pos, verts) < radius + 3) return false;
  if (measureLabelHitsZones(pos[0], pos[1], radius + 2, placedZones, 4)) {
    return false;
  }
  return true;
}

function nudgeBadgeFromFront(
  verts: [number, number][],
  front: LotFrontLayoutContext,
  start: [number, number],
  badgeRadius: number,
  placedZones: MeasureLabelZone[],
): [number, number] {
  const depthSteps = [0, 0.02, 0.04, 0.06, 0.08, -0.02, 0.1, 0.12];
  const lateral = [0, -3, 3, -5, 5];
  const baseDepth =
    (start[0] - front.frontMid[0]) * front.inwardNx +
    (start[1] - front.frontMid[1]) * front.inwardNy;

  for (const ld of depthSteps) {
    for (const lx of lateral) {
      const depth = Math.max(4, Math.min(front.maxInwardDepthMm * 0.45, baseDepth + front.maxInwardDepthMm * ld));
      const perpNx = -front.inwardNy;
      const perpNy = front.inwardNx;
      const candidate: [number, number] = [
        front.frontMid[0] + front.inwardNx * depth + perpNx * lx,
        front.frontMid[1] + front.inwardNy * depth + perpNy * lx,
      ];
      if (badgePositionSafe(verts, candidate, badgeRadius, placedZones)) {
        return candidate;
      }
    }
  }
  return start;
}

function primaryAreaPositionSafe(
  verts: [number, number][],
  pos: [number, number],
  textExtents: { halfW: number; halfH: number },
  placedZones: MeasureLabelZone[],
  minEdge = MIN_AREA_EDGE_CLEARANCE_MM,
): boolean {
  if (!pointInsideRing(pos[0], pos[1], verts)) return false;
  const edgeDist = minDistToPolygonRing(pos, verts);
  const need = Math.max(textExtents.halfW, textExtents.halfH) + minEdge - 2;
  if (edgeDist < need) return false;
  const zoneRadius = Math.hypot(textExtents.halfW, textExtents.halfH) + 2;
  if (measureLabelHitsZones(pos[0], pos[1], zoneRadius, placedZones, 4)) {
    return false;
  }
  return true;
}

function findBestPrimaryAreaPosition(
  verts: [number, number][],
  areaText: string,
  fontSize: number,
  mainAxis: LotMainAxisLayout,
  placedZones: MeasureLabelZone[],
): [number, number] {
  const extents = estimateRotatedTextExtents(
    areaText,
    fontSize,
    mainAxis.angleDeg,
  );
  const centroid = ringCentroid(verts);
  const xs = verts.map((v) => v[0]);
  const ys = verts.map((v) => v[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const steps = 16;
  const perpDx = -mainAxis.axisDy;
  const perpDy = mainAxis.axisDx;

  const seeds: [number, number][] = [
    centroid,
    mainAxis.center,
    findBestInteriorLabelPosition(verts, {
      minEdgeDist: MIN_AREA_EDGE_CLEARANCE_MM,
      avoid: placedZones.map((z) => ({ pos: z.pos, radius: z.radius + 2 })),
    }),
  ];

  for (let xi = 2; xi < steps - 1; xi++) {
    for (let yi = 2; yi < steps - 1; yi++) {
      seeds.push([
        minX + (xi / steps) * (maxX - minX),
        minY + (yi / steps) * (maxY - minY),
      ]);
    }
  }

  for (const shift of [-8, -4, 0, 4, 8, 12, -12]) {
    seeds.push([
      centroid[0] + mainAxis.axisDx * shift,
      centroid[1] + mainAxis.axisDy * shift,
    ]);
    seeds.push([
      centroid[0] + perpDx * shift,
      centroid[1] + perpDy * shift,
    ]);
  }

  let best = seeds[0] ?? centroid;
  let bestScore = -Infinity;

  for (const seed of seeds) {
    if (!pointInsideRing(seed[0], seed[1], verts)) continue;
    if (!primaryAreaPositionSafe(verts, seed, extents, placedZones)) continue;
    const edgeScore = minDistToPolygonRing(seed, verts);
    const centerDist = Math.hypot(
      seed[0] - centroid[0],
      seed[1] - centroid[1],
    );
    const score = edgeScore * 1.35 - centerDist * 0.08;
    if (score > bestScore) {
      bestScore = score;
      best = seed;
    }
  }

  return best;
}

function placeBadgeNearOfficialFront(
  verts: [number, number][],
  front: LotFrontLayoutContext,
  badgeRadius: number,
  placedZones: MeasureLabelZone[],
): [number, number] {
  const depthFracs = [
    LOT_FRONT_BADGE_DEPTH_FRACTION,
    0.12,
    0.08,
    0.14,
    0.16,
    0.06,
  ];
  const perpNx = -front.inwardNy;
  const perpNy = front.inwardNx;

  for (const frac of depthFracs) {
    for (const lx of [0, -3, 3, -5, 5, -8, 8]) {
      const candidate: [number, number] = [
        front.frontMid[0] +
          front.inwardNx * front.maxInwardDepthMm * frac +
          perpNx * lx,
        front.frontMid[1] +
          front.inwardNy * front.maxInwardDepthMm * frac +
          perpNy * lx,
      ];
      if (badgePositionSafe(verts, candidate, badgeRadius, placedZones)) {
        return nudgeBadgeFromFront(
          verts,
          front,
          candidate,
          badgeRadius,
          placedZones,
        );
      }
    }
  }

  return nudgeBadgeFromFront(
    verts,
    front,
    [
      front.frontMid[0] +
        front.inwardNx * front.maxInwardDepthMm * LOT_FRONT_BADGE_DEPTH_FRACTION,
      front.frontMid[1] +
        front.inwardNy * front.maxInwardDepthMm * LOT_FRONT_BADGE_DEPTH_FRACTION,
    ],
    badgeRadius,
    placedZones,
  );
}

/**
 * Área principal no centro livre (rotacionada no eixo longitudinal);
 * número secundário próximo à frente oficial.
 */
export function placeLotNumberAndArea(
  verts: [number, number][],
  areaText: string,
  placedZones: MeasureLabelZone[],
  options: {
    badgeRadius?: number;
    crossWidthMm: number;
    inwardDepthMm: number;
    narrow: boolean;
    vertexCount: number;
    minNumberAreaGapMm?: number;
    frontEdgeIndex: number;
  },
): LotNumberAreaLayout {
  const badgeRadius = options.badgeRadius ?? 5.5;
  const front = computeLotFrontLayoutContext(verts, options.frontEdgeIndex);
  const mainAxis = computeLotMainAxis(verts);
  const areaFontSize = Math.max(
    resolveAreaFontSize({
      crossWidthMm: options.crossWidthMm || mainAxis.crossWidthMm,
      inwardDepthMm: front.maxInwardDepthMm,
      vertexCount: options.vertexCount,
      areaText,
      narrow: options.narrow || mainAxis.narrow,
    }),
    LOT_BADGE_FONT_SIZE_PT + 2,
  );

  let badgePos = placeBadgeNearOfficialFront(
    verts,
    front,
    badgeRadius,
    placedZones,
  );

  const areaAvoidZones: MeasureLabelZone[] = [
    ...placedZones,
    { pos: badgePos, radius: badgeRadius + 8, kind: 'lot_badge' },
  ];

  let areaPos = findBestPrimaryAreaPosition(
    verts,
    areaText,
    areaFontSize,
    mainAxis,
    areaAvoidZones,
  );

  if (
    !primaryAreaPositionSafe(
      verts,
      areaPos,
      estimateRotatedTextExtents(areaText, areaFontSize, mainAxis.angleDeg),
      areaAvoidZones,
    )
  ) {
    const relaxed = resolveAreaLabelPlacement(verts, areaText, {
      crossWidthMm: options.crossWidthMm || mainAxis.crossWidthMm,
      inwardDepthMm: front.maxInwardDepthMm,
      vertexCount: options.vertexCount,
      narrow: options.narrow || mainAxis.narrow,
      avoid: areaAvoidZones.map((z) => ({ pos: z.pos, radius: z.radius + 2 })),
      fallbackPos: mainAxis.center,
    });
    areaPos = relaxed.pos;
  }

  const areaInsidePolygon = pointInsideRing(areaPos[0], areaPos[1], verts);
  const numberAreaGapMm = Math.hypot(
    areaPos[0] - badgePos[0],
    areaPos[1] - badgePos[1],
  );

  return {
    badgePos,
    badgeRadius,
    badgeFontSize: LOT_BADGE_FONT_SIZE_PT,
    areaPos,
    areaFontSize,
    areaAngleDeg: mainAxis.angleDeg,
    numberAreaGapMm,
    useCombinedBox: false,
    areaInsidePolygon,
  };
}

function placementFontEstimate(areaText: string): number {
  const digits = areaText.replace(/\D/g, '').length;
  if (digits > 7) return 5;
  if (digits > 5) return 4;
  return 3;
}

/** Espaçamento radial de vértices próximos — mínimo 15 mm (SIGEF). */
export function resolveVertexLabelSpacing(
  vertexIndex: number,
  verts: [number, number][],
  proximityMm = VERTEX_LABEL_MIN_SPACING_MM,
): number {
  return vertexLabelStaggerIndex(vertexIndex, verts, proximityMm);
}

/** Monta auditoria + lados do croqui a partir do block (testes e payload). */
export function buildSketchLayoutFromBlock(
  block: Record<string, unknown>,
  blockId: string,
  allBlocks: Record<string, unknown>[] = [block],
  streetGuides: Record<string, unknown>[] = [],
  project?: Record<string, unknown> | null,
  edgeCount?: number,
): {
  edgeLabels: string[];
  sketchSides: LotSheetSketchSide[];
  confrontants: ReturnType<typeof confrontantsFromAudit>;
  audit: LotConfrontationAudit;
} {
  const segs = parseOfficialSegmentsFromBlock(block);
  const count = edgeCount ?? segs.length;
  const audit = buildLotConfrontationAudit(
    block,
    blockId,
    allBlocks,
    streetGuides,
    project,
  );
  return {
    edgeLabels: buildGroupedOfficialEdgeLabels(block, count, project),
    sketchSides: buildLotSheetSketchSides(block, audit),
    confrontants: confrontantsFromAudit(audit),
    audit,
  };
}
