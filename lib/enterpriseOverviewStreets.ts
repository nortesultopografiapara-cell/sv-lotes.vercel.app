/**
 * Helpers puros — nomes, comprimentos e quadro de vias da Prancha Geral.
 * Sem jsPDF/Supabase: seguro para testes Node.
 */

import proj4 from 'proj4';
import { resolveUtmProj4FromProject } from '@/lib/civil3dTxtParser';
import { haversineDistanceM } from '@/lib/gis/distanceMeasure';
import { planarDistanceM } from '@/lib/officialConfrontationRing';
import {
  diagnoseOfficialStreetName,
  resolveOfficialStreetLabel,
} from '@/lib/streetGuide';

export { resolveOfficialStreetLabel, diagnoseOfficialStreetName };

export const STREET_TYPE_SORT_ORDER: Record<string, number> = {
  Rodovia: 0,
  Avenida: 1,
  Alameda: 2,
  Rua: 3,
  Travessa: 4,
  Estrada: 5,
  Acesso: 6,
  Vicinal: 7,
  Outro: 8,
};

/** Azul institucional dos nomes de via na Prancha Geral (#0B3A66). */
export const STREET_LABEL_RGB: [number, number, number] = [11, 58, 102];

/** ~18% maior que a versão inicial (6.5 / 3.5). */
export const STREET_LABEL_FONT_MAX = 7.8;
export const STREET_LABEL_FONT_MIN = 4.2;
export const STREET_LABEL_MIN_SEGMENT_M = 25;
/** Distância mínima entre repetições da mesma via (metros locais). */
export const STREET_LABEL_REPEAT_GAP_M = 140;
/**
 * Deslocamento perpendicular mínimo — só para a linha não cortar as letras.
 * Texto permanece centrado no eixo (centerline); sem offset lateral.
 */
export const STREET_LABEL_OFFSET_MIN_MM = 0.25;
export const STREET_LABEL_OFFSET_MAX_MM = 0.55;

export type EnterpriseStreetIssue =
  | 'unnamed'
  | 'no_geometry'
  | 'invalid_geometry'
  | 'length_unavailable';

export type NormalizedStreetGeometry = {
  lines: Array<Array<[number, number]>>;
  alreadyMetric: boolean;
  sourceFormat: string;
};

export type EnterpriseStreetSegment = {
  lineIndex: number;
  line: [number, number][];
  lengthM: number;
};

export type EnterpriseStreetLabelPlacement = {
  point: [number, number];
  angleDeg: number;
  fontSize: number;
  text: string;
  segmentLengthM: number;
};

/** Placement final já em mm da folha — única coleção desenhável no PDF. */
export type StreetLabelSheetPlacement = {
  streetId: string;
  text: string;
  x: number;
  y: number;
  angleDeg: number;
  fontSize: number;
  repetitionIndex: number;
  side: 'upper' | 'lower';
};

export type StreetLabelBuildDiag = {
  streetId: string;
  streetName: string;
  requestedRepetitions: number;
  candidatesGenerated: number;
  acceptedPlacements: number;
  rejectedTooClose: number;
  rejectedLotCollision: number;
  rejectedHardCollision: number;
  rejectedOutOfBounds: number;
  rejectedCollision: number;
  sidesUsed: Array<'upper' | 'lower'>;
  usedFallback: boolean;
};

export type StreetLabelBatchDiag = {
  totalStreets: number;
  requestedLabels: number;
  candidatesGenerated: number;
  accepted: number;
  rejectedTooClose: number;
  rejectedLotCollision: number;
  rejectedHardCollision: number;
  rejectedOutOfBounds: number;
  streetsWithoutAnyLabel: number;
  perStreet: StreetLabelBuildDiag[];
};

export type EnterpriseStreetGrouped = {
  id: string;
  type: string;
  name: string;
  displayName: string;
  unnamed: boolean;
  segments: EnterpriseStreetSegment[];
  lengthM: number;
  lengthAvailable: boolean;
  issues: EnterpriseStreetIssue[];
};

export type EnterpriseStreetTableRow = {
  id: string;
  number: string;
  name: string;
  type: string;
  lengthLabel: string;
  lengthM: number | null;
  pending: boolean;
};

export type StreetTableLayoutMode = 'single' | 'two_columns' | 'extra_page';

export type StreetTablePlan = {
  mode: StreetTableLayoutMode;
  rows: EnterpriseStreetTableRow[];
  pendingRows: EnterpriseStreetTableRow[];
  totalLengthM: number;
  totalLengthLabel: string;
  streetCount: number;
  fontSize: number;
};

export type OccupiedBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type StreetGeometryDiag = {
  loaded: number;
  normalized: number;
  candidates: number;
  drawn: number;
  omittedByCollision: number;
  noGeometry: number;
  invalidGeometry: number;
};

export function computePolylineLengthM(line: [number, number][]): number {
  if (!line || line.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < line.length; i++) {
    sum += planarDistanceM(line[i - 1], line[i]);
  }
  return sum;
}

export function computePolylineLengthHaversineM(
  lineLngLat: [number, number][],
): number {
  if (!lineLngLat || lineLngLat.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < lineLngLat.length; i++) {
    sum += haversineDistanceM(
      { lng: lineLngLat[i - 1][0], lat: lineLngLat[i - 1][1] },
      { lng: lineLngLat[i][0], lat: lineLngLat[i][1] },
    );
  }
  return sum;
}

export function formatLengthMetersPtBr(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return 'Não calculado';
  const rounded = Math.round(meters * 100) / 100;
  return `${rounded.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m`;
}

export function isUnnamedStreetName(name?: string | null): boolean {
  const raw = String(name || '').trim();
  if (!raw) return true;
  if (/^rua\/eixo/i.test(raw)) return true;
  if (/sem nome/i.test(raw)) return true;
  if (/sem identifica/i.test(raw)) return true;
  return false;
}

function isFinitePair(c: unknown): c is [number, number] {
  if (!Array.isArray(c) || c.length < 2) return false;
  return Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]));
}

function asLngLatPair(c: unknown): [number, number] | null {
  if (!isFinitePair(c)) return null;
  return [Number(c[0]), Number(c[1])];
}

function looksLikeMetricPair(a: number, b: number): boolean {
  return Math.abs(a) > 180 || Math.abs(b) > 90;
}

function looksLikeLngLatPair(a: number, b: number): boolean {
  return Math.abs(a) <= 180 && Math.abs(b) <= 90;
}

export function extractAllPolylineParts(coords: unknown): number[][][] {
  if (!Array.isArray(coords) || coords.length < 1) return [];
  const first = coords[0];
  if (isFinitePair(first) && coords.length >= 2 && isFinitePair(coords[1])) {
    return [coords as number[][]];
  }
  const parts: number[][][] = [];
  for (const part of coords) {
    if (!Array.isArray(part) || part.length < 2) continue;
    if (isFinitePair(part[0]) && isFinitePair(part[1])) {
      parts.push(part as number[][]);
      continue;
    }
    parts.push(...extractAllPolylineParts(part));
  }
  return parts;
}

function parseMaybeJson(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Normaliza geometry_geojson / geometry de street_guides.
 * Aceita objeto, string JSON, Feature, FeatureCollection, LineString,
 * MultiLineString, array direto e envelopes com `.geometry`.
 */
export function normalizeStreetGeometry(
  input: unknown,
): NormalizedStreetGeometry | null {
  const parsed = parseMaybeJson(input);
  if (parsed == null) return null;

  if (Array.isArray(parsed) && parsed.length >= 2 && isFinitePair(parsed[0])) {
    const line = parsed
      .map(asLngLatPair)
      .filter((p): p is [number, number] => p != null);
    if (line.length < 2) return null;
    return {
      lines: [line],
      alreadyMetric: looksLikeMetricPair(line[0][0], line[0][1]),
      sourceFormat: 'coordinate_array',
    };
  }

  if (
    Array.isArray(parsed) &&
    parsed.length >= 1 &&
    Array.isArray(parsed[0]) &&
    !isFinitePair(parsed[0]) &&
    isFinitePair((parsed[0] as unknown[])[0])
  ) {
    const lines: Array<Array<[number, number]>> = [];
    for (const part of parsed) {
      if (!Array.isArray(part)) continue;
      const line = part
        .map(asLngLatPair)
        .filter((p): p is [number, number] => p != null);
      if (line.length >= 2) lines.push(line);
    }
    if (!lines.length) return null;
    return {
      lines,
      alreadyMetric: looksLikeMetricPair(lines[0][0][0], lines[0][0][1]),
      sourceFormat: 'multiline_array',
    };
  }

  if (typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.type === 'Feature' && obj.geometry) {
    const inner = normalizeStreetGeometry(obj.geometry);
    if (!inner) return null;
    return { ...inner, sourceFormat: `Feature>${inner.sourceFormat}` };
  }

  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    const lines: Array<Array<[number, number]>> = [];
    let alreadyMetric = false;
    let sourceFormat = 'FeatureCollection';
    for (const feat of obj.features) {
      const inner = normalizeStreetGeometry(feat);
      if (!inner) continue;
      lines.push(...inner.lines);
      alreadyMetric = alreadyMetric || inner.alreadyMetric;
      sourceFormat = `FeatureCollection>${inner.sourceFormat}`;
    }
    if (!lines.length) return null;
    return { lines, alreadyMetric, sourceFormat };
  }

  if (obj.geometry && typeof obj.geometry === 'object') {
    const inner = normalizeStreetGeometry(obj.geometry);
    if (inner) {
      return { ...inner, sourceFormat: `envelope>${inner.sourceFormat}` };
    }
  }

  const type = String(obj.type || '').trim();
  const coords = obj.coordinates;
  if (coords == null) return null;

  const parts = extractAllPolylineParts(coords);
  const lines = parts
    .map((part) =>
      part.map(asLngLatPair).filter((p): p is [number, number] => p != null),
    )
    .filter((line) => line.length >= 2);
  if (!lines.length) return null;
  const alreadyMetric = looksLikeMetricPair(lines[0][0][0], lines[0][0][1]);
  return {
    lines,
    alreadyMetric,
    sourceFormat: type || (parts.length > 1 ? 'MultiLineString' : 'LineString'),
  };
}

export function diagnoseStreetGeometryRaw(raw: unknown): {
  valueType: string;
  keys: string[];
  reason?: string;
} {
  const valueType = raw === null ? 'null' : typeof raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { valueType, keys: Object.keys(raw as object).slice(0, 12) };
  }
  if (typeof raw === 'string') {
    return { valueType: 'string', keys: [], reason: `string_len=${raw.length}` };
  }
  if (Array.isArray(raw)) {
    return { valueType: 'array', keys: [], reason: `array_len=${raw.length}` };
  }
  return { valueType, keys: [] };
}

/**
 * GeoJSON [lng, lat] → metros locais UTM − origem.
 * Infere zona UTM pelo longitude se o projeto não tiver utm_zone.
 */
export function streetCoordsToLocalMeters(
  line: [number, number][],
  project: Record<string, unknown> | null | undefined,
  originE: number,
  originN: number,
  alreadyMetricHint?: boolean,
): [number, number][] | null {
  if (!line || line.length < 2) return null;
  const a0 = Number(line[0][0]);
  const b0 = Number(line[0][1]);
  if (!Number.isFinite(a0) || !Number.isFinite(b0)) return null;

  const alreadyMetric =
    alreadyMetricHint === true || looksLikeMetricPair(a0, b0);

  if (alreadyMetric) {
    const out: [number, number][] = [];
    for (const c of line) {
      const x = Number(c[0]) - originE;
      const y = Number(c[1]) - originN;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      out.push([x, y]);
    }
    return out.length >= 2 ? out : null;
  }

  if (!looksLikeLngLatPair(a0, b0)) return null;

  // GeoJSON oficial: [lng, lat]. Inverte só se 2º valor claramente longitude.
  let sampleLng = a0;
  let sampleLat = b0;
  if (Math.abs(a0) <= 90 && Math.abs(b0) > 90) {
    sampleLat = a0;
    sampleLng = b0;
  }

  let projDef = resolveUtmProj4FromProject(project);
  if (!projDef) {
    const zone = Math.floor((sampleLng + 180) / 6) + 1;
    if (zone < 1 || zone > 60) return null;
    const south = sampleLat < 0;
    projDef = `+proj=utm +zone=${zone} +${south ? 'south' : 'north'} +datum=WGS84 +units=m +no_defs`;
  }

  try {
    const out: [number, number][] = [];
    for (const c of line) {
      let lng = Number(c[0]);
      let lat = Number(c[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      if (Math.abs(lng) <= 90 && Math.abs(lat) > 90) {
        const t = lng;
        lng = lat;
        lat = t;
      }
      const [e, n] = proj4('EPSG:4326', projDef, [lng, lat]) as [
        number,
        number,
      ];
      if (!Number.isFinite(e) || !Number.isFinite(n)) continue;
      out.push([e - originE, n - originN]);
    }
    return out.length >= 2 ? out : null;
  } catch {
    return null;
  }
}

export function buildLocalStreetLinesFromGuides(params: {
  guides: Array<Record<string, unknown>>;
  project: Record<string, unknown>;
  originE: number;
  originN: number;
  logInvalid?: boolean;
}): {
  localLinesByGuideId: Map<string, [number, number][][]>;
  haversineLengthByGuideId: Map<string, number>;
  normalizedCount: number;
  noGeometryCount: number;
  invalidGeometryCount: number;
} {
  const { guides, project, originE, originN, logInvalid = true } = params;
  const localLinesByGuideId = new Map<string, [number, number][][]>();
  const haversineLengthByGuideId = new Map<string, number>();
  let normalizedCount = 0;
  let noGeometryCount = 0;
  let invalidGeometryCount = 0;

  for (const guide of guides) {
    const id = String(guide.id || '').trim();
    if (!id) continue;
    const raw = guide.geometry_geojson ?? guide.geometry ?? null;
    const normalized = normalizeStreetGeometry(raw);
    if (!normalized || !normalized.lines.length) {
      noGeometryCount += 1;
      if (logInvalid) {
        console.warn('[enterprise-overview-streets] invalid geometry', {
          streetId: id.slice(0, 8),
          name: String(guide.name || '').slice(0, 40),
          ...diagnoseStreetGeometryRaw(raw),
          reason: 'normalize_failed',
        });
      }
      continue;
    }

    const localParts: [number, number][][] = [];
    let haverSum = 0;
    for (const line of normalized.lines) {
      if (!normalized.alreadyMetric) {
        haverSum += computePolylineLengthHaversineM(line);
      }
      const local = streetCoordsToLocalMeters(
        line,
        project,
        originE,
        originN,
        normalized.alreadyMetric,
      );
      if (local && local.length >= 2) {
        localParts.push(local);
      } else {
        invalidGeometryCount += 1;
        if (logInvalid) {
          console.warn('[enterprise-overview-streets] convert failed', {
            streetId: id.slice(0, 8),
            name: String(guide.name || '').slice(0, 40),
            sourceFormat: normalized.sourceFormat,
            alreadyMetric: normalized.alreadyMetric,
            sample: line[0],
            reason: 'utm_or_metric_convert_failed',
          });
        }
      }
    }

    if (localParts.length) {
      localLinesByGuideId.set(id, localParts);
      normalizedCount += 1;
      if (haverSum > 0) haversineLengthByGuideId.set(id, haverSum);
    } else {
      noGeometryCount += 1;
    }
  }

  return {
    localLinesByGuideId,
    haversineLengthByGuideId,
    normalizedCount,
    noGeometryCount,
    invalidGeometryCount,
  };
}

export function normalizeLocalPolyline(
  coords: number[][],
): [number, number][] | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const out: [number, number][] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const x = Number(c[0]);
    const y = Number(c[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push([x, y]);
  }
  return out.length >= 2 ? out : null;
}

/**
 * Ângulo de leitura a partir de um delta em coordenadas da folha (jsPDF mm).
 * Y do PDF cresce para baixo — usa atan2(-dy, dx) como em CAD sobre a folha.
 * Normalização ±90° (nunca de cabeça para baixo).
 */
export function sheetAngleFromPdfDelta(pdfDx: number, pdfDy: number): number {
  let angleDeg = (Math.atan2(-pdfDy, pdfDx) * 180) / Math.PI;
  while (angleDeg > 90) angleDeg -= 180;
  while (angleDeg <= -90) angleDeg += 180;
  return angleDeg;
}

/** @deprecated Preferir sheetAngleFromPdfDelta / getReadableSegmentAndUpperNormal. */
export function readableStreetLabelAngleDeg(dx: number, dy: number): number {
  return sheetAngleFromPdfDelta(dx, -dy);
}

/**
 * Orienta o segmento para leitura e devolve normal “superior” estável.
 * Se o segmento for invertido para tornar o texto legível, inverte o normal junto.
 */
export function getReadableSegmentAndUpperNormal(
  start: [number, number],
  end: [number, number],
): {
  start: [number, number];
  end: [number, number];
  angleDeg: number;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
} {
  let a: [number, number] = [start[0], start[1]];
  let b: [number, number] = [end[0], end[1]];
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;

  // Ângulo bruto (antes da normalização ±90) — se |ângulo| > 90, inverte o segmento
  let rawDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (rawDeg > 90 || rawDeg <= -90) {
    a = [end[0], end[1]];
    b = [start[0], start[1]];
    dx = b[0] - a[0];
    dy = b[1] - a[1];
    rawDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  }
  const angleDeg = sheetAngleFromPdfDelta(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  // Normal à esquerda do sentido orientado; em folha Y↓ isso aponta “acima” visual
  // quando o texto está na orientação legível.
  let nx = -uy;
  let ny = ux;
  // Preferir normal que aponta para Y menor (topo da página) em média
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { start: a, end: b, angleDeg, ux, uy, nx, ny };
}

/** Offset perpendicular discreto no eixo (não desloca para o lote). */
export function streetLabelOffsetMm(fontSize: number): number {
  return Math.min(
    STREET_LABEL_OFFSET_MAX_MM,
    Math.max(STREET_LABEL_OFFSET_MIN_MM, fontSize * 0.08),
  );
}

/**
 * Calcula o ângulo do rótulo no espaço da folha a partir do tangente local (UTM/rota).
 */
export function streetLabelAngleOnSheet(
  localPoint: [number, number],
  localDx: number,
  localDy: number,
  projectPoint: (p: [number, number]) => [number, number],
): number {
  const len = Math.hypot(localDx, localDy);
  const step = len > 1e-6 ? 1 : 1;
  const ux = len > 1e-6 ? localDx / len : 1;
  const uy = len > 1e-6 ? localDy / len : 0;
  const a = localPoint;
  const b: [number, number] = [
    localPoint[0] + ux * step,
    localPoint[1] + uy * step,
  ];
  const [ax, ay] = projectPoint(a);
  const [bx, by] = projectPoint(b);
  return getReadableSegmentAndUpperNormal([ax, ay], [bx, by]).angleDeg;
}

/** Distância mínima proporcional — impede sobreposição, não bloqueia repetições distantes. */
export function sameStreetLabelMinDistanceMm(
  text: string,
  fontSize: number,
): number {
  const w = estimateTextWidthMm(text, fontSize) * 1.35;
  return Math.min(20, Math.max(10, w));
}

export function interpolateAlongPolyline(
  line: [number, number][],
  t: number,
): { point: [number, number]; dx: number; dy: number } | null {
  if (!line || line.length < 2) return null;
  const total = computePolylineLengthM(line);
  if (total <= 0) {
    return {
      point: line[0],
      dx: line[1][0] - line[0][0],
      dy: line[1][1] - line[0][1],
    };
  }
  const target = Math.max(0, Math.min(1, t)) * total;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const seg = planarDistanceM(a, b);
    if (seg <= 0) continue;
    if (walked + seg >= target) {
      const localT = (target - walked) / seg;
      return {
        point: [a[0] + (b[0] - a[0]) * localT, a[1] + (b[1] - a[1]) * localT],
        dx: b[0] - a[0],
        dy: b[1] - a[1],
      };
    }
    walked += seg;
  }
  const n = line.length;
  return {
    point: line[n - 1],
    dx: line[n - 1][0] - line[n - 2][0],
    dy: line[n - 1][1] - line[n - 2][1],
  };
}

export function maxStreetLabelCountForLength(lengthM: number): number {
  if (!Number.isFinite(lengthM) || lengthM <= 0) return 0;
  if (lengthM <= 300) return 1;
  if (lengthM <= 700) return 2;
  return 3;
}

export function estimateTextWidthMm(text: string, fontSize: number): number {
  return Math.max(4, String(text || '').length * fontSize * 0.42);
}

export function boxesOverlap(a: OccupiedBox, b: OccupiedBox, pad = 0.4): boolean {
  return !(
    a.x + a.w + pad < b.x ||
    b.x + b.w + pad < a.x ||
    a.y + a.h + pad < b.y ||
    b.y + b.h + pad < a.y
  );
}

export function rotatedTextOccupiedBox(
  cx: number,
  cy: number,
  text: string,
  fontSize: number,
  angleDeg: number,
): OccupiedBox {
  const w = estimateTextWidthMm(text, fontSize);
  const h = fontSize * 0.4 + 0.8;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bw = w * cos + h * sin;
  const bh = w * sin + h * cos;
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}

export function sortStreetsForTable(
  rows: EnterpriseStreetGrouped[],
): EnterpriseStreetGrouped[] {
  return [...rows].sort((a, b) => {
    const ta = STREET_TYPE_SORT_ORDER[a.type] ?? 50;
    const tb = STREET_TYPE_SORT_ORDER[b.type] ?? 50;
    if (ta !== tb) return ta - tb;
    return a.displayName.localeCompare(b.displayName, 'pt-BR', {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

export function groupEnterpriseStreets(params: {
  guides: Array<Record<string, unknown>>;
  localLinesByGuideId: Map<string, [number, number][][]>;
  haversineLengthByGuideId?: Map<string, number>;
}): {
  streets: EnterpriseStreetGrouped[];
  unnamedCount: number;
  noGeometryCount: number;
  invalidGeometryCount: number;
} {
  const { guides, localLinesByGuideId, haversineLengthByGuideId } = params;
  const byId = new Map<string, EnterpriseStreetGrouped>();
  let unnamedCount = 0;
  let noGeometryCount = 0;
  let invalidGeometryCount = 0;

  for (const guide of guides) {
    const id = String(guide.id || '').trim();
    if (!id) continue;
    const type = String(guide.type || 'Rua').trim() || 'Rua';
    const name = String(guide.name || '').trim();
    const diagnosed = diagnoseOfficialStreetName(guide);
    if (diagnosed.divergence && diagnosed.divergenceDetail) {
      console.info('[street-official-name]', {
        id: diagnosed.id,
        type: diagnosed.type,
        name: diagnosed.name,
        code: diagnosed.code,
        incomingDisplayName: diagnosed.incomingDisplayName,
        prefixInName: diagnosed.prefixInName,
        label: diagnosed.label,
        source: diagnosed.source,
        divergence: diagnosed.divergenceDetail,
      });
    }
    const displayName = diagnosed.label;
    const unnamed =
      displayName === 'Via sem identificação' || isUnnamedStreetName(name);

    const existing = byId.get(id);
    const base: EnterpriseStreetGrouped =
      existing ??
      ({
        id,
        type,
        name: name || displayName,
        displayName,
        unnamed,
        segments: [],
        lengthM: 0,
        lengthAvailable: false,
        issues: [],
      } satisfies EnterpriseStreetGrouped);

    if (unnamed && !base.issues.includes('unnamed')) {
      base.issues.push('unnamed');
      unnamedCount += 1;
    }

    const lines = localLinesByGuideId.get(id) ?? [];
    if (lines.length === 0) {
      if (!base.issues.includes('no_geometry')) {
        base.issues.push('no_geometry');
        noGeometryCount += 1;
      }
      byId.set(id, base);
      continue;
    }

    let added = 0;
    for (const line of lines) {
      const normalized = normalizeLocalPolyline(line);
      if (!normalized) {
        invalidGeometryCount += 1;
        if (!base.issues.includes('invalid_geometry')) {
          base.issues.push('invalid_geometry');
        }
        continue;
      }
      const lengthM = computePolylineLengthM(normalized);
      base.segments.push({
        lineIndex: base.segments.length,
        line: normalized,
        lengthM,
      });
      base.lengthM += lengthM;
      added += 1;
    }
    if (added > 0) {
      base.lengthAvailable = true;
      base.issues = base.issues.filter((i) => i !== 'no_geometry');
    } else if (
      !base.lengthAvailable &&
      !base.issues.includes('length_unavailable')
    ) {
      base.issues.push('length_unavailable');
    }
    void haversineLengthByGuideId;
    byId.set(id, base);
  }

  return {
    streets: Array.from(byId.values()),
    unnamedCount,
    noGeometryCount,
    invalidGeometryCount,
  };
}

function pickLongestSegment(
  segments: EnterpriseStreetSegment[],
): EnterpriseStreetSegment | null {
  let best: EnterpriseStreetSegment | null = null;
  for (const seg of segments) {
    if (!best || seg.lengthM > best.lengthM) best = seg;
  }
  return best;
}

/** Fonte única por via — todas as repetições usam o mesmo tamanho. */
export function computeUniformStreetLabelFontSize(
  text: string,
  lengthM: number,
  mapScaleMmPerM: number,
): number {
  const availableMm = Math.max(lengthM * mapScaleMmPerM * 0.55, 14);
  let fontSize = STREET_LABEL_FONT_MAX;
  while (
    fontSize > STREET_LABEL_FONT_MIN &&
    estimateTextWidthMm(text, fontSize) > availableMm
  ) {
    fontSize -= 0.25;
  }
  return Math.max(fontSize, STREET_LABEL_FONT_MIN);
}

export function pickStreetLabelPlacements(
  street: EnterpriseStreetGrouped,
  opts?: { mapScaleMmPerM?: number },
): EnterpriseStreetLabelPlacement[] {
  if (street.unnamed || !street.segments.length || !street.lengthAvailable) {
    return [];
  }
  const scale = opts?.mapScaleMmPerM ?? 0.05;
  const text = street.displayName;
  const maxCount = maxStreetLabelCountForLength(street.lengthM);
  if (maxCount < 1) return [];

  const sortedSegs = [...street.segments]
    .filter(
      (s) =>
        s.lengthM >= STREET_LABEL_MIN_SEGMENT_M || street.segments.length === 1,
    )
    .sort((a, b) => b.lengthM - a.lengthM);
  const segs = sortedSegs.length
    ? sortedSegs
    : [...street.segments].sort((a, b) => b.lengthM - a.lengthM);

  const fontSize = computeUniformStreetLabelFontSize(
    text,
    street.lengthM,
    scale,
  );

  const tSlots =
    maxCount === 1 ? [0.5] : maxCount === 2 ? [0.33, 0.67] : [0.25, 0.5, 0.75];

  const candidates: EnterpriseStreetLabelPlacement[] = [];
  const longest = segs[0];
  if (!longest) return [];

  for (const t of tSlots) {
    const sample = interpolateAlongPolyline(longest.line, t);
    if (!sample) continue;
    candidates.push({
      point: sample.point,
      angleDeg: readableStreetLabelAngleDeg(sample.dx, sample.dy),
      fontSize,
      text,
      segmentLengthM: longest.lengthM,
    });
  }

  const filtered: EnterpriseStreetLabelPlacement[] = [];
  for (const c of candidates) {
    const tooClose = filtered.some(
      (f) => planarDistanceM(f.point, c.point) < STREET_LABEL_REPEAT_GAP_M,
    );
    if (!tooClose) filtered.push(c);
  }

  if (filtered.length === 0 && longest) {
    const mid = interpolateAlongPolyline(longest.line, 0.5);
    if (mid) {
      filtered.push({
        point: mid.point,
        angleDeg: readableStreetLabelAngleDeg(mid.dx, mid.dy),
        fontSize,
        text,
        segmentLengthM: longest.lengthM,
      });
    }
  }

  return filtered;
}

function sheetDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Pipeline única: placements finais em mm da folha.
 * Offset pequeno; dedupe proporcional; colisão forte vs leve; fallback ≥1 rótulo.
 */
export function buildStreetLabelPlacementsOnSheet(params: {
  street: EnterpriseStreetGrouped;
  placements: EnterpriseStreetLabelPlacement[];
  projectPoint: (p: [number, number]) => [number, number];
  hardOccupied: OccupiedBox[];
  softOccupied?: OccupiedBox[];
  mapScaleMmPerM: number;
  mapBox?: { x: number; y: number; w: number; h: number };
}): {
  placements: StreetLabelSheetPlacement[];
  diag: StreetLabelBuildDiag;
} {
  const {
    street,
    placements,
    projectPoint,
    hardOccupied,
    softOccupied = [],
    mapScaleMmPerM,
    mapBox,
  } = params;

  const fontSize = computeUniformStreetLabelFontSize(
    street.displayName,
    street.lengthM,
    mapScaleMmPerM,
  );
  const offsetIdeal = streetLabelOffsetMm(fontSize);
  const minDist = sameStreetLabelMinDistanceMm(street.displayName, fontSize);

  const segs = [...street.segments]
    .filter(
      (s) =>
        s.lengthM >= STREET_LABEL_MIN_SEGMENT_M || street.segments.length === 1,
    )
    .sort((a, b) => b.lengthM - a.lengthM);
  const useSegs = segs.length
    ? segs
    : [...street.segments].sort((a, b) => b.lengthM - a.lengthM);

  const diag: StreetLabelBuildDiag = {
    streetId: street.id,
    streetName: street.displayName,
    requestedRepetitions: Math.max(placements.length, 1),
    candidatesGenerated: 0,
    acceptedPlacements: 0,
    rejectedTooClose: 0,
    rejectedLotCollision: 0,
    rejectedHardCollision: 0,
    rejectedOutOfBounds: 0,
    rejectedCollision: 0,
    sidesUsed: [],
    usedFallback: false,
  };

  const accepted: StreetLabelSheetPlacement[] = [];
  const hardBoxes = [...hardOccupied];

  const inMap = (x: number, y: number) => {
    if (!mapBox) return true;
    return (
      x >= mapBox.x + 2 &&
      x <= mapBox.x + mapBox.w - 2 &&
      y >= mapBox.y + 2 &&
      y <= mapBox.y + mapBox.h - 2
    );
  };

  type Mode = 'prefer_clear' | 'allow_soft' | 'fallback';

  const tryCandidate = (
    localPoint: [number, number],
    localDx: number,
    localDy: number,
    repetitionIndex: number,
    mode: Mode,
    offsetMm: number,
  ): StreetLabelSheetPlacement | null => {
    const len = Math.hypot(localDx, localDy) || 1;
    const ux = localDx / len;
    const uy = localDy / len;
    const localB: [number, number] = [localPoint[0] + ux, localPoint[1] + uy];
    const [ax, ay] = projectPoint(localPoint);
    const [bx, by] = projectPoint(localB);
    const oriented = getReadableSegmentAndUpperNormal([ax, ay], [bx, by]);

    const sides: Array<{ side: 'upper' | 'lower'; nx: number; ny: number }> = [
      { side: 'upper', nx: oriented.nx, ny: oriented.ny },
      { side: 'lower', nx: -oriented.nx, ny: -oriented.ny },
    ];
    // Sem deslocamento lateral/tangencial: ponto médio do texto = ponto médio do trecho.
    // Fallback extremo pode deslizar pouco no eixo só para ainda rotular a via.
    const longOffsets = mode === 'fallback' ? [0, 4, -4, 8, -8] : [0];

    let bestSoft: StreetLabelSheetPlacement | null = null;

    for (const side of sides) {
      for (const along of longOffsets) {
        diag.candidatesGenerated += 1;
        const x = ax + side.nx * offsetMm + oriented.ux * along;
        const y = ay + side.ny * offsetMm + oriented.uy * along;
        if (!inMap(x, y)) {
          diag.rejectedOutOfBounds += 1;
          continue;
        }

        const box = rotatedTextOccupiedBox(
          x,
          y,
          street.displayName,
          fontSize,
          oriented.angleDeg,
        );

        const tooClose = accepted.some((p) => {
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < minDist) return true;
          return boxesOverlap(
            box,
            rotatedTextOccupiedBox(p.x, p.y, p.text, p.fontSize, p.angleDeg),
            0.2,
          );
        });
        if (tooClose) {
          diag.rejectedTooClose += 1;
          continue;
        }

        const hitsHard = hardBoxes.some((b) => boxesOverlap(box, b, 0.25));
        if (hitsHard) {
          diag.rejectedHardCollision += 1;
          diag.rejectedCollision += 1;
          continue;
        }

        const hitsSoft = softOccupied.some((b) => boxesOverlap(box, b, 0.05));
        if (hitsSoft) {
          diag.rejectedLotCollision += 1;
          if (mode === 'prefer_clear') continue;
          if (!bestSoft) {
            bestSoft = {
              streetId: street.id,
              text: street.displayName,
              x,
              y,
              angleDeg: oriented.angleDeg,
              fontSize,
              repetitionIndex,
              side: side.side,
            };
          }
          if (mode === 'fallback') return bestSoft;
          continue;
        }

        return {
          streetId: street.id,
          text: street.displayName,
          x,
          y,
          angleDeg: oriented.angleDeg,
          fontSize,
          repetitionIndex,
          side: side.side,
        };
      }
    }
    return mode === 'prefer_clear' ? null : bestSoft;
  };

  const offsetsToTry = [offsetIdeal, STREET_LABEL_OFFSET_MIN_MM];

  const sampleAt = (t: number) => {
    const longest = useSegs[0];
    if (!longest) return null;
    return interpolateAlongPolyline(longest.line, t);
  };

  const requestCount = Math.max(placements.length, 1);
  const baseTs =
    requestCount === 1
      ? [0.5]
      : requestCount === 2
        ? [0.33, 0.67]
        : [0.25, 0.5, 0.75];

  for (let i = 0; i < requestCount; i++) {
    let chosen: StreetLabelSheetPlacement | null = null;
    const baseT = baseTs[i] ?? 0.5;
    const tAttempts = [
      baseT,
      baseT + 0.08,
      baseT - 0.08,
      baseT + 0.15,
      baseT - 0.15,
      0.5,
      0.4,
      0.6,
    ].map((t) => Math.max(0.08, Math.min(0.92, t)));

    for (const mode of ['prefer_clear', 'allow_soft'] as Mode[]) {
      for (const off of offsetsToTry) {
        for (const t of tAttempts) {
          const sample = sampleAt(t);
          if (!sample) continue;
          chosen = tryCandidate(
            sample.point,
            sample.dx,
            sample.dy,
            i,
            mode,
            off,
          );
          if (chosen) break;
        }
        if (chosen) break;
      }
      if (chosen) break;
    }

    if (chosen) {
      accepted.push(chosen);
      hardBoxes.push(
        rotatedTextOccupiedBox(
          chosen.x,
          chosen.y,
          chosen.text,
          chosen.fontSize,
          chosen.angleDeg,
        ),
      );
      if (!diag.sidesUsed.includes(chosen.side)) {
        diag.sidesUsed.push(chosen.side);
      }
    }
  }

  if (accepted.length === 0 && useSegs[0]) {
    diag.usedFallback = true;
    const sample =
      sampleAt(0.5) || interpolateAlongPolyline(useSegs[0].line, 0.5);
    if (sample) {
      const chosen = tryCandidate(
        sample.point,
        sample.dx,
        sample.dy,
        0,
        'fallback',
        STREET_LABEL_OFFSET_MIN_MM,
      );
      if (chosen) {
        accepted.push(chosen);
        hardBoxes.push(
          rotatedTextOccupiedBox(
            chosen.x,
            chosen.y,
            chosen.text,
            chosen.fontSize,
            chosen.angleDeg,
          ),
        );
        if (!diag.sidesUsed.includes(chosen.side)) {
          diag.sidesUsed.push(chosen.side);
        }
      }
    }
  }

  diag.acceptedPlacements = accepted.length;
  return { placements: accepted, diag };
}

/**
 * Compat: usa a pipeline única e devolve formato legado para testes.
 */
export function resolveStreetLabelCollisions(
  placements: EnterpriseStreetLabelPlacement[],
  projectPoint: (p: [number, number]) => [number, number],
  hardOccupied: OccupiedBox[],
  street: EnterpriseStreetGrouped,
  mapScaleMmPerM: number,
  softOccupied: OccupiedBox[] = [],
): EnterpriseStreetLabelPlacement[] {
  const { placements: sheet } = buildStreetLabelPlacementsOnSheet({
    street,
    placements,
    projectPoint,
    hardOccupied,
    softOccupied,
    mapScaleMmPerM,
  });
  return sheet.map((s, idx) => ({
    point: placements[Math.min(idx, placements.length - 1)]?.point ?? [
      s.x,
      s.y,
    ],
    angleDeg: s.angleDeg,
    fontSize: s.fontSize,
    text: s.text,
    segmentLengthM:
      placements[Math.min(idx, placements.length - 1)]?.segmentLengthM ?? 0,
  }));
}

export function buildStreetTableRows(streets: EnterpriseStreetGrouped[]): {
  rows: EnterpriseStreetTableRow[];
  pendingRows: EnterpriseStreetTableRow[];
  totalLengthM: number;
} {
  const sorted = sortStreetsForTable(streets);
  const rows: EnterpriseStreetTableRow[] = [];
  const pendingRows: EnterpriseStreetTableRow[] = [];
  let totalLengthM = 0;
  let n = 0;

  for (const s of sorted) {
    if (s.unnamed || !s.lengthAvailable) {
      pendingRows.push({
        id: s.id,
        number: '—',
        name: s.unnamed ? 'Via sem identificação' : s.displayName,
        type: s.type,
        lengthLabel: s.lengthAvailable
          ? formatLengthMetersPtBr(s.lengthM)
          : 'Não calculado',
        lengthM: s.lengthAvailable ? s.lengthM : null,
        pending: true,
      });
      continue;
    }
    n += 1;
    totalLengthM += s.lengthM;
    rows.push({
      id: s.id,
      number: String(n).padStart(2, '0'),
      name: s.displayName,
      type: s.type,
      lengthLabel: formatLengthMetersPtBr(s.lengthM),
      lengthM: s.lengthM,
      pending: false,
    });
  }

  return { rows, pendingRows, totalLengthM };
}

export function planStreetTableLayout(
  streets: EnterpriseStreetGrouped[],
  panel: { w: number; h: number },
  reservedTopMm = 72,
): StreetTablePlan {
  const { rows, pendingRows, totalLengthM } = buildStreetTableRows(streets);
  const available = Math.max(20, panel.h - reservedTopMm - 14);
  let fontSize = 5.5;
  let rowH = 4.2;
  const capacityOne = Math.floor(available / rowH);
  const capacityTwo = capacityOne * 2;

  let mode: StreetTableLayoutMode = 'single';
  if (rows.length > capacityOne) {
    fontSize = 4.8;
    rowH = 3.6;
    const cap1 = Math.floor(available / rowH);
    const cap2 = cap1 * 2;
    if (rows.length <= cap1) mode = 'single';
    else if (rows.length <= cap2) mode = 'two_columns';
    else mode = 'extra_page';
  }
  if (rows.length > capacityTwo && mode !== 'extra_page') {
    mode = 'extra_page';
  }

  return {
    mode,
    rows,
    pendingRows,
    totalLengthM,
    totalLengthLabel: formatLengthMetersPtBr(totalLengthM),
    streetCount: rows.length,
    fontSize,
  };
}
