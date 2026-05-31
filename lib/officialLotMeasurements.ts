/**
 * Medidas oficiais do lote — fonte única: segmentos importados do TXT Civil 3D.
 * Geometria (mapa) não altera frente/fundo/laterais/chanfre.
 */

import type { ChanfreInfo } from "@/lib/lotChanfre";
import {
  findFrontSegmentIndexTouchingStreet,
  type StreetGuideLineInput,
} from "@/lib/lotStreetFrontDetection";

export type OfficialSegmentKind = "LINE" | "CURVE";

export type OfficialLotSegment = {
  segment_index: number;
  distance: number;
  bearing: number | null;
  north: number;
  east: number;
  vertex_order: number;
  segment_type?: OfficialSegmentKind;
  radius?: number | null;
  chord?: number | null;
  delta?: number | null;
  tangent?: number | null;
  course?: number | null;
  course_in?: number | null;
  course_out?: number | null;
  rp_north?: number | null;
  rp_east?: number | null;
  end_north?: number | null;
  end_east?: number | null;
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
/** Mesmo lado: variação de azimute entre segmentos consecutivos. */
const COLINEAR_DEFLECTION_MAX_DEG = 10;
/** Chanfre de esquina (~45°): segmento seguinte à virada. */
const CHANFRE_DEFLECTION_MIN_DEG = 40;
const CHANFRE_DEFLECTION_MAX_DEG = 50;
/** Mudança de lado (~90°): deflexão na virada. */
const CORNER_DEFLECTION_MIN_DEG = 80;
const CORNER_DEFLECTION_MAX_DEG = 100;
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
function isCurveSegmentRaw(raw: Record<string, unknown>): boolean {
  const t = String(raw.type ?? raw.segment_type ?? "").toUpperCase();
  return t === "CURVE" || (raw.radius != null && Number(raw.radius) > 0);
}

export function extractOfficialSegmentDistance(
  raw: Record<string, unknown>,
  lotLabel?: unknown,
  segmentIndex?: number,
): number | null {
  const forbidden = collectForbiddenCoordinateValues(raw);
  const label = lotLabel ?? "?";
  const idx = segmentIndex ?? raw.segment_index;

  if (isCurveSegmentRaw(raw)) {
    const arcLen = Number(
      String(raw.length ?? raw.distance ?? raw.Length ?? "").replace(",", "."),
    );
    if (isValidSegmentDistance(arcLen)) {
      console.log("ARC_MEASURE_USED", {
        lote: label,
        segmentIndex: idx,
        length: round2(arcLen),
        chord: raw.chord,
        note: "curve usa Length oficial, nunca Chord",
      });
      return round2(arcLen);
    }
  }

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

export function bearingFromEn(
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

/** Diferença angular mínima entre dois azimutes (0–180°). */
export function angularDifferenceDeg(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return round2(diff);
}

function circularMeanBearing(bearings: number[]): number {
  if (bearings.length === 0) return 0;
  let sinSum = 0;
  let cosSum = 0;
  for (const b of bearings) {
    const r = (b * Math.PI) / 180;
    sinSum += Math.sin(r);
    cosSum += Math.cos(r);
  }
  let deg = (Math.atan2(sinSum, cosSum) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return round2(deg);
}

/** Azimute do segmento (TXT); fallback pelo próximo vértice EN. */
export function resolveSegmentBearing(
  seg: OfficialLotSegment,
  next: OfficialLotSegment | null,
): number {
  if (seg.bearing != null && Number.isFinite(seg.bearing)) {
    return seg.bearing;
  }
  if (
    seg.segment_type === "CURVE" &&
    seg.end_north != null &&
    seg.end_east != null
  ) {
    return bearingFromEn(seg.north, seg.east, seg.end_north, seg.end_east);
  }
  if (
    next &&
    Number.isFinite(seg.north) &&
    Number.isFinite(seg.east) &&
    Number.isFinite(next.north) &&
    Number.isFinite(next.east)
  ) {
    return bearingFromEn(seg.north, seg.east, next.north, next.east);
  }
  return 0;
}

function isColinearDeflection(deflectionDeg: number): boolean {
  return deflectionDeg <= COLINEAR_DEFLECTION_MAX_DEG;
}

function isChanfreDeflection(deflectionDeg: number): boolean {
  return (
    deflectionDeg >= CHANFRE_DEFLECTION_MIN_DEG &&
    deflectionDeg <= CHANFRE_DEFLECTION_MAX_DEG
  );
}

function isCornerDeflection(deflectionDeg: number): boolean {
  return (
    deflectionDeg >= CORNER_DEFLECTION_MIN_DEG &&
    deflectionDeg <= CORNER_DEFLECTION_MAX_DEG
  );
}

/**
 * Chanfres de esquina: deflexão 40°–50° → segmento seguinte é chanfre.
 */
export function detectChanfreIndexesByDeflection(
  segments: OfficialLotSegment[],
  lotLabel?: unknown,
  adjacentToFrontIndex?: number | null,
): number[] {
  const n = segments.length;
  if (n < 3) return [];

  const ordered = [...segments].sort((a, b) => a.segment_index - b.segment_index);
  const chanfreIndexes: number[] = [];

  const inspectVertex = (
    cur: OfficialLotSegment,
    next: OfficialLotSegment,
    afterNext: OfficialLotSegment,
    closing?: boolean,
  ) => {
    const bCur = resolveSegmentBearing(cur, next);
    const bNext = resolveSegmentBearing(next, afterNext);
    const deflection = angularDifferenceDeg(bCur, bNext);

    console.log("SEGMENT_DEFLECTION", {
      lote: lotLabel ?? "?",
      vertexAfterSegment: cur.segment_index,
      nextSegment: next.segment_index,
      bearingCurrent: bCur,
      bearingNext: bNext,
      deflectionDeg: deflection,
      sameSide: isColinearDeflection(deflection),
      chanfre: isChanfreDeflection(deflection),
      newSide: isCornerDeflection(deflection),
      closingVertex: Boolean(closing),
    });

    if (isChanfreDeflection(deflection)) {
      const idx = next.segment_index;
      if (!chanfreIndexes.includes(idx)) {
        chanfreIndexes.push(idx);
        console.log("CHANFRE_DETECTED_BY_DEFLECTION", {
          lote: lotLabel ?? "?",
          vertexAfterSegment: cur.segment_index,
          chanfreSegmentIndex: idx,
          deflectionDeg: deflection,
          distance: next.distance,
        });
      }
    }
  };

  for (let i = 0; i < n - 1; i++) {
    inspectVertex(ordered[i], ordered[i + 1], ordered[(i + 2) % n]);
  }
  inspectVertex(ordered[n - 1], ordered[0], ordered[1], true);

  if (
    adjacentToFrontIndex != null &&
    Number.isFinite(adjacentToFrontIndex) &&
    adjacentToFrontIndex >= 0 &&
    chanfreIndexes.length > 0
  ) {
    const ringPos = ordered.findIndex(
      (s) => s.segment_index === adjacentToFrontIndex,
    );
    if (ringPos >= 0) {
      const prev = ordered[(ringPos - 1 + n) % n].segment_index;
      const next = ordered[(ringPos + 1) % n].segment_index;
      const adjacent = new Set([prev, next]);
      return chanfreIndexes.filter((idx) => adjacent.has(idx));
    }
  }

  return chanfreIndexes;
}

export type SegmentDeflectionGroup = {
  groupIndex: number;
  segmentIndexes: number[];
  totalLength: number;
  averageBearing: number;
};

function buildDeflectionGroup(
  segmentIndexes: number[],
  ordered: OfficialLotSegment[],
  byIdx: Map<number, OfficialLotSegment>,
  groupIndex: number,
): SegmentDeflectionGroup {
  const bearings: number[] = [];
  let totalLength = 0;
  for (const idx of segmentIndexes) {
    const seg = byIdx.get(idx);
    if (!seg) continue;
    const pos = ordered.findIndex((s) => s.segment_index === idx);
    const next =
      pos >= 0 ? ordered[(pos + 1) % ordered.length] : null;
    if (isValidSegmentDistance(seg.distance)) {
      totalLength += seg.distance;
    }
    bearings.push(resolveSegmentBearing(seg, next));
  }
  return {
    groupIndex,
    segmentIndexes: [...segmentIndexes],
    totalLength: round2(totalLength),
    averageBearing: circularMeanBearing(bearings),
  };
}

/**
 * Agrupa segmentos TXT pelo ângulo de virada entre azimutes consecutivos.
 */
export function groupSegmentsByDeflection(
  segments: OfficialLotSegment[],
  lotLabel?: unknown,
): SegmentDeflectionGroup[] {
  const n = segments.length;
  if (n === 0) return [];

  const ordered = [...segments].sort((a, b) => a.segment_index - b.segment_index);
  const byIdx = new Map(ordered.map((s) => [s.segment_index, s]));

  if (n === 1) {
    const s = ordered[0];
    return [
      {
        groupIndex: 0,
        segmentIndexes: [s.segment_index],
        totalLength: isValidSegmentDistance(s.distance)
          ? round2(s.distance)
          : 0,
        averageBearing: resolveSegmentBearing(s, null),
      },
    ];
  }

  const chanfreIndexes = detectChanfreIndexesByDeflection(segments, lotLabel);
  const chanfreSet = new Set(chanfreIndexes);

  const rawGroups: number[][] = [];
  let current: number[] = [ordered[0].segment_index];

  for (let i = 0; i < n - 1; i++) {
    const cur = ordered[i];
    const next = ordered[i + 1];
    const nextIdx = next.segment_index;

    if (chanfreSet.has(nextIdx)) {
      rawGroups.push([...current.filter((idx) => !chanfreSet.has(idx))]);
      current = [];
      continue;
    }

    const afterNext = ordered[(i + 2) % n];
    const deflection = angularDifferenceDeg(
      resolveSegmentBearing(cur, next),
      resolveSegmentBearing(next, afterNext),
    );

    const curKind = byIdx.get(cur.segment_index)?.segment_type;
    const nextKind = byIdx.get(nextIdx)?.segment_type;
    if (curKind === "CURVE" || nextKind === "CURVE") {
      rawGroups.push([...current.filter((idx) => !chanfreSet.has(idx))]);
      current = chanfreSet.has(nextIdx) ? [] : [nextIdx];
      continue;
    }

    if (isColinearDeflection(deflection)) {
      if (!current.includes(nextIdx)) current.push(nextIdx);
    } else if (isChanfreDeflection(deflection)) {
      rawGroups.push([...current.filter((idx) => !chanfreSet.has(idx))]);
      current = [];
    } else if (isCornerDeflection(deflection)) {
      rawGroups.push([...current.filter((idx) => !chanfreSet.has(idx))]);
      current = chanfreSet.has(nextIdx) ? [] : [nextIdx];
    }
  }
  const tail = current.filter((idx) => !chanfreSet.has(idx));
  if (tail.length > 0) rawGroups.push(tail);

  if (rawGroups.length >= 2) {
    const lastSeg = ordered[n - 1];
    const firstSeg = ordered[0];
    const secondSeg = ordered[1];
    const closeDefl = angularDifferenceDeg(
      resolveSegmentBearing(lastSeg, firstSeg),
      resolveSegmentBearing(firstSeg, secondSeg),
    );
    console.log("SEGMENT_DEFLECTION", {
      lote: lotLabel ?? "?",
      vertexAfterSegment: lastSeg.segment_index,
      nextSegment: firstSeg.segment_index,
      bearingCurrent: resolveSegmentBearing(lastSeg, firstSeg),
      bearingNext: resolveSegmentBearing(firstSeg, secondSeg),
      deflectionDeg: closeDefl,
      sameSide: isColinearDeflection(closeDefl),
      newSide: isCornerDeflection(closeDefl),
      closingVertex: true,
    });
    if (isColinearDeflection(closeDefl)) {
      const merged = [...rawGroups[rawGroups.length - 1], ...rawGroups[0]];
      const deduped: number[] = [];
      for (const idx of merged) {
        if (!deduped.includes(idx)) deduped.push(idx);
      }
      rawGroups = [deduped, ...rawGroups.slice(1, -1)];
    }
  }

  const groups = rawGroups
    .filter((g) => g.length > 0)
    .map((indexes, gi) => buildDeflectionGroup(indexes, ordered, byIdx, gi));

  console.log("SEGMENT_GROUPS", {
    lote: lotLabel ?? "?",
    groupCount: groups.length,
    groups: groups.map((g) => ({
      groupIndex: g.groupIndex,
      segmentIndexes: g.segmentIndexes,
      totalLength: g.totalLength,
      averageBearing: g.averageBearing,
    })),
  });

  return groups;
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

    const kindRaw = String(s.type ?? s.segment_type ?? "LINE").toUpperCase();
    const segment_type: OfficialSegmentKind =
      kindRaw === "CURVE" ? "CURVE" : "LINE";

    const row: OfficialLotSegment = {
      segment_index:
        typeof s.segment_index === "number" ? s.segment_index : i,
      distance,
      bearing:
        s.bearing != null && Number.isFinite(Number(s.bearing))
          ? round2(Number(s.bearing))
          : s.azimuth != null && Number.isFinite(Number(s.azimuth))
            ? round2(Number(s.azimuth))
            : s.courseOut != null && Number.isFinite(Number(s.courseOut))
              ? round2(Number(s.courseOut))
              : s.course_out != null && Number.isFinite(Number(s.course_out))
                ? round2(Number(s.course_out))
                : null,
      north,
      east,
      vertex_order:
        typeof s.vertex_order === "number" ? s.vertex_order : i,
      segment_type,
    };

    if (segment_type === "CURVE") {
      const num = (k: string) => {
        const v = Number(s[k]);
        return Number.isFinite(v) ? round2(v) : null;
      };
      row.radius = num("radius");
      row.chord = num("chord");
      row.delta = s.delta != null ? Number(s.delta) : null;
      row.tangent = num("tangent");
      row.course = s.course != null ? Number(s.course) : null;
      row.course_in =
        s.courseIn != null
          ? Number(s.courseIn)
          : s.course_in != null
            ? Number(s.course_in)
            : null;
      row.course_out =
        s.courseOut != null
          ? Number(s.courseOut)
          : s.course_out != null
            ? Number(s.course_out)
            : null;
      row.rp_north = num("rpNorth") ?? num("rp_north");
      row.rp_east = num("rpEast") ?? num("rp_east");
      row.end_north = num("endNorth") ?? num("end_north");
      row.end_east = num("endEast") ?? num("end_east");
      console.log("ARC_SEGMENT_DETECTED", {
        lote: label,
        segmentIndex: row.segment_index,
        length: distance,
        radius: row.radius,
        chord: row.chord,
      });
    }

    parsed.push(row);
  }

  parsed.sort((a, b) => a.segment_index - b.segment_index);
  return sanitizeOfficialSegments(parsed, label);
}

export function segmentsToPersistJson(
  segments: OfficialLotSegment[],
): Record<string, unknown>[] {
  return segments.map((s) => {
    const base: Record<string, unknown> = {
      segment_index: s.segment_index,
      type: s.segment_type ?? "LINE",
      distance: s.distance,
      length: s.distance,
      bearing: s.bearing,
      north: s.north,
      east: s.east,
      northing: s.north,
      easting: s.east,
      vertex_order: s.vertex_order,
    };
    if (s.segment_type === "CURVE") {
      base.radius = s.radius;
      base.chord = s.chord;
      base.delta = s.delta;
      base.tangent = s.tangent;
      base.course = s.course;
      base.courseIn = s.course_in;
      base.courseOut = s.course_out;
      base.rpNorth = s.rp_north;
      base.rpEast = s.rp_east;
      base.endNorth = s.end_north;
      base.endEast = s.end_east;
    }
    return base;
  });
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

/** Frente travada no segmento escolhido (manual ou rua) — sem frente composta. */
export function isFrontSegmentLocked(
  block: Record<string, unknown> | null | undefined,
): boolean {
  const stored = block?.front_segment_index;
  return typeof stored === "number" && Number.isFinite(stored) && stored >= 0;
}

/** Percorre o anel TXT a partir da frente; índices = segment_index. */
function collectRingArcFromFront(
  ordered: OfficialLotSegment[],
  frontSegmentIndex: number,
  stopSegmentIndexes: Set<number>,
  step: 1 | -1,
  exclude: Set<number>,
): number[] {
  const n = ordered.length;
  const ringPos = ordered.findIndex(
    (s) => s.segment_index === frontSegmentIndex,
  );
  if (ringPos < 0) return [];

  const indexes: number[] = [];
  let pos = (ringPos + step + n) % n;
  for (let guard = 0; guard < n; guard++) {
    const segIdx = ordered[pos].segment_index;
    if (stopSegmentIndexes.has(segIdx)) break;
    if (!exclude.has(segIdx)) indexes.push(segIdx);
    pos = (pos + step + n) % n;
  }
  return indexes;
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
 * Classifica lados por grupos de deflexão angular (topografia TXT).
 * pathA = lateral horário (frente → fundo) | pathB = lateral anti-horário.
 */
export function classifySidesByTxtRingPaths(
  segments: OfficialLotSegment[],
  frontSegmentIndex: number,
  lotLabel?: unknown,
  block?: Record<string, unknown> | null,
): OfficialMeasurePaths {
  const n = segments.length;
  const byIdx = new Map(segments.map((s) => [s.segment_index, s]));
  const emptyPaths: RingPathResult = { indexes: [], totalLength: 0 };

  if (n < 2) {
    const only = byIdx.get(frontSegmentIndex);
    const len = only && isValidSegmentDistance(only.distance) ? only.distance : 0;
    return {
      frente: len,
      fundo: 0,
      ladoDireito: 0,
      ladoEsquerdo: 0,
      pathA: emptyPaths,
      pathB: emptyPaths,
      pathFundo: emptyPaths,
      frontIndex: frontSegmentIndex,
    };
  }

  const lockedFront = isFrontSegmentLocked(block);
  const streetFront = hasStreetFrontIdentified(block ?? {});
  const cornerLotMode = lockedFront || streetFront;

  const chanfreIndexes = detectChanfreIndexesByDeflection(
    segments,
    lotLabel,
    cornerLotMode ? frontSegmentIndex : null,
  );
  const chanfreSet = new Set(chanfreIndexes);
  const groups = groupSegmentsByDeflection(segments, lotLabel);
  if (groups.length === 0) {
    return {
      frente: 0,
      fundo: 0,
      ladoDireito: 0,
      ladoEsquerdo: 0,
      pathA: emptyPaths,
      pathB: emptyPaths,
      pathFundo: emptyPaths,
      frontIndex: frontSegmentIndex,
    };
  }

  const ordered = [...segments].sort((a, b) => a.segment_index - b.segment_index);
  const ringPos = ordered.findIndex(
    (s) => s.segment_index === frontSegmentIndex,
  );

  let frontGroupIdx = groups.findIndex((g) =>
    g.segmentIndexes.includes(frontSegmentIndex),
  );
  if (frontGroupIdx < 0) frontGroupIdx = 0;

  const frontGroup = groups[frontGroupIdx];
  const numGroups = groups.length;

  const frontSeg = byIdx.get(frontSegmentIndex);
  const frontNext = ordered[(ringPos + 1) % n];
  const frontBearing = frontSeg
    ? resolveSegmentBearing(frontSeg, frontNext)
    : frontGroup.averageBearing;

  let backGroupIdx = 0;
  let bestOpposite = -1;
  for (let g = 0; g < numGroups; g++) {
    if (g === frontGroupIdx && !lockedFront) continue;
    if (lockedFront && groups[g].segmentIndexes.includes(frontSegmentIndex)) {
      continue;
    }
    const opp = angularDifferenceDeg(
      frontBearing,
      groups[g].averageBearing,
    );
    if (opp > bestOpposite) {
      bestOpposite = opp;
      backGroupIdx = g;
    }
  }

  const withoutChanfre = (indexes: number[]) =>
    indexes.filter((idx) => !chanfreSet.has(idx));

  const fundoIndexes = withoutChanfre(groups[backGroupIdx].segmentIndexes);
  const fundoStop = new Set(fundoIndexes);
  const excludeWalk = new Set<number>([
    frontSegmentIndex,
    ...chanfreIndexes,
  ]);

  const useRingWalk =
    cornerLotMode || chanfreIndexes.length > 0 || lockedFront;

  let pathAIndexes: number[];
  let pathBIndexes: number[];

  if (useRingWalk) {
    pathAIndexes = collectRingArcFromFront(
      ordered,
      frontSegmentIndex,
      fundoStop,
      1,
      excludeWalk,
    );
    pathBIndexes = collectRingArcFromFront(
      ordered,
      frontSegmentIndex,
      fundoStop,
      -1,
      excludeWalk,
    );
  } else {
    const collectGroupPath = (
      fromGroup: number,
      toGroup: number,
      step: 1 | -1,
    ): number[] => {
      const indexes: number[] = [];
      let g = fromGroup;
      for (let guard = 0; guard < numGroups; guard++) {
        g = (g + step + numGroups) % numGroups;
        if (g === toGroup) break;
        indexes.push(...withoutChanfre(groups[g].segmentIndexes));
      }
      return indexes;
    };

    pathAIndexes = collectGroupPath(frontGroupIdx, backGroupIdx, 1);
    pathBIndexes = collectGroupPath(frontGroupIdx, backGroupIdx, -1);
  }

  if (lockedFront) {
    console.log("FRONT_SEGMENT_MANUAL_LOCKED", {
      lote: lotLabel ?? block?.number ?? block?.id,
      frontSegmentIndex,
      distance: frontSeg?.distance,
      note: "frente manual/travada = somente este segmento",
    });
  }

  const d = Number(frontSeg?.distance);
  const frenteLen =
    cornerLotMode || chanfreIndexes.length > 0
      ? isValidSegmentDistance(d)
        ? d
        : 0
      : frontGroup.totalLength;

  const pathA: RingPathResult = {
    indexes: pathAIndexes,
    totalLength: sumPathDistances(pathAIndexes, byIdx),
  };
  const pathB: RingPathResult = {
    indexes: pathBIndexes,
    totalLength: sumPathDistances(pathBIndexes, byIdx),
  };
  const pathFundo: RingPathResult = {
    indexes: fundoIndexes,
    totalLength: sumPathDistances(fundoIndexes, byIdx),
  };

  const result = {
    frente: isValidSegmentDistance(frenteLen) ? round2(frenteLen) : 0,
    fundo: pathFundo.totalLength,
    ladoDireito: pathA.totalLength,
    ladoEsquerdo: pathB.totalLength,
    pathA,
    pathB,
    pathFundo,
    frontIndex: frontSegmentIndex,
  };

  console.log("OFFICIAL_GROUPED_MEASURES", {
    lote: lotLabel ?? "?",
    frontLocked: lockedFront,
    streetFront,
    cornerLotMode,
    frontGroupIdx,
    backGroupIdx,
    frontSegmentIndex,
    chanfreIndexes,
    frente: result.frente,
    fundo: result.fundo,
    ladoDireito: result.ladoDireito,
    ladoEsquerdo: result.ladoEsquerdo,
    frontGroupSegments: cornerLotMode
      ? [frontSegmentIndex]
      : frontGroup.segmentIndexes,
    backGroupSegments: groups[backGroupIdx].segmentIndexes,
    pathRightSegments: pathAIndexes,
    pathLeftSegments: pathBIndexes,
  });

  if (cornerLotMode || chanfreIndexes.length > 0) {
    const byIdx = new Map(segments.map((s) => [s.segment_index, s]));
    const classify = (idx: number) => {
      if (idx === frontSegmentIndex) return "frente";
      if (chanfreSet.has(idx)) return "chanfre";
      if (fundoIndexes.includes(idx)) return "fundo";
      if (pathAIndexes.includes(idx)) return "lado_direito";
      if (pathBIndexes.includes(idx)) return "lado_esquerdo";
      return "perimetro";
    };
    console.log("CORNER_LOT_MEASURE_CLASSIFICATION", {
      lote: lotLabel ?? block?.number ?? block?.id,
      frontSegmentIndex,
      frenteM: result.frente,
      chanfreM: chanfreIndexes.map((i) => byIdx.get(i)?.distance),
      laterais: {
        direitoM: result.ladoDireito,
        esquerdoM: result.ladoEsquerdo,
      },
      segments: segments.map((s) => ({
        index: s.segment_index,
        distanceM: s.distance,
        role: classify(s.segment_index),
      })),
    });
  }

  return result;
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
      console.log("FRONT_SEGMENT_MANUAL_LOCKED", {
        lote: block.number ?? block.id,
        frontIndex: idx,
        street: hasStreet,
        source: "front_segment_index",
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

/** Segmento TXT que toca a rua (proximidade mínima), não só índice da aresta do polígono. */
export function findFrontSegmentIndexFromStreetEdge(
  segments: OfficialLotSegment[],
  geometryEdgeIndex: number,
  lotLabel?: unknown,
  ringLngLat?: number[][],
  streetGuides?: StreetGuideLineInput[],
  preferredStreetId?: string | null,
): number {
  if (segments.length === 0) return 0;

  if (ringLngLat && streetGuides && streetGuides.length > 0) {
    return findFrontSegmentIndexTouchingStreet(
      segments,
      ringLngLat,
      streetGuides,
      preferredStreetId,
      lotLabel,
    );
  }

  const idx = Math.min(
    Math.max(0, Math.floor(geometryEdgeIndex)),
    segments.length - 1,
  );
  const ordered = [...segments].sort(
    (a, b) => a.segment_index - b.segment_index,
  );
  const mapped = ordered[idx]?.segment_index ?? idx;
  console.log("FRONT_SEGMENT_SELECTED_FROM_STREET", {
    lote: lotLabel ?? "?",
    frontIndex: mapped,
    geometryEdgeIndex,
    scoring: "edge_index_fallback",
  });
  return mapped;
}

function computeChanfreFromDeflection(
  segments: OfficialLotSegment[],
  chanfreIndexes: number[],
): ChanfreInfo | null {
  if (chanfreIndexes.length === 0) return null;
  const byIdx = new Map(segments.map((s) => [s.segment_index, s]));
  const dists: number[] = [];
  for (const idx of chanfreIndexes) {
    const d = Number(byIdx.get(idx)?.distance);
    if (isValidSegmentDistance(d)) dists.push(round2(d));
  }
  if (dists.length === 0) return null;
  const total = round2(dists.reduce((a, b) => a + b, 0));
  return { total, segments: dists };
}

function computeChanfreFromTxtPaths(
  segments: OfficialLotSegment[],
  frontIdx: number,
  pathA: RingPathResult,
  pathB: RingPathResult,
  pathFundo: RingPathResult,
  chanfreByDeflection: number[],
): ChanfreInfo | null {
  const fromDeflection = computeChanfreFromDeflection(
    segments,
    chanfreByDeflection,
  );
  if (fromDeflection) return fromDeflection;

  const used = new Set([
    frontIdx,
    ...pathA.indexes,
    ...pathB.indexes,
    ...pathFundo.indexes,
    ...chanfreByDeflection,
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

  const paths = classifySidesByTxtRingPaths(segments, frontIdx, label, block);

  logLotSideSegments(label, "right", paths.pathA, segments);
  logLotSideSegments(label, "left", paths.pathB, segments);

  const perimeter = round2(
    segments.reduce((sum, s) => {
      const length = Number(s.distance);
      return isValidSegmentDistance(length) ? sum + length : sum;
    }, 0),
  );

  const areaRaw = Number(block.area);
  const area =
    Number.isFinite(areaRaw) && areaRaw > 0 ? round2(areaRaw) : null;

  const chanfreIndexes = detectChanfreIndexesByDeflection(
    segments,
    label,
    frontIdx,
  );
  const chanfre = computeChanfreFromTxtPaths(
    segments,
    frontIdx,
    paths.pathA,
    paths.pathB,
    paths.pathFundo,
    chanfreIndexes,
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
  _lockedFront?: boolean,
  _groups?: SegmentDeflectionGroup[],
  segment?: OfficialLotSegment,
  lotLabel?: unknown,
): OfficialSegmentClassification {
  if (chanfreIndexes.includes(segmentIndex)) return "chanfre";
  let role: OfficialSegmentClassification = "perimetro";
  if (segmentIndex === frontIdx) role = "frente";
  else if (paths.pathFundo.indexes.includes(segmentIndex)) role = "fundo";
  else if (paths.pathA.indexes.includes(segmentIndex)) role = "lado_direito";
  else if (paths.pathB.indexes.includes(segmentIndex)) role = "lado_esquerdo";

  if (segment?.segment_type === "CURVE") {
    console.log("ARC_SIDE_CLASSIFIED", {
      lote: lotLabel ?? "?",
      segmentIndex,
      role,
      lengthM: segment.distance,
      radiusM: segment.radius,
    });
  }
  return role;
}

/** Rótulo de distância para popup, memorial e prancha. */
export function formatOfficialSegmentDistancia(
  seg: OfficialLotSegment,
  distanceM: number,
): string {
  const base = distanceM.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (seg.segment_type === "CURVE" && seg.radius != null && seg.radius > 0) {
    const r = seg.radius.toLocaleString("pt-BR", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    return `${base} m — Curva R=${r} m`;
  }
  return `${base} m`;
}

/** Texto memorial para segmento em curva. */
export function formatCurveMemorialDescription(seg: OfficialLotSegment): string {
  const dev = seg.distance.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const raio = (seg.radius ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const corda = (seg.chord ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `segue em curva com desenvolvimento de ${dev} m, raio de ${raio} m e corda de ${corda} m`;
}

function resolveChanfreSegmentIndexes(
  segments: OfficialLotSegment[],
  frontIdx: number,
  paths: OfficialMeasurePaths,
  lotLabel?: unknown,
): number[] {
  const byDeflection = detectChanfreIndexesByDeflection(
    segments,
    lotLabel,
    frontIdx,
  );
  if (byDeflection.length > 0) return byDeflection;

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

  const lockedFront = isFrontSegmentLocked(lot);
  const paths = classifySidesByTxtRingPaths(segments, frontIdx, label, lot);
  const chanfreIdx = resolveChanfreSegmentIndexes(
    segments,
    frontIdx,
    paths,
    label,
  );
  const deflectionGroups = groupSegmentsByDeflection(segments, label);

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
        ? s.segment_type === "CURVE" && (s.radius ?? 0) > 0
          ? formatCurveMemorialDescription(s)
          : formatOfficialSegmentDistancia(s, distanceM!)
        : "Segmento inválido ignorado",
      coordE: formatOfficialCoord(
        s.segment_type === "CURVE" && s.end_east != null
          ? s.end_east
          : next.east,
      ),
      coordN: formatOfficialCoord(
        s.segment_type === "CURVE" && s.end_north != null
          ? s.end_north
          : next.north,
      ),
      classification: classifySegmentForTable(
        s.segment_index,
        frontIdx,
        paths,
        chanfreIdx,
        lockedFront,
        deflectionGroups,
        s,
        label,
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
    let label = `${row.distanceM!.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} m`;
    const rMatch = row.distancia.match(/R\s*=\s*([0-9.,]+)\s*m/i);
    if (rMatch) label += ` (R=${rMatch[1]} m)`;
    byIndex.set(row.segment_index, label);
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
