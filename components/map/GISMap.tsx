"use client";

import { useEffect, useState, useRef } from "react";
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
  resolveLotMeasuresFromBlock,
} from "@/lib/lotChanfre";
import { calculateLotDimensions } from "@/utils/calculateLotDimensions";
import { formatStreetDisplay } from "@/lib/streetGuide";
import { saveMapProjectCache, getMapProjectCache } from "@/lib/offline/store";
import { loadOfflineMapGeometries } from "@/lib/offline/projectsOfflineCache";
import {
  isBrowserOnline,
  blockOfflineSale,
  queueOfflineReservation,
} from "@/lib/offline/lotReservationOffline";

/** Desliga linhas de chamada entre rótulo e polígono (investigação visual). */
const SHOW_LOT_LABEL_LINES = false;

const LOT_LABEL_MAX_LEADER_METERS = 30;

const DEBUG_LABEL_LOT_NUMBERS = new Set(["17", "18", "2", "4", "5"]);

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

/** Remove vértices inválidos/outliers que geram arestas pretas gigantes no mapa. */
function sanitizeLotBounds(
  bounds: LatLngPair[],
  lot: { id?: string; number?: string },
): LatLngPair[] {
  if (bounds.length < 2) return bounds;

  const valid = bounds.filter(([lat, lng]) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
    if (Math.abs(lat) > 1_000 || Math.abs(lng) > 1_000) return false;
    return true;
  });

  if (valid.length < 2) return bounds;

  const center = polygonCentroid(valid);
  const maxFromCenter = 3_000;
  const filtered = valid.filter((p) => distanceMeters(p, center) <= maxFromCenter);

  const ring = filtered.length >= 2 ? filtered : valid;

  if (ring.length >= 2) {
    const maxEdge = 3_000;
    for (let i = 0; i < ring.length; i++) {
      const cur = ring[i];
      const next = ring[(i + 1) % ring.length];
      const edgeLen = distanceMeters(cur, next);
      if (edgeLen > maxEdge) {
        const num = normalizeLotDisplayNum(lot.number);
        if (DEBUG_LABEL_LOT_NUMBERS.has(num)) {
          console.warn("GIS_MAP_LONG_EDGE", {
            lote: lot.number,
            edgeMeters: edgeLen,
            from: cur,
            to: next,
          });
        }
      }
    }
  }

  return ring;
}

function logLotLabelDebug(
  lot: { number?: string },
  center: LatLngPair,
  labelPos: LatLngPair,
) {
  const num = normalizeLotDisplayNum(lot.number);
  const raw = String(lot.number ?? "");
  if (!DEBUG_LABEL_LOT_NUMBERS.has(num) && !DEBUG_LABEL_LOT_NUMBERS.has(raw)) {
    return;
  }
  console.log("Lote", lot.number);
  console.log("Centro", center);
  console.log("Posição label", labelPos);
  const dist = distanceMeters(center, labelPos);
  console.log("Distância centro→label (m)", dist.toFixed(2));
  if (dist > LOT_LABEL_MAX_LEADER_METERS) {
    console.warn("GIS_MAP_LABEL_LEADER_TOO_LONG", {
      lote: lot.number,
      distMeters: dist,
      maxMeters: LOT_LABEL_MAX_LEADER_METERS,
    });
  }
}

function LotCentroidLabel({
  lot,
  displayNum,
}: {
  lot: { bounds: LatLngPair[]; number?: string };
  displayNum: string;
}) {
  const center = polygonCentroid(lot.bounds);
  const labelPos: LatLngPair = center;

  useEffect(() => {
    logLotLabelDebug(lot, center, labelPos);
  }, [lot.number, center[0], center[1], labelPos[0], labelPos[1]]);

  const icon = L.divIcon({
    className: "lot-map-label-marker",
    html: `<div class="lot-map-label-text">Lote ${displayNum}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  return (
    <Marker
      position={labelPos}
      icon={icon}
      interactive={false}
      zIndexOffset={500}
    />
  );
}

function LotPolygonLabel({
  lot,
  displayNum,
}: {
  lot: { bounds: LatLngPair[]; number?: string };
  displayNum: string;
}) {
  const center = polygonCentroid(lot.bounds);
  const labelPos = center;

  useEffect(() => {
    logLotLabelDebug(lot, center, labelPos);
  }, [lot.number, center[0], center[1]]);

  return (
    <Tooltip
      permanent
      direction="center"
      offset={[0, 0]}
      className="lot-map-label-no-leader bg-transparent border-0 shadow-none text-white font-bold text-[11px]"
      opacity={1}
    >
      <div style={{ textShadow: "1px 1px 2px black, 0 0 1em black" }}>
        Lote {displayNum}
      </div>
    </Tooltip>
  );
}

function renderLotLabel(
  lot: { bounds: LatLngPair[]; number?: string },
  displayNum: string,
  enabled: boolean,
) {
  if (!enabled || !displayNum || displayNum === "0") return null;
  if (!SHOW_LOT_LABEL_LINES) {
    return <LotCentroidLabel lot={lot} displayNum={displayNum} />;
  }
  return <LotPolygonLabel lot={lot} displayNum={displayNum} />;
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
  lots,
  blocksData,
  refreshKey,
  projectId
}: {
  lots: any[];
  blocksData: any[];
  refreshKey?: number;
  projectId?: string;
}) {
  const map = useMap();
  const lastFitBoundsKey = useRef<{ projectId?: string, refreshKey?: number }>({});

  useEffect(() => {
    if (lots.length === 0 && blocksData.length === 0) return;

    const needFitBounds = 
         lastFitBoundsKey.current.projectId !== projectId || 
         lastFitBoundsKey.current.refreshKey !== refreshKey;

    if (!needFitBounds) return;

    let allBounds: [number, number][] = [];
    lots.forEach((l) => {
      if (l.bounds) allBounds.push(...l.bounds);
    });
    blocksData.forEach((b) => {
      if (b.bounds) allBounds.push(...b.bounds);
    });

    if (allBounds.length > 0) {
      map.fitBounds(L.latLngBounds(allBounds), {
        padding: [50, 50],
        maxZoom: 20,
      });
      lastFitBoundsKey.current = { projectId, refreshKey };
    }
  }, [lots, blocksData, map, refreshKey, projectId]);
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


/** Único popup comercial do mapa GIS (Disponibilizar / Reservar / Vender / Editar Venda). */
function LotPopupContent({
  lot,
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
}: {
  lot: any;
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

  const area = lot.area || 0;
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
                {lot.frente !== null && lot.frente !== undefined
                  ? `${Number(lot.frente).toFixed(2)} m`
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
                {lot.Fundo !== null && lot.Fundo !== undefined
                  ? `${Number(lot.Fundo).toFixed(2)} m`
                  : "--"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-[10px]">Lado Dir:</span>{" "}
              <span className="text-gray-900 text-[11px] font-medium w-16 text-right">
                {lot["Lado Dir."] !== null && lot["Lado Dir."] !== undefined
                  ? `${Number(lot["Lado Dir."]).toFixed(2)} m`
                  : "--"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-[10px]">Lado Esq:</span>{" "}
              <span className="text-gray-900 text-[11px] font-medium w-16 text-right">
                {lot["Lado Esq."] !== null && lot["Lado Esq."] !== undefined
                  ? `${Number(lot["Lado Esq."]).toFixed(2)} m`
                  : "--"}
              </span>
            </div>
            {lot.chanfreInfo && lot.chanfreInfo.total > 0 && (
              <div
                className="col-span-2 flex justify-between items-center border-t border-gray-100 pt-1 mt-1 cursor-help"
                title={chanfreTooltipText(lot.chanfreInfo)}
              >
                <span className="text-[10px] font-semibold text-gray-500">Chanfre:</span>{" "}
                <span className="font-bold text-gray-900 text-[11px]">
                  {formatChanfreMeters(lot.chanfreInfo.total)}
                </span>
              </div>
            )}
          </div>
        </div>
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
}: {
  projectId?: string;
  activeLayer?: "streets" | "satellite" | "dark";
  gpsActive?: boolean;
  measureActive?: boolean;
  refreshKey?: number;
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
              let bounds: [number, number][] = [];
              let dimsFromGeo: any = null;

              if (
                b.geometry &&
                b.geometry.type === "LineString" &&
                b.geometry.coordinates
              ) {
                bounds = b.geometry.coordinates.map((c: number[]) => [
                  c[1],
                  c[0],
                ]);
              } else if (
                b.geometry &&
                b.geometry.type === "Polygon" &&
                b.geometry.coordinates
              ) {
                bounds = b.geometry.coordinates[0].map((c: number[]) => [
                  c[1],
                  c[0],
                ]);
                
                // Only calculate from GeoJSON if it's not a TXT import and hasn't been set
                if (b.source_import !== 'TXT_CIVIL3D') {
                    try {
                      dimsFromGeo = calculateLotDimensions(b.geometry.coordinates[0], allPolygons, b.properties || {});
                    } catch(err) {
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
                geometryType: b.geometry?.type,
                bounds,
                segments_json: b.segments_json,
                frente: lotMeasures.sides.frente,
                Fundo: lotMeasures.sides.fundo,
                "Lado Dir.": lotMeasures.sides.ladoDireito,
                "Lado Esq.": lotMeasures.sides.ladoEsquerdo,
                chanfreInfo: lotMeasures.chanfre,
                frontStreetName: b.front_street_name || null,
                frontStreetType: b.front_street_type || null,
                frontStreetWidth: b.front_street_width ?? null,
                frontStreetDisplay: b.front_street_name
                  ? formatStreetDisplay(b.front_street_type, b.front_street_name)
                  : null,
              };
            })
            .filter((b) => b.bounds.length > 0);
          const polygonLots = parsedBlocks.filter(
            (b) => b.geometryType === "Polygon",
          );
          const lineBlocks = parsedBlocks.filter(
            (b) => b.geometryType === "LineString",
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
        <MapController lots={lots} blocksData={blocksData} refreshKey={refreshKey} projectId={projectId} />
        <LocationController active={gpsActive} />

        <style>{`
          .lot-map-label-marker {
            background: transparent !important;
            border: none !important;
          }
          .lot-map-label-text {
            font-weight: 700;
            font-size: 11px;
            color: white;
            white-space: nowrap;
            pointer-events: none;
            transform: translate(-50%, -50%);
            text-shadow: 1px 1px 2px black, 0 0 1em black;
          }
          .leaflet-tooltip.lot-map-label-no-leader::before {
            display: none !important;
          }
        `}</style>

        {lots
          .filter((lot) => lot.bounds.length > 0)
          .map((lot) => {
            const color = getStatusColor(lot.status);
            const displayNum = normalizeLotDisplayNum(lot.number);
            const positions = sanitizeLotBounds(
              lot.bounds as LatLngPair[],
              lot,
            );

            if (positions.length < 3) {
              if (positions.length >= 2) {
                return (
                  <Polyline
                    key={`lot-line-${lot.id}`}
                    positions={positions}
                    pathOptions={{
                      color: color,
                      weight: 2,
                      dashArray: "6, 4",
                    }}
                  />
                );
              }
              return null;
            }

            return (
              <Polygon
                key={lot.id}
                positions={positions}
                interactive={sheetPickActive || !(drawStreetActive || measureActive)}
                pathOptions={{
                  color: sheetPickActive ? "#4999e9" : "#000000",
                  fillColor: sheetPickActive ? "#4999e9" : getStatusColor(lot.status),
                  fillOpacity: sheetPickActive ? 0.35 : 0.75,
                  stroke: true,
                  weight: sheetPickActive ? 2 : 1,
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
                      weight: 2,
                    });
                  },
                  mouseout: (e) => {
                    if (sheetPickActive) return;
                    const layer = e.target;
                    layer.setStyle({
                      fillOpacity: 0.75,
                      weight: 1,
                    });
                  },
                }}
              >
                {renderLotLabel(
                  { bounds: positions, number: lot.number },
                  displayNum,
                  showPermanentLabels && !sheetPickActive,
                )}
                {!sheetPickActive && (
                  <Popup>
                    <LotPopupContent
                      lot={lot}
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
                    />
                  </Popup>
                )}
              </Polygon>
            );
          })}

        {blocksData.map((block) => {
          const displayNum = normalizeLotDisplayNum(block.number);
          const positions = sanitizeLotBounds(
            block.bounds as LatLngPair[],
            block,
          );

          if (positions.length < 3) {
            if (positions.length >= 2) {
              return (
                <Polyline
                  key={`block-line-${block.id}`}
                  positions={positions}
                  pathOptions={{
                    color: "#64748b",
                    weight: 1,
                    dashArray: "4, 6",
                  }}
                />
              );
            }
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
                stroke: true,
                weight: 1,
              }}
              eventHandlers={{
                mouseover: (e) => {
                  const layer = e.target;
                  layer.setStyle({
                    fillOpacity: 1,
                    weight: 2,
                  });
                },
                mouseout: (e) => {
                  const layer = e.target;
                  layer.setStyle({
                    fillOpacity: 0.75,
                    weight: 1,
                  });
                },
              }}
            >
              {renderLotLabel(
                { bounds: positions, number: block.number },
                displayNum,
                showPermanentLabels,
              )}
              <Popup>
                <LotPopupContent
                  lot={block}
                  onAction={handleLotAction}
                  onRequestCustomerForm={(l, a, p) =>
                    openCustomerForm(l, a, p)
                  }
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
                />
              </Popup>
            </Polygon>
          );
        })}

        {streetGuidesVisible &&
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

        <MeasureInteraction
          active={measureActive}
          points={measurePoints}
          setPoints={setMeasurePoints}
          closed={measureClosed}
          setClosed={setMeasureClosed}
          setStr={setMeasureStr}
        />

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
