/**
 * Frente de lote por toque/proximidade à linha de rua (não por paralelismo isolado).
 * Usado em Identificar Frentes e mapeamento TXT ↔ geometria.
 */

import { lineString, point } from "@turf/helpers";
import distance from "@turf/distance";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import type { OfficialLotSegment } from "@/lib/officialLotMeasurements";
import { flattenLineStringCoordinates } from "@/lib/streetGuideConfrontation";

export type StreetGuideLineInput = {
  id?: string;
  coordinates: number[][];
};

const TOUCH_STREET_MAX_M = 50;
/** Endpoints à mesma distância da rua = paralelo, não necessariamente frente. */
const PARALLEL_VARIANCE_MAX_M = 1.5;

export type SegmentStreetProximityScore = {
  minDistM: number;
  avgDistM: number;
  parallelVarianceM: number;
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
  const d1 = nearestDistM(p1LngLat, lineCoords);
  const d2 = nearestDistM(p2LngLat, lineCoords);
  const mid: [number, number] = [
    (p1LngLat[0] + p2LngLat[0]) / 2,
    (p1LngLat[1] + p2LngLat[1]) / 2,
  ];
  const dMid = nearestDistM(mid, lineCoords);
  return {
    minDistM: Math.min(d1, d2, dMid),
    avgDistM: (d1 + d2) / 2,
    parallelVarianceM: Math.abs(d1 - d2),
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

function closedRingLngLat(ring: number[][]): number[][] {
  if (ring.length < 2) return ring;
  const out = [...ring];
  const f = out[0];
  const l = out[out.length - 1];
  if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-9) out.pop();
  return out;
}

/**
 * Segmento que toca a rua (menor distância mínima) — paralelo afastado fica como lateral.
 */
export function findFrontSegmentIndexTouchingStreet(
  segments: OfficialLotSegment[],
  ringLngLat: number[][],
  guides: StreetGuideLineInput[],
  preferredGuideId?: string | null,
  lotLabel?: unknown,
): number {
  if (segments.length === 0) return 0;

  const ordered = [...segments].sort(
    (a, b) => a.segment_index - b.segment_index,
  );
  const ring = closedRingLngLat(ringLngLat);
  const activeGuides = guides.filter(
    (g) => g.coordinates && g.coordinates.length >= 2,
  );
  if (activeGuides.length === 0 || ring.length < 2) {
    return ordered[0].segment_index;
  }

  const guideOrder = [...activeGuides];
  if (preferredGuideId) {
    guideOrder.sort((a, b) => {
      const ap = String(a.id) === String(preferredGuideId) ? 0 : 1;
      const bp = String(b.id) === String(preferredGuideId) ? 0 : 1;
      return ap - bp;
    });
  }

  let bestIdx = ordered[0].segment_index;
  let bestMin = Infinity;
  const scoresBySegment = new Map<
    number,
    SegmentStreetProximityScore & { rejectedParallelOnly?: boolean }
  >();

  for (let i = 0; i < ordered.length; i++) {
    const segIdx = ordered[i].segment_index;
    const iRing = Math.min(i, ring.length - 1);
    const p1 = ring[iRing] as [number, number];
    const p2 = ring[(iRing + 1) % ring.length] as [number, number];

    let segScore: SegmentStreetProximityScore = {
      minDistM: Infinity,
      avgDistM: Infinity,
      parallelVarianceM: 0,
    };

    for (const g of guideOrder) {
      const sc = scoreSegmentStreetProximity(p1, p2, g.coordinates);
      if (sc.minDistM < segScore.minDistM) segScore = sc;
    }
    scoresBySegment.set(segIdx, segScore);

    if (segScore.minDistM < bestMin) {
      bestMin = segScore.minDistM;
      bestIdx = segIdx;
    }
  }

  for (const [segIdx, sc] of scoresBySegment) {
    if (segIdx === bestIdx) continue;
    if (isParallelOnlyCandidate(sc, bestMin)) {
      sc.rejectedParallelOnly = true;
      console.log("FRONT_SEGMENT_REJECTED_PARALLEL_ONLY", {
        lote: lotLabel ?? "?",
        segmentIndex: segIdx,
        minDistM: round3(sc.minDistM),
        avgDistM: round3(sc.avgDistM),
        parallelVarianceM: round3(sc.parallelVarianceM),
        chosenFrontIndex: bestIdx,
        chosenMinDistM: round3(bestMin),
        note: "paralelo à rua sem tocar — classificar como lateral",
      });
    }
  }

  console.log("FRONT_SEGMENT_SELECTED_FROM_STREET", {
    lote: lotLabel ?? "?",
    frontIndex: bestIdx,
    minDistM: round3(bestMin),
    preferredGuideId: preferredGuideId ?? null,
    scoring: "min_touch_distance",
  });

  return bestIdx;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** Melhor logradouro para o segmento de frente escolhido. */
export function pickStreetGuideForFrontSegment(
  ringLngLat: number[][],
  guides: StreetGuideLineInput[],
  frontSegmentIndex: number,
  segmentCount: number,
): StreetGuideLineInput | null {
  const ring = closedRingLngLat(ringLngLat);
  if (ring.length < 2 || guides.length === 0) return null;

  const iRing = Math.min(
    Math.max(0, frontSegmentIndex),
    ring.length - 1,
  );
  const p1 = ring[iRing] as [number, number];
  const p2 = ring[(iRing + 1) % ring.length] as [number, number];

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
