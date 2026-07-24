/**
 * Pacote de diagnóstico de desempenho do Mapa GIS (Preview only).
 */

export {
  isGisPerfDiagnosticsEnabled,
  gisPerfBeginSession,
  gisPerfFinishSession,
  gisPerfMarkStart,
  gisPerfMarkEnd,
  gisPerfNote,
  gisPerfSetLotCount,
  gisPerfMeasurePayloadBytes,
  gisPerfMeasureSync,
  gisPerfMemorySnapshot,
  gisPerfDeviceSnapshot,
  gisPerfSummarizeBlocksPayload,
} from '@/lib/gis/performance/profiler';

export type {
  GisPerfPhase,
  GisPerfMark,
  GisPerfSession,
} from '@/lib/gis/performance/profiler';

export {
  readGisPerfTogglesFromSearch,
  writeGisPerfTogglesToUrl,
  clearGisPerfQueryFromUrl,
  GIS_PERF_TOGGLE_DEFAULTS,
} from '@/lib/gis/performance/toggles';

export type { GisPerfToggleState } from '@/lib/gis/performance/toggles';
