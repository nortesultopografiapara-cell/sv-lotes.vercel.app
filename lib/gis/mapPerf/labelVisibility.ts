/**
 * Regras de visibilidade de rótulos e arestas do mapa GIS.
 * Quando ocultos, NÃO devem existir no DOM (sem opacity).
 */

export const GIS_LABELS_MIN_ZOOM = 16;
export const GIS_LABELS_CLOSE_ZOOM = 18;
export const GIS_BOUNDARY_MIN_ZOOM = 17;

export type LatLngBoundsLike = {
  getSouth: () => number;
  getNorth: () => number;
  getWest: () => number;
  getEast: () => number;
  pad: (bufferRatio: number) => LatLngBoundsLike;
};

export function shouldShowLotLabels(mapZoom: number, labelsMinZoom = GIS_LABELS_MIN_ZOOM): boolean {
  return mapZoom >= labelsMinZoom;
}

export function shouldShowBoundaryEdges(
  mapZoom: number,
  boundaryMinZoom = GIS_BOUNDARY_MIN_ZOOM,
): boolean {
  return mapZoom >= boundaryMinZoom;
}

/** Zoom médio: só labels no viewport; zoom próximo: também só viewport (deconflict menor). */
export function shouldFilterLabelsByViewport(mapZoom: number): boolean {
  return mapZoom < GIS_LABELS_CLOSE_ZOOM + 2;
}

export function pointInPaddedBounds(
  lat: number,
  lng: number,
  bounds: LatLngBoundsLike,
  padRatio = 0.15,
): boolean {
  const b = bounds.pad(padRatio);
  return lat >= b.getSouth() && lat <= b.getNorth() && lng >= b.getWest() && lng <= b.getEast();
}

export function ringIntersectsBounds(
  ring: Array<[number, number]>,
  bounds: LatLngBoundsLike,
  padRatio = 0.15,
): boolean {
  if (!ring.length) return false;
  const b = bounds.pad(padRatio);
  const south = b.getSouth();
  const north = b.getNorth();
  const west = b.getWest();
  const east = b.getEast();

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of ring) {
    if (lat >= south && lat <= north && lng >= west && lng <= east) return true;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  // AABB overlap
  return !(maxLat < south || minLat > north || maxLng < west || minLng > east);
}
