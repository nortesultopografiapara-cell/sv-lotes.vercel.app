/**
 * Worker: GeoJSON → ring lat/lng + centroid + AABB (somente exibição).
 * Não altera geometria oficial usada em memorial/prancha.
 */

export type WorkerParseInput = {
  id: string;
  number?: string | null;
  geometry: unknown;
};

export type WorkerParseResult = {
  id: string;
  bounds: Array<[number, number]>;
  centroid: [number, number];
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  geometryType: string;
  coordCount: number;
};

function isValid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function ringFromCoords(coords: unknown): Array<[number, number]> {
  if (!Array.isArray(coords)) return [];
  const out: Array<[number, number]> = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (!isValid(lat, lng)) continue;
    out.push([lat, lng]);
  }
  if (
    out.length >= 2 &&
    out[0][0] === out[out.length - 1][0] &&
    out[0][1] === out[out.length - 1][1]
  ) {
    out.pop();
  }
  return out;
}

export function parseGeometryForDisplay(input: WorkerParseInput): WorkerParseResult {
  const g = input.geometry as { type?: string; coordinates?: unknown } | null;
  const empty: WorkerParseResult = {
    id: input.id,
    bounds: [],
    centroid: [0, 0],
    minLat: 0,
    maxLat: 0,
    minLng: 0,
    maxLng: 0,
    geometryType: String(g?.type || ''),
    coordCount: 0,
  };
  if (!g?.type || !g.coordinates) return empty;

  let bounds: Array<[number, number]> = [];
  const type = g.type;

  if (type === 'Polygon') {
    const rings = g.coordinates as unknown[];
    bounds = ringFromCoords(rings?.[0]);
  } else if (type === 'MultiPolygon') {
    const polys = g.coordinates as unknown[];
    const first = polys?.[0] as unknown[];
    bounds = ringFromCoords(first?.[0]);
  } else if (type === 'LineString') {
    bounds = ringFromCoords(g.coordinates);
  } else if (type === 'MultiLineString') {
    const lines = g.coordinates as unknown[];
    bounds = ringFromCoords(lines?.[0]);
  }

  if (!bounds.length) return { ...empty, geometryType: type };

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let sumLat = 0;
  let sumLng = 0;
  for (const [lat, lng] of bounds) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    sumLat += lat;
    sumLng += lng;
  }
  const n = bounds.length;
  return {
    id: input.id,
    bounds,
    centroid: [sumLat / n, sumLng / n],
    minLat,
    maxLat,
    minLng,
    maxLng,
    geometryType: type,
    coordCount: n,
  };
}

export function parseGeometriesForDisplay(inputs: WorkerParseInput[]): WorkerParseResult[] {
  return inputs.map(parseGeometryForDisplay);
}
