/**
 * Dados derivados para prancha profissional (croqui, confrontantes, tabelas).
 */

import bearing from '@turf/bearing';
import { centroid, distance, booleanIntersects, nearestPointOnLine } from '@turf/turf';
import { lineString, point, polygon as turfPolygon } from '@turf/helpers';
import { createDocumentValidationCode, getValidationUrl } from '@/lib/pdfValidation';
import {
  coordinatesUnavailableMessage,
  resolveRealCoordinateRing,
} from '@/lib/lotSheetCoordinates';
import {
  azimuthFromSegmentDxDy,
  formatAzimuthDms,
} from '@/lib/azimuthFormat';
import { formatStreetDisplay } from '@/lib/streetGuide';
import { buildSideConfrontantsFromSegments } from '@/lib/lotSegmentConfrontation';
import {
  getOfficialLotSegmentTable,
  isValidSegmentDistance,
  type OfficialLotSegment,
  type OfficialLotSegmentTableResult,
} from '@/lib/officialLotMeasurements';

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
  areaLabel: string;
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

/** Tabela métrica: De | Para | Azimute | Distância | Coord. E | Coord. N */
export type LotSheetMetricRow = {
  from: string;
  to: string;
  azimute: string;
  distancia: string;
  coordE: string;
  coordN: string;
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

/** Anel UTM [Easting, Northing] → metros locais centrados no primeiro vértice. */
export function toLocalMetersFromEnRing(enRing: [number, number][]): {
  localRing: [number, number][];
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
} {
  if (!enRing.length) {
    return {
      localRing: [],
      bbox: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    };
  }
  const origin = enRing[0];
  const localRing = enRing.map(
    ([e, n]) => [e - origin[0], n - origin[1]] as [number, number],
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
  const raw = String(
    block.block_name || block.block || block.quadra || block.name || '',
  ).trim();
  if (!raw) return '';
  return raw.replace(/^0+/, '').toUpperCase();
}

function formatSketchArea(block: Record<string, unknown>): string {
  const a = block.area;
  if (a === null || a === undefined || a === '') return '';
  const n = Number(a);
  if (!Number.isFinite(n)) return '';
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

/** Origem única para alinhar todos os lotes no croqui da quadra. */
export function toSharedLocalMetersFromRings(rings: [number, number][][]): {
  localRings: [number, number][][];
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
} {
  const all: [number, number][] = rings.filter((r) => r.length >= 3).flat();
  if (!all.length) {
    return {
      localRings: [],
      bbox: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    };
  }
  const origin: [number, number] = [all[0][0], all[0][1]];
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((origin[0] * Math.PI) / 180);

  const localRings = rings.map((ring) =>
    ring.map(
      ([lat, lng]) =>
        [(lng - origin[1]) * mPerDegLng, (lat - origin[0]) * mPerDegLat] as [
          number,
          number,
        ],
    ),
  );

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const ring of localRings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) {
    return {
      localRings,
      bbox: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    };
  }
  return { localRings, bbox: { minX, maxX, minY, maxY } };
}

function findNearbyBlocks(
  target: Record<string, unknown>,
  allBlocks: Record<string, unknown>[],
  targetId: string,
  maxMeters: number,
): Record<string, unknown>[] {
  const targetRing = latLngRingFromBlock(target);
  if (targetRing.length < 3) return [target];

  const targetPoly = turfPolygon([
    targetRing.map(([lat, lng]) => [lng, lat]),
  ]);
  const targetC = centroid(targetPoly);

  const nearby: Record<string, unknown>[] = [target];
  for (const b of allBlocks) {
    if (String(b.id) === targetId) continue;
    const ring = latLngRingFromBlock(b);
    if (ring.length < 3) continue;
    try {
      const otherPoly = turfPolygon([ring.map(([lat, lng]) => [lng, lat])]);
      const d = distance(targetC, centroid(otherPoly), { units: 'meters' });
      if (d <= maxMeters) nearby.push(b);
    } catch {
      /* ignore */
    }
  }
  return nearby;
}

function blocksForQuadraSketch(
  targetId: string,
  targetBlock: Record<string, unknown>,
  allBlocks: Record<string, unknown>[],
): Record<string, unknown>[] {
  const quadraKey = normalizeQuadra(targetBlock);
  let list: Record<string, unknown>[] = [];

  if (quadraKey) {
    list = allBlocks.filter((b) => normalizeQuadra(b) === quadraKey);
  }

  if (list.length < 2) {
    list = findNearbyBlocks(targetBlock, allBlocks, targetId, 120);
  }

  const withGeom = list.filter((b) => latLngRingFromBlock(b).length >= 3);
  if (withGeom.length) return withGeom;

  const selfRing = latLngRingFromBlock(targetBlock);
  return selfRing.length >= 3 ? [targetBlock] : [];
}

/** Índice da aresta de frente no anel (para posicionar número do lote). */
export function findFrontEdgeIndex(
  localRing: [number, number][],
  block: Record<string, unknown>,
  streetGuides: Record<string, unknown>[],
  latLngRing: [number, number][],
): number {
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
  const n = verts.length;
  if (n < 3) return 0;

  const frontStreetId = String(block.front_street_id || '').trim();
  let bestIdx = -1;
  let bestDist = Infinity;

  if (latLngRing.length >= 3) {
    const targetPoly = turfPolygon([
      latLngRing.map(([lat, lng]) => [lng, lat]),
    ]);
    const targetC = centroid(targetPoly);
    const tc = targetC.geometry.coordinates as [number, number];

    const guidePasses = [
      frontStreetId
        ? streetGuides.filter((g) => String(g.id) === frontStreetId)
        : [],
      streetGuides,
    ];

    for (const pass of guidePasses) {
      for (const g of pass) {
      const line = streetGuideToLine(g);
      if (!line) continue;
      try {
        const np = nearestPointOnLine(line, point(tc));
        const streetPt = np.geometry.coordinates as [number, number];
        for (let i = 0; i < n; i++) {
          const p1 = verts[i];
          const p2 = verts[(i + 1) % n];
          const midLocal = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2] as [
            number,
            number,
          ];
          const midLat = latLngRing[i]
            ? [
                (latLngRing[i][0] + latLngRing[(i + 1) % latLngRing.length][0]) /
                  2,
                (latLngRing[i][1] + latLngRing[(i + 1) % latLngRing.length][1]) /
                  2,
              ]
            : [0, 0];
          const midLngLat = [midLat[1], midLat[0]] as [number, number];
          const d = distance(point(midLngLat), point(streetPt), {
            units: 'meters',
          });
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
      } catch {
        /* ignore */
      }
      }
      if (bestIdx >= 0 && bestDist < 80) break;
    }
  }

  if (bestIdx >= 0 && bestDist < 80) return bestIdx;

  let longest = 0;
  let longestIdx = 0;
  let lowestMidY = Infinity;
  let lowestIdx = 0;

  for (let i = 0; i < n; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % n];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const midY = (p1[1] + p2[1]) / 2;
    if (len > longest) {
      longest = len;
      longestIdx = i;
    }
    if (midY < lowestMidY) {
      lowestMidY = midY;
      lowestIdx = i;
    }
  }

  return longest > 0 ? longestIdx : lowestIdx;
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

/** Confrontantes por lado do lote (vizinho por segmento; frente = logradouro). */
export function buildSideConfrontants(
  block: Record<string, unknown>,
  targetId: string,
  targetRing: [number, number][],
  blocks: Record<string, unknown>[],
  streetGuides: Record<string, unknown>[],
): LotSheetSideConfrontants {
  return buildSideConfrontantsFromSegments(
    block,
    targetId,
    targetRing,
    blocks,
    streetGuides,
  );
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
  const blockList = blocksForQuadraSketch(targetId, targetBlock, allBlocks);
  const pairs = blockList
    .map((b) => ({ block: b, ring: latLngRingFromBlock(b) }))
    .filter((p) => p.ring.length >= 3);

  if (!pairs.length) return null;

  const { localRings, bbox } = toSharedLocalMetersFromRings(
    pairs.map((p) => p.ring),
  );
  const lots: LotSheetSketchLot[] = [];

  pairs.forEach((p, idx) => {
    if (!localRings[idx]?.length) return;
    lots.push({
      id: String(p.block.id),
      number: String(p.block.number || p.block.lot || '—'),
      localRing: localRings[idx],
      isSelected: String(p.block.id) === targetId,
      areaLabel: formatSketchArea(p.block),
    });
  });

  if (!lots.length) return null;

  console.log('LOT_SHEET_BLOCK_SKETCH', {
    quadra: quadra || 'proximidade',
    lots: lots.length,
    selected: targetId,
  });

  return {
    quadra: quadra || '—',
    lots,
    bbox,
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

/** Vértices da tabela com coordenadas UTM oficiais do TXT. */
export function buildVertexTableFromOfficialSegments(
  segments: OfficialLotSegment[],
): LotSheetVertexRow[] {
  return segments.map((s, i) => ({
    vertex: i + 1,
    norte: formatCoordMeters(s.north),
    este: formatCoordMeters(s.east),
  }));
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

function formatAzimuth(deg: number): string {
  return formatAzimuthDms(deg);
}

function formatCoordValue(val: number): string {
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function vertexMarker(i: number): string {
  return `M-${String(i + 1).padStart(2, '0')}`;
}

export function buildMetricTable(
  block: Record<string, unknown>,
  localRing: [number, number][],
  project?: Record<string, unknown> | null,
): { rows: LotSheetMetricRow[]; coordinatesAvailable: boolean } {
  const rows: LotSheetMetricRow[] = [];
  const real = resolveRealCoordinateRing(block, project);
  const unavailableMsg = coordinatesUnavailableMessage();

  const localVerts: [number, number][] = [];
  for (const p of localRing) {
    const last = localVerts[localVerts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) {
      localVerts.push(p);
    }
  }
  if (localVerts.length > 2) {
    const f = localVerts[0];
    const l = localVerts[localVerts.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.01) localVerts.pop();
  }

  const coordVerts = real.available ? real.ring : localVerts;
  const n = Math.max(localVerts.length, coordVerts.length);
  if (n < 2) return { rows, coordinatesAvailable: real.available };

  const edgeCount = localVerts.length >= 2 ? localVerts.length : coordVerts.length;

  for (let i = 0; i < edgeCount; i++) {
    const p1 = localVerts[i] ?? localVerts[0];
    const p2 = localVerts[(i + 1) % localVerts.length] ?? p1;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01 && !real.available) continue;
    if (!isValidSegmentDistance(dist)) {
      console.log('INVALID_OFFICIAL_DISTANCE', {
        reason: 'geometry_metric_fallback_rejected',
        edgeIndex: i,
        rejectedAs: dist,
      });
      continue;
    }

    const c2 = coordVerts[(i + 1) % coordVerts.length] ?? coordVerts[0];
    const j = (i + 1) % edgeCount;

    rows.push({
      from: vertexMarker(i),
      to: vertexMarker(j),
      azimute: formatAzimuth(azimuthFromSegmentDxDy(dx, dy)),
      distancia: `${dist.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`,
      coordE: real.available
        ? formatCoordValue(c2[0])
        : unavailableMsg,
      coordN: real.available ? formatCoordValue(c2[1]) : '—',
    });
    if (rows.length >= 20) break;
  }

  return { rows, coordinatesAvailable: real.available };
}

export function segmentTableToMemorialRows(
  table: OfficialLotSegmentTableResult,
): LotSheetSegmentRow[] {
  return table.validRows.slice(0, 16).map((row) => ({
    segment: `${row.de}-${row.para}`,
    azimute: row.azimute,
    distancia: row.distancia,
  }));
}

export function segmentTableToMetricRows(
  table: OfficialLotSegmentTableResult,
): LotSheetMetricRow[] {
  return table.validRows.slice(0, 20).map((row) => ({
    from: row.de,
    to: row.para,
    azimute: row.azimute,
    distancia: row.distancia,
    coordE: row.coordE,
    coordN: row.coordN,
  }));
}

/** Memorial: segmentos oficiais TXT via getOfficialLotSegmentTable. */
export function buildSegmentTableFromOfficial(
  block: Record<string, unknown>,
): LotSheetSegmentRow[] | null {
  const table = getOfficialLotSegmentTable(block);
  if (table.validRows.length < 2) return null;
  return segmentTableToMemorialRows(table);
}

/** Memorial métrico oficial (mesma fonte que popup/prancha). */
export function buildMetricTableFromOfficial(
  block: Record<string, unknown>,
  project?: Record<string, unknown> | null,
): { rows: LotSheetMetricRow[]; coordinatesAvailable: boolean } | null {
  const table = getOfficialLotSegmentTable(block, project);
  if (table.validRows.length < 2) return null;
  return {
    rows: segmentTableToMetricRows(table),
    coordinatesAvailable: table.coordinatesAvailable,
  };
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
    if (!isValidSegmentDistance(dist)) {
      console.log('INVALID_OFFICIAL_DISTANCE', {
        reason: 'geometry_segment_fallback_rejected',
        edgeIndex: i,
        rejectedAs: dist,
      });
      continue;
    }
    const j = (i + 1) % verts.length;
    rows.push({
      segment: `${i + 1}-${j + 1}`,
      azimute: formatAzimuth(azimuthFromSegmentDxDy(dx, dy)),
      distancia: `${dist.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`,
    });
    if (rows.length >= 16) break;
  }
  return rows;
}
