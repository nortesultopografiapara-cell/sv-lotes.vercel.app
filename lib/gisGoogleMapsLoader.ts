import { getGoogleMapsApiKey } from '@/lib/gisBaseLayers';

export type GisGoogleMapsLoadResult = {
  ok: boolean;
  error: string | null;
};

type GoogleMapsWindow = Window & {
  google?: { maps?: { Map?: unknown } };
  gm_authFailure?: () => void;
  __svLotesGoogleMapsInit?: () => void;
};

let loadPromise: Promise<GisGoogleMapsLoadResult> | null = null;

export function installGoogleMapsAuthFailureHook(): void {
  if (typeof window === 'undefined') return;
  const w = window as GoogleMapsWindow;
  w.gm_authFailure = () => {
    const error =
      'gm_authFailure:RefererNotAllowedMapError|InvalidKeyMapError|ApiNotActivatedMapError|BillingNotEnabledMapError';
    console.error('GIS_GOOGLE_AUTH_FAILURE', error);
  };
}

function googleMapsReady(): boolean {
  const w = window as GoogleMapsWindow;
  return Boolean(w.google?.maps?.Map);
}

export function loadGisGoogleMapsApi(): Promise<GisGoogleMapsLoadResult> {
  if (typeof window === 'undefined') {
    return Promise.resolve({ ok: false, error: 'ssr' });
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.resolve({ ok: false, error: 'missing_api_key' });
  }

  if (googleMapsReady()) {
    return Promise.resolve({ ok: true, error: null });
  }

  if (loadPromise) return loadPromise;

  installGoogleMapsAuthFailureHook();

  loadPromise = new Promise((resolve) => {
    const w = window as GoogleMapsWindow;
    let settled = false;

    const finish = (result: GisGoogleMapsLoadResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const existing = document.getElementById('sv-lotes-google-maps-api');
    if (existing) {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (googleMapsReady()) {
          window.clearInterval(timer);
          finish({ ok: true, error: null });
        } else if (Date.now() - started > 15000) {
          window.clearInterval(timer);
          finish({ ok: false, error: 'google_maps_existing_script_timeout' });
        }
      }, 120);
      return;
    }

    w.__svLotesGoogleMapsInit = () => {
      delete w.__svLotesGoogleMapsInit;
      finish(
        googleMapsReady()
          ? { ok: true, error: null }
          : { ok: false, error: 'google_maps_callback_without_map' },
      );
    };

    const script = document.createElement('script');
    script.id = 'sv-lotes-google-maps-api';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=__svLotesGoogleMapsInit`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      delete w.__svLotesGoogleMapsInit;
      finish({ ok: false, error: 'google_maps_script_network_error' });
    };

    window.setTimeout(() => {
      if (!googleMapsReady()) {
        finish({ ok: false, error: 'google_maps_load_timeout' });
      }
    }, 15000);

    document.head.appendChild(script);
  });

  return loadPromise;
}
