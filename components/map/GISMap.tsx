"use client";

import { Fragment, useEffect, useMemo, useState, useRef, startTransition, useCallback, memo } from "react";
import {
  MapContainer,
  Polygon,
  Polyline,
  CircleMarker,
  Popup,
  Tooltip,
  useMap,
  useMapEvents,
  ZoomControl,
  Marker,
} from "react-leaflet";
import { useLeafletContext } from "@react-leaflet/core";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  Layers,
  Map as MapIcon,
  Loader2,
  X,
  Trash2,
  Eye,
  EyeOff,
  Pencil,
  FileText,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  BLOCKS_GIS_SELECT,
  fetchAllBlocksForProject,
} from "@/lib/blocksFetchAll";
import { useAuth } from "@/hooks/useAuth";
import { useIsWideDesktop } from "@/hooks/use-mobile";
import { isOwnerRole, canManageGisProject } from "@/lib/rolePermissions";
import { blockOwnerWriteOnClient } from "@/lib/ownerWriteGuard";
import {
  getNextContractNumber,
  isValidStoredContractNumber,
} from "@/lib/contractNumber";
import { generateContractHTML } from "@/lib/contractTemplate";
import { formatClientFetchError } from "@/lib/clientFetchError";
import {
  fetchJsonWithTimeout,
  SALES_FETCH_TIMEOUT_MS,
} from "@/lib/fetchJsonWithTimeout";

const SALES_CREATE_FETCH_TIMEOUT_MS = Math.max(SALES_FETCH_TIMEOUT_MS, 90_000);
import { CustomerLotFormModal } from "@/components/map/CustomerLotFormModal";
import { parseValidatedInstallmentsCount } from "@/lib/installmentsCount";
import { buildSaleSpouseDbPatch } from "@/lib/saleSpouseFields";
import {
  DEFAULT_INSTALLMENT_CORRECTION_TYPE,
  normalizeInstallmentCorrectionType,
} from "@/lib/installmentCorrectionType";
import { buildSaleEditFinancePayloads } from "@/lib/saleEditFinanceRecalc";
import { normalizeSaleContractModel } from "@/lib/contractModel";
import {
  attachBrokerSnapshotToSale,
  brokerRowToSnapshot,
} from "@/lib/saleBrokerSnapshot";
import { BROKERS_CONTRACT_SELECT } from "@/lib/brokersContractQuery";
import {
  computeGisMapOverlayOpen,
} from "@/lib/gisToolbarOverlay";
import { GisBaseLayer } from "@/components/map/GisBaseLayer";
import {
  DEFAULT_GIS_BASE_LAYER,
  normalizeGisBaseLayer,
  type GisBaseLayerId,
  type LegacyGisBaseLayer,
} from "@/lib/gisBaseLayers";
import {
  mergeCustomerData,
  resolveOrCreateCustomer,
} from "@/lib/customerIdentity";
import {
  validateCustomerForContract,
  type CustomerContractValidation,
} from "@/lib/validateCustomerForContract";
import { CustomerContractValidationModal } from "@/components/contracts/CustomerContractValidationModal";
import {
  formatLotAuditEvent,
  formatCurrencyBRL,
  getLotAuditHistory,
  logLotAuditEvent,
  lotAuditContextFromBlock,
  type FormattedLotAuditEvent,
  type LotAuditLogRow,
} from "@/lib/lotAudit";
import {
  buildLotReservationDisplay,
  buildReservationConvertedAuditDescription,
  buildReservationCreatedAuditDescription,
  isLotReservedStatus,
  type LotReservationDisplay,
} from "@/lib/lotReservationDisplay";
import { resolveReservationResponsibleName } from "@/lib/lotReservationResolve";
import {
  formatCurrencyBRL as formatBRL,
  formatLotAuditDescription,
  parseCurrencyBRL,
  parseCurrencyBRLNumber,
} from "@/lib/currencyBrl";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import {
  GIS_LOT_LEAFLET_POPUP_CLASS,
  GIS_LOT_POPUP_ACTION_BTN_CLASS,
  GIS_LOT_POPUP_CONTAINER_CLASS,
  GIS_LOT_POPUP_MAX_WIDTH_PX,
  GIS_LOT_POPUP_MIN_WIDTH_PX,
  GIS_LOT_POPUP_PRICE_INPUT_CLASS,
  gisPopupContractLabel,
  gisPopupDisplayOrDash,
  gisPopupDisplayText,
} from "@/lib/gisLotPopupLayout";
import { normalizeSavedLotPrice } from "@/lib/lotBlockPrice";
import { isPartnerPanelAdmin } from "@/lib/partnerPanelAdmin";
import {
  canEditCompletedSale,
  loadSaleEditContext,
  updateSaleFromEdit,
  type SaleEditLoadedContext,
} from "@/lib/saleEdit";
import {
  parseBlockSideLength,
  resolveLotMeasuresFromBlock,
  type ChanfreInfo,
} from "@/lib/lotChanfre";
import {
  getOfficialLotMeasurements,
  getOfficialLotSegmentTable,
  type OfficialSideKind,
} from "@/lib/officialLotMeasurements";
import { ReleaseLotConfirmModal } from "@/components/map/ReleaseLotConfirmModal";
import {
  calculateLotDimensions,
  classifyLotSidesFromSegments,
  detectFront,
  extractSegments,
  mergeCurvedSegments,
  type Segment,
} from "@/utils/calculateLotDimensions";
import { formatStreetDisplay, resolveOfficialStreetLabel } from "@/lib/streetGuide";
import { flattenLineStringCoordinates } from "@/lib/streetGuideConfrontation";
import { computeOfficialLotLabelPosition } from "@/lib/lotLabelPosition";
import {
  formatSupabaseError,
  logSupabaseFrontSaveFailure,
  persistManualLotFront,
} from "@/lib/blockFrontPersist";
import {
  blockWithGeometryFromBounds,
  normalizeFrontSegmentIndexForPersist,
  resolveFrontStreetGuideForLot,
  resolveLotFrontStreetDisplay,
  streetFieldsFromGuideMatch,
  utmSegmentIndexFromWgs84RingEdge,
} from "@/lib/resolveFrontStreetGuide";
import {
  applyManualConfrontantToBlock,
  buildLotConfrontationAudit,
  buildOfficialLotConfrontationSegmentRows,
  clearManualConfrontantFromBlock,
  findPropagationTargets,
  officialSegmentIndexesForSide,
  type LotConfrontationAudit,
  type PropagationScope,
  type SegmentPersistScope,
} from "@/lib/assistedConfrontation";
import {
  sourceDisplayLabel,
  type ConfrontantPresetType,
} from "@/lib/confrontantTypes";
import type { SideRole } from "@/lib/lotSegmentConfrontation";
import {
  getSegmentConfrontantRecord,
  persistBlockSegmentsJson,
} from "@/lib/segmentConfrontantPersist";
import { InformConfrontantModal } from "@/components/map/InformConfrontantModal";
import { LotOfficialSidesEditor } from "@/components/map/LotOfficialSidesEditor";
import {
  canEditOfficialSides,
  restoreAutomaticOfficialSides,
  snapshotSegmentsJson,
  type ConfrontantDraftMap,
  type OfficialSideDraftMap,
} from "@/lib/officialSidePersist";
import { LotConfrontationsPanel } from "@/components/map/LotConfrontationsPanel";
import { loadLotConfrontations } from "@/lib/lotConfrontationsPanel";
import {
  DistanceMeasureMapContent,
  DistanceMeasureOverlay,
  useDistanceMeasureWithHud,
} from "@/components/map/DistanceMeasureTool";
import {
  AreaMeasureMapContent,
  AreaMeasureOverlay,
  useAreaMeasureWithHud,
} from "@/components/map/AreaMeasureTool";
import {
  isLotPolygonHitTestEnabled,
  syncLeafletPathInteractive,
} from "@/lib/gis/mapInteractionMode";
import { saveMapProjectCache, getMapProjectCache } from "@/lib/offline/store";
import { loadOfflineMapGeometries } from "@/lib/offline/projectsOfflineCache";
import {
  isBrowserOnline,
  blockOfflineSale,
  queueOfflineReservation,
} from "@/lib/offline/lotReservationOffline";
import { runLotGeometryDiagnosticReport } from "@/lib/lotGeometryDiagnostic";
import {
  gisPerfBeginSession,
  gisPerfFinishSession,
  gisPerfMarkEnd,
  gisPerfMarkStart,
  gisPerfMeasurePayloadBytes,
  gisPerfMeasureSync,
  gisPerfMemorySnapshot,
  gisPerfNote,
  gisPerfNoteAuditRebuild,
  gisPerfNoteGisMapRender,
  gisPerfNoteLoadLots,
  gisPerfLotEditBegin,
  gisPerfLotEditEnd,
  gisPerfLotEditMark,
  gisPerfRealtimePatchBegin,
  gisPerfRealtimePatchEnd,
  gisPerfRealtimePatchMark,
  gisPerfManualFrontBegin,
  gisPerfManualFrontEnd,
  gisPerfManualFrontMark,
  gisPerfNoteSetLots,
  gisPerfNoteRealtimeEvent,
  gisPerfNoteDuplicateRealtimeSuppressed,
  gisPerfNoteEdgeRender,
  gisPerfSetLotCount,
  gisPerfSummarizeBlocksPayload,
  isGisPerfDiagnosticsEnabled,
  readGisPerfTogglesFromSearch,
  type GisPerfToggleState,
} from "@/lib/gis/performance";
import {
  mapLotFromBlockRow,
  normalizeBlockKeyForMap,
} from "@/lib/gis/mapLotFromBlock";
import { collectNearbyLotIds } from "@/lib/gis/nearbyLots";
import {
  filterStreetGuidesNearLot,
  yieldToBrowser,
} from "@/lib/gis/uiYield";
import { buildAllPolysUtm } from "@/lib/lotSegmentConfrontation";

/**
 * Linhas auxiliares no mapa (investigação visual):
 * - measurement: DistanceMeasureTool Polyline (#ef4444) — independente de SHOW_AUXILIARY_LINES
 * - street guide: streetGuides Polyline (verde/cinza)
 * - block line: blocksData LineString (só com SHOW_AUXILIARY_LINES)
 * - boundary: LotBoundaryEdgePolylines (só com SHOW_BOUNDARY_LINES)
 * - temp/draw: DrawStreetInteraction (só marcadores, sem polyline)
 * Labels de lote: numeração cartográfica em círculo (LotLabelsOverlay)
 * Lotes: contorno via stroke sanitizado (SHOW_BOUNDARY_LINES)
 */
const SHOW_AUXILIARY_LINES = false;

/** Linhas de rua (street_guides) — independente de SHOW_AUXILIARY_LINES. */
const SHOW_STREET_GUIDE_LINES = true;

/** Contorno dos lotes (geometria sanitizada). */
const SHOW_BOUNDARY_LINES = true;

/** Lotes com histórico de linhas pretas / deslocamento visual */
const DEBUG_GIS_LOT_NUMBERS = new Set([
  "17", "18", "2", "4", "5",
  "29", "34", "35", "36", "38", "43", "46", "47", "48", "49", "50",
]);

/** Pontos removidos (vermelho) / mantidos (azul) no mapa */
const DEBUG_GIS_SANITIZE = false;

/** Remove vértice só se aresta > 2 km ou ponto fora do bbox da quadra (+200 m) */
const MAX_REMOVABLE_EDGE_METERS = 2000;
const BLOCK_BBOX_MARGIN_METERS = 200;

function isDebugGisLot(number: unknown): boolean {
  const num = normalizeLotDisplayNum(number);
  const raw = String(number ?? "").trim();
  return DEBUG_GIS_LOT_NUMBERS.has(num) || DEBUG_GIS_LOT_NUMBERS.has(raw);
}

/**
 * Modo exclusivo de medição: fecha popups, desativa doubleClickZoom do mapa
 * e marca o container (cursor/crosshair já é aplicado pelas tools).
 */
function GisMeasureExclusiveController({ active }: { active: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!active) {
      map.doubleClickZoom.enable();
      map.getContainer().classList.remove("gis-measure-mode");
      return;
    }
    map.closePopup();
    map.doubleClickZoom.disable();
    map.getContainer().classList.add("gis-measure-mode");
    return () => {
      map.doubleClickZoom.enable();
      map.getContainer().classList.remove("gis-measure-mode");
    };
  }, [active, map]);

  return null;
}

/** Mantém interactive sincronizado após mount (react-leaflet não reaplica a prop). */
function SyncPathHitTest({ interactive }: { interactive: boolean }) {
  const { overlayContainer } = useLeafletContext();
  useEffect(() => {
    syncLeafletPathInteractive(
      overlayContainer as L.Path | undefined,
      interactive,
    );
  }, [interactive, overlayContainer]);
  return null;
}

type LatLngPair = [number, number];

function normalizeLotDisplayNum(number: unknown): string {
  const raw = String(number ?? "");
  return (
    raw
      .replace(/[^0-9A-Za-z]/g, "")
      .replace(/.*linha.*/i, "")
      .replace(/.*kml.*/i, "") || raw.replace(/\D/g, "")
  );
}

function polygonCentroid(bounds: LatLngPair[]): LatLngPair {
  if (bounds.length === 0) return [0, 0];
  let lat = 0;
  let lng = 0;
  for (const [la, ln] of bounds) {
    lat += la;
    lng += ln;
  }
  return [lat / bounds.length, lng / bounds.length];
}

function distanceMeters(a: LatLngPair, b: LatLngPair): number {
  return L.latLng(a[0], a[1]).distanceTo(L.latLng(b[0], b[1]));
}

function isValidLatLngPair(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (Math.abs(lat) > 1_000 || Math.abs(lng) > 1_000) return false;
  return true;
}

function maxRingEdgeMeters(ring: LatLngPair[]): number {
  if (ring.length < 2) return 0;
  let max = 0;
  const closed = ring.length >= 3;
  const limit = closed ? ring.length : ring.length - 1;
  for (let i = 0; i < limit; i++) {
    const next = closed ? (i + 1) % ring.length : i + 1;
    max = Math.max(max, distanceMeters(ring[i], ring[next]));
  }
  return max;
}

type BlockBBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type RemovedVertex = {
  coord: LatLngPair;
  reason: "edge_too_long" | "outside_block_bbox";
  edgeMeters?: number;
  originalIndex: number;
};

type ValidateLotGeometryResult = {
  valid: boolean;
  cleanedCoords: LatLngPair[];
  removedVertices: RemovedVertex[];
  reason?: string;
};

function normalizeBlockKey(block: unknown): string {
  return String(block ?? "?").trim() || "?";
}

function expandBBoxMeters(bbox: BlockBBox, marginM: number): BlockBBox {
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const metersPerDegLat = 111_320;
  const metersPerDegLng =
    111_320 * Math.cos((centerLat * Math.PI) / 180) || 111_320;
  const dLat = marginM / metersPerDegLat;
  const dLng = marginM / metersPerDegLng;
  return {
    minLat: bbox.minLat - dLat,
    maxLat: bbox.maxLat + dLat,
    minLng: bbox.minLng - dLng,
    maxLng: bbox.maxLng + dLng,
  };
}

function isInsideBBox(p: LatLngPair, bbox: BlockBBox): boolean {
  const [lat, lng] = p;
  return (
    lat >= bbox.minLat &&
    lat <= bbox.maxLat &&
    lng >= bbox.minLng &&
    lng <= bbox.maxLng
  );
}

/** Bbox da quadra a partir de todos os vértices válidos dos lotes do mesmo bloco. */
function buildBlockBoundingBoxes(
  lots: Array<{ block?: string; bounds?: LatLngPair[] }>,
): Map<string, BlockBBox> {
  const byBlock = new Map<string, LatLngPair[]>();

  for (const lot of lots) {
    const key = normalizeBlockKey(lot.block);
    const pts = ((lot.bounds || []) as LatLngPair[]).filter(([lat, lng]) =>
      isValidLatLngPair(lat, lng),
    );
    if (pts.length === 0) continue;
    const existing = byBlock.get(key) || [];
    byBlock.set(key, existing.concat(pts));
  }

  const result = new Map<string, BlockBBox>();
  for (const [blockKey, pts] of byBlock) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const [lat, lng] of pts) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }
    result.set(
      blockKey,
      expandBBoxMeters({ minLat, maxLat, minLng, maxLng }, BLOCK_BBOX_MARGIN_METERS),
    );
  }
  return result;
}

function logSanitizeRemoval(
  lot: { number?: string; block?: string },
  originalCount: number,
  currentCount: number,
  removed: RemovedVertex,
) {
  console.log("GIS_SANITIZE_REMOVE", {
    lote: lot.number,
    quadra: lot.block,
    verticesOriginal: originalCount,
    verticesAtuais: currentCount,
    motivo: removed.reason,
    distanciaArestaRemovidaM: removed.edgeMeters,
    coordenadaRemovida: removed.coord,
  });
}

function logSanitizeDiagnostic(
  lot: { number?: string; block?: string },
  originalCount: number,
  result: ValidateLotGeometryResult,
) {
  console.log("GIS_SANITIZE_DIAG", {
    lote: lot.number,
    quadra: lot.block,
    verticesOriginal: originalCount,
    verticesAposSanitizacao: result.cleanedCoords.length,
    verticesRemovidos: result.removedVertices.length,
    removidos: result.removedVertices.map((r) => ({
      coordenada: r.coord,
      motivo: r.reason,
      distanciaArestaM: r.edgeMeters,
    })),
    valido: result.valid,
    motivoInvalido: result.reason,
  });
}

/**
 * Sanitiza geometria do lote: remove só outlier (aresta > 2 km ou fora do bbox da quadra).
 */
function validateLotGeometry(
  lot: { number?: string; block?: string; bounds?: LatLngPair[] },
  blockBBox: BlockBBox | null,
): ValidateLotGeometryResult {
  const original = (lot.bounds || []) as LatLngPair[];
  const originalCount = original.length;
  const removedVertices: RemovedVertex[] = [];

  let pts = original.filter(([lat, lng]) => isValidLatLngPair(lat, lng));

  if (pts.length < 2) {
    const empty: ValidateLotGeometryResult = {
      valid: false,
      cleanedCoords: pts,
      removedVertices,
      reason: "insufficient_geometry",
    };
    logSanitizeDiagnostic(lot, originalCount, empty);
    return empty;
  }

  const recordRemoval = (
    index: number,
    reason: RemovedVertex["reason"],
    edgeMeters?: number,
  ) => {
    const coord = pts[index];
    const entry: RemovedVertex = {
      coord,
      reason,
      edgeMeters,
      originalIndex: index,
    };
    removedVertices.push(entry);
    logSanitizeRemoval(lot, originalCount, pts.length - 1, entry);
    pts.splice(index, 1);
  };

  if (blockBBox) {
    for (let i = pts.length - 1; i >= 0; i--) {
      if (!isInsideBBox(pts[i], blockBBox)) {
        recordRemoval(i, "outside_block_bbox");
      }
    }
  }

  const maxEdgeIterations = Math.max(pts.length, 1);
  for (let iter = 0; iter < maxEdgeIterations && pts.length >= 2; iter++) {
    const n = pts.length;
    const edgeCount = n >= 3 ? n : n - 1;
    if (edgeCount < 1) break;

    let longest = 0;
    let removeIndex = -1;
    for (let i = 0; i < edgeCount; i++) {
      const j = n >= 3 ? (i + 1) % n : i + 1;
      const len = distanceMeters(pts[i], pts[j]);
      if (len > longest) {
        longest = len;
        removeIndex = j;
      }
    }

    if (longest <= MAX_REMOVABLE_EDGE_METERS || removeIndex < 0) break;
    if (pts.length < 4) break;

    recordRemoval(removeIndex, "edge_too_long", longest);
  }

  if (pts.length < 3) {
    const invalid: ValidateLotGeometryResult = {
      valid: false,
      cleanedCoords: pts,
      removedVertices,
      reason: "insufficient_geometry",
    };
    logSanitizeDiagnostic(lot, originalCount, invalid);
    return invalid;
  }

  const ok: ValidateLotGeometryResult = {
    valid: true,
    cleanedCoords: pts,
    removedVertices,
  };
  logSanitizeDiagnostic(lot, originalCount, ok);
  return ok;
}

/** Visualização temporária: vértices mantidos (azul) e removidos (vermelho). */
function GisSanitizeDebugMarkers({
  lotId,
  validation,
}: {
  lotId: string;
  validation: ValidateLotGeometryResult;
}) {
  if (!DEBUG_GIS_SANITIZE) return null;

  return (
    <>
      {validation.cleanedCoords.map((p, idx) => (
        <CircleMarker
          key={`${lotId}-keep-${idx}`}
          center={p}
          radius={6}
          pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 2 }}
        />
      ))}
      {validation.removedVertices.map((r, idx) => (
        <CircleMarker
          key={`${lotId}-rm-${idx}`}
          center={r.coord}
          radius={7}
          pathOptions={{ color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 0.95, weight: 2 }}
        />
      ))}
    </>
  );
}

type ValidatedLotForBounds = {
  number?: string;
  block?: string;
  cleanedCoords: LatLngPair[];
};

/** Pontos seguros para fitBounds — só geometria validada, sem outliers. */
function getSafeMapBounds(
  validatedLots: ValidatedLotForBounds[],
  blockBoundingBoxes: Map<string, BlockBBox>,
): LatLngPair[] {
  const rawBounds: LatLngPair[] = [];
  const candidates: { point: LatLngPair; lotNumber?: string }[] = [];

  for (const lot of validatedLots) {
    if (lot.cleanedCoords.length < 3) continue;

    const blockKey = normalizeBlockKey(lot.block);
    const blockBBox = blockBoundingBoxes.get(blockKey) ?? null;

    for (const p of lot.cleanedCoords) {
      if (!isValidLatLngPair(p[0], p[1])) {
        console.log("FITBOUNDS_IGNORED_POINT", p, lot.number, "invalid_pair");
        continue;
      }
      rawBounds.push(p);

      if (blockBBox && !isInsideBBox(p, blockBBox)) {
        console.log(
          "FITBOUNDS_IGNORED_POINT",
          p,
          lot.number,
          "outside_block_bbox",
        );
        continue;
      }

      candidates.push({ point: p, lotNumber: lot.number });
    }
  }

  console.log("FITBOUNDS_RAW", rawBounds);

  let clusterCandidates = [...candidates];
  for (let iter = 0; iter < 5 && clusterCandidates.length > 0; iter++) {
    const clusterPoints = clusterCandidates.map((c) => c.point);
    const centroid = polygonCentroid(clusterPoints);
    const next = clusterCandidates.filter((c) => {
      const ok =
        distanceMeters(c.point, centroid) <= MAX_REMOVABLE_EDGE_METERS;
      if (!ok) {
        console.log(
          "FITBOUNDS_IGNORED_POINT",
          c.point,
          c.lotNumber,
          "outside_main_cluster",
        );
      }
      return ok;
    });
    if (next.length === clusterCandidates.length) break;
    clusterCandidates = next;
  }

  const safeBounds = clusterCandidates.map((c) => c.point);
  console.log("FITBOUNDS_SAFE", safeBounds);
  return safeBounds;
}

type ParsedBlockGeometry = {
  bounds: LatLngPair[];
  geometryType: string;
  coordCount: number;
};

/** Extrai anel lat/lng de block.geometry (Polygon, LineString, Multi*). */
function boundsFromBlockGeometry(
  block: Record<string, unknown>,
  lotNumber: unknown,
): ParsedBlockGeometry {
  const geom = block.geometry as {
    type?: string;
    coordinates?: unknown;
  } | null;

  if (!geom?.type || !geom.coordinates) {
    return { bounds: [], geometryType: "none", coordCount: 0 };
  }

  const gType = geom.type;
  let ring: number[][] = [];

  if (gType === "Polygon") {
    const poly = geom.coordinates as number[][][];
    ring = (poly?.[0] as number[][]) || [];
  } else if (gType === "LineString") {
    ring = geom.coordinates as number[][];
  } else if (gType === "MultiPolygon") {
    const multi = geom.coordinates as number[][][][];
    ring = (multi?.[0]?.[0] as number[][]) || [];
  } else if (gType === "MultiLineString") {
    const multi = geom.coordinates as number[][][];
    ring = (multi?.[0] as number[][]) || [];
  }

  const bounds: LatLngPair[] = [];
  if (!Array.isArray(ring)) {
    return { bounds, geometryType: gType, coordCount: 0 };
  }
  for (const c of ring) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (isValidLatLngPair(lat, lng)) bounds.push([lat, lng]);
  }

  if (isDebugGisLot(lotNumber)) {
    console.log("GIS_GEOMETRY_PARSE", {
      lote: lotNumber,
      geometryType: gType,
      coordCount: bounds.length,
      flatCoordsLen: Array.isArray(geom.coordinates)
        ? (geom.coordinates as unknown[]).flat(3).length
        : 0,
    });
  }

  return { bounds, geometryType: gType, coordCount: bounds.length };
}

function logGeometryRender(
  kind: "Polygon" | "Polyline",
  lot: { number?: string; geometryType?: string },
  pointCount: number,
) {
  if (!isDebugGisLot(lot.number)) return;
  console.log("Polyline renderizada", kind === "Polyline" ? lot.geometryType || "boundary-edge" : "Polygon-fill");
  console.log("Quantidade de pontos", pointCount);
  console.log("Lote", lot.number, "tipo", lot.geometryType || kind);
}

/** Arestas explícitas do polígono — só quando SHOW_BOUNDARY_LINES=true. */
function edgeColorForConfrontStatus(
  status: 'resolved' | 'pending' | 'manual' | 'conflict' | undefined,
): string {
  switch (status) {
    case 'pending':
      return '#eab308';
    case 'manual':
      return '#3b82f6';
    case 'conflict':
      return '#ef4444';
    case 'resolved':
      return '#22c55e';
    default:
      return '#94a3b8';
  }
}

function officialSideEdgeColor(
  side: OfficialSideKind | null | undefined,
  selected: boolean,
): string {
  if (selected) return "#22d3ee";
  if (side === "front") return "#22c55e";
  if (side === "back") return "#3b82f6";
  if (side === "right") return "#f59e0b";
  if (side === "left") return "#a855f7";
  return "#94a3b8";
}

function LotBoundaryEdgePolylines({
  positions,
  lot,
  strokeColor,
  frontCorrectActive,
  onEdgePick,
  assistedConfrontationActive,
  onConfrontEdgePick,
  segmentEdgeByIndex,
  officialSidesEditActive,
  officialSideByIndex,
  officialSidesSelected,
  onOfficialSideEdgePick,
  suspendLotHitTest = false,
  boundaryEnabled = true,
}: {
  positions: LatLngPair[];
  lot: { id?: string; number?: string; geometryType?: string };
  strokeColor: string;
  frontCorrectActive?: boolean;
  onEdgePick?: (segmentIndex: number) => void;
  assistedConfrontationActive?: boolean;
  onConfrontEdgePick?: (segmentIndex: number) => void;
  segmentEdgeByIndex?: Map<
    number,
    {
      status: 'resolved' | 'pending' | 'manual' | 'conflict';
      confrontant?: string | null;
    }
  >;
  officialSidesEditActive?: boolean;
  officialSideByIndex?: Map<number, OfficialSideKind | null>;
  officialSidesSelected?: number[];
  onOfficialSideEdgePick?: (segmentIndex: number, additive: boolean) => void;
  /** Medição / desenho de rua: arestas não capturam clique. */
  suspendLotHitTest?: boolean;
  /** Diagnóstico Preview (?gisPerf): desliga arestas SVG. */
  boundaryEnabled?: boolean;
}) {
  const showEdges =
    (boundaryEnabled && SHOW_BOUNDARY_LINES) ||
    frontCorrectActive ||
    assistedConfrontationActive ||
    officialSidesEditActive;
  if (!showEdges || positions.length < 2) return null;

  const lines: React.ReactNode[] = [];
  const isRing = positions.length >= 3;
  const edgeCount = isRing ? positions.length : positions.length - 1;
  const selectedSet = new Set(officialSidesSelected ?? []);

  for (let i = 0; i < edgeCount; i++) {
    const a = positions[i];
    const b = positions[isRing ? (i + 1) % positions.length : i + 1];
    const seg: LatLngPair[] = [a, b];
    logGeometryRender("Polyline", { ...lot, geometryType: "boundary-edge" }, seg.length);
    const edgeMeta = segmentEdgeByIndex?.get(i);
    const pickConfront = Boolean(
      assistedConfrontationActive && onConfrontEdgePick,
    );
    const pickFront = Boolean(frontCorrectActive && onEdgePick);
    const pickOfficial = Boolean(
      officialSidesEditActive && onOfficialSideEdgePick,
    );
    const officialSide = officialSideByIndex?.get(i) ?? null;
    const isOfficialSelected = selectedSet.has(i);
    const color = pickOfficial
      ? officialSideEdgeColor(officialSide, isOfficialSelected)
      : pickConfront
        ? edgeColorForConfrontStatus(edgeMeta?.status)
        : frontCorrectActive
          ? "#f59e0b"
          : strokeColor;
    const tooltipParts: string[] = [];
    if (pickOfficial) {
      tooltipParts.push(`Seg. ${i + 1}`);
      if (officialSide === "front") tooltipParts.push("Frente");
      else if (officialSide === "back") tooltipParts.push("Fundo");
      else if (officialSide === "right") tooltipParts.push("Direito");
      else if (officialSide === "left") tooltipParts.push("Esquerdo");
      else tooltipParts.push("Sem lado");
    } else if (edgeMeta?.status === 'manual' && edgeMeta.confrontant) {
      tooltipParts.push(`Confrontação manual: ${edgeMeta.confrontant}`);
    } else if (edgeMeta?.status === 'pending') {
      tooltipParts.push('Confrontação pendente (A DEFINIR)');
    } else if (edgeMeta?.confrontant) {
      tooltipParts.push(edgeMeta.confrontant);
    }
    const tooltipText =
      tooltipParts.length > 0 ? tooltipParts.join(" · ") : undefined;
    const edgeInteractive =
      !suspendLotHitTest && (pickConfront || pickFront || pickOfficial);
    const heavy =
      pickConfront || frontCorrectActive || pickOfficial;
    lines.push(
      <Polyline
        key={`${lot.id ?? lot.number}-edge-${i}-hit-${edgeInteractive ? 1 : 0}`}
        positions={seg}
        interactive={edgeInteractive}
        pathOptions={{
          color,
          weight: isOfficialSelected ? 7 : heavy ? 5 : 1,
          opacity: heavy ? 1 : 0.9,
        }}
        eventHandlers={
          suspendLotHitTest
            ? undefined
            : pickOfficial
              ? {
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    const oe = e.originalEvent as
                      | MouseEvent
                      | undefined;
                    onOfficialSideEdgePick!(
                      i,
                      Boolean(
                        oe?.shiftKey || oe?.ctrlKey || oe?.metaKey,
                      ),
                    );
                  },
                }
              : pickConfront
              ? {
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    onConfrontEdgePick!(i);
                  },
                }
              : pickFront
                ? {
                    click: (e) => {
                      L.DomEvent.stopPropagation(e);
                      onEdgePick!(i);
                    },
                  }
                : undefined
        }
      >
        <SyncPathHitTest interactive={edgeInteractive} />
        {tooltipText && !suspendLotHitTest ? (
          <Tooltip sticky direction="top">
            {tooltipText}
          </Tooltip>
        ) : null}
      </Polyline>,
    );
  }

  return <>{lines}</>;
}

const LotBoundaryEdgePolylinesMemo = memo(LotBoundaryEdgePolylines);

/** Deslocamento do número para dentro do lote (frente identificada). */
const LABEL_INWARD_OFFSET_METERS = 2.5;
const STREET_FRONT_MAX_SCORE_METERS = 50;

type StreetGuideForLabel = {
  visible?: boolean;
  active?: boolean;
  geometry?: { coordinates?: number[][] };
  geometry_geojson?: { coordinates?: number[][] };
};

type LotLabelMeta = {
  frente?: number | null;
  frontSegmentIndex?: number | null;
  frontStreetName?: string | null;
  frontStreetDisplay?: string | null;
  frontStreetId?: string | null;
};

type LotLabelItem = {
  id: string;
  bounds: LatLngPair[];
  displayNum: string;
  lot: LotLabelMeta & { number?: string };
};

function boundsToLngLatRing(bounds: LatLngPair[]): number[][] {
  const ring = bounds.map(([lat, lng]) => [lng, lat] as [number, number]);
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

function offsetPointToward(
  from: LatLngPair,
  toward: LatLngPair,
  meters: number,
): LatLngPair {
  const dist = distanceMeters(from, toward);
  if (dist < 0.5) return from;
  const t = Math.min(meters / dist, 0.5);
  return [
    from[0] + (toward[0] - from[0]) * t,
    from[1] + (toward[1] - from[1]) * t,
  ];
}

function distancePointToSegmentMeters(
  point: LatLngPair,
  a: LatLngPair,
  b: LatLngPair,
): number {
  const P = L.latLng(point[0], point[1]);
  const A = L.latLng(a[0], a[1]);
  const B = L.latLng(b[0], b[1]);
  let minD = Math.min(P.distanceTo(A), P.distanceTo(B));
  for (let t = 0.2; t <= 0.8; t += 0.2) {
    const Q = L.latLng(
      A.lat + (B.lat - A.lat) * t,
      A.lng + (B.lng - A.lng) * t,
    );
    minD = Math.min(minD, P.distanceTo(Q));
  }
  return minD;
}

function minDistancePointToPolyline(
  point: LatLngPair,
  lineLngLat: number[][],
): number {
  let min = Infinity;
  for (let i = 0; i < lineLngLat.length - 1; i++) {
    const a: LatLngPair = [lineLngLat[i][1], lineLngLat[i][0]];
    const b: LatLngPair = [lineLngLat[i + 1][1], lineLngLat[i + 1][0]];
    min = Math.min(min, distancePointToSegmentMeters(point, a, b));
  }
  return min;
}

/** Mesma lógica de “Identificar Frentes”, em runtime para posicionar o label. */
function findFrontSegmentByStreetGuides(
  ring: number[][],
  guides: StreetGuideForLabel[],
) {
  const segments = extractSegments(ring, []);
  if (segments.length === 0 || guides.length === 0) return null;

  let bestSegment: (typeof segments)[0] | null = null;
  let bestScore = Infinity;

  for (const seg of segments) {
    const p1: LatLngPair = [seg.p1[1], seg.p1[0]];
    const p2: LatLngPair = [seg.p2[1], seg.p2[0]];

    for (const guide of guides) {
      if (guide.visible === false || guide.active === false) continue;
      const geo = guide.geometry_geojson || guide.geometry;
      const coords = geo?.coordinates;
      if (!coords || coords.length < 2) continue;

      const distP1 = minDistancePointToPolyline(p1, coords);
      const distP2 = minDistancePointToPolyline(p2, coords);
      const avgDist = (distP1 + distP2) / 2;
      const parallelVariance = Math.abs(distP1 - distP2);
      const score = avgDist + parallelVariance * 3;

      if (score < bestScore) {
        bestScore = score;
        bestSegment = seg;
      }
    }
  }

  if (bestSegment && bestScore < STREET_FRONT_MAX_SCORE_METERS) {
    return bestSegment;
  }
  return null;
}

function pickFrontSegmentByFrenteLength(
  segments: ReturnType<typeof extractSegments>,
  frenteLen: number,
) {
  const pool = segments.filter((s) => s.isExternal);
  const candidates = pool.length > 0 ? pool : segments;
  const match = candidates.reduce((best, s) => {
    const d = Math.abs(s.length - frenteLen);
    const bd = Math.abs(best.length - frenteLen);
    return d < bd ? s : best;
  });
  if (Math.abs(match.length - frenteLen) <= Math.max(frenteLen * 0.4, 4)) {
    return match;
  }
  return null;
}

function frontSegmentMidpoint(seg: {
  p1: number[];
  p2: number[];
}): LatLngPair {
  return [(seg.p1[1] + seg.p2[1]) / 2, (seg.p1[0] + seg.p2[0]) / 2];
}

/** Rótulo obedece front_segment_index oficial — não depende de linhas de rua visíveis. */
function computeLotLabelPosition(
  bounds: LatLngPair[],
  lot?: LotLabelMeta & { front_segment_index?: number | null },
): LatLngPair {
  return computeOfficialLotLabelPosition(bounds, {
    frente: lot?.frente,
    frontSegmentIndex:
      lot?.frontSegmentIndex ?? lot?.front_segment_index ?? null,
    frontStreetName: lot?.frontStreetName,
    frontStreetDisplay: lot?.frontStreetDisplay,
    frontStreetId: lot?.frontStreetId,
    segments_json: (lot as { segments_json?: unknown })?.segments_json,
  });
}

function labelCircleSizePx(zoom: number): number {
  if (zoom >= 21) return 26;
  if (zoom >= 19) return 22;
  if (zoom >= 17) return 19;
  if (zoom >= 15) return 16;
  if (zoom >= 13) return 13;
  return 10;
}

function buildLabelBadgeHtml(
  displayNum: string,
  sizePx: number,
  offsetX: number,
  offsetY: number,
): string {
  const fontSize =
    displayNum.length >= 3
      ? Math.max(8, Math.round(sizePx * 0.34))
      : Math.max(9, Math.round(sizePx * 0.44));
  return `<div class="lot-map-label-badge" style="width:${sizePx}px;height:${sizePx}px;font-size:${fontSize}px;transform:translate(calc(-50% + ${offsetX}px),calc(-50% + ${offsetY}px))"><span>${displayNum}</span></div>`;
}

function resolveLabelPixelOffsets(
  map: L.Map,
  entries: { id: string; position: LatLngPair }[],
  badgeSize: number,
): Record<string, [number, number]> {
  const minGap = badgeSize + 3;
  const points = entries.map((e) => ({
    id: e.id,
    pt: map.latLngToContainerPoint(L.latLng(e.position[0], e.position[1])),
  }));
  const offsets: Record<string, [number, number]> = {};

  for (let i = 0; i < points.length; i++) {
    let ox = 0;
    let oy = 0;
    for (let j = 0; j < i; j++) {
      const oj = offsets[points[j].id] || [0, 0];
      const dx = points[i].pt.x + ox - (points[j].pt.x + oj[0]);
      const dy = points[i].pt.y + oy - (points[j].pt.y + oj[1]);
      const dist = Math.hypot(dx, dy);
      if (dist > 0 && dist < minGap) {
        const push = (minGap - dist) * 0.55;
        ox += (dx / dist) * push;
        oy += (dy / dist) * push;
      }
    }
    offsets[points[i].id] = [Math.round(ox), Math.round(oy)];
  }
  return offsets;
}

function LotCartographicLabelMarker({
  position,
  displayNum,
  mapZoom,
  pixelOffset,
}: {
  position: LatLngPair;
  displayNum: string;
  mapZoom: number;
  pixelOffset: [number, number];
}) {
  const sizePx = labelCircleSizePx(mapZoom);
  const icon = L.divIcon({
    className: "lot-map-label-marker",
    html: buildLabelBadgeHtml(
      displayNum,
      sizePx,
      pixelOffset[0],
      pixelOffset[1],
    ),
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  return (
    <Marker
      position={position}
      icon={icon}
      interactive={false}
      zIndexOffset={600}
    />
  );
}

function LotLabelsOverlay({
  items,
  mapZoom,
  enabled,
}: {
  items: LotLabelItem[];
  mapZoom: number;
  enabled: boolean;
}) {
  const map = useMap();
  const [pixelOffsets, setPixelOffsets] = useState<Record<string, [number, number]>>(
    {},
  );

  const labelPositions = useMemo(() => {
    const mapPos = new Map<string, LatLngPair>();
    for (const item of items) {
      try {
        const pos = computeLotLabelPosition(item.bounds, item.lot);
        if (
          Number.isFinite(pos[0]) &&
          Number.isFinite(pos[1])
        ) {
          mapPos.set(item.id, pos);
          continue;
        }
      } catch {
        // centróide por lote — não derruba o mapa
      }
      mapPos.set(item.id, polygonCentroid(item.bounds));
    }
    return mapPos;
  }, [items]);

  useEffect(() => {
    if (!enabled || items.length === 0) {
      setPixelOffsets({});
      return;
    }

    const updateOffsets = () => {
      const sizePx = labelCircleSizePx(mapZoom);
      const entries = items.map((item) => ({
        id: item.id,
        position: labelPositions.get(item.id) || polygonCentroid(item.bounds),
      }));
      setPixelOffsets(resolveLabelPixelOffsets(map, entries, sizePx));
    };

    updateOffsets();
    map.on("zoomend", updateOffsets);
    map.on("moveend", updateOffsets);
    map.on("resize", updateOffsets);
    return () => {
      map.off("zoomend", updateOffsets);
      map.off("moveend", updateOffsets);
      map.off("resize", updateOffsets);
    };
  }, [enabled, items, labelPositions, map, mapZoom]);

  if (!enabled || items.length === 0) return null;

  return (
    <>
      {items.map((item) => {
        const position =
          labelPositions.get(item.id) || polygonCentroid(item.bounds);
        return (
          <LotCartographicLabelMarker
            key={`label-${item.id}-${mapZoom}-${(pixelOffsets[item.id] || [0, 0]).join(",")}`}
            position={position}
            displayNum={item.displayNum}
            mapZoom={mapZoom}
            pixelOffset={pixelOffsets[item.id] || [0, 0]}
          />
        );
      })}
    </>
  );
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "Disponível":
      return "#22C55E";
    case "Reservado":
      return "#EAB308";
    case "Vendido":
      return "#EF4444";
    default:
      return "#22C55E";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "Disponível":
      return "DISPONÍVEL";
    case "Reservado":
      return "RESERVADO";
    case "Vendido":
      return "VENDIDO";
    default:
      return "DISPONÍVEL";
  }
};

const isLotSold = (status?: string) => {
  const normalized = String(status || "").toLowerCase().trim();
  return ["vendido", "sold", "venda", "sold_out"].includes(normalized);
};

const isLotReserved = (status?: string) => {
  const normalized = String(status || "").toLowerCase().trim();
  return normalized === "reservado" || normalized === "reserved";
};

/** Vendido/reservado ou vínculo comercial — exige fluxo servidor de liberação. */
const lotNeedsReleaseConfirm = (lot: {
  status?: string | null;
  saleId?: string | null;
  sale_id?: string | null;
  contractId?: string | null;
  contract_id?: string | null;
  customerId?: string | null;
  customer_id?: string | null;
}) => {
  if (isLotSold(lot.status || undefined) || isLotReserved(lot.status || undefined)) {
    return true;
  }
  return Boolean(
    lot.saleId ||
      lot.sale_id ||
      lot.contractId ||
      lot.contract_id ||
      lot.customerId ||
      lot.customer_id,
  );
};

const isVendidoStatus = (status: string) => {
  const s = String(status || "").toLowerCase().trim();
  return s === "vendido" || s === "sold";
};

/** Numeração via API (service role) — evita RLS vazio no browser. */
async function fetchNextContractNumberFromApi(
  tenantId: string,
  companyId: string,
): Promise<string> {
  const res = await fetch("/api/contracts/next-number", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, companyId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      json?.error || `Falha ao gerar número do contrato (${res.status})`,
    );
  }

  const num = String(json.contract_number || "").trim();
  if (!isValidStoredContractNumber(num)) {
    throw new Error("Número de contrato retornado em formato inválido");
  }
  return num;
}

async function fetchBlockForContract(lotId: string) {
  const { data, error } = await supabase
    .from("blocks")
    .select("*")
    .eq("id", lotId)
    .maybeSingle();
  if (error) {
    console.error("[VENDA] erro ao buscar block para contrato:", error);
  }
  return data;
}

/** Insere contrato com payloads progressivos (colunas opcionais / schema drift). */
async function insertContractForSale(
  payloads: Record<string, unknown>[],
): Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }> {
  let lastError: { message?: string } | null = null;

  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined),
    );

    console.log(`[VENDA] tentativa insert contrato #${i + 1}`, {
      keys: Object.keys(cleaned),
      sale_id: cleaned.sale_id,
      block_id: cleaned.block_id,
    });

    const { data, error } = await supabase
      .from("contracts")
      .insert([cleaned])
      .select("*")
      .single();

    if (!error && data) {
      console.log("[VENDA] contrato criado", {
        id: data.id,
        contract_number: data.contract_number,
      });
      return { data, error: null };
    }

    lastError = error;
    console.error("[VENDA] erro ao criar contrato (tentativa)", error?.message, error?.code);

    const missingCol = error?.message?.match(/Could not find the '(\w+)' column/i)?.[1];
    if (missingCol && missingCol in cleaned) {
      const { [missingCol]: _removed, ...withoutCol } = cleaned;
      const retry = await supabase.from("contracts").insert([withoutCol]).select("*").single();
      if (!retry.error && retry.data) {
        console.log("[VENDA] contrato criado (retry sem coluna)", missingCol);
        return { data: retry.data, error: null };
      }
      lastError = retry.error;
      console.error("[VENDA] retry contrato falhou", retry.error?.message);
    }
  }

  return { data: null, error: lastError };
}

function MapController({
  safeBounds,
  refreshKey,
  projectId,
  focusBlockName,
  focusBlockKey = 0,
  enableFitBounds = true,
}: {
  safeBounds: LatLngPair[];
  refreshKey?: number;
  projectId?: string;
  focusBlockName?: string | null;
  focusBlockKey?: number;
  /** Diagnóstico: desliga fitBounds para medir impacto. */
  enableFitBounds?: boolean;
}) {
  const map = useMap();
  const lastFitBoundsKey = useRef<{
    projectId?: string;
    refreshKey?: number;
    focusBlockName?: string | null;
    focusBlockKey?: number;
  }>({});

  useEffect(() => {
    if (!enableFitBounds) return;
    if (safeBounds.length === 0) return;

    const needFitBounds =
      lastFitBoundsKey.current.projectId !== projectId ||
      lastFitBoundsKey.current.refreshKey !== refreshKey ||
      lastFitBoundsKey.current.focusBlockName !== focusBlockName ||
      lastFitBoundsKey.current.focusBlockKey !== focusBlockKey;

    if (!needFitBounds) return;

    gisPerfMarkStart('gis_fit_bounds');
    map.fitBounds(L.latLngBounds(safeBounds), {
      padding: [50, 50],
      maxZoom: 20,
    });
    gisPerfMarkEnd('gis_fit_bounds', { points: safeBounds.length });
    lastFitBoundsKey.current = {
      projectId,
      refreshKey,
      focusBlockName,
      focusBlockKey,
    };
  }, [
    safeBounds,
    map,
    refreshKey,
    projectId,
    focusBlockName,
    focusBlockKey,
    enableFitBounds,
  ]);
  return null;
}

function LocationController({ active }: { active: boolean }) {
  const map = useMap();
  const [position, setPosition] = useState<L.LatLng | null>(null);

  useEffect(() => {
    let watchId: number;

    if (active) {
      if ("geolocation" in navigator) {
        const geoOptions = {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        };

        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const newPos = L.latLng(pos.coords.latitude, pos.coords.longitude);
            setPosition(newPos);
            // We only want to setView on the first fix, or periodically.
            // Let's use map.flyTo to smoothly pan if we are far, or on initial.
            map.setView(newPos, map.getZoom() > 19 ? map.getZoom() : 20);
          },
          (err) => {
            console.error("Erro de GPS no iOS:", err);
          },
          geoOptions,
        );
      }
    } else {
      setTimeout(() => setPosition(null), 0);
    }

    return () => {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [active, map]);

  if (!active || !position) return null;

  const pulseIcon = L.divIcon({
    className: "custom-pulse-icon",
    html: `<div class="gps-pulse-marker"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  return (
    <>
      <style>{`
        .gps-pulse-marker {
          width: 20px;
          height: 20px;
          background-color: #3b82f6;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 0 10px rgba(0,0,0,0.5);
          position: relative;
        }
        .gps-pulse-marker::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 100%;
          height: 100%;
          transform: translate(-50%, -50%);
          background-color: #3b82f6;
          border-radius: 50%;
          animation: pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
          z-index: -1;
        }
        @keyframes pulse-ring {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
        }
      `}</style>
      <Marker position={position} icon={pulseIcon} zIndexOffset={1000} />
    </>
  );
}


const MAX_URBAN_SIDE_METERS = 500;
type CleanLotMeasurements = {
  frente: number | null;
  fundo: number | null;
  ladoDireito: number | null;
  ladoEsquerdo: number | null;
  chanfre: ChanfreInfo | null;
  curva: import("@/lib/officialLotMeasurements").OfficialLotCurveInfo | null;
  area: number | null;
  perimeter: number | null;
};

function isPlausibleUrbanSideMeters(value: number | null | undefined): boolean {
  return (
    value != null &&
    Number.isFinite(value) &&
    value > 0.01 &&
    value <= MAX_URBAN_SIDE_METERS
  );
}

function isPlausibleUrbanAreaM2(value: number | null | undefined): boolean {
  return (
    value != null && Number.isFinite(value) && value > 1 && value <= 50_000
  );
}

function pickPopupSideValue(
  dbValue: unknown,
  cleanValue: number | null | undefined,
): number | null {
  const db = parseBlockSideLength(dbValue);
  const clean =
    cleanValue != null && Number.isFinite(Number(cleanValue))
      ? Number(cleanValue)
      : null;

  if (!isPlausibleUrbanSideMeters(db)) {
    return isPlausibleUrbanSideMeters(clean) ? clean : null;
  }
  if (!isPlausibleUrbanSideMeters(clean)) {
    return db;
  }

  const diff = Math.abs(db! - clean!);
  const rel = diff / Math.max(clean!, 1);
  if (rel > 0.25) {
    return clean;
  }
  if (db! > clean! * 1.5 || db! < clean! / 1.5) {
    return clean;
  }
  return db;
}

function polygonPerimeterM(ring: LatLngPair[]): number {
  if (ring.length < 2) return 0;
  let total = 0;
  const closed = ring.length >= 3;
  const limit = closed ? ring.length : ring.length - 1;
  for (let i = 0; i < limit; i++) {
    const j = closed ? (i + 1) % ring.length : i + 1;
    total += distanceMeters(ring[i], ring[j]);
  }
  return total;
}

function polygonAreaM2(ring: LatLngPair[]): number {
  if (ring.length < 3) return 0;
  const centerLat =
    ring.reduce((sum, [lat]) => sum + lat, 0) / ring.length;
  const mPerDegLat = 111_320;
  const mPerDegLng =
    111_320 * Math.cos((centerLat * Math.PI) / 180) || 111_320;

  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [lat1, lng1] = ring[i];
    const [lat2, lng2] = ring[j];
    const x1 = lng1 * mPerDegLng;
    const y1 = lat1 * mPerDegLat;
    const x2 = lng2 * mPerDegLng;
    const y2 = lat2 * mPerDegLat;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) * 0.5;
}

function chanfreFromClassified(
  classified: ReturnType<typeof classifyLotSidesFromSegments>,
): ChanfreInfo | null {
  if (classified.chanfro <= 0) return null;
  const segments = classified.segmentDebug
    .filter((s) => s.role === "chanfre")
    .map((s) => s.length);
  return {
    total: classified.chanfro,
    segments: segments.length > 0 ? segments : [classified.chanfro],
  };
}

/** Medidas do popup — fonte oficial: segmentos TXT Civil 3D (não geometria Leaflet). */
function getOfficialLotMeasurementsForPopup(
  lot: Record<string, unknown>,
): CleanLotMeasurements {
  try {
    const official = getOfficialLotMeasurements(lot, lot.number);
    const sides = official.sides;
    return {
      frente: sides?.front.total ?? official.frente,
      fundo: sides?.back.total ?? official.fundo,
      ladoDireito: sides?.right.total ?? official.ladoDireito,
      ladoEsquerdo: sides?.left.total ?? official.ladoEsquerdo,
      chanfre: official.chanfre,
      curva: official.curva,
      area: official.area ?? parseBlockSideLength(lot.area),
      perimeter: official.perimeter,
    };
  } catch (err) {
    console.warn('GIS_POPUP_MEASURES_FALLBACK', lot.id ?? lot.number, err);
    return {
      frente: parseBlockSideLength(lot.frente),
      fundo: parseBlockSideLength(lot.Fundo ?? lot.fundo),
      ladoDireito: parseBlockSideLength(lot['Lado Dir.']),
      ladoEsquerdo: parseBlockSideLength(lot['Lado Esq.']),
      chanfre: null,
      curva: null,
      area: parseBlockSideLength(lot.area),
      perimeter: null,
    };
  }
}

function popupMeasureLabel(value: number | null | undefined): string {
  if (value != null && Number.isFinite(value)) {
    return `${value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} m`;
  }
  return "—";
}

/** Único popup comercial do mapa GIS (Disponibilizar / Reservar / Vender / Editar Venda). */
function LotPopupContent({
  lot,
  cleanedCoords,
  streetGuides = [],
  onAction,
  onRequestCustomerForm,
  onRequestClear,
  onEditSale,
  onViewContract,
  onRegenerateContract,
  onViewFinance,
  canEditSale,
  userRole,
  actionLoading,
  frontCorrectActive,
  onStartCorrectFront,
  onCancelCorrectFront,
  onPickFrontSegment,
  frontCorrectSaving,
  confrontationAudit,
  onEditConfrontationSide,
  onEditConfrontationSegment,
  allBlocksForConfront = [],
  onGenerateMemorial,
  onGenerateLotSheet,
  onEditOfficialSides,
  embedOfficialSidesEditor = false,
  officialSidesSelected = [],
  onOfficialSidesEditorSlot,
  officialSidesSaving = false,
  onPersistOfficialSides,
  onPriceSaved,
  canEditLotPrice = false,
}: {
  lot: any;
  cleanedCoords?: LatLngPair[];
  streetGuides?: any[];
  onAction: (lot: any, action: string, newPrice?: number) => void;
  onRequestCustomerForm: (lot: any, action: string, newPrice: number) => void;
  onRequestClear: (lot: any, newPrice: number) => void;
  onEditSale?: (lot: any) => void;
  onViewContract?: (lot: any) => void;
  onRegenerateContract?: (lot: any) => void;
  onViewFinance?: (lot: any) => void;
  canEditSale?: boolean;
  userRole?: string | null;
  actionLoading: string | null;
  frontCorrectActive?: boolean;
  onStartCorrectFront?: (lot: any) => void;
  onCancelCorrectFront?: () => void;
  onPickFrontSegment?: (lot: any, segmentIndex: number) => void;
  frontCorrectSaving?: boolean;
  /** Opcional — usado só como fallback de rótulo; a aba Confrontações carrega sozinha. */
  confrontationAudit?: LotConfrontationAudit | null;
  onEditConfrontationSide?: (lot: any, side: SideRole) => void;
  onEditConfrontationSegment?: (
    lot: any,
    side: SideRole,
    segmentIndexes: number[],
  ) => void;
  allBlocksForConfront?: Record<string, unknown>[];
  onGenerateMemorial?: (lot: any) => void;
  onGenerateLotSheet?: (lot: any) => void;
  onEditOfficialSides?: (lot: any, initialSelected?: number[]) => void;
  embedOfficialSidesEditor?: boolean;
  officialSidesSelected?: number[];
  onOfficialSidesEditorSlot?: (el: HTMLElement | null) => void;
  officialSidesSaving?: boolean;
  onPersistOfficialSides?: (
    patched: Record<string, unknown>,
    sideDraft: OfficialSideDraftMap,
    confrontantDraft: ConfrontantDraftMap,
  ) => Promise<void>;
  /** Atualiza blocks.price no estado do mapa após salvar manualmente. */
  onPriceSaved?: (lotId: string, price: number | null) => void;
  /** ADMIN / SUPER_ADMIN — OWNER e corretor não editam preço. */
  canEditLotPrice?: boolean;
}) {
  const ownerReadOnly = isOwnerRole(userRole);
  console.log("GIS_POPUP_RENDER", {
    lotId: lot?.id,
    status: lot?.status,
    component: "LotPopupContent",
    file: "components/map/GISMap.tsx",
  });

  const color = getStatusColor(lot.status);
  const isSold = isLotSold(lot.status);

  console.log("LOT_STATUS", lot?.status, "isSold=", isSold);

  useEffect(() => {
    console.log("SHOW_EDIT_SALE_BUTTON", lot.status, userRole, canEditSale, "isSold=", isSold);
  }, [isSold, lot.status, userRole, canEditSale]);

  const officialMeasures = useMemo(
    () => getOfficialLotMeasurementsForPopup(lot),
    [lot],
  );

  const frontStreetLabel = useMemo(
    () => resolveLotFrontStreetDisplay(lot, streetGuides),
    [lot, streetGuides],
  );

  const frenteConfrontLabel = useMemo(
    () =>
      frontStreetLabel ??
      confrontationAudit?.sides.frente.label ??
      null,
    [frontStreetLabel, confrontationAudit],
  );

  const txtSegments = useMemo(() => {
    try {
      const table = getOfficialLotSegmentTable(
        lot as Record<string, unknown>,
        null,
      );
      return table.validRows.map((row) => ({
        segment_index: row.segment_index,
        distance: row.distanceM as number,
        distanceLabel: row.distancia,
        classification: row.classification,
        isCurve:
          row.distancia.includes("curva") ||
          row.distancia.includes("Curva R="),
      }));
    } catch (err) {
      console.warn('GIS_POPUP_TXT_SEGMENTS_FALLBACK', lot?.id, err);
      return [];
    }
  }, [lot]);

  const area = (officialMeasures.area ?? Number(lot.area)) || 0;
  const currentPrice = useMemo(
    () => normalizeSavedLotPrice(lot.price),
    [lot.price],
  );
  const displayNum =
    String(lot.number)
      .replace(/[^0-9A-Za-z]/g, "")
      .replace(/.*linha.*/i, "")
      .replace(/.*kml.*/i, "") || String(lot.number).replace(/\D/g, "");

  const [priceDraft, setPriceDraft] = useState(() =>
    currentPrice != null ? formatBRL(currentPrice) : "",
  );
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [popupTab, setPopupTab] = useState<
    "resumo" | "confrontacoes" | "comercial" | "historico"
  >("resumo");
  const popupRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (embedOfficialSidesEditor) {
      setPopupTab("confrontacoes");
    }
  }, [embedOfficialSidesEditor]);

  useEffect(() => {
    const el = popupRootRef.current;
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);
  const [auditHistory, setAuditHistory] = useState<FormattedLotAuditEvent[]>(
    [],
  );
  const [auditHistoryLoading, setAuditHistoryLoading] = useState(false);
  const [auditUserNames, setAuditUserNames] = useState<Record<string, string>>(
    {},
  );
  const [reservationDisplay, setReservationDisplay] =
    useState<LotReservationDisplay | null>(null);

  const quadraLabel = String(lot.block ?? lot.block_name ?? "").trim();
  const formattedPrice =
    currentPrice != null ? formatBRL(currentPrice) : "—";
  const headerCustomer =
    gisPopupDisplayText(lot.customerName) ||
    gisPopupDisplayText(reservationDisplay?.customerName);
  const headerProject = gisPopupDisplayText(lot.projectName);
  const headerContract = gisPopupContractLabel(
    lot.contract_number ?? lot.contractNumber ?? lot.contract_no,
  );
  const headerMetaLine = [headerProject, headerContract && `Contrato ${headerContract}`]
    .filter(Boolean)
    .join(" · ");

  const parsedPriceDraft = parseCurrencyBRL(priceDraft);
  const priceChanged =
    parsedPriceDraft !== currentPrice &&
    !(parsedPriceDraft == null && currentPrice == null);

  // Inicializa rascunho apenas ao trocar de lote — nunca durante digitação/salvamento.
  useEffect(() => {
    const saved = normalizeSavedLotPrice(lot.price);
    setPriceDraft(saved != null ? formatBRL(saved) : "");
  }, [lot.id]);

  useEffect(() => {
    if (popupTab !== "historico" || !lot?.id) return;
    let cancelled = false;

    async function loadHistory() {
      setAuditHistoryLoading(true);
      try {
        const rows = await getLotAuditHistory(supabase, lot.id, 50);
        if (cancelled) return;
        const formatted = rows.map((row) =>
          formatLotAuditEvent(row as LotAuditLogRow),
        );
        setAuditHistory(formatted);
        const userIds = [
          ...new Set(
            formatted.map((e) => e.userId).filter((id): id is string => !!id),
          ),
        ];
        if (userIds.length) {
          const { data: users } = await supabase
            .from("users")
            .select("id, name, email")
            .in("id", userIds);
          const map: Record<string, string> = {};
          for (const u of users || []) {
            map[u.id] = u.name || u.email || u.id.slice(0, 8);
          }
          if (!cancelled) setAuditUserNames(map);
        } else if (!cancelled) {
          setAuditUserNames({});
        }
      } catch {
        if (!cancelled) setAuditHistory([]);
      } finally {
        if (!cancelled) setAuditHistoryLoading(false);
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [popupTab, lot?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadReservationSection() {
      if (!isLotReservedStatus(lot?.status)) {
        setReservationDisplay(null);
        return;
      }

      const companyId =
        lot.tenant_id || lot.company_id || lot.tenantId || null;

      const baseSource = {
        status: lot.status,
        customerName: lot.customerName,
        customerId: lot.customerId || lot.customer_id,
        reservationDate: lot.reservation_date || lot.reservationDate,
        reservationExpiresAt:
          lot.reservation_expires_at || lot.reservationExpiresAt,
        reservedByUserId: lot.reserved_by_user_id || lot.reservedByUserId,
        reservedByName: lot.reserved_by_name || lot.reservedByName,
        brokerId: lot.broker_id || lot.brokerId,
        brokerName: lot.brokerName || null,
      };

      const snapshotName = String(
        lot.reserved_by_name || lot.reservedByName || "",
      ).trim();
      if (snapshotName) {
        if (!cancelled) {
          setReservationDisplay(buildLotReservationDisplay(baseSource));
        }
        return;
      }

      // Mostra imediatamente com "Não identificado" e resolve em seguida (legado).
      if (!cancelled) {
        setReservationDisplay(buildLotReservationDisplay(baseSource));
      }

      try {
        const resolved = await resolveReservationResponsibleName(supabase, {
          companyId,
          blockId: String(lot.id),
          reservedByUserId: baseSource.reservedByUserId,
          reservedByName: baseSource.reservedByName,
          brokerId: baseSource.brokerId,
          brokerName: baseSource.brokerName,
        });
        if (cancelled) return;
        setReservationDisplay(
          buildLotReservationDisplay(baseSource, {
            resolvedReservedByName: resolved,
          }),
        );
      } catch {
        /* mantém display parcial */
      }
    }

    void loadReservationSection();
    return () => {
      cancelled = true;
    };
  }, [
    lot?.id,
    lot?.status,
    lot?.customerName,
    lot?.customerId,
    lot?.customer_id,
    lot?.reservation_date,
    lot?.reservationDate,
    lot?.reservation_expires_at,
    lot?.reservationExpiresAt,
    lot?.reserved_by_user_id,
    lot?.reservedByUserId,
    lot?.reserved_by_name,
    lot?.reservedByName,
    lot?.broker_id,
    lot?.brokerId,
    lot?.brokerName,
    lot?.tenant_id,
    lot?.company_id,
    lot?.tenantId,
  ]);

  const handleSavePrice = async () => {
    if (!canEditLotPrice) return;
    const rawDraft = priceDraft;
    const parsed = parseCurrencyBRL(rawDraft);
    console.log("GIS_LOT_PRICE_SAVE_START", {
      lotId: lot.id,
      rawDraft,
      parsed,
      currentPrice,
    });
    if (rawDraft.trim() && parsed == null) {
      alert("Informe um valor válido em reais (ex.: R$ 80.000,00).");
      return;
    }

    const previousPrice = currentPrice;
    const formattedSaved = parsed != null ? formatBRL(parsed) : "";

    // Proteção realtime + estado local ANTES do update Supabase.
    onPriceSaved?.(lot.id, parsed);
    setPriceDraft(formattedSaved);

    try {
      setIsSavingPrice(true);
      setSavedSuccess(false);
      const { data, error } = await supabase
        .from("blocks")
        .update({ price: parsed })
        .eq("id", lot.id)
        .select("price")
        .maybeSingle();
      console.log("GIS_LOT_PRICE_SAVE_RESULT", {
        lotId: lot.id,
        parsed,
        error: error?.message ?? null,
        data,
      });
      if (error) throw error;

      void logLotAuditEvent(supabase, {
        ...lotAuditContextFromBlock(lot),
        action: "value_changed",
        title: "Valor do lote alterado",
        description: `${previousPrice != null ? formatBRL(previousPrice) : "—"} → ${parsed != null ? formatBRL(parsed) : "—"}`,
        oldData: { price: previousPrice },
        newData: { price: parsed },
        source: "gis_map",
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err: unknown) {
      console.error("GIS_LOT_PRICE_SAVE_ERROR", {
        lotId: lot.id,
        parsed,
        err,
      });
      onPriceSaved?.(lot.id, previousPrice);
      setPriceDraft(
        previousPrice != null ? formatBRL(previousPrice) : "",
      );
      const message =
        err instanceof Error ? err.message : "Erro desconhecido ao salvar preço.";
      alert(`Erro ao salvar preço: ${message}`);
    } finally {
      setIsSavingPrice(false);
    }
  };

  const confrontationSegmentRows = useMemo(() => {
    if (!confrontationAudit) return [];
    const blockForSide = {
      ...lot,
      block_name: lot.block,
      segments_json: lot.segments_json,
      front_segment_index: lot.front_segment_index,
    };
    try {
      return buildOfficialLotConfrontationSegmentRows(
        blockForSide,
        confrontationAudit,
        allBlocksForConfront,
        {
          frenteConfrontLabel,
          frontStreetLabel,
        },
      );
    } catch (err) {
      console.error('[LotPopupContent] confrontationSegmentRows', {
        lotId: lot?.id ?? null,
        lotNumber: lot?.number ?? null,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        err,
      });
      return [];
    }
  }, [
    confrontationAudit,
    lot,
    allBlocksForConfront,
    frenteConfrontLabel,
    frontStreetLabel,
  ]);

  const popupTabs = [
    { id: "resumo" as const, label: "Resumo" },
    { id: "confrontacoes" as const, label: "Confrontações" },
    { id: "comercial" as const, label: "Comercial" },
    { id: "historico" as const, label: "Histórico" },
  ];

  return (
    <div
      ref={popupRootRef}
      className={GIS_LOT_POPUP_CONTAINER_CLASS}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 px-4 pt-4 pb-3 pr-10 lg:pt-2.5 lg:pb-2 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-bold text-base md:text-lg lg:text-base text-gray-900 leading-tight min-w-0">
            Lote {displayNum}
            {quadraLabel ? (
              <span className="text-gray-500 font-semibold">
                {" "}
                · Quadra {quadraLabel}
              </span>
            ) : null}
          </h3>
          <span
            className="shrink-0 text-white text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wide"
            style={{ backgroundColor: color }}
          >
            {getStatusLabel(lot.status)}
          </span>
        </div>
        {headerCustomer ? (
          <p className="mt-1.5 lg:mt-1 text-sm font-semibold text-gray-800 truncate">
            {headerCustomer}
          </p>
        ) : null}
        {headerMetaLine ? (
          <p className="mt-0.5 text-xs text-gray-500 truncate">{headerMetaLine}</p>
        ) : null}
      </div>

      <div className="shrink-0 grid grid-cols-4 border-b border-gray-200">
        {popupTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPopupTab(tab.id)}
            className={`px-1 py-2.5 lg:py-1.5 text-[11px] md:text-xs font-bold border-b-2 transition-colors ${
              popupTab === tab.id
                ? "border-blue-600 text-blue-700 bg-blue-50/60"
                : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className={`min-h-0 flex-1 px-4 py-3 lg:py-2 ${
          popupTab === "confrontacoes"
            ? "overflow-hidden flex flex-col"
            : "overflow-y-auto"
        }`}
      >
      {popupTab === "resumo" && (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <section className="rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2.5 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-2">
                Imóvel
              </p>
              <dl className="space-y-1.5">
                <div>
                  <dt className="text-[10px] text-gray-500">Área</dt>
                  <dd className="font-semibold text-gray-900 text-sm">
                    {area.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    m²
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-[10px] text-gray-500">Quadra</dt>
                    <dd className="font-semibold text-gray-900">
                      {gisPopupDisplayOrDash(quadraLabel)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-gray-500">Lote</dt>
                    <dd className="font-semibold text-gray-900">
                      {gisPopupDisplayOrDash(displayNum)}
                    </dd>
                  </div>
                </div>
                <div className="rounded-md bg-emerald-50 border border-emerald-100 px-2 py-1.5">
                  <dt className="text-[10px] text-emerald-800 font-semibold">
                    Frente para
                  </dt>
                  <dd className="font-semibold text-emerald-950 leading-snug">
                    {gisPopupDisplayOrDash(frontStreetLabel)}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2.5 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-2">
                Dimensões
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {(
                  [
                    ["Frente", officialMeasures.frente],
                    ["Fundo", officialMeasures.fundo],
                    ["Lado direito", officialMeasures.ladoDireito],
                    ["Lado esquerdo", officialMeasures.ladoEsquerdo],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[10px] text-gray-500">{label}</dt>
                    <dd className="font-semibold text-gray-900">
                      {popupMeasureLabel(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2.5 min-w-0 sm:col-span-2 lg:col-span-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-2">
                Situação comercial
              </p>
              <dl className="space-y-1.5">
                <div>
                  <dt className="text-[10px] text-gray-500">Status</dt>
                  <dd className="font-semibold text-gray-900">
                    {gisPopupDisplayOrDash(getStatusLabel(lot.status))}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-gray-500">Valor</dt>
                  <dd className="font-semibold text-gray-900 text-sm">
                    {formattedPrice}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-gray-500">Cliente</dt>
                  <dd className="font-semibold text-gray-900 truncate">
                    {gisPopupDisplayOrDash(headerCustomer)}
                  </dd>
                </div>
                {headerContract ? (
                  <div>
                    <dt className="text-[10px] text-gray-500">Contrato</dt>
                    <dd className="font-semibold text-gray-900">
                      {headerContract}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          </div>

          {reservationDisplay && (
            <div
              className={`pt-1 space-y-1 rounded-md px-2.5 py-2 ${
                reservationDisplay.situation === "active"
                  ? "border border-sky-200 bg-sky-50/70"
                  : "border border-orange-200 bg-orange-50/70"
              }`}
            >
              <p
                className={`text-[10px] font-bold tracking-wide uppercase ${
                  reservationDisplay.situation === "active"
                    ? "text-sky-800"
                    : "text-orange-800"
                }`}
              >
                Reserva
              </p>
              <div className="flex justify-between items-start gap-2">
                <span className="text-gray-500 shrink-0">Cliente reservado</span>
                <span className="font-medium text-gray-900 text-right leading-tight">
                  {gisPopupDisplayOrDash(reservationDisplay.customerName)}
                </span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-gray-500 shrink-0">Reserva feita por</span>
                <span className="font-medium text-gray-900 text-right leading-tight">
                  {gisPopupDisplayOrDash(reservationDisplay.reservedByLabel)}
                </span>
              </div>
              {reservationDisplay.reservedAtLabel && (
                <div className="flex justify-between items-start gap-2">
                  <span className="text-gray-500 shrink-0">Realizada em</span>
                  <span className="font-medium text-gray-900 text-right">
                    {reservationDisplay.reservedAtLabel}
                  </span>
                </div>
              )}
              {reservationDisplay.expiresAtLabel && (
                <div className="flex justify-between items-start gap-2">
                  <span className="text-gray-500 shrink-0">Válida até</span>
                  <span className="font-medium text-gray-900 text-right">
                    {reservationDisplay.expiresAtLabel}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center gap-2 pt-0.5">
                <span className="text-gray-500 shrink-0">Situação</span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    reservationDisplay.situation === "active"
                      ? "bg-sky-100 text-sky-800"
                      : "bg-orange-100 text-orange-900"
                  }`}
                >
                  {reservationDisplay.situationLabel}
                </span>
              </div>
            </div>
          )}

          {userRole !== "BROKER" && !ownerReadOnly &&
            Array.isArray(lot.segments_json) &&
            lot.segments_json.length >= 3 &&
            onStartCorrectFront && (
              <div className="pt-1">
                {frontCorrectActive ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-amber-800 leading-snug">
                      Clique no lado correto no mapa ou escolha o segmento TXT:
                    </p>
                    <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                      {txtSegments.map((seg) => (
                        <button
                          key={seg.segment_index}
                          type="button"
                          disabled={frontCorrectSaving}
                          onClick={() =>
                            onPickFrontSegment?.(lot, seg.segment_index)
                          }
                          className="text-left px-2 py-1 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100 text-[10px] font-medium text-gray-900 disabled:opacity-50"
                        >
                          Seg. {seg.segment_index + 1} —{" "}
                          {seg.distanceLabel ??
                            `${seg.distance.toFixed(2)} m`}
                          {lot.front_segment_index === seg.segment_index
                            ? " (frente atual)"
                            : ""}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={onCancelCorrectFront}
                      className="w-full text-[10px] font-semibold text-gray-600 hover:text-gray-900 py-0.5"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      Ações do lote
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-semibold text-gray-600 mb-1.5">
                          Cadastro e geometria
                        </p>
                        <div className="grid grid-cols-1 min-[300px]:grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => onStartCorrectFront(lot)}
                            className="w-full py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-[10px] font-bold text-amber-900"
                          >
                            Corrigir frente
                          </button>
                          {onEditOfficialSides ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPopupTab("confrontacoes");
                                onEditOfficialSides(lot);
                              }}
                              className="w-full py-1.5 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-[10px] font-bold text-sky-900"
                            >
                              Editar confrontações
                            </button>
                          ) : (
                            <span className="hidden min-[300px]:block" aria-hidden />
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-gray-600 mb-1.5">
                          Documentos
                        </p>
                        <div className="grid grid-cols-1 min-[300px]:grid-cols-2 gap-1.5">
                          {onGenerateMemorial &&
                          Array.isArray(lot.segments_json) &&
                          lot.segments_json.length >= 2 ? (
                            <button
                              type="button"
                              onClick={() => onGenerateMemorial(lot)}
                              className="w-full py-1.5 rounded-lg border border-amber-400 bg-amber-50 hover:bg-amber-100 text-[10px] font-bold text-amber-900"
                            >
                              Gerar memorial
                            </button>
                          ) : (
                            <span className="hidden min-[300px]:block" aria-hidden />
                          )}
                          {onGenerateLotSheet &&
                          Array.isArray(lot.segments_json) &&
                          lot.segments_json.length >= 2 ? (
                            <button
                              type="button"
                              onClick={() => onGenerateLotSheet(lot)}
                              className="w-full py-1.5 rounded-lg border border-orange-300 bg-orange-50 hover:bg-orange-100 text-[10px] font-bold text-orange-900"
                            >
                              Gerar prancha
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          {userRole !== "BROKER" &&
            !ownerReadOnly &&
            !onStartCorrectFront &&
            onGenerateMemorial &&
            Array.isArray(lot.segments_json) &&
            lot.segments_json.length >= 2 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Ações do lote
                </p>
                <p className="text-[10px] font-semibold text-gray-600">Documentos</p>
                <button
                  type="button"
                  onClick={() => onGenerateMemorial(lot)}
                  className="w-full py-1.5 rounded-lg border border-amber-400 bg-amber-50 hover:bg-amber-100 text-[10px] font-bold text-amber-900"
                >
                  Gerar Memorial
                </button>
              </div>
            )}
        </div>
      )}

      {(popupTab === "confrontacoes" || embedOfficialSidesEditor) && (
        <div
          className={
            popupTab === "confrontacoes"
              ? "flex flex-col min-h-0 h-full"
              : "hidden"
          }
        >
        <LotConfrontationsPanel
          lot={lot}
          streetGuides={streetGuides}
          allBlocks={allBlocksForConfront}
          frenteConfrontLabel={frenteConfrontLabel}
          frontStreetLabel={frontStreetLabel}
          canEdit={!ownerReadOnly}
          onEditSide={
            onEditConfrontationSide
              ? (l, side) => onEditConfrontationSide(l, side)
              : undefined
          }
          onEditSegment={
            onEditConfrontationSegment
              ? (l, side, indexes) =>
                  onEditConfrontationSegment(l, side, indexes)
              : undefined
          }
          cleanedCoords={cleanedCoords ?? null}
          selectedSegmentIndexes={officialSidesSelected}
          editingOfficialSides={Boolean(embedOfficialSidesEditor)}
          onEditorSlotReady={onOfficialSidesEditorSlot}
          onStartOfficialSidesEdit={
            onEditOfficialSides
              ? (l, indexes) => onEditOfficialSides(l, indexes)
              : undefined
          }
          officialSidesSaving={officialSidesSaving}
          onPersistOfficialSides={onPersistOfficialSides}
        />
        </div>
      )}

      {popupTab === "comercial" && (
        <div className="space-y-2.5 text-[11px] md:text-xs">
          <div className="flex justify-between items-center gap-2">
            <span className="text-gray-500 shrink-0">Valor do lote</span>
            {!canEditLotPrice ? (
              <span className="font-mono font-bold text-gray-900 text-sm md:text-base">
                {formattedPrice}
              </span>
            ) : (
            <div className="flex items-center gap-1.5">
              <CurrencyInput
                value={priceDraft}
                onChange={setPriceDraft}
                placeholder="R$ 0,00"
                className={GIS_LOT_POPUP_PRICE_INPUT_CLASS}
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleSavePrice}
                disabled={isSavingPrice || !priceChanged}
                className={`px-2.5 py-1.5 text-[10px] md:text-xs font-bold rounded transition-colors ${
                  savedSuccess
                    ? "bg-green-500 text-white"
                    : priceChanged
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
              >
                {isSavingPrice ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : savedSuccess ? (
                  "Salvo"
                ) : (
                  "Salvar"
                )}
              </button>
            </div>
            )}
          </div>

          {ownerReadOnly ? (
            <p className="rounded border border-blue-100 bg-blue-50 px-2 py-1.5 text-[10px] text-blue-800">
              Modo somente leitura — venda, reserva e alterações não estão disponíveis para seu perfil.
            </p>
          ) : (
          <div className="flex gap-1">
            <button
              onClick={() => {
                if (lotNeedsReleaseConfirm(lot)) {
                  onRequestClear(lot, currentPrice ?? 0);
                } else {
                  onAction(lot, "Disponível", currentPrice ?? 0);
                }
              }}
              disabled={actionLoading === lot.id}
              className={`${GIS_LOT_POPUP_ACTION_BTN_CLASS} bg-gray-200 text-gray-700 hover:bg-gray-300`}
            >
              Disponibilizar
            </button>
            <button
              onClick={() => {
                if (isSold) {
                  alert(
                    "Este lote já está vendido. Para vender novamente, primeiro disponibilize o lote usando a liberação administrativa com senha.",
                  );
                  return;
                }
                onRequestCustomerForm(lot, "Reservado", currentPrice ?? 0);
              }}
              disabled={actionLoading === lot.id || isSold}
              title={isSold ? "Este lote já está vendido" : "Reservar lote"}
              className={`${GIS_LOT_POPUP_ACTION_BTN_CLASS} ${isSold ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-yellow-400 text-yellow-900 hover:bg-yellow-500"}`}
            >
              Reservar
            </button>
            <button
              onClick={() => {
                if (isSold) {
                  alert(
                    "Este lote já está vendido. Para vender novamente, primeiro disponibilize o lote usando a liberação administrativa com senha.",
                  );
                  return;
                }
                if (!isBrowserOnline()) {
                  blockOfflineSale();
                  return;
                }
                onRequestCustomerForm(lot, "Vendido", currentPrice ?? 0);
              }}
              disabled={actionLoading === lot.id || isSold}
              title={isSold ? "Este lote já está vendido" : "Vender lote"}
              className={`${GIS_LOT_POPUP_ACTION_BTN_CLASS} ${isSold ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-red-600 text-white hover:bg-red-700"}`}
            >
              Vender
            </button>
            <button
              onClick={() => onRequestClear(lot, currentPrice ?? 0)}
              disabled={actionLoading === lot.id}
              className="flex-none px-1.5 bg-gray-100 text-gray-500 hover:text-gray-900 border border-gray-200 hover:bg-gray-200 rounded flex flex-col items-center justify-center"
              title="Limpar status"
            >
              {actionLoading === lot.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
              <span className="text-[8px] leading-tight">Limpar</span>
            </button>
          </div>
          )}

          {isSold && !ownerReadOnly && (
            <div className="grid grid-cols-2 gap-1 pt-1 border-t border-gray-100">
              {(() => {
                console.log("SHOW_EDIT_SALE_BUTTON", {
                  lotStatus: lot.status,
                  userRole,
                  canEditSale,
                  hasHandler: Boolean(onEditSale),
                });
                return null;
              })()}
              {onEditSale && (
                <button
                  type="button"
                  onClick={() => {
                    if (!canEditSale) {
                      alert(
                        "Apenas administradores podem editar vendas concluídas.",
                      );
                      return;
                    }
                    onEditSale(lot);
                  }}
                  disabled={actionLoading === lot.id}
                  className={`col-span-2 flex items-center justify-center gap-1.5 px-2 py-1.5 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-50 ${
                    canEditSale
                      ? "bg-orange-500 hover:bg-orange-600"
                      : "bg-orange-400/60 cursor-not-allowed"
                  }`}
                >
                  <Pencil className="w-3 h-3" />
                  Editar Venda
                </button>
              )}
              {onViewContract && (
                <button
                  type="button"
                  onClick={() => onViewContract(lot)}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg"
                >
                  <FileText className="w-3 h-3" />
                  Ver Contrato
                </button>
              )}
              {onRegenerateContract && lot.contractId && (
                <button
                  type="button"
                  onClick={() => onRegenerateContract(lot)}
                  disabled={actionLoading === `regen-${lot.id}`}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-lg disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${actionLoading === `regen-${lot.id}` ? "animate-spin" : ""}`}
                  />
                  Regenerar contrato
                </button>
              )}
              {onViewFinance && lot.saleId && (
                <button
                  type="button"
                  onClick={() => onViewFinance(lot)}
                  className="col-span-2 flex items-center justify-center gap-1 px-2 py-1.5 border border-gray-300 text-gray-800 hover:bg-gray-50 text-[10px] font-bold rounded-lg"
                >
                  <Wallet className="w-3 h-3" />
                  Ver Financeiro
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {popupTab === "historico" && (
        <div className="text-[11px] md:text-xs max-h-56 md:max-h-64 overflow-y-auto">
          {auditHistoryLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          ) : auditHistory.length === 0 ? (
            <p className="text-[10px] text-gray-500 py-4 text-center leading-snug">
              Sem histórico registrado para este lote.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {auditHistory.map((entry) => (
                <li
                  key={entry.id}
                  className="border-b border-gray-100 pb-2 last:border-0"
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[9px] font-mono text-gray-500 shrink-0">
                      {new Date(entry.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      className={`text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0 ${entry.badgeClass}`}
                    >
                      {entry.actionLabel}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900 text-[11px] mt-0.5 leading-tight">
                    {entry.title}
                  </p>
                  {entry.description && (
                    <p className="text-[10px] md:text-[11px] text-gray-600 mt-0.5 leading-snug">
                      {formatLotAuditDescription(entry.description)}
                    </p>
                  )}
                  <p className="text-[9px] text-gray-400 mt-0.5">
                    {entry.userId
                      ? auditUserNames[entry.userId] ||
                        `${entry.userId.slice(0, 8)}…`
                      : "—"}{" "}
                    · {entry.sourceLabel}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function DrawStreetInteraction({
  active,
  points,
  setPoints,
}: {
  active: boolean;
  points: L.LatLng[];
  setPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
}) {
  const map = useMapEvents({
    click(e) {
      if (!active) return;
      setPoints((prev) => [...prev, e.latlng]);
    },
  });

  useEffect(() => {
    if (!active) setPoints([]);
    if (active) {
      map.getContainer().style.cursor = "crosshair";
    } else {
      map.getContainer().style.cursor = "";
    }
  }, [active, map, setPoints]);

  if (!active || points.length === 0) return null;

  return (
    <>
      {points.length >= 2 && (
        <Polyline
          positions={points.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{
            color: "#10b981",
            weight: 3,
            dashArray: "6, 8",
            opacity: 0.9,
          }}
        />
      )}
      {points.map((p, idx) => (
        <CircleMarker
          key={`dp-${idx}`}
          center={[p.lat, p.lng]}
          radius={5}
          pathOptions={{
            color: "#10b981",
            fillColor: "white",
            fillOpacity: 1,
            weight: 2,
          }}
        />
      ))}
    </>
  );
}

/** Atualiza zoom para exibir/ocultar rótulos de lotes no dashboard. */
function MapZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const update = () => onZoom(map.getZoom());
    map.on("zoomend", update);
    update();
    return () => {
      map.off("zoomend", update);
    };
  }, [map, onZoom]);
  return null;
}

export default function GISMap({
  projectId,
  activeLayer = DEFAULT_GIS_BASE_LAYER,
  gpsActive = false,
  measureActive = false,
  onMeasureDeactivate,
  areaMeasureActive = false,
  onAreaMeasureDeactivate,
  areaMeasureExportMeta,
  refreshKey = 0,
  streetGuides = [],
  streetGuidesVisible = true,
  drawStreetActive = false,
  onStreetLineDrawn,
  onDrawStreetCancel,
  onEditStreetGuide,
  onDeleteStreetGuide,
  labelsMinZoom,
  lotSheetPickMode = false,
  onLotSheetLotPick,
  memorialPickMode = false,
  onMemorialLotPick,
  onGenerateMemorialFromPopup,
  onGenerateLotSheetFromPopup,
  focusBlockName = null,
  focusBlockKey = 0,
  assistedConfrontationMode = false,
  onOverlayOpenChange,
  onEnterpriseValueRefresh,
  frontPatchBatch = null,
  lotsMutation = null,
}: {
  projectId?: string;
  activeLayer?: GisBaseLayerId | LegacyGisBaseLayer;
  gpsActive?: boolean;
  measureActive?: boolean;
  /** Desativa modo medição (Limpar / ESC). */
  onMeasureDeactivate?: () => void;
  areaMeasureActive?: boolean;
  /** Desativa modo medição de área (Limpar / ESC). */
  onAreaMeasureDeactivate?: () => void;
  /** Metadados para exportação PDF da medição de área. */
  areaMeasureExportMeta?: {
    projectName: string;
    companyName: string;
    userName: string;
  };
  refreshKey?: number;
  /** Zoom na quadra selecionada no gerenciador (block_name). */
  focusBlockName?: string | null;
  focusBlockKey?: number;
  streetGuides?: any[];
  streetGuidesVisible?: boolean;
  drawStreetActive?: boolean;
  onStreetLineDrawn?: (latlngs: L.LatLng[]) => void;
  /** Abandona o desenho em andamento e desativa a ferramenta. */
  onDrawStreetCancel?: () => void;
  onEditStreetGuide?: (guide: Record<string, unknown>) => void;
  onDeleteStreetGuide?: (id: string) => void;
  /** Rótulos permanentes só quando zoom >= valor (ex.: 17 no dashboard). */
  labelsMinZoom?: number;
  /** Modo seleção de lote para prancha PDF */
  lotSheetPickMode?: boolean;
  onLotSheetLotPick?: (lot: {
    id: string;
    number?: string;
    block?: string;
  }) => void;
  /** Modo seleção de lote para memorial descritivo */
  memorialPickMode?: boolean;
  onMemorialLotPick?: (lot: {
    id: string;
    number?: string;
    block?: string;
  }) => void;
  /** Abre geração de memorial a partir do popup do lote */
  onGenerateMemorialFromPopup?: (lot: {
    id: string;
    number?: string;
    block?: string;
  }) => void;
  /** Abre geração de prancha a partir do popup do lote */
  onGenerateLotSheetFromPopup?: (lot: {
    id: string;
    number?: string;
    block?: string;
  }) => void;
  /** Modo revisão pós confrontação automática (GIS-005). */
  assistedConfrontationMode?: boolean;
  /** Notifica o container quando modais/popups do GIS estão abertos (SVL-UI-029). */
  onOverlayOpenChange?: (open: boolean) => void;
  /** Atualiza card Valor do Empreendimento após salvar preço manual. */
  onEnterpriseValueRefresh?: () => void;
  /**
   * Patch leve após Identificar Frentes — um setLots, sem loadLots/fitBounds.
   * rev sobe a cada lote de patches aplicado.
   */
  frontPatchBatch?: {
    rev: number;
    patches: Array<{
      id: string;
      frente?: number | null;
      Fundo?: number | string | null;
      'Lado Dir.'?: number | string | null;
      'Lado Esq.'?: number | string | null;
      front_segment_index?: number | null;
      frontStreetName?: string | null;
      frontStreetType?: string | null;
      frontStreetWidth?: number | null;
      frontStreetId?: string | null;
      frontStreetDisplay?: string | null;
    }>;
  } | null;
  /**
   * Fase A — mutações pontuais sem loadLots/fitBounds.
   * remove | removeBlock | upsert (blocks brutos normalizados no GISMap).
   */
  lotsMutation?: {
    rev: number;
    kind: 'remove' | 'removeBlock' | 'upsert';
    ids?: string[];
    blockName?: string;
    blocks?: Record<string, unknown>[];
  } | null;
}) {
  const { user } = useAuth();
  const ownerMapWriteBlocked = isOwnerRole(user?.role);
  const [center] = useState<[number, number]>([-1.4553, -48.4892]);
  const [lots, setLots] = useState<any[]>([]);
  const [blocksData, setBlocksData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /** Toggles só com ?gisPerf=1 (Preview). Sem query = comportamento idêntico ao atual. */
  const [perfToggles] = useState<GisPerfToggleState>(() =>
    readGisPerfTogglesFromSearch(),
  );
  const showBoundaryLines =
    SHOW_BOUNDARY_LINES && perfToggles.boundaryLines;
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(18);
  /** Labels/círculos só a partir deste zoom (padrão 17) — polígonos sempre visíveis. */
  const effectiveLabelsMinZoom =
    labelsMinZoom == null ? 17 : labelsMinZoom;
  const showPermanentLabels =
    mapZoom >= effectiveLabelsMinZoom && perfToggles.labels;
  const sheetPickActive = Boolean(lotSheetPickMode);
  const memorialPickActive = Boolean(memorialPickMode);
  const mapLotPickActive = sheetPickActive || memorialPickActive;
  const [frontCorrectLotId, setFrontCorrectLotId] = useState<string | null>(
    null,
  );
  const [frontCorrectSaving, setFrontCorrectSaving] = useState(false);
  const [officialSidesEditLot, setOfficialSidesEditLot] = useState<any | null>(
    null,
  );
  const [officialSidesSaving, setOfficialSidesSaving] = useState(false);
  const [officialSidesSelected, setOfficialSidesSelected] = useState<number[]>(
    [],
  );
  const [officialSidesDraft, setOfficialSidesDraft] =
    useState<OfficialSideDraftMap>(new Map());
  const isWideDesktop = useIsWideDesktop();
  const [officialSidesEditorSlot, setOfficialSidesEditorSlot] =
    useState<HTMLElement | null>(null);
  const officialSidesEditLotRef = useRef<any | null>(null);
  officialSidesEditLotRef.current = officialSidesEditLot;

  const closeOfficialSidesEditor = useCallback(() => {
    setOfficialSidesEditLot(null);
    setOfficialSidesSelected([]);
    setOfficialSidesDraft(new Map());
    setOfficialSidesEditorSlot(null);
  }, []);

  const openOfficialSidesEditor = useCallback(
    (l: any, initialSelected?: number[]) => {
      setFrontCorrectLotId(null);
      if (isWideDesktop) {
        if (Array.isArray(initialSelected) && initialSelected.length > 0) {
          setOfficialSidesSelected(initialSelected);
        }
        return;
      }
      const sameLot = officialSidesEditLotRef.current?.id === l?.id;
      if (Array.isArray(initialSelected) && initialSelected.length > 0) {
        setOfficialSidesSelected(initialSelected);
      } else if (!sameLot) {
        setOfficialSidesSelected([]);
      }
      if (!sameLot) {
        setOfficialSidesDraft(new Map());
        setOfficialSidesEditLot(l);
      }
    },
    [isWideDesktop],
  );

  const persistOfficialSidesForLot = useCallback(
    async (
      sourceLot: any,
      patched: Record<string, unknown>,
      draft: OfficialSideDraftMap,
      confrontantDraft: ConfrontantDraftMap,
    ) => {
      if (!projectId || !sourceLot?.id) {
        throw new Error("Lote indisponivel para persistir.");
      }
      setOfficialSidesSaving(true);
      try {
        const snapshot = snapshotSegmentsJson(sourceLot);
        const rows = patched.segments_json as Record<string, unknown>[];
        await persistBlockSegmentsJson(
          supabase,
          String(sourceLot.id),
          rows,
        );
        markLocalPatchSuppress([String(sourceLot.id)]);
        setLots((prev) =>
          prev.map((l) =>
            l.id === sourceLot.id ? { ...l, segments_json: rows } : l,
          ),
        );
        const confrontantEdits = [...confrontantDraft.entries()].map(
          ([segment_index, entry]) => ({
            segment_index,
            previous: entry.previous,
            next: entry.confrontant,
            confrontant_type: entry.confrontant_type,
          }),
        );
        void logLotAuditEvent(supabase, {
          ...lotAuditContextFromBlock(sourceLot, { projectId }),
          userId: user?.id ?? null,
          action: "official_measure_side_changed",
          title: "Classificacao oficial de lados",
          description: `official_side/confrontante atualizado no lote ${String(sourceLot.number ?? "")}`,
          oldData: { segments_json: snapshot },
          newData: {
            official_side_map: Object.fromEntries(draft.entries()),
            confrontant_edits: confrontantEdits,
            lot_id: sourceLot.id,
          },
          source: "gis_map",
        });
        if (confrontantEdits.length > 0) {
          void logLotAuditEvent(supabase, {
            ...lotAuditContextFromBlock(sourceLot, { projectId }),
            userId: user?.id ?? null,
            action: "confrontation_manual",
            title: "Confrontante por segmento (editor de lados)",
            description: `selected_only em ${confrontantEdits.length} segmento(s) do lote ${String(sourceLot.number ?? "")}`,
            oldData: {
              segments_json: snapshot,
              confrontant_edits: confrontantEdits.map((e) => ({
                segment_index: e.segment_index,
                confrontant: e.previous,
              })),
            },
            newData: {
              lot_id: sourceLot.id,
              confrontant_edits: confrontantEdits,
              persist_scope: "selected_only",
            },
            source: "gis_map",
          });
        }
        const currentEdit = officialSidesEditLotRef.current;
        if (currentEdit?.id === sourceLot.id) {
          setOfficialSidesEditLot({
            ...currentEdit,
            segments_json: rows,
          });
          setOfficialSidesDraft(new Map());
        }
      } finally {
        setOfficialSidesSaving(false);
      }
    },
    [projectId, supabase, user],
  );

  const [confrontEdit, setConfrontEdit] = useState<{
    lot: any;
    side: SideRole;
    segmentIndexes: number[];
    currentConfrontant?: string | null;
    currentSource?: import('@/lib/confrontantTypes').ConfrontantSource | null;
  } | null>(null);
  const pendingLotPricesRef = useRef<Map<string, number | null>>(new Map());
  const streetGuidesRef = useRef(streetGuides);
  streetGuidesRef.current = streetGuides;
  const [customerContractValidation, setCustomerContractValidation] =
    useState<CustomerContractValidation | null>(null);

  /**
   * Não remapear os 597 lotes quando streetGuides muda.
   * Nome da rua no popup já resolve via resolveLotFrontStreetDisplay(lot, streetGuides).
   * Remapear aqui invalidava displayLots → audits → re-render SVG em massa ao salvar logradouro.
   */
  const displayLots = lots;

  /**
   * Chave estável de geometria — mudanças só de frente/rua NÃO disparam rebuild de audits.
   * (Identificar Frentes atualiza metadados sem alterar bounds.)
   */
  const auditLotsKey = useMemo(
    () =>
      lots
        .map((l) => `${l.id}:${l.bounds?.length ?? 0}:${l.coordCount ?? 0}`)
        .join('|'),
    [lots],
  );

  /**
   * Auditorias “ao vivo” só para ferramentas que precisam colorir TODOS os lotes.
   * Frente manual / editor pontual NÃO entram aqui (evita O(N²) nos 597 lotes).
   */
  const liveStreetAudits = Boolean(assistedConfrontationMode);

  /** Arestas detalhadas só com zoom próximo ou ferramenta ativa (LOD). */
  const showDetailedEdges =
    mapZoom >= 16 ||
    frontCorrectLotId != null ||
    confrontEdit != null ||
    officialSidesEditLot != null ||
    liveStreetAudits;

  /** Foco pontual: só estes ids ( + vizinhos ) entram em rebuild de auditoria. */
  const scopedAuditFocusId =
    frontCorrectLotId ||
    (confrontEdit?.lot?.id != null ? String(confrontEdit.lot.id) : null) ||
    null;

  const scopedAuditLotIds = useMemo(() => {
    if (!scopedAuditFocusId || liveStreetAudits) return null;
    // Frente manual não precisa de auditoria de confrontação nas arestas.
    if (frontCorrectLotId && !confrontEdit) {
      return new Set<string>([String(frontCorrectLotId)]);
    }
    return collectNearbyLotIds(lots, String(scopedAuditFocusId), 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lots via auditLotsKey + focus
  }, [
    scopedAuditFocusId,
    frontCorrectLotId,
    confrontEdit?.lot?.id,
    liveStreetAudits,
    auditLotsKey,
  ]);

  const blocksForConfront = useMemo(
    () =>
      lots.map((l) => ({
        ...l,
        id: l.id,
        number: l.number,
        block_name: l.block,
        segments_json: l.segments_json,
        front_segment_index: l.front_segment_index,
        front_street_name: l.frontStreetName,
      })) as Record<string, unknown>[],
    [lots],
  );

  /** streetGuides só invalida audits quando ferramentas assistidas globais estão ativas. */
  const streetGuidesAuditDep = liveStreetAudits ? streetGuides : null;

  /** Uma única sincronização quando as ruas chegam após os lotes (sem rebuild a cada nova rua). */
  const streetsHydratedRef = useRef(false);
  const [streetsHydrateEpoch, setStreetsHydrateEpoch] = useState(0);
  useEffect(() => {
    streetsHydratedRef.current = false;
    setStreetsHydrateEpoch(0);
  }, [projectId]);
  useEffect(() => {
    if (!streetsHydratedRef.current && streetGuides.length > 0) {
      streetsHydratedRef.current = true;
      setStreetsHydrateEpoch((e) => e + 1);
    }
  }, [streetGuides.length]);

  const confrontationAuditsPrevRef = useRef<Map<string, LotConfrontationAudit>>(
    new Map(),
  );

  const confrontationAudits = useMemo(() => {
    const focusOnlyFront =
      Boolean(frontCorrectLotId) &&
      !liveStreetAudits &&
      !confrontEdit;

    // Frente manual: não recalcular auditorias — reutiliza mapa anterior.
    if (focusOnlyFront) {
      gisPerfNoteAuditRebuild(0);
      return confrontationAuditsPrevRef.current;
    }

    // Sem ferramenta assistida/global e sem foco pontual: NÃO auditar 597 lotes no load.
    if (!liveStreetAudits && !scopedAuditFocusId) {
      gisPerfNoteAuditRebuild(0);
      return confrontationAuditsPrevRef.current;
    }

    const scopeIds = scopedAuditLotIds;
    const auditTargetLots =
      scopeIds && !liveStreetAudits
        ? lots.filter((l) => l?.id && scopeIds.has(String(l.id)))
        : lots;

    gisPerfNoteAuditRebuild(auditTargetLots.length);
    return gisPerfMeasureSync(
      'confrontation_audits',
      () => {
        if (!perfToggles.confrontationAudits) {
          const empty = new Map<string, LotConfrontationAudit>();
          confrontationAuditsPrevRef.current = empty;
          return empty;
        }
        // Candidatos: no escopo pontual, só foco+vizinhos; no global, todos.
        const candidateBlocks =
          scopeIds && !liveStreetAudits
            ? blocksForConfront.filter((b) => scopeIds.has(String(b.id)))
            : blocksForConfront;
        let sharedPolys: number[][][] = [];
        try {
          sharedPolys = buildAllPolysUtm(candidateBlocks);
        } catch (err) {
          console.error('[GISMap] buildAllPolysUtm (confrontation_audits)', {
            candidateCount: candidateBlocks.length,
            liveStreetAudits,
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            err,
          });
          sharedPolys = [];
        }
        const map =
          scopeIds && !liveStreetAudits
            ? new Map(confrontationAuditsPrevRef.current)
            : new Map<string, LotConfrontationAudit>();

        for (const lot of auditTargetLots) {
          if (!lot?.id) continue;
          try {
            map.set(
              lot.id,
              buildLotConfrontationAudit(
                blockWithGeometryFromBounds({
                  ...lot,
                  block_name: lot.block,
                  segments_json: lot.segments_json,
                  front_segment_index: lot.front_segment_index,
                  front_street_name: lot.frontStreetName,
                }),
                lot.id,
                candidateBlocks.length ? candidateBlocks : blocksForConfront,
                streetGuides,
                null,
                sharedPolys,
              ),
            );
          } catch (err) {
            console.error('CONFRONTATION_AUDIT_SKIP', {
              lotId: lot.id,
              lotNumber: lot.number,
              message: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
              err,
            });
          }
        }
        confrontationAuditsPrevRef.current = map;
        return map;
      },
      {
        lotCount: auditTargetLots.length,
        totalLots: lots.length,
        scoped: Boolean(scopeIds && !liveStreetAudits),
        enabled: perfToggles.confrontationAudits,
        liveStreetAudits,
        streetGuideCount: Array.isArray(streetGuides) ? streetGuides.length : 0,
        streetsHydrateEpoch,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- streetGuidesAuditDep + auditLotsKey
  }, [
    auditLotsKey,
    blocksForConfront,
    streetGuidesAuditDep,
    liveStreetAudits,
    streetsHydrateEpoch,
    perfToggles.confrontationAudits,
    scopedAuditLotIds,
    scopedAuditFocusId,
    frontCorrectLotId,
    confrontEdit,
  ]);

  /** Identificar Frentes: um setLots com patches, sem loadLots/fitBounds. */
  const lastFrontPatchRevRef = useRef(0);
  /** Suprime realtime logo após patch otimista (evita load/duplicata). */
  const localPatchSuppressRef = useRef<Map<string, number>>(new Map());
  const markLocalPatchSuppress = useCallback((ids: string[], ms = 8000) => {
    const until = Date.now() + ms;
    for (const id of ids) {
      if (id) localPatchSuppressRef.current.set(String(id), until);
    }
  }, []);
  const isLocalPatchSuppressed = useCallback((id: string) => {
    const until = localPatchSuppressRef.current.get(String(id));
    if (until == null) return false;
    if (Date.now() > until) {
      localPatchSuppressRef.current.delete(String(id));
      return false;
    }
    return true;
  }, []);

  useEffect(() => {
    if (!frontPatchBatch || frontPatchBatch.rev === lastFrontPatchRevRef.current) {
      return;
    }
    if (!frontPatchBatch.patches.length) return;
    lastFrontPatchRevRef.current = frontPatchBatch.rev;
    markLocalPatchSuppress(frontPatchBatch.patches.map((p) => String(p.id)));
    const byId = new Map(
      frontPatchBatch.patches.map((p) => [String(p.id), p] as const),
    );
    startTransition(() => {
      setLots((prev) => {
        let changed = 0;
        const next = prev.map((lot) => {
          const p = byId.get(String(lot.id));
          if (!p) return lot;
          changed += 1;
          return {
            ...lot,
            frente: p.frente ?? lot.frente,
            Fundo: p.Fundo ?? lot.Fundo,
            'Lado Dir.': p['Lado Dir.'] ?? lot['Lado Dir.'],
            'Lado Esq.': p['Lado Esq.'] ?? lot['Lado Esq.'],
            front_segment_index:
              p.front_segment_index ?? lot.front_segment_index,
            frontStreetName: p.frontStreetName ?? lot.frontStreetName,
            frontStreetType: p.frontStreetType ?? lot.frontStreetType,
            frontStreetWidth: p.frontStreetWidth ?? lot.frontStreetWidth,
            frontStreetId: p.frontStreetId ?? lot.frontStreetId,
            frontStreetDisplay:
              p.frontStreetDisplay ?? lot.frontStreetDisplay,
          };
        });
        return changed > 0 ? next : prev;
      });
    });
  }, [frontPatchBatch, markLocalPatchSuppress]);

  const lastLotsMutationRevRef = useRef(0);
  useEffect(() => {
    if (!lotsMutation || lotsMutation.rev === lastLotsMutationRevRef.current) {
      return;
    }
    lastLotsMutationRevRef.current = lotsMutation.rev;
    const kind = lotsMutation.kind;
    const opLotId =
      lotsMutation.ids?.[0] ||
      (lotsMutation.blocks?.[0]?.id != null
        ? String(lotsMutation.blocks[0].id)
        : lotsMutation.blockName || '');

    gisPerfLotEditBegin({
      operation: kind,
      lotId: String(opLotId).slice(0, 12),
    });

    if (kind === 'remove' && lotsMutation.ids?.length) {
      const idSet = new Set(lotsMutation.ids.map(String));
      markLocalPatchSuppress([...idSet]);
      gisPerfLotEditMark('patch_start');
      startTransition(() => {
        setLots((prev) => prev.filter((l) => !idSet.has(String(l.id))));
        setBlocksData((prev) => prev.filter((l) => !idSet.has(String(l.id))));
      });
      gisPerfLotEditMark('patch_end');
      gisPerfLotEditEnd({
        operation: 'remove',
        lotId: String(opLotId).slice(0, 12),
        duplicateRealtimeSuppressed: false,
        fallbackFullReload: false,
      });
      return;
    }

    if (kind === 'removeBlock' && lotsMutation.blockName) {
      const key = normalizeBlockKeyForMap(lotsMutation.blockName);
      gisPerfLotEditMark('patch_start');
      startTransition(() => {
        setLots((prev) => {
          const removedIds = prev
            .filter((l) => normalizeBlockKeyForMap(l.block) === key)
            .map((l) => String(l.id));
          if (removedIds.length) markLocalPatchSuppress(removedIds);
          return prev.filter((l) => normalizeBlockKeyForMap(l.block) !== key);
        });
        setBlocksData((prev) =>
          prev.filter((l) => normalizeBlockKeyForMap(l.block) !== key),
        );
      });
      gisPerfLotEditMark('patch_end');
      gisPerfLotEditEnd({
        operation: 'removeBlock',
        lotId: String(lotsMutation.blockName).slice(0, 12),
        duplicateRealtimeSuppressed: false,
        fallbackFullReload: false,
      });
      return;
    }

    if (kind === 'upsert' && lotsMutation.blocks?.length) {
      const mapped = lotsMutation.blocks
        .map((b) => mapLotFromBlockRow(b, streetGuidesRef.current))
        .filter(Boolean) as Record<string, unknown>[];
      if (!mapped.length) {
        gisPerfLotEditEnd({
          operation: 'upsert',
          fallbackFullReload: true,
        });
        return;
      }
      markLocalPatchSuppress(mapped.map((l) => String(l.id)));
      gisPerfLotEditMark('patch_start');
      startTransition(() => {
        setLots((prev) => {
          const byId = new Map(prev.map((l) => [String(l.id), l]));
          for (const lot of mapped) {
            const id = String(lot.id);
            const prevLot = byId.get(id);
            byId.set(id, prevLot ? { ...prevLot, ...lot } : lot);
          }
          return Array.from(byId.values());
        });
      });
      gisPerfLotEditMark('patch_end');
      gisPerfLotEditEnd({
        operation: 'upsert',
        lotId: String(mapped[0].id).slice(0, 12),
        duplicateRealtimeSuppressed: false,
        fallbackFullReload: false,
      });
    }
  }, [lotsMutation, markLocalPatchSuppress]);

  useEffect(() => {
    gisPerfNoteGisMapRender({
      lotCount: lots.length,
      streetGuideCount: streetGuides.length,
      liveStreetAudits,
    });
  });
  const handlePickFrontSegment = async (lot: any, segmentIndex: number) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!lot?.id) return;
    const lotId = String(lot.id);
    const projectAtStart = String(projectId || '');
    const candidateEdges = Array.isArray(lot.bounds)
      ? Math.max(0, (lot.bounds as unknown[]).length)
      : 0;

    gisPerfManualFrontBegin({
      operation: 'manual_front',
      lotId: lotId.slice(0, 8),
      blockId: lotId.slice(0, 8),
      edgeIndex: segmentIndex,
      candidateEdges,
    });
    console.info('[GIS_PERF_MANUAL_FRONT] click', {
      lotId: lotId.slice(0, 8),
      edgeIndex: segmentIndex,
    });

    // Fecha modo + feedback local ANTES de qualquer cálculo pesado.
    setFrontCorrectLotId(null);
    setFrontCorrectSaving(true);
    gisPerfManualFrontMark('mode_closed');

    // Libera paint — pan/zoom e banner "Salvando" ficam responsivos.
    await yieldToBrowser();

    if (String(projectId || '') !== projectAtStart) {
      gisPerfManualFrontEnd({
        lotId: lotId.slice(0, 8),
        edgeIndex: segmentIndex,
        projectChangedDuringOperation: true,
        fallbackFullReload: false,
      });
      setFrontCorrectSaving(false);
      return;
    }

    try {
      gisPerfManualFrontMark('compute_start');
      const blockBase = blockWithGeometryFromBounds({
        ...lot,
        segments_json: lot.segments_json,
        number: lot.number,
        area: lot.area,
        front_street_name: lot.frontStreetName,
        front_street_id: lot.frontStreetId,
        source_import: lot.source_import ?? "TXT_CIVIL3D",
      });
      const persistedFrontIdx = normalizeFrontSegmentIndexForPersist(
        blockBase,
        segmentIndex,
      );
      if (persistedFrontIdx < 0) {
        throw new Error('Índice de frente inválido');
      }
      const block: Record<string, unknown> = {
        ...blockBase,
        front_segment_index: persistedFrontIdx,
        front_source: 'manual',
      };

      const measures = getOfficialLotMeasurements(block, lot.number);
      gisPerfManualFrontMark('compute_end');

      gisPerfManualFrontMark('street_start');
      const nearbyStreets = filterStreetGuidesNearLot(
        lot.bounds as Array<[number, number]> | undefined,
        streetGuides as Record<string, unknown>[],
        80,
      );
      const streetMatch = resolveFrontStreetGuideForLot(
        block,
        nearbyStreets.length ? nearbyStreets : streetGuides,
      );
      const streetFields = streetFieldsFromGuideMatch(streetMatch);
      gisPerfManualFrontMark('street_matched');

      console.log("FRONT_SEGMENT_MANUAL_LOCKED", {
        lotId: lot.id,
        segmentIndex,
        persistedFrontIdx,
        candidateStreets: nearbyStreets.length,
        streetMatch: streetMatch
          ? { id: streetMatch.streetGuideId, name: streetMatch.streetGuideName }
          : null,
      });

      if (String(projectId || '') !== projectAtStart) {
        gisPerfManualFrontEnd({
          lotId: lotId.slice(0, 8),
          edgeIndex: segmentIndex,
          candidateStreets: nearbyStreets.length,
          projectChangedDuringOperation: true,
          fallbackFullReload: false,
        });
        setFrontCorrectSaving(false);
        return;
      }

      markLocalPatchSuppress([lotId]);
      gisPerfManualFrontMark('db_start');
      const { patch, frontSourcePersisted } = await persistManualLotFront(
        supabase,
        lot.id,
        measures,
        persistedFrontIdx,
        streetFields,
      );
      gisPerfManualFrontMark('db_complete');

      console.log("BLOCK_FRONT_SAVE_OK", {
        blockId: lot.id,
        lotNumber: lot.number,
        frontSegmentIndex: persistedFrontIdx,
        frontSourcePersisted,
        patchKeys: Object.keys(patch || {}),
      });

      if (String(projectId || '') !== projectAtStart) {
        gisPerfManualFrontEnd({
          lotId: lotId.slice(0, 8),
          edgeIndex: segmentIndex,
          candidateStreets: nearbyStreets.length,
          projectChangedDuringOperation: true,
          fallbackFullReload: false,
        });
        setFrontCorrectSaving(false);
        return;
      }

      gisPerfManualFrontMark('popup_start');
      const updatedDisplay = resolveLotFrontStreetDisplay(
        {
          ...lot,
          front_segment_index: persistedFrontIdx,
          front_street_name: streetFields.front_street_name,
          front_street_id: streetFields.front_street_id,
          front_street_type: streetFields.front_street_type,
        },
        nearbyStreets.length ? nearbyStreets : streetGuides,
      );
      gisPerfManualFrontMark('popup_end');

      gisPerfManualFrontMark('patch_start');
      gisPerfNoteSetLots();
      startTransition(() => {
        setLots((prev) => {
          const idx = prev.findIndex((l) => l.id === lot.id);
          if (idx < 0) return prev;
          const next = prev.slice();
          next[idx] = {
            ...prev[idx],
            frente: measures.frente,
            Fundo: measures.fundo,
            "Lado Dir.": measures.ladoDireito,
            "Lado Esq.": measures.ladoEsquerdo,
            front_segment_index: persistedFrontIdx,
            front_source: frontSourcePersisted ? "manual" : prev[idx].front_source,
            frontStreetName: streetFields.front_street_name,
            frontStreetId: streetFields.front_street_id,
            frontStreetType: streetFields.front_street_type,
            frontStreetDisplay: updatedDisplay,
          };
          return next;
        });
      });
      gisPerfManualFrontMark('local_patch_complete');

      gisPerfManualFrontEnd({
        lotId: lotId.slice(0, 8),
        blockId: lotId.slice(0, 8),
        edgeIndex: segmentIndex,
        candidateEdges,
        candidateStreets: nearbyStreets.length,
        evaluatedNeighbors: 0,
        duplicateRealtimeSuppressed: true,
        fallbackFullReload: false,
        projectChangedDuringOperation: false,
      });

      void logLotAuditEvent(supabase, {
        ...lotAuditContextFromBlock(lot, { projectId: lot.project_id }),
        userId: user?.id ?? null,
        action: "front_corrected",
        title: "Frente corrigida",
        description: updatedDisplay
          ? `Frente para ${updatedDisplay}`
          : `Segmento ${persistedFrontIdx + 1} definido como frente`,
        newData: {
          front_segment_index: persistedFrontIdx,
          frente: measures.frente,
          front_street_name: streetFields.front_street_name,
        },
        source: "gis_map",
      });
    } catch (err: unknown) {
      gisPerfManualFrontEnd({
        lotId: lotId.slice(0, 8),
        edgeIndex: segmentIndex,
        fallbackFullReload: false,
        error: true,
      });
      logSupabaseFrontSaveFailure('GISMap.handlePickFrontSegment', err, {
        blockId: lot.id,
        frontSegmentIndex: segmentIndex,
        lotNumber: lot.number,
      });
      const msg = formatSupabaseError(err);
      alert(`Erro ao salvar frente: ${msg}`);
    } finally {
      setFrontCorrectSaving(false);
    }
  };

  const openConfrontationEditor = (
    lot: any,
    side: SideRole,
    segmentIndexes?: number[],
  ) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    try {
      const block = {
        ...lot,
        block_name: lot.block,
        segments_json: lot.segments_json,
        front_segment_index: lot.front_segment_index,
      };
      let indexes: number[] = [];
      let indexesSource: 'caller' | 'official' | 'empty' = 'empty';
      try {
        if (segmentIndexes?.length) {
          indexes = [...segmentIndexes];
          indexesSource = 'caller';
        } else {
          indexes = officialSegmentIndexesForSide(
            block,
            blocksForConfront,
            side,
          );
          indexesSource = indexes.length ? 'official' : 'empty';
        }
      } catch (err) {
        console.error('[GISMap] officialSegmentIndexesForSide', {
          lotId: lot?.id ?? null,
          lotNumber: lot?.number ?? null,
          side,
          message: err instanceof Error ? err.message : String(err),
          err,
        });
        if (segmentIndexes?.length) {
          indexes = [...segmentIndexes];
          indexesSource = 'caller';
        } else {
          alert(
            'Não foi possível identificar os segmentos desta confrontação. O mapa permanece ativo — tente novamente ou corrija a frente do lote.',
          );
          return;
        }
      }

      if (!indexes.length) {
        console.error('[GISMap] openConfrontationEditor empty indexes', {
          lotId: lot?.id ?? null,
          lotNumber: lot?.number ?? null,
          side,
          indexesSource,
        });
        alert(
          'Nenhum segmento encontrado para esta confrontação. O mapa permanece ativo.',
        );
        return;
      }

      // Prefer auditoria global (Revisar Confrontações); senão carrega só este lote.
      const audit =
        confrontationAudits.get(lot.id) ??
        loadLotConfrontations({
          lot,
          allBlocks: blocksForConfront,
          streetGuides,
        }).audit;
      const primaryIdx = indexes[0];
      const edge =
        primaryIdx != null
          ? audit?.segmentEdges.find((e) => e.segmentIndex === primaryIdx)
          : undefined;
      const rec =
        primaryIdx != null
          ? getSegmentConfrontantRecord(block, primaryIdx)
          : null;
      setConfrontEdit({
        lot,
        side,
        segmentIndexes: indexes,
        currentConfrontant:
          edge?.confrontant ?? rec?.confrontant ?? audit?.sides[side]?.label ?? null,
        currentSource:
          edge?.source ?? rec?.confrontant_source ?? audit?.sides[side]?.source ?? null,
      });
    } catch (err) {
      console.error('[GISMap] openConfrontationEditor', {
        lotId: lot?.id ?? null,
        lotNumber: lot?.number ?? null,
        side,
        message: err instanceof Error ? err.message : String(err),
        err,
      });
      // Não abrir estado parcial — mapa continua operacional.
      alert(
        err instanceof Error
          ? `Erro ao abrir editor de confrontação: ${err.message}`
          : 'Erro ao abrir editor de confrontação. O mapa permanece ativo.',
      );
    }
  };

  const handleConfrontEdgePick = (lot: any, edgeIndex: number) => {
    if (ownerMapWriteBlocked) return;
    if (!assistedConfrontationMode) return;
    let side: SideRole = "fundo";
    const block = {
      ...lot,
      block_name: lot.block,
      segments_json: lot.segments_json,
      front_segment_index: lot.front_segment_index,
    };
    const segmentIndex = utmSegmentIndexFromWgs84RingEdge(block, edgeIndex);
    for (const role of [
      "frente",
      "fundo",
      "ladoDireito",
      "ladoEsquerdo",
    ] as SideRole[]) {
      const idxs = officialSegmentIndexesForSide(
        block,
        blocksForConfront,
        role,
      );
      if (idxs.includes(segmentIndex)) {
        side = role;
        break;
      }
    }
    openConfrontationEditor(lot, side, [segmentIndex]);
  };

  const handleConfirmConfrontant = async (
    confrontant: string,
    confrontantType: ConfrontantPresetType | string | null,
    scope: PropagationScope,
    _targetBlockIds: string[],
    persistScope: SegmentPersistScope = "selected_only",
    explicitIndexes: number[] = [],
  ) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!confrontEdit?.lot?.id || !projectId) return;
    const sourceBlock = {
      ...confrontEdit.lot,
      block_name: confrontEdit.lot.block,
      segments_json: confrontEdit.lot.segments_json,
      front_segment_index: confrontEdit.lot.front_segment_index,
    };
    const selected =
      explicitIndexes.length > 0
        ? explicitIndexes
        : confrontEdit.segmentIndexes;
    const targets = findPropagationTargets(
      blocksForConfront,
      sourceBlock,
      confrontEdit.lot.id,
      confrontEdit.side,
      scope,
      null,
      {
        explicitIndexes: selected,
        persistScope,
        streetGuides,
      },
    );
    const segmentLabel = selected.map((i) => i + 1).join(", ");
    for (const t of targets) {
      const oldRecords = t.segmentIndexes.map((idx) => ({
        segment_index: idx,
        confrontant: getSegmentConfrontantRecord(t.block, idx)?.confrontant ?? null,
      }));
      const updated = applyManualConfrontantToBlock(
        t.block,
        t.segmentIndexes,
        confrontant,
        confrontantType,
      );
      const rows = updated.segments_json as Record<string, unknown>[];
      await persistBlockSegmentsJson(supabase, t.blockId, rows);
      markLocalPatchSuppress([String(t.blockId)]);
      setLots((prev) =>
        prev.map((l) =>
          l.id === t.blockId ? { ...l, segments_json: rows } : l,
        ),
      );
      if (t.blockId === confrontEdit.lot.id) {
        void logLotAuditEvent(supabase, {
          ...lotAuditContextFromBlock(confrontEdit.lot, { projectId }),
          userId: user?.id ?? null,
          action: "confrontation_manual",
          title: "Confrontação manual alterada",
          description: `Segmento ${segmentLabel} alterado para ${confrontant}`,
          oldData: {
            side: confrontEdit.side,
            segments: oldRecords,
          },
          newData: {
            side: confrontEdit.side,
            segment_indexes: t.segmentIndexes,
            confrontant,
            confrontantType,
            scope,
            persistScope,
          },
          source: "gis_map",
        });
      }
    }
  };

  const handleClearManualConfrontant = async (
    scope: PropagationScope,
    _targetBlockIds: string[],
    persistScope: SegmentPersistScope = "selected_only",
    explicitIndexes: number[] = [],
  ) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!confrontEdit?.lot?.id || !projectId) return;
    const sourceBlock = {
      ...confrontEdit.lot,
      block_name: confrontEdit.lot.block,
      segments_json: confrontEdit.lot.segments_json,
      front_segment_index: confrontEdit.lot.front_segment_index,
    };
    const selected =
      explicitIndexes.length > 0
        ? explicitIndexes
        : confrontEdit.segmentIndexes;
    const targets = findPropagationTargets(
      blocksForConfront,
      sourceBlock,
      confrontEdit.lot.id,
      confrontEdit.side,
      scope,
      null,
      {
        explicitIndexes: selected,
        persistScope,
        streetGuides,
      },
    );
    const segmentLabel = selected.map((i) => i + 1).join(", ");
    for (const t of targets) {
      const oldRecords = t.segmentIndexes.map((idx) => ({
        segment_index: idx,
        confrontant: getSegmentConfrontantRecord(t.block, idx)?.confrontant ?? null,
      }));
      const updated = clearManualConfrontantFromBlock(
        t.block,
        t.segmentIndexes,
      );
      const rows = updated.segments_json as Record<string, unknown>[];
      await persistBlockSegmentsJson(supabase, t.blockId, rows);
      setLots((prev) =>
        prev.map((l) =>
          l.id === t.blockId ? { ...l, segments_json: rows } : l,
        ),
      );
      if (t.blockId === confrontEdit.lot.id) {
        void logLotAuditEvent(supabase, {
          ...lotAuditContextFromBlock(confrontEdit.lot, { projectId }),
          userId: user?.id ?? null,
          action: "confrontation_manual",
          title: "Confrontação manual removida",
          description: `Segmento ${segmentLabel}: correção manual removida`,
          oldData: {
            side: confrontEdit.side,
            segments: oldRecords,
          },
          newData: {
            side: confrontEdit.side,
            segment_indexes: t.segmentIndexes,
            persistScope,
            scope,
          },
          source: "gis_map",
        });
      }
    }
  };

  const blockBoundingBoxes = useMemo(
    () => buildBlockBoundingBoxes(lots),
    [lots],
  );

  const lotGeometryValidations = useMemo(() => {
    return gisPerfMeasureSync(
      'geometry_validations',
      () => {
        const map = new Map<string, ValidateLotGeometryResult>();
        for (const lot of lots) {
          if (!lot.bounds?.length) continue;
          map.set(
            lot.id,
            validateLotGeometry(
              lot,
              blockBoundingBoxes.get(normalizeBlockKey(lot.block)) ?? null,
            ),
          );
        }
        return map;
      },
      { lotCount: lots.length },
    );
  }, [lots, blockBoundingBoxes]);

  const safeMapBounds = useMemo(() => {
    const focusKey = focusBlockName
      ? normalizeBlockKey(focusBlockName)
      : null;
    const validatedLots: ValidatedLotForBounds[] = [];
    for (const lot of lots) {
      const validation = lotGeometryValidations.get(lot.id);
      if (!validation?.valid || validation.cleanedCoords.length < 3) continue;
      if (focusKey && normalizeBlockKey(lot.block) !== focusKey) continue;
      validatedLots.push({
        number: lot.number,
        block: lot.block,
        cleanedCoords: validation.cleanedCoords,
      });
    }
    if (focusKey && validatedLots.length === 0) {
      for (const lot of lots) {
        const validation = lotGeometryValidations.get(lot.id);
        if (!validation?.valid || validation.cleanedCoords.length < 3) continue;
        validatedLots.push({
          number: lot.number,
          block: lot.block,
          cleanedCoords: validation.cleanedCoords,
        });
      }
    }
    return getSafeMapBounds(validatedLots, blockBoundingBoxes);
  }, [lots, lotGeometryValidations, blockBoundingBoxes, focusBlockName]);

  const lotLabelItems = useMemo((): LotLabelItem[] => {
    return gisPerfMeasureSync(
      'gis_labels_preparation',
      () => {
        const items: LotLabelItem[] = [];
        for (const lot of lots) {
          const validation = lotGeometryValidations.get(lot.id);
          if (!validation?.valid || validation.cleanedCoords.length < 3) continue;
          const displayNum = normalizeLotDisplayNum(lot.number);
          if (!displayNum || displayNum === "0") continue;
          items.push({
            id: lot.id,
            bounds: validation.cleanedCoords,
            displayNum,
            lot,
          });
        }
        return items;
      },
      { lotCount: lots.length },
    );
  }, [lots, lotGeometryValidations]);

  // Medição de distância / área
  const handleMeasureDeactivate = onMeasureDeactivate ?? (() => {});
  const handleAreaMeasureDeactivate = onAreaMeasureDeactivate ?? (() => {});
  const gisMeasureToolActive = measureActive || areaMeasureActive;
  const gisMeasureToolActiveRef = useRef(gisMeasureToolActive);
  useEffect(() => {
    gisMeasureToolActiveRef.current = gisMeasureToolActive;
  }, [gisMeasureToolActive]);

  const distanceMeasure = useDistanceMeasureWithHud(
    measureActive,
    handleMeasureDeactivate,
  );
  const areaMeasure = useAreaMeasureWithHud(
    areaMeasureActive,
    handleAreaMeasureDeactivate,
  );

  // Formulário de Cliente
  const [customerForm, setCustomerForm] = useState<{
    lot: any;
    action: string;
    price: number;
    prefillFromReservation?: boolean;
    mode?: "create" | "edit";
    editContext?: SaleEditLoadedContext;
  } | null>(null);
  const [brokersList, setBrokersList] = useState<
    {
      id: string;
      name: string;
      commission_percent?: number | null;
      commission_mode?: string | null;
      commission_fixed_amount?: number | null;
    }[]
  >([]);
  const [tenantContractModel, setTenantContractModel] = useState<string>("PADRAO");
  const [editSaleLoading, setEditSaleLoading] = useState<string | null>(null);

  const userCanEditSale = isPartnerPanelAdmin(user?.role);

  useEffect(() => {
    async function loadBrokersAndContractModel() {
      if (!user?.tenant_id || !isBrowserOnline()) return;
      const [{ data: brokers }, { data: company }] = await Promise.all([
        supabase
          .from("brokers")
          .select("id, name, commission_percent, commission_mode, commission_fixed_amount")
          .eq("tenant_id", user.tenant_id)
          .eq("active", true)
          .order("name"),
        supabase
          .from("companies")
          .select("contract_model")
          .eq("id", user.tenant_id)
          .maybeSingle(),
      ]);
      setBrokersList(
        (brokers || []).map((b) => ({
          id: b.id,
          name: b.name || "Corretor",
          commission_percent: b.commission_percent ?? null,
          commission_mode: b.commission_mode ?? null,
          commission_fixed_amount: b.commission_fixed_amount ?? null,
        })),
      );
      setTenantContractModel(
        normalizeSaleContractModel(company?.contract_model),
      );
    }
    if (user) void loadBrokersAndContractModel();
  }, [user?.tenant_id, user?.id]);

  const openEditSaleForm = async (lot: any) => {
    if (!userCanEditSale) {
      alert("Apenas administradores podem editar vendas concluídas.");
      return;
    }
    setEditSaleLoading(lot.id);
    try {
      const ctx = await loadSaleEditContext(supabase, {
        blockId: lot.id,
        saleId: lot.saleId,
      });
      setCustomerForm({
        lot: {
          ...lot,
          customerId: ctx.customerId,
          saleId: ctx.saleId,
          contractId: ctx.contractId,
        },
        action: "Vendido",
        price: ctx.lotPrice || lot.price,
        mode: "edit",
        editContext: ctx,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar venda";
      alert(msg);
    } finally {
      setEditSaleLoading(null);
    }
  };

  const handleViewContract = (lot: any) => {
    void logLotAuditEvent(supabase, {
      ...lotAuditContextFromBlock(lot, {
        contractId: lot.contractId ?? null,
        saleId: lot.saleId ?? null,
      }),
      userId: user?.id ?? null,
      action: "contract_viewed",
      title: "Contrato visualizado",
      description: lot.contractId
        ? "Abertura da tela de contratos"
        : "Contrato não vinculado ao lote",
      source: "contract_flow",
    });
    if (lot.contractId) {
      window.open(`/contracts?highlight=${lot.contractId}`, "_blank");
    } else {
      window.open("/contracts", "_blank");
    }
  };

  const handleViewFinance = (lot: any) => {
    window.open("/finance", "_blank");
  };

  const handleRegenerateContractFromMap = async (lot: any) => {
    if (!lot.contractId) {
      alert("Contrato não encontrado para este lote.");
      return;
    }
    if (
      !confirm(
        "Regenerar o contrato com os dados atuais? A versão anterior será mantida no histórico.",
      )
    ) {
      return;
    }
    setActionLoading(`regen-${lot.id}`);
    try {
      const res = await fetch(`/api/contracts/${lot.contractId}/regenerate`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        if (json.missingFields?.length) {
          setCustomerContractValidation({
            valid: false,
            missingFields: json.missingFields,
            missingRequired: json.missingFields,
            missingRecommended: [],
            customerId: json.customerId,
          });
          return;
        }
        throw new Error(json.error || "Falha ao regenerar contrato");
      }
      alert("Contrato regenerado com sucesso.");
      if (json.contract?.id) {
        setLots((prev) =>
          prev.map((l) =>
            l.id === lot.id ? { ...l, contractId: json.contract.id } : l,
          ),
        );
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao regenerar contrato");
    } finally {
      setActionLoading(null);
    }
  };

  const openCustomerForm = (lot: any, action: string, price: number) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!isBrowserOnline() && action === "Vendido") {
      blockOfflineSale();
      return;
    }
    const isReserved =
      String(lot.status || "").toLowerCase() === "reservado" ||
      lot.status === "Reservado";
    setCustomerForm({
      lot,
      action,
      price,
      prefillFromReservation: action === "Vendido" && isReserved && Boolean(lot.customerId),
    });
  };

  // Clear Confirm Modal
  const [clearConfirmModal, setClearConfirmModal] = useState<{
    lot: any;
    price: number;
  } | null>(null);

  // Ao entrar no modo exclusivo de medição: fechar painéis comerciais do lote.
  useEffect(() => {
    if (!gisMeasureToolActive) return;
    setCustomerForm(null);
    setClearConfirmModal(null);
    setFrontCorrectLotId(null);
  }, [gisMeasureToolActive]);

  const gisOverlayOpen = computeGisMapOverlayOpen({
    customerForm: Boolean(customerForm),
    customerContractValidation: Boolean(customerContractValidation),
    clearConfirmModal: Boolean(clearConfirmModal),
    confrontEdit: Boolean(confrontEdit),
  });

  useEffect(() => {
    onOverlayOpenChange?.(gisOverlayOpen);
  }, [gisOverlayOpen, onOverlayOpenChange]);

  useEffect(() => {
    return () => {
      onOverlayOpenChange?.(false);
    };
  }, [onOverlayOpenChange]);

  // Draw street state
  const [drawStreetPoints, setDrawStreetPoints] = useState<L.LatLng[]>([]);

  useEffect(() => {
    async function loadLots() {
      gisPerfNoteLoadLots();
      if (!user || !projectId) {
        setLoading(false);
        return;
      }

      gisPerfBeginSession(projectId);

      if (!isBrowserOnline()) {
        try {
          gisPerfMarkStart('supabase_fetch');
          const { lots, blocksData } = await loadOfflineMapGeometries(projectId);
          gisPerfMarkEnd('supabase_fetch', { source: 'offline_cache' });
          gisPerfSetLotCount(lots.length);
          setLots(lots as any[]);
          setBlocksData(blocksData as any[]);
          console.log('GIS_MAP_OFFLINE_CACHE_USED', {
            projectId,
            lots: lots.length,
            blocksData: blocksData.length,
          });
          try {
            gisPerfMarkStart('geometry_diagnostic');
            runLotGeometryDiagnosticReport(blocksData as Record<string, unknown>[], {
              projectId,
              context: 'GISMap-offline',
            });
            gisPerfMarkEnd('geometry_diagnostic');
          } catch (diagErr: unknown) {
            console.error('[LOT GEOMETRY DEBUG] GISMap-offline failed', diagErr);
            gisPerfMarkEnd('geometry_diagnostic', { error: true });
          }
        } catch (e) {
          console.error('[OFFLINE] erro ao carregar mapa', e);
          setLots([]);
          setBlocksData([]);
        } finally {
          setLoading(false);
          gisPerfFinishSession({ path: 'offline' });
        }
        return;
      }

      try {
        const applyTenant = user.role !== "SUPER_ADMIN" && Boolean(user.tenant_id);
        if (user.role !== "SUPER_ADMIN" && !user.tenant_id) {
          // Bloquear se não tiver tenant
          setLots([]);
          setLoading(false);
          gisPerfFinishSession({ path: 'blocked_no_tenant' });
          return;
        }

        gisPerfMarkStart('gis_fetch_request');
        const blocksFetch = await fetchAllBlocksForProject(supabase, projectId, {
          select: BLOCKS_GIS_SELECT,
          applyTenant,
          tenantId: applyTenant ? user.tenant_id : null,
        });
        const blocksRes = {
          data: blocksFetch.rows as any[],
          error: null as null,
        };
        gisPerfMarkEnd('gis_fetch_request', {
          rowCount: blocksRes.data?.length ?? 0,
          hasError: false,
          pagesFetched: blocksFetch.pagesFetched,
          wouldTruncateWithoutPagination:
            blocksFetch.wouldTruncateWithoutPagination,
          exactCount: blocksFetch.exactCount,
        });

        console.group('[SECURITY] GISMap Load');
        console.log('Empresa logada:', user?.company_id || user?.tenant_id);
        console.log('Tenant ativo:', user?.tenant_id);
        console.log('Project ID carregado:', projectId);
        console.log('Total de lotes carregados:', blocksRes.data?.length || 0);
        console.groupEnd();

        if (blocksRes.data) {
          gisPerfSetLotCount(blocksRes.data.length);
          gisPerfMarkStart('gis_fetch_response_parse');
          const payload = gisPerfMeasurePayloadBytes(blocksRes.data);
          const structural = gisPerfSummarizeBlocksPayload(
            blocksRes.data as Record<string, unknown>[],
          );
          gisPerfMarkEnd('gis_fetch_response_parse', {
            bytes: payload.bytes,
            approxKb: payload.approxKb,
            approxMb: payload.approxMb,
            ...structural,
          });

          console.error('GISMAP DIAGNOSTIC START', {
            projectId,
            blockCount: blocksRes.data.length,
          });
          try {
            // Diagnóstico geométrico completo só com ?gisPerf=1 (não no load normal).
            if (isGisPerfDiagnosticsEnabled() && perfToggles.panelActive) {
              gisPerfMarkStart('geometry_diagnostic');
              const gisReport = runLotGeometryDiagnosticReport(
                blocksRes.data as Record<string, unknown>[],
                { projectId, context: 'GISMap-load' },
              );
              gisPerfMarkEnd('geometry_diagnostic', {
                lotCount: blocksRes.data.length,
              });
              console.error('DIAGNOSTIC REPORT', gisReport);
            } else {
              gisPerfMarkStart('geometry_diagnostic');
              gisPerfMarkEnd('geometry_diagnostic', {
                skipped: true,
                lotCount: blocksRes.data.length,
              });
            }
          } catch (diagErr: unknown) {
            console.error('[LOT GEOMETRY DEBUG] GISMap-load failed', diagErr);
            gisPerfMarkEnd('geometry_diagnostic', { error: true });
          }

          gisPerfMarkStart('gis_lots_normalization');
          const memoryBefore = gisPerfMemorySnapshot();
          // Yield antes da normalização pesada — mapa-base já pode pintar.
          await yieldToBrowser();
          let dimsMs = 0;
          let dimsRuns = 0;
          let parseMs = 0;
          const allPolygons = blocksRes.data
            .filter((b: any) => b.geometry && b.geometry.type === "Polygon" && b.geometry.coordinates)
            .map((b: any) => b.geometry.coordinates[0]);

          const CHUNK = 80;
          const parsedBlocks: any[] = [];
          for (let i = 0; i < blocksRes.data.length; i++) {
            const b = blocksRes.data[i];
            const tParse = performance.now();
            let { bounds, geometryType, coordCount } = boundsFromBlockGeometry(
              b as Record<string, unknown>,
              b.number,
            );
            parseMs += performance.now() - tParse;

            if (bounds.length === 0) {
              console.log("GIS_LOT_WITHOUT_GEOMETRY", {
                lote: b.number,
                quadra: b.block_name || b.name,
                source_import: b.source_import ?? null,
              });
            }

            let dimsFromGeo: any = null;

            if (
              (geometryType === "Polygon" || geometryType === "MultiPolygon") &&
              b.geometry?.coordinates
            ) {
              const ring =
                geometryType === "Polygon"
                  ? b.geometry.coordinates[0]
                  : b.geometry.coordinates[0]?.[0];
              if (ring && b.source_import !== "TXT_CIVIL3D" && perfToggles.dimensions) {
                try {
                  const tDim = performance.now();
                  dimsFromGeo = calculateLotDimensions(
                    ring,
                    allPolygons,
                    b.properties || {},
                  );
                  dimsMs += performance.now() - tDim;
                  dimsRuns += 1;
                } catch (err) {
                  console.error("Erro recálculo dimensões GISMap", err);
                }
              }
            }

            let lotMeasures: ReturnType<typeof resolveLotMeasuresFromBlock>;
            try {
              lotMeasures = resolveLotMeasuresFromBlock({
                ...b,
                frente: b.frente !== null ? b.frente : dimsFromGeo?.frente,
                Fundo:
                  b.Fundo !== null && b.Fundo !== undefined
                    ? b.Fundo
                    : dimsFromGeo?.fundo,
                "Lado Dir.":
                  b["Lado Dir."] !== null && b["Lado Dir."] !== undefined
                    ? b["Lado Dir."]
                    : dimsFromGeo?.ladoDireito,
                "Lado Esq.":
                  b["Lado Esq."] !== null && b["Lado Esq."] !== undefined
                    ? b["Lado Esq."]
                    : dimsFromGeo?.ladoEsquerdo,
              });
            } catch (measureErr) {
              console.warn('GISMAP_LOT_MEASURES_SKIP', b.number, measureErr);
              lotMeasures = {
                sides: {
                  frente: parseBlockSideLength(b.frente),
                  fundo: parseBlockSideLength(b.Fundo ?? b.fundo),
                  ladoDireito: parseBlockSideLength(b["Lado Dir."]),
                  ladoEsquerdo: parseBlockSideLength(b["Lado Esq."]),
                },
                chanfre: null,
                curva: null,
              };
            }

            const pendingManualPrice = pendingLotPricesRef.current.get(b.id);
            const blockPrice =
              pendingManualPrice !== undefined
                ? pendingManualPrice ?? 0
                : b.price !== null && b.price !== undefined
                  ? Number(b.price)
                  : 0;

            parsedBlocks.push({
              raw: b,
              bounds,
              geometryType,
              coordCount,
              lotMeasures,
              blockPrice,
            });

            if ((i + 1) % CHUNK === 0) {
              await yieldToBrowser();
            }
          }

          const normalizedLots = parsedBlocks
            .map(({
              raw: b,
              bounds,
              geometryType,
              coordCount,
              lotMeasures,
              blockPrice,
            }) => ({
                id: b.id,
                project_id: b.project_id,
                block: b.block_name || b.name || "?",
                projectName: b.projects?.name || "?",
                customerName: b.customers?.name || null,
                customerId: b.customer_id || null,
                saleId: b.sale_id || null,
                contractId: b.contract_id || null,
                broker_id: b.broker_id || null,
                tenant_id: b.tenant_id || b.company_id || null,
                company_id: b.company_id || b.tenant_id || null,
                reservation_date: b.reservation_date || null,
                reservation_expires_at: b.reservation_expires_at || null,
                reserved_by_user_id: b.reserved_by_user_id || null,
                reserved_by_name: b.reserved_by_name || null,
                signal_amount: b.signal_amount,
                signal_date: b.signal_date,
                signal_payment_method: b.signal_payment_method,
                signal_notes: b.signal_notes,
                number: b.number || "0",
                status: b.status || "Disponível",
                area:
                  b.area !== null && b.area !== undefined ? Number(b.area) : 0,
                price: blockPrice,
                geometryType,
                coordCount,
                bounds,
                segments_json: b.segments_json,
                front_segment_index: b.front_segment_index ?? null,
                source_import: b.source_import ?? null,
                perimeter: b.perimeter ?? null,
                frente: lotMeasures.sides.frente,
                Fundo: lotMeasures.sides.fundo,
                "Lado Dir.": lotMeasures.sides.ladoDireito,
                "Lado Esq.": lotMeasures.sides.ladoEsquerdo,
                chanfreInfo: lotMeasures.chanfre,
                frontStreetName: b.front_street_name || null,
                frontStreetType: b.front_street_type || null,
                frontStreetWidth: b.front_street_width ?? null,
                frontStreetId: b.front_street_id || null,
                frontStreetDisplay:
                  resolveLotFrontStreetDisplay(b, streetGuides) ||
                  (b.front_street_name
                    ? formatStreetDisplay(b.front_street_type, b.front_street_name)
                    : null),
              }))
            .filter((b) => Array.isArray(b.bounds) && b.bounds.length > 0);
          const polygonLots = normalizedLots.filter(
            (b) =>
              b.geometryType === "Polygon" ||
              b.geometryType === "MultiPolygon",
          );
          const lineBlocks = normalizedLots.filter(
            (b) =>
              b.geometryType === "LineString" ||
              b.geometryType === "MultiLineString",
          );

          gisPerfNote('gis_coordinate_conversion', parseMs, {
            lotCount: blocksRes.data.length,
            alias: 'parse_bounds',
          });
          gisPerfNote('gis_dimensions_calculation', dimsMs, {
            runs: dimsRuns,
            skippedTxtCivil: blocksRes.data.length - dimsRuns,
            enabled: perfToggles.dimensions,
          });
          gisPerfMarkEnd('gis_lots_normalization', {
            polygonLots: polygonLots.length,
            lineBlocks: lineBlocks.length,
            memoryBeforeMb: memoryBefore?.usedJsHeapMb ?? null,
          });

          gisPerfMarkStart('set_state');
          gisPerfNoteSetLots();
          setLots(polygonLots);
          setBlocksData(lineBlocks);
          gisPerfMarkEnd('set_state');

          if (isBrowserOnline()) {
            const projectName =
              String(
                blocksRes.data?.[0]?.projects?.name ||
                  polygonLots[0]?.projectName ||
                  '',
              ) || undefined;
            await saveMapProjectCache({
              projectId,
              tenantId: String(user.tenant_id || user.company_id || ''),
              projectName,
              blocksRaw: blocksRes.data as Record<string, unknown>[],
              lots: polygonLots as Record<string, unknown>[],
              blocksData: lineBlocks as Record<string, unknown>[],
              updatedAt: new Date().toISOString(),
            });
          }
        }
      } catch (e) {
        console.error("Error loading map geometries:", e);
      } finally {
        setLoading(false);
        // React/Leaflet mount is measured on next paint after loading=false
        if (typeof window !== 'undefined' && isGisPerfDiagnosticsEnabled()) {
          gisPerfMarkStart('gis_react_elements_creation');
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              gisPerfMarkEnd('gis_react_elements_creation');
              gisPerfMarkStart('gis_map_layer_mount');
              gisPerfMarkEnd('gis_map_layer_mount');
              gisPerfNote('gis_first_interactive', 0, {
                memory: Boolean(gisPerfMemorySnapshot()),
              });
              const memoryAfter = gisPerfMemorySnapshot();
              gisPerfFinishSession({
                path: 'online',
                renderer: 'svg_default',
                boundaryLines: showBoundaryLines,
                labelsAlwaysOn: showPermanentLabels,
                perfPanel: perfToggles.panelActive,
                memoryAfter,
                auditsDeferredUntilAssistedTools: true,
                geometryDiagnosticSkippedUnlessPanel: true,
                progressiveNormalizeChunk: 80,
                toggles: perfToggles.panelActive
                  ? {
                      polygons: perfToggles.polygons,
                      labels: perfToggles.labels,
                      popups: perfToggles.popups,
                      events: perfToggles.events,
                      dimensions: perfToggles.dimensions,
                      audits: perfToggles.confrontationAudits,
                      fitBounds: perfToggles.fitBounds,
                    }
                  : null,
              });
            });
          });
        } else {
          gisPerfFinishSession({ path: 'online_no_diag' });
        }
      }
    }

    loadLots();

    if (!isBrowserOnline()) {
      return;
    }

    const applyRealtimePayload = async (payload: {
      eventType?: string;
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      const eventType = String(payload.eventType || '').toUpperCase();
      const rowNew = (payload.new || {}) as Record<string, unknown>;
      const rowOld = (payload.old || {}) as Record<string, unknown>;
      const lotId = String(rowNew.id || rowOld.id || '');
      if (!lotId) return;

      gisPerfRealtimePatchBegin({
        operation: eventType || 'UNKNOWN',
        lotId: lotId.slice(0, 8),
      });

      if (isLocalPatchSuppressed(lotId)) {
        gisPerfNoteRealtimeEvent();
        gisPerfNoteDuplicateRealtimeSuppressed();
        gisPerfRealtimePatchEnd({
          operation: eventType,
          lotId: lotId.slice(0, 8),
          duplicateRealtimeSuppressed: true,
          fallbackFullReload: false,
          loadLotsDelta: 0,
        });
        return;
      }

      gisPerfNoteRealtimeEvent();

      const rowProject = String(rowNew.project_id || rowOld.project_id || '');
      if (rowProject && projectId && rowProject !== String(projectId)) {
        gisPerfRealtimePatchEnd({
          operation: eventType,
          skipped: 'other_project',
          fallbackFullReload: false,
        });
        return;
      }

      if (eventType === 'DELETE') {
        gisPerfRealtimePatchMark('patch_start');
        startTransition(() => {
          setLots((prev) => prev.filter((l) => String(l.id) !== lotId));
          setBlocksData((prev) => prev.filter((l) => String(l.id) !== lotId));
        });
        gisPerfRealtimePatchMark('patch_end');
        gisPerfRealtimePatchEnd({
          operation: 'DELETE',
          lotId: lotId.slice(0, 8),
          duplicateRealtimeSuppressed: false,
          fallbackFullReload: false,
        });
        return;
      }

      let row: Record<string, unknown> = rowNew;
      const needsFetch =
        !row.geometry ||
        (row.geometry as { coordinates?: unknown })?.coordinates == null;

      if (needsFetch) {
        gisPerfRealtimePatchMark('db_start');
        const { data, error } = await supabase
          .from('blocks')
          .select('*, projects(name), customers(name)')
          .eq('id', lotId)
          .maybeSingle();
        gisPerfRealtimePatchMark('db_end');
        if (error || !data) {
          console.warn('GIS_REALTIME_FETCH_FALLBACK_FULL', lotId, error);
          gisPerfRealtimePatchEnd({
            operation: eventType,
            lotId: lotId.slice(0, 8),
            fallbackFullReload: true,
          });
          void loadLots();
          return;
        }
        row = data as Record<string, unknown>;
      }

      if (
        row.project_id &&
        projectId &&
        String(row.project_id) !== String(projectId)
      ) {
        gisPerfRealtimePatchEnd({
          operation: eventType,
          skipped: 'other_project',
          fallbackFullReload: false,
        });
        return;
      }

      const pendingPrice = pendingLotPricesRef.current.get(lotId);
      const mapped = mapLotFromBlockRow(row, streetGuidesRef.current, {
        pendingPrice:
          pendingPrice !== undefined ? pendingPrice : undefined,
      });

      if (!mapped) {
        console.warn('GIS_REALTIME_MAP_LOT_FAILED', lotId);
        gisPerfRealtimePatchEnd({
          operation: eventType,
          lotId: lotId.slice(0, 8),
          fallbackFullReload: true,
        });
        void loadLots();
        return;
      }

      gisPerfRealtimePatchMark('patch_start');
      startTransition(() => {
        setLots((prev) => {
          const idx = prev.findIndex((l) => String(l.id) === lotId);
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = { ...prev[idx], ...mapped };
            return next;
          }
          if (eventType === 'INSERT') return [...prev, mapped];
          return [...prev, mapped];
        });
      });
      gisPerfRealtimePatchMark('patch_end');
      gisPerfRealtimePatchEnd({
        operation: eventType || 'UPDATE',
        lotId: lotId.slice(0, 8),
        duplicateRealtimeSuppressed: false,
        fallbackFullReload: false,
      });
    };

    const channel = supabase
      .channel(`realtime:blocks:${projectId}`)
      .on(
        "postgres_changes",
        projectId
          ? {
              event: "*",
              schema: "public",
              table: "blocks",
              filter: `project_id=eq.${projectId}`,
            }
          : {
              event: "*",
              schema: "public",
              table: "blocks",
            },
        (payload) => {
          void applyRealtimePayload({
            eventType: payload.eventType,
            new: payload.new as Record<string, unknown>,
            old: payload.old as Record<string, unknown>,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, projectId, refreshKey, isLocalPatchSuppressed]);

  const handleLotPriceSaved = (lotId: string, price: number | null) => {
    gisPerfLotEditBegin({
      operation: 'price',
      lotId: String(lotId).slice(0, 8),
    });
    markLocalPatchSuppress([String(lotId)]);
    pendingLotPricesRef.current.set(lotId, price);
    window.setTimeout(() => {
      pendingLotPricesRef.current.delete(lotId);
    }, 8000);

    const normalized = price ?? 0;
    gisPerfLotEditMark('patch_start');
    startTransition(() => {
      setLots((prev) =>
        prev.map((l) => (l.id === lotId ? { ...l, price: normalized } : l)),
      );
      setBlocksData((prev) =>
        prev.map((l) => (l.id === lotId ? { ...l, price: normalized } : l)),
      );
    });
    gisPerfLotEditMark('patch_end');
    gisPerfLotEditEnd({
      operation: 'price',
      lotId: String(lotId).slice(0, 8),
      duplicateRealtimeSuppressed: false,
      fallbackFullReload: false,
    });
    onEnterpriseValueRefresh?.();
  };

  const handleLotAction = async (
    lot: any,
    newStatusString: string,
    newPrice?: number,
  ) => {
    if (!user) return;
    if (blockOwnerWriteOnClient(user.role)) {
      return;
    }

    // Liberação comercial (vendido/reservado → Disponível) só via API /release
    if (
      newStatusString === "Disponível" &&
      lotNeedsReleaseConfirm(lot)
    ) {
      setClearConfirmModal({ lot, price: newPrice !== undefined ? newPrice : lot.price });
      return;
    }

    setActionLoading(lot.id);
    const newStatus = newStatusString;
    const finalPrice = newPrice !== undefined ? newPrice : lot.price;
    const lotId = String(lot.id);

    gisPerfLotEditBegin({
      operation: 'status',
      lotId: lotId.slice(0, 8),
    });
    markLocalPatchSuppress([lotId]);

    // Optimistic UI updates
    gisPerfLotEditMark('patch_start');
    startTransition(() => {
      setLots((prev) =>
        prev.map((l) =>
          l.id === lot.id
            ? {
                ...l,
                status: newStatus,
                price: finalPrice,
                ...(newStatus === "Disponível"
                  ? {
                      customer_id: null,
                      customerId: null,
                      customerName: null,
                      broker_id: null,
                      reservation_date: null,
                      reservation_expires_at: null,
                      reserved_by_user_id: null,
                      reserved_by_name: null,
                    }
                  : {}),
              }
            : l,
        ),
      );
      setBlocksData((prev) =>
        prev.map((l) =>
          l.id === lot.id
            ? {
                ...l,
                status: newStatus,
                price: finalPrice,
                ...(newStatus === "Disponível"
                  ? {
                      customer_id: null,
                      customerId: null,
                      customerName: null,
                      broker_id: null,
                      reservation_date: null,
                      reservation_expires_at: null,
                      reserved_by_user_id: null,
                      reserved_by_name: null,
                    }
                  : {}),
              }
            : l,
        ),
      );
    });
    gisPerfLotEditMark('patch_end');

    try {
      const updatePayload: any = { status: newStatus, price: finalPrice };
      if (newStatus === "Disponível") {
        updatePayload.customer_id = null;
        updatePayload.sale_id = null;
        updatePayload.contract_id = null;
        updatePayload.broker_id = null;
        updatePayload.reservation_expires_at = null;
        updatePayload.reservation_date = null;
        updatePayload.reserved_by_user_id = null;
        updatePayload.reserved_by_name = null;
      }

      gisPerfLotEditMark('db_start');
      const { error: updateError } = await supabase
        .from("blocks")
        .update(updatePayload)
        .eq("id", lot.id);
      gisPerfLotEditMark('db_end');

      if (updateError) throw updateError;

      const title = `Lote Quadra ${lot.block} Lote ${lot.number} atualizado para ${newStatus}`;

      await supabase.from("logs").insert({
        ...(user.tenant_id || lot.tenant_id
          ? { tenant_id: user.tenant_id || lot.tenant_id }
          : {}),
        user_id: user.id,
        action: newStatus,
        details: {
          title,
          subtitle: `Ação no mapa por ${user.name}`,
        },
      });

      void logLotAuditEvent(supabase, {
        ...lotAuditContextFromBlock(lot, { projectId: lot.project_id }),
        userId: user.id,
        action: "status_changed",
        title: "Status do lote alterado",
        description: `${lot.status || "—"} → ${newStatus}`,
        oldData: { status: lot.status, price: lot.price },
        newData: { status: newStatus, price: finalPrice },
        source: "gis_map",
      });
      gisPerfLotEditEnd({
        operation: 'status',
        lotId: lotId.slice(0, 8),
        duplicateRealtimeSuppressed: false,
        fallbackFullReload: false,
      });
    } catch (e) {
      console.error("Action error:", e);
      gisPerfLotEditEnd({
        operation: 'status',
        lotId: lotId.slice(0, 8),
        fallbackFullReload: false,
        error: true,
      });
      alert("Erro ao realizar ação");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveCustomerAndLot = async (
    lot: any,
    newStatus: string,
    finalPrice: number,
    customerData: any,
  ) => {
    if (!user) return;

    let finalBrokerId = customerData.broker_id?.trim() || null;
    if (!finalBrokerId && user?.role === 'BROKER') {
      const { data: brokerData } = await supabase
        .from('brokers')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      console.log('BROKER_AUTH_USER_ID:', user.id);
      if (brokerData) {
        finalBrokerId = brokerData.id;
        console.log('BROKER_DB_RECORD_FOUND:', finalBrokerId);
      }
    }
    console.log('FINAL_BROKER_ID_USED_IN_SALE:', finalBrokerId);

    if (isLotSold(lot.status) && (newStatus === "Vendido" || newStatus === "Reservado")) {
      alert("Este lote já está vendido. Para vender novamente, primeiro disponibilize o lote usando a liberação administrativa com senha.");
      return;
    }

    let finalProjectId = lot.project_id;
    if (!finalProjectId && projectId) finalProjectId = projectId;

    if (!finalProjectId) {
      alert("Projeto do lote não identificado.");
      return;
    }

    let finalTenantId = user.tenant_id;
    if (!finalTenantId) {
      alert("Empresa não identificada. Faça login novamente.");
      return;
    }

    if (!isBrowserOnline()) {
      if (isVendidoStatus(newStatus)) {
        blockOfflineSale();
        return;
      }
      if (newStatus === "Reservado") {
        try {
          await queueOfflineReservation({
            lot,
            finalPrice,
            customerData,
            user: {
              id: user.id,
              tenant_id: finalTenantId,
              role: user.role,
              name: user.name,
              email: user.email,
            },
            brokerId: finalBrokerId,
          });
          alert(
            `Reserva OFFLINE registrada para o lote ${lot.block} / ${lot.number}.\n\nAo voltar a internet, o sistema sincroniza e valida se o lote ainda está disponível.`,
          );
          setCustomerForm(null);
          const cached = await getMapProjectCache(String(finalProjectId));
          if (cached) {
            setLots(cached.lots as any[]);
            setBlocksData((cached.blocksData as any[]) || []);
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          alert("Erro ao salvar reserva offline: " + msg);
        }
        return;
      }
    }

    try {
      if (isVendidoStatus(newStatus)) {
        const wasReserved = isLotReservedStatus(lot.status);
        console.log("[sales/create] client_start", { lotId: lot.id });
        const { ok, data, error } = await fetchJsonWithTimeout<{
          success?: boolean;
          saleId?: string;
          contractId?: string | null;
          customerId?: string;
          warnings?: string[];
          error?: string;
        }>(
          "/api/sales/create",
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tenantId: finalTenantId,
              projectId: finalProjectId,
              lot: {
                id: lot.id,
                block: lot.block,
                block_name: lot.block_name,
                lot_block: lot.lot_block,
                number: lot.number,
                lot_number: lot.lot_number,
                project_id: lot.project_id,
                tenant_id: lot.tenant_id,
                projects: lot.projects,
              },
              finalPrice,
              customerData,
              brokerId: finalBrokerId,
              tenantContractModel,
              financialAccountId: customerData.financial_account_id || null,
            }),
          },
          SALES_CREATE_FETCH_TIMEOUT_MS,
        );

        if (!ok || !data?.success || !data.saleId) {
          throw new Error(
            error || data?.error || "Não foi possível concluir a venda.",
          );
        }

        if (wasReserved) {
          void logLotAuditEvent(supabase, {
            ...lotAuditContextFromBlock(lot, {
              companyId: finalTenantId,
              projectId: finalProjectId,
            }),
            userId: user.id,
            action: "status_changed",
            title: "Reserva convertida em venda",
            description: buildReservationConvertedAuditDescription(),
            newData: {
              customer_id: data.customerId,
              sale_id: data.saleId,
              from_status: lot.status,
            },
            source: "sale_flow",
          });
        }

        markLocalPatchSuppress([String(lot.id)]);
        setLots((prev) =>
          prev.map((l) =>
            l.id === lot.id
              ? {
                  ...l,
                  status: "Vendido",
                  price: finalPrice,
                  customerId: data.customerId,
                  customer_id: data.customerId,
                  customerName: customerData.name || l.customerName,
                  saleId: data.saleId,
                  contractId: data.contractId || null,
                  broker_id: finalBrokerId,
                }
              : l,
          ),
        );
        setBlocksData((prev) =>
          prev.map((l) =>
            l.id === lot.id
              ? {
                  ...l,
                  status: "Vendido",
                  price: finalPrice,
                  customer_id: data.customerId,
                  sale_id: data.saleId,
                  contract_id: data.contractId || null,
                  broker_id: finalBrokerId,
                }
              : l,
          ),
        );

        void logLotAuditEvent(supabase, {
          ...lotAuditContextFromBlock(lot, {
            companyId: finalTenantId,
            projectId: finalProjectId,
            saleId: data.saleId,
            contractId: data.contractId ?? null,
          }),
          userId: user.id,
          action: "sold",
          title: "Venda concluída",
          description: `Lote vendido para ${customerData.name || "cliente"} por ${formatCurrencyBRL(Number(customerData.final_value || finalPrice) || 0)}`,
          newData: {
            customer_id: data.customerId,
            broker_id: finalBrokerId,
            sale_value: customerData.final_value || finalPrice,
          },
          source: "sale_flow",
        });

        await supabase.from("logs").insert({
          ...(user.tenant_id || lot.tenant_id
            ? { tenant_id: user.tenant_id || lot.tenant_id }
            : {}),
          user_id: user.id,
          action: newStatus,
          details: {
            title: `Lote Quadra ${lot.block} Lote ${lot.number} vendido para ${customerData.name}`,
            subtitle: `Venda concluída por ${user.name}`,
          },
        });

        const warningText =
          data.warnings?.length ? `\n\nObservações:\n${data.warnings.join("\n")}` : "";
        alert(
          `Venda concluída com sucesso! Lote Quadra ${lot.block} Lote ${lot.number} marcado como vendido.${warningText}`,
        );
        return;
      }

      const { customerId, clientId, reused } = await resolveOrCreateCustomer(supabase, {
        form: customerData,
        tenantId: finalTenantId,
        projectId: finalProjectId,
        isSuperAdmin: user.role === "SUPER_ADMIN",
        lotTenantId: lot.tenant_id,
        changedBy: user.id,
      });

      if (reused) {
        console.log("CUSTOMER_REUSED", { customerId });
      }

      const reservationSignalPaid = Number(customerData.reservation_signal_paid) || 0;
      const signalAmount =
        customerData.signal_amount != null && customerData.signal_amount !== ""
          ? parseCurrencyBRLNumber(customerData.signal_amount) || null
          : null;

      let expirationTime: string | null = null;
      let reservationAt: string | null = null;
      const reservedByUserId = user.id;
      const reservedByName =
        String(user.name || user.email || "").trim() || "usuário";
      if (newStatus === "Reservado") {
        reservationAt = new Date().toISOString();
        const d = new Date(reservationAt);
        d.setHours(d.getHours() + 48);
        expirationTime = d.toISOString();
      }

      {
        // Reservas e Disponível
        console.log("BLOCK_MARKED_RESERVED_OR_AVAILABLE");
        const reservationPatch =
          newStatus === "Reservado"
            ? {
                reservation_expires_at: expirationTime,
                reservation_date: reservationAt,
                reserved_by_user_id: reservedByUserId,
                reserved_by_name: reservedByName,
              }
            : {
                reservation_expires_at: null,
                reservation_date: null,
                reserved_by_user_id: null,
                reserved_by_name: null,
              };

        let { error: updateError } = await supabase
          .from("blocks")
          .update({
            status: newStatus,
            price: finalPrice,
            customer_id: customerId,
            broker_id: finalBrokerId,
            ...reservationPatch,
            signal_amount: signalAmount,
            signal_date: customerData.signal_date || null,
            signal_payment_method: customerData.signal_payment_method || null,
            signal_notes: customerData.signal_notes || null,
          })
          .eq("id", lot.id)
          .eq("tenant_id", finalTenantId)
          .eq("project_id", lot.project_id || finalProjectId);

        if (
          updateError &&
          /reserved_by|column/i.test(updateError.message || "")
        ) {
          const {
            reserved_by_user_id: _u,
            reserved_by_name: _n,
            ...legacyPatch
          } = reservationPatch as Record<string, unknown>;
          ({ error: updateError } = await supabase
            .from("blocks")
            .update({
              status: newStatus,
              price: finalPrice,
              customer_id: customerId,
              broker_id: finalBrokerId,
              ...legacyPatch,
              signal_amount: signalAmount,
              signal_date: customerData.signal_date || null,
              signal_payment_method: customerData.signal_payment_method || null,
              signal_notes: customerData.signal_notes || null,
            })
            .eq("id", lot.id)
            .eq("tenant_id", finalTenantId)
            .eq("project_id", lot.project_id || finalProjectId));
        }

        if (updateError) throw updateError;
        console.log("CUSTOMER_ID_LINKED_TO_BLOCK");

        if (newStatus === "Reservado") {
          markLocalPatchSuppress([String(lot.id)]);
          setLots((prev) =>
            prev.map((l) =>
              l.id === lot.id
                ? {
                    ...l,
                    status: "Reservado",
                    price: finalPrice,
                    customerId,
                    customer_id: customerId,
                    customerName: customerData.name || l.customerName,
                    broker_id: finalBrokerId,
                    reservation_date: reservationAt,
                    reservation_expires_at: expirationTime,
                    reserved_by_user_id: reservedByUserId,
                    reserved_by_name: reservedByName,
                  }
                : l,
            ),
          );
          setBlocksData((prev) =>
            prev.map((l) =>
              l.id === lot.id
                ? {
                    ...l,
                    status: "Reservado",
                    price: finalPrice,
                    customerId,
                    customer_id: customerId,
                    customerName: customerData.name || l.customerName,
                    broker_id: finalBrokerId,
                    reservation_date: reservationAt,
                    reservation_expires_at: expirationTime,
                    reserved_by_user_id: reservedByUserId,
                    reserved_by_name: reservedByName,
                  }
                : l,
            ),
          );

          void logLotAuditEvent(supabase, {
            ...lotAuditContextFromBlock(lot, {
              companyId: finalTenantId,
              projectId: finalProjectId,
            }),
            userId: user.id,
            action: "reserved",
            title: "Lote reservado",
            description: buildReservationCreatedAuditDescription({
              actorName: reservedByName,
              customerName: customerData.name || "cliente",
            }),
            newData: {
              customer_id: customerId,
              broker_id: finalBrokerId,
              reserved_by_user_id: reservedByUserId,
              reserved_by_name: reservedByName,
              expiration_time: expirationTime,
              reservation_date: reservationAt,
            },
            source: "sale_flow",
          });
        }
      }      
      try {
         if (newStatus === "Reservado") {
            await supabase.from("reservation_logs").insert({
               company_id: finalTenantId,
               tenant_id: finalTenantId,
               broker_id: finalBrokerId,
               block_id: lot.id,
               customer_id: customerId,
               expiration_time: expirationTime,
               status: 'active',
               signal_amount: signalAmount,
               signal_date: customerData.signal_date || null,
               signal_payment_method: customerData.signal_payment_method || null,
               signal_notes: customerData.signal_notes || null,
               created_by_user_id: reservedByUserId,
               created_by_name: reservedByName,
            });
         }
      } catch(e) {}

      await supabase.from("logs").insert({
        ...(user.tenant_id || lot.tenant_id
          ? { tenant_id: user.tenant_id || lot.tenant_id }
          : {}),
        user_id: user.id,
        action: newStatus,
        details: {
          title: `Lote Quadra ${lot.block} Lote ${lot.number} ${newStatus === "Vendido" ? "vendido" : "reservado"} para ${customerData.name}`,
          subtitle: `Ação comercial concluída por ${user.name}`,
        },
      });

      alert(`Lote Quadra ${lot.block} Lote ${lot.number} atualizado com sucesso!`);
    } catch (e: unknown) {
      console.error("Error saving customer and lot:", e);
      const msg =
        e instanceof Error
          ? formatClientFetchError({ apiError: e.message })
          : formatClientFetchError({});
      alert("Erro ao salvar dados (Venda interrompida): " + msg);
    }
  };

  if (!projectId) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-background)]">
        <p className="text-gray-500 font-medium">Projeto não identificado.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-background)]">
        <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={center}
        zoom={18}
        maxZoom={22}
        zoomSnap={1}
        zoomDelta={1}
        className="w-full h-full"
        zoomControl={false}
      >
        {perfToggles.baseMap ? (
          <GisBaseLayer
            layerId={normalizeGisBaseLayer(activeLayer)}
            onZoomChange={setMapZoom}
          />
        ) : null}

        <ZoomControl position="bottomright" />
        <MapZoomTracker onZoom={setMapZoom} />
        <MapController
          safeBounds={safeMapBounds}
          refreshKey={refreshKey}
          projectId={projectId}
          focusBlockName={focusBlockName}
          focusBlockKey={focusBlockKey}
          enableFitBounds={perfToggles.fitBounds}
        />
        <LocationController active={gpsActive} />

        <style>{`
          .lot-map-label-marker {
            background: transparent !important;
            border: none !important;
          }
          .lot-map-label-badge {
            border-radius: 50%;
            background: #ffffff;
            border: 1.5px solid #1f2937;
            color: #111827;
            font-weight: 700;
            opacity: 0.95;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            line-height: 1;
            box-sizing: border-box;
          }
          .lot-map-label-badge span {
            display: block;
            text-align: center;
            white-space: nowrap;
          }
        `}</style>

        <LotLabelsOverlay
          items={lotLabelItems}
          mapZoom={mapZoom}
          enabled={showPermanentLabels && !sheetPickActive}
        />

        {displayLots
          .filter((lot) => lot.bounds.length > 0)
          .map((lot) => {
            if (!perfToggles.polygons) return null;
            const color = getStatusColor(lot.status);
            const displayNum = normalizeLotDisplayNum(lot.number);
            const validation = lotGeometryValidations.get(lot.id);
            if (!validation) return null;
            const positions = validation.cleanedCoords;

            if (!validation.valid || positions.length < 3) {
              console.warn(
                "Lote ignorado por geometria insuficiente",
                lot.number,
                validation.reason,
              );
              return null;
            }

            logGeometryRender("Polygon", lot, positions.length);
            if (isDebugGisLot(lot.number)) {
              console.log("GIS_LOT_RENDER", {
                lote: lot.number,
                maxEdgeM: maxRingEdgeMeters(positions),
                polygonFillOnly: !showBoundaryLines,
                noSegmentPolyline: true,
              });
            }

            const strokeColor = sheetPickActive ? "#4999e9" : "#000000";
            const borderWeight = showBoundaryLines
              ? sheetPickActive
                ? 2
                : 1
              : 0;

            const lotHitTest =
              perfToggles.events &&
              isLotPolygonHitTestEnabled({
                mapLotPickActive,
                drawStreetActive,
                measureActive,
                areaMeasureActive,
              });

            return (
              <Fragment key={lot.id}>
                <GisSanitizeDebugMarkers lotId={lot.id} validation={validation} />
                <Polygon
                  key={`${lot.id}-hit-${lotHitTest ? 1 : 0}`}
                  positions={positions}
                  interactive={lotHitTest}
                  pathOptions={{
                    color: strokeColor,
                    fillColor: mapLotPickActive ? "#4999e9" : color,
                    fillOpacity: mapLotPickActive ? 0.35 : 0.75,
                    stroke: showBoundaryLines,
                    weight: borderWeight,
                  }}
                  eventHandlers={
                    perfToggles.events
                      ? {
                    click: () => {
                      if (gisMeasureToolActiveRef.current) return;
                      const pick = {
                        id: lot.id,
                        number: String(lot.number || ''),
                        block: String(lot.block || ''),
                      };
                      if (sheetPickActive && onLotSheetLotPick) {
                        console.log('LOT_SHEET_MAP_LOT_CLICK', pick);
                        onLotSheetLotPick(pick);
                      } else if (memorialPickActive && onMemorialLotPick) {
                        onMemorialLotPick(pick);
                      }
                    },
                    mouseover: (e) => {
                      if (mapLotPickActive || gisMeasureToolActiveRef.current) return;
                      const layer = e.target;
                      layer.setStyle({
                        fillOpacity: 1,
                        weight: showBoundaryLines ? 2 : 0,
                      });
                    },
                    mouseout: (e) => {
                      if (mapLotPickActive || gisMeasureToolActiveRef.current) return;
                      const layer = e.target;
                      layer.setStyle({
                        fillOpacity: 0.75,
                        weight: borderWeight,
                      });
                    },
                  }
                      : undefined
                  }
                >
                  <SyncPathHitTest interactive={lotHitTest} />
                  {perfToggles.popups && !mapLotPickActive && lotHitTest && (
                    <Popup
                      className={GIS_LOT_LEAFLET_POPUP_CLASS}
                      maxWidth={GIS_LOT_POPUP_MAX_WIDTH_PX}
                      minWidth={GIS_LOT_POPUP_MIN_WIDTH_PX}
                      autoPan
                      autoPanPadding={[32, 32]}
                      closeOnClick={false}
                      eventHandlers={{
                        add: (e) => {
                          const el = (e.target as L.Popup).getElement();
                          if (el) {
                            L.DomEvent.disableClickPropagation(el);
                            L.DomEvent.disableScrollPropagation(el);
                          }
                        },
                        remove: () => {
                          const editing = officialSidesEditLotRef.current;
                          if (editing?.id === lot.id) {
                            closeOfficialSidesEditor();
                          }
                        },
                      }}
                    >
                      <LotPopupContent
                        lot={lot}
                        streetGuides={streetGuides}
                        cleanedCoords={positions}
                        onAction={handleLotAction}
                        onRequestCustomerForm={(l, a, p) => openCustomerForm(l, a, p)}
                        onRequestClear={(l, p) => setClearConfirmModal({ lot: l, price: p })}
                        canEditSale={userCanEditSale}
                        userRole={user?.role}
                        canEditLotPrice={canManageGisProject(user?.role)}
                        onPriceSaved={handleLotPriceSaved}
                        onEditSale={(l) => void openEditSaleForm(l)}
                        onViewContract={handleViewContract}
                        onRegenerateContract={(l) =>
                          void handleRegenerateContractFromMap(l)
                        }
                        onViewFinance={handleViewFinance}
                        actionLoading={editSaleLoading || actionLoading}
                        frontCorrectActive={!ownerMapWriteBlocked && frontCorrectLotId === lot.id}
                        onStartCorrectFront={
                          ownerMapWriteBlocked
                            ? undefined
                            : (l) => setFrontCorrectLotId(l.id)
                        }
                        onCancelCorrectFront={
                          ownerMapWriteBlocked
                            ? undefined
                            : () => setFrontCorrectLotId(null)
                        }
                        onPickFrontSegment={
                          ownerMapWriteBlocked ? undefined : handlePickFrontSegment
                        }
                        frontCorrectSaving={frontCorrectSaving}
                        confrontationAudit={
                          confrontationAudits.get(lot.id) ?? null
                        }
                        onEditConfrontationSide={
                          ownerMapWriteBlocked
                            ? undefined
                            : (l, side) => openConfrontationEditor(l, side)
                        }
                        onEditConfrontationSegment={
                          ownerMapWriteBlocked
                            ? undefined
                            : (l, side, segmentIndexes) =>
                                openConfrontationEditor(l, side, segmentIndexes)
                        }
                        allBlocksForConfront={blocksForConfront}
                        onGenerateMemorial={
                          ownerMapWriteBlocked || !onGenerateMemorialFromPopup
                            ? undefined
                            : (l) => onGenerateMemorialFromPopup(l)
                        }
                        onGenerateLotSheet={
                          ownerMapWriteBlocked || !onGenerateLotSheetFromPopup
                            ? undefined
                            : (l) => onGenerateLotSheetFromPopup(l)
                        }
                        onEditOfficialSides={
                          ownerMapWriteBlocked ||
                          !canEditOfficialSides(user?.role)
                            ? undefined
                            : openOfficialSidesEditor
                        }
                        embedOfficialSidesEditor={
                          isWideDesktop && officialSidesEditLot?.id === lot.id
                        }
                        officialSidesSelected={
                          officialSidesEditLot?.id === lot.id
                            ? officialSidesSelected
                            : []
                        }
                        onOfficialSidesEditorSlot={
                          officialSidesEditLot?.id === lot.id
                            ? setOfficialSidesEditorSlot
                            : undefined
                        }
                        officialSidesSaving={officialSidesSaving}
                        onPersistOfficialSides={
                          ownerMapWriteBlocked ||
                          !canEditOfficialSides(user?.role)
                            ? undefined
                            : (patched, draft, confrontantDraft) =>
                                persistOfficialSidesForLot(
                                  lot,
                                  patched,
                                  draft,
                                  confrontantDraft,
                                )
                        }
                      />
                    </Popup>
                  )}
                </Polygon>
                {showDetailedEdges ? (
                <LotBoundaryEdgePolylinesMemo
                  positions={positions}
                  lot={lot}
                  strokeColor={strokeColor}
                  suspendLotHitTest={!lotHitTest}
                  boundaryEnabled={showBoundaryLines}
                  frontCorrectActive={frontCorrectLotId === lot.id}
                  onEdgePick={
                    frontCorrectLotId === lot.id
                      ? (edgeIndex) =>
                          void handlePickFrontSegment(lot, edgeIndex)
                      : undefined
                  }
                  assistedConfrontationActive={
                    assistedConfrontationMode &&
                    frontCorrectLotId !== lot.id &&
                    officialSidesEditLot?.id !== lot.id
                  }
                  onConfrontEdgePick={
                    assistedConfrontationMode &&
                    frontCorrectLotId !== lot.id &&
                    officialSidesEditLot?.id !== lot.id
                      ? (edgeIndex) => handleConfrontEdgePick(lot, edgeIndex)
                      : undefined
                  }
                  segmentEdgeByIndex={
                    assistedConfrontationMode
                      ? new Map(
                          (
                            confrontationAudits.get(lot.id)?.segmentEdges ??
                            []
                          ).map((e) => [
                            e.ringEdgeIndex,
                            {
                              status: e.status,
                              confrontant: e.confrontant,
                            },
                          ]),
                        )
                      : undefined
                  }
                  officialSidesEditActive={
                    officialSidesEditLot?.id === lot.id
                  }
                  officialSideByIndex={
                    officialSidesEditLot?.id === lot.id
                      ? officialSidesDraft
                      : undefined
                  }
                  officialSidesSelected={
                    officialSidesEditLot?.id === lot.id
                      ? officialSidesSelected
                      : undefined
                  }
                  onOfficialSideEdgePick={
                    officialSidesEditLot?.id === lot.id
                      ? (edgeIndex, additive) => {
                          setOfficialSidesSelected((prev) => {
                            if (additive) {
                              return prev.includes(edgeIndex)
                                ? prev.filter((x) => x !== edgeIndex)
                                : [...prev, edgeIndex].sort((a, b) => a - b);
                            }
                            return prev.length === 1 && prev[0] === edgeIndex
                              ? []
                              : [edgeIndex];
                          });
                        }
                      : undefined
                  }
                />
                ) : null}
              </Fragment>
            );
          })}

        {SHOW_AUXILIARY_LINES &&
          blocksData.map((block) => {
            const displayNum = normalizeLotDisplayNum(block.number);
            const validation = validateLotGeometry(
              block,
              blockBoundingBoxes.get(normalizeBlockKey(block.block)) ?? null,
            );
            const positions = validation.cleanedCoords;

            if (!validation.valid || positions.length < 3) {
              console.warn(
                "Lote ignorado por geometria insuficiente",
                block.number,
                validation.reason,
              );
              return null;
            }

            return (
              <Polygon
                key={`block-${block.id}-hit-${!(drawStreetActive || gisMeasureToolActive) ? 1 : 0}`}
                positions={positions}
                interactive={!(drawStreetActive || gisMeasureToolActive)}
                pathOptions={{
                  color: "#000000",
                  fillColor: getStatusColor(block.status),
                  fillOpacity: 0.75,
                  stroke: SHOW_BOUNDARY_LINES,
                  weight: SHOW_BOUNDARY_LINES ? 1 : 0,
                }}
                eventHandlers={{
                  mouseover: (e) => {
                    if (gisMeasureToolActiveRef.current) return;
                    const layer = e.target;
                    layer.setStyle({
                      fillOpacity: 1,
                      weight: SHOW_BOUNDARY_LINES ? 2 : 0,
                    });
                  },
                  mouseout: (e) => {
                    if (gisMeasureToolActiveRef.current) return;
                    const layer = e.target;
                    layer.setStyle({
                      fillOpacity: 0.75,
                      weight: SHOW_BOUNDARY_LINES ? 1 : 0,
                    });
                  },
                }}
              >
                <SyncPathHitTest
                  interactive={!(drawStreetActive || gisMeasureToolActive)}
                />
                {!(drawStreetActive || gisMeasureToolActive) && (
                <Popup
                  className={GIS_LOT_LEAFLET_POPUP_CLASS}
                  maxWidth={GIS_LOT_POPUP_MAX_WIDTH_PX}
                  minWidth={GIS_LOT_POPUP_MIN_WIDTH_PX}
                  autoPan
                  autoPanPadding={[32, 32]}
                >
                  <LotPopupContent
                    lot={block}
                    streetGuides={streetGuides}
                    cleanedCoords={positions}
                    onAction={handleLotAction}
                    onRequestCustomerForm={(l, a, p) =>
                      openCustomerForm(l, a, p)
                    }
                    onRequestClear={(l, p) =>
                      setClearConfirmModal({ lot: l, price: p })
                    }
                    canEditSale={userCanEditSale}
                    userRole={user?.role}
                    canEditLotPrice={canManageGisProject(user?.role)}
                    onPriceSaved={handleLotPriceSaved}
                    onEditSale={(l) => void openEditSaleForm(l)}
                    onViewContract={handleViewContract}
                    onRegenerateContract={(l) =>
                      void handleRegenerateContractFromMap(l)
                    }
                    onViewFinance={handleViewFinance}
                    actionLoading={editSaleLoading || actionLoading}
                  />
                </Popup>
                )}
              </Polygon>
            );
          })}

        {SHOW_STREET_GUIDE_LINES &&
          streetGuidesVisible &&
          (Array.isArray(streetGuides) ? streetGuides : []).map((guide) => {
            const geo = guide.geometry_geojson || guide.geometry;
            const line = flattenLineStringCoordinates(geo?.coordinates);
            if (!line) return null;
            const pts = line.map((c: number[]) => [c[1], c[0]]);
            const label = resolveOfficialStreetLabel(
              guide as Record<string, unknown>,
            );
            const widthLabel =
              guide.width != null && guide.width !== ''
                ? `${Number(guide.width).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m`
                : null;
            return (
              <Polyline
                key={`guide-${guide.id}-hit-${gisMeasureToolActive ? 0 : 1}`}
                positions={pts}
                interactive={!gisMeasureToolActive}
                pathOptions={{
                  color: guide.active === false ? "#9ca3af" : "#10b981",
                  weight: 4,
                  dashArray: guide.active === false ? "4, 6" : "10, 10",
                }}
                eventHandlers={
                  gisMeasureToolActive
                    ? undefined
                    : onEditStreetGuide
                    ? {
                        click: () => onEditStreetGuide(guide),
                      }
                    : undefined
                }
              >
                <SyncPathHitTest interactive={!gisMeasureToolActive} />
                <Tooltip permanent direction="center" className="street-guide-label">
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#047857",
                      textShadow: "0 0 2px white, 0 0 4px white",
                    }}
                  >
                    {label}
                  </span>
                </Tooltip>
                {!gisMeasureToolActive && (
                <Popup>
                  <div className="p-2 space-y-2 font-sans min-w-[200px]">
                    <p className="text-gray-900 font-bold text-sm">Logradouro</p>
                    <p className="text-xs text-gray-600">
                      <strong>Tipo:</strong> {guide.type || "Rua"}
                    </p>
                    <p className="text-sm text-gray-800 font-semibold">{label}</p>
                    {guide.code && (
                      <p className="text-xs text-gray-600">
                        <strong>Código:</strong> {guide.code}
                      </p>
                    )}
                    {widthLabel && (
                      <p className="text-xs text-gray-600">
                        <strong>Largura:</strong> {widthLabel}
                      </p>
                    )}
                    {guide.notes && (
                      <p className="text-xs text-gray-500 italic">{guide.notes}</p>
                    )}
                    <div className="flex flex-col gap-1 pt-1">
                      {onEditStreetGuide && (
                        <button
                          type="button"
                          onClick={() => onEditStreetGuide(guide)}
                          className="w-full p-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded text-xs font-semibold"
                        >
                          Editar
                        </button>
                      )}
                      {onDeleteStreetGuide && (
                        <button
                          type="button"
                          onClick={() => onDeleteStreetGuide(guide.id)}
                          className="w-full flex items-center justify-center gap-2 p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded text-xs"
                        >
                          <Trash2 className="w-4 h-4" /> Apagar
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
                )}
              </Polyline>
            );
          })}

        <GisMeasureExclusiveController active={gisMeasureToolActive} />

        <AreaMeasureMapContent
          active={areaMeasureActive}
          measure={areaMeasure}
        />

        <DistanceMeasureMapContent
          active={measureActive}
          measure={distanceMeasure}
        />

        <DrawStreetInteraction
          active={drawStreetActive}
          points={drawStreetPoints}
          setPoints={setDrawStreetPoints}
        />
      </MapContainer>

      {/* Painel — Linha de Rua (polilinha) */}
      {drawStreetActive && (
        <div className="absolute top-16 md:top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-auto bg-emerald-600/95 backdrop-blur-sm border border-emerald-500 rounded-xl px-4 py-3 shadow-lg flex flex-col gap-2 fade-in-up w-auto min-w-[240px] max-w-[min(92vw,420px)]">
          <span className="text-[11px] md:text-sm font-bold text-white tracking-wide text-center">
            {drawStreetPoints.length === 0
              ? "Clique no mapa para adicionar vértices da rua"
              : `${drawStreetPoints.length} ponto${drawStreetPoints.length === 1 ? "" : "s"} — clique para continuar`}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={drawStreetPoints.length < 2}
              onClick={() => {
                if (drawStreetPoints.length < 2) return;
                if (onStreetLineDrawn) onStreetLineDrawn([...drawStreetPoints]);
                setDrawStreetPoints([]);
              }}
              className="px-3 py-1.5 rounded-lg text-[11px] md:text-xs font-bold bg-white text-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-50 transition-colors"
            >
              Finalizar Rua
            </button>
            <button
              type="button"
              disabled={drawStreetPoints.length < 1}
              onClick={() => setDrawStreetPoints((prev) => prev.slice(0, -1))}
              className="px-3 py-1.5 rounded-lg text-[11px] md:text-xs font-semibold bg-emerald-800/60 text-white border border-emerald-400/50 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-800 transition-colors"
            >
              Desfazer último ponto
            </button>
            <button
              type="button"
              onClick={() => {
                setDrawStreetPoints([]);
                onDrawStreetCancel?.();
              }}
              className="px-3 py-1.5 rounded-lg text-[11px] md:text-xs font-semibold bg-transparent text-white border border-white/40 hover:bg-white/10 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {frontCorrectLotId && (
        <div className="absolute top-16 md:top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-none px-4 max-w-md w-full">
          <p className="text-xs font-semibold text-amber-100 bg-[#11141a]/95 border border-amber-500/50 rounded-lg px-3 py-2 shadow-lg text-center">
            Corrigir frente: clique no lado do lote no mapa (arestas em destaque) ou
            escolha o segmento no popup do lote.
          </p>
        </div>
      )}
      {!frontCorrectLotId && frontCorrectSaving && (
        <div className="absolute top-16 md:top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-none px-4 max-w-md w-full">
          <p className="text-xs font-semibold text-sky-100 bg-[#11141a]/95 border border-sky-500/50 rounded-lg px-3 py-2 shadow-lg text-center">
            Salvando frente… pan e zoom liberados.
          </p>
        </div>
      )}

      {assistedConfrontationMode && (
        <div className="absolute bottom-4 left-4 z-[500] pointer-events-none max-w-xs">
          <div className="bg-[#11141a]/95 border border-[var(--color-border)] rounded-lg px-3 py-2 text-[10px] text-gray-200 space-y-1 shadow-lg">
            <p className="font-bold text-white">Confrontação assistida</p>
            <p>
              <span className="inline-block w-2 h-2 rounded-full bg-[#22c55e] mr-1" />
              Verde = automático
            </p>
            <p>
              <span className="inline-block w-2 h-2 rounded-full bg-[#eab308] mr-1" />
              Amarelo = A DEFINIR (clique no lado)
            </p>
            <p>
              <span className="inline-block w-2 h-2 rounded-full bg-[#3b82f6] mr-1" />
              Azul = manual confirmado
            </p>
            <p>
              <span className="inline-block w-2 h-2 rounded-full bg-[#ef4444] mr-1" />
              Vermelho = baixa confiança
            </p>
          </div>
        </div>
      )}

      {!ownerMapWriteBlocked && confrontEdit && projectId && (
        <InformConfrontantModal
          projectId={projectId}
          blockId={confrontEdit.lot.id}
          block={{
            ...confrontEdit.lot,
            block_name: confrontEdit.lot.block,
            segments_json: confrontEdit.lot.segments_json,
          }}
          allBlocks={blocksForConfront}
          side={confrontEdit.side}
          segmentIndexes={confrontEdit.segmentIndexes}
          currentConfrontant={confrontEdit.currentConfrontant}
          currentSource={confrontEdit.currentSource}
          onClose={() => setConfrontEdit(null)}
          onConfirm={handleConfirmConfrontant}
          onClear={handleClearManualConfrontant}
        />
      )}

      {!ownerMapWriteBlocked &&
        officialSidesEditLot &&
        canEditOfficialSides(user?.role) &&
        !isWideDesktop && (
          <LotOfficialSidesEditor
            key={String(officialSidesEditLot.id)}
            lot={{
              ...officialSidesEditLot,
              block_name:
                officialSidesEditLot.block_name ?? officialSidesEditLot.block,
            }}
            variant={"overlay"}
            portalTarget={null}
            saving={officialSidesSaving}
            selected={officialSidesSelected}
            onSelectedChange={setOfficialSidesSelected}
            onDraftChange={setOfficialSidesDraft}
            onClose={closeOfficialSidesEditor}
            onSave={async (patched, draft, confrontantDraft) => {
              if (!officialSidesEditLot?.id) return;
              try {
                await persistOfficialSidesForLot(
                  officialSidesEditLot,
                  patched,
                  draft,
                  confrontantDraft,
                );
                closeOfficialSidesEditor();
              } catch (e: unknown) {
                alert(
                  e instanceof Error
                    ? e.message
                    : "Erro ao salvar classificacao de lados",
                );
              }
            }}
            onRestoreAutomatic={async (sessionBaseline) => {
              if (!projectId || !officialSidesEditLot?.id) return;
              if (
                !confirm(
                  "Restaurar official_side automático e confrontantes do início desta sessão?",
                )
              ) {
                return;
              }
              setOfficialSidesSaving(true);
              try {
                const snapshot = snapshotSegmentsJson(officialSidesEditLot);
                const restored = restoreAutomaticOfficialSides(
                  {
                    ...officialSidesEditLot,
                    block_name:
                      officialSidesEditLot.block_name ??
                      officialSidesEditLot.block,
                  },
                  sessionBaseline,
                );
                const rows = restored.segments_json as Record<
                  string,
                  unknown
                >[];
                await persistBlockSegmentsJson(
                  supabase,
                  String(officialSidesEditLot.id),
                  rows,
                );
                markLocalPatchSuppress([String(officialSidesEditLot.id)]);
                setLots((prev) =>
                  prev.map((l) =>
                    l.id === officialSidesEditLot.id
                      ? { ...l, segments_json: rows }
                      : l,
                  ),
                );
                void logLotAuditEvent(supabase, {
                  ...lotAuditContextFromBlock(officialSidesEditLot, {
                    projectId,
                  }),
                  userId: user?.id ?? null,
                  action: "official_measure_side_changed",
                  title: "Classificação oficial restaurada (automática)",
                  description: `official_side removido e confrontantes da sessão restaurados no lote ${String(officialSidesEditLot.number ?? "")}`,
                  oldData: { segments_json: snapshot },
                  newData: {
                    restored_automatic: true,
                    session_baseline_restored: Boolean(sessionBaseline),
                  },
                  source: "gis_map",
                });
                setOfficialSidesEditLot({
                  ...officialSidesEditLot,
                  segments_json: rows,
                });
                setOfficialSidesDraft(new Map());
                setOfficialSidesSelected([]);
              } catch (e: unknown) {
                alert(
                  e instanceof Error
                    ? e.message
                    : "Erro ao restaurar classificação automática",
                );
              } finally {
                setOfficialSidesSaving(false);
              }
            }}
          />
        )}

      <AreaMeasureOverlay
        active={areaMeasureActive}
        measure={areaMeasure}
        exportMeta={areaMeasureExportMeta}
      />

      <DistanceMeasureOverlay
        active={measureActive}
        measure={distanceMeasure}
      />

      {customerForm && user && (
        <CustomerLotFormModal
          lot={customerForm.lot}
          actionName={customerForm.action}
          price={customerForm.price}
          tenantId={user.tenant_id || null}
          isSuperAdmin={user.role === "SUPER_ADMIN"}
          userRole={user.role}
          prefillFromReservation={customerForm.prefillFromReservation}
          mode={customerForm.mode}
          initialFormData={customerForm.editContext?.form}
          saleId={
            customerForm.editContext?.saleId ||
            customerForm.lot.saleId ||
            null
          }
          brokers={brokersList}
          contractModel={tenantContractModel}
          onClose={() => setCustomerForm(null)}
          onCustomerValidationFailed={setCustomerContractValidation}
          onConfirm={async (data) => {
            if (customerForm.mode === "edit" && customerForm.editContext) {
              const ctx = customerForm.editContext;
              if (!user.tenant_id) {
                alert("Empresa não identificada.");
                return;
              }
              try {
                await updateSaleFromEdit(supabase, {
                  lot: {
                    id: customerForm.lot.id,
                    project_id: customerForm.lot.project_id,
                    price: customerForm.price,
                    saleId: ctx.saleId,
                    contractId: ctx.contractId,
                  },
                  tenantId: user.tenant_id,
                  userId: user.id,
                  data,
                  saleBefore: ctx.saleBefore,
                  customerBefore: ctx.customerBefore,
                  customerId: ctx.customerId,
                });
                const { data: refreshedBlock } = await supabase
                  .from("blocks")
                  .select("*, customers(name)")
                  .eq("id", customerForm.lot.id)
                  .maybeSingle();
                if (refreshedBlock) {
                  markLocalPatchSuppress([String(refreshedBlock.id)]);
                  setLots((prev) =>
                    prev.map((l) =>
                      l.id === refreshedBlock.id
                        ? {
                            ...l,
                            customerName:
                              refreshedBlock.customers?.name || l.customerName,
                            customerId: refreshedBlock.customer_id,
                            price: Number(refreshedBlock.price) || l.price,
                            saleId: refreshedBlock.sale_id,
                            contractId: refreshedBlock.contract_id,
                          }
                        : l,
                    ),
                  );
                }
                setCustomerForm(null);
                const regen =
                  ctx.contractId &&
                  confirm(
                    "Venda atualizada com sucesso.\n\nRegere o contrato para refletir as alterações?\n\n(O contrato anterior permanece no histórico.)",
                  );
                if (regen && ctx.contractId) {
                  await handleRegenerateContractFromMap({
                    ...customerForm.lot,
                    contractId: ctx.contractId,
                  });
                } else {
                  alert(
                    "Venda atualizada. Regere o contrato em Contratos ou pelo botão Regenerar no mapa.",
                  );
                }
              } catch (e: unknown) {
                alert(
                  e instanceof Error ? e.message : "Erro ao salvar alterações",
                );
                throw e;
              }
              return;
            }
            if (customerForm.prefillFromReservation) {
              console.log("RESERVATION_TO_SALE_PREFILL", {
                customerId: data.selected_customer_id,
                lotId: customerForm.lot.id,
              });
            }
            await handleSaveCustomerAndLot(
              customerForm.lot,
              customerForm.action,
              customerForm.price,
              data,
            );
            setCustomerForm(null);
          }}
        />
      )}

      <CustomerContractValidationModal
        open={Boolean(customerContractValidation)}
        validation={customerContractValidation}
        onClose={() => setCustomerContractValidation(null)}
      />

      {clearConfirmModal && (
        <ReleaseLotConfirmModal
          lot={clearConfirmModal.lot}
          price={clearConfirmModal.price}
          userEmail={user?.email}
          userRole={user?.role}
          onClose={() => setClearConfirmModal(null)}
          onSuccess={(result) => {
            const lot = clearConfirmModal.lot;
            startTransition(() => {
              setLots((prev) =>
                prev.map((l) =>
                  l.id === lot.id
                    ? {
                        ...l,
                        status: "Disponível",
                        customer_id: null,
                        customerId: null,
                        customerName: null,
                        sale_id: null,
                        saleId: null,
                        contract_id: null,
                        contractId: null,
                        broker_id: null,
                        reservation_date: null,
                        reservation_expires_at: null,
                        reserved_by_user_id: null,
                        reserved_by_name: null,
                      }
                    : l,
                ),
              );
              setBlocksData((prev) =>
                prev.map((l) =>
                  l.id === lot.id
                    ? {
                        ...l,
                        status: "Disponível",
                        customer_id: null,
                        customerId: null,
                        customerName: null,
                        sale_id: null,
                        saleId: null,
                        contract_id: null,
                        contractId: null,
                        broker_id: null,
                        reservation_date: null,
                        reservation_expires_at: null,
                        reserved_by_user_id: null,
                        reserved_by_name: null,
                      }
                    : l,
                ),
              );
            });
            setClearConfirmModal(null);
            onEnterpriseValueRefresh?.();
            alert(result.message);
          }}
        />
      )}

    </div>
  );
}
