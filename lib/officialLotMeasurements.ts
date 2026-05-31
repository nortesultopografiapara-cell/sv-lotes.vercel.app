/**
 * Medidas oficiais do lote — fonte única: segmentos importados do TXT Civil 3D.
 * Geometria (mapa) não altera frente/fundo/laterais/chanfre.
 */

import type { ChanfreInfo } from "@/lib/lotChanfre";

export type OfficialLotSegment = {
  segment_index: number;
  distance: number;
  bearing: number | null;
  north: number;
  east: number;
  vertex_order: number;
};

export type OfficialLotMeasures = {
  frente: number | null;
  fundo: number | null;
  ladoDireito: number | null;
  ladoEsquerdo: number | null;
  chanfre: ChanfreInfo | null;
  area: number | null;
  perimeter: number | null;
  frontSegmentIndex: number | null;
  segmentCount: number;
  source: "txt_segments" | "columns_fallback" | "empty";
};

export type RingPathResult = {
  indexes: number[];
  totalLength: number;
};

const CHANFRE_MIN = 2;
const CHANFRE_MAX = 15;
const MAX_SEGMENT_DISTANCE_M = 1000;
const MAX_SIDE_TOTAL_M = 1000;
const MAX_PERIMETER_M = 5000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Única fonte de comprimento: distance/length do TXT — nunca north/east. */
export function isValidSegmentDistance(length: number): boolean {
  return (
    Number.isFinite(length) && length > 0 && length < MAX_SEGMENT_DISTANCE_M
  );
}

const DISTANCE_FIELD_KEYS = [
  "distance",
  "length",
  "Length",
  "comprimento",
  "medida",
] as const;

const FORBIDDEN_DISTANCE_KEYS = [
  "north",
  "northing",
  "North",
  "Northing",
  "east",
  "easting",
  "East",
  "Easting",
  "x",
  "y",
  "coordX",
  "coordY",
  "latitude",
  "longitude",
  "lat",
  "lng",
  "lon",
] as const;

function collectForbiddenCoordinateValues(
  raw: Record<string, unknown>,
): Set<number> {
  const forbidden = new Set<number>();
  for (const key of FORBIDDEN_DISTANCE_KEYS) {
    const v = Number(raw[key]);
    if (Number.isFinite(v)) forbidden.add(v);
  }
  return forbidden;
}

/**
 * Extrai comprimento oficial do segmento (somente campos de distância do TXT).
 * Nunca north/east/northing/easting/coord/lat/lon.
 */
export function extractOfficialSegmentDistance(
  raw: Record<string, unknown>,
  lotLabel?: unknown,
  segmentIndex?: number,
): number | null {
  const forbidden = collectForbiddenCoordinateValues(raw);
  const label = lotLabel ?? "?";
  const idx = segmentIndex ?? raw.segment_index;

  for (const field of DISTANCE_FIELD_KEYS) {
    const value = raw[field];
    if (value == null || value === "") continue;

    const length = Number(String(value).replace(",", "."));

    if (!Number.isFinite(length)) continue;

    if (Math.abs(length) >= 100_000) {
      console.log("INVALID_OFFICIAL_DISTANCE", {
        lote: label,
        index: idx,
        field,
        raw: value,
        reason: "looks_like_utm_coordinate",
      });
      continue;
    }

    let matchesCoordinateField = false;
    for (const coordVal of forbidden) {
      if (Math.abs(length - coordVal) < 0.01) {
        console.log("INVALID_OFFICIAL_DISTANCE", {
          lote: label,
          index: idx,
          field,
          raw: value,
          reason: "matches_coordinate_field",
          coordinate: coordVal,
        });
        matchesCoordinateField = true;
        break;
      }
    }
    if (matchesCoordinateField) continue;

    if (!isValidSegmentDistance(length)) {
      console.log("INVALID_OFFICIAL_DISTANCE", {
        lote: label,
        index: idx,
        field,
        raw: value,
        reason: "out_of_range",
        rejectedAs: length,
      });
      continue;
    }

    return round2(length);
  }

  return null;
}

/** Remove segmentos inválidos e reindexa o anel 0..n-1. */
export function sanitizeOfficialSegments(
  segments: OfficialLotSegment[],
  lotLabel?: unknown,
): OfficialLotSegment[] {
  const valid: OfficialLotSegment[] = [];
  for (const seg of segments) {
    const length = Number(seg.distance);
    if (!isValidSegmentDistance(length)) {
      console.log("LOT_INVALID_SEGMENT", {
        lote: lotLabel ?? "?",
        index: seg.segment_index,
        raw: seg.distance,
        rejectedAs: length,
      });
      continue;
    }
    valid.push({ ...seg, distance: round2(length) });
  }
  return valid.map((s, i) => ({
    ...s,
    segment_index: i,
    vertex_order: i,
  }));
}

function logLotSideSegments(
  lotLabel: unknown,
  side: "right" | "left",
  path: RingPathResult,
  segments: OfficialLotSegment[],
): void {
  const byIdx = new Map(segments.map((s) => [s.segment_index, s]));
  const detail = path.indexes.map((index) => ({
    index,
    distance: byIdx.get(index)?.distance ?? 0,
  }));
  console.log("LOT_SIDE_SEGMENTS", {
    lote: lotLabel,
    side,
    segments: detail,
    total: path.totalLength,
  });
}

function failsMeasureSanity(measures: {
  frente: number | null;
  fundo: number | null;
  ladoDireito: number | null;
  ladoEsquerdo: number | null;
  perimeter: number | null;
}): boolean {
  const sides = [
    measures.frente,
    measures.fundo,
    measures.ladoDireito,
    measures.ladoEsquerdo,
  ];
  if (sides.some((v) => v != null && v > MAX_SIDE_TOTAL_M)) return true;
  if (measures.perimeter != null && measures.perimeter > MAX_PERIMETER_M) {
    return true;
  }
  return false;
}

function bearingFromEn(
  north1: number,
  east1: number,
  north2: number,
  east2: number,
): number {
  const dn = north2 - north1;
  const de = east2 - east1;
  let deg = (Math.atan2(de, dn) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return round2(deg);
}

/** Normaliza vértices/segmentos vindos do parser TXT Civil 3D. */
export function normalizeTxtImportSegments(
  raw: Array<{
    northing?: number;
    easting?: number;
    north?: number;
    east?: number;
    length?: number;
    bearing?: number;
    azimuth?: number;
  }>,
): OfficialLotSegment[] {
  const out: OfficialLotSegment[] = [];
  const n = raw.length;
  if (n < 2) return out;

  for (let i = 0; i < n; i++) {
    const cur = raw[i];
    const next = raw[(i + 1) % n];
    const north = Number(cur.northing ?? cur.north);
    const east = Number(cur.easting ?? cur.east);
    const nextNorth = Number(next.northing ?? next.north);
    const nextEast = Number(next.easting ?? next.east);
    if (!Number.isFinite(north) || !Number.isFinite(east)) continue;

    let distance = Number(cur.length);
    if (!Number.isFinite(distance) || distance <= 0) {
      distance = Math.hypot(nextEast - east, nextNorth - north);
    }

    let bearing: number | null = null;
    const az = cur.azimuth ?? cur.bearing;
    if (az != null && Number.isFinite(Number(az))) {
      bearing = round2(Number(az));
    } else if (Number.isFinite(nextNorth) && Number.isFinite(nextEast)) {
      bearing = bearingFromEn(north, east, nextNorth, nextEast);
    }

    out.push({
      segment_index: i,
      distance: round2(distance),
      bearing,
      north,
      east,
      vertex_order: i,
    });
  }
  return out;
}

/** Lê segmentos oficiais do block (segments_json enriquecido ou legado). */
export function parseOfficialSegmentsFromBlock(
  block: Record<string, unknown>,
  lotLabel?: unknown,
): OfficialLotSegment[] {
  const raw = block.segments_json;
  if (!Array.isArray(raw) || raw.length < 2) return [];

  const label = lotLabel ?? block.number ?? block.id;
  const parsed: OfficialLotSegment[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item == null || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const north = Number(s.north ?? s.northing ?? s.Northing ?? s.y);
    const east = Number(s.east ?? s.easting ?? s.Easting ?? s.x);
    const distance = extractOfficialSegmentDistance(s, label, i);
    if (!Number.isFinite(north) || !Number.isFinite(east)) continue;
    if (distance == null) continue;

    parsed.push({
      segment_index:
        typeof s.segment_index === "number" ? s.segment_index : i,
      distance,
      bearing:
        s.bearing != null && Number.isFinite(Number(s.bearing))
          ? round2(Number(s.bearing))
          : s.azimuth != null && Number.isFinite(Number(s.azimuth))
            ? round2(Number(s.azimuth))
            : null,
      north,
      east,
      vertex_order:
        typeof s.vertex_order === "number" ? s.vertex_order : i,
    });
  }

  parsed.sort((a, b) => a.segment_index - b.segment_index);
  return sanitizeOfficialSegments(parsed, label);
}

export function segmentsToPersistJson(
  segments: OfficialLotSegment[],
): Record<string, unknown>[] {
  return segments.map((s) => ({
    segment_index: s.segment_index,
    distance: s.distance,
    bearing: s.bearing,
    north: s.north,
    east: s.east,
    vertex_order: s.vertex_order,
    length: s.distance,
    northing: s.north,
    easting: s.east,
  }));
}

export type OfficialMeasurePaths = {
  frente: number;
  fundo: number;
  ladoDireito: number;
  ladoEsquerdo: number;
  pathA: RingPathResult;
  pathB: RingPathResult;
  pathFundo: RingPathResult;
  frontIndex: number;
};

/** Lote com frente já vinculada a logradouro (Identificar Frentes). */
export function hasStreetFrontIdentified(
  block: Record<string, unknown>,
): boolean {
  return Boolean(
    block.front_street_name ||
      block.front_street_id ||
      block.front_street_display,
  );
}

function sumPathDistances(
  indexes: number[],
  byIdx: Map<number, OfficialLotSegment>,
): number {
  return round2(
    indexes.reduce((sum, idx) => {
      const length = Number(byIdx.get(idx)?.distance);
      return isValidSegmentDistance(length) ? sum + length : sum;
    }, 0),
  );
}

/**
 * Classifica lados pelo anel TXT com frente como âncora.
 * pathA = lateral horário (frente → fundo) | pathB = lateral anti-horário.
 * pathFundo = segmentos opostos contínuos (fundo quebrado em 2+ arestas).
 */
export function classifySidesByTxtRingPaths(
  segments: OfficialLotSegment[],
  frontSegmentIndex: number,
): OfficialMeasurePaths {
  const n = segments.length;
  const byIdx = new Map(segments.map((s) => [s.segment_index, s]));
  const front = byIdx.get(frontSegmentIndex);
  const emptyPaths: RingPathResult = { indexes: [], totalLength: 0 };

  if (!front || n < 3) {
    return {
      frente: front?.distance ?? 0,
      fundo: 0,
      ladoDireito: 0,
      ladoEsquerdo: 0,
      pathA: emptyPaths,
      pathB: emptyPaths,
      pathFundo: emptyPaths,
      frontIndex: frontSegmentIndex,
    };
  }

  const collectPath = (
    startIdx: number,
    endIdx: number,
    step: 1 | -1,
  ): RingPathResult => {
    const indexes: number[] = [];
    let i = startIdx;
    for (let guard = 0; guard < n; guard++) {
      i = (i + step + n) % n;
      if (i === endIdx) break;
      indexes.push(i);
    }
    return { indexes, totalLength: sumPathDistances(indexes, byIdx) };
  };

  const fundoStart = (frontSegmentIndex + 2) % n;
  const pathA = collectPath(frontSegmentIndex, fundoStart, 1);
  const pathB = collectPath(frontSegmentIndex, fundoStart, -1);

  const used = new Set<number>([
    frontSegmentIndex,
    ...pathA.indexes,
    ...pathB.indexes,
  ]);
  const fundoUnordered: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!used.has(i)) fundoUnordered.push(i);
  }
  const fundoIndexes: number[] = [];
  let walk = fundoStart;
  for (let guard = 0; guard < n; guard++) {
    if (fundoUnordered.includes(walk)) fundoIndexes.push(walk);
    walk = (walk + 1) % n;
    if (fundoIndexes.length === fundoUnordered.length) break;
  }
  if (fundoIndexes.length === 0) {
    fundoIndexes.push(...fundoUnordered.sort((a, b) => a - b));
  }

  const pathFundo: RingPathResult = {
    indexes: fundoIndexes,
    totalLength: sumPathDistances(fundoIndexes, byIdx),
  };

  const frenteLen = Number(front.distance);

  return {
    frente: isValidSegmentDistance(frenteLen) ? round2(frenteLen) : 0,
    fundo: pathFundo.totalLength,
    ladoDireito: pathA.totalLength,
    ladoEsquerdo: pathB.totalLength,
    pathA,
    pathB,
    pathFundo,
    frontIndex: frontSegmentIndex,
  };
}

/** Primeiro índice do arco de fundo (referência TXT). */
export function findBackSegmentIndex(
  segments: OfficialLotSegment[],
  frontSegmentIndex: number,
): number {
  const n = segments.length;
  if (n < 3) return (frontSegmentIndex + 1) % Math.max(n, 1);
  return (frontSegmentIndex + 2) % n;
}

export function resolveFrontSegmentIndex(
  block: Record<string, unknown>,
  segments: OfficialLotSegment[],
): number | null {
  const hasStreet = hasStreetFrontIdentified(block);
  const stored = block.front_segment_index;

  if (typeof stored === "number" && Number.isFinite(stored) && stored >= 0) {
    const idx =
      stored < segments.length ? stored : stored % Math.max(segments.length, 1);
    if (hasStreet || stored >= 0) {
      console.log("FRONT_SEGMENT_LOCKED", {
        lote: block.number ?? block.id,
        frontIndex: idx,
        street: hasStreet,
      });
    }
    return idx;
  }

  if (hasStreet) {
    console.warn("FRONT_SEGMENT_STREET_WITHOUT_INDEX", block.number ?? block.id);
    return segments.length > 0 ? 0 : null;
  }

  const frenteHint = Number(block.frente);
  if (
    Number.isFinite(frenteHint) &&
    frenteHint > 0 &&
    frenteHint < MAX_SEGMENT_DISTANCE_M &&
    segments.length > 0
  ) {
    const match = segments.reduce((best, s) => {
      const d = Math.abs(s.distance - frenteHint);
      const bd = Math.abs(best.distance - frenteHint);
      return d < bd ? s : best;
    });
    return match.segment_index;
  }

  if (segments.length > 0) {
    return segments[0].segment_index;
  }
  return null;
}

/** Segmento TXT alinhado à aresta da geometria mais próxima da linha de rua. */
export function findFrontSegmentIndexFromStreetEdge(
  segments: OfficialLotSegment[],
  geometryEdgeIndex: number,
  lotLabel?: unknown,
): number {
  if (segments.length === 0) return 0;
  const idx = Math.min(
    Math.max(0, Math.floor(geometryEdgeIndex)),
    segments.length - 1,
  );
  console.log("FRONT_SEGMENT_SELECTED_FROM_STREET", {
    lote: lotLabel ?? "?",
    frontIndex: idx,
    geometryEdgeIndex,
  });
  return idx;
}

function computeChanfreFromTxtPaths(
  segments: OfficialLotSegment[],
  frontIdx: number,
  pathA: RingPathResult,
  pathB: RingPathResult,
  pathFundo: RingPathResult,
): ChanfreInfo | null {
  const used = new Set([
    frontIdx,
    ...pathA.indexes,
    ...pathB.indexes,
    ...pathFundo.indexes,
  ]);
  const chanfreSegs: number[] = [];

  for (const seg of segments) {
    if (used.has(seg.segment_index)) continue;
    if (seg.distance >= CHANFRE_MIN && seg.distance <= CHANFRE_MAX) {
      chanfreSegs.push(seg.distance);
    }
  }

  const unique = [...new Set(chanfreSegs.map(round2))];
  if (unique.length === 0) return null;
  const total = round2(unique.reduce((a, b) => a + b, 0));
  return { total, segments: unique };
}

function parseColumnFallback(block: Record<string, unknown>): OfficialLotMeasures {
  const parse = (v: unknown) => {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
    return isValidSegmentDistance(n) ? round2(n) : null;
  };
  const perimeterRaw = Number(block.perimeter);
  const perimeter =
    Number.isFinite(perimeterRaw) &&
    perimeterRaw > 0 &&
    perimeterRaw < MAX_PERIMETER_M
      ? round2(perimeterRaw)
      : null;
  return {
    frente: parse(block.frente),
    fundo: parse(block.Fundo ?? block.fundo),
    ladoDireito: parse(block["Lado Dir."] ?? block.lado_direito),
    ladoEsquerdo: parse(block["Lado Esq."] ?? block.lado_esquerdo),
    chanfre: null,
    area: parse(block.area),
    perimeter,
    frontSegmentIndex: null,
    segmentCount: 0,
    source: "columns_fallback",
  };
}

function buildMeasuresFromSegments(
  block: Record<string, unknown>,
  segments: OfficialLotSegment[],
  label: unknown,
): OfficialLotMeasures | null {
  if (segments.length < 3) return null;

  let frontIdx = resolveFrontSegmentIndex(block, segments);
  if (frontIdx == null) frontIdx = 0;
  if (frontIdx >= segments.length) frontIdx = 0;

  const paths = classifySidesByTxtRingPaths(segments, frontIdx);

  logLotSideSegments(label, "right", paths.pathA, segments);
  logLotSideSegments(label, "left", paths.pathB, segments);

  console.log("OFFICIAL_MEASURE_PATHS", {
    lote: label,
    frontIndex: paths.frontIndex,
    fundoIndexes: paths.pathFundo.indexes,
    fundoTotal: paths.fundo,
    pathRight: { indexes: paths.pathA.indexes, total: paths.pathA.totalLength },
    pathLeft: { indexes: paths.pathB.indexes, total: paths.pathB.totalLength },
  });

  const perimeter = round2(
    segments.reduce((sum, s) => {
      const length = Number(s.distance);
      return isValidSegmentDistance(length) ? sum + length : sum;
    }, 0),
  );

  const areaRaw = Number(block.area);
  const area =
    Number.isFinite(areaRaw) && areaRaw > 0 ? round2(areaRaw) : null;

  const chanfre = computeChanfreFromTxtPaths(
    segments,
    frontIdx,
    paths.pathA,
    paths.pathB,
    paths.pathFundo,
  );

  return {
    frente: paths.frente > 0 ? paths.frente : null,
    fundo: paths.fundo > 0 ? paths.fundo : null,
    ladoDireito: paths.ladoDireito > 0 ? paths.ladoDireito : null,
    ladoEsquerdo: paths.ladoEsquerdo > 0 ? paths.ladoEsquerdo : null,
    chanfre,
    area,
    perimeter: perimeter > 0 ? perimeter : null,
    frontSegmentIndex: frontIdx,
    segmentCount: segments.length,
    source: "txt_segments",
  };
}

/**
 * Medidas oficiais baseadas nos segmentos TXT (não na geometria do mapa).
 */
export function getOfficialLotMeasurements(
  block: Record<string, unknown>,
  lotNumber?: unknown,
): OfficialLotMeasures {
  const label = lotNumber ?? block.number ?? block.id ?? "?";
  const segments = parseOfficialSegmentsFromBlock(block, label);

  console.log("LOT_SEGMENTS", label, segments);

  let result = buildMeasuresFromSegments(block, segments, label);

  if (result) {
    console.log("LOT_FRONT_SEGMENT", label, result.frontSegmentIndex);
  }

  if (result && failsMeasureSanity(result)) {
    console.log("LOT_MEASURE_SANITY_FAIL", label, result);
    const strictSegments = sanitizeOfficialSegments(
      parseOfficialSegmentsFromBlock(block, label),
      label,
    );
    const retry = buildMeasuresFromSegments(block, strictSegments, label);
    if (retry && !failsMeasureSanity(retry)) {
      result = retry;
    } else {
      const fallback = parseColumnFallback(block);
      if (!failsMeasureSanity(fallback)) {
        console.log("LOT_OFFICIAL_MEASURES", label, fallback, "(columns after sanity)");
        return { ...fallback, segmentCount: segments.length };
      }
      result = {
        ...result,
        ladoDireito: null,
        ladoEsquerdo: null,
        perimeter: null,
      };
    }
  }

  if (!result) {
    const fallback = parseColumnFallback(block);
    console.log("LOT_OFFICIAL_MEASURES", label, fallback);
    return fallback;
  }

  console.log("LOT_OFFICIAL_MEASURES", label, result);
  return result;
}

/** Fallback legado: associa frente por comprimento (não usar se já há rua identificada). */
export function findFrontSegmentIndexFromLengthHint(
  segments: OfficialLotSegment[],
  frontLengthM: number,
): number {
  if (segments.length === 0) return 0;
  let best = segments[0].segment_index;
  let bestDiff = Infinity;
  for (const s of segments) {
    const d = Math.abs(s.distance - frontLengthM);
    if (d < bestDiff) {
      bestDiff = d;
      best = s.segment_index;
    }
  }
  return best;
}

/** Persistência após correção manual da frente no mapa. */
export function buildBlockPatchFromOfficialMeasures(
  measures: OfficialLotMeasures,
  frontSegmentIndex: number,
): Record<string, unknown> {
  return {
    ...officialMeasuresToBlockFields(measures, frontSegmentIndex),
    front_segment_index: frontSegmentIndex,
    updated_at: new Date().toISOString(),
  };
}

/** Linhas para persistência em lot_segments. */
export function officialSegmentsToLotSegmentRows(
  lotId: string,
  segments: OfficialLotSegment[],
): Array<{
  lot_id: string;
  segment_index: number;
  distance: number;
  bearing: number | null;
  north: number;
  east: number;
  vertex_order: number;
}> {
  return segments.map((s) => ({
    lot_id: lotId,
    segment_index: s.segment_index,
    distance: s.distance,
    bearing: s.bearing,
    north: s.north,
    east: s.east,
    vertex_order: s.vertex_order,
  }));
}

/** Campos para persistir em blocks após Identificar Frentes. */
export function officialMeasuresToBlockFields(
  measures: OfficialLotMeasures,
  frontSegmentIndex: number,
): Record<string, unknown> {
  return {
    front_segment_index: frontSegmentIndex,
    frente: measures.frente,
    Fundo:
      measures.fundo != null
        ? String(measures.fundo).replace(/[^0-9.]/g, "")
        : null,
    "Lado Dir.":
      measures.ladoDireito != null
        ? String(measures.ladoDireito).replace(/[^0-9.]/g, "")
        : null,
    "Lado Esq.":
      measures.ladoEsquerdo != null
        ? String(measures.ladoEsquerdo).replace(/[^0-9.]/g, "")
        : null,
    perimeter: measures.perimeter,
  };
}

export type OfficialSegmentClassification =
  | "frente"
  | "fundo"
  | "lado_direito"
  | "lado_esquerdo"
  | "chanfre"
  | "perimetro";

export type OfficialLotSegmentTableRow = {
  segment_index: number;
  de: string;
  para: string;
  azimute: string;
  /** Metros (somente se valid). */
  distanceM: number | null;
  distancia: string;
  coordE: string;
  coordN: string;
  classification: OfficialSegmentClassification;
  valid: boolean;
};

export type OfficialLotSegmentTableResult = {
  rows: OfficialLotSegmentTableRow[];
  validRows: OfficialLotSegmentTableRow[];
  source: "txt_segments" | "empty";
  coordinatesAvailable: boolean;
  ignoredInvalidCount: number;
  measures: OfficialLotMeasures | null;
};

function formatOfficialAzimuth(deg: number | null): string {
  if (deg == null || !Number.isFinite(deg)) return "—";
  const d = Math.floor(deg);
  const min = Math.round((deg - d) * 60);
  return `${String(d).padStart(3, "0")}°${String(min).padStart(2, "0")}'`;
}

function formatOfficialCoord(val: number): string {
  return val.toLocaleString("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function vertexDeParaMarker(i: number): string {
  return `M-${String(i + 1).padStart(2, "0")}`;
}

function classifySegmentForTable(
  segmentIndex: number,
  frontIdx: number,
  paths: OfficialMeasurePaths,
  chanfreIndexes: number[],
): OfficialSegmentClassification {
  if (segmentIndex === frontIdx) return "frente";
  if (paths.pathFundo.indexes.includes(segmentIndex)) return "fundo";
  if (paths.pathA.indexes.includes(segmentIndex)) return "lado_direito";
  if (paths.pathB.indexes.includes(segmentIndex)) return "lado_esquerdo";
  if (chanfreIndexes.includes(segmentIndex)) return "chanfre";
  return "perimetro";
}

function chanfreIndexesFromPaths(
  segments: OfficialLotSegment[],
  frontIdx: number,
  paths: OfficialMeasurePaths,
): number[] {
  const used = new Set<number>([
    frontIdx,
    ...paths.pathA.indexes,
    ...paths.pathB.indexes,
    ...paths.pathFundo.indexes,
  ]);
  const indexes: number[] = [];
  for (const seg of segments) {
    if (used.has(seg.segment_index)) continue;
    if (
      seg.distance >= CHANFRE_MIN &&
      seg.distance <= CHANFRE_MAX &&
      isValidSegmentDistance(seg.distance)
    ) {
      indexes.push(seg.segment_index);
    }
  }
  return indexes;
}

/**
 * Fonte única: tabela de segmentos oficiais (TXT) para popup, prancha, memorial e contrato.
 */
export function getOfficialLotSegmentTable(
  lot: Record<string, unknown>,
  _project?: Record<string, unknown> | null,
): OfficialLotSegmentTableResult {
  const label = lot.number ?? lot.id ?? "?";
  const segments = parseOfficialSegmentsFromBlock(lot, label);
  const empty: OfficialLotSegmentTableResult = {
    rows: [],
    validRows: [],
    source: "empty",
    coordinatesAvailable: segments.length >= 2,
    ignoredInvalidCount: 0,
    measures: null,
  };

  if (segments.length < 2) return empty;

  const measures = getOfficialLotMeasurements(lot, label);
  let frontIdx = measures.frontSegmentIndex ?? 0;
  if (frontIdx >= segments.length) frontIdx = 0;

  const paths = classifySidesByTxtRingPaths(segments, frontIdx);
  const chanfreIdx = chanfreIndexesFromPaths(segments, frontIdx, paths);

  const rows: OfficialLotSegmentTableRow[] = [];
  let ignoredInvalidCount = 0;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const next = segments[(i + 1) % segments.length];
    const toVertex = (s.vertex_order + 1) % segments.length;
    const distanceM = isValidSegmentDistance(Number(s.distance))
      ? round2(Number(s.distance))
      : null;
    const valid = distanceM != null;

    if (!valid) {
      ignoredInvalidCount++;
      console.log("INVALID_OFFICIAL_DISTANCE", {
        lote: label,
        index: s.segment_index,
        reason: "excluded_from_table",
        raw: s.distance,
      });
    }

    rows.push({
      segment_index: s.segment_index,
      de: vertexDeParaMarker(s.vertex_order),
      para: vertexDeParaMarker(toVertex),
      azimute: formatOfficialAzimuth(s.bearing),
      distanceM,
      distancia: valid
        ? `${distanceM!.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} m`
        : "Segmento inválido ignorado",
      coordE: formatOfficialCoord(next.east),
      coordN: formatOfficialCoord(next.north),
      classification: classifySegmentForTable(
        s.segment_index,
        frontIdx,
        paths,
        chanfreIdx,
      ),
      valid,
    });
  }

  const validRows = rows.filter((r) => r.valid);

  return {
    rows,
    validRows,
    source: "txt_segments",
    coordinatesAvailable: true,
    ignoredInvalidCount,
    measures,
  };
}

/** Rótulos de distância por aresta para desenho da prancha (índice = segment_index). */
export function officialSegmentTableToEdgeLabels(
  table: OfficialLotSegmentTableResult,
  edgeCount: number,
): string[] {
  const byIndex = new Map<number, string>();
  for (const row of table.validRows) {
    if (row.distanceM == null) continue;
    byIndex.set(
      row.segment_index,
      `${row.distanceM.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} m`,
    );
  }

  const labels: string[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const label = byIndex.get(i);
    if (label) {
      labels.push(label);
    } else {
      labels.push("—");
      if (table.source === "txt_segments") {
        console.log("INVALID_OFFICIAL_DISTANCE", {
          reason: "missing_edge_label",
          edgeIndex: i,
        });
      }
    }
  }
  return labels;
}
