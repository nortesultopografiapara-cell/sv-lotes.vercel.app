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
import { Layers, Map as MapIcon, Loader2, X, Trash2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { generateContractHTML } from "@/lib/contractTemplate";

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

function MapController({
  lots,
  blocksData,
}: {
  lots: any[];
  blocksData: any[];
}) {
  const map = useMap();
  useEffect(() => {
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
    }
  }, [lots, blocksData, map]);
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

function CustomerFormModal({
  lot,
  actionName,
  price,
  onClose,
  onConfirm,
}: {
  lot: any;
  actionName: string;
  price: number;
  onClose: () => void;
  onConfirm: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    cpf_cnpj: "",
    rg: "",
    profession: "",
    civil_state: "",
    phone: "",
    email: "",
    address: "",
    neighborhood: "",
    city: "",
    state_uf: "",
    zip_code: "",
    payment_type: "À vista",
    discount_value: "",
    down_payment: "",
    down_payment_due_date: "",
    installments_count: "1",
    first_installment_due_date: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // Derived financial values
  const discountValue = Number(formData.discount_value) || 0;
  const finalValue = Math.max(0, price - discountValue);
  const downPayment = Number(formData.down_payment) || 0;
  const installmentsCount = Math.max(
    1,
    Number(formData.installments_count) || 1,
  );
  const installmentValue = Math.max(
    0,
    (price - downPayment) / installmentsCount,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    alert("BOTÃO CONFIRMAR VENDA CLICADO");

    // Validations
    if (actionName === "Vendido") {
      if (formData.payment_type === "À vista") {
        if (discountValue > price) {
          alert("O desconto não pode ser maior que o valor do lote.");
          return;
        }
        if (finalValue <= 0) {
          alert("O valor final não pode ser zero ou negativo.");
          return;
        }
        if (!formData.down_payment_due_date) {
          alert("Por favor, preencha a data de vencimento.");
          return;
        }
      } else {
        if (downPayment > price) {
          alert("A entrada não pode ser maior que o valor do lote.");
          return;
        }
        if (installmentsCount <= 0) {
          alert("A quantidade de parcelas deve ser maior que 0.");
          return;
        }
        if (downPayment > 0 && !formData.down_payment_due_date) {
          alert("Por favor, preencha a data de vencimento da entrada.");
          return;
        }
        if (!formData.first_installment_due_date) {
          alert(
            "Por favor, preencha a data de vencimento da primeira parcela.",
          );
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      await onConfirm({
        ...formData,
        // send derived financial info as well
        lot_value: price,
        final_value: finalValue,
        installment_value: installmentValue,
      });
    } catch (e) {
      console.error("error submitting", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto sm:p-4 font-sans">
      <div className="bg-white w-full max-w-2xl overflow-hidden animate-in fade-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in duration-200 flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-xl">
        <div className="sticky top-0 z-20 p-4 border-b border-gray-100 flex items-center justify-between bg-white flex-none shadow-sm">
          <div>
            <h3 className="font-bold text-lg text-gray-900">
              Novo Cliente {actionName === "Vendido" && "- Venda de Lote"}
            </h3>
            <p className="text-xs text-gray-500">
              Lot {lot.number} - Quadra {lot.block} ({actionName})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <form
            id="customer-form"
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            {/* DADOS DO CLIENTE */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-gray-900 border-b pb-1">
                DADOS DO CLIENTE
              </h4>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  placeholder="Ex: João da Silva"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    CPF / CNPJ
                  </label>
                  <input
                    type="text"
                    value={formData.cpf_cnpj}
                    onChange={(e) =>
                      setFormData({ ...formData, cpf_cnpj: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    RG
                  </label>
                  <input
                    type="text"
                    value={formData.rg}
                    onChange={(e) =>
                      setFormData({ ...formData, rg: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    placeholder="00.000.000-0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Telefone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    placeholder="joao@exemplo.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Profissão
                  </label>
                  <input
                    type="text"
                    value={formData.profession}
                    onChange={(e) =>
                      setFormData({ ...formData, profession: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    placeholder="Ex: Empresário"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Estado Civil
                  </label>
                  <select
                    value={formData.civil_state}
                    onChange={(e) =>
                      setFormData({ ...formData, civil_state: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  >
                    <option value="">Selecione...</option>
                    <option value="Solteiro(a)">Solteiro(a)</option>
                    <option value="Casado(a)">Casado(a)</option>
                    <option value="Divorciado(a)">Divorciado(a)</option>
                    <option value="Viúvo(a)">Viúvo(a)</option>
                    <option value="União Estável">União Estável</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Endereço (Rua e Número)
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  placeholder="Rua Exemplo, 123"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Bairro
                  </label>
                  <input
                    type="text"
                    value={formData.neighborhood}
                    onChange={(e) =>
                      setFormData({ ...formData, neighborhood: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    placeholder="Bairro"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Cidade
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    placeholder="Ex: São Paulo"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    UF
                  </label>
                  <input
                    type="text"
                    value={formData.state_uf}
                    onChange={(e) =>
                      setFormData({ ...formData, state_uf: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    CEP
                  </label>
                  <input
                    type="text"
                    value={formData.zip_code}
                    onChange={(e) =>
                      setFormData({ ...formData, zip_code: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    placeholder="00000-000"
                  />
                </div>
              </div>
            </div>

            {/* DADOS DA VENDA */}
            {actionName === "Vendido" && (
              <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                <h4 className="text-sm font-bold text-gray-900 border-b pb-1">
                  DADOS DA VENDA
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Valor do Lote
                    </label>
                    <input
                      readOnly
                      type="text"
                      value={new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(price)}
                      className="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Forma de Pagamento
                    </label>
                    <select
                      value={formData.payment_type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          payment_type: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    >
                      <option value="À vista">À vista</option>
                      <option value="Parcelado">Parcelado</option>
                    </select>
                  </div>
                </div>

                {formData.payment_type === "À vista" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4 border-gray-200 mt-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Desconto (R$)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.discount_value}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            discount_value: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Valor Final
                      </label>
                      <input
                        readOnly
                        type="text"
                        value={new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(finalValue)}
                        className="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-sm text-green-700 font-bold cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Data de Vencimento *
                      </label>
                      <input
                        type="date"
                        required={
                          actionName === "Vendido" &&
                          formData.payment_type === "À vista"
                        }
                        value={formData.down_payment_due_date}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            down_payment_due_date: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      />
                    </div>
                  </div>
                )}

                {formData.payment_type === "Parcelado" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4 border-gray-200 mt-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Valor da Entrada (R$)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.down_payment}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            down_payment: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Venc. Entrada
                      </label>
                      <input
                        type="date"
                        required={
                          actionName === "Vendido" &&
                          formData.payment_type === "Parcelado" &&
                          downPayment > 0
                        }
                        value={formData.down_payment_due_date}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            down_payment_due_date: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Qtd de Parcelas *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required={
                          actionName === "Vendido" &&
                          formData.payment_type === "Parcelado"
                        }
                        value={formData.installments_count}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            installments_count: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Vencimento 1ª Parcela *
                      </label>
                      <input
                        type="date"
                        required={
                          actionName === "Vendido" &&
                          formData.payment_type === "Parcelado"
                        }
                        value={formData.first_installment_due_date}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            first_installment_due_date: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2 mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-blue-900">
                        Valor de cada parcela:
                      </span>
                      <span className="text-base font-bold text-blue-800">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(installmentValue)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        <div className="sticky bottom-0 z-20 p-4 pb-8 sm:pb-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-3 bg-white flex-none shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-1/2 px-4 py-3 sm:py-2 flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200 font-semibold rounded-lg transition-colors text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="customer-form"
            disabled={submitting}
            className={`w-full sm:w-1/2 px-4 py-3 sm:py-2 text-white font-semibold rounded-lg transition-colors text-sm flex items-center justify-center gap-2 ${actionName === "Reservado" ? "bg-yellow-500 hover:bg-yellow-600" : "bg-green-600 hover:bg-green-700"}`}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : actionName === "Vendido" ? (
              "Confirmar Venda"
            ) : (
              "Confirmar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function LotPopupContent({
  lot,
  onAction,
  onRequestCustomerForm,
  onRequestClear,
  actionLoading,
}: {
  lot: any;
  onAction: (lot: any, action: string, newPrice?: number) => void;
  onRequestCustomerForm: (lot: any, action: string, newPrice: number) => void;
  onRequestClear: (lot: any, newPrice: number) => void;
  actionLoading: string | null;
}) {
  const [editedPrice, setEditedPrice] = useState(lot.price.toString());
  const color = getStatusColor(lot.status);
  const isSold = isLotSold(lot.status);

  const area = lot.area || 0;
  const currentPrice = Number(editedPrice) || 0;
  const displayNum =
    String(lot.number)
      .replace(/[^0-9A-Za-z]/g, "")
      .replace(/.*linha.*/i, "")
      .replace(/.*kml.*/i, "") || String(lot.number).replace(/\D/g, "");

  const handlePriceBlur = () => {
    if (Number(editedPrice) !== lot.price) {
      onAction(lot, lot.status, Number(editedPrice));
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
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-[10px]">Fundo:</span>{" "}
              <span className="text-gray-900 text-[11px] font-medium w-16 text-right">
                {lot.fundo !== null && lot.fundo !== undefined
                  ? `${Number(lot.fundo).toFixed(2)} m`
                  : "--"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-[10px]">Lado Dir:</span>{" "}
              <span className="text-gray-900 text-[11px] font-medium w-16 text-right">
                {lot.lado_direito !== null && lot.lado_direito !== undefined
                  ? `${Number(lot.lado_direito).toFixed(2)} m`
                  : "--"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-[10px]">Lado Esq:</span>{" "}
              <span className="text-gray-900 text-[11px] font-medium w-16 text-right">
                {lot.lado_esquerdo !== null && lot.lado_esquerdo !== undefined
                  ? `${Number(lot.lado_esquerdo).toFixed(2)} m`
                  : "--"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center pt-1">
          <span className="text-gray-600 font-semibold">
            Valor do Lote (R$):
          </span>
          <input
            type="number"
            value={editedPrice}
            onChange={(e) => setEditedPrice(e.target.value)}
            onBlur={handlePriceBlur}
            className="w-24 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-blue-500 font-mono text-right"
          />
        </div>
      </div>

      <div className="mb-2">
        <span className="text-sm font-semibold text-gray-800">
          Ações de comercial
        </span>
        <div className="flex gap-1 mt-1">
          <button
            onClick={() => {
               if (isSold) {
                 onRequestClear(lot, Number(editedPrice));
               } else {
                 onAction(lot, "Disponível", Number(editedPrice));
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
              onRequestCustomerForm(lot, "Reservado", Number(editedPrice));
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
              onRequestCustomerForm(lot, "Vendido", Number(editedPrice))
            }}
            disabled={actionLoading === lot.id || isSold}
            title={isSold ? "Este lote já está vendido" : "Vender lote"}
            className={`flex-1 text-[10px] font-bold py-2 rounded transition-colors ${isSold ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
          >
            Vender
          </button>
          <button
            onClick={() => onRequestClear(lot, Number(editedPrice))}
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

export default function GISMap({
  projectId,
  activeLayer = "satellite",
  gpsActive = false,
  measureActive = false,
  refreshKey = 0,
  streetGuides = [],
  streetGuidesVisible = true,
  drawStreetActive = false,
  onSaveStreetGuide,
  onDeleteStreetGuide,
}: {
  projectId?: string;
  activeLayer?: "streets" | "satellite" | "dark";
  gpsActive?: boolean;
  measureActive?: boolean;
  refreshKey?: number;
  streetGuides?: any[];
  streetGuidesVisible?: boolean;
  drawStreetActive?: boolean;
  onSaveStreetGuide?: (latlngs: L.LatLng[]) => void;
  onDeleteStreetGuide?: (id: string) => void;
}) {
  const { user } = useAuth();
  const [center] = useState<[number, number]>([-1.4553, -48.4892]);
  const [lots, setLots] = useState<any[]>([]);
  const [blocksData, setBlocksData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // States para Medição (Measure Tool)
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([]);
  const [measureClosed, setMeasureClosed] = useState(false);
  const [measureStr, setMeasureStr] = useState<string>("");

  // Formulário de Cliente
  const [customerForm, setCustomerForm] = useState<{
    lot: any;
    action: string;
    price: number;
  } | null>(null);

  // Clear Confirm Modal
  const [clearConfirmModal, setClearConfirmModal] = useState<{
    lot: any;
    price: number;
  } | null>(null);

  // Draw street state
  const [drawStreetPoints, setDrawStreetPoints] = useState<L.LatLng[]>([]);

  useEffect(() => {
    async function loadLots() {
      if (!user || !projectId) return;
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
          const parsedBlocks = blocksRes.data
            .map((b) => {
              let bounds: [number, number][] = [];
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
              }
              return {
                id: b.id,
                block: b.block_name || b.name || "?",
                projectName: b.projects?.name || "?",
                customerName: b.customers?.name || null,
                customerId: b.customer_id || null,
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
                frente: b.frente || null,
                fundo: b.fundo || null,
                lado_direito: b.lado_direito || null,
                lado_esquerdo: b.lado_esquerdo || null,
              };
            })
            .filter((b) => b.bounds.length > 0);
          setLots(parsedBlocks.filter((b) => b.geometryType === "Polygon"));
          // Separando os dados de bloco caso o componente espere 'blocksData' e 'lots'
          setBlocksData(
            parsedBlocks.filter((b) => b.geometryType === "LineString"),
          );
        }
      } catch (e) {
        console.error("Error loading map geometries:", e);
      } finally {
        setLoading(false);
      }
    }

    loadLots();

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
    alert("FUNÇÃO REAL DE VENDA CHAMADA");
    if (!user) return;

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

    try {
      // Upsert Customer (verify by cpf_cnpj)
      const cpfCnpjValue = customerData.cpf_cnpj?.trim()
        ? customerData.cpf_cnpj.trim()
        : null;
      const nameUpper = customerData.name?.trim().toUpperCase() || "";
      const emailUpper = customerData.email?.trim().toUpperCase() || "";
      const addressUpper = customerData.address?.trim().toUpperCase() || "";
      const phoneClean = customerData.phone?.trim() || "";

      let customerId = null;
      let clientId = null;

      if (cpfCnpjValue) {
        let customerCheckQuery = supabase
          .from("customers")
          .select("id")
          .eq("document", cpfCnpjValue);

        if (user.role !== "SUPER_ADMIN" && user.tenant_id) {
          customerCheckQuery = customerCheckQuery.eq("tenant_id", user.tenant_id);
        }

        const { data: existingCustomer } = await customerCheckQuery.maybeSingle();

        if (existingCustomer) customerId = existingCustomer.id;

        let clientCheckQuery = supabase
          .from("clients")
          .select("id")
          .eq("cpf_cnpj", cpfCnpjValue);

        if (user.role !== "SUPER_ADMIN" && user.tenant_id) {
          clientCheckQuery = clientCheckQuery.eq("tenant_id", user.tenant_id);
        }

        const { data: existingClient } = await clientCheckQuery.maybeSingle();

        if (existingClient) clientId = existingClient.id;
      }

      const customerPayload = {
        name: nameUpper,
        cpf_cnpj: cpfCnpjValue,
        document: cpfCnpjValue,
        phone: phoneClean,
        email: emailUpper,
        rg: customerData.rg?.trim() || null,
        profession: customerData.profession?.trim() || null,
        marital_status: customerData.civil_state?.trim() || null,
        civil_state: customerData.civil_state?.trim() || null,
        address: addressUpper,
        neighborhood: customerData.neighborhood?.trim().toUpperCase() || null,
        city: customerData.city?.trim().toUpperCase() || null,
        state: customerData.state_uf?.trim().toUpperCase() || null,
        state_uf: customerData.state_uf?.trim().toUpperCase() || null,
        cep: customerData.zip_code?.trim() || null,
        zip_code: customerData.zip_code?.trim() || null,
        status: 'ativo',
        company_id: finalTenantId,
        project_id: finalProjectId,
      };

      if (!customerId) {
        console.log("CUSTOMER_CREATED_OR_FOUND: Creating new");
        const { data: newCustomer, error: custError } = await supabase
          .from("customers")
          .insert([
            {
              ...(user.tenant_id || lot.tenant_id
                ? { tenant_id: user.tenant_id || lot.tenant_id }
                : {}),
              ...customerPayload,
            },
          ])
          .select("id")
          .single();

        if (custError) {
           console.error("Error creating customer:", custError);
           // Fallback to minimal payload if schema complains
           const minimalPayload = {
              name: nameUpper,
              cpf_cnpj: cpfCnpjValue,
              document: cpfCnpjValue,
              phone: phoneClean,
              email: emailUpper,
              address: addressUpper,
              tenant_id: user.tenant_id || lot.tenant_id,
              company_id: finalTenantId,
              project_id: finalProjectId,
              status: 'ativo'
           };
           const { data: fbCustomer, error: fbErr } = await supabase.from("customers").insert([minimalPayload]).select('id').single();
           if(fbCustomer) customerId = fbCustomer.id;
        }
        else if (newCustomer) {
            customerId = newCustomer.id;
        }
      } else {
        console.log("CUSTOMER_CREATED_OR_FOUND: Found existing", customerId);
        const { error: updErr } = await supabase
          .from("customers")
          .update(customerPayload)
          .eq("id", customerId);
          
        if(updErr) {
           console.error("Error updating existing customer:", updErr);
           const minimalPayload = {
              name: nameUpper,
              cpf_cnpj: cpfCnpjValue,
              document: cpfCnpjValue,
              phone: phoneClean,
              email: emailUpper,
              address: addressUpper,
              company_id: finalTenantId,
              project_id: finalProjectId,
              status: 'ativo'
           };
           await supabase.from("customers").update(minimalPayload).eq("id", customerId);
        }
      }

      if(!customerId) {
        alert("Erro fatal: Cliente não pôde ser criado nem localizado. A venda será abortada.");
        return;
      }

      if (!clientId) {
        const { data: newClient, error: clientErr } = await supabase
          .from("clients")
          .insert([
            {
              ...(user.tenant_id || lot.tenant_id
                ? { tenant_id: user.tenant_id || lot.tenant_id }
                : {}),
              full_name: nameUpper,
              cpf_cnpj: cpfCnpjValue,
              phone: phoneClean,
              email: emailUpper,
              rg: customerData.rg?.trim() || null,
              profession: customerData.profession?.trim() || null,
              civil_state: customerData.civil_state?.trim() || null,
              address: addressUpper,
              neighborhood:
                customerData.neighborhood?.trim().toUpperCase() || null,
              city: customerData.city?.trim().toUpperCase() || null,
              state_uf: customerData.state_uf?.trim().toUpperCase() || null,
              zip_code: customerData.zip_code?.trim() || null,
            },
          ])
          .select("id")
          .single();

        if (!clientErr && newClient) clientId = newClient.id;
      } else {
        await supabase
          .from("clients")
          .update({
            full_name: nameUpper,
            cpf_cnpj: cpfCnpjValue,
            phone: phoneClean,
            email: emailUpper,
            rg: customerData.rg?.trim() || null,
            profession: customerData.profession?.trim() || null,
            civil_state: customerData.civil_state?.trim() || null,
            address: addressUpper,
            neighborhood:
              customerData.neighborhood?.trim().toUpperCase() || null,
            city: customerData.city?.trim().toUpperCase() || null,
            state_uf: customerData.state_uf?.trim().toUpperCase() || null,
            zip_code: customerData.zip_code?.trim() || null,
          })
          .eq("id", clientId);
      }

      let newSaleData: any = null;
      let newContractData: any = null;

      if (newStatus.toLowerCase().trim() === "vendido") {
        console.log("INICIO POS VENDA COMPLETAMENTE TRANSACIONAL");

        try {
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
            broker_id: user?.role === 'BROKER' ? user.id : null,
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
          const downPayment = customerData.down_payment || 0;
          const instCount = Math.max(1, customerData.installments_count || 1);
          const fValue = customerData.final_value || finalPrice;

          if (pmtType === "À vista") {
            financePayloads.push({
              tenant_id: finalTenantId,
              company_id: finalTenantId,
              sale_id: saleId,
              customer_id: customerId,
              broker_id: user?.role === 'BROKER' ? user.id : null,
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
            if (downPayment > 0 && customerData.down_payment_due_date) {
              financePayloads.push({
                tenant_id: finalTenantId,
                company_id: finalTenantId,
                sale_id: saleId,
                customer_id: customerId,
                broker_id: user?.role === 'BROKER' ? user.id : null,
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
                  broker_id: user?.role === 'BROKER' ? user.id : null,
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

          const contractHtml = generateContractHTML({
            tenant: tenantData || {},
            customer: fullCustomer || {},
            project: projDataSnapshot || lot.projects || {},
            block: lot,
            sale: enrichedSaleData,
            contractSnapshot: contractPayloadPartial,
          });

          const contractPayload = {
            tenant_id: finalTenantId,
            company_id: finalTenantId,
            sale_id: saleId,
            customer_id: customerId,
            broker_id: user?.role === 'BROKER' ? user.id : null,
            project_id: lot.project_id || null,
            block_id: lot.id,
            contract_number: `CTR-${Date.now()}`,
            generated_html: contractHtml,
            ...contractPayloadPartial,
            status: "ativo",
          };

          console.log("CONTRACT_CREATED");
          const { data: contractData, error: contractError } = await supabase
            .from("contracts")
            .insert([contractPayload])
            .select()
            .single();

          if (contractError || !contractData) {
            console.error("ERRO CONTRACT", contractError);
            throw contractError || new Error("Falha ao criar contrato");
          }
          console.log("CUSTOMER_ID_LINKED_TO_CONTRACT");
          newContractData = contractData;

          // Atualizar BLOCO imediatamente antes da comissão garantindo atomicidade logica da venda
          console.log("BLOCK_MARKED_SOLD");
          const { error: blockUpdErr } = await supabase
            .from("blocks")
            .update({
              status: "Vendido",
              price: finalPrice,
              customer_id: customerId,
              sale_id: saleId,
              contract_id: contractData.id,
              broker_id: user?.role === 'BROKER' ? user.id : null
            })
            .eq("id", lot.id);
            
          if (blockUpdErr) {
             console.error("ERRO AO ATUALIZAR STATUS DO LOTE", blockUpdErr);
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
                    broker_id: user.id,
                    sale_id: saleId,
                    contract_id: contractData.id,
                    customer_id: customerId || clientId,
                    amount_sale: saleVal,
                    commission_percent: pct,
                    commission_value: cv,
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

        } catch (err: any) {
           console.error("Erro no fluxo de venda:", err);
           throw new Error("Erro na venda completa: " + (err.message || JSON.stringify(err)));
        }
      } else {
        // Reservas e Disponível
        let expirationTime = null;
        if (newStatus === "Reservado") {
           const d = new Date();
           d.setHours(d.getHours() + 48); // Reserva válida por 48h
           expirationTime = d.toISOString();
        }

        console.log("BLOCK_MARKED_RESERVED_OR_AVAILABLE");
        const { error: updateError } = await supabase
          .from("blocks")
          .update({
            status: newStatus,
            price: finalPrice,
            customer_id: customerId,
            broker_id: user?.role === 'BROKER' ? user.id : null,
            reservation_expires_at: expirationTime,
            reservation_date: newStatus === "Reservado" ? new Date().toISOString() : null,
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
               broker_id: user?.role === 'BROKER' ? user.id : null,
               block_id: lot.id,
               customer_id: customerId,
               expiration_time: expirationTime,
               status: 'active'
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
        <MapController lots={lots} blocksData={blocksData} />
        <LocationController active={gpsActive} />

        {lots
          .filter((lot) => lot.bounds.length > 0)
          .map((lot) => {
            const color = getStatusColor(lot.status);
            const displayNum =
              String(lot.number)
                .replace(/[^0-9A-Za-z]/g, "")
                .replace(/.*linha.*/i, "")
                .replace(/.*kml.*/i, "") ||
              String(lot.number).replace(/\D/g, "");

            return (
              <Polygon
                key={lot.id}
                positions={lot.bounds}
                interactive={!(drawStreetActive || measureActive)}
                pathOptions={{
                  color: "#000000",
                  fillColor: getStatusColor(lot.status),
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
                {displayNum && displayNum !== "0" && (
                  <Tooltip
                    permanent
                    direction="center"
                    className="bg-transparent border-0 shadow-none text-white font-bold text-[11px]"
                    opacity={1}
                  >
                    <div
                      style={{ textShadow: "1px 1px 2px black, 0 0 1em black" }}
                    >
                      Lote {displayNum}
                    </div>
                  </Tooltip>
                )}
                <Popup>
                  <LotPopupContent
                    lot={lot}
                    onAction={handleLotAction}
                    onRequestCustomerForm={(l, a, p) =>
                      setCustomerForm({ lot: l, action: a, price: p })
                    }
                    onRequestClear={(l, p) => setClearConfirmModal({ lot: l, price: p })}
                    actionLoading={actionLoading}
                  />
                </Popup>
              </Polygon>
            );
          })}

        {blocksData.map((block) => {
          const displayNum =
            String(block.number)
              .replace(/[^0-9A-Za-z]/g, "")
              .replace(/.*linha.*/i, "")
              .replace(/.*kml.*/i, "") ||
            String(block.number).replace(/\D/g, "");

          return (
            <Polygon
              key={`block-${block.id}`}
              positions={block.bounds}
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
              {displayNum && displayNum !== "0" && (
                <Tooltip
                  permanent
                  direction="center"
                  className="bg-transparent border-0 shadow-none text-white font-bold text-[11px]"
                  opacity={1}
                >
                  <div
                    style={{ textShadow: "1px 1px 2px black, 0 0 1em black" }}
                  >
                    Lote {displayNum}
                  </div>
                </Tooltip>
              )}
              <Popup>
                <LotPopupContent
                  lot={block}
                  onAction={handleLotAction}
                  onRequestCustomerForm={(l, a, p) =>
                    setCustomerForm({ lot: l, action: a, price: p })
                  }
                  onRequestClear={(l, p) => setClearConfirmModal({ lot: l, price: p })}
                  actionLoading={actionLoading}
                />
              </Popup>
            </Polygon>
          );
        })}

        {streetGuidesVisible &&
          streetGuides.map((guide) => {
            if (!guide.geometry_geojson || !guide.geometry_geojson.coordinates)
              return null;
            const pts = guide.geometry_geojson.coordinates.map((c: any[]) => [
              c[1],
              c[0],
            ]); // GeoJSON is [lng, lat], Leaflet is [lat, lng]
            return (
              <Polyline
                key={`guide-${guide.id}`}
                positions={pts}
                pathOptions={{
                  color: "#10b981",
                  weight: 4,
                  dashArray: "10, 10",
                }}
              >
                <Tooltip direction="top" sticky>
                  Linha-Guia: {guide.name}
                </Tooltip>
                <Popup>
                  <div className="p-2 space-y-2 font-sans font-medium">
                    <p className="text-gray-900 mb-2">
                      <strong>Linha de Rua</strong>
                    </p>
                    <p className="text-sm text-gray-700">{guide.name}</p>
                    {onDeleteStreetGuide && (
                      <button
                        onClick={() => onDeleteStreetGuide(guide.id)}
                        className="w-full flex items-center justify-center gap-2 p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded text-xs transition-colors"
                      >
                        <Trash2 className="w-4 h-4" /> Apagar Linha
                      </button>
                    )}
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
            if (onSaveStreetGuide) onSaveStreetGuide(line);
          }}
        />
      </MapContainer>

      {/* Floating Panel for Measurement/Drawing */}
      {drawStreetActive && (
        <div className="absolute top-16 md:top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-auto bg-emerald-600/90 backdrop-blur-sm border border-emerald-500 rounded-xl md:rounded-full px-4 py-2 shadow-lg flex fade-in-up w-auto min-w-[200px] text-center">
          <span className="text-[11px] md:text-sm font-bold text-white tracking-wider mx-auto">
            {drawStreetPoints.length === 0
              ? "Clique no primeiro ponto da rua"
              : "Clique no segundo ponto da rua"}
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

      {customerForm && (
        <CustomerFormModal
          lot={customerForm.lot}
          actionName={customerForm.action}
          price={customerForm.price}
          onClose={() => setCustomerForm(null)}
          onConfirm={async (data) => {
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
