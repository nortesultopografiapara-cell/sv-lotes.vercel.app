'use client';

import { useEffect, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { ensureGisGoogleMutant } from '@/lib/gisGoogleMutant';
import {
  loadGisGoogleMapsApi,
  subscribeGoogleMapsAuthFailure,
} from '@/lib/gisGoogleMapsLoader';
import {
  GIS_MAP_MAX_ZOOM,
  isGoogleBaseLayer,
  logGisBaseLayerDiagnostics,
  type GisBaseLayerId,
} from '@/lib/gisBaseLayers';

const ESRI_SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TRANSPARENT_ERROR_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

type TaggedBaseLayer = L.Layer & {
  _svLotesBaseLayerId?: GisBaseLayerId;
};

type GoogleMutantLayer = L.GridLayer & {
  _mutant?: google.maps.Map;
};

function tagBaseLayer(layer: L.Layer, layerId: GisBaseLayerId): void {
  (layer as TaggedBaseLayer)._svLotesBaseLayerId = layerId;
}

function getTileLayerUrl(layer: L.Layer): string {
  return String((layer as L.TileLayer & { _url?: string })._url ?? '');
}

function isEsriTileLayer(layer: L.Layer): boolean {
  return (
    layer instanceof L.TileLayer &&
    getTileLayerUrl(layer).includes('arcgisonline.com')
  );
}

/** Tiles Leaflet (inclui cópias do Google Mutant) + presença do container mutant. */
function countVisibleBaseTiles(map: L.Map): number {
  const tilePane = map.getPane('tilePane');
  const imgs = tilePane ? tilePane.querySelectorAll('img').length : 0;
  const mutantImgs = map
    .getContainer()
    .querySelectorAll('.leaflet-google-mutant img').length;
  return Math.max(imgs, mutantImgs);
}

function createGoogleMutantLayer(layerId: GisBaseLayerId): L.GridLayer | null {
  if (!L.gridLayer?.googleMutant) return null;
  const type = layerId === 'google_hybrid' ? 'hybrid' : 'satellite';
  return L.gridLayer.googleMutant({
    type,
    maxZoom: GIS_MAP_MAX_ZOOM,
    maxNativeZoom: 21,
  });
}

function createEsriSatelliteLayer(): L.TileLayer {
  return L.tileLayer(ESRI_SATELLITE_URL, {
    maxNativeZoom: 19,
    maxZoom: GIS_MAP_MAX_ZOOM,
    updateWhenZooming: true,
    keepBuffer: 4,
    zIndex: 0,
    pane: 'tilePane',
    errorTileUrl: TRANSPARENT_ERROR_TILE,
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
    crossOrigin: true,
  });
}

function createOsmLayer(): L.TileLayer {
  return L.tileLayer(OSM_URL, {
    maxNativeZoom: 19,
    maxZoom: GIS_MAP_MAX_ZOOM,
    updateWhenZooming: true,
    keepBuffer: 4,
    zIndex: 0,
    pane: 'tilePane',
    errorTileUrl: TRANSPARENT_ERROR_TILE,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    crossOrigin: true,
  });
}

function purgeForeignBaseLayers(
  map: L.Map,
  allowedLayerId: GisBaseLayerId,
): void {
  const layersToRemove: L.Layer[] = [];

  map.eachLayer((layer) => {
    const taggedId = (layer as TaggedBaseLayer)._svLotesBaseLayerId;
    if (taggedId && taggedId !== allowedLayerId) {
      layersToRemove.push(layer);
      return;
    }

    if (isGoogleBaseLayer(allowedLayerId) && isEsriTileLayer(layer)) {
      layersToRemove.push(layer);
    }
  });

  layersToRemove.forEach((layer) => {
    map.removeLayer(layer);
  });
}

function syncMapZoomLimits(map: L.Map): void {
  map.setMaxZoom(GIS_MAP_MAX_ZOOM);
}

function refreshGoogleLayer(map: L.Map, googleLayer: L.GridLayer): void {
  map.invalidateSize({ animate: false });
  googleLayer.redraw?.();
  if (typeof (googleLayer as GoogleMutantLayer)._update === 'function') {
    (googleLayer as GoogleMutantLayer)._update();
  }
}

type GisBaseLayerProps = {
  layerId: GisBaseLayerId;
  onEffectiveLayerChange?: (layer: GisBaseLayerId) => void;
  onZoomChange?: (zoom: number) => void;
};

export function GisBaseLayer({
  layerId,
  onEffectiveLayerChange,
  onZoomChange,
}: GisBaseLayerProps) {
  const map = useMap();
  const activeLayerRef = useRef<L.Layer | null>(null);
  const fallbackAppliedRef = useRef(false);
  const runtimeRef = useRef({
    googleLayerMounted: false,
    esriFallbackActive: false,
    googleMutantError: null as string | null,
    effectiveLayer: layerId as GisBaseLayerId,
  });

  const emitDiagnostics = (zoom = map.getZoom()) => {
    logGisBaseLayerDiagnostics({
      activeBaseLayer: layerId,
      currentZoom: zoom,
      googleLayerMounted: runtimeRef.current.googleLayerMounted,
      esriFallbackActive: runtimeRef.current.esriFallbackActive,
      googleMutantError: runtimeRef.current.googleMutantError,
      effectiveBaseLayer: runtimeRef.current.effectiveLayer,
    });
  };

  useMapEvents({
    zoomend: () => {
      const zoom = map.getZoom();
      onZoomChange?.(zoom);
      purgeForeignBaseLayers(map, runtimeRef.current.effectiveLayer);
      if (isGoogleBaseLayer(runtimeRef.current.effectiveLayer)) {
        const current = activeLayerRef.current;
        if (current && 'redraw' in current) {
          refreshGoogleLayer(map, current as L.GridLayer);
        }
        runtimeRef.current.googleLayerMounted = countVisibleBaseTiles(map) > 0;
      }
      emitDiagnostics(zoom);
    },
    moveend: () => {
      purgeForeignBaseLayers(map, runtimeRef.current.effectiveLayer);
    },
    resize: () => {
      const current = activeLayerRef.current;
      if (current && isGoogleBaseLayer(runtimeRef.current.effectiveLayer)) {
        refreshGoogleLayer(map, current as L.GridLayer);
      }
    },
  });

  useEffect(() => {
    const zoom = map.getZoom();
    onZoomChange?.(zoom);
    emitDiagnostics(zoom);
  }, [layerId, map, onZoomChange]);

  useEffect(() => {
    let cancelled = false;
    let verifyTimer: number | null = null;
    fallbackAppliedRef.current = false;

    const clearLayer = () => {
      if (activeLayerRef.current) {
        map.removeLayer(activeLayerRef.current);
        activeLayerRef.current = null;
      }
      runtimeRef.current.googleLayerMounted = false;
    };

    const mountLayer = (
      next: L.Layer,
      effective: GisBaseLayerId,
      options?: {
        googleLayerMounted?: boolean;
        esriFallbackActive?: boolean;
        googleMutantError?: string | null;
      },
    ) => {
      clearLayer();
      purgeForeignBaseLayers(map, effective);
      tagBaseLayer(next, effective);
      next.addTo(map);
      // Garantir tilePane abaixo dos overlays (lotes SVG).
      const tilePane = map.getPane('tilePane');
      if (tilePane) {
        tilePane.style.zIndex = '200';
      }
      const overlayPane = map.getPane('overlayPane');
      if (overlayPane) {
        overlayPane.style.zIndex = '400';
      }
      activeLayerRef.current = next;
      syncMapZoomLimits(map);

      runtimeRef.current.effectiveLayer = effective;
      runtimeRef.current.googleLayerMounted = options?.googleLayerMounted ?? false;
      runtimeRef.current.esriFallbackActive = options?.esriFallbackActive ?? false;
      runtimeRef.current.googleMutantError = options?.googleMutantError ?? null;

      onEffectiveLayerChange?.(effective);
      emitDiagnostics(map.getZoom());
    };

    const fallBackToEsri = (error: string) => {
      if (cancelled || fallbackAppliedRef.current) return;
      if (!isGoogleBaseLayer(layerId)) return;
      fallbackAppliedRef.current = true;
      runtimeRef.current.googleMutantError = error;
      console.warn('GIS_GOOGLE_FALLBACK_ESRI', {
        requested: layerId,
        error,
        host:
          typeof window !== 'undefined' ? window.location.hostname : 'unknown',
      });
      mountLayer(createEsriSatelliteLayer(), 'esri_satellite', {
        googleLayerMounted: false,
        esriFallbackActive: true,
        googleMutantError: error,
      });
    };

    const mountGoogleLayer = (googleLayer: L.GridLayer) => {
      const verifyTiles = (phase: string) => {
        if (cancelled || fallbackAppliedRef.current) return;
        const count = countVisibleBaseTiles(map);
        runtimeRef.current.googleLayerMounted = count > 0;
        if (count === 0) {
          const error = `google_tiles_missing:${phase}`;
          runtimeRef.current.googleMutantError = error;
          console.warn('GIS_GOOGLE_TILES_MISSING', {
            activeBaseLayer: layerId,
            phase,
            currentZoom: map.getZoom(),
          });
          emitDiagnostics(map.getZoom());
          // Preview/referrer: Mutant monta mas não copia tiles → fundo escuro.
          fallBackToEsri(error);
          return;
        }
        runtimeRef.current.googleMutantError = null;
        emitDiagnostics(map.getZoom());
      };

      googleLayer.on(
        'spawned',
        (event: L.LeafletEvent & { mapObject?: google.maps.Map }) => {
          if (cancelled) return;
          const gMap = event.mapObject;
          runtimeRef.current.esriFallbackActive = false;
          purgeForeignBaseLayers(map, layerId);
          refreshGoogleLayer(map, googleLayer);

          if (gMap && window.google?.maps) {
            window.google.maps.event.addListenerOnce(gMap, 'idle', () => {
              if (cancelled) return;
              refreshGoogleLayer(map, googleLayer);
              verifyTiles('idle');
            });
          }

          verifyTimer = window.setTimeout(() => {
            if (!cancelled) verifyTiles('timeout');
          }, 2800);
        },
      );

      mountLayer(googleLayer, layerId, {
        googleLayerMounted: false,
        esriFallbackActive: false,
        googleMutantError: null,
      });

      window.requestAnimationFrame(() => {
        if (!cancelled) refreshGoogleLayer(map, googleLayer);
      });
    };

    const unsubscribeAuth = subscribeGoogleMapsAuthFailure((error) => {
      if (cancelled) return;
      fallBackToEsri(error);
    });

    const apply = async () => {
      clearLayer();
      runtimeRef.current.esriFallbackActive = false;
      runtimeRef.current.googleMutantError = null;
      purgeForeignBaseLayers(map, layerId);

      if (isGoogleBaseLayer(layerId)) {
        const [apiResult, mutantReady] = await Promise.all([
          loadGisGoogleMapsApi(),
          ensureGisGoogleMutant(),
        ]);
        if (cancelled) return;

        if (!apiResult.ok) {
          const error = apiResult.error ?? 'google_maps_api_unavailable';
          fallBackToEsri(error);
          return;
        }

        if (!mutantReady) {
          fallBackToEsri('google_mutant_register_failed');
          return;
        }

        const googleLayer = createGoogleMutantLayer(layerId);
        if (!googleLayer) {
          fallBackToEsri('google_mutant_factory_unavailable');
          return;
        }

        mountGoogleLayer(googleLayer);
        return;
      }

      if (layerId === 'esri_satellite') {
        mountLayer(createEsriSatelliteLayer(), 'esri_satellite', {
          googleLayerMounted: false,
          esriFallbackActive: false,
          googleMutantError: null,
        });
        return;
      }

      mountLayer(createOsmLayer(), 'osm', {
        googleLayerMounted: false,
        esriFallbackActive: false,
        googleMutantError: null,
      });
    };

    void apply();

    return () => {
      cancelled = true;
      unsubscribeAuth();
      if (verifyTimer != null) window.clearTimeout(verifyTimer);
      clearLayer();
    };
  }, [layerId, map, onEffectiveLayerChange]);

  return null;
}
