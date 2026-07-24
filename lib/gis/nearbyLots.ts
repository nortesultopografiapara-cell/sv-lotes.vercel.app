/**
 * Vizinhos imediatos por bbox (WGS84) — sem O(N²) de confrontação.
 * Usado para auditoria escopada (frente manual / confrontação pontual).
 */

export type NearbyLotBounds = {
  id?: unknown;
  bounds?: Array<[number, number] | number[]> | null;
};

function lotBBox(lot: NearbyLotBounds): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} | null {
  const bounds = lot.bounds;
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

/** ~metros → graus (aprox. equatorial; suficiente para filtro de vizinhos). */
function metersToDeg(meters: number): number {
  return meters / 111_320;
}

/**
 * Retorna ids do lote foco + vizinhos cuja bbox intersecta a bbox expandida.
 */
export function collectNearbyLotIds(
  lots: NearbyLotBounds[],
  focusLotId: string,
  marginMeters = 40,
): Set<string> {
  const focusId = String(focusLotId || '');
  const result = new Set<string>();
  if (!focusId) return result;
  result.add(focusId);

  const focus = lots.find((l) => String(l.id) === focusId);
  if (!focus) return result;
  const focusBox = lotBBox(focus);
  if (!focusBox) return result;

  const pad = metersToDeg(marginMeters);
  const fMinLat = focusBox.minLat - pad;
  const fMaxLat = focusBox.maxLat + pad;
  const fMinLng = focusBox.minLng - pad;
  const fMaxLng = focusBox.maxLng + pad;

  for (const lot of lots) {
    const id = String(lot.id || '');
    if (!id || id === focusId) continue;
    const box = lotBBox(lot);
    if (!box) continue;
    const disjoint =
      box.maxLat < fMinLat ||
      box.minLat > fMaxLat ||
      box.maxLng < fMinLng ||
      box.minLng > fMaxLng;
    if (!disjoint) result.add(id);
  }
  return result;
}
