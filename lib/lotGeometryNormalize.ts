/**
 * Normalização segura de geometria e segmentos para confrontação automática.
 */

export type NormalizeGeometryResult = {
  ok: boolean;
  ring: [number, number][];
  reason?: string;
  geometryType?: string;
};

export type NormalizeSegmentsResult = {
  ok: boolean;
  segments: Record<string, unknown>[];
  reason?: string;
  source: 'segments_json' | 'geometry_ring' | 'none';
};

export type ConfrontationLotValidation = {
  valid: boolean;
  ring: [number, number][];
  segments: Record<string, unknown>[];
  reason?: string;
  geometryType?: string;
  segmentSource?: NormalizeSegmentsResult['source'];
};

function parseJsonMaybe<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return null;
    try {
      return JSON.parse(t) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function isFinitePair(c: unknown): c is [number, number] {
  return (
    Array.isArray(c) &&
    c.length >= 2 &&
    Number.isFinite(Number(c[0])) &&
    Number.isFinite(Number(c[1]))
  );
}

/** GeoJSON [lng,lat] ou [lat,lng] → [lat, lng]. */
export function coordPairToLatLng(c: unknown): [number, number] | null {
  if (!isFinitePair(c)) return null;
  const a = Number(c[0]);
  const b = Number(c[1]);
  const absA = Math.abs(a);
  const absB = Math.abs(b);

  if (absA <= 90 && absB > 90 && absB <= 180) {
    return [a, b];
  }
  if (absB <= 90 && absA > 90 && absA <= 180) {
    return [b, a];
  }
  if (absA <= 180 && absB <= 90) {
    return [b, a];
  }
  return [a, b];
}

function closeLatLngRing(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!isFinitePair(first)) return ring;
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

function ringFromFlatCoordArray(coords: unknown): [number, number][] {
  if (!Array.isArray(coords) || coords.length < 6) return [];
  if (coords.every((x) => typeof x === 'number' || typeof x === 'string')) {
    const nums = coords.map((x) => Number(x)).filter(Number.isFinite);
    if (nums.length < 6 || nums.length % 2 !== 0) return [];
    const pairs: unknown[] = [];
    for (let i = 0; i < nums.length; i += 2) {
      pairs.push([nums[i], nums[i + 1]]);
    }
    return ringFromCoordSequence(pairs);
  }
  return ringFromCoordSequence(coords);
}

function ringFromCoordSequence(coords: unknown): [number, number][] {
  if (!Array.isArray(coords)) return [];
  const ring: [number, number][] = [];
  for (const c of coords) {
    const p = coordPairToLatLng(c);
    if (p) ring.push(p);
  }
  return closeLatLngRing(ring);
}

function ringFromGeoJsonRing(ring: unknown): [number, number][] {
  if (!Array.isArray(ring)) return [];
  if (ring.length > 0 && typeof ring[0] === 'number') {
    return ringFromFlatCoordArray(ring);
  }
  return ringFromCoordSequence(ring);
}

function ringsFromGeoJsonGeometry(geom: Record<string, unknown>): [number, number][][] {
  const type = String(geom.type || '').toLowerCase();
  const coords = geom.coordinates;

  if (type === 'polygon' && Array.isArray(coords)) {
    const outer = coords[0];
    const r = ringFromGeoJsonRing(outer);
    return r.length ? [r] : [];
  }

  if (type === 'multipolygon' && Array.isArray(coords)) {
    const out: [number, number][][] = [];
    for (const poly of coords) {
      if (!Array.isArray(poly)) continue;
      const outer = poly[0];
      const r = ringFromGeoJsonRing(outer);
      if (r.length) out.push(r);
    }
    return out;
  }

  if (type === 'linestring' && Array.isArray(coords)) {
    const r = ringFromCoordSequence(coords);
    return r.length ? [r] : [];
  }

  if (Array.isArray(coords) && coords.length >= 3) {
    const direct = ringFromCoordSequence(coords);
    if (direct.length) return [direct];
    const flat = ringFromFlatCoordArray(coords);
    if (flat.length) return [flat];
  }

  return [];
}

function pickLargestRing(rings: [number, number][][]): [number, number][] {
  if (!rings.length) return [];
  return rings.reduce((best, r) => (r.length > best.length ? r : best), rings[0]);
}

function geometryPayloadFromBlock(
  block: Record<string, unknown>,
): Record<string, unknown> | null {
  const raw = block.geometry ?? block.geom ?? block.GeoJSON;
  const parsed = parseJsonMaybe<Record<string, unknown>>(raw);
  if (parsed && typeof parsed === 'object') {
    if (parsed.geometry && typeof parsed.geometry === 'object') {
      return parsed.geometry as Record<string, unknown>;
    }
    return parsed;
  }
  return null;
}

/**
 * Normaliza geometria do lote para anel [lat, lng] fechado.
 */
export function normalizeLotGeometry(
  block: Record<string, unknown>,
): NormalizeGeometryResult {
  const geom = geometryPayloadFromBlock(block);
  let geometryType = geom?.type ? String(geom.type) : undefined;

  if (geom) {
    const rings = ringsFromGeoJsonGeometry(geom);
    const ring = pickLargestRing(rings);
    if (ring.length >= 3) {
      return { ok: true, ring, geometryType };
    }
    if (rings.length === 0) {
      return {
        ok: false,
        ring: [],
        reason: 'sem anel de coordenadas',
        geometryType,
      };
    }
  }

  const boundsRaw = block.bounds;
  const boundsParsed = parseJsonMaybe<unknown>(boundsRaw);
  if (Array.isArray(boundsParsed)) {
    const ring = ringFromCoordSequence(boundsParsed);
    if (ring.length >= 3) {
      return { ok: true, ring, geometryType: 'bounds' };
    }
  }

  if (Array.isArray(block.geometry) && block.geometry.length >= 3) {
    const ring = ringFromCoordSequence(block.geometry);
    if (ring.length >= 3) {
      return { ok: true, ring, geometryType: 'array' };
    }
  }

  return {
    ok: false,
    ring: [],
    reason: geom ? 'geometria inválida' : 'geometria inválida',
    geometryType,
  };
}

function segmentsFromRing(ring: [number, number][]): Record<string, unknown>[] {
  if (ring.length < 2) return [];
  const out: Record<string, unknown>[] = [];
  const limit = ring.length - 1;
  for (let i = 0; i < limit; i++) {
    const [lat1, lng1] = ring[i];
    const [lat2, lng2] = ring[i + 1];
    if (
      !Number.isFinite(lat1) ||
      !Number.isFinite(lng1) ||
      !Number.isFinite(lat2) ||
      !Number.isFinite(lng2)
    ) {
      continue;
    }
    out.push({
      segment_index: i,
      vertex_order: i,
      north: lat1,
      east: lng1,
      end_north: lat2,
      end_east: lng2,
      type: 'LINE',
      source: 'geometry_ring',
    });
  }
  return out;
}

function normalizeSegmentsArray(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  const out: Record<string, unknown>[] = [];
  for (const item of raw) {
    if (item == null) continue;
    if (typeof item === 'number' && Number.isFinite(item)) {
      out.push({ length: item });
      continue;
    }
    if (typeof item === 'object') {
      out.push(item as Record<string, unknown>);
    }
  }
  return out;
}

/**
 * Normaliza segments_json; se ausente/inválido, deriva vértices do anel.
 */
export function normalizeLotSegments(
  block: Record<string, unknown>,
  ring?: [number, number][],
): NormalizeSegmentsResult {
  const rawParsed = parseJsonMaybe<unknown>(block.segments_json);
  let segments = normalizeSegmentsArray(rawParsed ?? block.segments_json);

  if (segments.length >= 2) {
    return { ok: true, segments, source: 'segments_json' };
  }

  const geomRing = ring ?? normalizeLotGeometry(block).ring;
  if (geomRing.length >= 3) {
    segments = segmentsFromRing(geomRing);
    if (segments.length >= 2) {
      return { ok: true, segments, source: 'geometry_ring' };
    }
  }

  return {
    ok: false,
    segments: [],
    reason: 'segments_json inválido',
    source: 'none',
  };
}

function ringPointsValid(ring: [number, number][]): boolean {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  for (const pt of ring) {
    if (!isFinitePair(pt)) return false;
  }
  return true;
}

/** Explica por que a confrontação aceita ou rejeita (somente diagnóstico). */
export function explainConfrontationValidation(
  block: Record<string, unknown>,
): {
  /** Campo(s) lidos por validateConfrontationLot / normalizeLotGeometry. */
  confrontationReads: string;
  normalizeOk: boolean;
  normalizeReason?: string;
  normalizedRingLength: number;
  ringPointsValid: boolean;
  ringPointsValidRule: string;
  valid: boolean;
  rejectionReason?: string;
} {
  const confrontationReads =
    'block.geometry (GeoJSON via normalizeLotGeometry) → fallback block.bounds';
  const geom = normalizeLotGeometry(block);

  if (!geom.ok || !Array.isArray(geom.ring)) {
    return {
      confrontationReads,
      normalizeOk: false,
      normalizeReason: geom.reason,
      normalizedRingLength: 0,
      ringPointsValid: false,
      ringPointsValidRule: 'anel com >= 4 pares [lat,lng] finitos',
      valid: false,
      rejectionReason: geom.reason || 'geometria inválida',
    };
  }

  const ringValid = ringPointsValid(geom.ring);
  const rejectionReason = !ringValid
    ? geom.ring.length < 4
      ? 'pontos insuficientes'
      : 'geometria inválida'
    : undefined;

  return {
    confrontationReads,
    normalizeOk: true,
    normalizedRingLength: geom.ring.length,
    ringPointsValid: ringValid,
    ringPointsValidRule: 'anel com >= 4 pares [lat,lng] finitos',
    valid: ringValid,
    rejectionReason,
  };
}

/**
 * Valida lote antes da confrontação automática.
 */
export function validateConfrontationLot(
  block: Record<string, unknown>,
): ConfrontationLotValidation {
  const geom = normalizeLotGeometry(block);
  const geometryType = geom.geometryType;

  if (!geom.ok || !Array.isArray(geom.ring)) {
    return {
      valid: false,
      ring: [],
      segments: [],
      reason: geom.reason || 'geometria inválida',
      geometryType,
    };
  }

  if (!ringPointsValid(geom.ring)) {
    const reason =
      geom.ring.length < 4 ? 'pontos insuficientes' : 'geometria inválida';
    return {
      valid: false,
      ring: geom.ring,
      segments: [],
      reason,
      geometryType,
    };
  }

  const seg = normalizeLotSegments(block, geom.ring);

  return {
    valid: true,
    ring: geom.ring,
    segments: seg.segments,
    reason: undefined,
    geometryType,
    segmentSource: seg.source,
  };
}

export function confrontationLotDiagnostics(
  block: Record<string, unknown>,
): {
  geometryType?: string;
  hasSegmentsJson: boolean;
  ringLength: number;
  segmentCount: number;
} {
  const geom = normalizeLotGeometry(block);
  const seg = normalizeLotSegments(block, geom.ring);
  const raw = block.segments_json;
  return {
    geometryType: geom.geometryType,
    hasSegmentsJson: raw != null && raw !== '',
    ringLength: geom.ring.length,
    segmentCount: seg.segments.length,
  };
}
