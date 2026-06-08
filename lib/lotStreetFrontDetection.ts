/**
 * Frente de lote por proximidade à polilinha completa da rua (street_guides).
 * Usado em Identificar Frentes, labels e mapeamento TXT ↔ geometria WGS84.
 */

import { lineString, point } from "@turf/helpers";
import distance from "@turf/distance";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import type { OfficialLotSegment } from "@/lib/officialLotMeasurements";
import { flattenLineStringCoordinates } from "@/lib/streetGuideConfrontation";
import { utmSegmentIndexFromWgs84RingEdge } from "@/lib/resolveFrontStreetGuide";

export type StreetGuideLineInput = {
  id?: string;
  coordinates: number[][];
};

export const TOUCH_STREET_MAX_M = 50;
const NEIGHBOR_SHARE_TOL_M = 1.5;
/** Endpoints à mesma distância da rua = paralelo, não necessariamente frente. */
const PARALLEL_VARIANCE_MAX_M = 1.5;

export type SegmentStreetProximityScore = {
  minDistM: number;
  avgDistM: number;
  parallelVarianceM: number;
};

export type LotFrontStreetMatch = {
  /** Índice de aresta WGS84 no anel do polígono (mapa). */
  ringEdgeIndex: number;
  /** segment_index oficial TXT (quando disponível). */
  segmentIndex: number;
  guide: StreetGuideLineInput | null;
  minDistM: number;
};

function nearestDistM(
  lngLat: [number, number],
  guideCoords: number[][],
): number {
  const lineCoords = flattenLineStringCoordinates(guideCoords) ?? guideCoords;
  if (!Array.isArray(lineCoords) || lineCoords.length < 2) return Infinity;
  try {
    const line = lineString(lineCoords);
    const pt = point(lngLat);
    const np = nearestPointOnLine(line, pt);
    const dist = np.properties?.dist;
    if (typeof dist === "number" && Number.isFinite(dist)) return dist;
    return distance(pt, np, { units: "meters" });
  } catch {
    return Infinity;
  }
}

function samplePointsOnEdge(
  p1LngLat: [number, number],
  p2LngLat: [number, number],
  count = 5,
): [number, number][] {
  const out: [number, number][] = [];
  const n = Math.max(2, count);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push([
      p1LngLat[0] + t * (p2LngLat[0] - p1LngLat[0]),
      p1LngLat[1] + t * (p2LngLat[1] - p1LngLat[1]),
    ]);
  }
  return out;
}

/** Distância do segmento do lote à polilinha completa da rua (nearestPointOnLine). */
export function scoreSegmentStreetProximity(
  p1LngLat: [number, number],
  p2LngLat: [number, number],
  guideCoords: number[][],
): SegmentStreetProximityScore {
  const lineCoords =
    flattenLineStringCoordinates(guideCoords) ?? guideCoords;
  if (!Array.isArray(lineCoords) || lineCoords.length < 2) {
    return {
      minDistM: Infinity,
      avgDistM: Infinity,
      parallelVarianceM: Infinity,
    };
  }
  const samples = samplePointsOnEdge(p1LngLat, p2LngLat);
  const dists = samples.map((s) => nearestDistM(s, lineCoords));
  const minDistM = Math.min(...dists);
  const maxDistM = Math.max(...dists);
  const avgDistM = dists.reduce((a, b) => a + b, 0) / dists.length;
  return {
    minDistM,
    avgDistM,
    parallelVarianceM: maxDistM - minDistM,
  };
}

function isParallelOnlyCandidate(
  score: SegmentStreetProximityScore,
  bestMinDistM: number,
): boolean {
  if (!Number.isFinite(bestMinDistM) || bestMinDistM >= TOUCH_STREET_MAX_M) {
    return false;
  }
  return (
    score.parallelVarianceM <= PARALLEL_VARIANCE_MAX_M &&
    score.minDistM > bestMinDistM + 1.5 &&
    score.minDistM > bestMinDistM * 1.25
  );
}

export function closedRingLngLat(ring: number[][]): number[][] {
  if (ring.length < 2) return ring;
  const out = [...ring];
  const f = out[0];
  const l = out[out.length - 1];
  if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-9) out.pop();
  return out;
}

function pointDistM(a: [number, number], b: [number, number]): number {
  return distance(point(a), point(b), { units: "meters" });
}

function edgesShareBoundary(
  p1: [number, number],
  p2: [number, number],
  q1: [number, number],
  q2: [number, number],
  tolM = NEIGHBOR_SHARE_TOL_M,
): boolean {
  const d11 = pointDistM(p1, q1);
  const d22 = pointDistM(p2, q2);
  const d12 = pointDistM(p1, q2);
  const d21 = pointDistM(p2, q1);
  return (d11 < tolM && d22 < tolM) || (d12 < tolM && d21 < tolM);
}

/** Aresta do lote coincidente com divisa de outro lote (não é frente para rua). */
export function isLotEdgeInternal(
  p1LngLat: [number, number],
  p2LngLat: [number, number],
  neighborRingsLngLat: number[][][] = [],
): boolean {
  for (const ring of neighborRingsLngLat) {
    const closed = closedRingLngLat(ring);
    if (closed.length < 2) continue;
    for (let j = 0; j < closed.length; j++) {
      const q1 = closed[j] as [number, number];
      const q2 = closed[(j + 1) % closed.length] as [number, number];
      if (edgesShareBoundary(p1LngLat, p2LngLat, q1, q2)) return true;
    }
  }
  return false;
}

function bestGuideForEdge(
  p1: [number, number],
  p2: [number, number],
  guides: StreetGuideLineInput[],
  preferredGuideId?: string | null,
): { guide: StreetGuideLineInput; score: SegmentStreetProximityScore } | null {
  const guideOrder = [...guides];
  if (preferredGuideId) {
    guideOrder.sort((a, b) => {
      const ap = String(a.id) === String(preferredGuideId) ? 0 : 1;
      const bp = String(b.id) === String(preferredGuideId) ? 0 : 1;
      return ap - bp;
    });
  }
  let best: StreetGuideLineInput | null = null;
  let bestScore: SegmentStreetProximityScore = {
    minDistM: Infinity,
    avgDistM: Infinity,
    parallelVarianceM: Infinity,
  };
  for (const g of guideOrder) {
    if (!g.coordinates || g.coordinates.length < 2) continue;
    const sc = scoreSegmentStreetProximity(p1, p2, g.coordinates);
    if (sc.minDistM < bestScore.minDistM) {
      bestScore = sc;
      best = g;
    }
  }
  return best ? { guide: best, score: bestScore } : null;
}

function mapWgsEdgeToOfficialSegmentIndex(
  ringEdgeIndex: number,
  segments: OfficialLotSegment[],
  ringLngLat: number[][],
  block?: Record<string, unknown>,
): number {
  if (block) {
    const blockWithGeom = {
      ...block,
      geometry:
        block.geometry ??
        ({
          type: "Polygon",
          coordinates: [
            [...closedRingLngLat(ringLngLat), closedRingLngLat(ringLngLat)[0]],
          ],
        } as const),
    };
    const utmIdx = utmSegmentIndexFromWgs84RingEdge(
      blockWithGeom,
      ringEdgeIndex,
    );
    if (utmIdx >= 0 && segments.some((s) => s.segment_index === utmIdx)) {
      return utmIdx;
    }
  }
  if (segments.some((s) => s.segment_index === ringEdgeIndex)) {
    return ringEdgeIndex;
  }
  const ordered = [...segments].sort(
    (a, b) => a.segment_index - b.segment_index,
  );
  if (ringEdgeIndex >= 0 && ringEdgeIndex < ordered.length) {
    return ordered[ringEdgeIndex].segment_index;
  }
  return ordered[0]?.segment_index ?? ringEdgeIndex;
}

export type FindFrontFromStreetOptions = {
  neighborRingsLngLat?: number[][][];
  preferredGuideId?: string | null;
  lotLabel?: unknown;
  segments?: OfficialLotSegment[];
  block?: Record<string, unknown>;
};

/**
 * Escolhe a aresta WGS84 do lote mais próxima da polilinha da rua.
 * Prioriza arestas externas (não compartilhadas com outro lote) quando há rua próxima.
 */
export function findFrontWgsRingEdgeTouchingStreet(
  ringLngLat: number[][],
  guides: StreetGuideLineInput[],
  options: FindFrontFromStreetOptions = {},
): { edgeIndex: number; minDistM: number; guide: StreetGuideLineInput | null } | null {
  const ring = closedRingLngLat(ringLngLat);
  const activeGuides = guides.filter(
    (g) => g.coordinates && flattenLineStringCoordinates(g.coordinates)?.length >= 2,
  );
  if (activeGuides.length === 0 || ring.length < 2) return null;

  type Candidate = {
    edgeIndex: number;
    score: SegmentStreetProximityScore;
    guide: StreetGuideLineInput;
    isInternal: boolean;
  };

  const candidates: Candidate[] = [];

  for (let edgeIdx = 0; edgeIdx < ring.length; edgeIdx++) {
    const p1 = ring[edgeIdx] as [number, number];
    const p2 = ring[(edgeIdx + 1) % ring.length] as [number, number];
    const hit = bestGuideForEdge(
      p1,
      p2,
      activeGuides,
      options.preferredGuideId,
    );
    if (!hit) continue;
    candidates.push({
      edgeIndex: edgeIdx,
      score: hit.score,
      guide: hit.guide,
      isInternal: isLotEdgeInternal(
        p1,
        p2,
        options.neighborRingsLngLat ?? [],
      ),
    });
  }

  if (candidates.length === 0) return null;

  const externalCandidates = candidates.filter((c) => !c.isInternal);
  let pool =
    externalCandidates.length > 0 ? externalCandidates : candidates;

  pool.sort((a, b) => {
    if (a.score.minDistM !== b.score.minDistM) {
      return a.score.minDistM - b.score.minDistM;
    }
    return a.score.avgDistM - b.score.avgDistM;
  });

  const best = pool[0];

  for (const c of candidates) {
    if (c.edgeIndex === best.edgeIndex) continue;
    if (isParallelOnlyCandidate(c.score, best.score.minDistM)) {
      console.log("FRONT_SEGMENT_REJECTED_PARALLEL_ONLY", {
        lote: options.lotLabel ?? "?",
        edgeIndex: c.edgeIndex,
        minDistM: round3(c.score.minDistM),
        internal: c.isInternal,
        chosenEdgeIndex: best.edgeIndex,
        chosenMinDistM: round3(best.score.minDistM),
      });
    }
    if (c.isInternal && !best.isInternal) {
      console.log("FRONT_SEGMENT_REJECTED_INTERNAL_DIVISA", {
        lote: options.lotLabel ?? "?",
        edgeIndex: c.edgeIndex,
        minDistM: round3(c.score.minDistM),
        chosenEdgeIndex: best.edgeIndex,
        chosenMinDistM: round3(best.score.minDistM),
        note: "divisa com outro lote — rua externa tem prioridade",
      });
    }
  }

  console.log("FRONT_WGS_EDGE_SELECTED_FROM_STREET", {
    lote: options.lotLabel ?? "?",
    edgeIndex: best.edgeIndex,
    minDistM: round3(best.score.minDistM),
    internal: best.isInternal,
    guideId: best.guide.id ?? null,
    scoring: "polyline_nearest_point",
  });

  return {
    edgeIndex: best.edgeIndex,
    minDistM: best.score.minDistM,
    guide: best.guide,
  };
}

/** Identificação unificada de frente: aresta WGS + segment_index + guia. */
export function identifyLotFrontFromStreetGuides(
  ringLngLat: number[][],
  guides: StreetGuideLineInput[],
  options: FindFrontFromStreetOptions = {},
): LotFrontStreetMatch | null {
  const hit = findFrontWgsRingEdgeTouchingStreet(ringLngLat, guides, options);
  if (!hit) return null;

  const segmentIndex = mapWgsEdgeToOfficialSegmentIndex(
    hit.edgeIndex,
    options.segments ?? [],
    ringLngLat,
    options.block,
  );

  console.log("FRONT_SEGMENT_SELECTED_FROM_STREET", {
    lote: options.lotLabel ?? "?",
    ringEdgeIndex: hit.edgeIndex,
    segmentIndex,
    minDistM: round3(hit.minDistM),
    scoring: "wgs_edge_to_street_polyline",
  });

  return {
    ringEdgeIndex: hit.edgeIndex,
    segmentIndex,
    guide: hit.guide,
    minDistM: hit.minDistM,
  };
}

/**
 * Segmento oficial TXT mais próximo da rua (via aresta WGS84 real do polígono).
 */
export function findFrontSegmentIndexTouchingStreet(
  segments: OfficialLotSegment[],
  ringLngLat: number[][],
  guides: StreetGuideLineInput[],
  preferredGuideId?: string | null,
  lotLabel?: unknown,
  options?: Pick<
    FindFrontFromStreetOptions,
    "neighborRingsLngLat" | "block"
  >,
): number {
  const match = identifyLotFrontFromStreetGuides(ringLngLat, guides, {
    segments,
    preferredGuideId,
    lotLabel,
    neighborRingsLngLat: options?.neighborRingsLngLat,
    block: options?.block,
  });
  if (match) return match.segmentIndex;

  if (segments.length === 0) return 0;
  const ordered = [...segments].sort(
    (a, b) => a.segment_index - b.segment_index,
  );
  return ordered[0].segment_index;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** Melhor logradouro para a aresta de frente (WGS84 ou segment_index). */
export function pickStreetGuideForFrontSegment(
  ringLngLat: number[][],
  guides: StreetGuideLineInput[],
  frontSegmentIndex: number,
  _segmentCount?: number,
): StreetGuideLineInput | null {
  const ring = closedRingLngLat(ringLngLat);
  if (ring.length < 2 || guides.length === 0) return null;

  const edgeIdx = Math.min(Math.max(0, frontSegmentIndex), ring.length - 1);
  const p1 = ring[edgeIdx] as [number, number];
  const p2 = ring[(edgeIdx + 1) % ring.length] as [number, number];

  let best: StreetGuideLineInput | null = null;
  let bestMin = Infinity;

  for (const g of guides) {
    if (!g.coordinates || g.coordinates.length < 2) continue;
    const sc = scoreSegmentStreetProximity(p1, p2, g.coordinates);
    if (sc.minDistM < bestMin) {
      bestMin = sc.minDistM;
      best = g;
    }
  }
  return best;
}
