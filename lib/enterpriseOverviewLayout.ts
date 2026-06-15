/**
 * Prancha Geral do Empreendimento — enquadramento, rotação e estatísticas.
 */

import proj4 from 'proj4';
import { resolveRealCoordinateRing, latLngRingFromBlockForConversion } from '@/lib/lotSheetCoordinates';
import { readStreetGuideLineCoordinates } from '@/lib/streetGuide';
import type { GeographicBounds } from '@/lib/enterpriseOverviewSatellite';

export type EnterprisePrintFormat = 'a4_landscape' | 'a3_landscape' | 'a3_portrait';

export type EnterpriseOverviewOptions = {
  format: EnterprisePrintFormat;
  showLegend: boolean;
  showLogo: boolean;
  showGraphicScale: boolean;
  showNorth: boolean;
  showStreets: boolean;
  showLotNumbers: boolean;
  /** Fundo Esri World Imagery (browser). Google Static não é usado por licenciamento. */
  showSatelliteBackground: boolean;
};

export const ENTERPRISE_LOT_FILL_OPACITY = 0.12;

/** Espessura das divisas dos lotes (mm) — 100% opacas, desenhadas após o preenchimento. */
export const ENTERPRISE_LOT_STROKE_WIDTH_MM = 0.5;

export const ENTERPRISE_LOT_STROKE_RGB: [number, number, number] = [0, 0, 0];

export const DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS: EnterpriseOverviewOptions = {
  format: 'a3_landscape',
  showLegend: true,
  showLogo: true,
  showGraphicScale: true,
  showNorth: true,
  showStreets: true,
  showLotNumbers: true,
  showSatelliteBackground: false,
};

export type EnterpriseStatistics = {
  projectName: string;
  quadraCount: number;
  lotCount: number;
  totalAreaM2: number;
  disponivel: number;
  reservado: number;
  vendido: number;
  emittedAt: string;
};

export type EnterpriseLotPrint = {
  id: string;
  number: string;
  quadra: string;
  status: string;
  ring: [number, number][];
  centroid: [number, number];
  fillRgb: [number, number, number];
  strokeRgb: [number, number, number];
};

export type EnterpriseStreetPrint = {
  name: string;
  displayName: string;
  line: [number, number][];
};

export type EnterpriseQuadraLabel = {
  quadra: string;
  position: [number, number];
};

export type EnterpriseBbox = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type EnterpriseGraphicScale = {
  barMeters: number;
  barMm: number;
  segmentMeters: number;
};

export type EnterpriseOverviewLayout = {
  lots: EnterpriseLotPrint[];
  streets: EnterpriseStreetPrint[];
  quadraLabels: EnterpriseQuadraLabel[];
  bbox: EnterpriseBbox;
  rotatedBbox: EnterpriseBbox;
  rotationDeg: 0 | 90;
  mapScaleMmPerM: number;
  graphicScale: EnterpriseGraphicScale;
  statistics: EnterpriseStatistics;
  pageSizeMm: { width: number; height: number };
  mapBoxMm: { x: number; y: number; w: number; h: number };
  sidePanelMm: { x: number; y: number; w: number; h: number };
  originE: number;
  originN: number;
  geographicBounds: GeographicBounds | null;
};

const STATUS_COLORS: Record<
  string,
  { fill: [number, number, number]; stroke: [number, number, number] }
> = {
  Disponível: { fill: [34, 197, 94], stroke: [40, 40, 40] },
  Reservado: { fill: [234, 179, 8], stroke: [40, 40, 40] },
  Vendido: { fill: [239, 68, 68], stroke: [40, 40, 40] },
};

const PAGE_SIZES_MM: Record<
  EnterprisePrintFormat,
  { width: number; height: number }
> = {
  a4_landscape: { width: 297, height: 210 },
  a3_landscape: { width: 420, height: 297 },
  a3_portrait: { width: 297, height: 420 },
};

const MARGIN_MM = 8;
const HEADER_HEIGHT_MM = 30;
const SIDE_PANEL_WIDTH_MM = 58;
const FIT_MARGIN_RATIO = 0.08;

function parseUtmZone(project: Record<string, unknown> | null | undefined): {
  zone: number;
  south: boolean;
} | null {
  const raw = String(
    project?.utm_zone ?? project?.zona_utm ?? project?.utmZone ?? '',
  ).trim();
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})\s*([NnSs])?/i);
  if (!m?.[1]) return null;
  const zone = Number(m[1]);
  if (!Number.isFinite(zone) || zone < 1 || zone > 60) return null;
  const south = !m[2] || m[2].toUpperCase() === 'S';
  return { zone, south };
}

function isLikelyLatLng(a: number, b: number): boolean {
  return Math.abs(a) <= 180 && Math.abs(b) <= 90;
}

function latLngRingToLocalMeters(
  coords: number[][],
  project: Record<string, unknown> | null | undefined,
  originE: number,
  originN: number,
): [number, number][] | null {
  const zoneInfo = parseUtmZone(project);
  if (!zoneInfo || coords.length < 2) return null;
  try {
    const def = `+proj=utm +zone=${zoneInfo.zone} +${zoneInfo.south ? 'south' : 'north'} +datum=WGS84 +units=m +no_defs`;
    const out: [number, number][] = [];
    for (const c of coords) {
      if (!Array.isArray(c) || c.length < 2) continue;
      const a = Number(c[0]);
      const b = Number(c[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      let lat = a;
      let lng = b;
      if (Math.abs(a) > 90) {
        lng = a;
        lat = b;
      }
      const [e, n] = proj4('EPSG:4326', def, [lng, lat]) as [number, number];
      out.push([e - originE, n - originN]);
    }
    return out.length >= 2 ? out : null;
  } catch {
    return null;
  }
}

export function normalizeLotStatus(status: unknown): string {
  const s = String(status || 'Disponível').trim();
  const lower = s.toLowerCase();
  if (lower.includes('reserv')) return 'Reservado';
  if (lower.includes('vend') || lower === 'sold') return 'Vendido';
  return 'Disponível';
}

export function formatLotNumberLabel(number: unknown): string {
  const t = String(number ?? '').trim();
  if (!t) return '—';
  if (/^\d+$/.test(t)) return t.padStart(2, '0');
  return t;
}

export function quadraLabelFromBlock(block: Record<string, unknown>): string {
  return String(
    block.block_name ?? block.block ?? block.quadra ?? '',
  ).trim();
}

function ringCentroid(ring: [number, number][]): [number, number] {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
  }
  const n = ring.length || 1;
  return [sx / n, sy / n];
}

function expandBbox(
  bbox: EnterpriseBbox,
  points: [number, number][],
): EnterpriseBbox {
  let { minX, maxX, minY, maxY } = bbox;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function bboxFromPoints(points: [number, number][]): EnterpriseBbox | null {
  if (!points.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function bboxWithMargin(bbox: EnterpriseBbox, ratio = FIT_MARGIN_RATIO): EnterpriseBbox {
  const w = bbox.maxX - bbox.minX || 1;
  const h = bbox.maxY - bbox.minY || 1;
  const mx = w * ratio;
  const my = h * ratio;
  return {
    minX: bbox.minX - mx,
    maxX: bbox.maxX + mx,
    minY: bbox.minY - my,
    maxY: bbox.maxY + my,
  };
}

function rotatePointAround(
  point: [number, number],
  center: [number, number],
  deg: 0 | 90,
): [number, number] {
  if (deg === 0) return point;
  const [x, y] = point;
  const [cx, cy] = center;
  const rx = x - cx;
  const ry = y - cy;
  return [ry + cx, -rx + cy];
}

function rotateRing(
  ring: [number, number][],
  center: [number, number],
  deg: 0 | 90,
): [number, number][] {
  return ring.map((p) => rotatePointAround(p, center, deg));
}

/** Escolhe 0° ou 90° para maximizar área útil na folha. */
export function calculateBestPrintRotation(
  bbox: EnterpriseBbox,
  printableWidthMm: number,
  printableHeightMm: number,
): 0 | 90 {
  const w = bbox.maxX - bbox.minX || 1;
  const h = bbox.maxY - bbox.minY || 1;
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const center: [number, number] = [cx, cy];

  const corners: [number, number][] = [
    [bbox.minX, bbox.minY],
    [bbox.maxX, bbox.minY],
    [bbox.maxX, bbox.maxY],
    [bbox.minX, bbox.maxY],
  ];

  const scoreFor = (deg: 0 | 90): number => {
    const rotated = corners.map((p) => rotatePointAround(p, center, deg));
    const rb = bboxFromPoints(rotated);
    if (!rb) return 0;
    const rw = rb.maxX - rb.minX || 1;
    const rh = rb.maxY - rb.minY || 1;
    return Math.min(
      (printableWidthMm * 0.92) / rw,
      (printableHeightMm * 0.92) / rh,
    );
  };

  const score0 = scoreFor(0);
  const score90 = scoreFor(90);

  if (score90 > score0 * 1.02) return 90;
  if (h > w * 1.15 && score90 >= score0) return 90;
  return 0;
}

export function computeEnterpriseStatistics(
  blocks: Record<string, unknown>[],
  project: Record<string, unknown>,
  emittedAt = new Date().toLocaleDateString('pt-BR'),
): EnterpriseStatistics {
  const quadras = new Set<string>();
  let totalArea = 0;
  let disponivel = 0;
  let reservado = 0;
  let vendido = 0;

  for (const block of blocks) {
    const q = quadraLabelFromBlock(block);
    if (q) quadras.add(q);
    const area = Number(block.area);
    if (Number.isFinite(area)) totalArea += area;
    const status = normalizeLotStatus(block.status);
    if (status === 'Reservado') reservado += 1;
    else if (status === 'Vendido') vendido += 1;
    else disponivel += 1;
  }

  return {
    projectName: String(project.name ?? project.title ?? 'Empreendimento'),
    quadraCount: quadras.size,
    lotCount: blocks.length,
    totalAreaM2: totalArea,
    disponivel,
    reservado,
    vendido,
    emittedAt,
  };
}

export function computeGraphicScaleBar(
  bboxWidthM: number,
  mapWidthMm: number,
): EnterpriseGraphicScale {
  const mmPerM = mapWidthMm / (bboxWidthM || 1);
  const candidates = [10, 20, 25, 50, 100, 200, 500, 1000];
  for (const barM of candidates) {
    const barMm = barM * mmPerM;
    if (barMm >= 32 && barMm <= 88) {
      const segments = barM <= 25 ? 5 : 5;
      return {
        barMeters: barM,
        barMm,
        segmentMeters: barM / segments,
      };
    }
  }
  const barMeters = 50;
  return {
    barMeters,
    barMm: barMeters * mmPerM,
    segmentMeters: 10,
  };
}

export type FitEnterpriseInput = {
  blocks: Record<string, unknown>[];
  streetGuides?: Record<string, unknown>[];
  project: Record<string, unknown>;
  options: EnterpriseOverviewOptions;
};

export type FitEnterpriseResult = {
  originE: number;
  originN: number;
  lots: EnterpriseLotPrint[];
  streets: EnterpriseStreetPrint[];
  quadraLabels: EnterpriseQuadraLabel[];
  bbox: EnterpriseBbox;
};

/** Localiza todos os lotes, calcula bbox geral com margem — ignora viewport do usuário. */
export function fitEnterpriseForPrint(input: FitEnterpriseInput): FitEnterpriseResult {
  const { blocks, streetGuides = [], project } = input;
  const ringsRaw: {
    block: Record<string, unknown>;
    ring: [number, number][];
  }[] = [];

  let originE = Infinity;
  let originN = Infinity;

  for (const block of blocks) {
    const resolved = resolveRealCoordinateRing(block, project);
    if (!resolved.available || resolved.ring.length < 3) continue;
    for (const [e, n] of resolved.ring) {
      originE = Math.min(originE, e);
      originN = Math.min(originN, n);
    }
    ringsRaw.push({ block, ring: resolved.ring });
  }

  if (!Number.isFinite(originE)) {
    originE = 0;
    originN = 0;
  }

  const lots: EnterpriseLotPrint[] = [];
  let bbox: EnterpriseBbox = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };

  for (const { block, ring } of ringsRaw) {
    const localRing = ring.map(
      ([e, n]) => [e - originE, n - originN] as [number, number],
    );
    bbox = expandBbox(bbox, localRing);
    const status = normalizeLotStatus(block.status);
    const colors = STATUS_COLORS[status] ?? STATUS_COLORS.Disponível;
    lots.push({
      id: String(block.id ?? ''),
      number: formatLotNumberLabel(block.number ?? block.lot),
      quadra: quadraLabelFromBlock(block),
      status,
      ring: localRing,
      centroid: ringCentroid(localRing),
      fillRgb: colors.fill,
      strokeRgb: colors.stroke,
    });
  }

  if (!lots.length) {
    bbox = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
  } else {
    bbox = bboxWithMargin(bbox);
  }

  const streets: EnterpriseStreetPrint[] = [];
  for (const guide of streetGuides) {
    const coords = readStreetGuideLineCoordinates(guide);
    if (!coords?.length) continue;
    const first = coords[0];
    const isLatLng =
      first &&
      isLikelyLatLng(Number(first[0]), Number(first[1]));
    let localLine: [number, number][] | null = null;
    if (isLatLng) {
      localLine = latLngRingToLocalMeters(coords, project, originE, originN);
    } else {
      localLine = coords.map(
        (c) =>
          [Number(c[0]) - originE, Number(c[1]) - originN] as [number, number],
      );
    }
    if (!localLine || localLine.length < 2) continue;
    bbox = expandBbox(bbox, localLine);
    const name = String(guide.name || '').trim() || 'Rua';
    streets.push({
      name,
      displayName: String(guide.displayName || name),
      line: localLine,
    });
  }

  const quadraMap = new Map<string, [number, number][]>();
  for (const lot of lots) {
    if (!lot.quadra) continue;
    const list = quadraMap.get(lot.quadra) ?? [];
    list.push(lot.centroid);
    quadraMap.set(lot.quadra, list);
  }
  const quadraLabels: EnterpriseQuadraLabel[] = [];
  for (const [quadra, centroids] of quadraMap) {
    const position = ringCentroid(centroids);
    quadraLabels.push({ quadra, position });
  }

  return { originE, originN, lots, streets, quadraLabels, bbox };
}

/** Bbox UTM local → limites WGS84 para fundo de satélite. */
export function computeGeographicBounds(
  originE: number,
  originN: number,
  bbox: EnterpriseBbox,
  project: Record<string, unknown>,
): GeographicBounds | null {
  const zoneInfo = parseUtmZone(project);
  if (!zoneInfo) return null;
  try {
    const def = `+proj=utm +zone=${zoneInfo.zone} +${zoneInfo.south ? 'south' : 'north'} +datum=WGS84 +units=m +no_defs`;
    const corners: [number, number][] = [
      [bbox.minX + originE, bbox.minY + originN],
      [bbox.maxX + originE, bbox.minY + originN],
      [bbox.maxX + originE, bbox.maxY + originN],
      [bbox.minX + originE, bbox.maxY + originN],
    ];
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    for (const [e, n] of corners) {
      const [lng, lat] = proj4(def, 'EPSG:4326', [e, n]) as [number, number];
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
    if (!Number.isFinite(west)) return null;
    const padLng = (east - west) * 0.02;
    const padLat = (north - south) * 0.02;
    return expandGeographicBoundsMinimum({
      west: west - padLng,
      south: south - padLat,
      east: east + padLng,
      north: north + padLat,
    });
  } catch {
    return null;
  }
}

/** Bounds WGS84 a partir de geometry lat/lng dos lotes (prioridade para satélite). */
export function computeGeographicBoundsFromBlocks(
  blocks: Record<string, unknown>[],
): GeographicBounds | null {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  let points = 0;

  for (const block of blocks) {
    const ring = latLngRingFromBlockForConversion(block);
    for (const [lat, lng] of ring) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      points++;
    }
  }

  if (points < 2 || !Number.isFinite(west)) return null;
  const padLng = Math.max((east - west) * 0.04, 0.0005);
  const padLat = Math.max((north - south) * 0.04, 0.0005);
  return expandGeographicBoundsMinimum({
    west: west - padLng,
    south: south - padLat,
    east: east + padLng,
    north: north + padLat,
  });
}

/** Garante extensão mínima para export Esri (empreendimentos compactos). */
export function expandGeographicBoundsMinimum(
  bounds: GeographicBounds,
  minSpanLng = 0.012,
  minSpanLat = 0.012,
): GeographicBounds {
  const cx = (bounds.west + bounds.east) / 2;
  const cy = (bounds.south + bounds.north) / 2;
  const halfW = Math.max((bounds.east - bounds.west) / 2, minSpanLng / 2);
  const halfH = Math.max((bounds.north - bounds.south) / 2, minSpanLat / 2);
  return {
    west: cx - halfW,
    east: cx + halfW,
    south: cy - halfH,
    north: cy + halfH,
  };
}

export function buildEnterpriseOverviewLayout(
  input: FitEnterpriseInput,
  emittedAt = new Date().toLocaleDateString('pt-BR'),
): EnterpriseOverviewLayout {
  const fit = fitEnterpriseForPrint(input);
  const pageSizeMm = PAGE_SIZES_MM[input.options.format];
  const sidePanelMm = {
    x: MARGIN_MM,
    y: HEADER_HEIGHT_MM + 4,
    w: SIDE_PANEL_WIDTH_MM,
    h: pageSizeMm.height - HEADER_HEIGHT_MM - MARGIN_MM - 6,
  };
  const mapBoxMm = {
    x: MARGIN_MM + SIDE_PANEL_WIDTH_MM + 4,
    y: HEADER_HEIGHT_MM + 4,
    w: pageSizeMm.width - (MARGIN_MM * 2 + SIDE_PANEL_WIDTH_MM + 4),
    h: pageSizeMm.height - HEADER_HEIGHT_MM - MARGIN_MM - 6,
  };

  const rotationDeg = calculateBestPrintRotation(
    fit.bbox,
    mapBoxMm.w,
    mapBoxMm.h,
  );
  const center: [number, number] = [
    (fit.bbox.minX + fit.bbox.maxX) / 2,
    (fit.bbox.minY + fit.bbox.maxY) / 2,
  ];

  const lots = fit.lots.map((lot) => ({
    ...lot,
    ring: rotateRing(lot.ring, center, rotationDeg),
    centroid: rotatePointAround(lot.centroid, center, rotationDeg),
  }));

  const streets = fit.streets.map((street) => ({
    ...street,
    line: rotateRing(street.line, center, rotationDeg),
  }));

  const quadraLabels = fit.quadraLabels.map((q) => ({
    ...q,
    position: rotatePointAround(q.position, center, rotationDeg),
  }));

  const allPts: [number, number][] = [];
  for (const lot of lots) allPts.push(...lot.ring);
  for (const street of streets) allPts.push(...street.line);
  const rotatedBbox = bboxWithMargin(
    bboxFromPoints(allPts) ?? fit.bbox,
    0.04,
  );

  const bboxWidthM = rotatedBbox.maxX - rotatedBbox.minX || 1;
  const bboxHeightM = rotatedBbox.maxY - rotatedBbox.minY || 1;
  const mapScaleMmPerM = Math.min(
    (mapBoxMm.w * 0.94) / bboxWidthM,
    (mapBoxMm.h * 0.94) / bboxHeightM,
  );
  const graphicScale = computeGraphicScaleBar(bboxWidthM, mapBoxMm.w);

  const statistics = computeEnterpriseStatistics(
    input.blocks,
    input.project,
    emittedAt,
  );

  const utmBounds = computeGeographicBounds(
    fit.originE,
    fit.originN,
    rotatedBbox,
    input.project,
  );
  const geometryBounds = computeGeographicBoundsFromBlocks(input.blocks);
  const geographicBounds = geometryBounds ?? utmBounds;

  return {
    lots,
    streets,
    quadraLabels,
    bbox: fit.bbox,
    rotatedBbox,
    rotationDeg,
    mapScaleMmPerM,
    graphicScale,
    statistics,
    pageSizeMm,
    mapBoxMm,
    sidePanelMm,
    originE: fit.originE,
    originN: fit.originN,
    geographicBounds,
  };
}

/** Converte ponto local (metros) para mm no PDF. */
export function projectEnterprisePointToPdf(
  point: [number, number],
  layout: EnterpriseOverviewLayout,
): [number, number] {
  const { rotatedBbox, mapBoxMm, mapScaleMmPerM } = layout;
  const rcx = (rotatedBbox.minX + rotatedBbox.maxX) / 2;
  const rcy = (rotatedBbox.minY + rotatedBbox.maxY) / 2;
  const pdfX = mapBoxMm.x + mapBoxMm.w / 2 + (point[0] - rcx) * mapScaleMmPerM;
  const pdfY = mapBoxMm.y + mapBoxMm.h / 2 - (point[1] - rcy) * mapScaleMmPerM;
  return [pdfX, pdfY];
}

export function allEnterpriseLotsFitLayout(
  layout: EnterpriseOverviewLayout,
): boolean {
  if (!layout.lots.length) return false;
  const pad = 2;
  for (const lot of layout.lots) {
    for (const pt of lot.ring) {
      const [x, y] = projectEnterprisePointToPdf(pt, layout);
      if (
        x < layout.mapBoxMm.x - pad ||
        x > layout.mapBoxMm.x + layout.mapBoxMm.w + pad ||
        y < layout.mapBoxMm.y - pad ||
        y > layout.mapBoxMm.y + layout.mapBoxMm.h + pad
      ) {
        return false;
      }
    }
  }
  return true;
}
