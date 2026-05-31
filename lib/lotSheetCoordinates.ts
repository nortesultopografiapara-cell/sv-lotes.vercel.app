/**
 * Coordenadas reais (UTM) para prancha — sem valores localizados arbitrários.
 */

import proj4 from 'proj4';
import { buildUtmRingFromOfficialSegments } from '@/lib/civil3dTxtParser';
import {
  parseOfficialSegmentsFromBlock,
  type OfficialLotSegment,
} from '@/lib/officialLotMeasurements';

export type RealCoordSource =
  | 'segments_json'
  | 'coordinates_utm_json'
  | 'geometry_coordinates'
  | 'properties'
  | 'converted_from_latlng'
  | 'unavailable';

export type RealCoordinateRing = {
  available: boolean;
  source: RealCoordSource;
  /** [Easting, Northing] metros */
  ring: [number, number][];
};

const UNAVAILABLE_MSG =
  'Coordenadas reais não disponíveis para este lote';

export function coordinatesUnavailableMessage(): string {
  return UNAVAILABLE_MSG;
}

function closeRingDedup(ring: [number, number][]): [number, number][] {
  const verts: [number, number][] = [];
  for (const p of ring) {
    const last = verts[verts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) {
      verts.push(p);
    }
  }
  if (verts.length > 2) {
    const f = verts[0];
    const l = verts[verts.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.01) verts.pop();
  }
  return verts;
}

function isLikelyLatLng(a: number, b: number): boolean {
  const x = Math.abs(a);
  const y = Math.abs(b);
  return x <= 180 && y <= 90 && (x < 20 || y < 20);
}

function isLikelyUtm(e: number, n: number): boolean {
  const ae = Math.abs(e);
  const an = Math.abs(n);
  return ae > 10_000 && an > 100_000;
}

function ringFromEnPairs(pairs: [number, number][]): [number, number][] | null {
  const ring = closeRingDedup(pairs);
  if (ring.length < 3) return null;
  if (!ring.every(([e, n]) => isLikelyUtm(e, n))) return null;
  return ring;
}

function extractFromSegmentsJson(block: Record<string, unknown>): [number, number][] | null {
  const raw = block.segments_json;
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const pairs: [number, number][] = [];
  for (const seg of raw) {
    if (!seg || typeof seg !== 'object') continue;
    const s = seg as Record<string, unknown>;
    const e = Number(s.east ?? s.easting ?? s.Easting ?? s.x);
    const n = Number(s.north ?? s.northing ?? s.Northing ?? s.y);
    if (Number.isFinite(e) && Number.isFinite(n)) pairs.push([e, n]);
  }
  return ringFromEnPairs(pairs);
}

function extractFromCoordArray(coords: unknown): [number, number][] | null {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const pairs: [number, number][] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const a = Number(c[0]);
    const b = Number(c[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (isLikelyLatLng(a, b)) return null;
    if (isLikelyUtm(a, b)) pairs.push([a, b]);
    else if (isLikelyUtm(b, a)) pairs.push([b, a]);
    else return null;
  }
  return ringFromEnPairs(pairs);
}

function extractFromGeometry(block: Record<string, unknown>): [number, number][] | null {
  const geom = block.geometry as { coordinates?: number[][][] } | undefined;
  const ring = geom?.coordinates?.[0];
  if (!ring?.length) return null;
  return extractFromCoordArray(ring);
}

function extractFromProperties(block: Record<string, unknown>): [number, number][] | null {
  const props = block.properties as Record<string, unknown> | undefined;
  if (!props) return null;
  const verts = props.vertices ?? props.Vertices ?? props.coords;
  if (Array.isArray(verts)) {
    const pairs: [number, number][] = [];
    for (const v of verts) {
      if (!v || typeof v !== 'object') continue;
      const o = v as Record<string, unknown>;
      const e = Number(o.easting ?? o.E ?? o.Easting ?? o.x);
      const n = Number(o.northing ?? o.N ?? o.Northing ?? o.y);
      if (Number.isFinite(e) && Number.isFinite(n)) pairs.push([e, n]);
    }
    const r = ringFromEnPairs(pairs);
    if (r) return r;
  }
  return null;
}

function parseUtmZone(project: Record<string, unknown> | null | undefined): {
  zone: number;
  south: boolean;
} | null {
  const raw = String(
    project?.utm_zone ?? project?.zona_utm ?? project?.utmZone ?? '',
  ).trim();
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})\s*([NnSs])?/i);
  if (!m?.[1]) return null;
  const zone = Number(m[1]);
  if (!Number.isFinite(zone) || zone < 1 || zone > 60) return null;
  const south = !m[2] || m[2].toUpperCase() === 'S';
  return { zone, south };
}

function convertLatLngRingToUtm(
  ring: [number, number][],
  project: Record<string, unknown> | null | undefined,
): [number, number][] | null {
  const zoneInfo = parseUtmZone(project);
  if (!zoneInfo || ring.length < 3) return null;
  try {
    const def = `+proj=utm +zone=${zoneInfo.zone} +${zoneInfo.south ? 'south' : 'north'} +datum=WGS84 +units=m +no_defs`;
    const out: [number, number][] = [];
    for (const [lat, lng] of ring) {
      if (!isLikelyLatLng(lng, lat)) return null;
      const [e, n] = proj4('EPSG:4326', def, [lng, lat]) as [number, number];
      if (!isLikelyUtm(e, n)) return null;
      out.push([e, n]);
    }
    return ringFromEnPairs(out);
  } catch {
    return null;
  }
}

/** Anel [lat, lng] para conversão opcional. */
export function latLngRingFromBlockForConversion(
  block: Record<string, unknown>,
): [number, number][] {
  const geom = block.geometry as { type?: string; coordinates?: number[][][] } | undefined;
  if (geom?.type === 'Polygon' && geom.coordinates?.[0]?.length) {
    return geom.coordinates[0].map((c) => [c[1], c[0]] as [number, number]);
  }
  const bounds = block.bounds as [number, number][] | undefined;
  return bounds?.length ? [...bounds] : [];
}

/**
 * Resolve coordenadas UTM reais do lote (ordem de prioridade do requisito).
 */
export function resolveRealCoordinateRing(
  block: Record<string, unknown>,
  project?: Record<string, unknown> | null,
): RealCoordinateRing {
  const seg = extractFromSegmentsJson(block);
  if (seg) {
    console.log('LOT_SHEET_REAL_COORDINATES_SOURCE', {
      blockId: block.id,
      source: 'segments_json',
      vertices: seg.length,
    });
    return { available: true, source: 'segments_json', ring: seg };
  }

  const utmJson = extractFromCoordArray(block.coordinates_utm_json);
  if (utmJson) {
    console.log('LOT_SHEET_REAL_COORDINATES_SOURCE', {
      blockId: block.id,
      source: 'coordinates_utm_json',
      vertices: utmJson.length,
    });
    return { available: true, source: 'coordinates_utm_json', ring: utmJson };
  }

  const geomUtm = extractFromGeometry(block);
  if (geomUtm) {
    console.log('LOT_SHEET_REAL_COORDINATES_SOURCE', {
      blockId: block.id,
      source: 'geometry_coordinates',
      vertices: geomUtm.length,
    });
    return { available: true, source: 'geometry_coordinates', ring: geomUtm };
  }

  const props = extractFromProperties(block);
  if (props) {
    console.log('LOT_SHEET_REAL_COORDINATES_SOURCE', {
      blockId: block.id,
      source: 'properties',
      vertices: props.length,
    });
    return { available: true, source: 'properties', ring: props };
  }

  const latRing = latLngRingFromBlockForConversion(block);
  const converted = convertLatLngRingToUtm(latRing, project);
  if (converted) {
    console.log('LOT_SHEET_REAL_COORDINATES_SOURCE', {
      blockId: block.id,
      source: 'converted_from_latlng',
      vertices: converted.length,
    });
    return { available: true, source: 'converted_from_latlng', ring: converted };
  }

  console.log('LOT_SHEET_COORDINATES_UNAVAILABLE', {
    blockId: block.id,
    hasSegments: Boolean(block.segments_json),
    hasUtmJson: Boolean(block.coordinates_utm_json),
    hasGeometry: Boolean(block.geometry),
  });
  return { available: false, source: 'unavailable', ring: [] };
}

export type OfficialSheetLocalGeometry = {
  /** [x, y] com x = east - minEast, y = north - minNorth (metros). */
  localRing: [number, number][];
  bboxMeters: { minX: number; maxX: number; minY: number; maxY: number };
  utmRing: [number, number][];
  segments: OfficialLotSegment[];
};

/**
 * Croqui da prancha: polígono local somente a partir de segments_json TXT (UTM).
 */
export function buildOfficialSheetLocalGeometry(
  block: Record<string, unknown>,
): OfficialSheetLocalGeometry | null {
  const segments = parseOfficialSegmentsFromBlock(block);
  if (segments.length < 3) return null;

  console.log('LOT_SHEET_OFFICIAL_SEGMENTS', {
    blockId: block.id,
    lote: block.number ?? block.lot_number,
    count: segments.length,
    front_segment_index: block.front_segment_index,
    segments: segments.map((s) => ({
      index: s.segment_index,
      distance: s.distance,
      east: s.east,
      north: s.north,
      bearing: s.bearing,
    })),
  });

  const utmRing: [number, number][] = buildUtmRingFromOfficialSegments(
    segments,
    block.number ?? block.id,
  );

  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const [e, n] of utmRing) {
    if (!Number.isFinite(e) || !Number.isFinite(n)) return null;
    minE = Math.min(minE, e);
    maxE = Math.max(maxE, e);
    minN = Math.min(minN, n);
    maxN = Math.max(maxN, n);
  }

  const localRing = utmRing.map(
    ([e, n]) => [e - minE, n - minN] as [number, number],
  );
  const bboxMeters = {
    minX: 0,
    maxX: maxE - minE,
    minY: 0,
    maxY: maxN - minN,
  };

  console.log('LOT_SHEET_LOCAL_POINTS', {
    blockId: block.id,
    lote: block.number,
    pointCount: localRing.length,
    minEast: minE,
    minNorth: minN,
    localRing,
  });

  console.log('LOT_SHEET_SCALE_BBOX', {
    blockId: block.id,
    bbox: bboxMeters,
    widthM: bboxMeters.maxX,
    heightM: bboxMeters.maxY,
  });

  return { localRing, bboxMeters, utmRing, segments };
}
