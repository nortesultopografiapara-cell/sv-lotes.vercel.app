import 'leaflet';

declare module 'leaflet' {
  namespace gridLayer {
    function googleMutant(options?: {
      type?: 'roadmap' | 'satellite' | 'terrain' | 'hybrid';
      maxZoom?: number;
      maxNativeZoom?: number;
    }): TileLayer;
  }
}

declare module 'leaflet.gridlayer.googlemutant';
