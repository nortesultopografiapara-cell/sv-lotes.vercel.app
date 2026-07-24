/**
 * Pacote de diagnóstico de desempenho do Mapa GIS (Preview only).
 * Re-exports relativos — evita ciclo com alias @/lib/gis/performance/*.
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
  gisPerfNoteGisMapRender,
  gisPerfNoteAuditRebuild,
  gisPerfNoteLoadLots,
  gisPerfStreetSaveBegin,
  gisPerfStreetSaveMark,
  gisPerfStreetSaveEnd,
  gisPerfIdentifyFrontsBegin,
  gisPerfIdentifyFrontsMark,
  gisPerfIdentifyFrontsEnd,
} from './profiler';

export type {
  GisPerfPhase,
  GisPerfMark,
  GisPerfSession,
} from './profiler';

export {
  readGisPerfTogglesFromSearch,
  writeGisPerfTogglesToUrl,
  clearGisPerfQueryFromUrl,
  GIS_PERF_TOGGLE_DEFAULTS,
} from './toggles';

export type { GisPerfToggleState } from './toggles';
