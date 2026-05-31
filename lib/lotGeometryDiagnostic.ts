/**
 * Diagnóstico de geometria dos lotes (somente leitura / console).
 * Não altera confrontação nem importação.
 */

import { parseOfficialSegmentsFromBlock } from '@/lib/officialLotMeasurements';
import {
  normalizeLotGeometry,
  normalizeLotSegments,
  validateConfrontationLot,
} from '@/lib/lotGeometryNormalize';

export const LOT_GEOMETRY_DIAGNOSTIC_BUILD_ID =
  'v1.9.5-confrontation-diagnostic-forced';

if (typeof window !== 'undefined') {
  console.error(
    'LOT_GEOMETRY_DIAGNOSTIC MODULE LOADED',
    LOT_GEOMETRY_DIAGNOSTIC_BUILD_ID,
  );
}

export type LotGeometryDiagnosticSummary = {
  total: number;
  geometryOk: number;
  geometryInvalid: number;
  geometryEmpty: number;
  segmentsJsonOk: number;
  segmentsJsonInvalid: number;
  segmentsJsonEmpty: number;
  gisMapRingOk: number;
  confrontationValid: number;
  confrontationInvalid: number;
  recommendedField: string;
  recommendedReason: string;
};

const KNOWN_GEOM_KEYS = [
  'geometry',
  'segments_json',
  'coordinates_utm_json',
  'bounds',
  'properties',
  'vertices_json',
  'boundary_points',
  'geom',
  'GeoJSON',
  'coordinates',
  'perimeter',
  'area',
  'source_import',
] as const;

function isValidLatLngPair(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (Math.abs(lat) > 1_000 || Math.abs(lng) > 1_000) return false;
  return true;
}

/** Mesma regra do GISMap.boundsFromBlockGeometry — perímetro exibido no mapa. */
export function gisMapRingFromBlock(block: Record<string, unknown>): {
  ok: boolean;
  ring: [number, number][];
  geometryType: string;
  rawCoordCount: number;
} {
  const geom = block.geometry as {
    type?: string;
    coordinates?: unknown;
  } | null;

  if (!geom?.type || geom.coordinates == null) {
    return { ok: false, ring: [], geometryType: 'none', rawCoordCount: 0 };
  }

  const gType = String(geom.type);
  let ringRaw: unknown[] = [];

  if (gType === 'Polygon') {
    const poly = geom.coordinates as unknown[];
    ringRaw = (Array.isArray(poly?.[0]) ? poly[0] : []) as unknown[];
  } else if (gType === 'LineString') {
    ringRaw = (geom.coordinates as unknown[]) || [];
  } else if (gType === 'MultiPolygon') {
    const multi = geom.coordinates as unknown[];
    const firstPoly = Array.isArray(multi?.[0]) ? multi[0] : [];
    ringRaw = (Array.isArray(firstPoly?.[0]) ? firstPoly[0] : []) as unknown[];
  } else if (gType === 'MultiLineString') {
    const multi = geom.coordinates as unknown[];
    ringRaw = (Array.isArray(multi?.[0]) ? multi[0] : []) as unknown[];
  }

  const ring: [number, number][] = [];
  for (const c of ringRaw) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (isValidLatLngPair(lat, lng)) ring.push([lat, lng]);
  }

  return {
    ok: ring.length >= 3,
    ring,
    geometryType: gType,
    rawCoordCount: ringRaw.length,
  };
}

function parseJsonMaybe(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
  return value;
}

function typeLabel(value: unknown): string {
  if (value == null) return 'null';
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (typeof value === 'string') return `string(${value.length})`;
  if (typeof value === 'object') return `object`;
  return typeof value;
}

function sampleCoordRing(coords: unknown, max = 2): unknown {
  if (!Array.isArray(coords)) return coords;
  const outer =
    Array.isArray(coords[0]) && typeof coords[0][0] === 'number'
      ? coords
      : Array.isArray(coords[0]?.[0])
        ? (coords as unknown[])[0]
        : coords;
  if (!Array.isArray(outer)) return { type: typeLabel(coords), sample: null };
  return {
    length: outer.length,
    first: outer.slice(0, max),
    last: outer.length > max ? outer[outer.length - 1] : undefined,
  };
}

function collectGeometricFields(
  block: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of KNOWN_GEOM_KEYS) {
    if (key in block) out[key] = block[key];
  }
  for (const key of Object.keys(block)) {
    if (out[key] != null) continue;
    if (/geom|coord|segment|bound|vert|ring|utm|perímetro|perimeter/i.test(key)) {
      out[key] = block[key];
    }
  }
  return out;
}

function segmentsJsonStatus(block: Record<string, unknown>): {
  ok: boolean;
  empty: boolean;
  count: number;
  source: string;
} {
  const raw = parseJsonMaybe(block.segments_json) ?? block.segments_json;
  if (raw == null || raw === '') {
    return { ok: false, empty: true, count: 0, source: 'empty' };
  }
  const official = parseOfficialSegmentsFromBlock(block);
  if (official.length >= 3) {
    return { ok: true, empty: false, count: official.length, source: 'official_parse' };
  }
  const norm = normalizeLotSegments(block);
  if (norm.ok && norm.segments.length >= 2) {
    return {
      ok: true,
      empty: false,
      count: norm.segments.length,
      source: norm.source,
    };
  }
  return {
    ok: false,
    empty: false,
    count: Array.isArray(raw) ? raw.length : 0,
    source: 'invalid',
  };
}

function coordinatesUtmStatus(block: Record<string, unknown>): {
  ok: boolean;
  count: number;
} {
  const raw = parseJsonMaybe(block.coordinates_utm_json) ?? block.coordinates_utm_json;
  if (!Array.isArray(raw) || raw.length < 3) {
    return { ok: false, count: Array.isArray(raw) ? raw.length : 0 };
  }
  let valid = 0;
  for (const p of raw) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const e = Number(p[0]);
    const n = Number(p[1]);
    if (Number.isFinite(e) && Number.isFinite(n)) valid++;
  }
  return { ok: valid >= 3, count: valid };
}

function geometryStorageStatus(block: Record<string, unknown>): {
  ok: boolean;
  empty: boolean;
  type?: string;
  coordSample?: unknown;
} {
  const raw = block.geometry;
  if (raw == null) return { ok: false, empty: true };
  const parsed = parseJsonMaybe(raw) ?? raw;
  if (parsed == null) return { ok: false, empty: true };
  if (typeof parsed === 'string') {
    return { ok: false, empty: false, type: 'string_unparsed' };
  }
  if (typeof parsed !== 'object') {
    return { ok: false, empty: false, type: typeof parsed };
  }
  const geom = parsed as Record<string, unknown>;
  const norm = normalizeLotGeometry(block);
  return {
    ok: norm.ok,
    empty: false,
    type: String(geom.type ?? 'unknown'),
    coordSample: sampleCoordRing(geom.coordinates),
  };
}

function pickPerimeterSource(block: Record<string, unknown>): {
  field: string;
  reason: string;
} {
  const gis = gisMapRingFromBlock(block);
  if (gis.ok) {
    return {
      field: 'geometry',
      reason:
        'Campo geometry (GeoJSON Polygon lat/lng) é o mesmo usado pelo GISMap para desenhar o lote no mapa.',
    };
  }

  const segs = segmentsJsonStatus(block);
  if (segs.ok) {
    return {
      field: 'segments_json',
      reason:
        'geometry ausente ou sem lat/lng válidos; segments_json (TXT Civil 3D) contém a cadeia oficial UTM para reconstruir o perímetro.',
    };
  }

  const utm = coordinatesUtmStatus(block);
  if (utm.ok) {
    return {
      field: 'coordinates_utm_json',
      reason:
        'geometry e segments_json insuficientes; coordinates_utm_json guarda vértices [east, north] da importação TXT.',
    };
  }

  return {
    field: 'nenhum',
    reason:
      'Nenhum campo com perímetro lat/lng válido para o mapa nem cadeia UTM oficial completa.',
  };
}

export function analyzeLotGeometryBlock(block: Record<string, unknown>) {
  const geomStore = geometryStorageStatus(block);
  const gis = gisMapRingFromBlock(block);
  const norm = normalizeLotGeometry(block);
  const validation = validateConfrontationLot(block);
  const segs = segmentsJsonStatus(block);
  const utm = coordinatesUtmStatus(block);
  const perimeter = pickPerimeterSource(block);

  return {
    id: block.id,
    number: block.number ?? block.lot,
    block_name: block.block_name ?? block.name,
    source_import: block.source_import,
    geomStore,
    gis,
    norm,
    validation,
    segs,
    utm,
    perimeter,
  };
}

export function buildLotGeometryDiagnosticSummary(
  blocks: Record<string, unknown>[],
): LotGeometryDiagnosticSummary {
  let geometryOk = 0;
  let geometryInvalid = 0;
  let geometryEmpty = 0;
  let segmentsJsonOk = 0;
  let segmentsJsonInvalid = 0;
  let segmentsJsonEmpty = 0;
  let gisMapRingOk = 0;
  let confrontationValid = 0;
  let confrontationInvalid = 0;

  const fieldVotes = new Map<string, number>();

  for (const block of blocks) {
    const a = analyzeLotGeometryBlock(block);

    if (a.geomStore.empty) geometryEmpty++;
    else if (a.geomStore.ok) geometryOk++;
    else geometryInvalid++;

    if (a.segs.empty) segmentsJsonEmpty++;
    else if (a.segs.ok) segmentsJsonOk++;
    else segmentsJsonInvalid++;

    if (a.gis.ok) gisMapRingOk++;
    if (a.validation.valid) confrontationValid++;
    else confrontationInvalid++;

    fieldVotes.set(
      a.perimeter.field,
      (fieldVotes.get(a.perimeter.field) || 0) + 1,
    );
  }

  const topField = [...fieldVotes.entries()].sort((x, y) => y[1] - x[1])[0];

  return {
    total: blocks.length,
    geometryOk,
    geometryInvalid,
    geometryEmpty,
    segmentsJsonOk,
    segmentsJsonInvalid,
    segmentsJsonEmpty,
    gisMapRingOk,
    confrontationValid,
    confrontationInvalid,
    recommendedField: topField?.[0] ?? 'geometry',
    recommendedReason:
      'Para este projeto, a maioria dos lotes deve usar o campo indicado abaixo como fonte do perímetro na confrontação automática.',
  };
}

function debugPayloadForLot(block: Record<string, unknown>) {
  const geom = block.geometry as { type?: string; coordinates?: unknown } | null;
  const geomParsed = parseJsonMaybe(block.geometry) ?? block.geometry;

  return {
    'lot.id': block.id,
    'lot.number': block.number ?? block.lot,
    geometry: geomParsed ?? geom,
    'geometry.type': geom?.type ?? (geomParsed as { type?: string })?.type,
    'geometry.coordinates': sampleCoordRing(
      (geomParsed as { coordinates?: unknown })?.coordinates ??
        geom?.coordinates,
    ),
    segments_json: {
      type: typeLabel(block.segments_json),
      parsedType: typeLabel(parseJsonMaybe(block.segments_json)),
      length: Array.isArray(block.segments_json)
        ? block.segments_json.length
        : Array.isArray(parseJsonMaybe(block.segments_json))
          ? (parseJsonMaybe(block.segments_json) as unknown[]).length
          : 0,
      sample: Array.isArray(block.segments_json)
        ? block.segments_json.slice(0, 1)
        : null,
    },
    vertices_json: block.vertices_json ?? null,
    boundary_points: block.boundary_points ?? null,
    coordinates_utm_json: {
      type: typeLabel(block.coordinates_utm_json),
      length: Array.isArray(block.coordinates_utm_json)
        ? block.coordinates_utm_json.length
        : 0,
      sample: Array.isArray(block.coordinates_utm_json)
        ? block.coordinates_utm_json.slice(0, 2)
        : null,
    },
    bounds: block.bounds ?? null,
    source_import: block.source_import ?? null,
    otherGeometricFields: collectGeometricFields(block),
    analysis: analyzeLotGeometryBlock(block),
  };
}

function emptyDiagnosticSummary(): LotGeometryDiagnosticSummary {
  return {
    total: 0,
    geometryOk: 0,
    geometryInvalid: 0,
    geometryEmpty: 0,
    segmentsJsonOk: 0,
    segmentsJsonInvalid: 0,
    segmentsJsonEmpty: 0,
    gisMapRingOk: 0,
    confrontationValid: 0,
    confrontationInvalid: 0,
    recommendedField: 'nenhum',
    recommendedReason: 'diagnóstico não executado',
  };
}

/**
 * Emite [LOT GEOMETRY DEBUG] no console (primeiros N lotes + resumo).
 * Usa console.warn para aparecer com filtro "Warnings" no DevTools (produção).
 */
export function runLotGeometryDiagnosticReport(
  blocks: Record<string, unknown>[],
  options?: { projectId?: string; context?: string; sampleCount?: number },
): LotGeometryDiagnosticSummary {
  const context = options?.context ?? 'report';
  const projectId = options?.projectId ?? '?';
  const list = Array.isArray(blocks) ? blocks : [];

  console.error('DIAGNOSTIC FORCED START', {
    build: LOT_GEOMETRY_DIAGNOSTIC_BUILD_ID,
    context,
    projectId,
    blockCount: list.length,
  });

  console.warn('[LOT GEOMETRY DEBUG] DIAGNOSTIC START', {
    context,
    projectId,
    blockCount: list.length,
  });

  try {
    const sampleCount = options?.sampleCount ?? 10;
    const summary = buildLotGeometryDiagnosticSummary(list);

    const sorted = [...list].sort((a, b) => {
      const na = Number(a.number ?? a.lot ?? 0);
      const nb = Number(b.number ?? b.lot ?? 0);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.number ?? '').localeCompare(String(b.number ?? ''));
    });

    const mismatch = list.filter((b) => {
      const a = analyzeLotGeometryBlock(b);
      return a.gis.ok && !a.validation.valid;
    }).length;

    const report = {
      context,
      projectId,
      summary,
      mismatch,
      samples: sorted.slice(0, sampleCount).map((block) => {
        try {
          return debugPayloadForLot(block);
        } catch (sampleErr: unknown) {
          return {
            'lot.number': block.number ?? block.lot,
            sampleError:
              sampleErr instanceof Error ? sampleErr.message : String(sampleErr),
          };
        }
      }),
    };

    console.error('DIAGNOSTIC REPORT', report);
    console.warn('[LOT GEOMETRY DEBUG] report', report);
    try {
      console.warn(
        '[LOT GEOMETRY DEBUG] report-json',
        JSON.stringify({
          context,
          projectId,
          summary,
          mismatch,
        }),
      );
    } catch {
      console.warn('[LOT GEOMETRY DEBUG] report-json skipped (circular)');
    }

    console.warn('[LOT GEOMETRY DEBUG] --- RESUMO ---');
    console.warn('[LOT GEOMETRY DEBUG] TOTAL LOTES', summary.total);
    console.warn(
      '[LOT GEOMETRY DEBUG] GEOMETRIA OK (normalizeLotGeometry)',
      summary.geometryOk,
    );
    console.warn(
      '[LOT GEOMETRY DEBUG] GEOMETRIA INVÁLIDA',
      summary.geometryInvalid,
    );
    console.warn('[LOT GEOMETRY DEBUG] GEOMETRIA VAZIA', summary.geometryEmpty);
    console.warn(
      '[LOT GEOMETRY DEBUG] GIS MAPA OK (geometry lat/lng como no mapa)',
      summary.gisMapRingOk,
    );
    console.warn(
      '[LOT GEOMETRY DEBUG] CONFRONTAÇÃO OK (validateConfrontationLot atual)',
      summary.confrontationValid,
    );
    console.warn(
      '[LOT GEOMETRY DEBUG] CONFRONTAÇÃO INVÁLIDA (validateConfrontationLot atual)',
      summary.confrontationInvalid,
    );
    console.warn('[LOT GEOMETRY DEBUG] SEGMENTS_JSON OK', summary.segmentsJsonOk);
    console.warn(
      '[LOT GEOMETRY DEBUG] SEGMENTS_JSON INVÁLIDO',
      summary.segmentsJsonInvalid,
    );
    console.warn(
      '[LOT GEOMETRY DEBUG] SEGMENTS_JSON VAZIO',
      summary.segmentsJsonEmpty,
    );
    console.warn(
      '[LOT GEOMETRY DEBUG] DIVERGÊNCIA mapa OK mas confrontação rejeita',
      mismatch,
    );
    console.warn(
      '[LOT GEOMETRY DEBUG] CAMPO RECOMENDADO PARA CONFRONTAÇÃO',
      summary.recommendedField,
    );
    console.warn('[LOT GEOMETRY DEBUG] MOTIVO', summary.recommendedReason);

    const samplePerimeter = analyzeLotGeometryBlock(
      sorted.find((b) => String(b.number) === '2') ?? sorted[0] ?? {},
    );
    if (sorted.length) {
      console.warn(
        '[LOT GEOMETRY DEBUG] AMOSTRA perímetro (lote',
        samplePerimeter.number,
        ')',
        {
          gisMap: samplePerimeter.gis.ok,
          campo: samplePerimeter.perimeter.field,
          motivo: samplePerimeter.perimeter.reason,
          validationReason: samplePerimeter.validation.reason,
        },
      );
    }

    console.warn('[LOT GEOMETRY DEBUG] DIAGNOSTIC END', { context, projectId });

    return summary;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[LOT GEOMETRY DEBUG] DIAGNOSTIC FAILED', {
      context,
      projectId,
      message,
      err,
    });
    return emptyDiagnosticSummary();
  }
}

/** Alias explícito (docs / chamadas legadas). */
export const generateLotGeometryDiagnosticReport = runLotGeometryDiagnosticReport;
