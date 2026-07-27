/** Camadas de base do mapa GIS (Leaflet). */

export type GisBaseLayerId =
  | 'google_satellite'
  | 'google_hybrid'
  | 'esri_satellite'
  | 'osm';

export const GIS_MAP_MAX_ZOOM = 22;

/** Último zoom com tiles nativos por provedor (acima disso Leaflet estica). */
export const GIS_GOOGLE_MAX_NATIVE_ZOOM = 20;
export const GIS_ESRI_MAX_NATIVE_ZOOM = 17;
export const GIS_OSM_MAX_NATIVE_ZOOM = 19;

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

export type GisBaseLayerRuntimeState = {
  activeBaseLayer: GisBaseLayerId;
  currentZoom: number;
  googleLayerMounted: boolean;
  esriFallbackActive: boolean;
  googleMutantError: string | null;
  effectiveBaseLayer?: GisBaseLayerId;
};

const DEFAULT_RUNTIME_STATE: GisBaseLayerRuntimeState = {
  activeBaseLayer: DEFAULT_GIS_BASE_LAYER,
  currentZoom: 0,
  googleLayerMounted: false,
  esriFallbackActive: false,
  googleMutantError: null,
};

let gisBaseLayerRuntimeState: GisBaseLayerRuntimeState = {
  ...DEFAULT_RUNTIME_STATE,
};

export function getGisBaseLayerRuntimeState(): GisBaseLayerRuntimeState {
  return { ...gisBaseLayerRuntimeState };
}

export function resetGisBaseLayerRuntimeState(): void {
  gisBaseLayerRuntimeState = { ...DEFAULT_RUNTIME_STATE };
}

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

export function updateGisBaseLayerRuntimeState(
  patch: Partial<GisBaseLayerRuntimeState>,
): GisBaseLayerRuntimeState {
  gisBaseLayerRuntimeState = {
    ...gisBaseLayerRuntimeState,
    ...patch,
  };
  return gisBaseLayerRuntimeState;
}

export function logGisBaseLayerDiagnostics(
  patch: Partial<GisBaseLayerRuntimeState> & {
    activeBaseLayer: GisBaseLayerId;
    currentZoom: number;
  },
): void {
  const state = updateGisBaseLayerRuntimeState(patch);

  console.log(`GOOGLE_MAPS_KEY_PRESENT=${isGoogleMapsKeyPresent()}`);
  console.log('activeBaseLayer', state.activeBaseLayer);
  if (state.effectiveBaseLayer && state.effectiveBaseLayer !== state.activeBaseLayer) {
    console.log('effectiveBaseLayer', state.effectiveBaseLayer);
  }
  console.log('currentZoom', state.currentZoom);
  console.log(`googleLayerMounted=${state.googleLayerMounted}`);
  console.log(`esriFallbackActive=${state.esriFallbackActive}`);
  console.log('googleMutantError', state.googleMutantError ?? 'null');
  if (state.googleMutantError?.startsWith('gm_authFailure')) {
    console.error(
      'GIS_GOOGLE_CONSOLE_HINT',
      'Verifique restrições HTTP Referrer da API key para https://www.svlotes.com.br, https://svlotes.com.br e https://*.vercel.app/* (Previews).',
    );
  }
  if (state.esriFallbackActive) {
    console.warn(
      'GIS_BASE_LAYER_ESRI_FALLBACK',
      'Google indisponível neste host — World Imagery (Esri) ativo.',
    );
  }
}
