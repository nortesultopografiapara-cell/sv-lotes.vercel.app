"use client";

import { Fragment, useEffect, useMemo, useState, useRef } from "react";
import {
  MapContainer,
  TileLayer,
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
import {
  getNextContractNumber,
  isValidStoredContractNumber,
} from "@/lib/contractNumber";
import { generateContractHTML } from "@/lib/contractTemplate";
import { CustomerLotFormModal } from "@/components/map/CustomerLotFormModal";
import { resolveOrCreateCustomer } from "@/lib/customerIdentity";
import { isPartnerPanelAdmin } from "@/lib/partnerPanelAdmin";
import {
  canEditCompletedSale,
  loadSaleEditContext,
  updateSaleFromEdit,
  type SaleEditLoadedContext,
} from "@/lib/saleEdit";
import {
  chanfreTooltipText,
  formatChanfreMeters,
  parseBlockSideLength,
  resolveLotMeasuresFromBlock,
  type ChanfreInfo,
} from "@/lib/lotChanfre";
import {
  buildBlockPatchFromOfficialMeasures,
  getOfficialLotMeasurements,
  getOfficialLotSegmentTable,
} from "@/lib/officialLotMeasurements";
import {
  calculateLotDimensions,
  classifyLotSidesFromSegments,
  detectFront,
  extractSegments,
  mergeCurvedSegments,
  type Segment,
} from "@/utils/calculateLotDimensions";
import { formatStreetDisplay } from "@/lib/streetGuide";
import { saveMapProjectCache, getMapProjectCache } from "@/lib/offline/store";
import { loadOfflineMapGeometries } from "@/lib/offline/projectsOfflineCache";
import {
  isBrowserOnline,
  blockOfflineSale,
  queueOfflineReservation,
} from "@/lib/offline/lotReservationOffline";

/**
 * Linhas auxiliares no mapa (investigação visual):
 * - measurement: MeasureInteraction Polyline (#ef4444)
 * - street guide: streetGuides Polyline (verde/cinza)
 * - block line: blocksData LineString (só com SHOW_AUXILIARY_LINES)
 * - boundary: LotBoundaryEdgePolylines (só com SHOW_BOUNDARY_LINES)
 * - temp/draw: DrawStreetInteraction (só marcadores, sem polyline)
 * Labels de lote: numeração cartográfica em círculo (LotLabelsOverlay)
 * Lotes: contorno via stroke sanitizado (SHOW_BOUNDARY_LINES)
 */
const SHOW_AUXILIARY_LINES = false;

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
function LotBoundaryEdgePolylines({
  positions,
  lot,
  strokeColor,
  frontCorrectActive,
  onEdgePick,
}: {
  positions: LatLngPair[];
  lot: { id?: string; number?: string; geometryType?: string };
  strokeColor: string;
  frontCorrectActive?: boolean;
  onEdgePick?: (segmentIndex: number) => void;
}) {
  if (!SHOW_BOUNDARY_LINES || positions.length < 2) return null;

  const lines: React.ReactNode[] = [];
  const isRing = positions.length >= 3;
  const edgeCount = isRing ? positions.length : positions.length - 1;

  for (let i = 0; i < edgeCount; i++) {
    const a = positions[i];
    const b = positions[isRing ? (i + 1) % positions.length : i + 1];
    const seg: LatLngPair[] = [a, b];
    logGeometryRender("Polyline", { ...lot, geometryType: "boundary-edge" }, seg.length);
    lines.push(
      <Polyline
        key={`${lot.id ?? lot.number}-edge-${i}`}
        positions={seg}
        interactive={Boolean(frontCorrectActive && onEdgePick)}
        pathOptions={{
          color: frontCorrectActive ? "#f59e0b" : strokeColor,
          weight: frontCorrectActive ? 4 : 1,
          opacity: frontCorrectActive ? 1 : 0.9,
        }}
        eventHandlers={
          frontCorrectActive && onEdgePick
            ? {
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onEdgePick(i);
                },
              }
            : undefined
        }
      />,
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

/**
 * Fase 1: centróide.
 * Fase 2: meio da frente + 2,5 m para dentro, se frente identificada (DB ou logradouro).
 */
function computeLotLabelPosition(
  bounds: LatLngPair[],
  lot?: LotLabelMeta,
  streetGuides: StreetGuideForLabel[] = [],
): LatLngPair {
  const centroid = polygonCentroid(bounds);
  if (bounds.length < 3) return centroid;

  const ring = boundsToLngLatRing(bounds);
  const segments = extractSegments(ring, []);
  if (segments.length === 0) return centroid;

  const hasDbFront = Boolean(
    lot?.frontStreetName ||
      lot?.frontStreetDisplay ||
      lot?.frontStreetId,
  );
  const frenteLen = lot?.frente != null ? Number(lot.frente) : 0;
  const hasFrenteMedida = frenteLen > 0 && hasDbFront;

  const visibleGuides = streetGuides.filter(
    (g) => g.visible !== false && g.active !== false,
  );
  const guideFrontSeg =
    visibleGuides.length > 0
      ? findFrontSegmentByStreetGuides(ring, visibleGuides)
      : null;

  const frontIdentified = hasDbFront || hasFrenteMedida || guideFrontSeg != null;
  if (!frontIdentified) return centroid;

  let frontSeg =
    guideFrontSeg ||
    (hasFrenteMedida ? pickFrontSegmentByFrenteLength(segments, frenteLen) : null) ||
    detectFront(segments);

  const frontMid = frontSegmentMidpoint(frontSeg);
  return offsetPointToward(frontMid, centroid, LABEL_INWARD_OFFSET_METERS);
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
  streetGuides = [],
}: {
  items: LotLabelItem[];
  mapZoom: number;
  enabled: boolean;
  streetGuides?: StreetGuideForLabel[];
}) {
  const map = useMap();
  const [pixelOffsets, setPixelOffsets] = useState<Record<string, [number, number]>>(
    {},
  );

  const labelPositions = useMemo(() => {
    const mapPos = new Map<string, LatLngPair>();
    for (const item of items) {
      mapPos.set(
        item.id,
        computeLotLabelPosition(item.bounds, item.lot, streetGuides),
      );
    }
    return mapPos;
  }, [items, streetGuides]);

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

function MeasureInteraction({
  active,
  points,
  setPoints,
  closed,
  setClosed,
  setStr,
}: {
  active: boolean;
  points: L.LatLng[];
  setPoints: any;
  closed: boolean;
  setClosed: any;
  setStr: any;
}) {
  const map = useMapEvents({
    click(e) {
      if (!active) return;
      if (closed) {
        setPoints([e.latlng]);
        setClosed(false);
        return;
      }
      setPoints((prev: L.LatLng[]) => {
        if (prev.length > 2) {
          const first = prev[0];
          // Se o novo clique for a menos de 10 metros do ponto inicial, fechar polígono.
          if (first.distanceTo(e.latlng) < 10) {
            setClosed(true);
            return prev;
          }
        }
        return [...prev, e.latlng];
      });
    },
  });

  useEffect(() => {
    if (!active) {
      setPoints([]);
      setClosed(false);
      setStr("");
    }

    if (active) {
      if (closed) {
        map.getContainer().style.cursor = "default";
      } else {
        map.getContainer().style.cursor = "crosshair";
      }
    } else {
      map.getContainer().style.cursor = "grab"; // default leaflet
    }
  }, [active, closed, map, setPoints, setClosed, setStr]);

  useEffect(() => {
    if (points.length === 0) {
      setStr("");
      return;
    }
    let dist = 0;
    for (let i = 1; i < points.length; i++) {
      dist += points[i - 1].distanceTo(points[i]);
    }
    if (closed && points.length > 2) {
      dist += points[points.length - 1].distanceTo(points[0]);

      let area = 0.0;
      for (let i = 0; i < points.length; i++) {
        let p1 = points[i];
        let p2 = points[(i + 1) % points.length];
        area +=
          (((p2.lng - p1.lng) * Math.PI) / 180) *
          (2 +
            Math.sin((p1.lat * Math.PI) / 180) +
            Math.sin((p2.lat * Math.PI) / 180));
      }
      area = Math.abs((area * 6378137.0 * 6378137.0) / 2.0);
      setStr(`Área: ${area.toFixed(2)} m² | Distância: ${dist.toFixed(2)} m`);
    } else {
      setStr(`Distância: ${dist.toFixed(2)} m`);
    }
  }, [points, closed, setStr]);

  if (!active || points.length === 0) return null;
  if (!SHOW_AUXILIARY_LINES) return null;

  return (
    <>
      {closed ? (
        <Polygon
          positions={points.map((p) => [p.lat, p.lng])}
          pathOptions={{
            color: "#ef4444",
            weight: 2,
            dashArray: "5, 5",
            fillColor: "rgba(239, 68, 68, 0.2)",
          }}
        />
      ) : (
        <Polyline
          positions={points.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: "#ef4444", weight: 2, dashArray: "5, 5" }}
        />
      )}
      {points.map((p, idx) => (
        <CircleMarker
          key={`m-${idx}`}
          center={[p.lat, p.lng]}
          radius={5}
          pathOptions={{
            color: "#ef4444",
            fillColor: "white",
            fillOpacity: 1,
            weight: 2,
          }}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e as any);
              if (!closed && active && idx === 0 && points.length > 2) {
                setClosed(true);
              }
            },
          }}
        />
      ))}
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
  const official = getOfficialLotMeasurements(lot, lot.number);
  return {
    frente: official.frente,
    fundo: official.fundo,
    ladoDireito: official.ladoDireito,
    ladoEsquerdo: official.ladoEsquerdo,
    chanfre: official.chanfre,
    area: official.area ?? parseBlockSideLength(lot.area),
    perimeter: official.perimeter,
  };
}

/** Único popup comercial do mapa GIS (Disponibilizar / Reservar / Vender / Editar Venda). */
function LotPopupContent({
  lot,
  cleanedCoords,
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
}: {
  lot: any;
  cleanedCoords?: LatLngPair[];
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
}) {
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

  const txtSegments = useMemo(() => {
    const table = getOfficialLotSegmentTable(
      lot as Record<string, unknown>,
      null,
    );
    return table.validRows.map((row) => ({
      segment_index: row.segment_index,
      distance: row.distanceM as number,
      classification: row.classification,
    }));
  }, [lot]);

  const area = (officialMeasures.area ?? Number(lot.area)) || 0;
  const currentPrice = Number(lot.price) || 0;
  const displayNum =
    String(lot.number)
      .replace(/[^0-9A-Za-z]/g, "")
      .replace(/.*linha.*/i, "")
      .replace(/.*kml.*/i, "") || String(lot.number).replace(/\D/g, "");

  const [editablePrice, setEditablePrice] = useState(currentPrice);
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditablePrice(currentPrice);
  }, [currentPrice]);

  const handleSavePrice = async () => {
    try {
      setIsSavingPrice(true);
      setSavedSuccess(false);
      const { error } = await supabase.from("blocks").update({ price: editablePrice }).eq("id", lot.id);
      if (error) throw error;
      
      onAction(lot, lot.status, editablePrice);
      
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err: any) {
      console.error(err);
      alert("Erro ao salvar preço: " + err.message);
    } finally {
      setIsSavingPrice(false);
    }
  };

  return (
    <div className="p-2 min-w-[320px] bg-white text-gray-900 rounded-md font-sans shadow-xl">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold text-lg text-gray-900">
          Lote {displayNum}
        </span>
      </div>

      <div className="space-y-2 mb-4 text-sm">
        <div className="flex justify-between border-b pb-1">
          <span className="text-gray-600 font-semibold">Projeto:</span>
          <span className="text-gray-900 text-right max-w-[150px] truncate">
            {lot.projectName}
          </span>
        </div>
        <div className="flex justify-between border-b pb-1">
          <span className="text-gray-600 font-semibold">Quadra:</span>
          <span className="text-gray-900">{lot.block}</span>
        </div>
        <div className="flex justify-between border-b pb-1">
          <span className="text-gray-600 font-semibold">Lote:</span>
          <span className="text-gray-900">{displayNum}</span>
        </div>
        {lot.customerName && lot.status !== "Disponível" && (
          <div className="flex justify-between border-b pb-1 bg-yellow-50 px-1 rounded -mx-1">
            <span className="text-gray-600 font-semibold">Cliente:</span>
            <span className="text-gray-900 text-right max-w-[140px] truncate font-medium">
              {lot.customerName}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center border-b pb-1 mt-1">
          <span className="text-gray-600 font-semibold">Status:</span>
          <span
            className="text-white text-[11px] font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: color }}
          >
            {getStatusLabel(lot.status)}
          </span>
        </div>
        <div className="flex justify-between border-b pb-1">
          <span className="text-gray-600 font-semibold">Área (m²):</span>
          <span className="text-gray-900">
            {area.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="border-b pb-2 mb-1 mt-1">
          <span className="text-gray-600 font-semibold text-xs mb-1 block">
            Dimensões do Lote
          </span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-gray-50 p-2 rounded w-full border border-gray-100">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-[10px]">Frente:</span>{" "}
              <span className="text-gray-900 text-[11px] font-medium w-16 text-right">
                {officialMeasures.frente != null
                  ? `${officialMeasures.frente.toFixed(2)} m`
                  : "--"}
              </span>
            </div>
            {lot.frontStreetDisplay && (
              <div className="col-span-2 flex justify-between items-start border-t border-emerald-100 pt-1 mt-0.5 bg-emerald-50/80 -mx-1 px-1 rounded">
                <span className="text-gray-600 text-[10px] font-semibold">
                  Frente para:
                </span>
                <span className="text-emerald-800 text-[10px] font-bold text-right max-w-[160px] leading-tight">
                  {lot.frontStreetDisplay}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-[10px]">Fundo:</span>{" "}
              <span className="text-gray-900 text-[11px] font-medium w-16 text-right">
                {officialMeasures.fundo != null
                  ? `${officialMeasures.fundo.toFixed(2)} m`
                  : "--"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-[10px]">Lado Dir:</span>{" "}
              <span className="text-gray-900 text-[11px] font-medium w-16 text-right">
                {officialMeasures.ladoDireito != null
                  ? `${officialMeasures.ladoDireito.toFixed(2)} m`
                  : "--"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-[10px]">Lado Esq:</span>{" "}
              <span className="text-gray-900 text-[11px] font-medium w-16 text-right">
                {officialMeasures.ladoEsquerdo != null
                  ? `${officialMeasures.ladoEsquerdo.toFixed(2)} m`
                  : "--"}
              </span>
            </div>
            {officialMeasures.perimeter != null && officialMeasures.perimeter > 0 && (
              <div className="col-span-2 flex justify-between items-center border-t border-gray-100 pt-1 mt-0.5">
                <span className="text-gray-500 text-[10px]">Perímetro:</span>{" "}
                <span className="text-gray-900 text-[11px] font-medium w-20 text-right">
                  {officialMeasures.perimeter.toFixed(2)} m
                </span>
              </div>
            )}
            {officialMeasures.chanfre && officialMeasures.chanfre.total > 0 && (
              <div
                className="col-span-2 flex justify-between items-center border-t border-gray-100 pt-1 mt-1 cursor-help"
                title={chanfreTooltipText(officialMeasures.chanfre)}
              >
                <span className="text-[10px] font-semibold text-gray-500">Chanfre:</span>{" "}
                <span className="font-bold text-gray-900 text-[11px]">
                  {formatChanfreMeters(officialMeasures.chanfre.total)}
                </span>
              </div>
            )}
          </div>
        </div>

        {userRole !== "BROKER" &&
          Array.isArray(lot.segments_json) &&
          lot.segments_json.length >= 3 &&
          onStartCorrectFront && (
            <div className="border-t border-gray-200 pt-2 mt-2">
              {frontCorrectActive ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-amber-800 leading-snug">
                    Clique no lado correto no mapa ou escolha o segmento TXT:
                  </p>
                  <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                    {txtSegments.map((seg) => (
                      <button
                        key={seg.segment_index}
                        type="button"
                        disabled={frontCorrectSaving}
                        onClick={() =>
                          onPickFrontSegment?.(lot, seg.segment_index)
                        }
                        className="text-left px-2 py-1.5 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100 text-[10px] font-medium text-gray-900 disabled:opacity-50"
                      >
                        Seg. {seg.segment_index + 1} — {seg.distance.toFixed(2)} m
                        {lot.front_segment_index === seg.segment_index
                          ? " (frente atual)"
                          : ""}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={onCancelCorrectFront}
                    className="w-full text-[10px] font-semibold text-gray-600 hover:text-gray-900 py-1"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onStartCorrectFront(lot)}
                  className="w-full py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-[11px] font-bold text-amber-900"
                >
                  Corrigir frente do lote
                </button>
              )}
            </div>
          )}

        <div className="flex justify-between items-center pt-1">
          <span className="text-gray-600 font-semibold mb-1">
            Valor do Lote (R$):
          </span>
          <div className="flex items-center gap-1 justify-end">
            <input
              type="number"
              value={editablePrice}
              onChange={(e) => setEditablePrice(Number(e.target.value))}
              className="w-24 px-1 py-1 text-right text-sm border border-gray-300 rounded font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-gray-900"
            />
            <button
              onClick={handleSavePrice}
              disabled={isSavingPrice || editablePrice === currentPrice}
              className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                savedSuccess 
                  ? 'bg-green-500 text-white' 
                  : editablePrice !== currentPrice
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isSavingPrice ? <Loader2 className="w-3 h-3 animate-spin"/> : (savedSuccess ? "Salvo" : "Salvar")}
            </button>
          </div>
        </div>
      </div>

      {isSold && (
        <div className="mb-3 space-y-2">
          <span className="text-sm font-semibold text-gray-800 block">
            Venda concluída
          </span>
          <div className="grid grid-cols-2 gap-1.5">
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
                className={`col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 ${
                  canEditSale
                    ? "bg-orange-500 hover:bg-orange-600"
                    : "bg-orange-400/60 cursor-not-allowed"
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar Venda
              </button>
            )}
            {onViewContract && (
              <button
                type="button"
                onClick={() => onViewContract(lot)}
                className="flex items-center justify-center gap-1 px-2 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg"
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
                className="flex items-center justify-center gap-1 px-2 py-2 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-lg disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${actionLoading === `regen-${lot.id}` ? "animate-spin" : ""}`} />
                Regenerar contrato
              </button>
            )}
            {onViewFinance && lot.saleId && (
              <button
                type="button"
                onClick={() => onViewFinance(lot)}
                className="col-span-2 flex items-center justify-center gap-1 px-2 py-2 border border-gray-300 text-gray-800 hover:bg-gray-50 text-[10px] font-bold rounded-lg"
              >
                <Wallet className="w-3 h-3" />
                Ver Financeiro
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mb-2">
        <span className="text-sm font-semibold text-gray-800">
          Ações de comercial
        </span>
        <div className="flex gap-1 mt-1">
          <button
            onClick={() => {
               if (isSold) {
                 onRequestClear(lot, currentPrice);
               } else {
                 onAction(lot, "Disponível", currentPrice);
               }
            }}
            disabled={actionLoading === lot.id}
            className="flex-1 bg-gray-200 text-gray-700 hover:bg-gray-300 text-[10px] font-bold py-2 rounded"
          >
            Disponibilizar
          </button>
          <button
            onClick={() => {
              if (isSold) {
                alert("Este lote já está vendido. Para vender novamente, primeiro disponibilize o lote usando a liberação administrativa com senha.");
                return;
              }
              onRequestCustomerForm(lot, "Reservado", currentPrice);
            }}
            disabled={actionLoading === lot.id || isSold}
            title={isSold ? "Este lote já está vendido" : "Reservar lote"}
            className={`flex-1 text-[10px] font-bold py-2 rounded transition-colors ${isSold ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500'}`}
          >
            Reservar
          </button>
          <button
            onClick={() => {
              if (isSold) {
                alert("Este lote já está vendido. Para vender novamente, primeiro disponibilize o lote usando a liberação administrativa com senha.");
                return;
              }
              if (!isBrowserOnline()) {
                blockOfflineSale();
                return;
              }
              onRequestCustomerForm(lot, "Vendido", currentPrice);
            }}
            disabled={actionLoading === lot.id || isSold}
            title={isSold ? "Este lote já está vendido" : "Vender lote"}
            className={`flex-1 text-[10px] font-bold py-2 rounded transition-colors ${isSold ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
          >
            Vender
          </button>
          <button
            onClick={() => onRequestClear(lot, currentPrice)}
            disabled={actionLoading === lot.id}
            className="flex-none px-2 bg-gray-100 text-gray-500 hover:text-gray-900 border border-gray-200 hover:bg-gray-200 rounded flex flex-col items-center justify-center"
          >
            {actionLoading === lot.id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            <span className="text-[8px] leading-tight">Limpar</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500 justify-center pb-1">
        <span className="text-green-500 text-lg leading-none">●</span> /
        <span className="text-yellow-400 text-lg leading-none">●</span> /
        <span className="text-red-500 text-lg leading-none">●</span>
      </div>
    </div>
  );
}

function DrawStreetInteraction({
  active,
  points,
  setPoints,
  onSaveLine,
}: {
  active: boolean;
  points: L.LatLng[];
  setPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  onSaveLine: (line: L.LatLng[]) => void;
}) {
  const map = useMapEvents({
    click(e) {
      if (!active) return;
      setPoints((prev) => {
        const next = [...prev, e.latlng];
        if (next.length === 2) {
          onSaveLine(next);
          return [];
        }
        return next;
      });
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
  activeLayer = "satellite",
  gpsActive = false,
  measureActive = false,
  refreshKey = 0,
  streetGuides = [],
  streetGuidesVisible = true,
  drawStreetActive = false,
  onStreetLineDrawn,
  onEditStreetGuide,
  onDeleteStreetGuide,
  labelsMinZoom,
  lotSheetPickMode = false,
  onLotSheetLotPick,
  focusBlockName = null,
  focusBlockKey = 0,
}: {
  projectId?: string;
  activeLayer?: "streets" | "satellite" | "dark";
  gpsActive?: boolean;
  measureActive?: boolean;
  refreshKey?: number;
  /** Zoom na quadra selecionada no gerenciador (block_name). */
  focusBlockName?: string | null;
  focusBlockKey?: number;
  streetGuides?: any[];
  streetGuidesVisible?: boolean;
  drawStreetActive?: boolean;
  onStreetLineDrawn?: (latlngs: L.LatLng[]) => void;
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
}) {
  const { user } = useAuth();
  const [center] = useState<[number, number]>([-1.4553, -48.4892]);
  const [lots, setLots] = useState<any[]>([]);
  const [blocksData, setBlocksData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(18);
  const showPermanentLabels =
    labelsMinZoom == null || mapZoom >= labelsMinZoom;
  const sheetPickActive = Boolean(lotSheetPickMode);
  const [frontCorrectLotId, setFrontCorrectLotId] = useState<string | null>(
    null,
  );
  const [frontCorrectSaving, setFrontCorrectSaving] = useState(false);

  const handlePickFrontSegment = async (lot: any, segmentIndex: number) => {
    if (!lot?.id) return;
    setFrontCorrectSaving(true);
    try {
      const block: Record<string, unknown> = {
        ...lot,
        front_segment_index: segmentIndex,
        segments_json: lot.segments_json,
        number: lot.number,
        area: lot.area,
        front_street_name: lot.frontStreetName,
        front_street_id: lot.frontStreetId,
        source_import: lot.source_import ?? "TXT_CIVIL3D",
      };
      const measures = getOfficialLotMeasurements(block, lot.number);
      console.log("FRONT_SEGMENT_MANUAL_OVERRIDE", {
        lotId: lot.id,
        segmentIndex,
        measures,
      });
      const patch = buildBlockPatchFromOfficialMeasures(
        measures,
        segmentIndex,
      );
      const { error } = await supabase
        .from("blocks")
        .update(patch)
        .eq("id", lot.id);
      if (error) throw error;
      setLots((prev) =>
        prev.map((l) =>
          l.id === lot.id
            ? {
                ...l,
                frente: measures.frente,
                Fundo: measures.fundo,
                "Lado Dir.": measures.ladoDireito,
                "Lado Esq.": measures.ladoEsquerdo,
                front_segment_index: segmentIndex,
              }
            : l,
        ),
      );
      setFrontCorrectLotId(null);
      alert(
        `Frente do lote ${lot.number} definida no segmento ${segmentIndex + 1}.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      alert(`Erro ao salvar frente: ${msg}`);
    } finally {
      setFrontCorrectSaving(false);
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

  const streetGuidesForLabels = useMemo(
    () =>
      streetGuidesVisible
        ? streetGuides.filter((g) => g.visible !== false && g.active !== false)
        : [],
    [streetGuides, streetGuidesVisible],
  );

  // States para Medição (Measure Tool)
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([]);
  const [measureClosed, setMeasureClosed] = useState(false);
  const [measureStr, setMeasureStr] = useState<string>("");

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
  const [editSaleLoading, setEditSaleLoading] = useState<string | null>(null);

  const userCanEditSale = isPartnerPanelAdmin(user?.role);

  useEffect(() => {
    async function loadBrokers() {
      if (!user?.tenant_id || !isBrowserOnline()) return;
      const { data } = await supabase
        .from("brokers")
        .select("id, name")
        .eq("tenant_id", user.tenant_id)
        .eq("active", true)
        .order("name");
      setBrokersList(
        (data || []).map((b) => ({ id: b.id, name: b.name || "Corretor" })),
      );
    }
    if (user) void loadBrokers();
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
          const allPolygons = blocksRes.data
            .filter((b: any) => b.geometry && b.geometry.type === "Polygon" && b.geometry.coordinates)
            .map((b: any) => b.geometry.coordinates[0]);

          const parsedBlocks = blocksRes.data
            .map((b) => {
              const { bounds, geometryType, coordCount } = boundsFromBlockGeometry(
                b as Record<string, unknown>,
                b.number,
              );
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

              const lotMeasures = resolveLotMeasuresFromBlock({
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
                price:
                  b.price !== null && b.price !== undefined
                    ? Number(b.price)
                    : 0,
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
                frontStreetDisplay: b.front_street_name
                  ? formatStreetDisplay(b.front_street_type, b.front_street_name)
                  : null,
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

  const handleLotAction = async (
    lot: any,
    newStatusString: string,
    newPrice?: number,
  ) => {
    if (!user) return;
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

    let finalBrokerId = null;
    if (user?.role === 'BROKER') {
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
          ? Number(customerData.signal_amount)
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
            payment_type: customerData.payment_type || "À vista",
            discount: customerData.discount_value || 0,
            total_value: customerData.final_value || finalPrice,
            down_payment: customerData.down_payment || 0,
            installments_count: Math.max(1, customerData.installments_count || 1),
            status: "ACTIVE",
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

          const financePayloads: any[] = [];
          const pmtType = customerData.payment_type || "À vista";
          const grossDownPayment = Number(customerData.down_payment) || 0;
          let downPayment = grossDownPayment;
          const instCount = Math.max(1, customerData.installments_count || 1);
          const fValue = customerData.final_value || finalPrice;

          if (reservationSignalPaid > 0 && pmtType === "Parcelado") {
            downPayment = Math.max(0, grossDownPayment - reservationSignalPaid);
            console.log("SIGNAL_APPLIED_TO_DOWN_PAYMENT", {
              reservationSignalPaid,
              grossDownPayment,
              netDownPayment: downPayment,
            });
          }

          if (pmtType === "À vista") {
            financePayloads.push({
              tenant_id: finalTenantId,
              company_id: finalTenantId,
              sale_id: saleId,
              customer_id: customerId,
              broker_id: finalBrokerId,
              project_id: lot.project_id || null,
              block_id: lot.id,
              installment_number: 1,
              amount: fValue,
              due_date: customerData.down_payment_due_date || new Date().toISOString().split("T")[0],
              status: "pago",
              paid_at: new Date().toISOString(),
            });
          } else if (pmtType === "Parcelado") {
            let currentInst = 1;
            if (reservationSignalPaid > 0) {
              financePayloads.push({
                tenant_id: finalTenantId,
                company_id: finalTenantId,
                sale_id: saleId,
                customer_id: customerId,
                broker_id: finalBrokerId,
                project_id: lot.project_id || null,
                block_id: lot.id,
                installment_number: -1,
                amount: reservationSignalPaid,
                due_date:
                  customerData.signal_date ||
                  customerData.down_payment_due_date ||
                  new Date().toISOString().split("T")[0],
                status: "pago",
                paid_at: new Date().toISOString(),
              });
            }
            if (downPayment > 0 && customerData.down_payment_due_date) {
              financePayloads.push({
                tenant_id: finalTenantId,
                company_id: finalTenantId,
                sale_id: saleId,
                customer_id: customerId,
                broker_id: finalBrokerId,
                project_id: lot.project_id || null,
                block_id: lot.id,
                installment_number: 0, // 0 signifies "Entry" (Entrada)
                amount: downPayment,
                due_date: customerData.down_payment_due_date,
                status: "pendente",
              });
            }

            if (customerData.first_installment_due_date) {
              const totalRestante = Math.max(0, fValue - downPayment);
              const parValue = Math.round((totalRestante / instCount) * 100) / 100;
              let accumulated = 0;
              
              let cDate = new Date(customerData.first_installment_due_date + "T12:00:00Z");
              for (let i = 0; i < instCount; i++) {
                const isLast = i === instCount - 1;
                const currentAmount = isLast ? Number((totalRestante - accumulated).toFixed(2)) : parValue;
                accumulated += currentAmount;

                financePayloads.push({
                  tenant_id: finalTenantId,
                  company_id: finalTenantId,
                  sale_id: saleId,
                  customer_id: customerId,
                  broker_id: finalBrokerId,
                  project_id: lot.project_id || null,
                  block_id: lot.id,
                  installment_number: currentInst++,
                  amount: currentAmount,
                  due_date: cDate.toISOString().split("T")[0],
                  status: "pendente",
                });
                cDate.setMonth(cDate.getMonth() + 1);
              }
            }
          }

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
          }

          const { data: tenantData } = await supabase
            .from("companies")
            .select("*")
            .eq("id", finalTenantId)
            .single();

          let fullCustomer = customerData;
          if (customerId) {
            const { data: custDb } = await supabase.from("customers").select("*").eq("id", customerId).single();
            if (custDb) fullCustomer = { ...custDb, ...customerData };
          }

          const receiptsSum = financeData.reduce((acc: any, curr: any) => acc + Number(curr.amount || 0), 0);
          const enrichedSaleData = { ...saleData, receipts_sum: receiptsSum };

          const contractPayloadPartial = {
            project_name_snapshot: projDataSnapshot?.name || lot?.projects?.name || null,
            project_city_snapshot: projDataSnapshot?.city || null,
            project_uf_snapshot: projDataSnapshot?.uf || null,
            forum_city_snapshot: projDataSnapshot?.forum_city || projDataSnapshot?.city || null,
          };

          const saleValue = Number(customerData.final_value || finalPrice) || 0;
          const downPaymentVal = Number(customerData.down_payment || 0) || 0;
          const installmentsVal = Math.max(
            1,
            Number(customerData.installments_count || 1) || 1,
          );
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

            const blockRow = (await fetchBlockForContract(lot.id)) || lot;
            const contractHtml = generateContractHTML({
              tenant: tenantData || {},
              customer: fullCustomer || {},
              project: projDataSnapshot || lot.projects || {},
              block: blockRow,
              sale: enrichedSaleData,
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
        className="w-full h-full"
        zoomControl={false}
      >
        {activeLayer === "streets" && (
          <TileLayer
            maxNativeZoom={18}
            maxZoom={22}
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        )}
        {activeLayer === "satellite" && (
          <TileLayer
            maxNativeZoom={18}
            maxZoom={22}
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        )}
        {activeLayer === "dark" && (
          <TileLayer
            maxNativeZoom={18}
            maxZoom={22}
            attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
        )}

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
          streetGuides={streetGuidesForLabels}
        />

        {lots
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
                  interactive={sheetPickActive || !(drawStreetActive || measureActive)}
                  pathOptions={{
                    color: strokeColor,
                    fillColor: sheetPickActive ? "#4999e9" : color,
                    fillOpacity: sheetPickActive ? 0.35 : 0.75,
                    stroke: SHOW_BOUNDARY_LINES,
                    weight: borderWeight,
                  }}
                  eventHandlers={{
                    click: () => {
                      if (sheetPickActive && onLotSheetLotPick) {
                        console.log('LOT_SHEET_MAP_LOT_CLICK', { id: lot.id, number: lot.number });
                        onLotSheetLotPick({
                          id: lot.id,
                          number: String(lot.number || ''),
                          block: String(lot.block || ''),
                        });
                      }
                    },
                    mouseover: (e) => {
                      if (sheetPickActive) return;
                      const layer = e.target;
                      layer.setStyle({
                        fillOpacity: 1,
                        weight: SHOW_BOUNDARY_LINES ? 2 : 0,
                      });
                    },
                    mouseout: (e) => {
                      if (sheetPickActive) return;
                      const layer = e.target;
                      layer.setStyle({
                        fillOpacity: 0.75,
                        weight: borderWeight,
                      });
                    },
                  }}
                >
                  {!sheetPickActive && (
                    <Popup>
                      <LotPopupContent
                        lot={lot}
                        cleanedCoords={positions}
                        onAction={handleLotAction}
                        onRequestCustomerForm={(l, a, p) => openCustomerForm(l, a, p)}
                        onRequestClear={(l, p) => setClearConfirmModal({ lot: l, price: p })}
                        canEditSale={userCanEditSale}
                        userRole={user?.role}
                        onEditSale={(l) => void openEditSaleForm(l)}
                        onViewContract={handleViewContract}
                        onRegenerateContract={(l) =>
                          void handleRegenerateContractFromMap(l)
                        }
                        onViewFinance={handleViewFinance}
                        actionLoading={editSaleLoading || actionLoading}
                        frontCorrectActive={frontCorrectLotId === lot.id}
                        onStartCorrectFront={(l) => setFrontCorrectLotId(l.id)}
                        onCancelCorrectFront={() => setFrontCorrectLotId(null)}
                        onPickFrontSegment={handlePickFrontSegment}
                        frontCorrectSaving={frontCorrectSaving}
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
                interactive={!(drawStreetActive || measureActive)}
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

        {SHOW_AUXILIARY_LINES &&
          streetGuidesVisible &&
          streetGuides.map((guide) => {
            const geo = guide.geometry_geojson || guide.geometry;
            if (!geo?.coordinates) return null;
            const pts = geo.coordinates.map((c: number[]) => [c[1], c[0]]);
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

        {SHOW_AUXILIARY_LINES && (
          <MeasureInteraction
            active={measureActive}
            points={measurePoints}
            setPoints={setMeasurePoints}
            closed={measureClosed}
            setClosed={setMeasureClosed}
            setStr={setMeasureStr}
          />
        )}

        <DrawStreetInteraction
          active={drawStreetActive}
          points={drawStreetPoints}
          setPoints={setDrawStreetPoints}
          onSaveLine={(line) => {
            if (onStreetLineDrawn) onStreetLineDrawn(line);
          }}
        />
      </MapContainer>

      {/* Floating Panel for Measurement/Drawing */}
      {drawStreetActive && (
        <div className="absolute top-16 md:top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-auto bg-emerald-600/90 backdrop-blur-sm border border-emerald-500 rounded-xl md:rounded-full px-4 py-2 shadow-lg flex fade-in-up w-auto min-w-[200px] text-center">
          <span className="text-[11px] md:text-sm font-bold text-white tracking-wider mx-auto">
            {drawStreetPoints.length === 0
              ? "Clique no início do logradouro"
              : "Clique no fim do logradouro — abrirá o cadastro"}
          </span>
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

      {measureActive && measureStr && (
        <div className="absolute top-16 md:top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-auto bg-slate-900/90 backdrop-blur-sm border border-[var(--color-border)] rounded-xl md:rounded-full px-3 md:px-4 py-2 shadow-lg flex flex-col md:flex-row items-center gap-1 md:gap-3 fade-in-up w-auto min-w-[200px] text-center">
          <span className="text-[11px] md:text-sm font-bold text-white whitespace-nowrap md:whitespace-normal">
            {measureStr}
          </span>
          <button
            onClick={() => {
              setMeasurePoints([]);
              setMeasureClosed(false);
              setMeasureStr("");
            }}
            className="mt-1 md:mt-0 p-1.5 md:p-1.5 bg-[var(--color-background)] hover:bg-[var(--color-border)] rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-all"
            title="Limpar Medição"
          >
            <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
        </div>
      )}

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
          onClose={() => setCustomerForm(null)}
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
