"use client";

import { Fragment, useEffect, useMemo, useState, useRef } from "react";
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
import { useAuth } from "@/hooks/useAuth";
import { isOwnerRole, canManageGisProject } from "@/lib/rolePermissions";
import { blockOwnerWriteOnClient } from "@/lib/ownerWriteGuard";
import {
  getNextContractNumber,
  isValidStoredContractNumber,
} from "@/lib/contractNumber";
import { generateContractHTML } from "@/lib/contractTemplate";
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
  formatCurrencyBRL as formatBRL,
  formatLotAuditDescription,
  parseCurrencyBRL,
  parseCurrencyBRLNumber,
} from "@/lib/currencyBrl";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import {
  GIS_LOT_POPUP_ACTION_BTN_CLASS,
  GIS_LOT_POPUP_CONTAINER_CLASS,
  GIS_LOT_POPUP_PRICE_INPUT_CLASS,
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
  officialSideDisplayLabel,
  readManualOfficialSideMap,
  type OfficialSideKind,
} from "@/lib/officialLotMeasurements";
import {
  officialSideAuditDescription,
  persistOfficialSideForSegment,
  readOfficialSideFromSegmentRow,
} from "@/lib/officialSidePersist";
import { DefineOfficialSideModal } from "@/components/map/DefineOfficialSideModal";
import {
  calculateLotDimensions,
  classifyLotSidesFromSegments,
  detectFront,
  extractSegments,
  mergeCurvedSegments,
  type Segment,
} from "@/utils/calculateLotDimensions";
import { formatStreetDisplay } from "@/lib/streetGuide";
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
import { saveMapProjectCache, getMapProjectCache } from "@/lib/offline/store";
import { loadOfflineMapGeometries } from "@/lib/offline/projectsOfflineCache";
import {
  isBrowserOnline,
  blockOfflineSale,
  queueOfflineReservation,
} from "@/lib/offline/lotReservationOffline";
import { runLotGeometryDiagnosticReport } from "@/lib/lotGeometryDiagnostic";

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

function LotBoundaryEdgePolylines({
  positions,
  lot,
  strokeColor,
  frontCorrectActive,
  onEdgePick,
  officialSidePickActive,
  onOfficialSideEdgePick,
  officialSideLabelByEdge,
  assistedConfrontationActive,
  onConfrontEdgePick,
  segmentEdgeByIndex,
}: {
  positions: LatLngPair[];
  lot: { id?: string; number?: string; geometryType?: string };
  strokeColor: string;
  frontCorrectActive?: boolean;
  onEdgePick?: (segmentIndex: number) => void;
  officialSidePickActive?: boolean;
  onOfficialSideEdgePick?: (segmentIndex: number) => void;
  officialSideLabelByEdge?: Map<number, string>;
  assistedConfrontationActive?: boolean;
  onConfrontEdgePick?: (segmentIndex: number) => void;
  segmentEdgeByIndex?: Map<
    number,
    {
      status: 'resolved' | 'pending' | 'manual' | 'conflict';
      confrontant?: string | null;
    }
  >;
}) {
  const hasOfficialSideLabels = (officialSideLabelByEdge?.size ?? 0) > 0;
  const showEdges =
    SHOW_BOUNDARY_LINES ||
    frontCorrectActive ||
    officialSidePickActive ||
    assistedConfrontationActive ||
    hasOfficialSideLabels;
  if (!showEdges || positions.length < 2) return null;

  const lines: React.ReactNode[] = [];
  const isRing = positions.length >= 3;
  const edgeCount = isRing ? positions.length : positions.length - 1;

  for (let i = 0; i < edgeCount; i++) {
    const a = positions[i];
    const b = positions[isRing ? (i + 1) % positions.length : i + 1];
    const seg: LatLngPair[] = [a, b];
    logGeometryRender("Polyline", { ...lot, geometryType: "boundary-edge" }, seg.length);
    const edgeMeta = segmentEdgeByIndex?.get(i);
    const pickOfficialSide = Boolean(
      officialSidePickActive && onOfficialSideEdgePick,
    );
    const pickConfront = Boolean(
      assistedConfrontationActive && onConfrontEdgePick && !pickOfficialSide,
    );
    const pickFront = Boolean(frontCorrectActive && onEdgePick && !pickOfficialSide);
    const color = pickOfficialSide
      ? "#a78bfa"
      : pickConfront
        ? edgeColorForConfrontStatus(edgeMeta?.status)
        : frontCorrectActive
          ? "#f59e0b"
          : strokeColor;
    const tooltipParts: string[] = [];
    const officialLabel = officialSideLabelByEdge?.get(i);
    if (officialLabel) {
      tooltipParts.push(`Lado oficial: ${officialLabel}`);
    }
    if (edgeMeta?.status === 'manual' && edgeMeta.confrontant) {
      tooltipParts.push(`Confrontação manual: ${edgeMeta.confrontant}`);
    } else if (edgeMeta?.status === 'pending') {
      tooltipParts.push('Confrontação pendente (A DEFINIR)');
    } else if (edgeMeta?.confrontant) {
      tooltipParts.push(edgeMeta.confrontant);
    }
    const tooltipText =
      tooltipParts.length > 0 ? tooltipParts.join(" · ") : undefined;
    const showOfficialTooltip = Boolean(officialLabel);
    lines.push(
      <Polyline
        key={`${lot.id ?? lot.number}-edge-${i}`}
        positions={seg}
        interactive={
          pickOfficialSide ||
          pickConfront ||
          pickFront ||
          showOfficialTooltip
        }
        pathOptions={{
          color,
          weight: pickOfficialSide || pickConfront || frontCorrectActive ? 5 : 1,
          opacity:
            pickOfficialSide || pickConfront || frontCorrectActive ? 1 : 0.9,
        }}
        eventHandlers={
          pickOfficialSide
            ? {
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onOfficialSideEdgePick!(i);
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
        {tooltipText ? (
          <Tooltip sticky direction="top">
            {tooltipText}
          </Tooltip>
        ) : null}
      </Polyline>,
    );
  }

  return <>{lines}</>;
}

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
}: {
  safeBounds: LatLngPair[];
  refreshKey?: number;
  projectId?: string;
  focusBlockName?: string | null;
  focusBlockKey?: number;
}) {
  const map = useMap();
  const lastFitBoundsKey = useRef<{
    projectId?: string;
    refreshKey?: number;
    focusBlockName?: string | null;
    focusBlockKey?: number;
  }>({});

  useEffect(() => {
    if (safeBounds.length === 0) return;

    const needFitBounds =
      lastFitBoundsKey.current.projectId !== projectId ||
      lastFitBoundsKey.current.refreshKey !== refreshKey ||
      lastFitBoundsKey.current.focusBlockName !== focusBlockName ||
      lastFitBoundsKey.current.focusBlockKey !== focusBlockKey;

    if (!needFitBounds) return;

    map.fitBounds(L.latLngBounds(safeBounds), {
      padding: [50, 50],
      maxZoom: 20,
    });
    lastFitBoundsKey.current = {
      projectId,
      refreshKey,
      focusBlockName,
      focusBlockKey,
    };
  }, [safeBounds, map, refreshKey, projectId, focusBlockName, focusBlockKey]);
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
  assistedConfrontationMode,
  onEditConfrontationSide,
  onEditConfrontationSegment,
  allBlocksForConfront = [],
  onGenerateMemorial,
  defineOfficialSideActive,
  onStartDefineOfficialSide,
  onCancelDefineOfficialSide,
  onPickOfficialSideSegment,
  onEditOfficialSideSegment,
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
  confrontationAudit?: LotConfrontationAudit | null;
  assistedConfrontationMode?: boolean;
  onEditConfrontationSide?: (lot: any, side: SideRole) => void;
  onEditConfrontationSegment?: (
    lot: any,
    side: SideRole,
    segmentIndexes: number[],
  ) => void;
  allBlocksForConfront?: Record<string, unknown>[];
  onGenerateMemorial?: (lot: any) => void;
  defineOfficialSideActive?: boolean;
  onStartDefineOfficialSide?: (lot: any) => void;
  onCancelDefineOfficialSide?: () => void;
  onPickOfficialSideSegment?: (lot: any, segmentIndex: number) => void;
  onEditOfficialSideSegment?: (lot: any, segmentIndex: number) => void;
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
  const [auditHistory, setAuditHistory] = useState<FormattedLotAuditEvent[]>(
    [],
  );
  const [auditHistoryLoading, setAuditHistoryLoading] = useState(false);
  const [auditUserNames, setAuditUserNames] = useState<Record<string, string>>(
    {},
  );

  const quadraLabel = String(lot.block ?? lot.block_name ?? "").trim();
  const formattedPrice =
    currentPrice != null ? formatBRL(currentPrice) : "—";

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
    return buildOfficialLotConfrontationSegmentRows(
      blockForSide,
      confrontationAudit,
      allBlocksForConfront,
      {
        frenteConfrontLabel,
        frontStreetLabel,
      },
    );
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
    <div className={GIS_LOT_POPUP_CONTAINER_CLASS}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-sm text-gray-900 leading-tight">
            Lote {displayNum}
            {quadraLabel ? (
              <span className="text-gray-500 font-semibold">
                {" "}
                / QD {quadraLabel}
              </span>
            ) : null}
          </h3>
          {lot.customerName && lot.status !== "Disponível" && (
            <p className="text-[10px] text-gray-600 truncate mt-0.5">
              {lot.customerName}
            </p>
          )}
        </div>
        <span
          className="shrink-0 text-white text-[10px] font-bold px-2 py-0.5 rounded"
          style={{ backgroundColor: color }}
        >
          {getStatusLabel(lot.status)}
        </span>
      </div>

      <div className="flex border-b border-gray-200 mb-2 -mx-0.5">
        {popupTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPopupTab(tab.id)}
            className={`flex-1 px-1 py-1.5 text-[10px] font-bold border-b-2 transition-colors ${
              popupTab === tab.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {popupTab === "resumo" && (
        <div className="space-y-1.5 text-[11px] md:text-xs">
          <div className="flex justify-between items-center py-0.5">
            <span className="text-gray-500">Área</span>
            <span className="font-medium text-gray-900">
              {area.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              m²
            </span>
          </div>
          <div className="py-0.5 space-y-0.5">
            <div className="flex justify-between items-center gap-2">
              <span className="text-gray-500 font-semibold">Medidas:</span>
              {userRole !== "BROKER" && !ownerReadOnly &&
                onStartDefineOfficialSide &&
                Array.isArray(lot.segments_json) &&
                lot.segments_json.length >= 3 && (
                  <button
                    type="button"
                    onClick={() => onStartDefineOfficialSide(lot)}
                    className="text-[9px] font-bold text-violet-700 hover:text-violet-900 hover:underline shrink-0"
                  >
                    Editar medidas
                  </button>
                )}
            </div>
            {defineOfficialSideActive && onPickOfficialSideSegment && (
              <div className="rounded border border-violet-200 bg-violet-50/80 px-2 py-1.5 space-y-1">
                <p className="text-[10px] font-semibold text-violet-900 leading-snug">
                  Clique no segmento no mapa ou escolha abaixo:
                </p>
                <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                  {txtSegments.map((seg) => (
                    <button
                      key={`meas-${seg.segment_index}`}
                      type="button"
                      onClick={() =>
                        onPickOfficialSideSegment(lot, seg.segment_index)
                      }
                      className="text-left px-2 py-1 rounded border border-violet-200 bg-white hover:bg-violet-50 text-[10px] font-medium text-gray-900"
                    >
                      Seg. {seg.segment_index + 1} —{" "}
                      {seg.distanceLabel ?? `${seg.distance.toFixed(2)} m`}
                    </button>
                  ))}
                </div>
                {onCancelDefineOfficialSide && (
                  <button
                    type="button"
                    onClick={onCancelDefineOfficialSide}
                    className="w-full text-[10px] font-semibold text-gray-600 hover:text-gray-900 py-0.5"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
            {(
              [
                ["Frente", officialMeasures.frente],
                ["Fundo", officialMeasures.fundo],
                ["Lado Dir.", officialMeasures.ladoDireito],
                ["Lado Esq.", officialMeasures.ladoEsquerdo],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between items-center gap-2 leading-tight"
              >
                <span className="text-gray-500 shrink-0">{label}:</span>
                <span className="font-medium text-gray-900 text-right">
                  {value != null && Number.isFinite(value)
                    ? `${value.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} m`
                    : "—"}
                </span>
              </div>
            ))}
          </div>
          {frontStreetLabel && (
            <div className="flex justify-between items-start gap-2 py-0.5 px-1.5 -mx-0.5 rounded bg-emerald-50/80">
              <span className="text-gray-600 shrink-0">Frente para</span>
              <span className="text-emerald-800 font-semibold text-right leading-tight">
                {frontStreetLabel}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center py-0.5">
            <span className="text-gray-500">Valor</span>
            <span className="font-semibold text-gray-900 text-sm md:text-base">
              {formattedPrice}
            </span>
          </div>
          {isSold && lot.customerName && (
            <div className="flex justify-between items-center py-0.5">
              <span className="text-gray-500">Cliente</span>
              <span className="font-medium text-gray-900 text-right truncate max-w-[160px]">
                {lot.customerName}
              </span>
            </div>
          )}

          {userRole !== "BROKER" && !ownerReadOnly &&
            Array.isArray(lot.segments_json) &&
            lot.segments_json.length >= 3 &&
            onStartCorrectFront && (
              <div className="pt-1.5 border-t border-gray-100">
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
                  <button
                    type="button"
                    onClick={() => onStartCorrectFront(lot)}
                    className="w-full py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-[10px] font-bold text-amber-900"
                  >
                    Corrigir frente do lote
                  </button>
                )}
              </div>
            )}

          {userRole !== "BROKER" &&
            !ownerReadOnly &&
            onGenerateMemorial &&
            Array.isArray(lot.segments_json) &&
            lot.segments_json.length >= 2 && (
              <button
                type="button"
                onClick={() => onGenerateMemorial(lot)}
                className="w-full py-1.5 rounded-lg border border-amber-400 bg-amber-50 hover:bg-amber-100 text-[10px] font-bold text-amber-900"
              >
                Gerar Memorial
              </button>
            )}
        </div>
      )}

      {popupTab === "confrontacoes" && (
        <div className="space-y-1 text-[11px]">
          {confrontationAudit ? (
            confrontationSegmentRows.map(
              ({ key, sideLabel, segmentIndex, text, origin }) => (
                <div
                  key={`${key}-${segmentIndex}`}
                  className="flex items-center justify-between gap-1 py-0.5 border-b border-gray-50 last:border-0"
                >
                  <span className="text-gray-500 shrink-0 w-[88px] leading-tight">
                    {sideLabel}
                    {segmentIndex >= 0 ? (
                      <span className="block text-[9px] text-gray-400">
                        Seg. {segmentIndex + 1}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex-1 text-gray-900 font-medium text-right leading-tight min-w-0">
                    <span className="block truncate">{text}</span>
                    <span className="text-[9px] text-gray-400 font-normal">
                      ({origin})
                    </span>
                  </span>
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    {!ownerReadOnly && onEditOfficialSideSegment && segmentIndex >= 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          onEditOfficialSideSegment(lot, segmentIndex)
                        }
                        className="text-[9px] font-bold text-violet-600 hover:underline px-1"
                      >
                        Medida
                      </button>
                    )}
                    {!ownerReadOnly &&
                      (onEditConfrontationSegment || onEditConfrontationSide) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (onEditConfrontationSegment && segmentIndex >= 0) {
                            onEditConfrontationSegment(lot, key, [segmentIndex]);
                          } else if (onEditConfrontationSide) {
                            onEditConfrontationSide(lot, key);
                          }
                        }}
                        className="text-[9px] font-bold text-blue-600 hover:underline px-1"
                      >
                        Editar
                      </button>
                    )}
                  </div>
                </div>
              ),
            )
          ) : (
            <p className="text-[10px] text-gray-500 py-2 text-center leading-snug">
              Carregando confrontações…
            </p>
          )}
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
                if (isSold) {
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

function ClearConfirmModal({
  lot,
  price,
  userEmail,
  userRole,
  onClose,
  onConfirm,
}: {
  lot: any;
  price: number;
  userEmail: string | undefined;
  userRole: string | undefined;
  onClose: () => void;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => passwordInputRef.current?.focus(), 100);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Informe sua senha para continuar.");
      return;
    }

    if (!userRole || !userRole.toUpperCase().includes("ADMIN")) {
      setError("Apenas administradores podem limpar lotes vendidos ou reservados.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail || "",
        password: password,
      });

      if (signInError) {
        setError("Senha inválida. A limpeza foi bloqueada.");
        return;
      }
      
      // If signed in but no user or session
      if (!data.user) {
        setError("Erro de autenticação.");
        return;
      }

      onConfirm(password);
    } catch (err) {
      setError("Erro ao validar senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="bg-white w-full max-w-md rounded-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 z-[10000]">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-lg text-gray-900">Confirmar limpeza do lote</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-5">
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            Esta ação irá remover o cliente vinculado, limpar o status de venda/reserva e devolver o lote para <strong>DISPONÍVEL</strong>. Esta ação não pode ser desfeita.
          </p>
          
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1 mb-5 text-sm">
            <div className="flex justify-between blur-0">
              <span className="text-gray-500">Projeto:</span>
              <span className="font-medium text-gray-900 truncate max-w-[150px]">{lot.projectName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Quadra / Lote:</span>
              <span className="font-medium text-gray-900">{lot.block} / {lot.number}</span>
            </div>
            {lot.customerName && (
              <div className="flex justify-between">
                <span className="text-gray-500">Cliente atual:</span>
                <span className="font-medium text-gray-900 truncate max-w-[150px]">{lot.customerName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Status atual:</span>
              <span className="font-medium text-gray-900">{lot.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Valor:</span>
              <span className="font-medium text-gray-900">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price)}
              </span>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs mb-5">
            <strong>Aviso:</strong> Este lote possui venda/contrato/financeiro vinculado. A limpeza do lote <strong>não</strong> apaga esses registros. Para cancelar oficialmente, use o módulo Contratos ou Financeiro.
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-1 relative">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Digite sua senha de administrador para confirmar:
              </label>
              <div className="relative">
                <input
                  ref={passwordInputRef}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="Senha de acesso"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {error && <p className="text-red-500 text-sm mt-1 mb-2 font-medium">{error}</p>}

            <div className="flex gap-3 pt-4 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 font-semibold rounded-lg transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || password.trim().length === 0}
                className={`flex-1 px-4 py-2 font-semibold rounded-lg transition-colors text-sm flex justify-center items-center gap-2 ${loading || password.trim().length === 0 ? 'bg-red-400 cursor-not-allowed text-white' : 'bg-red-600 text-white hover:bg-red-700'}`}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Limpeza"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
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
  focusBlockName = null,
  focusBlockKey = 0,
  assistedConfrontationMode = false,
  insertConfrontantTool = false,
  defineOfficialSideTool = false,
  onOverlayOpenChange,
  onEnterpriseValueRefresh,
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
  /** Modo revisão pós confrontação automática (GIS-005). */
  assistedConfrontationMode?: boolean;
  insertConfrontantTool?: boolean;
  /** Ferramenta para definir official_side por segmento (medida oficial). */
  defineOfficialSideTool?: boolean;
  /** Notifica o container quando modais/popups do GIS estão abertos (SVL-UI-029). */
  onOverlayOpenChange?: (open: boolean) => void;
  /** Atualiza card Valor do Empreendimento após salvar preço manual. */
  onEnterpriseValueRefresh?: () => void;
}) {
  const { user } = useAuth();
  const ownerMapWriteBlocked = isOwnerRole(user?.role);
  const [center] = useState<[number, number]>([-1.4553, -48.4892]);
  const [lots, setLots] = useState<any[]>([]);
  const [blocksData, setBlocksData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(18);
  const showPermanentLabels =
    labelsMinZoom == null || mapZoom >= labelsMinZoom;
  const sheetPickActive = Boolean(lotSheetPickMode);
  const memorialPickActive = Boolean(memorialPickMode);
  const mapLotPickActive = sheetPickActive || memorialPickActive;
  const [frontCorrectLotId, setFrontCorrectLotId] = useState<string | null>(
    null,
  );
  const [frontCorrectSaving, setFrontCorrectSaving] = useState(false);
  const [confrontEdit, setConfrontEdit] = useState<{
    lot: any;
    side: SideRole;
    segmentIndexes: number[];
    currentConfrontant?: string | null;
    currentSource?: import('@/lib/confrontantTypes').ConfrontantSource | null;
  } | null>(null);
  const [defineOfficialSidePickLotId, setDefineOfficialSidePickLotId] =
    useState<string | null>(null);
  const pendingLotPricesRef = useRef<Map<string, number | null>>(new Map());
  const [officialSideEdit, setOfficialSideEdit] = useState<{
    lot: any;
    segmentIndex: number;
  } | null>(null);
  const [customerContractValidation, setCustomerContractValidation] =
    useState<CustomerContractValidation | null>(null);

  const displayLots = useMemo(
    () =>
      lots.map((lot) => {
        const frontStreetDisplay = resolveLotFrontStreetDisplay(
          lot,
          streetGuides,
        );
        if (
          frontStreetDisplay === lot.frontStreetDisplay ||
          (!frontStreetDisplay && !lot.frontStreetDisplay)
        ) {
          return lot;
        }
        return { ...lot, frontStreetDisplay: frontStreetDisplay ?? null };
      }),
    [lots, streetGuides],
  );

  const blocksForConfront = useMemo(
    () =>
      displayLots.map((l) => ({
        ...l,
        id: l.id,
        number: l.number,
        block_name: l.block,
        segments_json: l.segments_json,
        front_segment_index: l.front_segment_index,
        front_street_name: l.frontStreetName,
      })) as Record<string, unknown>[],
    [displayLots],
  );

  const confrontationAudits = useMemo(() => {
    const map = new Map<string, LotConfrontationAudit>();
    for (const lot of displayLots) {
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
            blocksForConfront,
            streetGuides,
          ),
        );
      } catch (err) {
        console.warn('CONFRONTATION_AUDIT_SKIP', lot.id, err);
      }
    }
    return map;
  }, [
    displayLots,
    blocksForConfront,
    streetGuides,
  ]);

  const handlePickFrontSegment = async (lot: any, segmentIndex: number) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!lot?.id) return;
    setFrontCorrectSaving(true);
    try {
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
      const streetMatch = resolveFrontStreetGuideForLot(block, streetGuides);
      const streetFields = streetFieldsFromGuideMatch(streetMatch);
      console.log("FRONT_SEGMENT_MANUAL_LOCKED", {
        lotId: lot.id,
        segmentIndex,
        persistedFrontIdx,
        measures,
        streetMatch,
      });
      const { patch, frontSourcePersisted } = await persistManualLotFront(
        supabase,
        lot.id,
        measures,
        persistedFrontIdx,
        streetFields,
      );
      console.log("BLOCK_FRONT_SAVE_OK", {
        blockId: lot.id,
        lotNumber: lot.number,
        frontSegmentIndex: persistedFrontIdx,
        frontSourcePersisted,
        patch,
      });
      const updatedDisplay = resolveLotFrontStreetDisplay(
        {
          ...lot,
          front_segment_index: persistedFrontIdx,
          front_street_name: streetFields.front_street_name,
          front_street_id: streetFields.front_street_id,
          front_street_type: streetFields.front_street_type,
        },
        streetGuides,
      );
      setLots((prev) =>
        prev.map((l) =>
          l.id === lot.id
            ? {
                ...l,
                frente: measures.frente,
                Fundo: measures.fundo,
                "Lado Dir.": measures.ladoDireito,
                "Lado Esq.": measures.ladoEsquerdo,
                front_segment_index: persistedFrontIdx,
                front_source: frontSourcePersisted ? "manual" : l.front_source,
                frontStreetName: streetFields.front_street_name,
                frontStreetId: streetFields.front_street_id,
                frontStreetType: streetFields.front_street_type,
                frontStreetDisplay: updatedDisplay,
              }
            : l,
        ),
      );
      setFrontCorrectLotId(null);
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
      alert("Frente atualizada com sucesso.");
    } catch (err: unknown) {
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
    const block = {
      ...lot,
      block_name: lot.block,
      segments_json: lot.segments_json,
      front_segment_index: lot.front_segment_index,
    };
    const indexes =
      segmentIndexes?.length
        ? segmentIndexes
        : officialSegmentIndexesForSide(block, blocksForConfront, side);
    const audit = confrontationAudits.get(lot.id);
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
  };

  const handleConfrontEdgePick = (lot: any, edgeIndex: number) => {
    if (ownerMapWriteBlocked) return;
    if (!assistedConfrontationMode && !insertConfrontantTool) return;
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
  ) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!confrontEdit?.lot?.id || !projectId) return;
    const sourceBlock = {
      ...confrontEdit.lot,
      block_name: confrontEdit.lot.block,
      segments_json: confrontEdit.lot.segments_json,
      front_segment_index: confrontEdit.lot.front_segment_index,
    };
    const targets = findPropagationTargets(
      blocksForConfront,
      sourceBlock,
      confrontEdit.lot.id,
      confrontEdit.side,
      scope,
    );
    const segmentLabel = confrontEdit.segmentIndexes
      .map((i) => i + 1)
      .join(", ");
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
            segment_indexes: confrontEdit.segmentIndexes,
            confrontant,
            confrontantType,
            scope,
          },
          source: "gis_map",
        });
      }
    }
  };

  const openOfficialSideEditor = (lot: any, segmentIndex: number) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!lot?.id || segmentIndex < 0) return;
    setOfficialSideEdit({ lot, segmentIndex });
  };

  const handleOfficialSideEdgePick = (lot: any, edgeIndex: number) => {
    if (ownerMapWriteBlocked) return;
    if (
      !defineOfficialSideTool &&
      defineOfficialSidePickLotId !== lot?.id
    ) {
      return;
    }
    const block = {
      ...lot,
      block_name: lot.block,
      segments_json: lot.segments_json,
      front_segment_index: lot.front_segment_index,
    };
    const segmentIndex = utmSegmentIndexFromWgs84RingEdge(block, edgeIndex);
    openOfficialSideEditor(lot, segmentIndex);
  };

  const readSavedOfficialSide = (
    lot: Record<string, unknown>,
    segmentIndex: number,
  ): OfficialSideKind | null => {
    const rows = lot.segments_json;
    if (!Array.isArray(rows)) return null;
    const row = rows.find((r, i) => {
      if (r == null || typeof r !== "object") return false;
      const idx =
        typeof (r as Record<string, unknown>).segment_index === "number"
          ? (r as Record<string, unknown>).segment_index
          : i;
      return idx === segmentIndex;
    });
    if (!row || typeof row !== "object") return null;
    return readOfficialSideFromSegmentRow(row as Record<string, unknown>);
  };

  const handleSaveOfficialSide = async (side: OfficialSideKind) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!officialSideEdit?.lot?.id || !projectId) return;
    const lot = officialSideEdit.lot;
    const segmentIndex = officialSideEdit.segmentIndex;
    const oldSide = readSavedOfficialSide(lot, segmentIndex);
    const block = {
      ...lot,
      block_name: lot.block,
      segments_json: lot.segments_json,
    };
    const rows = await persistOfficialSideForSegment(
      supabase,
      lot.id,
      block,
      segmentIndex,
      side,
    );
    setLots((prev) =>
      prev.map((l) => (l.id === lot.id ? { ...l, segments_json: rows } : l)),
    );
    void logLotAuditEvent(supabase, {
      ...lotAuditContextFromBlock(lot, { projectId }),
      userId: user?.id ?? null,
      action: "official_measure_side_changed",
      title: "Lado oficial da medida alterado",
      description: officialSideAuditDescription(segmentIndex, side),
      oldData: {
        segment_index: segmentIndex,
        official_side: oldSide,
      },
      newData: {
        segment_index: segmentIndex,
        official_side: side,
      },
      source: "gis_map",
    });
  };

  const handleClearOfficialSide = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!officialSideEdit?.lot?.id || !projectId) return;
    const lot = officialSideEdit.lot;
    const segmentIndex = officialSideEdit.segmentIndex;
    const oldSide = readSavedOfficialSide(lot, segmentIndex);
    const block = {
      ...lot,
      block_name: lot.block,
      segments_json: lot.segments_json,
    };
    const rows = await persistOfficialSideForSegment(
      supabase,
      lot.id,
      block,
      segmentIndex,
      null,
    );
    setLots((prev) =>
      prev.map((l) => (l.id === lot.id ? { ...l, segments_json: rows } : l)),
    );
    void logLotAuditEvent(supabase, {
      ...lotAuditContextFromBlock(lot, { projectId }),
      userId: user?.id ?? null,
      action: "official_measure_side_changed",
      title: "Lado oficial da medida alterado",
      description: officialSideAuditDescription(segmentIndex, null),
      oldData: {
        segment_index: segmentIndex,
        official_side: oldSide,
      },
      newData: {
        segment_index: segmentIndex,
        official_side: null,
        cleared: true,
      },
      source: "gis_map",
    });
  };

  const handleClearManualConfrontant = async (
    scope: PropagationScope,
    _targetBlockIds: string[],
  ) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!confrontEdit?.lot?.id || !projectId) return;
    const sourceBlock = {
      ...confrontEdit.lot,
      block_name: confrontEdit.lot.block,
      segments_json: confrontEdit.lot.segments_json,
      front_segment_index: confrontEdit.lot.front_segment_index,
    };
    const targets = findPropagationTargets(
      blocksForConfront,
      sourceBlock,
      confrontEdit.lot.id,
      confrontEdit.side,
      scope,
    );
    const segmentLabel = confrontEdit.segmentIndexes
      .map((i) => i + 1)
      .join(", ");
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
            segment_indexes: confrontEdit.segmentIndexes,
            cleared: true,
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
  }, [lots, lotGeometryValidations]);

  // Medição de distância / área
  const handleMeasureDeactivate = onMeasureDeactivate ?? (() => {});
  const handleAreaMeasureDeactivate = onAreaMeasureDeactivate ?? (() => {});
  const gisMeasureToolActive = measureActive || areaMeasureActive;
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
  const [brokersList, setBrokersList] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [tenantContractModel, setTenantContractModel] = useState<string>("PADRAO");
  const [editSaleLoading, setEditSaleLoading] = useState<string | null>(null);

  const userCanEditSale = isPartnerPanelAdmin(user?.role);

  useEffect(() => {
    async function loadBrokersAndContractModel() {
      if (!user?.tenant_id || !isBrowserOnline()) return;
      const [{ data: brokers }, { data: company }] = await Promise.all([
        supabase
          .from("brokers")
          .select("id, name")
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
        (brokers || []).map((b) => ({ id: b.id, name: b.name || "Corretor" })),
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
  const gisOverlayOpen = computeGisMapOverlayOpen({
    customerForm: Boolean(customerForm),
    customerContractValidation: Boolean(customerContractValidation),
    clearConfirmModal: Boolean(clearConfirmModal),
    confrontEdit: Boolean(confrontEdit),
    officialSideEdit: Boolean(officialSideEdit),
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
      if (!user || !projectId) {
        setLoading(false);
        return;
      }

      if (!isBrowserOnline()) {
        try {
          const { lots, blocksData } = await loadOfflineMapGeometries(projectId);
          setLots(lots as any[]);
          setBlocksData(blocksData as any[]);
          console.log('GIS_MAP_OFFLINE_CACHE_USED', {
            projectId,
            lots: lots.length,
            blocksData: blocksData.length,
          });
          try {
            runLotGeometryDiagnosticReport(blocksData as Record<string, unknown>[], {
              projectId,
              context: 'GISMap-offline',
            });
          } catch (diagErr: unknown) {
            console.error('[LOT GEOMETRY DEBUG] GISMap-offline failed', diagErr);
          }
        } catch (e) {
          console.error('[OFFLINE] erro ao carregar mapa', e);
          setLots([]);
          setBlocksData([]);
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        let blocksQuery = supabase
          .from("blocks")
          .select("*, projects(name), customers(name)")
          .eq("project_id", projectId);

        if (user.role !== "SUPER_ADMIN" && user.tenant_id) {
          blocksQuery = blocksQuery.or(`tenant_id.eq.${user.tenant_id},company_id.eq.${user.tenant_id}`);
        } else if (user.role !== "SUPER_ADMIN" && !user.tenant_id) {
          // Bloquear se não tiver tenant
          setLots([]);
          setLoading(false);
          return;
        }

        const blocksRes = await blocksQuery;
        if (blocksRes.error) throw blocksRes.error;

        console.group('[SECURITY] GISMap Load');
        console.log('Empresa logada:', user?.company_id || user?.tenant_id);
        console.log('Tenant ativo:', user?.tenant_id);
        console.log('Project ID carregado:', projectId);
        console.log('Total de lotes carregados:', blocksRes.data?.length || 0);
        console.groupEnd();

        if (blocksRes.data) {
          console.error('GISMAP DIAGNOSTIC START', {
            projectId,
            blockCount: blocksRes.data.length,
          });
          try {
            const gisReport = runLotGeometryDiagnosticReport(
              blocksRes.data as Record<string, unknown>[],
              { projectId, context: 'GISMap-load' },
            );
            console.error('DIAGNOSTIC REPORT', gisReport);
          } catch (diagErr: unknown) {
            console.error('[LOT GEOMETRY DEBUG] GISMap-load failed', diagErr);
          }
          const allPolygons = blocksRes.data
            .filter((b: any) => b.geometry && b.geometry.type === "Polygon" && b.geometry.coordinates)
            .map((b: any) => b.geometry.coordinates[0]);

          const parsedBlocks = blocksRes.data
            .map((b) => {
              let { bounds, geometryType, coordCount } = boundsFromBlockGeometry(
                b as Record<string, unknown>,
                b.number,
              );

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
                if (ring && b.source_import !== "TXT_CIVIL3D") {
                  try {
                    dimsFromGeo = calculateLotDimensions(
                      ring,
                      allPolygons,
                      b.properties || {},
                    );
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

              return {
                id: b.id,
                project_id: b.project_id,
                block: b.block_name || b.name || "?",
                projectName: b.projects?.name || "?",
                customerName: b.customers?.name || null,
                customerId: b.customer_id || null,
                saleId: b.sale_id || null,
                contractId: b.contract_id || null,
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
              };
            })
            .filter((b) => b.bounds.length > 0);
          const polygonLots = parsedBlocks.filter(
            (b) =>
              b.geometryType === "Polygon" ||
              b.geometryType === "MultiPolygon",
          );
          const lineBlocks = parsedBlocks.filter(
            (b) =>
              b.geometryType === "LineString" ||
              b.geometryType === "MultiLineString",
          );
          setLots(polygonLots);
          setBlocksData(lineBlocks);

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
      }
    }

    loadLots();

    if (!isBrowserOnline()) {
      return;
    }

    const channel = supabase
      .channel("realtime:blocks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blocks" },
        () => {
          loadLots();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, projectId, refreshKey]);

  const handleLotPriceSaved = (lotId: string, price: number | null) => {
    pendingLotPricesRef.current.set(lotId, price);
    window.setTimeout(() => {
      pendingLotPricesRef.current.delete(lotId);
    }, 8000);

    const normalized = price ?? 0;
    setLots((prev) =>
      prev.map((l) => (l.id === lotId ? { ...l, price: normalized } : l)),
    );
    setBlocksData((prev) =>
      prev.map((l) => (l.id === lotId ? { ...l, price: normalized } : l)),
    );
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
    setActionLoading(lot.id);
    const newStatus = newStatusString;
    const finalPrice = newPrice !== undefined ? newPrice : lot.price;

    // Optimistic UI updates
    setLots((prev) =>
      prev.map((l) =>
        l.id === lot.id
          ? {
              ...l,
              status: newStatus,
              price: finalPrice,
              ...(newStatus === "Disponível"
                ? { customer_id: null, customerId: null, customerName: null }
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
                ? { customer_id: null, customerId: null, customerName: null }
                : {}),
            }
          : l,
      ),
    );

    try {
      const updatePayload: any = { status: newStatus, price: finalPrice };
      if (newStatus === "Disponível") {
        updatePayload.customer_id = null;
      }

      const { error: updateError } = await supabase
        .from("blocks")
        .update(updatePayload)
        .eq("id", lot.id);

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
    } catch (e) {
      console.error("Action error:", e);
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
      if (isVendidoStatus(newStatus)) {
        console.log("SALE_CREATED_WITH_EXISTING_CUSTOMER", { customerId, reused });
      }

      const reservationSignalPaid = Number(customerData.reservation_signal_paid) || 0;
      const signalAmount =
        customerData.signal_amount != null && customerData.signal_amount !== ""
          ? parseCurrencyBRLNumber(customerData.signal_amount) || null
          : null;

      let newSaleData: any = null;
      let newContractData: any = null;
      let expirationTime: string | null = null;
      if (newStatus === "Reservado") {
        const d = new Date();
        d.setHours(d.getHours() + 48);
        expirationTime = d.toISOString();
      }

      if (isVendidoStatus(newStatus)) {
        console.log("[VENDA] TRANSACTION_STARTED");
        console.log("[VENDA] INICIO POS VENDA COMPLETAMENTE TRANSACIONAL");

        try {
          // Log start
          try {
             await supabase.from('audit_logs').insert([{ tenant_id: finalTenantId, company_id: finalTenantId, user_id: user.id || null, action: 'TRANSACTION_STARTED', module: 'SALES', description: 'Iniciando venda do lote ' + lot.id }]);
          } catch(e) {}

          const { data: projDataSnapshot } = await supabase
            .from("projects")
            .select("*")
            .eq("id", finalProjectId)
            .maybeSingle();

          const pmtType = customerData.payment_type || "À vista";
          const instCount =
            pmtType === "Parcelado"
              ? parseValidatedInstallmentsCount(String(customerData.installments_count ?? ""))
              : 1;
          const saleContractModel = normalizeSaleContractModel(tenantContractModel);

          const recantoSignalContract =
            saleContractModel === "RECANTO_PRIMAVERA"
              ? parseCurrencyBRLNumber(
                  customerData.signal_contract_value ||
                    customerData.down_payment ||
                    "",
                )
              : null;
          const recantoSignalPaidAtSale =
            saleContractModel === "RECANTO_PRIMAVERA" &&
            customerData.signal_paid_at_sale != null &&
            String(customerData.signal_paid_at_sale).trim() !== ""
              ? parseCurrencyBRLNumber(String(customerData.signal_paid_at_sale))
              : null;
          const recantoSignalRemaining =
            recantoSignalContract != null && recantoSignalPaidAtSale != null
              ? Math.max(0, recantoSignalContract - recantoSignalPaidAtSale)
              : null;
          const recantoSignalMode =
            saleContractModel === "RECANTO_PRIMAVERA" &&
            recantoSignalRemaining != null &&
            recantoSignalRemaining > 0
              ? customerData.signal_remaining_payment_mode ||
                "FIRST_INSTALLMENTS"
              : null;
          const recantoSignalInstallments =
            recantoSignalMode === "FIRST_INSTALLMENTS"
              ? Number(customerData.signal_remaining_installments) || null
              : recantoSignalMode === "ALL_INSTALLMENTS"
                ? instCount
                : null;
          const recantoSignalInstallmentValue =
            recantoSignalRemaining != null &&
            recantoSignalInstallments &&
            recantoSignalInstallments > 0
              ? Math.round(
                  (recantoSignalRemaining / recantoSignalInstallments) * 100,
                ) / 100
              : null;

          const salePayload: any = {
            tenant_id: finalTenantId,
            company_id: finalTenantId,
            project_id: finalProjectId,
            block_id: lot.id,
            block_number: lot.block || lot.block_name || lot.lot_block || null,
            lot_number: lot.number || lot.lot_number || null,
            lot_id: lot.id,
            customer_id: customerId,
            client_id: clientId,
            user_id: user.id || null,
            agreed_price: customerData.final_value || finalPrice,
            lot_price: finalPrice,
            broker_id: finalBrokerId,
            payment_type: pmtType,
            discount: parseCurrencyBRLNumber(customerData.discount_value),
            total_value: customerData.final_value || finalPrice,
            down_payment:
              recantoSignalContract ??
              parseCurrencyBRLNumber(customerData.down_payment),
            installments_count: instCount,
            installment_correction_type:
              saleContractModel === "RECANTO_PRIMAVERA"
                ? DEFAULT_INSTALLMENT_CORRECTION_TYPE
                : normalizeInstallmentCorrectionType(
                    customerData.installment_correction_type,
                  ),
            status: "ACTIVE",
            signal_contract_value: recantoSignalContract,
            signal_paid_at_sale: recantoSignalPaidAtSale,
            signal_remaining_value: recantoSignalRemaining,
            signal_remaining_payment_mode: recantoSignalMode,
            signal_remaining_installments: recantoSignalInstallments,
            signal_remaining_installment_value: recantoSignalInstallmentValue,
            ...buildSaleSpouseDbPatch(customerData),
          };

          console.log("SALE_CREATED");
          const { data: saleData, error: saleError } = await supabase
            .from("sales")
            .insert([salePayload])
            .select()
            .single();

          if (saleError || !saleData) {
            console.error("ERRO SALES: ", saleError);
            throw saleError || new Error("Falha ao criar venda");
          }
          console.log("CUSTOMER_ID_LINKED_TO_SALE");
          newSaleData = saleData;
          const saleId = saleData.id;

          const { data: tenantContractRow } = await supabase
            .from("companies")
            .select("contract_model")
            .eq("id", finalTenantId)
            .maybeSingle();
          const contractModel = normalizeSaleContractModel(
            tenantContractRow?.contract_model ?? tenantContractModel,
          );

          if (reservationSignalPaid > 0 && pmtType === "Parcelado") {
            console.log("SIGNAL_APPLIED_TO_DOWN_PAYMENT", {
              reservationSignalPaid,
              grossDownPayment: parseCurrencyBRLNumber(customerData.down_payment),
            });
          }

          const financePayloads = buildSaleEditFinancePayloads(
            finalTenantId,
            saleId,
            customerId,
            finalBrokerId,
            { id: lot.id, project_id: lot.project_id || finalProjectId },
            customerData,
            { contractModel, cashInstallmentPaid: pmtType === "À vista" },
          );

          let financeData = [];
          if (financePayloads.length > 0) {
            console.log("FINANCE_RECEIPTS_CREATED");
            const { data: fData, error: financeError } = await supabase
              .from("finance_receipts")
              .insert(financePayloads)
              .select();

            if (financeError || !fData) {
              console.error("ERRO FINANCE", financeError);
              throw financeError || new Error("Falha ao criar financeiro");
            }
            financeData = fData;
            void logLotAuditEvent(supabase, {
              ...lotAuditContextFromBlock(lot, {
                companyId: finalTenantId,
                projectId: finalProjectId,
                saleId,
              }),
              userId: user.id,
              action: "finance_created",
              title: "Parcelas criadas",
              description: `${financeData.length} parcela(s) geradas na venda`,
              newData: { receipts_count: financeData.length, sale_id: saleId },
              source: "finance_flow",
            });
          }

          const { data: tenantData } = await supabase
            .from("companies")
            .select("*")
            .eq("id", finalTenantId)
            .single();

          let fullCustomer = customerData;
          if (customerId) {
            const { data: custDb } = await supabase
              .from("customers")
              .select("*")
              .eq("id", customerId)
              .single();
            if (custDb) {
              fullCustomer = mergeCustomerData(custDb, customerData);
            }
          }

          const receiptsSum = financeData.reduce((acc: any, curr: any) => acc + Number(curr.amount || 0), 0);

          let brokerSnapshot = null;
          if (finalBrokerId) {
            const { data: brokerRow } = await supabase
              .from("brokers")
              .select(BROKERS_CONTRACT_SELECT)
              .eq("id", finalBrokerId)
              .maybeSingle();
            brokerSnapshot = brokerRowToSnapshot(
              (brokerRow as Record<string, unknown>) || null,
            );
          }

          const enrichedSaleData = attachBrokerSnapshotToSale(
            {
              ...saleData,
              receipts_sum: receiptsSum,
              finance_receipts: financeData,
              down_payment_due_date: customerData.down_payment_due_date || null,
              first_installment_due_date:
                customerData.first_installment_due_date || null,
              ...buildSaleSpouseDbPatch(customerData),
            },
            brokerSnapshot,
          );

          const contractPayloadPartial = {
            project_name_snapshot: projDataSnapshot?.name || lot?.projects?.name || null,
            project_city_snapshot: projDataSnapshot?.city || null,
            project_uf_snapshot: projDataSnapshot?.uf || null,
            forum_city_snapshot: projDataSnapshot?.forum_city || projDataSnapshot?.city || null,
          };

          const saleValue = Number(customerData.final_value || finalPrice) || 0;
          const downPaymentVal = parseCurrencyBRLNumber(customerData.down_payment);
          const installmentsVal = instCount;
          // Contrato em try/catch isolado — falha aqui NÃO reverte venda/financeiro
          try {
            console.log("[VENDA] iniciando criação do contrato", {
              saleId,
              blockId: lot.id,
              customerId,
              projectId: finalProjectId,
            });

            let contractNumber: string;
            try {
              contractNumber = await fetchNextContractNumberFromApi(
                finalTenantId,
                finalTenantId,
              );
            } catch (apiNumErr) {
              console.warn(
                "[VENDA] API next-number falhou, tentando client",
                apiNumErr,
              );
              contractNumber = await getNextContractNumber(
                supabase,
                finalTenantId,
                finalTenantId,
              );
            }

            if (!isValidStoredContractNumber(contractNumber)) {
              throw new Error(
                `Número de contrato inválido gerado: ${contractNumber}`,
              );
            }

            console.log("[VENDA] contract_number gerado", contractNumber);

            const customerForContract = {
              ...fullCustomer,
              id: customerId,
            };
            const contractValidation =
              validateCustomerForContract(customerForContract);
            if (!contractValidation.valid) {
              setCustomerContractValidation(contractValidation);
              console.warn("[VENDA] contrato bloqueado — dados obrigatórios", {
                missing: contractValidation.missingRequired,
                customerId,
              });
              void logLotAuditEvent(supabase, {
                ...lotAuditContextFromBlock(lot, {
                  companyId: finalTenantId,
                  projectId: finalProjectId,
                  saleId,
                }),
                userId: user.id,
                action: "note_added",
                title: "Geração de contrato bloqueada",
                description: `Campos pendentes: ${contractValidation.missingRequired.join(", ")}`,
                newData: {
                  missing: contractValidation.missingRequired,
                  customer_id: customerId,
                },
                source: "contract_flow",
              });
              alert(
                "Venda e financeiro salvos, mas o contrato não foi gerado: faltam dados obrigatórios do comprador. Complete o cadastro do cliente.",
              );
              return;
            }

            const blockRow = (await fetchBlockForContract(lot.id)) || lot;
            const contractHtml = generateContractHTML({
              tenant: tenantData || {},
              customer: fullCustomer || {},
              project: projDataSnapshot || lot.projects || {},
              block: blockRow,
              sale: enrichedSaleData,
              financeReceipts: financeData,
              contractSnapshot: {
                ...contractPayloadPartial,
                contract_number: contractNumber,
              },
            });

            const contractPayloads: Record<string, unknown>[] = [
              {
                tenant_id: finalTenantId,
                company_id: finalTenantId,
                sale_id: saleId,
                customer_id: customerId,
                project_id: finalProjectId,
                block_id: lot.id,
                broker_id: finalBrokerId,
                contract_number: contractNumber,
                sale_value: saleValue,
                down_payment: downPaymentVal,
                installments: installmentsVal,
                status: "ativo",
                generated_html: contractHtml,
                created_at: new Date().toISOString(),
                ...contractPayloadPartial,
              },
              {
                tenant_id: finalTenantId,
                company_id: finalTenantId,
                sale_id: saleId,
                customer_id: customerId,
                project_id: finalProjectId,
                block_id: lot.id,
                contract_number: contractNumber,
                status: "ativo",
                generated_html: contractHtml,
                ...contractPayloadPartial,
              },
              {
                tenant_id: finalTenantId,
                sale_id: saleId,
                customer_id: customerId,
                project_id: finalProjectId,
                block_id: lot.id,
                contract_number: contractNumber,
                status: "ativo",
              },
            ];

            const { data: insertedContract, error: contractInsertError } =
              await insertContractForSale(contractPayloads);

            if (contractInsertError || !insertedContract) {
              console.error("[VENDA] erro ao criar contrato (final)", contractInsertError);
              alert(
                `Venda e financeiro salvos, mas o contrato não foi criado: ${
                  contractInsertError?.message || "erro desconhecido"
                }. Use "Regenerar contrato" em Contratos ou contate o suporte.`,
              );
            } else {
              newContractData = insertedContract;

              if (
                insertedContract.contract_number !== contractNumber &&
                insertedContract.id
              ) {
                const { data: fixedRow, error: fixNumErr } = await supabase
                  .from("contracts")
                  .update({ contract_number: contractNumber })
                  .eq("id", insertedContract.id)
                  .select("*")
                  .single();
                if (!fixNumErr && fixedRow) {
                  newContractData = fixedRow;
                  console.log("[VENDA] contract_number corrigido no banco");
                }
              }

              if (contractHtml && !insertedContract.generated_html) {
                const { error: htmlUpdErr } = await supabase
                  .from("contracts")
                  .update({ generated_html: contractHtml })
                  .eq("id", insertedContract.id);

                if (htmlUpdErr) {
                  console.error("[VENDA] erro ao salvar generated_html", htmlUpdErr);
                } else {
                  console.log("[VENDA] generated_html salvo", insertedContract.id);
                  newContractData = { ...insertedContract, generated_html: contractHtml };
                }
              } else {
                console.log("[VENDA] generated_html salvo no insert");
              }

              console.log("[VENDA] CUSTOMER_ID_LINKED_TO_CONTRACT", {
                contract_id: insertedContract.id,
              });

              void logLotAuditEvent(supabase, {
                ...lotAuditContextFromBlock(lot, {
                  companyId: finalTenantId,
                  projectId: finalProjectId,
                  saleId,
                  contractId: insertedContract.id,
                }),
                userId: user.id,
                action: "contract_generated",
                title: "Contrato gerado",
                description: `Contrato nº ${contractNumber} gerado`,
                newData: {
                  contract_id: insertedContract.id,
                  contract_number: contractNumber,
                },
                source: "contract_flow",
              });
            }
          } catch (contractErr: unknown) {
            console.error("[VENDA] exceção ao criar contrato", contractErr);
            const msg =
              contractErr instanceof Error ? contractErr.message : String(contractErr);
            alert(
              `Venda e financeiro salvos, mas falha ao gerar contrato: ${msg}. Verifique a tela Contratos.`,
            );
          }

          // Atualizar BLOCO — venda concluída mesmo se contrato falhou (sale_id preservado)
          console.log("[VENDA] BLOCK_MARKED_SOLD");
          const { error: blockUpdErr } = await supabase
            .from("blocks")
            .update({
              status: "Vendido",
              price: finalPrice,
              customer_id: customerId,
              sale_id: saleId,
              contract_id: newContractData?.id || null,
              broker_id: finalBrokerId
            })
            .eq("id", lot.id);
            
          if (blockUpdErr) {
             console.error("[VENDA] ERRO AO ATUALIZAR STATUS DO LOTE", blockUpdErr);
             throw blockUpdErr;
          }

          // COMISSÃO DO CORRETOR AUTOMÁTICA
          if (user?.role === 'BROKER') {
            console.log("BROKER_FOUND");
            try {
               const { data: brokerData } = await supabase.from('brokers').select('commission_percent').eq('id', user.id).single();
               const pct = brokerData?.commission_percent || 0;
               if (pct > 0) {
                 const saleVal = customerData.final_value || finalPrice;
                 const cv = (saleVal * pct) / 100;
                 
                 console.log("BROKER_COMMISSION_CREATED");
                 const { error: commErr } = await supabase.from('broker_commissions').insert([{
                    company_id: finalTenantId,
                    tenant_id: finalTenantId,
                    broker_id: finalBrokerId,
                    sale_id: saleId,
                    contract_id: newContractData?.id || null,
                    customer_id: customerId || clientId,
                    commission_percent: pct,
                    amount: cv,
                    status: 'pendente'
                 }]);
                 
                 if (commErr) {
                    console.error("Erro insert broker_commissions:", commErr.message);
                 } else {
                    console.log("COMISSÃO GRAVADA: ", cv);
                 }
               }
               console.log("BROKER_SALE_FLOW_SUCCESS");
            } catch (err) {
               console.error("Erro ao gerar comissão:", err);
            }
          }
          
          console.log("[VENDA] TRANSACTION_SUCCESS", {
            sale_id: saleId,
            contract_id: newContractData?.id || null,
          });

          void logLotAuditEvent(supabase, {
            ...lotAuditContextFromBlock(lot, {
              companyId: finalTenantId,
              projectId: finalProjectId,
              saleId,
              contractId: newContractData?.id ?? null,
            }),
            userId: user.id,
            action: "sold",
            title: "Venda concluída",
            description: `Lote vendido para ${customerData.name || "cliente"} por ${formatCurrencyBRL(saleValue)}`,
            newData: {
              customer_id: customerId,
              broker_id: finalBrokerId,
              sale_value: saleValue,
            },
            source: "sale_flow",
          });

          try {
             await supabase.from('audit_logs').insert([{ tenant_id: finalTenantId, company_id: finalTenantId, user_id: user.id || null, action: 'TRANSACTION_SUCCESS', module: 'SALES', description: 'Venda concluída com sucesso para o lote ' + lot.id, reference_id: newSaleData?.id }]);
          } catch(e) {}

        } catch (err: any) {
           console.log("TRANSACTION_ROLLBACK");
           try {
             if (newSaleData?.id) {
                await supabase.from('finance_receipts').delete().eq('sale_id', newSaleData.id);
                await supabase.from('broker_commissions').delete().eq('sale_id', newSaleData.id);
             }
             if (newContractData?.id) await supabase.from('contracts').delete().eq('id', newContractData.id);
             if (newSaleData?.id) await supabase.from('sales').delete().eq('id', newSaleData.id);
             await supabase.from('blocks').update({ status: 'Disponível', customer_id: null, sale_id: null, contract_id: null, broker_id: null }).eq('id', lot.id);

             await supabase.from('audit_logs').insert([{ tenant_id: finalTenantId, company_id: finalTenantId, user_id: user.id || null, action: 'TRANSACTION_ROLLBACK', module: 'SALES', description: 'Rollback executado para o lote ' + lot.id }]);
           } catch(rollbackErr) {
             console.error("CRITICAL: Falha no rollback", rollbackErr);
           }

           console.error("Erro no fluxo de venda:", err);
           throw new Error("Erro na venda completa: " + (err.message || JSON.stringify(err)));
        }
      } else {
        // Reservas e Disponível
        console.log("BLOCK_MARKED_RESERVED_OR_AVAILABLE");
        const { error: updateError } = await supabase
          .from("blocks")
          .update({
            status: newStatus,
            price: finalPrice,
            customer_id: customerId,
            broker_id: finalBrokerId,
            reservation_expires_at: expirationTime,
            reservation_date: newStatus === "Reservado" ? new Date().toISOString() : null,
            signal_amount: signalAmount,
            signal_date: customerData.signal_date || null,
            signal_payment_method: customerData.signal_payment_method || null,
            signal_notes: customerData.signal_notes || null,
          })
          .eq("id", lot.id)
          .eq("tenant_id", finalTenantId)
          .eq("project_id", lot.project_id || finalProjectId);

        if (updateError) throw updateError;
        console.log("CUSTOMER_ID_LINKED_TO_BLOCK");

        if (newStatus === "Reservado") {
          void logLotAuditEvent(supabase, {
            ...lotAuditContextFromBlock(lot, {
              companyId: finalTenantId,
              projectId: finalProjectId,
            }),
            userId: user.id,
            action: "reserved",
            title: "Lote reservado",
            description: `Reservado para ${customerData.name || "cliente"}`,
            newData: {
              customer_id: customerId,
              broker_id: finalBrokerId,
              expiration_time: expirationTime,
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
    } catch (e: any) {
      console.error("Error saving customer and lot:", e);
      alert("Erro ao salvar dados (Venda interrompida): " + e.message);
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
        <GisBaseLayer
          layerId={normalizeGisBaseLayer(activeLayer)}
          onZoomChange={setMapZoom}
        />

        <ZoomControl position="bottomright" />
        <MapZoomTracker onZoom={setMapZoom} />
        <MapController
          safeBounds={safeMapBounds}
          refreshKey={refreshKey}
          projectId={projectId}
          focusBlockName={focusBlockName}
          focusBlockKey={focusBlockKey}
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
                polygonFillOnly: !SHOW_BOUNDARY_LINES,
                noSegmentPolyline: true,
              });
            }

            const strokeColor = sheetPickActive ? "#4999e9" : "#000000";
            const borderWeight = SHOW_BOUNDARY_LINES
              ? sheetPickActive
                ? 2
                : 1
              : 0;

            return (
              <Fragment key={lot.id}>
                <GisSanitizeDebugMarkers lotId={lot.id} validation={validation} />
                <Polygon
                  positions={positions}
                  interactive={mapLotPickActive || !(drawStreetActive || gisMeasureToolActive)}
                  pathOptions={{
                    color: strokeColor,
                    fillColor: mapLotPickActive ? "#4999e9" : color,
                    fillOpacity: mapLotPickActive ? 0.35 : 0.75,
                    stroke: SHOW_BOUNDARY_LINES,
                    weight: borderWeight,
                  }}
                  eventHandlers={{
                    click: () => {
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
                      if (mapLotPickActive) return;
                      const layer = e.target;
                      layer.setStyle({
                        fillOpacity: 1,
                        weight: SHOW_BOUNDARY_LINES ? 2 : 0,
                      });
                    },
                    mouseout: (e) => {
                      if (mapLotPickActive) return;
                      const layer = e.target;
                      layer.setStyle({
                        fillOpacity: 0.75,
                        weight: borderWeight,
                      });
                    },
                  }}
                >
                  {!mapLotPickActive && (
                    <Popup>
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
                        assistedConfrontationMode={
                          !ownerMapWriteBlocked &&
                          (assistedConfrontationMode || insertConfrontantTool)
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
                        defineOfficialSideActive={
                          !ownerMapWriteBlocked &&
                          (defineOfficialSideTool ||
                            defineOfficialSidePickLotId === lot.id)
                        }
                        onStartDefineOfficialSide={
                          ownerMapWriteBlocked
                            ? undefined
                            : (l) => setDefineOfficialSidePickLotId(l.id)
                        }
                        onCancelDefineOfficialSide={
                          ownerMapWriteBlocked
                            ? undefined
                            : () => setDefineOfficialSidePickLotId(null)
                        }
                        onPickOfficialSideSegment={
                          ownerMapWriteBlocked
                            ? undefined
                            : (l, segmentIndex) =>
                                openOfficialSideEditor(l, segmentIndex)
                        }
                        onEditOfficialSideSegment={
                          ownerMapWriteBlocked
                            ? undefined
                            : (l, segmentIndex) =>
                                openOfficialSideEditor(l, segmentIndex)
                        }
                      />
                    </Popup>
                  )}
                </Polygon>
                <LotBoundaryEdgePolylines
                  positions={positions}
                  lot={lot}
                  strokeColor={strokeColor}
                  frontCorrectActive={frontCorrectLotId === lot.id}
                  onEdgePick={(edgeIndex) =>
                    void handlePickFrontSegment(lot, edgeIndex)
                  }
                  officialSidePickActive={
                    (defineOfficialSideTool ||
                      defineOfficialSidePickLotId === lot.id) &&
                    frontCorrectLotId !== lot.id
                  }
                  onOfficialSideEdgePick={(edgeIndex) =>
                    handleOfficialSideEdgePick(lot, edgeIndex)
                  }
                  officialSideLabelByEdge={(() => {
                    const manual = readManualOfficialSideMap({
                      ...lot,
                      segments_json: lot.segments_json,
                    });
                    if (manual.size === 0) return undefined;
                    const block = {
                      ...lot,
                      block_name: lot.block,
                      segments_json: lot.segments_json,
                      front_segment_index: lot.front_segment_index,
                    };
                    const isRing = positions.length >= 3;
                    const edgeCount = isRing
                      ? positions.length
                      : positions.length - 1;
                    const labelMap = new Map<number, string>();
                    for (let i = 0; i < edgeCount; i++) {
                      const segIdx = utmSegmentIndexFromWgs84RingEdge(
                        block,
                        i,
                      );
                      const label = officialSideDisplayLabel(
                        manual.get(segIdx) ?? null,
                      );
                      if (label) labelMap.set(i, label);
                    }
                    return labelMap.size > 0 ? labelMap : undefined;
                  })()}
                  assistedConfrontationActive={
                    (assistedConfrontationMode || insertConfrontantTool) &&
                    frontCorrectLotId !== lot.id &&
                    !defineOfficialSideTool &&
                    defineOfficialSidePickLotId !== lot.id
                  }
                  onConfrontEdgePick={(edgeIndex) =>
                    handleConfrontEdgePick(lot, edgeIndex)
                  }
                  segmentEdgeByIndex={
                    new Map(
                      (confrontationAudits.get(lot.id)?.segmentEdges ?? []).map(
                        (e) => [
                          e.ringEdgeIndex,
                          {
                            status: e.status,
                            confrontant: e.confrontant,
                          },
                        ],
                      ),
                    )
                  }
                />
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
                key={`block-${block.id}`}
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
                    const layer = e.target;
                    layer.setStyle({
                      fillOpacity: 1,
                      weight: SHOW_BOUNDARY_LINES ? 2 : 0,
                    });
                  },
                  mouseout: (e) => {
                    const layer = e.target;
                    layer.setStyle({
                      fillOpacity: 0.75,
                      weight: SHOW_BOUNDARY_LINES ? 1 : 0,
                    });
                  },
                }}
              >
                <Popup>
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
            const label =
              guide.displayName ||
              formatStreetDisplay(guide.type, guide.name);
            const widthLabel =
              guide.width != null && guide.width !== ''
                ? `${Number(guide.width).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m`
                : null;
            return (
              <Polyline
                key={`guide-${guide.id}`}
                positions={pts}
                pathOptions={{
                  color: guide.active === false ? "#9ca3af" : "#10b981",
                  weight: 4,
                  dashArray: guide.active === false ? "4, 6" : "10, 10",
                }}
                eventHandlers={
                  onEditStreetGuide
                    ? {
                        click: () => onEditStreetGuide(guide),
                      }
                    : undefined
                }
              >
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
              </Polyline>
            );
          })}

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

      {(assistedConfrontationMode || insertConfrontantTool) && (
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

      {!ownerMapWriteBlocked && insertConfrontantTool && !frontCorrectLotId && !defineOfficialSideTool && (
        <div className="absolute top-16 md:top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-none px-4 max-w-lg w-full">
          <p className="text-xs font-semibold text-sky-100 bg-[#11141a]/95 border border-sky-500/50 rounded-lg px-3 py-2 shadow-lg text-center">
            Editar Confrontação: clique na divisa do lote (arestas coloridas) ou
            use Editar na aba Confrontações do popup.
          </p>
        </div>
      )}

      {!ownerMapWriteBlocked && defineOfficialSideTool && !frontCorrectLotId && (
        <div className="absolute top-16 md:top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-none px-4 max-w-lg w-full">
          <p className="text-xs font-semibold text-violet-100 bg-[#11141a]/95 border border-violet-500/50 rounded-lg px-3 py-2 shadow-lg text-center">
            Definir Medida Oficial: clique no segmento do lote (arestas roxas)
            ou use Editar medidas no popup.
          </p>
        </div>
      )}

      {!ownerMapWriteBlocked && officialSideEdit && projectId && (
        <DefineOfficialSideModal
          blockId={officialSideEdit.lot.id}
          block={{
            ...officialSideEdit.lot,
            block_name: officialSideEdit.lot.block,
            segments_json: officialSideEdit.lot.segments_json,
          }}
          segmentIndex={officialSideEdit.segmentIndex}
          onClose={() => setOfficialSideEdit(null)}
          onSave={handleSaveOfficialSide}
          onClear={handleClearOfficialSide}
        />
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
          prefillFromReservation={customerForm.prefillFromReservation}
          mode={customerForm.mode}
          initialFormData={customerForm.editContext?.form}
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
        <ClearConfirmModal
          lot={clearConfirmModal.lot}
          price={clearConfirmModal.price}
          userEmail={user?.email}
          userRole={user?.role}
          onClose={() => setClearConfirmModal(null)}
          onConfirm={async () => {
            await handleLotAction(clearConfirmModal.lot, "Disponível", clearConfirmModal.price);
            setClearConfirmModal(null);
          }}
        />
      )}

    </div>
  );
}
