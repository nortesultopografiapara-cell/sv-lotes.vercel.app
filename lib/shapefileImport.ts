import { area as turfArea } from '@turf/area';
import { polygon as turfPolygon } from '@turf/helpers';
import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson';

export type ShapefileLotFeature = {
  quadra: string;
  lote: string;
  area: number | null;
  matricula: string | null;
  geometry: Polygon;
  properties: Record<string, unknown>;
};

const LOTE_ATTR_KEYS = [
  'lote',
  'lot',
  'lot_num',
  'lot_number',
  'num_lote',
  'n_lote',
  'lote_num',
  'numero',
  'number',
  'n',
  'id_lote',
];

const QUADRA_ATTR_KEYS = [
  'quadra',
  'block',
  'block_name',
  'bloco',
  'qd',
  'qdra',
  'qdr',
  'name',
  'nome',
];

const AREA_ATTR_KEYS = ['area', 'area_m2', 'area_m', 'aream2', 'area_ha', 'm2'];

const MATRICULA_ATTR_KEYS = [
  'matricula',
  'matrícula',
  'matric',
  'matricul',
  'registro',
  'mat',
];

function normalizeAttrKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

function pickProperty(
  props: Record<string, unknown>,
  keys: string[],
): string | number | null {
  const normalized = new Map<string, unknown>();
  for (const [k, v] of Object.entries(props)) {
    normalized.set(normalizeAttrKey(k), v);
  }
  for (const key of keys) {
    const v = normalized.get(normalizeAttrKey(key));
    if (v != null && v !== '') return v as string | number;
  }
  return null;
}

/** Normaliza número do lote para associação com TXT (ex.: "07" → "7"). */
export function normalizeLotNumberForMatch(
  value: string | number | null | undefined,
): string {
  if (value == null) return '';
  let s = String(value).trim();
  s = s.replace(/^lote\s*/i, '').trim();
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s.toUpperCase();
}

export function lotNumbersMatch(
  shapeLote: string,
  blockNumber: string | null | undefined,
): boolean {
  const a = normalizeLotNumberForMatch(shapeLote);
  const b = normalizeLotNumberForMatch(blockNumber);
  if (!a || !b) return false;
  return a === b;
}

export function blockHasTxtOfficialData(
  block: Record<string, unknown>,
): boolean {
  if (block.source_import === 'TXT_CIVIL3D') return true;
  const segs = block.segments_json;
  if (!Array.isArray(segs) || segs.length === 0) return false;
  return segs.some(
    (s) =>
      s != null &&
      typeof s === 'object' &&
      ('segment_index' in (s as object) || 'distance' in (s as object)),
  );
}

function closeRing(ring: number[][]): number[][] {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...ring, [first[0], first[1]]];
  }
  return ring;
}

function ringFromPolygonCoords(coords: number[][][]): number[][] | null {
  const ring = coords[0];
  if (!ring || ring.length < 3) return null;
  const cleaned = ring
    .map((c) => [Number(c[0]), Number(c[1])] as [number, number])
    .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
  const closed = closeRing(cleaned);
  return closed.length >= 4 ? closed : null;
}

function polygonAreaFromRing(ring: number[][]): number {
  try {
    const poly = turfPolygon([[...ring]]);
    const m2 = turfArea(poly);
    return m2 > 0 ? parseFloat(m2.toFixed(2)) : 0;
  } catch {
    return 0;
  }
}

function geometryToPolygon(geom: Geometry): Polygon | null {
  if (geom.type === 'Polygon') {
    const ring = ringFromPolygonCoords(geom.coordinates);
    if (!ring) return null;
    return { type: 'Polygon', coordinates: [ring] };
  }
  if (geom.type === 'MultiPolygon') {
    let best: number[][] | null = null;
    let bestArea = 0;
    for (const polyCoords of geom.coordinates) {
      const ring = ringFromPolygonCoords(polyCoords);
      if (!ring) continue;
      const a = polygonAreaFromRing(ring);
      if (a > bestArea) {
        bestArea = a;
        best = ring;
      }
    }
    if (!best) return null;
    return { type: 'Polygon', coordinates: [best] };
  }
  return null;
}

function featureToLot(
  feature: Feature,
  defaultQuadra: string,
): ShapefileLotFeature | null {
  const props = (feature.properties || {}) as Record<string, unknown>;
  const loteRaw = pickProperty(props, LOTE_ATTR_KEYS);
  const quadraRaw = pickProperty(props, QUADRA_ATTR_KEYS);
  const areaRaw = pickProperty(props, AREA_ATTR_KEYS);
  const matriculaRaw = pickProperty(props, MATRICULA_ATTR_KEYS);

  const lote = loteRaw != null ? String(loteRaw).trim() : '';
  let quadra =
    quadraRaw != null ? String(quadraRaw).trim().toUpperCase() : '';
  if (!quadra && defaultQuadra.trim()) {
    quadra = defaultQuadra.trim().toUpperCase();
  }

  if (!lote || !quadra) return null;
  if (!feature.geometry) return null;

  const geometry = geometryToPolygon(feature.geometry);
  if (!geometry) return null;

  let area: number | null = null;
  if (areaRaw != null) {
    const n = parseFloat(String(areaRaw).replace(',', '.'));
    if (Number.isFinite(n) && n > 0) {
      const haKey = Object.keys(props).find((k) => {
        const nk = normalizeAttrKey(k);
        return nk.includes('ha') && !nk.includes('shape');
      });
      area =
        haKey && n < 500
          ? parseFloat((n * 10000).toFixed(2))
          : parseFloat(n.toFixed(2));
    }
  }
  if (area == null || area <= 0) {
    const ring = geometry.coordinates[0];
    const calc = polygonAreaFromRing(ring);
    area = calc > 0 ? calc : null;
  }

  const matricula =
    matriculaRaw != null ? String(matriculaRaw).trim() || null : null;

  return {
    quadra,
    lote,
    area,
    matricula,
    geometry,
    properties: props,
  };
}

function collectFeatures(geo: unknown): Feature[] {
  if (!geo) return [];
  if (Array.isArray(geo)) {
    return geo.flatMap((item) => collectFeatures(item));
  }
  const fc = geo as FeatureCollection;
  if (fc.type === 'FeatureCollection' && Array.isArray(fc.features)) {
    return fc.features;
  }
  if ((geo as Feature).type === 'Feature') {
    return [geo as Feature];
  }
  return [];
}

/**
 * Lê um .zip de shapefile (.shp, .shx, .dbf, .prj) e devolve lotes em WGS84.
 * shpjs reprojeta para EPSG:4326 quando há .prj no zip.
 */
export async function parseShapefileZipFile(
  file: File,
  defaultQuadra = '',
): Promise<ShapefileLotFeature[]> {
  const buffer = await file.arrayBuffer();
  const shp = (await import('shpjs')).default;
  const parsed = await shp(buffer);
  const features = collectFeatures(parsed);
  const lots: ShapefileLotFeature[] = [];
  const seen = new Set<string>();

  for (const feature of features) {
    const lot = featureToLot(feature, defaultQuadra);
    if (!lot) continue;
    const key = `${lot.quadra}|${normalizeLotNumberForMatch(lot.lote)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lots.push(lot);
  }

  if (lots.length === 0) {
    throw new Error(
      'Nenhum polígono válido com atributos de lote e quadra encontrado. Verifique os campos no DBF (lote, quadra) ou informe a quadra padrão.',
    );
  }

  return lots;
}

export function buildBlockMatchKey(quadra: string, lote: string): string {
  return `${quadra.trim().toUpperCase()}|${normalizeLotNumberForMatch(lote)}`;
}
