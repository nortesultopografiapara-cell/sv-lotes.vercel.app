/**
 * Ferramenta global de medição de área no mapa GIS.
 * Área geodésica via @turf/area; distâncias/perímetro via distanceMeasure.
 */

import turfArea from '@turf/area';
import { polygon } from '@turf/helpers';
import {
  computeSegmentDistancesM,
  computeTotalDistanceM,
  formatGisDistanceM,
  haversineDistanceM,
  type GisLatLng,
} from '@/lib/gis/distanceMeasure';

/** Limite para exibir hectares em vez de m². */
export const AREA_M2_HA_THRESHOLD = 10_000;

export function formatGisAreaM2(areaM2: number): string {
  if (!Number.isFinite(areaM2)) return '—';
  const abs = Math.abs(areaM2);
  if (abs >= AREA_M2_HA_THRESHOLD) {
    const ha = areaM2 / AREA_M2_HA_THRESHOLD;
    return `${ha.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ha`;
  }
  return `${areaM2.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;
}

export function gisPointsToLngLatRing(points: GisLatLng[]): [number, number][] {
  return points.map((p) => [p.lng, p.lat]);
}

/** Anel fechado GeoJSON [lng,lat] para Turf (mín. 3 vértices únicos). */
export function buildAreaPolygonRing(
  points: GisLatLng[],
  options: { finalized: boolean; cursor?: GisLatLng | null },
): [number, number][] | null {
  const { finalized, cursor } = options;
  const verts: GisLatLng[] = [...points];
  if (!finalized && cursor) verts.push(cursor);
  if (verts.length < 3) return null;

  const ring = gisPointsToLngLatRing(verts);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

export function computeGeodesicAreaM2(
  points: GisLatLng[],
  finalized: boolean,
  cursor: GisLatLng | null = null,
): number | null {
  const ring = buildAreaPolygonRing(points, {
    finalized,
    cursor: finalized ? null : cursor,
  });
  if (!ring || ring.length < 4) return null;
  return turfArea(polygon([ring]));
}

export type AreaSide = {
  index: number;
  distanceM: number;
  panelLabel: string;
};

export function buildAreaSides(
  points: GisLatLng[],
  finalized: boolean,
): AreaSide[] {
  if (finalized && points.length >= 3) {
    return points.map((_, i) => {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      return {
        index: i,
        distanceM: haversineDistanceM(a, b),
        panelLabel: `Lado ${i + 1}`,
      };
    });
  }
  const segments = computeSegmentDistancesM(points);
  return segments.map((distanceM, i) => ({
    index: i,
    distanceM,
    panelLabel: `Lado ${i + 1}`,
  }));
}

export function computePerimeterM(
  points: GisLatLng[],
  finalized: boolean,
  cursor: GisLatLng | null = null,
): number {
  if (finalized && points.length >= 3) {
    let total = 0;
    for (let i = 0; i < points.length; i++) {
      total += haversineDistanceM(points[i], points[(i + 1) % points.length]);
    }
    return total;
  }
  const segments = computeSegmentDistancesM(points);
  let total = computeTotalDistanceM(segments);
  if (cursor && points.length > 0) {
    total += haversineDistanceM(points[points.length - 1], cursor);
  }
  return total;
}

export function canFinalizeAreaMeasure(points: GisLatLng[]): boolean {
  return points.length >= 3;
}

/** Posições Leaflet [lat,lng] para preenchimento (inclui cursor em desenho). */
export function buildAreaFillPositions(
  points: GisLatLng[],
  finalized: boolean,
  cursor: GisLatLng | null,
): [number, number][] | null {
  const ring = buildAreaPolygonRing(points, {
    finalized,
    cursor: finalized ? null : cursor,
  });
  if (!ring) return null;
  return ring.map(([lng, lat]) => [lat, lng] as [number, number]);
}
