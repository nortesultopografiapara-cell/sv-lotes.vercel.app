/**
 * Confrontação por segmento UTM (segments_json oficial — mesma base da prancha).
 */

import {
  normalizeConfrontantLabel,
  PENDING_CONFRONTANT_LABEL,
  type ConfrontantSource,
} from '@/lib/confrontantTypes';
import { getSegmentConfrontantRecord } from '@/lib/segmentConfrontantPersist';
import {
  resolveFrenteConfrontantLabel,
  resolveFrontStreetGuideForLot,
  STREET_GUIDE_LOT_FRONT_TOLERANCE_M,
} from '@/lib/resolveFrontStreetGuide';
import {
  confrontantFromStreetGuidesForUtmSegment,
  type StreetGuideConfrontInput,
} from '@/lib/streetGuideConfrontation';
import {
  getOfficialConfrontationRing,
  planarBearingDeg,
  planarDistanceM,
  utmRingToClosedCoords,
  type OfficialConfrontationRingSource,
} from '@/lib/officialConfrontationRing';
import type { LotSheetSideConfrontants } from '@/lib/lotSheetEnrichment';
import {
  classifyLotSidesFromSegments,
  classifySidesByRingPaths,
  mergeCurvedSegments,
  type Segment,
} from '@/utils/calculateLotDimensions';

const MAX_PERPENDICULAR_M = 0.5;
const MAX_PERPENDICULAR_FALLBACK_M = 1.5;
const MAX_ANGLE_DIFF_DEG = 10;
const MIN_OVERLAP_RATIO = 0.4;

export type SideRole = 'frente' | 'fundo' | 'ladoDireito' | 'ladoEsquerdo';
export type SideSegmentIndexes = Record<SideRole, number[]>;

export type SideConfrontantResult = {
  label: string;
  source: ConfrontantSource;
  pending: boolean;
};

function manualConfrontantForSide(
  block: Record<string, unknown>,
  segmentIndexes: number[],
  segments: Segment[],
): SideConfrontantResult | null {
  for (const idx of segmentIndexes) {
    const seg = segments[idx];
    if (!seg) continue;
    const oi =
      typeof seg.originalIndex === 'number' ? seg.originalIndex : idx;
    const rec = getSegmentConfrontantRecord(block, oi);
    if (rec?.confrontant) {
      return {
        label: rec.confrontant,
        source: 'manual',
        pending: false,
      };
    }
  }
  return null;
}

function resolveFrenteWithSource(
  block: Record<string, unknown>,
  frontSegmentIndexes: number[],
  segments: Segment[],
  streetGuides: StreetGuideConfrontInput[],
): SideConfrontantResult {
  const manual = manualConfrontantForSide(block, frontSegmentIndexes, segments);
  if (manual) return manual;

  const saved = String(block.front_street_name || '').trim();
  if (saved && !/sem nome/i.test(saved) && !/^a\s*definir$/i.test(saved)) {
    return {
      label: resolveFrenteConfrontantLabel(
        block,
        frontSegmentIndexes,
        segments,
        streetGuides,
      ),
      source: 'street_guide',
      pending: false,
    };
  }

  const guideMatch = resolveFrontStreetGuideForLot(
    block,
    streetGuides as StreetGuideConfrontInput[],
    STREET_GUIDE_LOT_FRONT_TOLERANCE_M,
  );
  if (guideMatch?.streetGuideName) {
    return {
      label: guideMatch.streetGuideName,
      source: 'street_guide',
      pending: false,
    };
  }

  const label = resolveFrenteConfrontantLabel(
    block,
    frontSegmentIndexes,
    segments,
    streetGuides,
  );
  const pending =
    label === PENDING_CONFRONTANT_LABEL ||
    /^a\s*definir$/i.test(label.trim());
  let source: ConfrontantSource = pending ? 'undefined' : 'auto';
  if (!pending && /rua|avenida|estrada|vicinal|central|interna/i.test(label)) {
    source = 'street_guide';
  }
  return { label, source, pending };
}

function diffAngleDeg(a1: number, a2: number): number {
  let diff = Math.abs(a1 - a2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function extractUtmSegments(
  coords: number[][],
  allPolys: number[][][],
): Segment[] {
  const segments: Segment[] = [];
  if (!Array.isArray(coords) || coords.length < 2) return segments;

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const length = planarDistanceM(p1, p2);
    if (length < 0.5) continue;
    segments.push({
      p1,
      p2,
      length,
      azimuth: planarBearingDeg(p1, p2),
      originalIndex: i,
      isExternal: true,
    });
  }

  for (const seg of segments) {
    let matched = false;
    for (const other of allPolys) {
      if (other === coords) continue;
      for (let j = 0; j < other.length - 1; j++) {
        const d1 = planarDistanceM(seg.p1, other[j]);
        const d2 = planarDistanceM(seg.p2, other[j + 1]);
        const d3 = planarDistanceM(seg.p1, other[j + 1]);
        const d4 = planarDistanceM(seg.p2, other[j]);
        if ((d1 < 1.0 && d2 < 1.0) || (d3 < 1.0 && d4 < 1.0)) {
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    seg.isExternal = !matched;
  }

  return segments;
}

function buildAllPolysUtm(
  blocks: Record<string, unknown>[],
  project?: Record<string, unknown> | null,
): number[][][] {
  const polys: number[][][] = [];
  for (const b of blocks) {
    const { ok, ring } = getOfficialConfrontationRing(b, project);
    if (!ok || ring.length < 3) continue;
    const coords = utmRingToClosedCoords(ring);
    if (coords.length >= 4) polys.push(coords);
  }
  return polys;
}

function ringCentroidUtm(ring: [number, number][]): [number, number] {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    sx += pt[0];
    sy += pt[1];
    n++;
  }
  return n ? [sx / n, sy / n] : [0, 0];
}

function segmentMid(seg: Segment): [number, number] {
  return [(seg.p1[0] + seg.p2[0]) / 2, (seg.p1[1] + seg.p2[1]) / 2];
}

function projectParamOnSegment(p: [number, number], seg: Segment): number {
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
  return planarDistanceM(p, [px, py]);
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
  return Math.max(0, Math.min(tMax, target.length) - Math.max(tMin, 0));
}

function segmentsAreParallel(target: Segment, candidate: Segment): boolean {
  const diff = diffAngleDeg(target.azimuth, candidate.azimuth);
  return diff <= MAX_ANGLE_DIFF_DEG || diff >= 180 - MAX_ANGLE_DIFF_DEG;
}

export function scoreConfrontantForSegment(
  target: Segment,
  candidate: Segment,
  maxPerpM = MAX_PERPENDICULAR_M,
): number | null {
  if (!segmentsAreParallel(target, candidate)) return null;

  const perpDist = Math.min(
    pointToSegmentDistanceM(segmentMid(candidate), target),
    pointToSegmentDistanceM(segmentMid(target), candidate),
  );
  if (perpDist > maxPerpM) return null;

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

function parseLotNumber(value: unknown): number | null {
  const n = Number(String(value ?? '').replace(/\D/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sameQuadra(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const qa = String(a.block_name ?? a.name ?? '').trim().toUpperCase();
  const qb = String(b.block_name ?? b.name ?? '').trim().toUpperCase();
  return qa.length > 0 && qa === qb;
}

function sequenceNeighborLabel(
  targetBlock: Record<string, unknown>,
  delta: number,
  blocks: Record<string, unknown>[],
): Record<string, unknown> | null {
  const num = parseLotNumber(targetBlock.number ?? targetBlock.lot);
  if (num == null) return null;
  const want = num + delta;
  return (
    blocks.find((b) => {
      if (!sameQuadra(b, targetBlock)) return false;
      const bn = parseLotNumber(b.number ?? b.lot);
      return bn === want;
    }) ?? null
  );
}

function scoreSegmentAgainstBlock(
  target: Segment,
  block: Record<string, unknown>,
  allPolysUtm: number[][][],
  project: Record<string, unknown> | null | undefined,
  maxPerpM: number,
): number | null {
  const { ok, ring } = getOfficialConfrontationRing(block, project);
  if (!ok) return null;
  const coords = utmRingToClosedCoords(ring);
  if (coords.length < 4) return null;
  const candSegments = mergeCurvedSegments(
    extractUtmSegments(coords, allPolysUtm),
    20,
  );
  let best: number | null = null;
  for (const cand of candSegments) {
    const s = scoreConfrontantForSegment(target, cand, maxPerpM);
    if (s != null && (best == null || s > best)) best = s;
  }
  return best;
}

function labelFromBlock(block: Record<string, unknown>): string {
  const num = block.number ?? block.lot ?? '?';
  return `Lote ${num}`;
}

function trySequenceConfrontant(
  targetBlock: Record<string, unknown>,
  side: 'ladoEsquerdo' | 'ladoDireito',
  segmentIndexes: number[],
  segments: Segment[],
  blocks: Record<string, unknown>[],
  allPolysUtm: number[][][],
  project?: Record<string, unknown> | null,
): string | null {
  const delta = side === 'ladoEsquerdo' ? -1 : 1;
  const neighbor = sequenceNeighborLabel(targetBlock, delta, blocks);
  if (!neighbor) return null;

  let bestScore = -Infinity;
  for (const idx of segmentIndexes) {
    const target = segments[idx];
    if (!target) continue;
    const s = scoreSegmentAgainstBlock(
      target,
      neighbor,
      allPolysUtm,
      project,
      MAX_PERPENDICULAR_FALLBACK_M,
    );
    if (s != null && s > bestScore) bestScore = s;
  }
  if (bestScore <= -Infinity) return null;
  return labelFromBlock(neighbor);
}

function bestConfrontantForSide(
  segmentIndexes: number[],
  segments: Segment[],
  candidateBlocks: Record<string, unknown>[],
  targetBlock: Record<string, unknown>,
  targetBlockId: string,
  allPolysUtm: number[][][],
  project?: Record<string, unknown> | null,
  side?: 'ladoEsquerdo' | 'ladoDireito',
  streetGuides: Record<string, unknown>[] = [],
): SideConfrontantResult {
  const manual = manualConfrontantForSide(
    targetBlock,
    segmentIndexes,
    segments,
  );
  if (manual) return manual;

  let bestLabel = '—';
  let bestScore = -Infinity;

  if (streetGuides.length > 0) {
    for (const idx of segmentIndexes) {
      const target = segments[idx];
      if (!target) continue;
      const fromStreet = confrontantFromStreetGuidesForUtmSegment(
        target,
        targetBlock,
        streetGuides as StreetGuideConfrontInput[],
      );
      if (fromStreet?.label) {
        return {
          label: normalizeConfrontantLabel(fromStreet.label),
          source: 'street_guide',
          pending: false,
        };
      }
    }
  }

  const tryPass = (maxPerp: number) => {
    for (const idx of segmentIndexes) {
      const target = segments[idx];
      if (!target) continue;
      for (const block of candidateBlocks) {
        const id = String(block.id || '');
        if (!id || id === targetBlockId) continue;
        if (!sameQuadra(block, targetBlock)) continue;
        const s = scoreSegmentAgainstBlock(
          target,
          block,
          allPolysUtm,
          project,
          maxPerp,
        );
        if (s == null || s <= bestScore) continue;
        bestScore = s;
        bestLabel = labelFromBlock(block);
      }
    }
  };

  tryPass(MAX_PERPENDICULAR_M);
  if (bestScore <= -Infinity) tryPass(MAX_PERPENDICULAR_FALLBACK_M);

  if (bestLabel === '—' && side) {
    const seq = trySequenceConfrontant(
      targetBlock,
      side,
      segmentIndexes,
      segments,
      candidateBlocks,
      allPolysUtm,
      project,
    );
    if (seq) {
      return {
        label: normalizeConfrontantLabel(seq),
        source: 'neighbor',
        pending: false,
      };
    }
  }

  if (bestLabel !== '—' && /^lote\s/i.test(bestLabel)) {
    return {
      label: bestLabel,
      source: 'neighbor',
      pending: false,
    };
  }

  if (bestLabel !== '—') {
    return {
      label: normalizeConfrontantLabel(bestLabel),
      source: 'auto',
      pending: false,
    };
  }

  return {
    label: PENDING_CONFRONTANT_LABEL,
    source: 'undefined',
    pending: true,
  };
}

export function resolveSideSegmentIndexes(
  block: Record<string, unknown>,
  utmRing: [number, number][],
  allPolysUtm: number[][][],
): { segments: Segment[]; sides: SideSegmentIndexes; frontIndex: number } {
  const emptySides: SideSegmentIndexes = {
    frente: [],
    fundo: [],
    ladoDireito: [],
    ladoEsquerdo: [],
  };
  const coords = utmRingToClosedCoords(utmRing);
  if (coords.length < 4) {
    return { segments: [], sides: emptySides, frontIndex: -1 };
  }

  const raw = extractUtmSegments(coords, allPolysUtm);
  const segments = mergeCurvedSegments(raw, 20);
  if (!segments.length) {
    return { segments: [], sides: emptySides, frontIndex: -1 };
  }

  let frontIndex = -1;
  const stored = block.front_segment_index;
  if (typeof stored === 'number' && stored >= 0) {
    const byOriginal = segments.findIndex((s) => s.originalIndex === stored);
    if (byOriginal >= 0) {
      frontIndex = byOriginal;
    } else if (stored < segments.length) {
      frontIndex = stored;
    }
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
    if (lat && front) {
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

export type BuildSideConfrontantsResult = LotSheetSideConfrontants & {
  ringSource: OfficialConfrontationRingSource;
  confidence: number;
};

export type BuildSideConfrontantsWithSourcesResult = BuildSideConfrontantsResult & {
  sources: Record<SideRole, ConfrontantSource>;
  pending: Record<SideRole, boolean>;
  sides: SideSegmentIndexes;
  segments: Segment[];
};

/**
 * Confrontantes por segmento UTM oficial (segments_json).
 */
export function buildSideConfrontantsWithSources(
  block: Record<string, unknown>,
  targetId: string,
  targetRing: [number, number][],
  blocks: Record<string, unknown>[],
  streetGuides: Record<string, unknown>[],
  project?: Record<string, unknown> | null,
): BuildSideConfrontantsWithSourcesResult {
  const official = getOfficialConfrontationRing(block, project);
  const utmRing = official.ok ? official.ring : targetRing;
  const allPolysUtm = buildAllPolysUtm(blocks, project);

  const { segments, sides } = resolveSideSegmentIndexes(
    block,
    utmRing,
    allPolysUtm,
  );

  if (!segments.length) {
    const frente = resolveFrenteWithSource(block, [], [], streetGuides);
    const empty: SideConfrontantResult = {
      label: PENDING_CONFRONTANT_LABEL,
      source: 'undefined',
      pending: true,
    };
    return {
      frente: frente.label,
      fundo: empty.label,
      ladoDireito: empty.label,
      ladoEsquerdo: empty.label,
      ringSource: official.source,
      confidence: 0,
      sources: {
        frente: frente.source,
        fundo: 'undefined',
        ladoDireito: 'undefined',
        ladoEsquerdo: 'undefined',
      },
      pending: {
        frente: frente.pending,
        fundo: true,
        ladoDireito: true,
        ladoEsquerdo: true,
      },
      sides,
      segments,
    };
  }

  const frenteR = resolveFrenteWithSource(
    block,
    sides.frente,
    segments,
    streetGuides as StreetGuideConfrontInput[],
  );
  const fundoR = bestConfrontantForSide(
    sides.fundo,
    segments,
    blocks,
    block,
    targetId,
    allPolysUtm,
    project,
    undefined,
    streetGuides,
  );
  const dirR = bestConfrontantForSide(
    sides.ladoDireito,
    segments,
    blocks,
    block,
    targetId,
    allPolysUtm,
    project,
    'ladoDireito',
    streetGuides,
  );
  const esqR = bestConfrontantForSide(
    sides.ladoEsquerdo,
    segments,
    blocks,
    block,
    targetId,
    allPolysUtm,
    project,
    'ladoEsquerdo',
    streetGuides,
  );

  const matched = [fundoR, dirR, esqR].filter((r) => !r.pending).length;
  const confidence = matched / 3;

  return {
    frente: frenteR.label,
    fundo: fundoR.label,
    ladoDireito: dirR.label,
    ladoEsquerdo: esqR.label,
    ringSource: official.source,
    confidence,
    sources: {
      frente: frenteR.source,
      fundo: fundoR.source,
      ladoDireito: dirR.source,
      ladoEsquerdo: esqR.source,
    },
    pending: {
      frente: frenteR.pending,
      fundo: fundoR.pending,
      ladoDireito: dirR.pending,
      ladoEsquerdo: esqR.pending,
    },
    sides,
    segments,
  };
}

export function buildSideConfrontantsFromSegments(
  block: Record<string, unknown>,
  targetId: string,
  targetRing: [number, number][],
  blocks: Record<string, unknown>[],
  streetGuides: Record<string, unknown>[],
  project?: Record<string, unknown> | null,
): BuildSideConfrontantsResult {
  const full = buildSideConfrontantsWithSources(
    block,
    targetId,
    targetRing,
    blocks,
    streetGuides,
    project,
  );
  return {
    frente: full.frente,
    fundo: full.fundo,
    ladoDireito: full.ladoDireito,
    ladoEsquerdo: full.ladoEsquerdo,
    ringSource: full.ringSource,
    confidence: full.confidence,
  };
}

export function findConfrontantForSegment(
  target: Segment,
  candidateBlocks: Record<string, unknown>[],
  targetBlockId: string,
  allPolysUtm: number[][][],
  project?: Record<string, unknown> | null,
): string {
  let bestLabel = '—';
  let bestScore = -Infinity;
  for (const block of candidateBlocks) {
    const id = String(block.id || '');
    if (!id || id === targetBlockId) continue;
    const s = scoreSegmentAgainstBlock(
      target,
      block,
      allPolysUtm,
      project,
      MAX_PERPENDICULAR_M,
    );
    if (s == null) continue;
    if (s <= bestScore) continue;
    bestScore = s;
    bestLabel = labelFromBlock(block);
  }
  if (bestLabel === '—') {
    for (const block of candidateBlocks) {
      const id = String(block.id || '');
      if (!id || id === targetBlockId) continue;
      const s = scoreSegmentAgainstBlock(
        target,
        block,
        allPolysUtm,
        project,
        MAX_PERPENDICULAR_FALLBACK_M,
      );
      if (s == null || s <= bestScore) continue;
      bestScore = s;
      bestLabel = labelFromBlock(block);
    }
  }
  return bestLabel;
}
