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
  const fontSizes = narrow ? [12, 11, 10, 9] : [14, 13, 12, 11];
  const baseOffset = narrow ? 24 : 30;
  const maxWidth = Math.min(
    sketchBox.w * 0.42,
    Math.max(28, edgeLenMm * 0.85),
  );

  for (const offset of [baseOffset, baseOffset + 6, baseOffset + 12]) {
    for (const fontSize of fontSizes) {
      let x = edgeMid[0] + edgeExNx * offset;
      let y = edgeMid[1] + edgeExNy * offset;
      [x, y] = clampPointToBox(x, y, sketchBox, 3);
      const rect: LabelRect = {
        x: x - maxWidth / 2,
        y: y - fontSize * 0.35,
        w: maxWidth,
        h: fontSize * 0.9,
      };
      if (scaleBandRect && rectsOverlap(rect, scaleBandRect, 2)) {
        y = scaleBandRect.y - fontSize * 0.5 - 2;
        [x, y] = clampPointToBox(x, y, sketchBox, 3);
      }
      return {
        x,
        y,
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
    x: contentX,
    y: scaleY - 1,
    w: contentW,
    h: 12,
    kind: 'scale',
  };
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
