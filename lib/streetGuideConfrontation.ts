/**
 * Confrontante por proximidade a linha de rua nomeada (street_guides).
 */

import { formatStreetDisplay } from '@/lib/streetGuide';
import { normalizeLotGeometry } from '@/lib/lotGeometryNormalize';
import { scoreSegmentStreetProximity } from '@/lib/lotStreetFrontDetection';
import type { Segment } from '@/utils/calculateLotDimensions';

/** Tolerância padrão (m) — segmento da aresta próximo/paralelo à linha de rua. */
export const STREET_GUIDE_CONFRONT_TOLERANCE_M = 0.35;

export type StreetGuideConfrontInput = {
  id?: string;
  name?: string | null;
  type?: string | null;
  active?: boolean | null;
  geometry?: { coordinates?: number[][] };
  geometry_geojson?: { coordinates?: number[][] };
};

function guideCoords(g: StreetGuideConfrontInput): number[][] | null {
  const geo = g.geometry_geojson || g.geometry;
  const coords = geo?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return coords;
}

/**
 * Nome da rua mais próxima ao segmento UTM (p1/p2 em metros locais ou lng/lat conforme ring).
 * Retorna null se nenhuma linha estiver dentro da tolerância.
 */
export function confrontantFromStreetGuidesForSegment(
  p1LngLat: [number, number],
  p2LngLat: [number, number],
  guides: StreetGuideConfrontInput[],
  toleranceM: number = STREET_GUIDE_CONFRONT_TOLERANCE_M,
): { label: string; guideId?: string; source: 'street_guide' } | null {
  let bestLabel: string | null = null;
  let bestGuideId: string | undefined;
  let bestDist = Infinity;

  for (const g of guides) {
    if (g.active === false) continue;
    const coords = guideCoords(g);
    if (!coords) continue;

    const score = scoreSegmentStreetProximity(p1LngLat, p2LngLat, coords);
    if (score.minDistM > toleranceM) continue;
    if (score.parallelVarianceM > toleranceM * 4) continue;

    const name = formatStreetDisplay(g.type, g.name);
    if (!name || /sem nome/i.test(name)) continue;

    if (score.minDistM < bestDist) {
      bestDist = score.minDistM;
      bestLabel = name;
      bestGuideId = g.id != null ? String(g.id) : undefined;
    }
  }

  if (!bestLabel) return null;
  return { label: bestLabel, guideId: bestGuideId, source: 'street_guide' };
}

/** Aresta do polígono WGS84 correspondente ao segmento UTM (via originalIndex). */
export function lngLatEdgeFromUtmSegment(
  seg: Segment,
  block: Record<string, unknown>,
): { p1: [number, number]; p2: [number, number] } | null {
  const geom = normalizeLotGeometry(block);
  if (!geom.ok || geom.ring.length < 3) return null;
  const ring = geom.ring;
  const n = ring.length;
  const i = Math.min(Math.max(0, seg.originalIndex), n - 2);
  const a = ring[i];
  const b = ring[(i + 1) % (n - 1)];
  if (!a || !b) return null;
  return {
    p1: [a[1], a[0]],
    p2: [b[1], b[0]],
  };
}

/** Segmento UTM + geometria do lote → confrontante por linha de rua nomeada. */
export function confrontantFromStreetGuidesForUtmSegment(
  seg: Segment,
  block: Record<string, unknown>,
  guides: StreetGuideConfrontInput[],
  toleranceM?: number,
): { label: string; guideId?: string; source: 'street_guide' } | null {
  const edge = lngLatEdgeFromUtmSegment(seg, block);
  if (!edge) return null;
  return confrontantFromStreetGuidesForSegment(
    edge.p1,
    edge.p2,
    guides,
    toleranceM,
  );
}
