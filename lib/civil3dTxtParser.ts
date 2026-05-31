/**
 * Parser TXT Civil 3D — suporte a Segment Line e Curve.
 * Medida oficial da curva: Length (nunca Chord).
 */

import proj4 from "proj4";
import {
  bearingFromEn,
  isValidSegmentDistance,
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

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseBrNumber(raw: string | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  const normalized = /\d,\d/.test(s)
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function readField(block: string, labels: string[]): number | null {
  for (const label of labels) {
    const re = new RegExp(
      `(?:^|\\n)\\s*${label}\\s*:\\s*([0-9+\\-.,]+)`,
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

function readAllCoordPairs(
  block: string,
): Array<{ north: number; east: number }> {
  const northMatches = [
    ...block.matchAll(
      /(?:^|\n)\s*(?:Northing|North|Norte)\s*:\s*([0-9+\-.,]+)/gim,
    ),
  ];
  const eastMatches = [
    ...block.matchAll(
      /(?:^|\n)\s*(?:Easting|East|Este)\s*:\s*([0-9+\-.,]+)/gim,
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

function parseOneSegmentBlock(
  block: string,
  segmentNumber: number,
  lotLabel: string,
): ParsedCivil3dSegment | null {
  const type: Civil3dSegmentKind = isCurveBlock(block) ? "CURVE" : "LINE";
  const coordPairs = readAllCoordPairs(block);

  const endNorth = readField(block, [
    "End Northing",
    "Ending Northing",
    "End North",
    "Northing End",
  ]);
  const endEast = readField(block, [
    "End Easting",
    "Ending Easting",
    "End East",
    "Easting End",
  ]);
  const rpNorth = readField(block, [
    "RP Northing",
    "Radius Point Northing",
    "Point of Curve Northing",
    "PI Northing",
  ]);
  const rpEast = readField(block, [
    "RP Easting",
    "Radius Point Easting",
    "Point of Curve Easting",
    "PI Easting",
  ]);

  let north = readField(block, ["Start Northing", "Begin Northing"]);
  let east = readField(block, ["Start Easting", "Begin Easting"]);
  if (north == null || east == null) {
    const start = coordPairs[0];
    if (start) {
      north = start.north;
      east = start.east;
    }
  }

  let endN = endNorth;
  let endE = endEast;
  if (endN == null || endE == null) {
    const endPair =
      type === "CURVE" && coordPairs.length > 1
        ? coordPairs[coordPairs.length - 1]
        : null;
    if (endPair) {
      endN = endPair.north;
      endE = endPair.east;
    }
  }

  if (north == null || east == null) return null;

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

  let bearing =
    courseOut ?? course ?? courseIn ?? parseDirectionBearing(block);
  if (
    bearing == null &&
    endN != null &&
    endE != null &&
    type === "CURVE"
  ) {
    bearing = bearingFromEn(north, east, endN, endE);
  }

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
    north,
    east,
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
    ...chunk.matchAll(/North(?:ing)?\s*:\s*([0-9.+-]+)/gi),
  ];
  const eastingMatches = [
    ...chunk.matchAll(/East(?:ing)?\s*:\s*([0-9.+-]+)/gi),
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
    return parseLegacyVertexSegments(chunk);
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
  const segments = parseSegmentBlocks(chunk, name);

  if (segments.length < 2) return null;

  return { name, area, perimeter, segments };
}

/** Divide o arquivo TXT em lotes (blocos Name:). */
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
    console.log("LOT_INVALID_SEGMENT", {
      lote: lotLabel ?? "?",
      index,
      type: p.type,
      raw: length,
      reason: "missing_or_invalid_length",
    });
    return null;
  }

  if (p.type === "CURVE") {
    console.log("ARC_MEASURE_USED", {
      lote: lotLabel ?? "?",
      segmentIndex: index,
      length: round2(length),
      chord: p.chord,
      radius: p.radius,
      note: "distancia oficial = Length; Chord apenas referencia",
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
    seg.end_north = p.endNorth != null ? round2(p.endNorth) : null;
    seg.end_east = p.endEast != null ? round2(p.endEast) : null;
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

/**
 * Anel UTM: um vértice por segmento (início).
 * Curva é desenhada pela corda até o início do segmento seguinte; rótulo usa Length oficial.
 */
export function buildUtmRingFromOfficialSegments(
  segments: OfficialLotSegment[],
): [number, number][] {
  const ring: [number, number][] = segments.map(
    (s) => [s.east, s.north] as [number, number],
  );
  if (ring.length > 2) {
    const f = ring[0];
    const l = ring[ring.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) > 0.01) {
      ring.push([f[0], f[1]]);
    }
  }
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

export type Civil3dImportLotPayload = {
  name: string;
  area: number;
  perimeter: number;
  officialSegs: OfficialLotSegment[];
  segmentsJson: Record<string, unknown>[];
  coords: number[][];
};

export function civil3dLotToImportPayload(
  lot: ParsedCivil3dLot,
  proj4UtmSouth: string,
): Civil3dImportLotPayload {
  const officialSegs = civil3dParsedToOfficialSegments(lot.segments, lot.name);
  const segmentsJson = officialSegs.map((s) => officialSegmentToPersistJson(s));
  const utmRing = buildUtmRingFromOfficialSegments(officialSegs);
  const coords = utmRingToLngLat(utmRing, proj4UtmSouth);

  return {
    name: lot.name,
    area: lot.area,
    perimeter: lot.perimeter,
    officialSegs,
    segmentsJson,
    coords,
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
}
