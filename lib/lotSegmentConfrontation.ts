/**
 * Confrontação por segmento compartilhado (vizinho colado à divisa, não por centroide).
 */

import { formatStreetDisplay } from '@/lib/streetGuide';
import { normalizeLotGeometry } from '@/lib/lotGeometryNormalize';
import { latLngRingFromBlock, type LotSheetSideConfrontants } from '@/lib/lotSheetEnrichment';
import {
  calculateBearing,
  calculateDistance,
  classifyLotSidesFromSegments,
  classifySidesByRingPaths,
  extractSegments,
  mergeCurvedSegments,
  type Segment,
} from '@/utils/calculateLotDimensions';

const MAX_PERPENDICULAR_M = 1.5;
const MAX_ANGLE_DIFF_DEG = 10;
const MIN_OVERLAP_RATIO = 0.4;

type SideRole = 'frente' | 'fundo' | 'ladoDireito' | 'ladoEsquerdo';

type SideSegmentIndexes = Record<SideRole, number[]>;

function diffAngleDeg(a1: number, a2: number): number {
  let diff = Math.abs(a1 - a2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function latLngRingToLngLatClosed(ring: [number, number][]): number[][] {
  if (!Array.isArray(ring) || ring.length < 3) return [];
  const out: number[][] = [];
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lat = Number(pt[0]);
    const lng = Number(pt[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push([lng, lat]);
  }
  if (out.length < 3) return [];
  const first = out[0];
  const last = out[out.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    out.push([first[0], first[1]]);
  }
  return out;
}

function buildAllPolysLngLat(blocks: Record<string, unknown>[]): number[][][] {
  const polys: number[][][] = [];
  if (!Array.isArray(blocks)) return polys;
  for (const b of blocks) {
    const { ok, ring } = normalizeLotGeometry(b);
    if (!ok || ring.length < 3) continue;
    const coords = latLngRingToLngLatClosed(ring);
    if (coords.length >= 4) polys.push(coords);
  }
  return polys;
}

function ringCentroidLngLat(ring: [number, number][]): [number, number] {
  let sx = 0;
  let sy = 0;
  const n = ring.length || 1;
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lat = Number(pt[0]);
    const lng = Number(pt[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    sx += lng;
    sy += lat;
  }
  return [sx / n, sy / n];
}

function segmentMid(seg: Segment): [number, number] {
  return [(seg.p1[0] + seg.p2[0]) / 2, (seg.p1[1] + seg.p2[1]) / 2];
}

/** Normal unitária apontando para fora do polígono (lng/lat). */
function segmentOutwardNormal(
  ring: [number, number][],
  seg: Segment,
): [number, number] {
  const dx = seg.p2[0] - seg.p1[0];
  const dy = seg.p2[1] - seg.p1[1];
  const len = Math.hypot(dx, dy) || 1e-12;
  const nx1 = -dy / len;
  const ny1 = dx / len;
  const mid = segmentMid(seg);
  const c = ringCentroidLngLat(ring);
  const toCentroidX = c[0] - mid[0];
  const toCentroidY = c[1] - mid[1];
  const dot = nx1 * toCentroidX + ny1 * toCentroidY;
  if (dot > 0) return [nx1, ny1];
  return [-nx1, -ny1];
}

function projectParamOnSegment(
  p: [number, number],
  seg: Segment,
): number {
  const dx = seg.p2[0] - seg.p1[0];
  const dy = seg.p2[1] - seg.p1[1];
  const len2 = dx * dx + dy * dy || 1e-12;
  return ((p[0] - seg.p1[0]) * dx + (p[1] - seg.p1[1]) * dy) / len2;
}

function pointToSegmentDistanceM(
  p: [number, number],
  seg: Segment,
): number {
  const t = Math.max(0, Math.min(1, projectParamOnSegment(p, seg)));
  const px = seg.p1[0] + t * (seg.p2[0] - seg.p1[0]);
  const py = seg.p1[1] + t * (seg.p2[1] - seg.p1[1]);
  return calculateDistance(p, [px, py]);
}

function longitudinalOverlapM(target: Segment, candidate: Segment): number {
  const samples: [number, number][] = [
    [candidate.p1[0], candidate.p1[1]],
    [candidate.p2[0], candidate.p2[1]],
    segmentMid(candidate),
  ];
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const p of samples) {
    const t = projectParamOnSegment(p, target) * target.length;
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }
  if (!Number.isFinite(tMin)) return 0;
  const overlap = Math.max(0, Math.min(tMax, target.length) - Math.max(tMin, 0));
  return overlap;
}

function segmentsAreParallel(target: Segment, candidate: Segment): boolean {
  const diff = diffAngleDeg(target.azimuth, candidate.azimuth);
  return diff <= MAX_ANGLE_DIFF_DEG || diff >= 180 - MAX_ANGLE_DIFF_DEG;
}

/** Score do candidato para confrontar o segmento alvo (maior = melhor). */
export function scoreConfrontantForSegment(
  target: Segment,
  candidate: Segment,
): number | null {
  if (!segmentsAreParallel(target, candidate)) return null;

  const perpDist = Math.min(
    pointToSegmentDistanceM(segmentMid(candidate), target),
    pointToSegmentDistanceM(segmentMid(target), candidate),
  );
  if (perpDist > MAX_PERPENDICULAR_M) return null;

  const overlap = longitudinalOverlapM(target, candidate);
  const minLen = Math.min(target.length, candidate.length);
  if (minLen < 0.5) return null;
  if (overlap / minLen < MIN_OVERLAP_RATIO) return null;

  const anglePenalty = diffAngleDeg(target.azimuth, candidate.azimuth);
  const parallelPenalty =
    anglePenalty <= MAX_ANGLE_DIFF_DEG
      ? anglePenalty
      : Math.abs(anglePenalty - 180);

  return overlap * 100 - perpDist * 40 - parallelPenalty * 2;
}

export function findConfrontantForSegment(
  target: Segment,
  candidateBlocks: Record<string, unknown>[],
  targetBlockId: string,
  allPolysLngLat: number[][][],
): string {
  let bestLabel = '—';
  let bestScore = -Infinity;

  for (const block of candidateBlocks) {
    const id = String(block.id || '');
    if (!id || id === targetBlockId) continue;
    const ring = latLngRingFromBlock(block);
    const coords = latLngRingToLngLatClosed(ring);
    if (coords.length < 4) continue;

    const raw = extractSegments(coords, allPolysLngLat);
    const segments = mergeCurvedSegments(raw, 20);

    for (const candSeg of segments) {
      const score = scoreConfrontantForSegment(target, candSeg);
      if (score == null || score <= bestScore) continue;
      const num = block.number ?? block.lot ?? '?';
      bestScore = score;
      bestLabel = `Lote ${num}`;
    }
  }

  return bestLabel;
}

function resolveSideSegmentIndexes(
  block: Record<string, unknown>,
  ring: [number, number][],
  allPolysLngLat: number[][][],
): { segments: Segment[]; sides: SideSegmentIndexes; frontIndex: number } {
  const emptySides: SideSegmentIndexes = {
    frente: [],
    fundo: [],
    ladoDireito: [],
    ladoEsquerdo: [],
  };
  const coords = latLngRingToLngLatClosed(ring);
  if (coords.length < 4) {
    return { segments: [], sides: emptySides, frontIndex: -1 };
  }

  const raw = extractSegments(coords, allPolysLngLat);
  const segments = mergeCurvedSegments(raw, 20);
  if (!segments.length) {
    return { segments: [], sides: emptySides, frontIndex: -1 };
  }

  let frontIndex = -1;
  const stored = block.front_segment_index;
  if (typeof stored === 'number' && stored >= 0 && stored < segments.length) {
    frontIndex = stored;
  }

  const classified = classifyLotSidesFromSegments(segments, {
    frenteLengthHint:
      typeof block.frente === 'number' ? block.frente : Number(block.frente) || null,
    fundoLengthHint:
      typeof block.fundo === 'number' ? block.fundo : Number(block.fundo) || null,
    pickFrontSegment:
      frontIndex >= 0 ? () => segments[frontIndex] : undefined,
    lotNumber: block.number ?? block.lot,
  });

  if (frontIndex < 0) frontIndex = classified.ringPaths.frontIndex;
  const backIndex = classified.ringPaths.backIndex;
  const ringPaths = classifySidesByRingPaths(segments, frontIndex, backIndex);

  let pathDireito = Array.isArray(ringPaths.pathA?.indexes)
    ? ringPaths.pathA.indexes
    : [];
  let pathEsquerdo = Array.isArray(ringPaths.pathB?.indexes)
    ? ringPaths.pathB.indexes
    : [];

  if (frontIndex >= 0 && pathDireito.length > 0 && pathEsquerdo.length > 0) {
    const front = segments[frontIndex];
    const lateralIdx = pathDireito[0];
    const lat = segments[lateralIdx];
    if (lat) {
      const fx = front.p2[0] - front.p1[0];
      const fy = front.p2[1] - front.p1[1];
      const mx =
        (lat.p1[0] + lat.p2[0]) / 2 - (front.p1[0] + front.p2[0]) / 2;
      const my =
        (lat.p1[1] + lat.p2[1]) / 2 - (front.p1[1] + front.p2[1]) / 2;
      const cross = fx * my - fy * mx;
      if (cross < 0) {
        pathDireito = ringPaths.pathB.indexes;
        pathEsquerdo = ringPaths.pathA.indexes;
      }
    }
  }

  const sides: SideSegmentIndexes = {
    frente: frontIndex >= 0 ? [frontIndex] : [],
    fundo: backIndex >= 0 ? [backIndex] : [],
    ladoDireito:
      pathDireito.length > 0
        ? pathDireito
        : frontIndex >= 0
          ? [(frontIndex + 1) % segments.length]
          : [],
    ladoEsquerdo:
      pathEsquerdo.length > 0
        ? pathEsquerdo
        : frontIndex >= 0
          ? [(frontIndex + segments.length - 1) % segments.length]
          : [],
  };

  return { segments, sides, frontIndex };
}

function resolveFrenteLabel(block: Record<string, unknown>): string {
  const rawFront = String(block.front_street_name || '').trim();
  const frontDisplay = formatStreetDisplay(
    block.front_street_type as string | undefined,
    rawFront || undefined,
  );
  if (rawFront && !/sem nome/i.test(rawFront)) {
    return frontDisplay || rawFront;
  }
  return 'Rua / via de acesso';
}

function bestConfrontantForSide(
  segmentIndexes: number[],
  segments: Segment[],
  candidateBlocks: Record<string, unknown>[],
  targetBlockId: string,
  allPolysLngLat: number[][][],
): string {
  let bestLabel = '—';
  let bestScore = -Infinity;

  for (const idx of segmentIndexes) {
    const target = segments[idx];
    if (!target) continue;
    for (const block of candidateBlocks) {
      const id = String(block.id || '');
      if (!id || id === targetBlockId) continue;
      const ring = latLngRingFromBlock(block);
      const coords = latLngRingToLngLatClosed(ring);
      if (coords.length < 4) continue;
      const raw = extractSegments(coords, allPolysLngLat);
      const candSegments = mergeCurvedSegments(raw, 20);
      for (const cand of candSegments) {
        const score = scoreConfrontantForSegment(target, cand);
        if (score == null || score <= bestScore) continue;
        const num = block.number ?? block.lot ?? '?';
        bestScore = score;
        bestLabel = `Lote ${num}`;
      }
    }
  }

  return bestLabel;
}

/**
 * Confrontantes por lado do lote (segmentos paralelos e sobrepostos).
 */
export function buildSideConfrontantsFromSegments(
  block: Record<string, unknown>,
  targetId: string,
  targetRing: [number, number][],
  blocks: Record<string, unknown>[],
  _streetGuides: Record<string, unknown>[],
): LotSheetSideConfrontants {
  const allPolysLngLat = buildAllPolysLngLat(blocks);

  const { segments, sides } = resolveSideSegmentIndexes(
    block,
    targetRing,
    allPolysLngLat,
  );

  if (!segments.length) {
    return {
      frente: resolveFrenteLabel(block),
      fundo: '—',
      ladoDireito: '—',
      ladoEsquerdo: '—',
    };
  }

  return {
    frente: resolveFrenteLabel(block),
    fundo: bestConfrontantForSide(
      sides.fundo,
      segments,
      blocks,
      targetId,
      allPolysLngLat,
    ),
    ladoDireito: bestConfrontantForSide(
      sides.ladoDireito,
      segments,
      blocks,
      targetId,
      allPolysLngLat,
    ),
    ladoEsquerdo: bestConfrontantForSide(
      sides.ladoEsquerdo,
      segments,
      blocks,
      targetId,
      allPolysLngLat,
    ),
  };
}
