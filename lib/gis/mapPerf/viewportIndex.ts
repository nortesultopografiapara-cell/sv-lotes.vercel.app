/**
 * Índice espacial simples por AABB (sem dependência RBush).
 * Usado para priorizar montagem e filtrar labels no viewport.
 */

export type ViewportItem = {
  id: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centroidLat: number;
  centroidLng: number;
};

export function buildViewportItemFromRing(
  id: string,
  ring: Array<[number, number]>,
): ViewportItem | null {
  if (!ring.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let sumLat = 0;
  let sumLng = 0;
  for (const [lat, lng] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    sumLat += lat;
    sumLng += lng;
  }
  const n = ring.length;
  return {
    id,
    minLat,
    maxLat,
    minLng,
    maxLng,
    centroidLat: sumLat / n,
    centroidLng: sumLng / n,
  };
}

export function queryViewportIds(
  items: ViewportItem[],
  south: number,
  north: number,
  west: number,
  east: number,
): Set<string> {
  const out = new Set<string>();
  for (const it of items) {
    if (it.maxLat < south || it.minLat > north || it.maxLng < west || it.minLng > east) {
      continue;
    }
    out.add(it.id);
  }
  return out;
}

export function expandBounds(
  south: number,
  north: number,
  west: number,
  east: number,
  padRatio: number,
): { south: number; north: number; west: number; east: number } {
  const dLat = (north - south) * padRatio;
  const dLng = (east - west) * padRatio;
  return {
    south: south - dLat,
    north: north + dLat,
    west: west - dLng,
    east: east + dLng,
  };
}
