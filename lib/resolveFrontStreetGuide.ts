/**
 * Vincula a frente oficial do lote à linha de rua nomeada (street_guides).
 */

import { formatStreetDisplay } from '@/lib/streetGuide';
import { normalizeLotGeometry } from '@/lib/lotGeometryNormalize';
import {
  asStreetGuideList,
  confrontantFromStreetGuidesForSegment,
  confrontantFromStreetGuidesForUtmSegment,
  flattenLineStringCoordinates,
  lngLatEdgeFromUtmSegment,
  STREET_GUIDE_LOT_FRONT_TOLERANCE_M,
  type StreetGuideConfrontInput,
} from '@/lib/streetGuideConfrontation';
import distance from '@turf/distance';
import { point } from '@turf/helpers';
import { scoreSegmentStreetProximity } from '@/lib/lotStreetFrontDetection';
import {
  getOfficialConfrontationRing,
  planarBearingDeg,
  planarDistanceM,
  utmRingToClosedCoords,
} from '@/lib/officialConfrontationRing';
import { mergeCurvedSegments, type Segment } from '@/utils/calculateLotDimensions';

export { STREET_GUIDE_LOT_FRONT_TOLERANCE_M };

function extractUtmSegmentsLocal(
  coords: number[][],
  allPolys: number[][][],
): Segment[] {
  const segments: Segment[] = [];
  if (!Array.isArray(coords) || coords.length < 2) return segments;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const length = planarDistanceM(p1, p2);
    if (length < 0.5) continue;
    segments.push({
      p1,
      p2,
      length,
      azimuth: planarBearingDeg(p1, p2),
      originalIndex: i,
      isExternal: true,
    });
  }
  for (const seg of segments) {
    let matched = false;
    for (const other of allPolys) {
      if (other === coords) continue;
      for (let j = 0; j < other.length - 1; j++) {
        const d1 = planarDistanceM(seg.p1, other[j]);
        const d2 = planarDistanceM(seg.p2, other[j + 1]);
        const d3 = planarDistanceM(seg.p1, other[j + 1]);
        const d4 = planarDistanceM(seg.p2, other[j]);
        if ((d1 < 1.0 && d2 < 1.0) || (d3 < 1.0 && d4 < 1.0)) {
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    seg.isExternal = !matched;
  }
  return segments;
}

export type FrontStreetGuideMatch = {
  streetGuideId: string | null;
  streetGuideName: string;
  streetGuideType: string | null;
  distanceM: number;
  confidence: number;
};

export type FrontStreetPersistFields = {
  front_street_id: string | null;
  front_street_name: string | null;
  front_street_type: string | null;
};

function guideCoords(g: StreetGuideConfrontInput): number[][] | null {
  const geo = g.geometry_geojson || g.geometry;
  return flattenLineStringCoordinates(geo?.coordinates);
}

function matchFromHit(
  hit: { label: string; guideId?: string },
  streetGuides: StreetGuideConfrontInput[],
  distanceM: number,
  toleranceM: number,
): FrontStreetGuideMatch {
  const guide = streetGuides.find(
    (g) => g.id != null && String(g.id) === String(hit.guideId),
  );
  const type = guide?.type != null ? String(guide.type) : 'Rua';
  const tol = Math.max(toleranceM, 0.01);
  const confidence = Math.max(0, Math.min(1, 1 - distanceM / tol));
  return {
    streetGuideId: hit.guideId ?? null,
    streetGuideName: hit.label,
    streetGuideType: type,
    distanceM,
    confidence,
  };
}

/** Anel [lat,lng] sem vértice de fechamento duplicado. */
function openLatLngVerts(ring: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-9) {
      out.push(p);
    }
  }
  if (out.length > 2) {
    const f = out[0];
    const l = out[out.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-9) out.pop();
  }
  return out;
}

/**
 * Aresta WGS84 do polígono do lote — mesmo índice usado em "Corrigir frente" no mapa.
 * front_segment_index é índice de aresta no anel lat/lng, não segment_index UTM.
 */
export function lngLatEdgeAtRingIndex(
  block: Record<string, unknown>,
  edgeIndex: number,
): { p1: [number, number]; p2: [number, number] } | null {
  const geom = normalizeLotGeometry(block);
  if (!geom.ok || geom.ring.length < 3) return null;
  const verts = openLatLngVerts(geom.ring);
  const n = verts.length;
  if (n < 2 || edgeIndex < 0) return null;
  const i = edgeIndex % n;
  const a = verts[i];
  const b = verts[(i + 1) % n];
  return {
    p1: [a[1], a[0]],
    p2: [b[1], b[0]],
  };
}

/** Melhor aresta do anel WGS84 próxima a alguma street_guide (quando front_segment_index ausente). */
export function detectFrontEdgeIndexFromGuides(
  block: Record<string, unknown>,
  streetGuides: StreetGuideConfrontInput[],
  toleranceM: number,
): { edgeIndex: number; distanceM: number } | null {
  const guides = asStreetGuideList(streetGuides);
  const geom = normalizeLotGeometry(block);
  if (!geom.ok) return null;
  const verts = openLatLngVerts(geom.ring);
  const n = verts.length;
  if (n < 2) return null;

  let bestEdge = -1;
  let bestDist = Infinity;

  for (let i = 0; i < n; i++) {
    const p1: [number, number] = [verts[i][1], verts[i][0]];
    const p2: [number, number] = [
      verts[(i + 1) % n][1],
      verts[(i + 1) % n][0],
    ];
    for (const g of guides) {
      if (g.active === false) continue;
      const coords = guideCoords(g);
      if (!coords) continue;
      const name = formatStreetDisplay(g.type, g.name);
      if (!name || /sem nome/i.test(name)) continue;
      const sc = scoreSegmentStreetProximity(p1, p2, coords);
      if (sc.minDistM > toleranceM) continue;
      if (sc.parallelVarianceM > toleranceM * 4) continue;
      if (sc.minDistM < bestDist) {
        bestDist = sc.minDistM;
        bestEdge = i;
      }
    }
  }

  if (bestEdge < 0) return null;
  return { edgeIndex: bestEdge, distanceM: bestDist };
}

function matchGuideAtWgs84RingEdge(
  block: Record<string, unknown>,
  streetGuides: StreetGuideConfrontInput[],
  ringEdgeIndex: number,
  toleranceM: number,
): FrontStreetGuideMatch | null {
  const edge = lngLatEdgeAtRingIndex(block, ringEdgeIndex);
  if (!edge) return null;

  const hit = confrontantFromStreetGuidesForSegment(
    edge.p1,
    edge.p2,
    streetGuides,
    toleranceM,
  );
  if (!hit?.label) return null;

  const p1: [number, number] = edge.p1;
  const p2: [number, number] = edge.p2;
  let dist = Infinity;
  for (const g of asStreetGuideList(streetGuides)) {
    const coords = guideCoords(g);
    if (!coords) continue;
    const sc = scoreSegmentStreetProximity(p1, p2, coords);
    if (sc.minDistM < dist) dist = sc.minDistM;
  }

  return matchFromHit(hit, streetGuides, dist, toleranceM);
}

/**
 * Lê front_segment_index bruto do block.
 * Pode ser aresta WGS84 (clique no mapa) ou segment_index UTM (seletor TXT).
 */
export function readStoredFrontSegmentIndex(
  block: Record<string, unknown>,
): number {
  if (
    typeof block.front_segment_index === 'number' &&
    block.front_segment_index >= 0
  ) {
    return block.front_segment_index;
  }
  const alt = block.frontSegmentIndex;
  return typeof alt === 'number' && alt >= 0 ? alt : -1;
}

/** Índice no array mergeCurvedSegments (UTM) para a frente oficial. */
export function resolveFrontUtmMergedSegmentIndex(
  block: Record<string, unknown>,
  segments: Segment[],
): number {
  const stored = readStoredFrontSegmentIndex(block);
  if (stored < 0 || !segments.length) return -1;

  const byWgs = matchMergedSegmentIndexToWgs84RingEdge(block, segments, stored);
  if (byWgs >= 0) return byWgs;

  const byOriginal = segments.findIndex((s) => s.originalIndex === stored);
  if (byOriginal >= 0) return byOriginal;

  if (stored < segments.length) return stored;

  return -1;
}

/**
 * Resolve segment_index UTM oficial a partir de front_segment_index
 * (WGS84 ou UTM).
 */
export function resolveStoredFrontAsOfficialSegmentIndex(
  block: Record<string, unknown>,
  officialSegments: Array<{ segment_index: number }>,
): number | null {
  const stored = readStoredFrontSegmentIndex(block);
  if (stored < 0 || !officialSegments.length) return null;

  if (officialSegments.some((s) => s.segment_index === stored)) {
    return stored;
  }

  const official = getOfficialConfrontationRing(block);
  if (official.ok) {
    const coords = utmRingToClosedCoords(official.ring);
    if (coords.length >= 4) {
      const merged = mergeCurvedSegments(
        extractUtmSegmentsLocal(coords, []),
        20,
      );
      const mergedIdx = resolveFrontUtmMergedSegmentIndex(block, merged);
      if (mergedIdx >= 0) {
        const origIdx = merged[mergedIdx]?.originalIndex;
        if (
          typeof origIdx === 'number' &&
          officialSegments.some((s) => s.segment_index === origIdx)
        ) {
          return origIdx;
        }
      }
    }
  }

  if (stored < officialSegments.length) {
    return officialSegments[stored]?.segment_index ?? null;
  }

  return null;
}

/**
 * Índice de aresta WGS84 no anel lat/lng — usado no mapa e labels.
 */
export function resolveFrontWgs84RingIndex(
  block: Record<string, unknown>,
  mergedUtmSegments?: Segment[],
): number {
  const stored = readStoredFrontSegmentIndex(block);
  if (stored < 0) return -1;

  const geom = normalizeLotGeometry(block);
  if (!geom.ok || geom.ring.length < 3) return stored;

  const verts = openLatLngVerts(geom.ring);
  const n = verts.length;

  let merged = mergedUtmSegments;
  if (!merged?.length) {
    const official = getOfficialConfrontationRing(block);
    if (official.ok) {
      const coords = utmRingToClosedCoords(official.ring);
      if (coords.length >= 4) {
        merged = mergeCurvedSegments(
          extractUtmSegmentsLocal(coords, []),
          20,
        );
      }
    }
  }

  if (merged?.length) {
    const byWgs = matchMergedSegmentIndexToWgs84RingEdge(block, merged, stored);
    if (byWgs >= 0) return stored;

    for (let edgeIdx = 0; edgeIdx < n; edgeIdx++) {
      const matched = matchMergedSegmentIndexToWgs84RingEdge(
        block,
        merged,
        edgeIdx,
      );
      if (matched < 0) continue;
      const seg = merged[matched];
      if (seg.originalIndex === stored || matched === stored) {
        return edgeIdx;
      }
    }
  }

  return stored;
}

/**
 * Índice do segmento UTM fundido cuja aresta WGS84 coincide com ringEdgeIndex do mapa.
 */
export function matchMergedSegmentIndexToWgs84RingEdge(
  block: Record<string, unknown>,
  segments: Segment[],
  ringEdgeIndex: number,
  maxMidpointDistM = 2,
): number {
  const targetEdge = lngLatEdgeAtRingIndex(block, ringEdgeIndex);
  if (!targetEdge || !segments.length) return -1;

  const tm: [number, number] = [
    (targetEdge.p1[0] + targetEdge.p2[0]) / 2,
    (targetEdge.p1[1] + targetEdge.p2[1]) / 2,
  ];

  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < segments.length; i++) {
    const utmEdge = lngLatEdgeFromUtmSegment(segments[i], block);
    if (!utmEdge) continue;
    const sm: [number, number] = [
      (utmEdge.p1[0] + utmEdge.p2[0]) / 2,
      (utmEdge.p1[1] + utmEdge.p2[1]) / 2,
    ];
    const d = distance(point(tm), point(sm), { units: 'meters' });
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  return bestDist <= maxMidpointDistM ? bestIdx : -1;
}

/**
 * Índice de aresta WGS84 no anel lat/lng para um segmento UTM fundido (inverso de
 * matchMergedSegmentIndexToWgs84RingEdge). Usado para colorir auditoria no mapa.
 */
export function wgs84RingEdgeForMergedSegmentIndex(
  block: Record<string, unknown>,
  segments: Segment[],
  mergedIdx: number,
  maxMidpointDistM = 2,
): number {
  if (mergedIdx < 0 || mergedIdx >= segments.length) return -1;

  const geom = normalizeLotGeometry(block);
  if (!geom.ok || geom.ring.length < 3) {
    const oi = segments[mergedIdx]?.originalIndex;
    return typeof oi === 'number' && oi >= 0 ? oi : mergedIdx;
  }

  const verts = openLatLngVerts(geom.ring);
  const n = verts.length;

  for (let edgeIdx = 0; edgeIdx < n; edgeIdx++) {
    const matched = matchMergedSegmentIndexToWgs84RingEdge(
      block,
      segments,
      edgeIdx,
      maxMidpointDistM,
    );
    if (matched === mergedIdx) return edgeIdx;
  }

  const oi = segments[mergedIdx]?.originalIndex;
  return typeof oi === 'number' && oi >= 0 ? oi : mergedIdx;
}

function resolveFromWgs84FrontEdge(
  block: Record<string, unknown>,
  streetGuides: StreetGuideConfrontInput[],
  toleranceM: number,
): FrontStreetGuideMatch | null {
  const storedIdx = resolveFrontWgs84RingIndex(block);

  if (storedIdx >= 0) {
    const fromStored = matchGuideAtWgs84RingEdge(
      block,
      streetGuides,
      storedIdx,
      toleranceM,
    );
    if (fromStored) return fromStored;
  }

  const detected = detectFrontEdgeIndexFromGuides(
    block,
    streetGuides,
    toleranceM,
  );
  if (!detected) return null;

  return matchGuideAtWgs84RingEdge(
    block,
    streetGuides,
    detected.edgeIndex,
    toleranceM,
  );
}

function readSegmentsJsonArray(block: Record<string, unknown>): unknown[] | null {
  const raw = block.segments_json;
  if (Array.isArray(raw) && raw.length >= 2) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length >= 2) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

/** Confrontante textual no segmento oficial da frente (segments_json). */
export function confrontantNameFromFrontSegmentJson(
  block: Record<string, unknown>,
): string | null {
  const raw = readSegmentsJsonArray(block);
  if (!raw) return null;

  const officialSegments = raw.map((row, i) => {
    const s = row as Record<string, unknown>;
    return {
      segment_index:
        typeof s.segment_index === 'number' ? s.segment_index : i,
    };
  });
  const resolvedIdx = resolveStoredFrontAsOfficialSegmentIndex(
    block,
    officialSegments,
  );
  if (resolvedIdx == null) return null;

  const item = raw.find((row, i) => {
    if (row == null || typeof row !== 'object') return false;
    const s = row as Record<string, unknown>;
    const idx =
      typeof s.segment_index === 'number' ? s.segment_index : i;
    return idx === resolvedIdx;
  }) as Record<string, unknown> | undefined;

  if (!item) return null;
  const candidates = [
    item.confrontante,
    item.confronting,
    item.street_name,
    item.logradouro,
    item.street,
  ];
  for (const c of candidates) {
    const t = String(c ?? '').trim();
    if (t && !/sem nome/i.test(t)) return t;
  }
  return null;
}

function extractFrontUtmSegment(
  block: Record<string, unknown>,
  allPolysUtm: number[][][],
): Segment | null {
  const official = getOfficialConfrontationRing(block);
  if (!official.ok) return null;
  const coords = utmRingToClosedCoords(official.ring);
  if (coords.length < 4) return null;
  const segments = mergeCurvedSegments(
    extractUtmSegmentsLocal(coords, allPolysUtm),
    20,
  );
  if (!segments.length) return null;

  const frontIndex = resolveFrontUtmMergedSegmentIndex(block, segments);
  if (frontIndex < 0) return null;
  return segments[frontIndex] ?? null;
}

/**
 * Detecta a street_guide mais próxima da frente oficial (anel WGS84 do mapa).
 */
export function resolveFrontStreetGuideForLot(
  block: Record<string, unknown>,
  streetGuides: StreetGuideConfrontInput[],
  toleranceM: number = STREET_GUIDE_LOT_FRONT_TOLERANCE_M,
): FrontStreetGuideMatch | null {
  if (!streetGuides.length) return null;

  const wgs = resolveFromWgs84FrontEdge(block, streetGuides, toleranceM);
  if (wgs) return wgs;

  const official = getOfficialConfrontationRing(block);
  const allPolysUtm = official.ok
    ? [utmRingToClosedCoords(official.ring)]
    : [];
  const frontSeg = extractFrontUtmSegment(block, allPolysUtm);
  if (!frontSeg) return null;

  const hit = confrontantFromStreetGuidesForUtmSegment(
    frontSeg,
    block,
    streetGuides,
    toleranceM,
  );
  if (!hit?.label) return null;

  return matchFromHit(hit, streetGuides, 0, toleranceM);
}

export function streetFieldsFromGuideMatch(
  match: FrontStreetGuideMatch | null,
): FrontStreetPersistFields {
  if (!match) {
    return {
      front_street_id: null,
      front_street_name: null,
      front_street_type: null,
    };
  }
  return {
    front_street_id: match.streetGuideId,
    front_street_name: match.streetGuideName,
    front_street_type: match.streetGuideType,
  };
}

function lotBlockFromLotLike(lot: Record<string, unknown>): Record<string, unknown> {
  return {
    ...lot,
    front_segment_index:
      lot.front_segment_index ?? lot.frontSegmentIndex ?? null,
    front_street_name: lot.front_street_name ?? lot.frontStreetName ?? null,
    front_street_type: lot.front_street_type ?? lot.frontStreetType ?? null,
    front_street_id: lot.front_street_id ?? lot.frontStreetId ?? null,
    segments_json: lot.segments_json,
    bounds: lot.bounds,
    geometry: lot.geometry,
    geometry_geojson: lot.geometry_geojson,
  };
}

function isUsableSavedStreetName(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/sem nome/i.test(t)) return false;
  if (/^rua\/eixo/i.test(t)) return false;
  if (/^a\s*definir$/i.test(t)) return false;
  return true;
}

/**
 * Nome da rua para popup — prioridade:
 * 1. front_street_name salvo
 * 2. resolveFrontStreetGuideForLot (anel WGS84 + tolerância 1 m)
 * 3. null → UI não exibe "A definir" se houver guia tocando a frente
 */
export function resolveLotFrontStreetDisplay(
  lotOrBlock: Record<string, unknown>,
  streetGuides: StreetGuideConfrontInput[] = [],
): string | null {
  const block = lotBlockFromLotLike(lotOrBlock);
  const saved = String(block.front_street_name || '').trim();
  if (isUsableSavedStreetName(saved)) {
    return formatStreetDisplay(
      block.front_street_type as string | undefined,
      saved,
    );
  }

  const match = resolveFrontStreetGuideForLot(
    block,
    streetGuides,
    STREET_GUIDE_LOT_FRONT_TOLERANCE_M,
  );
  if (match?.streetGuideName && !/sem nome/i.test(match.streetGuideName)) {
    return match.streetGuideName;
  }

  return null;
}

/** Rótulo de confrontação da frente (memorial / prancha / automático). */
export function resolveFrenteConfrontantLabel(
  block: Record<string, unknown>,
  frontSegmentIndexes: number[],
  segments: Segment[],
  streetGuides: StreetGuideConfrontInput[],
): string {
  const saved = String(block.front_street_name || '').trim();
  if (isUsableSavedStreetName(saved)) {
    return (
      formatStreetDisplay(block.front_street_type as string | undefined, saved) ||
      saved
    );
  }

  const fromGuide = resolveFrontStreetGuideForLot(
    block,
    streetGuides,
    STREET_GUIDE_LOT_FRONT_TOLERANCE_M,
  );
  if (fromGuide?.streetGuideName) return fromGuide.streetGuideName;

  for (const idx of frontSegmentIndexes) {
    const seg = segments[idx];
    if (!seg) continue;
    const fromStreet = confrontantFromStreetGuidesForUtmSegment(
      seg,
      block,
      streetGuides,
      STREET_GUIDE_LOT_FRONT_TOLERANCE_M,
    );
    if (fromStreet?.label && !/sem nome/i.test(fromStreet.label)) {
      return fromStreet.label;
    }
  }

  const fromSeg = confrontantNameFromFrontSegmentJson(block);
  if (fromSeg && !/sem nome/i.test(fromSeg)) return fromSeg;

  return 'A DEFINIR';
}
