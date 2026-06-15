/**
 * Fundo de satélite para Prancha Geral — Esri World Imagery (sem captura de tela).
 * Google Maps Static API não é usado por restrições de licenciamento em PDF comercial.
 */

export type GeographicBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type SatelliteFetchResult = {
  ok: boolean;
  base64: string | null;
  error: string | null;
};

const ESRI_WORLD_IMAGERY_EXPORT =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';

/** Fetch disponível (browser ou Node 18+). */
export function isSatelliteBackgroundAvailable(): boolean {
  return typeof globalThis.fetch === 'function';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function arrayBufferToDataUrl(buffer: ArrayBuffer, mime: string): string {
  if (typeof Buffer !== 'undefined') {
    return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function isPngBuffer(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return (
    b.length > 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  );
}

function buildEsriExportUrl(
  bounds: GeographicBounds,
  widthPx: number,
  heightPx: number,
): string {
  const { west, south, east, north } = bounds;
  const params = new URLSearchParams({
    bbox: `${west},${south},${east},${north}`,
    bboxSR: '4326',
    imageSR: '4326',
    size: `${widthPx},${heightPx}`,
    format: 'png',
    f: 'image',
    transparent: 'false',
  });
  return `${ESRI_WORLD_IMAGERY_EXPORT}?${params.toString()}`;
}

/**
 * Baixa mosaico Esri para o bbox geográfico do empreendimento.
 * Retorna motivo explícito em caso de falha (não falha silenciosa).
 */
export async function fetchSatelliteBackgroundBase64(
  bounds: GeographicBounds,
  widthPx: number,
  heightPx: number,
): Promise<SatelliteFetchResult> {
  if (!isSatelliteBackgroundAvailable()) {
    return { ok: false, base64: null, error: 'fetch_unavailable' };
  }
  if (bounds.east <= bounds.west || bounds.north <= bounds.south) {
    return { ok: false, base64: null, error: 'invalid_geographic_bounds' };
  }

  const w = Math.min(Math.max(Math.round(widthPx), 320), 2048);
  const h = Math.min(Math.max(Math.round(heightPx), 320), 2048);
  const url = buildEsriExportUrl(bounds, w, h);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('ENTERPRISE_SATELLITE_HTTP_ERROR', {
        status: res.status,
        url,
        body: errBody.slice(0, 300),
      });
      return { ok: false, base64: null, error: `http_${res.status}` };
    }

    const contentType = res.headers.get('content-type') || '';
    const buffer = await res.arrayBuffer();

    if (!isPngBuffer(buffer)) {
      console.error('ENTERPRISE_SATELLITE_NOT_PNG', {
        contentType,
        bytes: buffer.byteLength,
        url,
      });
      return { ok: false, base64: null, error: 'response_not_png' };
    }

    if (buffer.byteLength < 500) {
      console.error('ENTERPRISE_SATELLITE_TOO_SMALL', {
        bytes: buffer.byteLength,
        url,
      });
      return { ok: false, base64: null, error: 'image_too_small' };
    }

    let base64: string;
    if (typeof window !== 'undefined' && typeof FileReader !== 'undefined') {
      const blob = new Blob([buffer], { type: 'image/png' });
      base64 = await blobToDataUrl(blob);
    } else {
      base64 = arrayBufferToDataUrl(buffer, 'image/png');
    }

    console.log('ENTERPRISE_SATELLITE_OK', {
      bytes: buffer.byteLength,
      widthPx: w,
      heightPx: h,
      bounds,
    });
    return { ok: true, base64, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ENTERPRISE_SATELLITE_FETCH_FAILED', { url, message });
    return { ok: false, base64: null, error: `fetch_error:${message}` };
  }
}

export function satellitePixelSizeForMapBoxMm(
  mapWidthMm: number,
  mapHeightMm: number,
  dpi = 150,
): { width: number; height: number } {
  const pxPerMm = dpi / 25.4;
  return {
    width: Math.round(mapWidthMm * pxPerMm),
    height: Math.round(mapHeightMm * pxPerMm),
  };
}

export function imageFormatFromDataUrl(
  dataUrl: string,
): 'PNG' | 'JPEG' | null {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,/i);
  if (!m) return null;
  const fmt = m[1].toLowerCase();
  return fmt === 'png' ? 'PNG' : 'JPEG';
}

export function stripDataUrlBase64(dataUrl: string): string | null {
  const m = dataUrl.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
  return m?.[1] ?? null;
}
