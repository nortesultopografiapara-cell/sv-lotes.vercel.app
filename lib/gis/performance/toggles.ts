/**
 * Toggles de diagnóstico GIS — somente com ?gisPerf=1 em Preview/Development.
 * Não alteram o comportamento padrão (sem query).
 */

import { isGisPerfDiagnosticsEnabled } from '@/lib/gis/performance/profiler';

export type GisPerfToggleState = {
  /** Painel ativo (?gisPerf=1 e ambiente não-prod). */
  panelActive: boolean;
  polygons: boolean;
  labels: boolean;
  popups: boolean;
  events: boolean;
  dimensions: boolean;
  confrontationAudits: boolean;
  fitBounds: boolean;
  boundaryLines: boolean;
  baseMap: boolean;
};

export const GIS_PERF_TOGGLE_DEFAULTS: GisPerfToggleState = {
  panelActive: false,
  polygons: true,
  labels: true,
  popups: true,
  events: true,
  dimensions: true,
  confrontationAudits: true,
  fitBounds: true,
  boundaryLines: true,
  baseMap: true,
};

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw == null || raw === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(v)) return false;
  if (['1', 'true', 'on', 'yes'].includes(v)) return true;
  return fallback;
}

/** Lê toggles da URL. Em Production sempre retorna defaults (painel off). */
export function readGisPerfTogglesFromSearch(
  search?: string | null,
): GisPerfToggleState {
  if (!isGisPerfDiagnosticsEnabled()) {
    return { ...GIS_PERF_TOGGLE_DEFAULTS };
  }
  if (typeof window === 'undefined' && search == null) {
    return { ...GIS_PERF_TOGGLE_DEFAULTS };
  }
  const qs =
    search != null
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();

  const panelActive = parseBool(qs.get('gisPerf'), false);
  if (!panelActive) {
    return { ...GIS_PERF_TOGGLE_DEFAULTS };
  }

  return {
    panelActive: true,
    polygons: parseBool(qs.get('gisPoly'), true),
    labels: parseBool(qs.get('gisLabels'), true),
    popups: parseBool(qs.get('gisPopups'), true),
    events: parseBool(qs.get('gisEvents'), true),
    dimensions: parseBool(qs.get('gisDims'), true),
    confrontationAudits: parseBool(qs.get('gisAudit'), true),
    fitBounds: parseBool(qs.get('gisFit'), true),
    boundaryLines: parseBool(qs.get('gisEdges'), true),
    baseMap: parseBool(qs.get('gisBase'), true),
  };
}

export function writeGisPerfTogglesToUrl(
  next: Partial<GisPerfToggleState>,
  current?: GisPerfToggleState,
): void {
  if (typeof window === 'undefined') return;
  if (!isGisPerfDiagnosticsEnabled()) return;

  const base = current || readGisPerfTogglesFromSearch();
  const merged: GisPerfToggleState = { ...base, ...next, panelActive: true };
  const url = new URL(window.location.href);
  url.searchParams.set('gisPerf', '1');
  url.searchParams.set('gisPoly', merged.polygons ? '1' : '0');
  url.searchParams.set('gisLabels', merged.labels ? '1' : '0');
  url.searchParams.set('gisPopups', merged.popups ? '1' : '0');
  url.searchParams.set('gisEvents', merged.events ? '1' : '0');
  url.searchParams.set('gisDims', merged.dimensions ? '1' : '0');
  url.searchParams.set('gisAudit', merged.confrontationAudits ? '1' : '0');
  url.searchParams.set('gisFit', merged.fitBounds ? '1' : '0');
  url.searchParams.set('gisEdges', merged.boundaryLines ? '1' : '0');
  url.searchParams.set('gisBase', merged.baseMap ? '1' : '0');
  window.history.replaceState({}, '', url.toString());
}

export function clearGisPerfQueryFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  [
    'gisPerf',
    'gisPoly',
    'gisLabels',
    'gisPopups',
    'gisEvents',
    'gisDims',
    'gisAudit',
    'gisFit',
    'gisEdges',
    'gisBase',
  ].forEach((k) => url.searchParams.delete(k));
  window.history.replaceState({}, '', url.toString());
}
