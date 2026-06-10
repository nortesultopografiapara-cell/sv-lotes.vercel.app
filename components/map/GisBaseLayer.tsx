'use client';

import { useEffect, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.gridlayer.googlemutant';
import {
  getGoogleMapsApiKey,
  isGoogleBaseLayer,
  logGisBaseLayerDiagnostics,
  type GisBaseLayerId,
} from '@/lib/gisBaseLayers';

const ESRI_SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

let googleMapsLoadPromise: Promise<boolean> | null = null;

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
    maxZoom: 22,
    maxNativeZoom: 21,
  });
}

function createEsriSatelliteLayer(): L.TileLayer {
  return L.tileLayer(ESRI_SATELLITE_URL, {
    maxNativeZoom: 19,
    maxZoom: 22,
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  });
}

function createOsmLayer(): L.TileLayer {
  return L.tileLayer(OSM_URL, {
    maxNativeZoom: 19,
    maxZoom: 22,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
  });
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

  useMapEvents({
    zoomend: () => {
      const zoom = map.getZoom();
      onZoomChange?.(zoom);
      logGisBaseLayerDiagnostics(layerId, zoom);
    },
  });

  useEffect(() => {
    const zoom = map.getZoom();
    onZoomChange?.(zoom);
    logGisBaseLayerDiagnostics(layerId, zoom);
  }, [layerId, map, onZoomChange]);

  useEffect(() => {
    let cancelled = false;

    const clearLayer = () => {
      if (activeLayerRef.current) {
        map.removeLayer(activeLayerRef.current);
        activeLayerRef.current = null;
      }
    };

    const mountLayer = (next: L.Layer, effective: GisBaseLayerId) => {
      clearLayer();
      next.addTo(map);
      activeLayerRef.current = next;
      onEffectiveLayerChange?.(effective);
      logGisBaseLayerDiagnostics(layerId, map.getZoom(), effective);
    };

    const apply = async () => {
      clearLayer();

      if (isGoogleBaseLayer(layerId)) {
        const googleReady = await loadGoogleMapsApi();
        if (cancelled) return;

        if (googleReady) {
          const googleLayer = createGoogleMutantLayer(layerId);
          if (googleLayer) {
            mountLayer(googleLayer, layerId);
            return;
          }
        }

        console.warn('GIS_GOOGLE_LAYER_FALLBACK', {
          requested: layerId,
          fallback: 'esri_satellite',
        });
        mountLayer(createEsriSatelliteLayer(), 'esri_satellite');
        return;
      }

      if (layerId === 'esri_satellite') {
        mountLayer(createEsriSatelliteLayer(), 'esri_satellite');
        return;
      }

      mountLayer(createOsmLayer(), 'osm');
    };

    void apply();

    return () => {
      cancelled = true;
      clearLayer();
    };
  }, [layerId, map, onEffectiveLayerChange]);

  return null;
}
