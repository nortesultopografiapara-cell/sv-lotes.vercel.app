/**
 * Construção de GeoJSON a partir de blocks (geometry / segments_json).
 * Não depende de coluna `geojson` (inexistente no schema atual).
 */

export type BlockGeoSource = 'geometry' | 'segments_json' | 'none';

export type BlockGeoFeature = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: Record<string, unknown> | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function parseMaybeJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const t = raw.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** Extrai geometria GeoJSON (Polygon/MultiPolygon/...) de blocks.geometry. */
export function geometryFromBlockGeometry(raw: unknown): Record<string, unknown> | null {
  const parsed = parseMaybeJson(raw);
  const obj = asRecord(parsed);
  if (!obj) return null;
  if (obj.type === 'Feature') {
    const g = asRecord(obj.geometry);
    return g?.type ? g : null;
  }
  if (obj.type === 'FeatureCollection') return null;
  if (typeof obj.type === 'string' && obj.coordinates != null) return obj;
  return null;
}

/**
 * Tenta montar Polygon a partir de segments_json com lat/lng (WGS84).
 * Segmentos só com UTM não geram geometria aqui.
 */
export function geometryFromSegmentsJson(raw: unknown): Record<string, unknown> | null {
  const parsed = parseMaybeJson(raw);
  const arr = Array.isArray(parsed) ? parsed : null;
  if (!arr || arr.length < 3) return null;

  const ring: number[][] = [];
  for (const item of arr) {
    const row = asRecord(item);
    if (!row) continue;
    const lat = Number(
      row.lat ?? row.latitude ?? row.start_lat ?? row.end_lat ?? row.y,
    );
    const lng = Number(
      row.lng ?? row.lon ?? row.longitude ?? row.start_lng ?? row.end_lng ?? row.x,
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // Heurística: lat ∈ [-90,90], lng ∈ [-180,180]
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    ring.push([lng, lat]);
  }
  if (ring.length < 3) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  if (ring.length < 4) return null;
  return { type: 'Polygon', coordinates: [ring] };
}

export function buildBlockGeoFeature(row: Record<string, unknown>): {
  feature: BlockGeoFeature;
  source: BlockGeoSource;
} {
  const properties: Record<string, unknown> = {
    id: row.id,
    project_id: row.project_id,
    block_name: row.block_name,
    lot_number: row.lot_number,
    number: row.number,
    area: row.area,
  };

  const fromGeom = geometryFromBlockGeometry(row.geometry);
  if (fromGeom) {
    return {
      source: 'geometry',
      feature: { type: 'Feature', properties, geometry: fromGeom },
    };
  }

  const fromSeg = geometryFromSegmentsJson(row.segments_json);
  if (fromSeg) {
    return {
      source: 'segments_json',
      feature: { type: 'Feature', properties, geometry: fromSeg },
    };
  }

  return {
    source: 'none',
    feature: { type: 'Feature', properties, geometry: null },
  };
}

export function blocksRowsToGeoJson(rows: Record<string, unknown>[]): {
  geojson: string;
  withGeometry: number;
  withoutGeometry: number;
  sources: Record<BlockGeoSource, number>;
} {
  const features: BlockGeoFeature[] = [];
  const sources: Record<BlockGeoSource, number> = {
    geometry: 0,
    segments_json: 0,
    none: 0,
  };
  for (const row of rows) {
    const { feature, source } = buildBlockGeoFeature(row);
    features.push(feature);
    sources[source] += 1;
  }
  return {
    geojson: JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
    withGeometry: sources.geometry + sources.segments_json,
    withoutGeometry: sources.none,
    sources,
  };
}
