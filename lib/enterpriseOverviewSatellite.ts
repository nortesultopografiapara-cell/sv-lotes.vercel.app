/**
 * Fundo de satélite para Prancha Geral — Esri World Imagery (sem captura de tela).
 * Google Maps Static API não é usado aqui por restrições de licenciamento em PDF comercial.
 */

export type GeographicBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

const ESRI_WORLD_IMAGERY_EXPORT =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';

/** Disponível no browser (fetch + CORS Esri). Indisponível em testes Node. */
export function isSatelliteBackgroundAvailable(): boolean {
  return typeof globalThis.fetch === 'function' && typeof window !== 'undefined';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Baixa mosaico Esri para o bbox geográfico do empreendimento.
 * Falha silenciosamente — PDF continua com fundo branco.
 */
export async function fetchSatelliteBackgroundBase64(
  bounds: GeographicBounds,
  widthPx: number,
  heightPx: number,
): Promise<string | null> {
  if (!isSatelliteBackgroundAvailable()) return null;
  const w = Math.min(Math.max(Math.round(widthPx), 320), 2048);
  const h = Math.min(Math.max(Math.round(heightPx), 320), 2048);
  const { west, south, east, north } = bounds;
  const url =
    `${ESRI_WORLD_IMAGERY_EXPORT}?` +
    `bbox=${west},${south},${east},${north}&bboxSR=4326&imageSR=4326&size=${w},${h}&format=png&f=image`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
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
