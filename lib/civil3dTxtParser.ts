/**
 * Parser TXT Civil 3D — suporte a Segment Line e Curve.
 * Medida oficial da curva: Length (nunca Chord).
 * Geometria do mapa: corda (início → fim de cada segmento), sem RP, sem arco.
 */

import proj4 from "proj4";
import {
  isValidSegmentDistance,
  parseOfficialSegmentsFromBlock,
  type OfficialLotSegment,
} from "@/lib/officialLotMeasurements";

export type Civil3dSegmentKind = "LINE" | "CURVE";

export type ParsedCivil3dSegment = {
  segmentNumber: number;
  type: Civil3dSegmentKind;
  north: number;
  east: number;
  length: number | null;
  bearing: number | null;
  radius: number | null;
  delta: number | null;
  tangent: number | null;
  chord: number | null;
  course: number | null;
  courseIn: number | null;
  courseOut: number | null;
  rpNorth: number | null;
  rpEast: number | null;
  endNorth: number | null;
  endEast: number | null;
};

export type ParsedCivil3dLot = {
  name: string;
  area: number;
  perimeter: number;
  segments: ParsedCivil3dSegment[];
};

export type LotRingBuildResult = {
  utmRing: [number, number][];
  lngLat: number[][];
  closureErrorM: number;
  locationOk: boolean;
};

const CLOSURE_MAX_M = 0.1;
/** Distância máxima (km) do centro do projeto para aceitar geometria importada. */
const PROJECT_LOCATION_MAX_KM = 5;
/** Distância máxima (km) entre centroide da quadra importada e do projeto. */
export const QUADRA_IMPORT_MAX_KM_FROM_PROJECT = 5;

export const QUADRA_OUT_OF_PROJECT_MESSAGE =
  "Quadra fora da área do projeto. Verifique a zona UTM ou o arquivo TXT.";

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseBrNumber(raw: string | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  const s = String(raw)
    .trim()
    .replace(/\s*m\s*$/i, "");
  const normalized = /\d,\d/.test(s)
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function readField(block: string, labels: string[]): number | null {
  for (const label of labels) {
    const re = new RegExp(
      `(?:^|\\n)\\s*${label}\\s*:\\s*([0-9+\\-.,]+)\\s*m?`,
      "im",
    );
    const m = block.match(re);
    if (m) {
      const v = parseBrNumber(m[1]);
      if (v != null) return v;
    }
  }
  return null;
}

/** North/Easting do cabeçalho do lote — nunca "End North" / "RP North". */
function readLotHeaderCoord(
  header: string,
  kind: "north" | "east",
): number | null {
  const label =
    kind === "north"
      ? "(?<!End\\s)(?<!RP\\s)North(?:ing)?"
      : "(?<!End\\s)(?<!RP\\s)East(?:ing)?";
  const re = new RegExp(
    `(?:^|\\n)\\s*${label}\\s*:\\s*([0-9+\\-.,]+)\\s*m?`,
    "im",
  );
  const m = header.match(re);
  if (!m) return null;
  return parseBrNumber(m[1]);
}

function readAllCoordPairs(
  block: string,
): Array<{ north: number; east: number }> {
  const northMatches = [
    ...block.matchAll(
      /(?:^|\n)\s*(?<!End\s)(?<!RP\s)(?:Northing|North|Norte)\s*:\s*([0-9+\-.,]+)\s*m?/gim,
    ),
  ];
  const eastMatches = [
    ...block.matchAll(
      /(?:^|\n)\s*(?<!End\s)(?<!RP\s)(?:Easting|East|Este)\s*:\s*([0-9+\-.,]+)\s*m?/gim,
    ),
  ];
  const pairs: Array<{ north: number; east: number }> = [];
  const n = Math.min(northMatches.length, eastMatches.length);
  for (let i = 0; i < n; i++) {
    const north = parseBrNumber(northMatches[i][1]);
    const east = parseBrNumber(eastMatches[i][1]);
    if (north != null && east != null) pairs.push({ north, east });
  }
  return pairs;
}

function parseDirectionBearing(block: string): number | null {
  const m = block.match(
    /(?:Direction|Azimuth|Azimute|Bearing|Course)\s*:\s*([^\n]+)/i,
  );
  if (!m) return null;
  const line = m[1].trim();
  const dms = line.match(
    /([NS])\s*(\d+(?:\.\d+)?)\s*(?:°|º|d)?\s*(\d+(?:\.\d+)?)?\s*['′]?\s*(\d+(?:\.\d+)?)?\s*["″]?\s*([EW])/i,
  );
  if (dms) {
    const hem1 = dms[1].toUpperCase();
    const deg = Number(dms[2]) || 0;
    const min = Number(dms[3]) || 0;
    const sec = Number(dms[4]) || 0;
    const hem2 = dms[5].toUpperCase();
    let dec = deg + min / 60 + sec / 3600;
    if (hem1 === "S") dec = 180 - dec;
    if (hem2 === "W") dec = 360 - dec;
    return round2(((dec % 360) + 360) % 360);
  }
  const dec = parseBrNumber(line.replace(/[^\d.,+\-]/g, ""));
  return dec != null ? round2(dec) : null;
}

function isCurveBlock(block: string): boolean {
  return (
    /\bType\s*:\s*Curve\b/i.test(block) ||
    /(?:^|\n)\s*Curve\b/i.test(block) ||
    /\bCurve\s+Length\b/i.test(block)
  );
}

function isNearPoint(
  n1: number,
  e1: number,
  n2: number | null,
  e2: number | null,
  tol = 0.05,
): boolean {
  if (n2 == null || e2 == null) return false;
  return Math.hypot(e1 - e2, n1 - n2) < tol;
}

/** Ponto inicial do lote (North/East antes do Segment #1 — não End North). */
function parseLotHeaderStart(
  chunk: string,
): { north: number; east: number } | null {
  const header = chunk.split(/Segment\s*#\s*1\b/i)[0] ?? chunk;
  const north = readLotHeaderCoord(header, "north");
  const east = readLotHeaderCoord(header, "east");
  if (north != null && east != null) return { north, east };
  return null;
}

function computeChainClosureErrorM(
  segments: Array<{ north: number; east: number; endNorth: number | null; endEast: number | null }>,
): number {
  if (segments.length < 2) return Infinity;
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (last.endNorth == null || last.endEast == null) return Infinity;
  return Math.hypot(
    last.endEast - first.east,
    last.endNorth - first.north,
  );
}

function chainSegmentEndpoints(
  segments: ParsedCivil3dSegment[],
  lotStart: { north: number; east: number } | null,
  lotLabel: string,
): ParsedCivil3dSegment[] {
  const out = segments.map((s) => ({ ...s }));

  if (lotStart) {
    console.log("TXT_LOT_START_POINT", {
      lote: lotLabel,
      north: lotStart.north,
      east: lotStart.east,
      source: "header_before_segment_1",
    });
    out[0].north = lotStart.north;
    out[0].east = lotStart.east;
  } else if (out.length > 0) {
    console.warn("TXT_LOT_START_POINT", {
      lote: lotLabel,
      warning: "missing_header_start_using_segment_1_coords",
      north: out[0].north,
      east: out[0].east,
    });
  }

  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1];
    const cur = out[i];
    if (prev.endNorth != null && prev.endEast != null) {
      cur.north = prev.endNorth;
      cur.east = prev.endEast;
    }
  }

  const chainLog = out.map((s) => ({
    seg: s.segmentNumber,
    type: s.type,
    start: { n: round2(s.north), e: round2(s.east) },
    end:
      s.endNorth != null
        ? { n: round2(s.endNorth), e: round2(s.endEast) }
        : null,
  }));
  console.log("TXT_SEGMENT_CHAIN", { lote: lotLabel, chain: chainLog });

  const closureErr = computeChainClosureErrorM(out);
  console.log("TXT_CHAIN_CLOSURE_ERROR", {
    lote: lotLabel,
    closureErrorM: round2(closureErr),
    maxAllowedM: CLOSURE_MAX_M,
    ok: closureErr <= CLOSURE_MAX_M,
  });

  return out;
}

function parseOneSegmentBlock(
  block: string,
  segmentNumber: number,
  lotLabel: string,
): ParsedCivil3dSegment | null {
  const type: Civil3dSegmentKind = isCurveBlock(block) ? "CURVE" : "LINE";
  const coordPairs = readAllCoordPairs(block);

  const rpNorth = readField(block, [
    "RP North",
    "RP Northing",
    "Radius Point Northing",
    "Point of Curve Northing",
    "PI Northing",
  ]);
  const rpEast = readField(block, [
    "RP East",
    "RP Easting",
    "Radius Point Easting",
    "Point of Curve Easting",
    "PI Easting",
  ]);

  let endN = readField(block, [
    "End North",
    "End Northing",
    "Ending Northing",
    "Northing End",
  ]);
  let endE = readField(block, [
    "End East",
    "End Easting",
    "Ending Easting",
    "Easting End",
  ]);

  if (type === "CURVE") {
    if (rpNorth != null && rpEast != null) {
      console.log("ARC_RP_IGNORED_FOR_POLYGON", {
        lote: lotLabel,
        segmentNumber,
        rpNorth,
        rpEast,
      });
    }
    if (endN == null || endE == null) {
      for (const pair of coordPairs) {
        if (isNearPoint(pair.north, pair.east, rpNorth, rpEast)) continue;
        endN = pair.north;
        endE = pair.east;
        break;
      }
    }
  } else {
    const lineEnd = coordPairs[coordPairs.length - 1];
    if (lineEnd) {
      endN = lineEnd.north;
      endE = lineEnd.east;
    }
  }

  if (endN == null || endE == null) return null;

  const length = readField(block, ["Length", "Comprimento"]);
  const radius = readField(block, ["Radius", "Raio"]);
  const chord = readField(block, ["Chord", "Corda"]);
  const delta = readField(block, ["Delta", "Deflection", "Deflexão"]);
  const tangent = readField(block, ["Tangent", "Tangente"]);
  const course = readField(block, ["Course", "Azimuth", "Azimute"]);
  const courseIn = readField(block, ["Course In", "CourseIn", "Azimuth In"]);
  const courseOut = readField(block, [
    "Course Out",
    "CourseOut",
    "Azimuth Out",
  ]);

  const bearing =
    courseOut ?? course ?? courseIn ?? parseDirectionBearing(block);

  if (type === "CURVE") {
    console.log("ARC_SEGMENT_DETECTED", {
      lote: lotLabel,
      segmentNumber,
      length,
      radius,
      chord,
      endNorth: endN,
      endEast: endE,
    });
  }

  return {
    segmentNumber,
    type,
    north: 0,
    east: 0,
    length,
    bearing,
    radius,
    delta,
    tangent,
    chord,
    course,
    courseIn,
    courseOut,
    rpNorth,
    rpEast,
    endNorth: endN,
    endEast: endE,
  };
}

function parseLegacyVertexSegments(chunk: string): ParsedCivil3dSegment[] {
  const northingMatches = [
    ...chunk.matchAll(
      /(?<!End\s)(?<!RP\s)North(?:ing)?\s*:\s*([0-9.+-]+)/gi,
    ),
  ];
  const eastingMatches = [
    ...chunk.matchAll(/(?<!End\s)(?<!RP\s)East(?:ing)?\s*:\s*([0-9.+-]+)/gi),
  ];
  const lengthMatches = [...chunk.matchAll(/Length\s*:\s*([0-9.+-]+)/gi)];
  const n = Math.min(northingMatches.length, eastingMatches.length);
  if (n < 2) return [];

  const out: ParsedCivil3dSegment[] = [];
  for (let i = 0; i < n; i++) {
    const north = parseBrNumber(northingMatches[i][1]);
    const east = parseBrNumber(eastingMatches[i][1]);
    if (north == null || east == null) continue;
    const length =
      i < lengthMatches.length
        ? parseBrNumber(lengthMatches[i][1])
        : null;
    out.push({
      segmentNumber: i + 1,
      type: "LINE",
      north,
      east,
      length,
      bearing: null,
      radius: null,
      delta: null,
      tangent: null,
      chord: null,
      course: null,
      courseIn: null,
      courseOut: null,
      rpNorth: null,
      rpEast: null,
      endNorth: null,
      endEast: null,
    });
  }
  return out;
}

function parseSegmentBlocks(
  chunk: string,
  lotLabel: string,
): ParsedCivil3dSegment[] {
  const parts = chunk.split(/(?=Segment\s*#\s*\d+)/i);
  const segments: ParsedCivil3dSegment[] = [];

  for (const part of parts) {
    const header = part.match(/Segment\s*#\s*(\d+)/i);
    if (!header) continue;
    const seg = parseOneSegmentBlock(part, Number(header[1]), lotLabel);
    if (seg) segments.push(seg);
  }

  if (segments.length === 0) {
    const legacy = parseLegacyVertexSegments(chunk);
    for (let i = 0; i < legacy.length; i++) {
      const next = legacy[(i + 1) % legacy.length];
      legacy[i].endNorth = next.north;
      legacy[i].endEast = next.east;
    }
    return legacy;
  }

  segments.sort((a, b) => a.segmentNumber - b.segmentNumber);
  return segments;
}

function parseLotChunk(chunk: string): ParsedCivil3dLot | null {
  const name = chunk.split("\n")[0]?.trim();
  if (!name) return null;

  const areaMatch = chunk.match(/Area\s*:\s*([0-9.,+-]+)/i);
  const perimeterMatch = chunk.match(/Perimeter\s*:\s*([0-9.,+-]+)/i);
  const area = parseBrNumber(areaMatch?.[1] ?? "") ?? 0;
  const perimeter = parseBrNumber(perimeterMatch?.[1] ?? "") ?? 0;
  const lotStart = parseLotHeaderStart(chunk);
  let segments = parseSegmentBlocks(chunk, name);
  segments = chainSegmentEndpoints(segments, lotStart, name);

  if (segments.length < 2) return null;

  return { name, area, perimeter, segments };
}

export function parseCivil3dTxtLots(text: string): ParsedCivil3dLot[] {
  const chunks = text.split(/Name:\s*/i).slice(1);
  const lots: ParsedCivil3dLot[] = [];
  for (const chunk of chunks) {
    const lot = parseLotChunk(chunk);
    if (lot) lots.push(lot);
  }
  return lots;
}

export function parsedSegmentToOfficial(
  p: ParsedCivil3dSegment,
  index: number,
  lotLabel?: string,
): OfficialLotSegment | null {
  const length = p.length;
  if (length == null || !isValidSegmentDistance(length)) {
    return null;
  }

  if (p.type === "CURVE") {
    console.log("ARC_MEASURE_USED", {
      lote: lotLabel ?? "?",
      segmentIndex: index,
      length: round2(length),
      chord: p.chord,
      radius: p.radius,
    });
  }

  const seg: OfficialLotSegment = {
    segment_index: index,
    segment_type: p.type,
    distance: round2(length),
    bearing: p.bearing,
    north: round2(p.north),
    east: round2(p.east),
    vertex_order: index,
    end_north: p.endNorth != null ? round2(p.endNorth) : null,
    end_east: p.endEast != null ? round2(p.endEast) : null,
  };

  if (p.type === "CURVE") {
    seg.radius = p.radius != null ? round2(p.radius) : null;
    seg.chord = p.chord != null ? round2(p.chord) : null;
    seg.delta = p.delta;
    seg.tangent = p.tangent != null ? round2(p.tangent) : null;
    seg.course = p.course;
    seg.course_in = p.courseIn;
    seg.course_out = p.courseOut;
    seg.rp_north = p.rpNorth != null ? round2(p.rpNorth) : null;
    seg.rp_east = p.rpEast != null ? round2(p.rpEast) : null;
  }

  return seg;
}

export function civil3dParsedToOfficialSegments(
  parsed: ParsedCivil3dSegment[],
  lotLabel?: string,
): OfficialLotSegment[] {
  const out: OfficialLotSegment[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const seg = parsedSegmentToOfficial(parsed[i], i, lotLabel);
    if (seg) out.push(seg);
  }
  return out.map((s, i) => ({ ...s, segment_index: i, vertex_order: i }));
}

/** Preenche fim do segmento a partir do início do próximo — não altera o ponto inicial do lote. */
export function hydrateSegmentEndsFromChain(
  segments: OfficialLotSegment[],
): OfficialLotSegment[] {
  const ordered = [...segments].sort(
    (a, b) => a.segment_index - b.segment_index,
  );
  if (ordered.length < 2) return ordered;

  for (let i = 0; i < ordered.length; i++) {
    const cur = ordered[i];
    const next = ordered[(i + 1) % ordered.length];
    if (cur.end_north == null || cur.end_east == null) {
      cur.end_north = next.north;
      cur.end_east = next.east;
    }
  }
  return ordered;
}

export function computeOfficialChainClosureErrorM(
  segments: OfficialLotSegment[],
): number {
  const ordered = hydrateSegmentEndsFromChain(segments);
  if (ordered.length < 2) return Infinity;
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (last.end_north == null || last.end_east == null) return Infinity;
  return Math.hypot(
    last.end_east! - first.east,
    last.end_north! - first.north,
  );
}

/**
 * Anel UTM: vértice = início de cada segmento (já encadeado no import).
 * Curva desenhada pela corda; RP nunca entra no anel.
 */
export function buildUtmRingFromOfficialSegments(
  segments: OfficialLotSegment[],
  lotLabel?: unknown,
): [number, number][] {
  const ordered = hydrateSegmentEndsFromChain(segments);
  const ring: [number, number][] = [];

  for (const seg of ordered) {
    if (!Number.isFinite(seg.east) || !Number.isFinite(seg.north)) continue;
    const prev = ring[ring.length - 1];
    if (
      prev &&
      Math.hypot(prev[0] - seg.east, prev[1] - seg.north) < 0.01
    ) {
      continue;
    }
    ring.push([seg.east, seg.north]);
    if (seg.segment_type === "CURVE") {
      console.log("ARC_DRAW_AS_CHORD", {
        lote: lotLabel ?? "?",
        segmentIndex: seg.segment_index,
        start: { east: seg.east, north: seg.north },
        end: { east: seg.end_east, north: seg.end_north },
        lengthOfficial: seg.distance,
      });
    }
  }

  if (ring.length > 2) {
    const f = ring[0];
    const l = ring[ring.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) > 0.05) {
      ring.push([f[0], f[1]]);
    }
  }

  console.log("LOT_RING_POINTS_BUILT", {
    lote: lotLabel ?? "?",
    vertexCount: ring.length,
    closureErrorM: round2(computeOfficialChainClosureErrorM(ordered)),
  });

  return ring;
}

export function utmRingToLngLat(
  ring: [number, number][],
  proj4UtmSouth: string,
): number[][] {
  const coords: number[][] = [];
  for (const [e, n] of ring) {
    const [lng, lat] = proj4(proj4UtmSouth, "EPSG:4326", [e, n]);
    coords.push([lng, lat]);
  }
  return coords;
}

export function resolveUtmProj4FromProject(
  project?: Record<string, unknown> | null,
  fallbackZoneNum?: number,
): string | null {
  const raw = String(
    project?.utm_zone ?? project?.zona_utm ?? project?.utmZone ?? "",
  ).trim();
  const m = raw.match(/(\d{1,2})\s*([NnSs])?/i);
  if (m?.[1]) {
    const zone = Number(m[1]);
    const south = !m[2] || m[2].toUpperCase() === "S";
    return `+proj=utm +zone=${zone} +${south ? "south" : "north"} +datum=WGS84 +units=m +no_defs`;
  }
  if (
    fallbackZoneNum != null &&
    Number.isFinite(fallbackZoneNum) &&
    fallbackZoneNum >= 1 &&
    fallbackZoneNum <= 60
  ) {
    return `+proj=utm +zone=${fallbackZoneNum} +south +datum=WGS84 +units=m +no_defs`;
  }
  return null;
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeLngLatCentroidFromRings(
  rings: number[][][],
): { lat: number; lng: number } | null {
  let sumLat = 0;
  let sumLng = 0;
  let n = 0;
  for (const ring of rings) {
    for (const c of ring) {
      if (c?.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        sumLng += Number(c[0]);
        sumLat += Number(c[1]);
        n++;
      }
    }
  }
  if (n < 1) return null;
  return { lat: sumLat / n, lng: sumLng / n };
}

export function computeQuadraCentroidFromImportLots(
  lots: Array<{ coords: number[][]; geometrySaved: boolean }>,
): { lat: number; lng: number } | null {
  const rings = lots
    .filter((l) => l.geometrySaved && l.coords.length >= 3)
    .map((l) => l.coords);
  return computeLngLatCentroidFromRings(rings);
}

export type QuadraLocationValidation = {
  ok: boolean;
  blocked: boolean;
  distanceKm: number | null;
  quadraCenter: { lat: number; lng: number } | null;
  projectCenter: { lat: number; lng: number } | null;
  skipped: boolean;
};

/** Compara centroide da quadra importada com o centroide do projeto (bloqueio > 5 km). */
export function validateQuadraImportAgainstProject(
  lots: Array<{ coords: number[][]; geometrySaved: boolean }>,
  projectCenter: { lat: number; lng: number } | null,
  quadraLabel: string,
): QuadraLocationValidation {
  const quadraCenter = computeQuadraCentroidFromImportLots(lots);

  if (!projectCenter) {
    console.log("QUADRA_IMPORT_LOCATION_CHECK", {
      quadra: quadraLabel,
      skipped: true,
      reason: "no_project_reference_geometry",
    });
    return {
      ok: true,
      blocked: false,
      distanceKm: null,
      quadraCenter,
      projectCenter: null,
      skipped: true,
    };
  }

  if (!quadraCenter) {
    console.log("QUADRA_IMPORT_LOCATION_CHECK", {
      quadra: quadraLabel,
      skipped: true,
      reason: "no_quadra_geometry_for_centroid",
    });
    return {
      ok: true,
      blocked: false,
      distanceKm: null,
      quadraCenter: null,
      projectCenter,
      skipped: true,
    };
  }

  const distanceKm = haversineKm(
    projectCenter.lat,
    projectCenter.lng,
    quadraCenter.lat,
    quadraCenter.lng,
  );
  const ok = distanceKm <= QUADRA_IMPORT_MAX_KM_FROM_PROJECT;

  console.log("QUADRA_IMPORT_LOCATION_CHECK", {
    quadra: quadraLabel,
    projectCenter,
    quadraCenter,
    distanceKm: round2(distanceKm),
    maxAllowedKm: QUADRA_IMPORT_MAX_KM_FROM_PROJECT,
    ok,
  });

  if (!ok) {
    console.log("INVALID_QUADRA_LOCATION_AFTER_TXT_PARSE", {
      quadra: quadraLabel,
      distanceKm: round2(distanceKm),
      maxAllowedKm: QUADRA_IMPORT_MAX_KM_FROM_PROJECT,
    });
  }

  return {
    ok,
    blocked: !ok,
    distanceKm,
    quadraCenter,
    projectCenter,
    skipped: false,
  };
}

export function validateLngLatNearProjectCenter(
  lngLat: number[][],
  projectCenter: { lat: number; lng: number } | null,
  lotLabel?: unknown,
): boolean {
  if (!projectCenter || lngLat.length < 3) return true;
  const cLat = projectCenter.lat;
  const cLng = projectCenter.lng;
  let maxKm = 0;
  for (const [lng, lat] of lngLat) {
    maxKm = Math.max(maxKm, haversineKm(cLat, cLng, lat, lng));
  }
  if (maxKm > PROJECT_LOCATION_MAX_KM) {
    console.log("INVALID_PROJECT_LOCATION_AFTER_TXT_PARSE", {
      lote: lotLabel ?? "?",
      projectCenter,
      maxDistanceKm: round2(maxKm),
      maxAllowedKm: PROJECT_LOCATION_MAX_KM,
      sample: lngLat[0],
    });
    return false;
  }
  return true;
}

export function buildValidatedLotRing(
  segments: OfficialLotSegment[],
  proj4UtmSouth: string,
  lotLabel: string,
  projectCenter?: { lat: number; lng: number } | null,
): LotRingBuildResult | null {
  const closureErrorM = computeOfficialChainClosureErrorM(segments);
  if (closureErrorM > CLOSURE_MAX_M) {
    console.log("TXT_CHAIN_CLOSURE_ERROR", {
      lote: lotLabel,
      closureErrorM: round2(closureErrorM),
      rejected: true,
    });
    return null;
  }

  const utmRing = buildUtmRingFromOfficialSegments(segments, lotLabel);
  if (utmRing.length < 3) return null;

  const lngLat = utmRingToLngLat(utmRing, proj4UtmSouth);
  const locationOk = validateLngLatNearProjectCenter(
    lngLat,
    projectCenter ?? null,
    lotLabel,
  );

  return {
    utmRing,
    lngLat,
    closureErrorM,
    locationOk,
  };
}

/** Reconstrói polígono lat/lng — só se fechamento e localização forem válidos. */
export function buildLngLatRingFromOfficialBlock(
  block: Record<string, unknown>,
  proj4UtmSouth: string,
  projectCenter?: { lat: number; lng: number } | null,
): number[][] | null {
  const segments = parseOfficialSegmentsFromBlock(block);
  if (segments.length < 3) return null;

  const built = buildValidatedLotRing(
    segments,
    proj4UtmSouth,
    String(block.number ?? block.id ?? "?"),
    projectCenter ?? null,
  );
  if (!built || !built.locationOk) return null;
  return built.lngLat;
}

export type Civil3dImportLotPayload = {
  name: string;
  area: number;
  perimeter: number;
  officialSegs: OfficialLotSegment[];
  segmentsJson: Record<string, unknown>[];
  coords: number[][];
  geometrySaved: boolean;
};

export function civil3dLotToImportPayload(
  lot: ParsedCivil3dLot,
  proj4UtmSouth: string,
  projectCenter?: { lat: number; lng: number } | null,
): Civil3dImportLotPayload {
  const officialSegs = civil3dParsedToOfficialSegments(lot.segments, lot.name);
  const segmentsJson = officialSegs.map((s) => officialSegmentToPersistJson(s));

  const built = buildValidatedLotRing(
    officialSegs,
    proj4UtmSouth,
    lot.name,
    projectCenter ?? null,
  );

  let coords: number[][] = [];
  let geometrySaved = false;

  if (built && built.locationOk) {
    coords = built.lngLat;
    geometrySaved = coords.length >= 4;
  } else {
    console.log("TXT_CHAIN_CLOSURE_ERROR", {
      lote: lot.name,
      note: "geometry_not_saved_closure_or_location",
    });
  }

  return {
    name: lot.name,
    area: lot.area,
    perimeter: lot.perimeter,
    officialSegs,
    segmentsJson,
    coords,
    geometrySaved,
  };
}

export function officialSegmentToPersistJson(
  s: OfficialLotSegment,
): Record<string, unknown> {
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
    endNorth: s.end_north,
    endEast: s.end_east,
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
  }
  return base;
}
