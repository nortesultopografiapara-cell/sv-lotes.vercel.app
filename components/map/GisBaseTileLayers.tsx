'use client';

import { useEffect } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import {
  GIS_MAP_MAX_ZOOM,
  type GisMapLayerMode,
  getGisBaseLayerStack,
  gisTileLayerOptions,
} from '@/lib/gisMapBaseLayers';

function GisMapMaxZoomSync() {
  const map = useMap();
  useEffect(() => {
    map.setMaxZoom(GIS_MAP_MAX_ZOOM);
  }, [map]);
  return null;
}

type GisBaseTileLayersProps = {
  mode: GisMapLayerMode;
};

/**
 * Camadas base: maxNativeZoom por provedor, maxZoom 22 com ampliação do último tile.
 * detectRetina=false evita pedir zoom+1 (causa "Map data not yet available" no Esri).
 */
export function GisBaseTileLayers({ mode }: GisBaseTileLayersProps) {
  const stack = getGisBaseLayerStack(mode);

  return (
    <>
      <GisMapMaxZoomSync />
      {stack.map((provider) => (
        <TileLayer
          key={`${mode}-${provider.id}`}
          url={provider.url}
          attribution={provider.attribution}
          {...gisTileLayerOptions(provider)}
        />
      ))}
    </>
  );
}
