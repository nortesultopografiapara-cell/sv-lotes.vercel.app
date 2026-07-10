/**
 * Modo de interação do Mapa GIS — medição tem prioridade sobre lotes.
 */

export type GisMapInteractionMode =
  | 'default'
  | 'measure-distance'
  | 'measure-area'
  | 'draw-street'
  | 'pick-lot';

export function resolveGisMapInteractionMode(flags: {
  measureActive?: boolean;
  areaMeasureActive?: boolean;
  drawStreetActive?: boolean;
  mapLotPickActive?: boolean;
}): GisMapInteractionMode {
  if (flags.measureActive) return 'measure-distance';
  if (flags.areaMeasureActive) return 'measure-area';
  if (flags.drawStreetActive) return 'draw-street';
  if (flags.mapLotPickActive) return 'pick-lot';
  return 'default';
}

export function isGisMeasureInteractionMode(
  mode: GisMapInteractionMode,
): boolean {
  return mode === 'measure-distance' || mode === 'measure-area';
}

/**
 * Hit-test dos polígonos de lote.
 * Em medição/desenho de rua: false (cliques passam ao mapa).
 * Em pick de prancha/memorial: true.
 */
export function isLotPolygonHitTestEnabled(flags: {
  mapLotPickActive?: boolean;
  drawStreetActive?: boolean;
  measureActive?: boolean;
  areaMeasureActive?: boolean;
}): boolean {
  if (flags.mapLotPickActive) return true;
  if (flags.drawStreetActive) return false;
  if (flags.measureActive || flags.areaMeasureActive) return false;
  return true;
}

/**
 * Sincroniza options.interactive + classe leaflet-interactive no path SVG/Canvas.
 * Necessário porque react-leaflet Polygon não reaplica `interactive` após o mount.
 */
export function syncLeafletPathInteractive(
  layer: {
    options?: { interactive?: boolean };
    getElement?: () => Element | undefined | null;
    closePopup?: () => void;
  } | null | undefined,
  interactive: boolean,
): void {
  if (!layer) return;
  if (layer.options) {
    layer.options.interactive = interactive;
  }
  const el = layer.getElement?.();
  if (el) {
    if (interactive) {
      el.classList.add('leaflet-interactive');
    } else {
      el.classList.remove('leaflet-interactive');
    }
  }
  if (!interactive && typeof layer.closePopup === 'function') {
    try {
      layer.closePopup();
    } catch {
      /* ignore */
    }
  }
}
