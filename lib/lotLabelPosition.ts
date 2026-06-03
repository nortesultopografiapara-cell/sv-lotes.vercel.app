/**
 * Posicionamento do rótulo do lote no mapa — obedece frente oficial (front_segment_index).
 * Não depende da visibilidade das linhas de rua no mapa.
 */

import {
  detectFront,
  extractSegments,
  type Segment,
} from '@/utils/calculateLotDimensions';

export type LatLngPair = [number, number];

export type LotLabelPositionInput = {
  frente?: number | null;
  frontSegmentIndex?: number | null;
  frontStreetName?: string | null;
  frontStreetDisplay?: string | null;
  frontStreetId?: string | null;
};

const LABEL_INWARD_OFFSET_METERS = 2.5;

function boundsToLngLatRing(bounds: LatLngPair[]): number[][] {
  const ring = bounds.map(([lat, lng]) => [lng, lat] as [number, number]);
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

function polygonCentroid(bounds: LatLngPair[]): LatLngPair {
  if (bounds.length === 0) return [0, 0];
  let lat = 0;
  let lng = 0;
  for (const [la, ln] of bounds) {
    lat += la;
    lng += ln;
  }
  return [lat / bounds.length, lng / bounds.length];
}

function distanceMeters(a: LatLngPair, b: LatLngPair): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function offsetPointToward(
  from: LatLngPair,
  toward: LatLngPair,
  meters: number,
): LatLngPair {
  const dist = distanceMeters(from, toward);
  if (dist < 0.5) return from;
  const t = Math.min(meters / dist, 0.5);
  return [
    from[0] + (toward[0] - from[0]) * t,
    from[1] + (toward[1] - from[1]) * t,
  ];
}

function pointInsidePolygon(lat: number, lng: number, bounds: LatLngPair[]): boolean {
  let inside = false;
  for (let i = 0, j = bounds.length - 1; i < bounds.length; j = i++) {
    const yi = bounds[i][0];
    const xi = bounds[i][1];
    const yj = bounds[j][0];
    const xj = bounds[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function frontSegmentMidpoint(seg: Segment): LatLngPair {
  return [(seg.p1[1] + seg.p2[1]) / 2, (seg.p1[0] + seg.p2[0]) / 2];
}

/** Mapeia índice oficial TXT/aresta → segmento da geometria do polígono. */
export function resolveFrontSegmentFromIndex(
  segments: Segment[],
  frontSegmentIndex: number,
): Segment | null {
  if (!Number.isFinite(frontSegmentIndex) || frontSegmentIndex < 0) return null;
  if (segments.length === 0) return null;

  const byOriginal = segments.find((s) => s.originalIndex === frontSegmentIndex);
  if (byOriginal) return byOriginal;

  const external = segments
    .filter((s) => s.isExternal)
    .sort((a, b) => a.originalIndex - b.originalIndex);
  if (frontSegmentIndex < external.length) {
    return external[frontSegmentIndex];
  }

  if (frontSegmentIndex < segments.length) {
    return segments[frontSegmentIndex];
  }

  return segments[frontSegmentIndex % segments.length] ?? null;
}

function pickFrontSegmentByFrenteLength(
  segments: Segment[],
  frenteLen: number,
): Segment | null {
  const pool = segments.filter((s) => s.isExternal);
  const candidates = pool.length > 0 ? pool : segments;
  if (candidates.length === 0) return null;
  const match = candidates.reduce((best, s) => {
    const d = Math.abs(s.length - frenteLen);
    const bd = Math.abs(best.length - frenteLen);
    return d < bd ? s : best;
  });
  if (Math.abs(match.length - frenteLen) <= Math.max(frenteLen * 0.4, 4)) {
    return match;
  }
  return null;
}

function ensureInsideLot(
  candidate: LatLngPair,
  bounds: LatLngPair[],
  centroid: LatLngPair,
  frontMid: LatLngPair,
): LatLngPair {
  if (pointInsidePolygon(candidate[0], candidate[1], bounds)) {
    return candidate;
  }
  for (const meters of [1.5, 1, 0.5, 0]) {
    const p = offsetPointToward(frontMid, centroid, meters);
    if (pointInsidePolygon(p[0], p[1], bounds)) return p;
  }
  return centroid;
}

/**
 * Posição do label: prioridade front_segment_index → frente+rua → detectFront → centróide.
 */
export function computeOfficialLotLabelPosition(
  bounds: LatLngPair[],
  lot?: LotLabelPositionInput | null,
): LatLngPair {
  const centroid = polygonCentroid(bounds);
  if (bounds.length < 3) return centroid;

  const ring = boundsToLngLatRing(bounds);
  const segments = extractSegments(ring, []);
  if (segments.length === 0) return centroid;

  const storedIdx =
    lot?.frontSegmentIndex != null && Number.isFinite(Number(lot.frontSegmentIndex))
      ? Number(lot.frontSegmentIndex)
      : null;

  let frontSeg: Segment | null = null;

  if (storedIdx != null && storedIdx >= 0) {
    frontSeg = resolveFrontSegmentFromIndex(segments, storedIdx);
  }

  if (!frontSeg) {
    const frenteLen = lot?.frente != null ? Number(lot.frente) : 0;
    const hasDbFront = Boolean(
      lot?.frontStreetName || lot?.frontStreetDisplay || lot?.frontStreetId,
    );
    if (frenteLen > 0 && hasDbFront) {
      frontSeg = pickFrontSegmentByFrenteLength(segments, frenteLen);
    }
  }

  if (!frontSeg) {
    const hasDbFront = Boolean(
      lot?.frontStreetName || lot?.frontStreetDisplay || lot?.frontStreetId,
    );
    if (!hasDbFront) return centroid;
    frontSeg = detectFront(segments);
  }

  const frontMid = frontSegmentMidpoint(frontSeg);
  const offset = offsetPointToward(frontMid, centroid, LABEL_INWARD_OFFSET_METERS);
  return ensureInsideLot(offset, bounds, centroid, frontMid);
}
