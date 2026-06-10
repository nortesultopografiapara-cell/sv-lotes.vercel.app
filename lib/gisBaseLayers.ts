/** Camadas de base do mapa GIS (Leaflet). */

export type GisBaseLayerId =
  | 'google_satellite'
  | 'google_hybrid'
  | 'esri_satellite'
  | 'osm';

export const GIS_BASE_LAYER_ORDER: GisBaseLayerId[] = [
  'google_satellite',
  'google_hybrid',
  'esri_satellite',
  'osm',
];

export const GIS_BASE_LAYER_LABELS: Record<GisBaseLayerId, string> = {
  google_satellite: 'Google Satélite',
  google_hybrid: 'Google Híbrido',
  esri_satellite: 'Esri Satélite',
  osm: 'OpenStreetMap',
};

export const DEFAULT_GIS_BASE_LAYER: GisBaseLayerId = 'google_satellite';

/** Legado: streets | satellite | dark */
export type LegacyGisBaseLayer = 'streets' | 'satellite' | 'dark';

export function getGoogleMapsApiKey(): string {
  return String(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
}

export function isGoogleMapsKeyPresent(): boolean {
  return getGoogleMapsApiKey().length > 0;
}

export function normalizeGisBaseLayer(
  layer: string | undefined | null,
): GisBaseLayerId {
  const value = String(layer || '').trim();
  if (
    value === 'google_satellite' ||
    value === 'google_hybrid' ||
    value === 'esri_satellite' ||
    value === 'osm'
  ) {
    return value;
  }
  if (value === 'streets') return 'osm';
  if (value === 'satellite') return DEFAULT_GIS_BASE_LAYER;
  if (value === 'dark') return 'osm';
  return DEFAULT_GIS_BASE_LAYER;
}

export function isGoogleBaseLayer(layer: GisBaseLayerId): boolean {
  return layer === 'google_satellite' || layer === 'google_hybrid';
}

export function logGisBaseLayerDiagnostics(
  activeBaseLayer: GisBaseLayerId,
  currentZoom: number,
  effectiveLayer?: GisBaseLayerId,
): void {
  console.log(
    `GOOGLE_MAPS_KEY_PRESENT=${isGoogleMapsKeyPresent()}`,
  );
  console.log('activeBaseLayer', activeBaseLayer);
  if (effectiveLayer && effectiveLayer !== activeBaseLayer) {
    console.log('effectiveBaseLayer', effectiveLayer);
  }
  console.log('currentZoom', currentZoom);
}
