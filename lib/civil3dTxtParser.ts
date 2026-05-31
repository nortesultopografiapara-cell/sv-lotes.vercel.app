/**
 * Parser TXT Civil 3D — suporte a Segment Line e Curve.
 * Medida oficial da curva: Length (nunca Chord).
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

function readAllCoordPairs(
  block: string,
): Array<{ north: number; east: number }> {
  const northMatches = [
    ...block.matchAll(
      /(?:^|\n)\s*(?:Northing|North|Norte)\s*:\s*([0-9+\-.,]+)\s*m?/gim,
    ),
  ];
  const eastMatches = [
    ...block.matchAll(
      /(?:^|\n)\s*(?:Easting|East|Este)\s*:\s*([0-9+\-.,]+)\s*m?/gim,
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

/** Ponto inicial do lote (antes do Segment #1). */
function parseLotHeaderStart(
  chunk: string,
): { north: number; east: number } | null {
  const header = chunk.split(/Segment\s*#\s*1\b/i)[0] ?? chunk;
  const north = readField(header, ["North", "Northing", "Norte"]);
  const east = readField(header, ["East", "Easting", "Este"]);
  if (north != null && east != null) return { north, east };
  return null;
}

function chainSegmentEndpoints(
  segments: ParsedCivil3dSegment[],
  lotStart: { north: number; east: number } | null,
  lotLabel: string,
): ParsedCivil3dSegment[] {
  const out = segments.map((s) => ({ ...s }));
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    if (i === 0) {
      if (lotStart) {
        cur.north = lotStart.north;
        cur.east = lotStart.east;
      }
    } else {
      const prev = out[i - 1];
      if (prev.endNorth != null && prev.endEast != null) {
        cur.north = prev.endNorth;
        cur.east = prev.endEast;
      }
    }
    if (cur.endNorth == null || cur.endEast == null) {
      console.warn("LOT_RING_SEGMENT_MISSING_END", {
        lote: lotLabel,
        segmentNumber: cur.segmentNumber,
        type: cur.type,
      });
    }
  }
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
        note: "RP é centro do raio, não vértice do lote",
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
    console.log("ARC_DRAW_AS_CHORD", {
      lote: lotLabel,
      segmentNumber,
      from: "start encadeado",
      to: { endNorth: endN, endEast: endE },
      chord,
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

/** Reencadeia inícios a partir dos finais gravados (corrige import antigo). */
export function reconcileOfficialSegmentChain(
  segments: OfficialLotSegment[],
): OfficialLotSegment[] {
  const ordered = [...segments].sort(
    (a, b) => a.segment_index - b.segment_index,
  );
  if (ordered.length < 2) return ordered;

  const last = ordered[ordered.length - 1];
  if (last.end_north != null && last.end_east != null) {
    ordered[0].north = last.end_north;
    ordered[0].east = last.end_east;
  }

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (prev.end_north != null && prev.end_east != null) {
      cur.north = prev.end_north;
      cur.east = prev.end_east;
    }
  }

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

/**
 * Anel UTM: vértice = início de cada segmento (encadeado pelo fim do anterior).
 * Curva: aresta reta (corda) até o início do próximo; medida oficial = Length.
 */
export function buildUtmRingFromOfficialSegments(
  segments: OfficialLotSegment[],
  lotLabel?: unknown,
): [number, number][] {
  const chained = reconcileOfficialSegmentChain(segments);
  const ring: [number, number][] = [];

  for (const seg of chained) {
    if (!Number.isFinite(seg.east) || !Number.isFinite(seg.north)) continue;
    const last = ring[ring.length - 1];
    if (
      last &&
      Math.hypot(last[0] - seg.east, last[1] - seg.north) < 0.01
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
        chord: seg.chord,
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
    segmentCount: chained.length,
    vertexCount: ring.length,
    points: ring.map(([e, n], i) => ({
      i,
      east: round2(e),
      north: round2(n),
      type: chained[i]?.segment_type ?? "LINE",
    })),
  });

  return ring;
}

function resolveUtmProj4(
  segments: OfficialLotSegment[],
  project?: Record<string, unknown> | null,
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
  const east = segments[0]?.east;
  if (east != null && east >= 600_000 && east < 700_000) {
    return "+proj=utm +zone=23 +south +datum=WGS84 +units=m +no_defs";
  }
  if (east != null && east >= 500_000 && east < 600_000) {
    return "+proj=utm +zone=22 +south +datum=WGS84 +units=m +no_defs";
  }
  return null;
}

/** Reconstrói polígono lat/lng a partir de segments_json (mapa GIS). */
export function buildLngLatRingFromOfficialBlock(
  block: Record<string, unknown>,
  project?: Record<string, unknown> | null,
): number[][] | null {
  const segments = parseOfficialSegmentsFromBlock(block);
  if (segments.length < 3) return null;

  const utmRing = buildUtmRingFromOfficialSegments(
    segments,
    block.number ?? block.id,
  );
  const proj4String = resolveUtmProj4(segments, project);
  if (!proj4String) return null;

  return utmRingToLngLat(utmRing, proj4String);
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
  const utmRing = buildUtmRingFromOfficialSegments(officialSegs, lot.name);
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
