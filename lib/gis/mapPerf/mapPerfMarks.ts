/**
 * Instrumentação de performance do Mapa GIS.
 * Ativar com ?gisPerf=1 na URL ou localStorage GIS_MAP_PERF=1.
 */

const MARK_PREFIX = 'gis-map-';

export function isGisMapPerfEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('gisPerf') === '1' || q.get('gisPerf') === 'true') return true;
    if (window.localStorage.getItem('GIS_MAP_PERF') === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function gisPerfMark(name: string): void {
  if (!isGisMapPerfEnabled()) return;
  try {
    performance.mark(`${MARK_PREFIX}${name}`);
  } catch {
    /* ignore */
  }
}

export function gisPerfMeasure(name: string, startMark: string, endMark: string): number | null {
  if (!isGisMapPerfEnabled()) return null;
  try {
    const full = `${MARK_PREFIX}${name}`;
    performance.measure(full, `${MARK_PREFIX}${startMark}`, `${MARK_PREFIX}${endMark}`);
    const entries = performance.getEntriesByName(full);
    const last = entries[entries.length - 1] as PerformanceMeasure | undefined;
    const ms = last?.duration ?? null;
    if (ms != null) {
      console.info(`[GIS_PERF] ${name}: ${ms.toFixed(1)}ms`);
    }
    return ms;
  } catch {
    return null;
  }
}

export function gisPerfTime(label: string): void {
  if (!isGisMapPerfEnabled()) return;
  console.time(`[GIS_PERF] ${label}`);
}

export function gisPerfTimeEnd(label: string): void {
  if (!isGisMapPerfEnabled()) return;
  console.timeEnd(`[GIS_PERF] ${label}`);
}

export function gisPerfLog(payload: Record<string, unknown>): void {
  if (!isGisMapPerfEnabled()) return;
  console.info('[GIS_PERF]', payload);
}

export function gisPerfCountDom(): {
  pathElements: number;
  markers: number;
  divIcons: number;
} {
  if (typeof document === 'undefined') {
    return { pathElements: 0, markers: 0, divIcons: 0 };
  }
  return {
    pathElements: document.querySelectorAll('.leaflet-overlay-pane path, .leaflet-overlay-pane canvas').length,
    markers: document.querySelectorAll('.leaflet-marker-pane .leaflet-marker-icon').length,
    divIcons: document.querySelectorAll('.lot-map-label-marker').length,
  };
}
