/**
 * Dados derivados para prancha profissional (croqui, confrontantes, tabelas).
 */

import bearing from '@turf/bearing';
import { centroid, distance, booleanIntersects, nearestPointOnLine } from '@turf/turf';
import { lineString, point, polygon as turfPolygon } from '@turf/helpers';
import { createDocumentValidationCode, getValidationUrl } from '@/lib/pdfValidation';
import { formatStreetDisplay } from '@/lib/streetGuide';

export type CardinalDirection = 'NORTE' | 'SUL' | 'LESTE' | 'OESTE';

export type LotSheetCardinalConfrontant = {
  direction: CardinalDirection;
  label: string;
};

export type LotSheetSketchLot = {
  id: string;
  number: string;
  localRing: [number, number][];
  isSelected: boolean;
};

export type LotSheetBlockSketch = {
  quadra: string;
  lots: LotSheetSketchLot[];
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
};

export type LotSheetProjectMapLot = {
  id: string;
  number: string;
  localRing: [number, number][];
  isSelected: boolean;
};

export type LotSheetVertexRow = {
  vertex: number;
  norte: string;
  este: string;
};

export type LotSheetSegmentRow = {
  segment: string;
  azimute: string;
  distancia: string;
};

export const LOT_SHEET_VERSION = '1.0';

export function createLotSheetValidation(): {
  code: string;
  url: string;
  emittedAt: string;
} {
  const code = createDocumentValidationCode();
  return {
    code,
    url: getValidationUrl(code),
    emittedAt: new Date().toISOString(),
  };
}

export function latLngRingFromBlock(block: Record<string, unknown>): [number, number][] {
  const geom = block.geometry as { type?: string; coordinates?: number[][][] } | undefined;
  if (geom?.type === 'Polygon' && geom.coordinates?.[0]?.length) {
    const ring = geom.coordinates[0].map((c) => [c[1], c[0]] as [number, number]);
    if (ring.length > 1) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    }
    return ring;
  }
  const bounds = block.bounds as [number, number][] | undefined;
  if (bounds?.length) {
    const ring = [...bounds];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    return ring;
  }
  return [];
}

export function toLocalMetersFromRing(ring: [number, number][]): {
  localRing: [number, number][];
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
} {
  if (!ring.length) {
    return {
      localRing: [],
      bbox: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    };
  }
  const origin = ring[0];
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((origin[0] * Math.PI) / 180);
  const localRing = ring.map(
    ([lat, lng]) =>
      [(lng - origin[1]) * mPerDegLng, (lat - origin[0]) * mPerDegLat] as [number, number],
  );

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of localRing) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { localRing, bbox: { minX, maxX, minY, maxY } };
}

function normalizeQuadra(block: Record<string, unknown>): string {
  return String(block.block_name || block.block || block.quadra || '').trim();
}

function bearingToCardinal(deg: number): CardinalDirection {
  const b = ((deg % 360) + 360) % 360;
  if (b >= 315 || b < 45) return 'NORTE';
  if (b >= 45 && b < 135) return 'LESTE';
  if (b >= 135 && b < 225) return 'SUL';
  return 'OESTE';
}

function streetGuideToLine(
  guide: Record<string, unknown>,
): ReturnType<typeof lineString> | null {
  const geo = guide.geometry_geojson as {
    type?: string;
    coordinates?: number[][];
  } | null;
  if (!geo?.coordinates?.length) return null;
  if (geo.type === 'LineString') {
    return lineString(geo.coordinates);
  }
  if (geo.type === 'MultiLineString' && geo.coordinates[0]) {
    return lineString(geo.coordinates[0]);
  }
  return null;
}

function detectStreetDirection(
  targetRing: [number, number][],
  guides: Record<string, unknown>[],
): { direction: CardinalDirection; name: string } | null {
  if (!targetRing.length || !guides.length) return null;

  const targetPoly = turfPolygon([targetRing.map(([lat, lng]) => [lng, lat])]);
  const targetC = centroid(targetPoly);
  const tc = targetC.geometry.coordinates as [number, number];

  let best: { direction: CardinalDirection; name: string; dist: number } | null = null;

  for (const g of guides) {
    const line = streetGuideToLine(g);
    if (!line) continue;
    try {
      const np = nearestPointOnLine(line, point(tc));
      const nc = np.geometry.coordinates as [number, number];
      const brg = bearing(point(tc), point(nc));
      const dir = bearingToCardinal(brg);
      const dist = distance(point(tc), point(nc), { units: 'meters' });
      if (dist > 80) continue;
      const name = formatStreetDisplay(g.type as string, g.name as string);
      if (!best || dist < best.dist) {
        best = { direction: dir, name, dist };
      }
    } catch {
      /* ignore */
    }
  }

  return best ? { direction: best.direction, name: best.name } : null;
}

const OPPOSITE_CARDINAL: Record<CardinalDirection, CardinalDirection> = {
  NORTE: 'SUL',
  SUL: 'NORTE',
  LESTE: 'OESTE',
  OESTE: 'LESTE',
};

const RIGHT_CARDINAL: Record<CardinalDirection, CardinalDirection> = {
  NORTE: 'LESTE',
  LESTE: 'SUL',
  SUL: 'OESTE',
  OESTE: 'NORTE',
};

const LEFT_CARDINAL: Record<CardinalDirection, CardinalDirection> = {
  NORTE: 'OESTE',
  OESTE: 'SUL',
  SUL: 'LESTE',
  LESTE: 'NORTE',
};

export type LotSheetSideConfrontants = {
  frente: string;
  fundo: string;
  ladoDireito: string;
  ladoEsquerdo: string;
};

/** Confrontantes por lado do lote (frente = logradouro). */
export function buildSideConfrontants(
  block: Record<string, unknown>,
  targetId: string,
  targetRing: [number, number][],
  blocks: Record<string, unknown>[],
  streetGuides: Record<string, unknown>[],
): LotSheetSideConfrontants {
  const rawFront = String(block.front_street_name || '').trim();
  const frente =
    rawFront && !/sem nome/i.test(rawFront)
      ? rawFront
      : 'Rua / via de acesso';

  const cardinals = buildCardinalConfrontants(
    targetId,
    targetRing,
    blocks,
    streetGuides,
  );
  const byDir = Object.fromEntries(
    cardinals.map((c) => [c.direction, c.label]),
  ) as Partial<Record<CardinalDirection, string>>;

  const streetHit = detectStreetDirection(targetRing, streetGuides);
  const frontDir: CardinalDirection = streetHit?.direction || 'NORTE';

  const pick = (d: CardinalDirection) => {
    const v = byDir[d];
    return v && v !== '—' ? v : '—';
  };

  return {
    frente,
    fundo: pick(OPPOSITE_CARDINAL[frontDir]),
    ladoDireito: pick(RIGHT_CARDINAL[frontDir]),
    ladoEsquerdo: pick(LEFT_CARDINAL[frontDir]),
  };
}

export function buildCardinalConfrontants(
  targetId: string,
  targetRing: [number, number][],
  blocks: Record<string, unknown>[],
  streetGuides: Record<string, unknown>[],
): LotSheetCardinalConfrontant[] {
  if (targetRing.length < 3) return [];

  const targetPoly = turfPolygon([targetRing.map(([lat, lng]) => [lng, lat])]);
  const targetC = centroid(targetPoly);
  const tc = targetC.geometry.coordinates as [number, number];

  const slot: Partial<
    Record<CardinalDirection, { label: string; dist: number }>
  > = {};

  for (const b of blocks) {
    if (String(b.id) === targetId) continue;
    const ring = latLngRingFromBlock(b);
    if (ring.length < 3) continue;
    try {
      const otherPoly = turfPolygon([ring.map(([lat, lng]) => [lng, lat])]);
      const touches =
        booleanIntersects(targetPoly, otherPoly) ||
        distance(targetC, centroid(otherPoly), { units: 'meters' }) < 40;
      if (!touches) continue;

      const oc = centroid(otherPoly).geometry.coordinates as [number, number];
      const brg = bearing(point(tc), point(oc));
      const dir = bearingToCardinal(brg);
      const dist = distance(targetC, centroid(otherPoly), { units: 'meters' });
      const num = b.number || b.lot || '?';
      const label = `Lote ${num}`;
      if (!slot[dir] || dist < slot[dir]!.dist) {
        slot[dir] = { label, dist };
      }
    } catch {
      /* ignore */
    }
  }

  const street = detectStreetDirection(targetRing, streetGuides);
  if (street) {
    const existing = slot[street.direction];
    if (!existing || existing.dist > 25) {
      slot[street.direction] = { label: street.name, dist: 0 };
    }
  }

  const order: CardinalDirection[] = ['NORTE', 'LESTE', 'SUL', 'OESTE'];
  return order.map((direction) => ({
    direction,
    label: slot[direction]?.label || '—',
  }));
}

export function buildBlockSketch(
  targetId: string,
  targetBlock: Record<string, unknown>,
  allBlocks: Record<string, unknown>[],
): LotSheetBlockSketch | null {
  const quadra = normalizeQuadra(targetBlock);
  const sameQuadra = allBlocks.filter((b) => {
    if (!quadra) return String(b.id) === targetId;
    return normalizeQuadra(b) === quadra;
  });

  const lots: LotSheetSketchLot[] = [];
  let globalBbox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

  for (const b of sameQuadra) {
    const ring = latLngRingFromBlock(b);
    if (ring.length < 3) continue;
    const { localRing, bbox } = toLocalMetersFromRing(ring);
    if (!localRing.length) continue;
    lots.push({
      id: String(b.id),
      number: String(b.number || b.lot || '—'),
      localRing,
      isSelected: String(b.id) === targetId,
    });
    globalBbox = {
      minX: Math.min(globalBbox.minX, bbox.minX),
      maxX: Math.max(globalBbox.maxX, bbox.maxX),
      minY: Math.min(globalBbox.minY, bbox.minY),
      maxY: Math.max(globalBbox.maxY, bbox.maxY),
    };
  }

  if (!lots.length) return null;
  if (!Number.isFinite(globalBbox.minX)) {
    globalBbox = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }

  return {
    quadra: quadra || '—',
    lots,
    bbox: globalBbox,
  };
}

export function buildProjectMap(
  targetId: string,
  allBlocks: Record<string, unknown>[],
): LotSheetProjectMapLot[] {
  const lots: LotSheetProjectMapLot[] = [];
  for (const b of allBlocks) {
    const ring = latLngRingFromBlock(b);
    if (ring.length < 3) continue;
    const { localRing } = toLocalMetersFromRing(ring);
    if (!localRing.length) continue;
    lots.push({
      id: String(b.id),
      number: String(b.number || b.lot || ''),
      localRing,
      isSelected: String(b.id) === targetId,
    });
  }
  return lots;
}

function formatCoordMeters(val: number): string {
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function buildVertexTable(localRing: [number, number][]): LotSheetVertexRow[] {
  const verts: [number, number][] = [];
  for (const p of localRing) {
    const last = verts[verts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) {
      verts.push(p);
    }
  }
  if (verts.length > 2) {
    const first = verts[0];
    const last = verts[verts.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.01) {
      verts.pop();
    }
  }

  return verts.map((p, i) => ({
    vertex: i + 1,
    norte: formatCoordMeters(p[1]),
    este: formatCoordMeters(p[0]),
  }));
}

function azimuthFromSegment(dx: number, dy: number): number {
  const rad = Math.atan2(dx, dy);
  return ((rad * 180) / Math.PI + 360) % 360;
}

function formatAzimuth(deg: number): string {
  const d = Math.floor(deg);
  const min = Math.round((deg - d) * 60);
  return `${String(d).padStart(3, '0')}°${String(min).padStart(2, '0')}'`;
}

export function buildSegmentTable(localRing: [number, number][]): LotSheetSegmentRow[] {
  const rows: LotSheetSegmentRow[] = [];
  const verts: [number, number][] = [];
  for (const p of localRing) {
    const last = verts[verts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) verts.push(p);
  }
  if (verts.length > 2) {
    const f = verts[0];
    const l = verts[verts.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.01) verts.pop();
  }
  if (verts.length < 2) return rows;

  for (let i = 0; i < verts.length; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % verts.length];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) continue;
    const j = (i + 1) % verts.length;
    rows.push({
      segment: `${i + 1}-${j + 1}`,
      azimute: formatAzimuth(azimuthFromSegment(dx, dy)),
      distancia: `${dist.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`,
    });
    if (rows.length >= 16) break;
  }
  return rows;
}
