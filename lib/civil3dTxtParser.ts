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
/** Distância máxima (km) — projeto urbano. */
export const QUADRA_IMPORT_MAX_KM_URBAN = 5;
/** Distância máxima (km) — chacreamento / rural. */
export const QUADRA_IMPORT_MAX_KM_RURAL = 30;
/** Limite padrão até estabilizar importações grandes (todos os projetos). */
export const QUADRA_IMPORT_MAX_KM_FROM_PROJECT = QUADRA_IMPORT_MAX_KM_RURAL;

/** Lotes/blocos a mais de X km do centro provisório são excluídos do cluster. */
const CLUSTER_OUTLIER_MAX_KM = 20;

export const QUADRA_OUT_OF_PROJECT_MESSAGE =
  "Quadra fora da área do projeto. Verifique a zona UTM ou o arquivo TXT.";

export function getQuadraImportMaxAllowedKm(
  _project?: Record<string, unknown> | null,
): number {
  return QUADRA_IMPORT_MAX_KM_FROM_PROJECT;
}

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

function escapeRegexLabel(label: string): string {
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lê campo numérico no bloco (início de linha ou inline — Civil 3D usa ambos). */
function readField(block: string, labels: string[]): number | null {
  for (const label of labels) {
    const escaped = escapeRegexLabel(label);
    const patterns = [
      new RegExp(
        `(?:^|\\n)\\s*${escaped}\\s*:\\s*([0-9+\\-.,]+)\\s*m?`,
        "im",
      ),
      new RegExp(`${escaped}\\s*:\\s*([0-9+\\-.,]+)\\s*m?`, "i"),
    ];
    for (const re of patterns) {
      const m = block.match(re);
      if (m) {
        const v = parseBrNumber(m[1]);
        if (v != null) return v;
      }
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
  const pairs: Array<{ north: number; east: number }> = [];
  const seen = new Set<string>();

  const pushPair = (north: number | null, east: number | null) => {
    if (north == null || east == null) return;
    const key = `${round2(north)}|${round2(east)}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ north, east });
  };

  const inlineRe =
    /(?:^|\n)\s*(?<!End\s)(?<!RP\s)(?:Northing|North|Norte)\s*:\s*([0-9+\-.,]+)\s*m?\s+(?<!End\s)(?<!RP\s)(?:Easting|East|Este)\s*:\s*([0-9+\-.,]+)\s*m?/gim;
  for (const m of block.matchAll(inlineRe)) {
    pushPair(parseBrNumber(m[1]), parseBrNumber(m[2]));
  }

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
  const n = Math.min(northMatches.length, eastMatches.length);
  for (let i = 0; i < n; i++) {
    pushPair(
      parseBrNumber(northMatches[i][1]),
      parseBrNumber(eastMatches[i][1]),
    );
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
    /Segment\s*#\s*\d+\s*:\s*Curve\b/i.test(block) ||
    /(?:^|\n)\s*:\s*Curve\b/i.test(block) ||
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

/**
 * Ponto inicial do lote (trecho antes do Segment #1).
 * Aceita North/East ou, no Civil 3D Q04, End North/End East no cabeçalho.
 */
function parseLotHeaderStart(
  chunk: string,
  lotLabel: string,
): { north: number; east: number; source: string } | null {
  const header = chunk.split(/Segment\s*#\s*1\b/i)[0] ?? chunk;

  const headerPairs = readAllCoordPairs(header);
  if (headerPairs.length > 0) {
    return {
      north: headerPairs[0].north,
      east: headerPairs[0].east,
      source: "header_north_east_before_segment_1",
    };
  }

  const north = readLotHeaderCoord(header, "north");
  const east = readLotHeaderCoord(header, "east");
  if (north != null && east != null) {
    return { north, east, source: "header_north_east_before_segment_1" };
  }

  const endNorth = readField(header, [
    "End North",
    "End Northing",
    "Ending Northing",
    "Northing End",
  ]);
  const endEast = readField(header, [
    "End East",
    "End Easting",
    "Ending Easting",
    "Easting End",
  ]);
  if (endNorth != null && endEast != null) {
    return {
      north: endNorth,
      east: endEast,
      source: "header_end_north_east_before_segment_1",
    };
  }

  return null;
}

function pickLastNonRpCoordPair(
  pairs: Array<{ north: number; east: number }>,
  rpNorth: number | null,
  rpEast: number | null,
): { north: number; east: number } | null {
  for (let i = pairs.length - 1; i >= 0; i--) {
    const p = pairs[i];
    if (isNearPoint(p.north, p.east, rpNorth, rpEast)) continue;
    return p;
  }
  return null;
}

function logLotDebugChain30_31(
  lotLabel: string,
  segments: ParsedCivil3dSegment[],
  lotStart: { north: number; east: number; source: string } | null,
): void {
  const key = String(lotLabel).trim();
  if (key !== "30" && key !== "31") return;
  const logKey = key === "30" ? "LOT_DEBUG_CHAIN_30" : "LOT_DEBUG_CHAIN_31";
  const closureErr = computeChainClosureErrorM(segments);
  console.log(logKey, {
    closureErrorM: round2(closureErr),
    maxAllowedM: CLOSURE_MAX_M,
    lotStart: lotStart
      ? {
          north: round2(lotStart.north),
          east: round2(lotStart.east),
          source: lotStart.source,
        }
      : null,
    chain: segments.map((s) => ({
      seg: s.segmentNumber,
      type: s.type,
      start: { n: round2(s.north), e: round2(s.east) },
      end:
        s.endNorth != null
          ? { n: round2(s.endNorth), e: round2(s.endEast) }
          : null,
      length: s.length,
    })),
  });
}

/**
 * Lotes com Curve (ex. 30, 31): garante fechamento no ponto inicial do memorial.
 * Não aplica a lotes só com Line (ex. 32).
 */
function reconcileCurveLotClosure(
  segments: ParsedCivil3dSegment[],
  lotStart: { north: number; east: number; source: string } | null,
  lotLabel: string,
): ParsedCivil3dSegment[] {
  if (!lotStart || !segments.some((s) => s.type === "CURVE")) {
    return segments;
  }

  logLotDebugChain30_31(lotLabel, segments, lotStart);

  let closureErr = computeChainClosureErrorM(segments);
  if (closureErr <= CLOSURE_MAX_M) {
    return segments;
  }

  const last = segments[segments.length - 1];
  if (last.endNorth == null || last.endEast == null) {
    return segments;
  }

  const distToStart = Math.hypot(
    last.endEast - lotStart.east,
    last.endNorth - lotStart.north,
  );

  if (distToStart > CLOSURE_MAX_M) {
    console.log("TXT_CHAIN_CLOSURE_ERROR", {
      lote: lotLabel,
      action: "snap_last_end_to_lot_start",
      closureBeforeM: round2(closureErr),
      lastEnd: { north: round2(last.endNorth), east: round2(last.endEast) },
      lotStart: { north: round2(lotStart.north), east: round2(lotStart.east) },
      note: "curve_lot_only",
    });
    last.endNorth = lotStart.north;
    last.endEast = lotStart.east;
    closureErr = computeChainClosureErrorM(segments);
    console.log("TXT_CHAIN_CLOSURE_ERROR", {
      lote: lotLabel,
      closureAfterSnapM: round2(closureErr),
      maxAllowedM: CLOSURE_MAX_M,
      ok: closureErr <= CLOSURE_MAX_M,
    });
  }

  return segments;
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
  lotStart: { north: number; east: number; source: string } | null,
  lotLabel: string,
): ParsedCivil3dSegment[] {
  const out = segments.map((s) => ({ ...s }));

  if (lotStart) {
    console.log("TXT_LOT_START_POINT", {
      lote: lotLabel,
      north: lotStart.north,
      east: lotStart.east,
      source: lotStart.source,
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
      const fallback = pickLastNonRpCoordPair(coordPairs, rpNorth, rpEast);
      if (fallback) {
        endN = fallback.north;
        endE = fallback.east;
      }
    }
  } else if (endN == null || endE == null) {
    const lineEnd = pickLastNonRpCoordPair(coordPairs, rpNorth, rpEast);
    if (lineEnd) {
      endN = lineEnd.north;
      endE = lineEnd.east;
    }
  }

  if (endN == null || endE == null) return null;

  const length = readField(block, [
    "Length",
    "Comprimento",
    "Curve Length",
    "Arc Length",
    "Comprimento da Curva",
  ]);
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
  const lotStart = parseLotHeaderStart(chunk, name);
  let segments = parseSegmentBlocks(chunk, name);
  segments = chainSegmentEndpoints(segments, lotStart, name);
  segments = reconcileCurveLotClosure(segments, lotStart, name);

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
    console.log("GEOMETRY_SAVED_FALSE", {
      lote: lotLabel ?? "?",
      reason: "segment_missing_official_length",
      segmentIndex: index,
      type: p.type,
      length: p.length,
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
 * Anel UTM por corda: início do lote + fim de cada segmento (Line/Curve End N/E).
 * RP nunca entra no anel.
 */
export function buildUtmRingFromOfficialSegments(
  segments: OfficialLotSegment[],
  lotLabel?: unknown,
): [number, number][] {
  const ordered = hydrateSegmentEndsFromChain(segments);
  const ring: [number, number][] = [];

  const pushVertex = (east: number, north: number) => {
    if (!Number.isFinite(east) || !Number.isFinite(north)) return;
    const prev = ring[ring.length - 1];
    if (prev && Math.hypot(prev[0] - east, prev[1] - north) < 0.001) return;
    ring.push([east, north]);
  };

  if (ordered.length < 1) return ring;

  const first = ordered[0];
  pushVertex(first.east, first.north);

  for (const seg of ordered) {
    if (seg.end_east == null || seg.end_north == null) continue;
    if (seg.segment_type === "CURVE") {
      console.log("ARC_DRAW_AS_CHORD", {
        lote: lotLabel ?? "?",
        segmentIndex: seg.segment_index,
        start: { east: seg.east, north: seg.north },
        end: { east: seg.end_east, north: seg.end_north },
        lengthOfficial: seg.distance,
      });
    }
    pushVertex(seg.end_east, seg.end_north);
  }

  if (ring.length >= 3) {
    const f = ring[0];
    const l = ring[ring.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) > 0.01) {
      ring.push([f[0], f[1]]);
    }
  }

  console.log("LOT_RING_POINTS_BUILT", {
    lote: lotLabel ?? "?",
    vertexCount: ring.length,
    closureErrorM: round2(computeOfficialChainClosureErrorM(ordered)),
    points: ring.map(([e, n]) => ({ east: round2(e), north: round2(n) })),
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

export function computeUtmCentroidFromRings(
  rings: [number, number][][],
): { east: number; north: number } | null {
  let sumE = 0;
  let sumN = 0;
  let n = 0;
  for (const ring of rings) {
    for (const [e, north] of ring) {
      if (Number.isFinite(e) && Number.isFinite(north)) {
        sumE += e;
        sumN += north;
        n++;
      }
    }
  }
  if (n < 1) return null;
  return { east: sumE / n, north: sumN / n };
}

/** Centroide UTM do lote (anel por corda) — usado na validação da quadra antes de salvar. */
export function computeImportLotUtmCentroid(
  lot: ParsedCivil3dLot,
): { east: number; north: number } | null {
  const officialSegs = civil3dParsedToOfficialSegments(lot.segments, lot.name);
  if (officialSegs.length < 2) return null;
  if (computeOfficialChainClosureErrorM(officialSegs) > CLOSURE_MAX_M) return null;
  const ring = buildUtmRingFromOfficialSegments(officialSegs, lot.name);
  if (ring.length < 3) return null;
  return computeUtmCentroidFromRings([ring]);
}

export type ProjectBlockUtmInput = {
  geometry?: { coordinates?: number[][][] } | null;
  coordinates_utm_json?: number[][] | null;
  block_name?: string | null;
  name?: string | null;
};

/** Um centroide UTM por lote (ignora blocos sem geometria válida). */
export function computeBlockUtmCentroid(
  block: ProjectBlockUtmInput,
  proj4UtmSouth: string,
): { east: number; north: number } | null {
  const utmJson = block.coordinates_utm_json;
  if (Array.isArray(utmJson) && utmJson.length > 0) {
    let sumE = 0;
    let sumN = 0;
    let n = 0;
    for (const pt of utmJson) {
      if (pt?.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
        sumE += Number(pt[0]);
        sumN += Number(pt[1]);
        n++;
      }
    }
    if (n > 0) return { east: sumE / n, north: sumN / n };
  }

  const ring = block.geometry?.coordinates?.[0];
  if (!ring?.length || ring.length < 3) return null;

  let sumE = 0;
  let sumN = 0;
  let n = 0;
  for (const c of ring) {
    if (c?.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      const [e, north] = proj4("EPSG:4326", proj4UtmSouth, [lng, lat]);
      sumE += e;
      sumN += north;
      n++;
    }
  }
  if (n < 1) return null;
  return { east: sumE / n, north: sumN / n };
}

export type ProjectCentroidClusterResult = {
  center: { east: number; north: number } | null;
  totalBlocks: number;
  blocksWithGeometry: number;
  clusterBlocks: number;
  excludedOutlierBlocks: number;
};

/**
 * Centroide do projeto pelo cluster principal em UTM (exclui outliers e lotes sem geometry).
 */
export function computeProjectUtmClusterCenterFromBlocks(
  blocks: ProjectBlockUtmInput[] | null | undefined,
  proj4UtmSouth: string,
  options?: { excludeBlockName?: string | null },
): ProjectCentroidClusterResult {
  const exclude = (options?.excludeBlockName ?? "").trim().toUpperCase();
  const centroids: Array<{ east: number; north: number; blockName: string }> = [];

  for (const b of blocks ?? []) {
    const bn = String(b.block_name ?? b.name ?? "")
      .trim()
      .toUpperCase();
    if (exclude && bn === exclude) continue;

    const c = computeBlockUtmCentroid(b, proj4UtmSouth);
    if (c) centroids.push({ ...c, blockName: bn || "?" });
  }

  const totalBlocks = blocks?.length ?? 0;
  const blocksWithGeometry = centroids.length;

  if (blocksWithGeometry < 1) {
    console.log("PROJECT_CENTROID_CLUSTER", {
      totalBlocks,
      blocksWithGeometry: 0,
      clusterBlocks: 0,
      excludedOutlierBlocks: 0,
      center: null,
    });
    return {
      center: null,
      totalBlocks,
      blocksWithGeometry: 0,
      clusterBlocks: 0,
      excludedOutlierBlocks: 0,
    };
  }

  let sumE = 0;
  let sumN = 0;
  for (const c of centroids) {
    sumE += c.east;
    sumN += c.north;
  }
  let centerE = sumE / centroids.length;
  let centerN = sumN / centroids.length;

  const outlierMaxM = CLUSTER_OUTLIER_MAX_KM * 1000;
  const inliers =
    centroids.length >= 3
      ? centroids.filter((c) => {
          const d = Math.hypot(c.east - centerE, c.north - centerN);
          return d <= outlierMaxM;
        })
      : centroids;

  const clusterList = inliers.length > 0 ? inliers : centroids;
  sumE = 0;
  sumN = 0;
  for (const c of clusterList) {
    sumE += c.east;
    sumN += c.north;
  }
  centerE = sumE / clusterList.length;
  centerN = sumN / clusterList.length;

  const excludedOutlierBlocks = centroids.length - clusterList.length;

  console.log("PROJECT_CENTROID_CLUSTER", {
    totalBlocks,
    blocksWithGeometry,
    clusterBlocks: clusterList.length,
    excludedOutlierBlocks,
    excludeBlockName: exclude || null,
    center: { east: round2(centerE), north: round2(centerN) },
    outlierMaxKm: CLUSTER_OUTLIER_MAX_KM,
  });

  return {
    center: { east: centerE, north: centerN },
    totalBlocks,
    blocksWithGeometry,
    clusterBlocks: clusterList.length,
    excludedOutlierBlocks,
  };
}

/** @deprecated Prefer computeProjectUtmClusterCenterFromBlocks */
export function computeProjectUtmCenterFromBlocks(
  blocks: ProjectBlockUtmInput[] | null | undefined,
  proj4UtmSouth: string,
): { east: number; north: number } | null {
  return computeProjectUtmClusterCenterFromBlocks(blocks, proj4UtmSouth).center;
}

export function computeQuadraUtmCentroidFromParsedLots(
  parsedLots: ParsedCivil3dLot[],
): { east: number; north: number } | null {
  const centers = parsedLots
    .map((l) => computeImportLotUtmCentroid(l))
    .filter((c): c is { east: number; north: number } => c != null);
  if (centers.length < 1) return null;
  let sumE = 0;
  let sumN = 0;
  for (const c of centers) {
    sumE += c.east;
    sumN += c.north;
  }
  return { east: sumE / centers.length, north: sumN / centers.length };
}

export type QuadraLocationValidation = {
  ok: boolean;
  blocked: boolean;
  distanceKm: number | null;
  quadraCenterUtm: { east: number; north: number } | null;
  projectCenterUtm: { east: number; north: number } | null;
  quadraCenter: { lat: number; lng: number } | null;
  projectCenter: { lat: number; lng: number } | null;
  skipped: boolean;
  maxAllowedKm: number;
  utmZone: string | null;
  clusterMeta?: ProjectCentroidClusterResult;
};

/** Mensagem detalhada quando a quadra é bloqueada por distância. */
export function formatQuadraImportLocationBlockedMessage(
  v: QuadraLocationValidation,
): string {
  const lines = [
    QUADRA_OUT_OF_PROJECT_MESSAGE,
    "",
    `Distância calculada: ${v.distanceKm != null ? round2(v.distanceKm) : "?"} km (limite: ${v.maxAllowedKm} km)`,
    `Zona UTM usada no import: ${v.utmZone ?? "—"}`,
  ];
  if (v.projectCenterUtm) {
    lines.push(
      `Centroide do projeto (UTM): East ${round2(v.projectCenterUtm.east)}, North ${round2(v.projectCenterUtm.north)}`,
    );
  }
  if (v.quadraCenterUtm) {
    lines.push(
      `Centroide da quadra (UTM): East ${round2(v.quadraCenterUtm.east)}, North ${round2(v.quadraCenterUtm.north)}`,
    );
  }
  if (v.clusterMeta) {
    lines.push(
      `Cluster do projeto: ${v.clusterMeta.clusterBlocks} lote(s) com geometria (${v.clusterMeta.excludedOutlierBlocks} outlier(s) ignorado(s))`,
    );
  }
  return lines.join("\n");
}

/** Compara centroide da quadra importada com o cluster principal do projeto (UTM). */
export function validateQuadraImportAgainstProject(
  lots: Array<{ coords: number[][]; geometrySaved: boolean }>,
  projectCenter: { lat: number; lng: number } | null,
  quadraLabel: string,
  parsedLots?: ParsedCivil3dLot[],
  proj4UtmSouth?: string,
  projectCenterUtm?: { east: number; north: number } | null,
  options?: {
    utmZone?: string | null;
    maxAllowedKm?: number;
    clusterMeta?: ProjectCentroidClusterResult;
  },
): QuadraLocationValidation {
  const maxAllowedKm =
    options?.maxAllowedKm ?? getQuadraImportMaxAllowedKm();
  const maxAllowedM = maxAllowedKm * 1000;
  const utmZone = options?.utmZone ?? null;

  const quadraCenterUtm =
    parsedLots?.length && proj4UtmSouth
      ? computeQuadraUtmCentroidFromParsedLots(parsedLots)
      : null;

  if (projectCenterUtm && quadraCenterUtm) {
    const distanceM = Math.hypot(
      quadraCenterUtm.east - projectCenterUtm.east,
      quadraCenterUtm.north - projectCenterUtm.north,
    );
    const distanceKm = distanceM / 1000;
    const ok = distanceM <= maxAllowedM;
    console.log("QUADRA_IMPORT_LOCATION_CHECK", {
      quadra: quadraLabel,
      mode: "utm_cluster",
      projectCenterUtm,
      quadraCenterUtm,
      distanceM: round2(distanceM),
      distanceKm: round2(distanceKm),
      maxAllowedKm,
      ok,
      clusterMeta: options?.clusterMeta,
    });
    if (!ok) {
      console.log("QUADRA_IMPORT_LOCATION_BLOCKED", {
        quadra: quadraLabel,
        distanceKm: round2(distanceKm),
        maxAllowedKm,
        utmZone,
      });
    }
    return {
      ok,
      blocked: !ok,
      distanceKm,
      quadraCenterUtm,
      projectCenterUtm,
      quadraCenter: null,
      projectCenter,
      skipped: false,
      maxAllowedKm,
      utmZone,
      clusterMeta: options?.clusterMeta,
    };
  }

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
      quadraCenterUtm: null,
      projectCenterUtm: null,
      quadraCenter,
      projectCenter: null,
      skipped: true,
      maxAllowedKm,
      utmZone,
      clusterMeta: options?.clusterMeta,
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
      quadraCenterUtm: null,
      projectCenterUtm: null,
      quadraCenter: null,
      projectCenter,
      skipped: true,
      maxAllowedKm,
      utmZone,
      clusterMeta: options?.clusterMeta,
    };
  }

  const distanceKm = haversineKm(
    projectCenter.lat,
    projectCenter.lng,
    quadraCenter.lat,
    quadraCenter.lng,
  );
  const ok = distanceKm <= maxAllowedKm;

  console.log("QUADRA_IMPORT_LOCATION_CHECK", {
    quadra: quadraLabel,
    mode: "latlng_fallback",
    projectCenter,
    quadraCenter,
    distanceKm: round2(distanceKm),
    maxAllowedKm,
    ok,
  });

  if (!ok) {
    console.log("QUADRA_IMPORT_LOCATION_BLOCKED", {
      quadra: quadraLabel,
      distanceKm: round2(distanceKm),
      maxAllowedKm,
      utmZone,
    });
  }

  return {
    ok,
    blocked: !ok,
    distanceKm,
    quadraCenterUtm: null,
    projectCenterUtm: null,
    quadraCenter,
    projectCenter,
    skipped: false,
    maxAllowedKm,
    utmZone,
    clusterMeta: options?.clusterMeta,
  };
}

export function validateLngLatNearProjectCenter(
  lngLat: number[][],
  projectCenter: { lat: number; lng: number } | null,
  lotLabel?: unknown,
): boolean {
  if (!projectCenter || lngLat.length < 3) return true;
  const lotCenter = computeLngLatCentroidFromRings([lngLat]);
  if (!lotCenter) return true;
  const distKm = haversineKm(
    projectCenter.lat,
    projectCenter.lng,
    lotCenter.lat,
    lotCenter.lng,
  );
  if (distKm > PROJECT_LOCATION_MAX_KM) {
    console.log("INVALID_PROJECT_LOCATION_AFTER_TXT_PARSE", {
      lote: lotLabel ?? "?",
      projectCenter,
      lotCenter,
      distanceKm: round2(distKm),
      maxAllowedKm: PROJECT_LOCATION_MAX_KM,
      sample: lngLat[0],
    });
    return false;
  }
  return true;
}

function logClosureRejection(
  lotLabel: string,
  segments: OfficialLotSegment[],
  closureErrorM: number,
  extra?: Record<string, unknown>,
): void {
  const ordered = hydrateSegmentEndsFromChain(segments);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  console.log("TXT_CHAIN_CLOSURE_ERROR", {
    lote: lotLabel,
    closureErrorM: round2(closureErrorM),
    maxAllowedM: CLOSURE_MAX_M,
    rejected: true,
    segmentCount: ordered.length,
    firstPoint: first
      ? { north: first.north, east: first.east }
      : null,
    lastEnd:
      last?.end_north != null
        ? { north: last.end_north, east: last.end_east }
        : null,
    chain: ordered.map((s) => ({
      idx: s.segment_index,
      type: s.segment_type,
      start: { n: s.north, e: s.east },
      end: { n: s.end_north, e: s.end_east },
      length: s.distance,
    })),
    ...extra,
  });
}

export function buildValidatedLotRing(
  segments: OfficialLotSegment[],
  proj4UtmSouth: string,
  lotLabel: string,
  projectCenter?: { lat: number; lng: number } | null,
): LotRingBuildResult | null {
  const closureErrorM = computeOfficialChainClosureErrorM(segments);
  if (closureErrorM > CLOSURE_MAX_M) {
    logClosureRejection(lotLabel, segments, closureErrorM);
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
    if (!geometrySaved) {
      console.log("GEOMETRY_SAVED_FALSE", {
        lote: lot.name,
        reason: "ring_too_few_vertices",
        vertexCount: coords.length,
      });
    }
  } else {
    const closureErrorM = computeOfficialChainClosureErrorM(officialSegs);
    const reason =
      closureErrorM > CLOSURE_MAX_M
        ? "closure"
        : built && !built.locationOk
          ? "location"
          : "ring_build_failed";
    if (reason === "closure") {
      logClosureRejection(lot.name, officialSegs, closureErrorM, {
        note: "geometry_not_saved",
      });
    } else {
      console.log("GEOMETRY_SAVED_FALSE", {
        lote: lot.name,
        reason,
        closureErrorM: round2(closureErrorM),
        segmentCount: officialSegs.length,
        locationOk: built?.locationOk ?? false,
      });
    }
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
