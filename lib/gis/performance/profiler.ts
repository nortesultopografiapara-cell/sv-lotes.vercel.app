/**
 * Profiler de desempenho do Mapa GIS — Preview/Development apenas.
 * Bloqueado em Production. Sem PII / sem coordenadas completas.
 *
 * Browser: window.__SV_GIS_PERF__.lastSummary
 */

export type GisPerfPhase =
  | 'gis_total_load'
  | 'gis_fetch_request'
  | 'gis_fetch_response_parse'
  | 'gis_lots_normalization'
  | 'gis_segments_parse'
  | 'gis_coordinate_conversion'
  | 'gis_dimensions_calculation'
  | 'gis_front_detection'
  | 'gis_labels_preparation'
  | 'gis_react_elements_creation'
  | 'gis_map_layer_mount'
  | 'gis_fit_bounds'
  | 'gis_first_interactive'
  | 'geometry_diagnostic'
  | 'geometry_validations'
  | 'confrontation_audits'
  | 'set_state'
  // aliases legados (instrumentação inicial)
  | 'load_total'
  | 'supabase_fetch'
  | 'payload_measure'
  | 'parse_bounds'
  | 'calculate_dimensions'
  | 'build_lot_objects'
  | 'label_positions'
  | 'react_lots_mount'
  | 'interactive_ready';

export type GisPerfMark = {
  phase: GisPerfPhase | string;
  ms: number;
  detail?: Record<string, number | string | boolean | null>;
};

export type GisPerfSession = {
  sessionId: string;
  projectId: string | null;
  lotCount: number;
  startedAt: string;
  marks: GisPerfMark[];
  summary?: Record<string, unknown>;
};

declare global {
  interface Window {
    __SV_GIS_PERF__?: {
      enabled: boolean;
      sessions: GisPerfSession[];
      lastSummary: Record<string, unknown> | null;
      getLast: () => GisPerfSession | null;
    };
  }
}

function resolveRuntimeEnv(): string {
  const vercel = String(
    process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || '',
  )
    .trim()
    .toLowerCase();
  if (vercel) return vercel;
  return String(process.env.NODE_ENV || '').trim().toLowerCase() || 'unknown';
}

export function isGisPerfDiagnosticsEnabled(): boolean {
  const env = resolveRuntimeEnv();
  if (env === 'production') return false;

  const flag = String(process.env.NEXT_PUBLIC_GIS_PERF_DIAG || '')
    .trim()
    .toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  if (flag === '1' || flag === 'true' || flag === 'on') return true;

  return env === 'preview' || env === 'development' || env === 'test';
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function ensureWindowApi(): void {
  if (typeof window === 'undefined') return;
  if (!isGisPerfDiagnosticsEnabled()) return;
  if (window.__SV_GIS_PERF__) return;
  window.__SV_GIS_PERF__ = {
    enabled: true,
    sessions: [],
    lastSummary: null,
    getLast: () => {
      const list = window.__SV_GIS_PERF__?.sessions || [];
      return list.length ? list[list.length - 1] : null;
    },
  };
}

let activeSession: GisPerfSession | null = null;
const openTimers = new Map<string, number>();

function perfMark(name: string): void {
  try {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(name);
    }
  } catch {
    /* ignore */
  }
}

function perfMeasure(name: string, start: string, end: string): void {
  try {
    if (typeof performance !== 'undefined' && performance.measure) {
      performance.measure(name, start, end);
    }
  } catch {
    /* ignore */
  }
}

export function gisPerfBeginSession(projectId: string | null): GisPerfSession | null {
  if (!isGisPerfDiagnosticsEnabled()) return null;
  ensureWindowApi();
  activeSession = {
    sessionId: `gis-${Date.now().toString(36)}`,
    projectId: projectId ? String(projectId).slice(0, 8) : null,
    lotCount: 0,
    startedAt: new Date().toISOString(),
    marks: [],
  };
  openTimers.clear();
  openTimers.set('gis_total_load', nowMs());
  perfMark('gis_total_load_start');
  if (typeof window !== 'undefined' && window.__SV_GIS_PERF__) {
    window.__SV_GIS_PERF__.sessions.push(activeSession);
    if (window.__SV_GIS_PERF__.sessions.length > 5) {
      window.__SV_GIS_PERF__.sessions.shift();
    }
  }
  return activeSession;
}

export function gisPerfMarkStart(phase: GisPerfPhase | string): void {
  if (!isGisPerfDiagnosticsEnabled() || !activeSession) return;
  openTimers.set(phase, nowMs());
  perfMark(`${phase}_start`);
}

export function gisPerfMarkEnd(
  phase: GisPerfPhase | string,
  detail?: Record<string, number | string | boolean | null>,
): number {
  if (!isGisPerfDiagnosticsEnabled() || !activeSession) return 0;
  const start = openTimers.get(phase);
  openTimers.delete(phase);
  const ms = start != null ? Math.round((nowMs() - start) * 100) / 100 : 0;
  activeSession.marks.push({ phase, ms, detail });
  perfMark(`${phase}_end`);
  if (start != null) {
    perfMeasure(String(phase), `${phase}_start`, `${phase}_end`);
  }
  return ms;
}

export function gisPerfNote(
  phase: GisPerfPhase | string,
  ms: number,
  detail?: Record<string, number | string | boolean | null>,
): void {
  if (!isGisPerfDiagnosticsEnabled() || !activeSession) return;
  activeSession.marks.push({
    phase,
    ms: Math.round(ms * 100) / 100,
    detail,
  });
}

export function gisPerfSetLotCount(n: number): void {
  if (!activeSession) return;
  activeSession.lotCount = n;
}

export function gisPerfMeasurePayloadBytes(data: unknown): {
  bytes: number;
  approxKb: number;
  approxMb: number;
} {
  if (!isGisPerfDiagnosticsEnabled()) {
    return { bytes: 0, approxKb: 0, approxMb: 0 };
  }
  try {
    const json = JSON.stringify(data);
    const bytes =
      typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(json).length
        : json.length;
    return {
      bytes,
      approxKb: Math.round((bytes / 1024) * 10) / 10,
      approxMb: Math.round((bytes / (1024 * 1024)) * 100) / 100,
    };
  } catch {
    return { bytes: -1, approxKb: -1, approxMb: -1 };
  }
}

export function gisPerfMemorySnapshot(): Record<string, number> | null {
  if (!isGisPerfDiagnosticsEnabled()) return null;
  const perf =
    typeof performance !== 'undefined'
      ? (performance as Performance & {
          memory?: {
            usedJSHeapSize: number;
            totalJSHeapSize: number;
            jsHeapSizeLimit: number;
          };
        })
      : null;
  const mem = perf?.memory;
  if (!mem) return null;
  return {
    usedJsHeapMb: Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 10) / 10,
    totalJsHeapMb: Math.round((mem.totalJSHeapSize / (1024 * 1024)) * 10) / 10,
    jsHeapLimitMb: Math.round((mem.jsHeapSizeLimit / (1024 * 1024)) * 10) / 10,
  };
}

export function gisPerfDeviceSnapshot(): Record<string, number | string | boolean> | null {
  if (!isGisPerfDiagnosticsEnabled() || typeof window === 'undefined') return null;
  const ua = String(navigator.userAgent || '');
  const mobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  return {
    deviceClass: mobile ? 'mobile' : 'desktop',
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    hardwareConcurrency: Number(navigator.hardwareConcurrency || 0),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

/** Contagens estruturais do payload (sem PII). */
export function gisPerfSummarizeBlocksPayload(
  rows: Record<string, unknown>[] | null | undefined,
): Record<string, number | string | null> {
  if (!rows || rows.length === 0) {
    return { lotCount: 0 };
  }

  const perLotCoords: number[] = [];
  let coordPoints = 0;
  let segmentsJsonBytes = 0;
  let geometryBytes = 0;
  let txtCivil = 0;
  let withSegments = 0;
  let polygon = 0;
  let emptyGeom = 0;

  for (const row of rows) {
    const src = String(row.source_import || '');
    if (src === 'TXT_CIVIL3D') txtCivil += 1;
    const geom = row.geometry as { type?: string; coordinates?: unknown } | null;
    if (geom?.type === 'Polygon' || geom?.type === 'MultiPolygon') polygon += 1;
    try {
      if (geom) geometryBytes += JSON.stringify(geom).length;
    } catch {
      /* ignore */
    }
    if (row.segments_json != null) {
      withSegments += 1;
      try {
        segmentsJsonBytes +=
          typeof row.segments_json === 'string'
            ? row.segments_json.length
            : JSON.stringify(row.segments_json).length;
      } catch {
        /* ignore */
      }
    }
    try {
      const ring =
        geom?.type === 'Polygon'
          ? (geom.coordinates as unknown[][])?.[0]
          : geom?.type === 'MultiPolygon'
            ? (geom.coordinates as unknown[][][])?.[0]?.[0]
            : null;
      if (Array.isArray(ring) && ring.length > 0) {
        perLotCoords.push(ring.length);
        coordPoints += ring.length;
      } else {
        emptyGeom += 1;
      }
    } catch {
      emptyGeom += 1;
    }
  }

  const sorted = [...perLotCoords].sort((a, b) => a - b);
  const n = sorted.length;

  return {
    lotCount: rows.length,
    polygonCount: polygon,
    txtCivil3dCount: txtCivil,
    withSegmentsJson: withSegments,
    emptyGeometryCount: emptyGeom,
    totalRingCoordPoints: coordPoints,
    avgCoordsPerLot: n > 0 ? Math.round((coordPoints / n) * 10) / 10 : 0,
    minCoordsPerLot: n > 0 ? sorted[0] : 0,
    medianCoordsPerLot: n > 0 ? percentile(sorted, 50) : 0,
    p95CoordsPerLot: n > 0 ? percentile(sorted, 95) : 0,
    maxCoordsPerLot: n > 0 ? sorted[n - 1] : 0,
    segmentsJsonApproxKb: Math.round((segmentsJsonBytes / 1024) * 10) / 10,
    geometryApproxKb: Math.round((geometryBytes / 1024) * 10) / 10,
  };
}

export function gisPerfFinishSession(
  extra?: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!isGisPerfDiagnosticsEnabled() || !activeSession) return null;

  perfMark('gis_total_load_end');
  perfMeasure('gis_total_load', 'gis_total_load_start', 'gis_total_load_end');
  const totalMs = gisPerfMarkEnd('gis_total_load');
  const byPhase: Record<string, number> = {};
  for (const m of activeSession.marks) {
    byPhase[m.phase] = (byPhase[m.phase] || 0) + m.ms;
  }

  const memory = gisPerfMemorySnapshot();
  const device = gisPerfDeviceSnapshot();
  const summary: Record<string, unknown> = {
    sessionId: activeSession.sessionId,
    projectIdPrefix: activeSession.projectId,
    lotCount: activeSession.lotCount,
    totalMs,
    byPhase,
    marks: activeSession.marks,
    memory,
    device,
    env: resolveRuntimeEnv(),
    ...extra,
  };

  activeSession.summary = summary;
  if (typeof window !== 'undefined' && window.__SV_GIS_PERF__) {
    window.__SV_GIS_PERF__.lastSummary = summary;
  }

  console.info('[GIS_PERF]', summary);

  activeSession = null;
  openTimers.clear();
  return summary;
}

export function gisPerfMeasureSync<T>(
  phase: GisPerfPhase | string,
  fn: () => T,
  detail?: Record<string, number | string | boolean | null>,
): T {
  if (!isGisPerfDiagnosticsEnabled()) return fn();
  gisPerfMarkStart(phase);
  try {
    return fn();
  } finally {
    gisPerfMarkEnd(phase, detail);
  }
}
