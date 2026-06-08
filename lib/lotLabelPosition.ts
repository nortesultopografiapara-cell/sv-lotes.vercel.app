/**
 * Posicionamento do rótulo do lote no mapa — obedece frente oficial (front_segment_index).
 * Não depende da visibilidade das linhas de rua no mapa.
 */

import {
  lngLatEdgeAtRingIndex,
  resolveFrontWgs84RingIndex,
} from '@/lib/resolveFrontStreetGuide';
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
  /** segments_json UTM — necessário para normalizar índice UTM → aresta WGS84. */
  segments_json?: unknown;
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

function openBoundsVerts(bounds: LatLngPair[]): LatLngPair[] {
  const out: LatLngPair[] = [];
  for (const p of bounds) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-9) {
      out.push(p);
    }
  }
  if (out.length > 2) {
    const f = out[0];
    const l = out[out.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-9) out.pop();
  }
  return out;
}

/** GeoJSON explícito evita inversão lat/lng em normalizeLotGeometry (ambos |coord| < 90). */
function labelBlockFromBounds(
  bounds: LatLngPair[],
  lot?: LotLabelPositionInput | null,
  storedIdx?: number | null,
): Record<string, unknown> {
  const ringLngLat = bounds.map(([lat, lng]) => [lng, lat]);
  if (ringLngLat.length >= 3) {
    const first = ringLngLat[0];
    const last = ringLngLat[ringLngLat.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ringLngLat.push([first[0], first[1]]);
    }
  }
  return {
    bounds,
    segments_json: lot?.segments_json ?? null,
    front_segment_index: storedIdx ?? lot?.frontSegmentIndex ?? null,
    geometry: {
      type: 'Polygon',
      coordinates: [ringLngLat],
    },
  };
}

function edgeMidFromBounds(
  bounds: LatLngPair[],
  edgeIndex: number,
): LatLngPair | null {
  const verts = openBoundsVerts(bounds);
  if (verts.length < 2 || edgeIndex < 0) return null;
  const n = verts.length;
  const i = edgeIndex % n;
  const a = verts[i];
  const b = verts[(i + 1) % n];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function labelPositionFromRingEdge(
  bounds: LatLngPair[],
  block: Record<string, unknown>,
  ringEdgeIndex: number,
): LatLngPair | null {
  const centroid = polygonCentroid(bounds);
  let frontMid = edgeMidFromBounds(bounds, ringEdgeIndex);
  if (!frontMid) {
    const edge = lngLatEdgeAtRingIndex(block, ringEdgeIndex);
    if (!edge) return null;
    frontMid = [
      (edge.p1[1] + edge.p2[1]) / 2,
      (edge.p1[0] + edge.p2[0]) / 2,
    ];
  }
  const offset = offsetPointToward(
    frontMid,
    centroid,
    LABEL_INWARD_OFFSET_METERS,
  );
  return ensureInsideLot(offset, bounds, centroid, frontMid);
}

function labelPositionFromSegment(
  bounds: LatLngPair[],
  frontSeg: Segment,
): LatLngPair {
  const centroid = polygonCentroid(bounds);
  const frontMid = frontSegmentMidpoint(frontSeg);
  const offset = offsetPointToward(
    frontMid,
    centroid,
    LABEL_INWARD_OFFSET_METERS,
  );
  return ensureInsideLot(offset, bounds, centroid, frontMid);
}

function hasOfficialFrontStreet(lot?: LotLabelPositionInput | null): boolean {
  return Boolean(
    lot?.frontStreetName || lot?.frontStreetDisplay || lot?.frontStreetId,
  );
}

/**
 * Posição do label: prioridade front_segment_index normalizado → frente+rua → detectFront → centróide.
 * Com front_segment_index salvo, não recalcula frente (detectFront).
 */
export function computeOfficialLotLabelPosition(
  bounds: LatLngPair[],
  lot?: LotLabelPositionInput | null,
): LatLngPair {
  const centroid = polygonCentroid(bounds);
  if (bounds.length < 3) return centroid;

  const storedIdx =
    lot?.frontSegmentIndex != null && Number.isFinite(Number(lot.frontSegmentIndex))
      ? Number(lot.frontSegmentIndex)
      : null;

  if (storedIdx != null && storedIdx >= 0) {
    const block = labelBlockFromBounds(bounds, lot, storedIdx);
    const ringIdx = resolveFrontWgs84RingIndex(block);
    if (ringIdx >= 0) {
      const fromRing = labelPositionFromRingEdge(bounds, block, ringIdx);
      if (fromRing) return fromRing;
    }

    const fromRaw = labelPositionFromRingEdge(bounds, block, storedIdx);
    if (fromRaw) return fromRaw;

    const ring = boundsToLngLatRing(bounds);
    const segments = extractSegments(ring, []);
    const frontSeg = resolveFrontSegmentFromIndex(segments, storedIdx);
    if (frontSeg) return labelPositionFromSegment(bounds, frontSeg);

    return centroid;
  }

  const ring = boundsToLngLatRing(bounds);
  const segments = extractSegments(ring, []);
  if (segments.length === 0) return centroid;

  let frontSeg: Segment | null = null;
  const frenteLen = lot?.frente != null ? Number(lot.frente) : 0;
  const hasDbFront = hasOfficialFrontStreet(lot);

  if (frenteLen > 0 && hasDbFront) {
    frontSeg = pickFrontSegmentByFrenteLength(segments, frenteLen);
  }

  if (!frontSeg) {
    if (!hasDbFront) return centroid;
    frontSeg = detectFront(segments);
  }

  return labelPositionFromSegment(bounds, frontSeg);
}
