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
const round2 = (n: number) => Math.round(n * 100) / 100;

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
): OfficialLotSegment[] {
  const raw = block.segments_json;
  if (!Array.isArray(raw) || raw.length < 2) return [];

  const parsed: OfficialLotSegment[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item == null || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const north = Number(s.north ?? s.northing ?? s.Northing ?? s.y);
    const east = Number(s.east ?? s.easting ?? s.Easting ?? s.x);
    const distance = Number(
      s.distance ?? s.length ?? s.Length ?? s.comprimento ?? s.medida,
    );
    if (!Number.isFinite(north) || !Number.isFinite(east)) continue;
    if (!Number.isFinite(distance) || distance <= 0) continue;

    parsed.push({
      segment_index:
        typeof s.segment_index === "number" ? s.segment_index : i,
      distance: round2(distance),
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
  return parsed;
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

/** Caminho de arestas consecutivas no anel (sentido horário ou anti-horário). */
export function classifySidesByTxtRingPaths(
  segments: OfficialLotSegment[],
  frontSegmentIndex: number,
  backSegmentIndex: number,
): {
  frente: number;
  fundo: number;
  ladoDireito: number;
  ladoEsquerdo: number;
  pathA: RingPathResult;
  pathB: RingPathResult;
} {
  const n = segments.length;
  const byIdx = new Map(segments.map((s) => [s.segment_index, s]));
  const front = byIdx.get(frontSegmentIndex);
  const back = byIdx.get(backSegmentIndex);

  const emptyPaths: RingPathResult = { indexes: [], totalLength: 0 };
  if (!front || !back || n < 3) {
    return {
      frente: front?.distance ?? 0,
      fundo: back?.distance ?? 0,
      ladoDireito: 0,
      ladoEsquerdo: 0,
      pathA: emptyPaths,
      pathB: emptyPaths,
    };
  }

  /** Segmentos após startIdx até antes de endIdx (sentido horário, sem incluir extremos). */
  const collectPathClockwise = (
    startIdx: number,
    endIdx: number,
  ): RingPathResult => {
    const indexes: number[] = [];
    let i = startIdx;
    for (let guard = 0; guard < n; guard++) {
      i = (i + 1) % n;
      if (i === endIdx) break;
      indexes.push(i);
    }
    const totalLength = round2(
      indexes.reduce((sum, idx) => sum + (byIdx.get(idx)?.distance ?? 0), 0),
    );
    return { indexes, totalLength };
  };

  // pathA: depois da frente até antes do fundo | pathB: depois do fundo até antes da frente
  const pathA = collectPathClockwise(frontSegmentIndex, backSegmentIndex);
  const pathB = collectPathClockwise(backSegmentIndex, frontSegmentIndex);

  return {
    frente: front.distance,
    fundo: back.distance,
    ladoDireito: pathA.totalLength,
    ladoEsquerdo: pathB.totalLength,
    pathA,
    pathB,
  };
}

export function findBackSegmentIndex(
  segments: OfficialLotSegment[],
  frontSegmentIndex: number,
): number {
  const n = segments.length;
  if (n < 3) return (frontSegmentIndex + 1) % Math.max(n, 1);

  // Ordem TXT Civil 3D: frente → lateral → fundo → demais laterais
  if (n >= 4) {
    return (frontSegmentIndex + 2) % n;
  }

  const front = segments.find((s) => s.segment_index === frontSegmentIndex);
  const frontLen = front?.distance ?? 0;
  let bestIdx = (frontSegmentIndex + Math.floor(n / 2)) % n;
  let bestScore = Infinity;

  for (const seg of segments) {
    if (seg.segment_index === frontSegmentIndex) continue;
    const lenDiff = Math.abs(seg.distance - frontLen);
    const idxDiff = Math.abs(
      ((seg.segment_index - frontSegmentIndex + n) % n) - n / 2,
    );
    const score = lenDiff + idxDiff * 0.01;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = seg.segment_index;
    }
  }
  return bestIdx;
}

export function resolveFrontSegmentIndex(
  block: Record<string, unknown>,
  segments: OfficialLotSegment[],
): number | null {
  const stored = block.front_segment_index;
  if (typeof stored === "number" && Number.isFinite(stored) && stored >= 0) {
    return stored;
  }

  const frenteHint = Number(block.frente);
  if (Number.isFinite(frenteHint) && frenteHint > 0 && segments.length > 0) {
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

function computeChanfreFromTxtPaths(
  segments: OfficialLotSegment[],
  frontIdx: number,
  backIdx: number,
  pathA: RingPathResult,
  pathB: RingPathResult,
): ChanfreInfo | null {
  const used = new Set([
    frontIdx,
    backIdx,
    ...pathA.indexes,
    ...pathB.indexes,
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
    return Number.isFinite(n) && n > 0 ? round2(n) : null;
  };
  return {
    frente: parse(block.frente),
    fundo: parse(block.Fundo ?? block.fundo),
    ladoDireito: parse(block["Lado Dir."] ?? block.lado_direito),
    ladoEsquerdo: parse(block["Lado Esq."] ?? block.lado_esquerdo),
    chanfre: null,
    area: parse(block.area),
    perimeter: parse(block.perimeter),
    frontSegmentIndex: null,
    segmentCount: 0,
    source: "columns_fallback",
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
  const segments = parseOfficialSegmentsFromBlock(block);

  console.log("LOT_SEGMENTS", label, segments);

  if (segments.length < 3) {
    const fallback = parseColumnFallback(block);
    console.log("LOT_OFFICIAL_MEASURES", label, fallback);
    return fallback;
  }

  const frontIdx = resolveFrontSegmentIndex(block, segments);
  if (frontIdx == null) {
    const fallback = parseColumnFallback(block);
    console.log("LOT_OFFICIAL_MEASURES", label, fallback);
    return fallback;
  }

  console.log("LOT_FRONT_SEGMENT", label, frontIdx);

  const backIdx = findBackSegmentIndex(segments, frontIdx);
  console.log("LOT_BACK_SIDE", label, { backSegmentIndex: backIdx });

  const paths = classifySidesByTxtRingPaths(segments, frontIdx, backIdx);
  console.log("LOT_RIGHT_SIDE", label, paths.pathA);
  console.log("LOT_LEFT_SIDE", label, paths.pathB);

  const lotNumKey = String(label).replace(/\D/g, "");
  if (lotNumKey === "7") {
    console.log("MEASURE_RING_PATHS lote 7:", {
      frontIndex: frontIdx,
      backIndex: backIdx,
      pathA: { indexes: paths.pathA.indexes, total: paths.pathA.totalLength },
      pathB: { indexes: paths.pathB.indexes, total: paths.pathB.totalLength },
    });
  }

  const perimeter = round2(
    segments.reduce((sum, s) => sum + s.distance, 0),
  );
  const areaRaw = Number(block.area);
  const area =
    Number.isFinite(areaRaw) && areaRaw > 0 ? round2(areaRaw) : null;

  const chanfre = computeChanfreFromTxtPaths(
    segments,
    frontIdx,
    backIdx,
    paths.pathA,
    paths.pathB,
  );

  const result: OfficialLotMeasures = {
    frente: paths.frente,
    fundo: paths.fundo,
    ladoDireito: paths.ladoDireito,
    ladoEsquerdo: paths.ladoEsquerdo,
    chanfre,
    area,
    perimeter,
    frontSegmentIndex: frontIdx,
    segmentCount: segments.length,
    source: "txt_segments",
  };

  console.log("LOT_OFFICIAL_MEASURES", label, result);
  return result;
}

/** Associa aresta TXT à frente identificada pela geometria/logradouro (comprimento em m). */
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
