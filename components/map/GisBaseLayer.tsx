'use client';

import { useEffect, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.gridlayer.googlemutant';
import {
  GIS_MAP_MAX_ZOOM,
  getGoogleMapsApiKey,
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

let googleMapsLoadPromise: Promise<boolean> | null = null;

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

function loadGoogleMapsApi(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return Promise.resolve(false);

  const w = window as Window & { google?: { maps?: unknown } };
  if (w.google?.maps) return Promise.resolve(true);

  if (googleMapsLoadPromise) return googleMapsLoadPromise;

  googleMapsLoadPromise = new Promise((resolve) => {
    const existing = document.getElementById('sv-lotes-google-maps-api');
    if (existing) {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (w.google?.maps) {
          window.clearInterval(timer);
          resolve(true);
        } else if (Date.now() - started > 12000) {
          window.clearInterval(timer);
          resolve(false);
        }
      }, 120);
      return;
    }

    const script = document.createElement('script');
    script.id = 'sv-lotes-google-maps-api';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(Boolean(w.google?.maps));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return googleMapsLoadPromise;
}

function createGoogleMutantLayer(layerId: GisBaseLayerId): L.TileLayer | null {
  if (!L.gridLayer?.googleMutant) return null;
  const type = layerId === 'google_hybrid' ? 'hybrid' : 'satellite';
  return L.gridLayer.googleMutant({
    type,
    maxZoom: GIS_MAP_MAX_ZOOM,
  });
}

function createEsriSatelliteLayer(): L.TileLayer {
  return L.tileLayer(ESRI_SATELLITE_URL, {
    maxNativeZoom: 19,
    maxZoom: GIS_MAP_MAX_ZOOM,
    updateWhenZooming: true,
    keepBuffer: 4,
    errorTileUrl: TRANSPARENT_ERROR_TILE,
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  });
}

function createOsmLayer(): L.TileLayer {
  return L.tileLayer(OSM_URL, {
    maxNativeZoom: 19,
    maxZoom: GIS_MAP_MAX_ZOOM,
    updateWhenZooming: true,
    keepBuffer: 4,
    errorTileUrl: TRANSPARENT_ERROR_TILE,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
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

function syncMapZoomLimits(map: L.Map, layerId: GisBaseLayerId): void {
  map.setMaxZoom(GIS_MAP_MAX_ZOOM);
  if (isGoogleBaseLayer(layerId)) {
    map.setZoom(map.getZoom());
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
      emitDiagnostics(zoom);
    },
    moveend: () => {
      purgeForeignBaseLayers(map, runtimeRef.current.effectiveLayer);
    },
  });

  useEffect(() => {
    const zoom = map.getZoom();
    onZoomChange?.(zoom);
    emitDiagnostics(zoom);
  }, [layerId, map, onZoomChange]);

  useEffect(() => {
    let cancelled = false;

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
      activeLayerRef.current = next;
      syncMapZoomLimits(map, effective);

      runtimeRef.current.effectiveLayer = effective;
      runtimeRef.current.googleLayerMounted = options?.googleLayerMounted ?? false;
      runtimeRef.current.esriFallbackActive = options?.esriFallbackActive ?? false;
      runtimeRef.current.googleMutantError = options?.googleMutantError ?? null;

      onEffectiveLayerChange?.(effective);
      emitDiagnostics(map.getZoom());
    };

    const mountGoogleLayer = (googleLayer: L.TileLayer) => {
      const googleLayerMountedRef = { value: false };

      googleLayer.on('spawned', () => {
        if (cancelled) return;
        googleLayerMountedRef.value = true;
        runtimeRef.current.googleLayerMounted = true;
        runtimeRef.current.googleMutantError = null;
        purgeForeignBaseLayers(map, layerId);
        emitDiagnostics(map.getZoom());
      });

      googleLayer.on('tileerror', (event: L.TileErrorEvent) => {
        const message = `tileerror z=${event.coords?.z ?? '?'} x=${event.coords?.x ?? '?'} y=${event.coords?.y ?? '?'}`;
        runtimeRef.current.googleMutantError = message;
        console.warn('GIS_GOOGLE_TILE_ERROR', {
          activeBaseLayer: layerId,
          message,
        });
        emitDiagnostics(map.getZoom());
      });

      mountLayer(googleLayer, layerId, {
        googleLayerMounted: googleLayerMountedRef.value,
        esriFallbackActive: false,
        googleMutantError: null,
      });
    };

    const apply = async () => {
      clearLayer();
      runtimeRef.current.esriFallbackActive = false;
      runtimeRef.current.googleMutantError = null;
      purgeForeignBaseLayers(map, layerId);

      if (isGoogleBaseLayer(layerId)) {
        const googleReady = await loadGoogleMapsApi();
        if (cancelled) return;

        if (!googleReady) {
          const error = 'google_maps_api_unavailable';
          runtimeRef.current.googleMutantError = error;
          console.warn('GIS_GOOGLE_LAYER_INIT_FAILED', {
            requested: layerId,
            error,
            esriFallback: true,
          });
          mountLayer(createEsriSatelliteLayer(), 'esri_satellite', {
            googleLayerMounted: false,
            esriFallbackActive: true,
            googleMutantError: error,
          });
          return;
        }

        const googleLayer = createGoogleMutantLayer(layerId);
        if (!googleLayer) {
          const error = 'google_mutant_plugin_unavailable';
          runtimeRef.current.googleMutantError = error;
          console.warn('GIS_GOOGLE_LAYER_INIT_FAILED', {
            requested: layerId,
            error,
            esriFallback: true,
          });
          mountLayer(createEsriSatelliteLayer(), 'esri_satellite', {
            googleLayerMounted: false,
            esriFallbackActive: true,
            googleMutantError: error,
          });
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
      clearLayer();
    };
  }, [layerId, map, onEffectiveLayerChange]);

  return null;
}
