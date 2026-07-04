/**
 * Ferramenta global de medição de distância no mapa GIS.
 * Cálculo geodésico (mesma base do Leaflet LatLng.distanceTo — raio WGS84 6378137 m).
 */

export type GisLatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6378137;

/** Distância geodésica em metros entre dois pontos WGS84. */
export function haversineDistanceM(a: GisLatLng, b: GisLatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function toGisLatLng(lat: number, lng: number): GisLatLng {
  return { lat, lng };
}

export function computeSegmentDistancesM(points: GisLatLng[]): number[] {
  const segments: number[] = [];
  for (let i = 1; i < points.length; i++) {
    segments.push(haversineDistanceM(points[i - 1], points[i]));
  }
  return segments;
}

export function computeTotalDistanceM(segments: number[]): number {
  return segments.reduce((sum, d) => sum + d, 0);
}

/** Exibe metros (< 1000) ou quilômetros (>= 1000), pt-BR. */
export function formatGisDistanceM(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  const abs = Math.abs(meters);
  if (abs >= 1000) {
    const km = meters / 1000;
    return `${km.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} km`;
  }
  return `${meters.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m`;
}

/** Índice 0 → A, 1 → B, … 25 → Z, 26 → AA */
export function pointLetter(index: number): string {
  let n = index;
  let label = '';
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

export function segmentEndpointLetters(fromIndex: number): string {
  return `${pointLetter(fromIndex)}${pointLetter(fromIndex + 1)}`;
}

export type MeasureSegment = {
  index: number;
  distanceM: number;
  mapLabel: string;
  panelLabel: string;
};

export function buildMeasureSegments(points: GisLatLng[]): MeasureSegment[] {
  const distances = computeSegmentDistancesM(points);
  return distances.map((distanceM, i) => ({
    index: i,
    distanceM,
    mapLabel: `Trecho ${segmentEndpointLetters(i)}`,
    panelLabel: `Trecho ${i + 1}`,
  }));
}

export function segmentMidpoint(a: GisLatLng, b: GisLatLng): GisLatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

export function computePreviewDistanceM(
  points: GisLatLng[],
  cursor: GisLatLng | null,
): number | null {
  if (!cursor || points.length === 0) return null;
  return haversineDistanceM(points[points.length - 1], cursor);
}

export function computeTotalWithPreviewM(
  segments: number[],
  previewM: number | null,
): number {
  const base = computeTotalDistanceM(segments);
  return previewM != null ? base + previewM : base;
}

export function canFinalizeMeasure(points: GisLatLng[]): boolean {
  return points.length >= 2;
}

/** Intervalo entre cliques para distinguir duplo toque (mobile). */
export const MEASURE_DOUBLE_TAP_MS = 320;

/** Atraso do clique simples para não duplicar ponto no duplo clique. */
export const MEASURE_CLICK_DELAY_MS = 280;
