/**
 * Helpers de desempenho GIS — yield à UI e filtros espaciais leves.
 */

/** Libera a thread para pintar (fechar modo / pan) antes de trabalho pesado. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
    // Dois rAF: garante paint após o setState que fechou o modo.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export function yieldToBrowserTimeout(ms = 0): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      setTimeout(resolve, ms);
      return;
    }
    window.setTimeout(resolve, ms);
  });
}

type BBox = { minLat: number; maxLat: number; minLng: number; maxLng: number };

function bboxFromLotBounds(
  bounds: Array<[number, number] | number[]> | null | undefined,
): BBox | null {
  if (!Array.isArray(bounds) || bounds.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const pt of bounds) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lat = Number(pt[0]);
    const lng = Number(pt[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  if (!Number.isFinite(minLat)) return null;
  return { minLat, maxLat, minLng, maxLng };
}

function metersToDeg(meters: number): number {
  return meters / 111_320;
}

function guideCoordsLatLng(
  guide: Record<string, unknown>,
): Array<[number, number]> | null {
  const geom = guide.geometry as
    | { type?: string; coordinates?: unknown }
    | null
    | undefined;
  if (!geom?.coordinates) return null;
  let coords: number[][] | null = null;
  if (geom.type === 'LineString') {
    coords = geom.coordinates as number[][];
  } else if (geom.type === 'MultiLineString') {
    coords = ((geom.coordinates as number[][][]) || [])[0] ?? null;
  }
  // street_guides às vezes guardam path em coordinates / path_json
  if (!coords && Array.isArray(guide.coordinates)) {
    coords = guide.coordinates as number[][];
  }
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const out: Array<[number, number]> = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    // GeoJSON [lng, lat]
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push([lat, lng]);
  }
  return out.length >= 2 ? out : null;
}

/**
 * Mantém apenas street_guides cuja linha intersecta a bbox expandida do lote.
 * Evita comparar a frente com todas as ruas do empreendimento.
 */
export function filterStreetGuidesNearLot<T extends Record<string, unknown>>(
  lotBounds: Array<[number, number] | number[]> | null | undefined,
  streetGuides: T[],
  marginMeters = 80,
): T[] {
  if (!streetGuides.length) return [];
  const box = bboxFromLotBounds(lotBounds);
  if (!box) return streetGuides;
  const pad = metersToDeg(marginMeters);
  const minLat = box.minLat - pad;
  const maxLat = box.maxLat + pad;
  const minLng = box.minLng - pad;
  const maxLng = box.maxLng + pad;

  return streetGuides.filter((g) => {
    const coords = guideCoordsLatLng(g);
    if (!coords) return true; // sem geometria: não excluir (fallback seguro)
    for (const [lat, lng] of coords) {
      if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
        return true;
      }
    }
    return false;
  });
}
