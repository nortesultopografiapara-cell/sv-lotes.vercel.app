/** Classes e constantes visuais do popup de lote no mapa GIS. */

export const GIS_LOT_LEAFLET_POPUP_CLASS = 'gis-lot-leaflet-popup';

/** Largura máxima do popup Leaflet (px). Default do Leaflet é 300. */
export const GIS_LOT_POPUP_MAX_WIDTH_PX = 1000;

export const GIS_LOT_POPUP_MIN_WIDTH_PX = 280;

export const GIS_LOT_POPUP_CONTAINER_CLASS =
  'flex flex-col p-0 w-[min(calc(100vw-24px),960px)] max-w-[min(calc(100vw-24px),960px)] max-h-[min(85vh,720px)] overflow-hidden bg-white text-gray-900 rounded-xl font-sans shadow-xl';

export const GIS_LOT_POPUP_PRICE_INPUT_CLASS =
  'w-[8.5rem] md:w-36 lg:w-40 px-2 py-1.5 text-right text-xs md:text-sm border border-gray-300 rounded font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-gray-900';

export const GIS_LOT_POPUP_ACTION_BTN_CLASS =
  'flex-1 text-[10px] md:text-[11px] lg:text-xs font-bold py-1.5 lg:py-2 rounded transition-colors';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Texto de UI: nunca mostra undefined/null/NaN/? vazio nem traço placeholder. */
export function gisPopupDisplayText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  const text = String(value).trim();
  if (
    !text ||
    text === 'undefined' ||
    text === 'null' ||
    text === 'NaN' ||
    text === '?' ||
    text === '—' ||
    text === '–'
  ) {
    return '';
  }
  return text;
}

export function gisPopupDisplayOrDash(value: unknown): string {
  return gisPopupDisplayText(value) || '—';
}

/** Número de contrato real — nunca UUID, null ou placeholder. */
export function gisPopupContractLabel(value: unknown): string {
  const text = gisPopupDisplayText(value);
  if (!text || UUID_RE.test(text)) return '';
  return text;
}
