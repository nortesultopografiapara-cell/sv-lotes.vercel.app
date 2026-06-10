import L from 'leaflet';

type GoogleMutantLayer = L.GridLayer & {
  new (options?: {
    type?: 'roadmap' | 'satellite' | 'terrain' | 'hybrid';
    maxZoom?: number;
    maxNativeZoom?: number;
  }): L.GridLayer;
};

let registerPromise: Promise<boolean> | null = null;

export function isGisGoogleMutantRegistered(): boolean {
  return typeof L.gridLayer?.googleMutant === 'function';
}

/** Registra GoogleMutant no mesmo singleton Leaflet usado pelo GIS. */
export async function ensureGisGoogleMutant(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (isGisGoogleMutantRegistered()) return true;
  if (registerPromise) return registerPromise;

  registerPromise = import(
    'leaflet.gridlayer.googlemutant/src/Leaflet.GoogleMutant.mjs'
  )
    .then((mod) => {
      const GoogleMutant = mod.default as GoogleMutantLayer;
      const gridLayerNs = L.GridLayer as typeof L.GridLayer & {
        GoogleMutant?: GoogleMutantLayer;
      };
      if (!gridLayerNs.GoogleMutant) {
        gridLayerNs.GoogleMutant = GoogleMutant;
      }
      if (!L.gridLayer.googleMutant) {
        L.gridLayer.googleMutant = (options) => new GoogleMutant(options);
      }
      return isGisGoogleMutantRegistered();
    })
    .catch((error: unknown) => {
      console.error('GIS_GOOGLE_MUTANT_REGISTER_FAILED', error);
      return false;
    });

  return registerPromise;
}
