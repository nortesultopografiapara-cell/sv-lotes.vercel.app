/**
 * Helpers puros — nomes, comprimentos e quadro de vias da Prancha Geral.
 * Sem jsPDF/Supabase: seguro para testes Node.
 */

import { formatStreetDisplay } from '@/lib/streetGuide';
import { planarDistanceM } from '@/lib/officialConfrontationRing';

export const STREET_TYPE_SORT_ORDER: Record<string, number> = {
  Rodovia: 0,
  Avenida: 1,
  Rua: 2,
  Alameda: 3,
  Travessa: 4,
  Estrada: 5,
  Acesso: 6,
  Vicinal: 7,
  Outro: 8,
};

export const STREET_LABEL_FONT_MAX = 6.5;
export const STREET_LABEL_FONT_MIN = 3.5;
/** Comprimento mínimo do trecho (m) para aceitar um rótulo. */
export const STREET_LABEL_MIN_SEGMENT_M = 25;
/** Distância mínima entre rótulos repetidos (m reais). */
export const STREET_LABEL_REPEAT_GAP_M = 180;

export type EnterpriseStreetIssue =
  | 'unnamed'
  | 'no_geometry'
  | 'invalid_geometry'
  | 'length_unavailable';

export type EnterpriseStreetSegment = {
  /** Índice do trecho dentro da via. */
  lineIndex: number;
  /** Pontos em metros locais (UTM − origem), já no espaço do fit. */
  line: [number, number][];
  lengthM: number;
};

export type EnterpriseStreetLabelPlacement = {
  /** Ponto em metros locais (mesmo CRS da linha). */
  point: [number, number];
  /** Ângulo em graus para jsPDF.text (sentido legível). */
  angleDeg: number;
  fontSize: number;
  text: string;
  /** Comprimento do trecho usado (m). */
  segmentLengthM: number;
};

export type EnterpriseStreetGrouped = {
  id: string;
  type: string;
  name: string;
  displayName: string;
  unnamed: boolean;
  segments: EnterpriseStreetSegment[];
  /** Soma exata antes do arredondamento de exibição. */
  lengthM: number;
  lengthAvailable: boolean;
  issues: EnterpriseStreetIssue[];
};

export type EnterpriseStreetTableRow = {
  id: string;
  number: string;
  name: string;
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

/** Soma comprimento planar de uma polilinha em metros. */
export function computePolylineLengthM(line: [number, number][]): number {
  if (!line || line.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < line.length; i++) {
    sum += planarDistanceM(line[i - 1], line[i]);
  }
  return sum;
}

/** Formata metros com 2 casas, pt-BR. Arredonda só na exibição. */
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

/**
 * Extrai todas as polilinhas de coordenadas GeoJSON
 * (LineString ou MultiLineString).
 */
export function extractAllPolylineParts(coords: unknown): number[][][] {
  if (!Array.isArray(coords) || coords.length < 1) return [];
  const first = coords[0];
  if (
    Array.isArray(first) &&
    first.length >= 2 &&
    typeof first[0] === 'number' &&
    typeof first[1] === 'number'
  ) {
    return [coords as number[][]];
  }
  const parts: number[][][] = [];
  for (const part of coords) {
    if (!Array.isArray(part) || part.length < 2) continue;
    const p0 = part[0];
    if (
      Array.isArray(p0) &&
      p0.length >= 2 &&
      typeof p0[0] === 'number' &&
      typeof p0[1] === 'number'
    ) {
      parts.push(part as number[][]);
      continue;
    }
    parts.push(...extractAllPolylineParts(part));
  }
  return parts;
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

/** Ângulo legível: esquerda→direita ou baixo→cima (evita cabeça para baixo). */
export function readableStreetLabelAngleDeg(dx: number, dy: number): number {
  let angleDeg = (-Math.atan2(dy, dx) * 180) / Math.PI;
  while (angleDeg > 90) angleDeg -= 180;
  while (angleDeg <= -90) angleDeg += 180;
  return angleDeg;
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
  // Helvetica aproximado: ~0.5 × fontSize por caractere em mm (jsPDF unit mm).
  return Math.max(4, String(text || '').length * fontSize * 0.42);
}

export function boxesOverlap(a: OccupiedBox, b: OccupiedBox, pad = 0.6): boolean {
  return !(
    a.x + a.w + pad < b.x ||
    b.x + b.w + pad < a.x ||
    a.y + a.h + pad < b.y ||
    b.y + b.h + pad < a.y
  );
}

/** Bounding box aproximada de texto rotacionado (centro do texto). */
export function rotatedTextOccupiedBox(
  cx: number,
  cy: number,
  text: string,
  fontSize: number,
  angleDeg: number,
): OccupiedBox {
  const w = estimateTextWidthMm(text, fontSize);
  const h = fontSize * 0.45 + 1.2;
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

/**
 * Agrupa vias por id de street_guides (não funde IDs distintos com mesmo nome).
 * `localLinesByGuideId` deve conter polilinhas já convertidas para metros locais.
 */
export function groupEnterpriseStreets(params: {
  guides: Array<Record<string, unknown>>;
  localLinesByGuideId: Map<string, [number, number][][]>;
}): {
  streets: EnterpriseStreetGrouped[];
  unnamedCount: number;
  noGeometryCount: number;
  invalidGeometryCount: number;
} {
  const { guides, localLinesByGuideId } = params;
  const byId = new Map<string, EnterpriseStreetGrouped>();
  let unnamedCount = 0;
  let noGeometryCount = 0;
  let invalidGeometryCount = 0;

  for (const guide of guides) {
    const id = String(guide.id || '').trim();
    if (!id) continue;
    const type = String(guide.type || 'Rua').trim() || 'Rua';
    const name = String(guide.name || '').trim();
    const unnamed = isUnnamedStreetName(name);
    const displayName = unnamed
      ? 'Via sem identificação'
      : String(guide.displayName || formatStreetDisplay(type, name));

    const existing = byId.get(id);
    const base: EnterpriseStreetGrouped =
      existing ??
      ({
        id,
        type,
        name: name || 'Rua/Eixo sem nome',
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
    } else if (!base.lengthAvailable && !base.issues.includes('length_unavailable')) {
      base.issues.push('length_unavailable');
    }
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

/**
 * Posições de rótulo ao longo da via (metros locais).
 * Colisão/fonte são refinados depois com caixas em mm PDF.
 */
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

  const sortedSegs = [...street.segments].sort((a, b) => b.lengthM - a.lengthM);
  const candidates: EnterpriseStreetLabelPlacement[] = [];
  const tSlots =
    maxCount === 1 ? [0.5] : maxCount === 2 ? [0.28, 0.72] : [0.2, 0.5, 0.8];

  for (const t of tSlots) {
    let placed: EnterpriseStreetLabelPlacement | null = null;
    for (const seg of sortedSegs) {
      if (seg.lengthM < STREET_LABEL_MIN_SEGMENT_M) continue;
      const sample = interpolateAlongPolyline(seg.line, t);
      if (!sample) continue;
      const angleDeg = readableStreetLabelAngleDeg(sample.dx, sample.dy);
      const availableMm = seg.lengthM * scale * 0.85;
      let fontSize = STREET_LABEL_FONT_MAX;
      while (
        fontSize >= STREET_LABEL_FONT_MIN &&
        estimateTextWidthMm(text, fontSize) > availableMm
      ) {
        fontSize -= 0.25;
      }
      if (estimateTextWidthMm(text, fontSize) > availableMm) continue;
      placed = {
        point: sample.point,
        angleDeg,
        fontSize,
        text,
        segmentLengthM: seg.lengthM,
      };
      break;
    }
    if (placed) candidates.push(placed);
  }

  // Distância mínima entre rótulos (metros reais).
  const filtered: EnterpriseStreetLabelPlacement[] = [];
  for (const c of candidates) {
    const tooClose = filtered.some((f) => {
      const d = planarDistanceM(f.point, c.point);
      return d < STREET_LABEL_REPEAT_GAP_M;
    });
    if (!tooClose) filtered.push(c);
  }

  if (filtered.length === 0) {
    const longest = pickLongestSegment(sortedSegs);
    if (longest && longest.lengthM >= STREET_LABEL_MIN_SEGMENT_M) {
      const mid = interpolateAlongPolyline(longest.line, 0.5);
      if (mid) {
        const angleDeg = readableStreetLabelAngleDeg(mid.dx, mid.dy);
        const availableMm = longest.lengthM * scale * 0.85;
        let fontSize = STREET_LABEL_FONT_MAX;
        while (
          fontSize >= STREET_LABEL_FONT_MIN &&
          estimateTextWidthMm(text, fontSize) > availableMm
        ) {
          fontSize -= 0.25;
        }
        if (estimateTextWidthMm(text, fontSize) <= availableMm) {
          filtered.push({
            point: mid.point,
            angleDeg,
            fontSize,
            text,
            segmentLengthM: longest.lengthM,
          });
        }
      }
    }
  }

  return filtered;
}

/**
 * Filtra colocações que colidem com caixas ocupadas (em mm PDF).
 * Tenta deslocar t ao longo do eixo; se falhar, omite.
 */
export function resolveStreetLabelCollisions(
  placements: EnterpriseStreetLabelPlacement[],
  projectPoint: (p: [number, number]) => [number, number],
  occupied: OccupiedBox[],
  street: EnterpriseStreetGrouped,
  mapScaleMmPerM: number,
): EnterpriseStreetLabelPlacement[] {
  const accepted: EnterpriseStreetLabelPlacement[] = [];
  const boxes = [...occupied];

  for (const place of placements) {
    let chosen: EnterpriseStreetLabelPlacement | null = null;
    const tryTs = [0.5, 0.35, 0.65, 0.25, 0.75, 0.4, 0.6];
    const segs = [...street.segments].sort((a, b) => b.lengthM - a.lengthM);

    const attempts: EnterpriseStreetLabelPlacement[] = [place];
    for (const seg of segs.slice(0, 3)) {
      for (const t of tryTs) {
        const sample = interpolateAlongPolyline(seg.line, t);
        if (!sample) continue;
        let fontSize = place.fontSize;
        const availableMm = seg.lengthM * mapScaleMmPerM * 0.85;
        while (
          fontSize >= STREET_LABEL_FONT_MIN &&
          estimateTextWidthMm(place.text, fontSize) > availableMm
        ) {
          fontSize -= 0.25;
        }
        if (estimateTextWidthMm(place.text, fontSize) > availableMm) continue;
        attempts.push({
          point: sample.point,
          angleDeg: readableStreetLabelAngleDeg(sample.dx, sample.dy),
          fontSize,
          text: place.text,
          segmentLengthM: seg.lengthM,
        });
      }
    }

    for (const attempt of attempts) {
      const [cx, cy] = projectPoint(attempt.point);
      const box = rotatedTextOccupiedBox(
        cx,
        cy,
        attempt.text,
        attempt.fontSize,
        attempt.angleDeg,
      );
      const hit = boxes.some((b) => boxesOverlap(box, b));
      if (!hit) {
        chosen = attempt;
        boxes.push(box);
        break;
      }
    }
    if (chosen) accepted.push(chosen);
  }
  return accepted;
}

export function buildStreetTableRows(
  streets: EnterpriseStreetGrouped[],
): {
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
      lengthLabel: formatLengthMetersPtBr(s.lengthM),
      lengthM: s.lengthM,
      pending: false,
    });
  }

  return { rows, pendingRows, totalLengthM };
}

/**
 * Planeja layout da tabela no painel lateral.
 * Capacidade aproximada: ~ (panelH - reserved) / rowH linhas por coluna.
 */
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
