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
  | 'street_save_total'
  | 'street_save_db'
  | 'street_save_state'
  | 'street_save_react'
  | 'gismap_render'
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
      lastStreetSave?: Record<string, unknown> | null;
      lastIdentifyFronts?: Record<string, unknown> | null;
      lastLotEdit?: Record<string, unknown> | null;
      lastRealtimePatch?: Record<string, unknown> | null;
      lastInitialLoad?: Record<string, unknown> | null;
      lastManualFrontEdit?: Record<string, unknown> | null;
      lastConfrontation?: Record<string, unknown> | null;
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
    window.__SV_GIS_PERF__.lastInitialLoad = summary;
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

/** Contadores de render / save de logradouro (Preview only). */
type StreetSaveTrace = {
  startedAt: number;
  marks: Record<string, number>;
  gismapRendersBefore: number;
  gismapRendersAfter?: number;
  auditsRebuilt?: number;
  loadLotsRuns?: number;
};

let gismapRenderCount = 0;
let confrontationAuditRebuildCount = 0;
let loadLotsRunCount = 0;
let setLotsRunCount = 0;
let polygonRenderCount = 0;
let edgeRenderCount = 0;
let realtimeEventCount = 0;
let duplicateRealtimeSuppressCount = 0;
let streetSaveTrace: StreetSaveTrace | null = null;
let identifyFrontsTrace: {
  startedAt: number;
  marks: Record<string, number>;
  gismapRendersBefore: number;
  auditRebuildsBefore: number;
  loadLotsBefore: number;
} | null = null;

export function gisPerfNoteGisMapRender(detail?: Record<string, number | string | boolean | null>): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  gismapRenderCount += 1;
  if (streetSaveTrace) {
    console.info('[GIS_PERF_STREET] gismap_render', {
      n: gismapRenderCount,
      ...detail,
    });
  }
  if (identifyFrontsTrace) {
    console.info('[GIS_PERF_FRONTS] gismap_render', {
      n: gismapRenderCount,
      ...detail,
    });
  }
}

export function gisPerfNoteAuditRebuild(lotCount: number): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  // lotCount === 0 → skip contabilizado (não incrementa rebuilds)
  if (lotCount <= 0) return;
  confrontationAuditRebuildCount += 1;
  if (streetSaveTrace) {
    console.info('[GIS_PERF_STREET] confrontation_audits_rebuild', {
      rebuilds: confrontationAuditRebuildCount,
      lotCount,
    });
  }
}

export function gisPerfNoteLoadLots(): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  loadLotsRunCount += 1;
  if (streetSaveTrace) {
    console.info('[GIS_PERF_STREET] loadLots', { runs: loadLotsRunCount });
  }
}

export function gisPerfNoteSetLots(): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  setLotsRunCount += 1;
}

export function gisPerfNotePolygonRender(n = 1): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  polygonRenderCount += n;
}

export function gisPerfNoteEdgeRender(n = 1): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  edgeRenderCount += n;
}

export function gisPerfNoteRealtimeEvent(): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  realtimeEventCount += 1;
}

export function gisPerfNoteDuplicateRealtimeSuppressed(): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  duplicateRealtimeSuppressCount += 1;
}

export function gisPerfGetCounters(): {
  setLots: number;
  loadLots: number;
  audits: number;
  gismapRenders: number;
  polygons: number;
  edges: number;
  realtime: number;
  duplicateRealtime: number;
} {
  return {
    setLots: setLotsRunCount,
    loadLots: loadLotsRunCount,
    audits: confrontationAuditRebuildCount,
    gismapRenders: gismapRenderCount,
    polygons: polygonRenderCount,
    edges: edgeRenderCount,
    realtime: realtimeEventCount,
    duplicateRealtime: duplicateRealtimeSuppressCount,
  };
}

export function gisPerfStreetSaveBegin(meta?: Record<string, string | number | boolean | null>): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  streetSaveTrace = {
    startedAt: nowMs(),
    marks: {},
    gismapRendersBefore: gismapRenderCount,
  };
  console.info('[GIS_PERF_STREET] begin', {
    gismapRendersBefore: gismapRenderCount,
    auditRebuildsBefore: confrontationAuditRebuildCount,
    loadLotsBefore: loadLotsRunCount,
    ...meta,
  });
}

export function gisPerfStreetSaveMark(phase: string): void {
  if (!isGisPerfDiagnosticsEnabled() || !streetSaveTrace) return;
  streetSaveTrace.marks[phase] = nowMs();
}

export function gisPerfStreetSaveEnd(
  extra?: Record<string, number | string | boolean | null>,
): Record<string, unknown> | null {
  if (!isGisPerfDiagnosticsEnabled() || !streetSaveTrace) return null;
  const end = nowMs();
  const t0 = streetSaveTrace.startedAt;
  const marks = streetSaveTrace.marks;
  const dbStart = marks.db_start;
  const dbEnd = marks.db_end;
  const stateEnd = marks.state_end;
  const summary = {
    totalMs: Math.round((end - t0) * 100) / 100,
    dbMs:
      dbStart != null && dbEnd != null
        ? Math.round((dbEnd - dbStart) * 100) / 100
        : null,
    stateAfterDbMs:
      dbEnd != null && stateEnd != null
        ? Math.round((stateEnd - dbEnd) * 100) / 100
        : null,
    closeModalMs:
      marks.modal_close != null
        ? Math.round((marks.modal_close - t0) * 100) / 100
        : null,
    gismapRendersDelta: gismapRenderCount - streetSaveTrace.gismapRendersBefore,
    auditRebuildsTotal: confrontationAuditRebuildCount,
    loadLotsTotal: loadLotsRunCount,
    ...extra,
  };
  console.info('[GIS_PERF_STREET] end', summary);
  if (typeof window !== 'undefined' && window.__SV_GIS_PERF__) {
    window.__SV_GIS_PERF__.lastStreetSave = summary;
  }
  streetSaveTrace = null;
  return summary;
}

export function gisPerfIdentifyFrontsBegin(
  meta?: Record<string, string | number | boolean | null>,
): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  identifyFrontsTrace = {
    startedAt: nowMs(),
    marks: {},
    gismapRendersBefore: gismapRenderCount,
    auditRebuildsBefore: confrontationAuditRebuildCount,
    loadLotsBefore: loadLotsRunCount,
  };
  console.info('[GIS_PERF_FRONTS] begin', {
    ...meta,
    gismapRendersBefore: gismapRenderCount,
    auditRebuildsBefore: confrontationAuditRebuildCount,
    loadLotsBefore: loadLotsRunCount,
  });
}

export function gisPerfIdentifyFrontsMark(phase: string): void {
  if (!isGisPerfDiagnosticsEnabled() || !identifyFrontsTrace) return;
  identifyFrontsTrace.marks[phase] = nowMs();
}

export function gisPerfIdentifyFrontsEnd(
  extra?: Record<string, number | string | boolean | null>,
): Record<string, unknown> | null {
  if (!isGisPerfDiagnosticsEnabled() || !identifyFrontsTrace) return null;
  const end = nowMs();
  const t0 = identifyFrontsTrace.startedAt;
  const marks = identifyFrontsTrace.marks;
  const msBetween = (a?: number, b?: number) =>
    a != null && b != null ? Math.round((b - a) * 100) / 100 : null;
  const summary = {
    totalMs: Math.round((end - t0) * 100) / 100,
    calcMs: msBetween(marks.calc_start, marks.calc_end),
    dbMs: msBetween(marks.db_start, marks.db_end),
    stateMs: msBetween(marks.state_start, marks.state_end),
    gismapRendersDelta: gismapRenderCount - identifyFrontsTrace.gismapRendersBefore,
    auditRebuildsDelta:
      confrontationAuditRebuildCount - identifyFrontsTrace.auditRebuildsBefore,
    loadLotsDelta: loadLotsRunCount - identifyFrontsTrace.loadLotsBefore,
    ...extra,
  };
  console.info('[GIS_PERF_FRONTS] end', summary);
  if (typeof window !== 'undefined' && window.__SV_GIS_PERF__) {
    window.__SV_GIS_PERF__.lastIdentifyFronts = summary;
  }
  identifyFrontsTrace = null;
  return summary;
}

type OpTrace = {
  startedAt: number;
  marks: Record<string, number>;
  gismapRendersBefore: number;
  auditRebuildsBefore: number;
  loadLotsBefore: number;
  setLotsBefore: number;
  polygonRendersBefore: number;
  edgeRendersBefore: number;
  realtimeBefore: number;
  duplicateRealtimeBefore: number;
};

let lotEditTrace: OpTrace | null = null;
let realtimePatchTrace: OpTrace | null = null;

function endOpTrace(
  trace: OpTrace | null,
  key: 'lastLotEdit' | 'lastRealtimePatch',
  logTag: string,
  extra?: Record<string, number | string | boolean | null>,
): Record<string, unknown> | null {
  if (!isGisPerfDiagnosticsEnabled() || !trace) return null;
  const end = nowMs();
  const t0 = trace.startedAt;
  const marks = trace.marks;
  const msBetween = (a?: number, b?: number) =>
    a != null && b != null ? Math.round((b - a) * 100) / 100 : null;
  const summary: Record<string, unknown> = {
    totalMs: Math.round((end - t0) * 100) / 100,
    dbMs: msBetween(marks.db_start, marks.db_end),
    patchMs: msBetween(marks.patch_start, marks.patch_end),
    gismapRendersDelta: gismapRenderCount - trace.gismapRendersBefore,
    auditsRebuildDelta: confrontationAuditRebuildCount - trace.auditRebuildsBefore,
    loadLotsDelta: loadLotsRunCount - trace.loadLotsBefore,
    setLotsDelta: setLotsRunCount - trace.setLotsBefore,
    fitBoundsDelta: 0,
    ...extra,
  };
  console.info(logTag, summary);
  if (typeof window !== 'undefined' && window.__SV_GIS_PERF__) {
    window.__SV_GIS_PERF__[key] = summary;
  }
  return summary;
}

function newOpTrace(): OpTrace {
  return {
    startedAt: nowMs(),
    marks: {},
    gismapRendersBefore: gismapRenderCount,
    auditRebuildsBefore: confrontationAuditRebuildCount,
    loadLotsBefore: loadLotsRunCount,
    setLotsBefore: setLotsRunCount,
    polygonRendersBefore: polygonRenderCount,
    edgeRendersBefore: edgeRenderCount,
    realtimeBefore: realtimeEventCount,
    duplicateRealtimeBefore: duplicateRealtimeSuppressCount,
  };
}

export function gisPerfLotEditBegin(
  meta?: Record<string, string | number | boolean | null>,
): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  lotEditTrace = newOpTrace();
  console.info('[GIS_PERF_LOT_EDIT] begin', meta || {});
}

export function gisPerfLotEditMark(phase: string): void {
  if (!isGisPerfDiagnosticsEnabled() || !lotEditTrace) return;
  lotEditTrace.marks[phase] = nowMs();
}

export function gisPerfLotEditEnd(
  extra?: Record<string, number | string | boolean | null>,
): Record<string, unknown> | null {
  const summary = endOpTrace(
    lotEditTrace,
    'lastLotEdit',
    '[GIS_PERF_LOT_EDIT] end',
    extra,
  );
  lotEditTrace = null;
  return summary;
}

export function gisPerfRealtimePatchBegin(
  meta?: Record<string, string | number | boolean | null>,
): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  realtimePatchTrace = newOpTrace();
  console.info('[GIS_PERF_REALTIME] begin', meta || {});
}

export function gisPerfRealtimePatchMark(phase: string): void {
  if (!isGisPerfDiagnosticsEnabled() || !realtimePatchTrace) return;
  realtimePatchTrace.marks[phase] = nowMs();
}

export function gisPerfRealtimePatchEnd(
  extra?: Record<string, number | string | boolean | null>,
): Record<string, unknown> | null {
  const summary = endOpTrace(
    realtimePatchTrace,
    'lastRealtimePatch',
    '[GIS_PERF_REALTIME] end',
    extra,
  );
  realtimePatchTrace = null;
  return summary;
}

/** Alias estável do load inicial. */
export function gisPerfAliasInitialLoad(
  summary: Record<string, unknown> | null,
): void {
  if (!summary || typeof window === 'undefined' || !window.__SV_GIS_PERF__) return;
  window.__SV_GIS_PERF__.lastInitialLoad = summary;
}

let manualFrontTrace: OpTrace | null = null;
let confrontationTrace: OpTrace | null = null;

export function gisPerfManualFrontBegin(
  meta?: Record<string, string | number | boolean | null>,
): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  manualFrontTrace = newOpTrace();
  console.info('[GIS_PERF_MANUAL_FRONT] click', meta || {});
}

export function gisPerfManualFrontMark(phase: string): void {
  if (!isGisPerfDiagnosticsEnabled() || !manualFrontTrace) return;
  manualFrontTrace.marks[phase] = nowMs();
  if (
    phase === 'mode_closed' ||
    phase === 'street_matched' ||
    phase === 'db_complete' ||
    phase === 'local_patch_complete'
  ) {
    console.info(`[GIS_PERF_MANUAL_FRONT] ${phase}`, {
      ms: Math.round((nowMs() - manualFrontTrace.startedAt) * 100) / 100,
    });
  }
}

export function gisPerfManualFrontEnd(
  extra?: Record<string, number | string | boolean | null>,
): Record<string, unknown> | null {
  if (!isGisPerfDiagnosticsEnabled() || !manualFrontTrace) return null;
  const end = nowMs();
  const t0 = manualFrontTrace.startedAt;
  const marks = manualFrontTrace.marks;
  const msBetween = (a?: number, b?: number) =>
    a != null && b != null ? Math.round((b - a) * 100) / 100 : null;
  const summary: Record<string, unknown> = {
    totalMs: Math.round((end - t0) * 100) / 100,
    clickToModeCloseMs: msBetween(t0, marks.mode_closed),
    streetMatchMs: msBetween(marks.street_start, marks.street_matched),
    computeMs: msBetween(marks.compute_start, marks.compute_end),
    dbMs: msBetween(marks.db_start, marks.db_complete),
    patchMs: msBetween(marks.patch_start, marks.local_patch_complete),
    popupUpdateMs: msBetween(marks.popup_start, marks.popup_end),
    gismapRendersDelta: gismapRenderCount - manualFrontTrace.gismapRendersBefore,
    auditsRebuildDelta:
      confrontationAuditRebuildCount - manualFrontTrace.auditRebuildsBefore,
    loadLotsDelta: loadLotsRunCount - manualFrontTrace.loadLotsBefore,
    setLotsDelta: setLotsRunCount - manualFrontTrace.setLotsBefore,
    polygonRendersDelta: polygonRenderCount - manualFrontTrace.polygonRendersBefore,
    edgeRendersDelta: edgeRenderCount - manualFrontTrace.edgeRendersBefore,
    realtimeEventsReceived: realtimeEventCount - manualFrontTrace.realtimeBefore,
    duplicateRealtimeSuppressed:
      duplicateRealtimeSuppressCount - manualFrontTrace.duplicateRealtimeBefore,
    fitBoundsDelta: 0,
    ...extra,
  };
  console.info('[GIS_PERF_MANUAL_FRONT] finished', summary);
  if (typeof window !== 'undefined' && window.__SV_GIS_PERF__) {
    window.__SV_GIS_PERF__.lastManualFrontEdit = summary;
  }
  manualFrontTrace = null;
  return summary;
}

export function gisPerfConfrontationBegin(
  meta?: Record<string, string | number | boolean | null>,
): void {
  if (!isGisPerfDiagnosticsEnabled()) return;
  confrontationTrace = newOpTrace();
  console.info('[GIS_PERF_CONFRONTATION] begin', meta || {});
}

export function gisPerfConfrontationMark(phase: string): void {
  if (!isGisPerfDiagnosticsEnabled() || !confrontationTrace) return;
  confrontationTrace.marks[phase] = nowMs();
}

export function gisPerfConfrontationEnd(
  extra?: Record<string, number | string | boolean | null>,
): Record<string, unknown> | null {
  if (!isGisPerfDiagnosticsEnabled() || !confrontationTrace) return null;
  const end = nowMs();
  const t0 = confrontationTrace.startedAt;
  const marks = confrontationTrace.marks;
  const msBetween = (a?: number, b?: number) =>
    a != null && b != null ? Math.round((b - a) * 100) / 100 : null;
  const summary: Record<string, unknown> = {
    totalMs: Math.round((end - t0) * 100) / 100,
    computeMs: msBetween(marks.compute_start, marks.compute_end),
    dbMs: msBetween(marks.db_start, marks.db_end),
    patchMs: msBetween(marks.patch_start, marks.patch_end),
    gismapRendersDelta:
      gismapRenderCount - confrontationTrace.gismapRendersBefore,
    auditsRebuildDelta:
      confrontationAuditRebuildCount - confrontationTrace.auditRebuildsBefore,
    loadLotsDelta: loadLotsRunCount - confrontationTrace.loadLotsBefore,
    setLotsDelta: setLotsRunCount - confrontationTrace.setLotsBefore,
    fitBoundsDelta: 0,
    ...extra,
  };
  console.info('[GIS_PERF_CONFRONTATION] end', summary);
  if (typeof window !== 'undefined' && window.__SV_GIS_PERF__) {
    window.__SV_GIS_PERF__.lastConfrontation = summary;
  }
  confrontationTrace = null;
  return summary;
}
