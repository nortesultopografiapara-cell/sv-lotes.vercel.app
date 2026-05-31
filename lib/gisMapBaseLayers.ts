/**
 * Camadas base do Mapa GIS (Leaflet).
 * maxNativeZoom = último zoom com tile real; acima disso o Leaflet amplia o tile nativo.
 */

export const GIS_MAP_MAX_ZOOM = 22;
export const GIS_MAP_DEFAULT_ZOOM = 18;

export type GisMapLayerMode = 'streets' | 'satellite' | 'dark';

export type GisTileProviderConfig = {
  id: string;
  url: string;
  attribution: string;
  maxNativeZoom: number;
  zIndex: number;
  subdomains?: string;
  role: 'primary' | 'fallback';
};

const OSM: GisTileProviderConfig = {
  id: 'osm',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxNativeZoom: 19,
  zIndex: 0,
  subdomains: 'abc',
  role: 'fallback',
};

const ESRI_WORLD_IMAGERY: GisTileProviderConfig = {
  id: 'esri-world-imagery',
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution:
    '&copy; <a href="https://www.esri.com/">Esri</a> — World Imagery',
  maxNativeZoom: 18,
  zIndex: 1,
  role: 'primary',
};

const CARTO_DARK: GisTileProviderConfig = {
  id: 'carto-dark',
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  maxNativeZoom: 20,
  zIndex: 1,
  subdomains: 'abcd',
  role: 'primary',
};

/** Pilha de tiles: fallback embaixo, primário em cima (ampliação acima do maxNativeZoom). */
export function getGisBaseLayerStack(mode: GisMapLayerMode): GisTileProviderConfig[] {
  switch (mode) {
    case 'streets':
      return [{ ...OSM, zIndex: 0, role: 'primary' }];
    case 'satellite':
      return [
        { ...OSM, zIndex: 0, role: 'fallback' },
        { ...ESRI_WORLD_IMAGERY, zIndex: 1, role: 'primary' },
      ];
    case 'dark':
      return [
        { ...OSM, zIndex: 0, role: 'fallback' },
        { ...CARTO_DARK, zIndex: 1, role: 'primary' },
      ];
    default:
      return [{ ...OSM, zIndex: 0, role: 'primary' }];
  }
}

/** Opções comuns repassadas ao L.tileLayer / TileLayer. */
export function gisTileLayerOptions(provider: GisTileProviderConfig) {
  return {
    maxNativeZoom: provider.maxNativeZoom,
    maxZoom: GIS_MAP_MAX_ZOOM,
    minZoom: 0,
    detectRetina: false as const,
    updateWhenZooming: true,
    updateWhenIdle: true,
    keepBuffer: 4,
    tileSize: 256,
    zoomOffset: 0,
    zIndex: provider.zIndex,
    subdomains: provider.subdomains,
  };
}
