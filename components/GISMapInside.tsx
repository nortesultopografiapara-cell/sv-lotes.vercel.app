'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Popup, Tooltip, useMapEvents, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { getSupabase } from '@/lib/supabase';
import { calibrateDistance, calibrateArea } from '@/utils/measurementCalibration';
import { calculateLotDimensions, CalibratedLotData } from '@/utils/calculateLotDimensions';
import { MapPin, Ruler, Layers, Eye, RefreshCw, ZoomIn, Search } from 'lucide-react';

// Reset Leaflet icon paths
const setupIcons = () => {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-shadow.png',
  });
};

interface GISMapInsideProps {
  onSelectLot: (lot: any, calData: CalibratedLotData) => void;
  selectedLotId: string | null;
  lots: any[];
  isLoading: boolean;
  onRefresh: () => void;
}

export default function GISMapInside({
  onSelectLot,
  selectedLotId,
  lots,
  isLoading,
  onRefresh
}: GISMapInsideProps) {
  useEffect(() => {
    setupIcons();
  }, []);

  const [mapCenter] = useState<[number, number]>([-6.1835, -49.888]);
  const [mapType, setMapType] = useState<'streets' | 'satellite'>('satellite');
  const [rulerActive, setRulerActive] = useState<boolean>(false);
  const [rulerPoints, setRulerPoints] = useState<L.LatLng[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Styles for lot polygons based on status
  const getLotStyle = (status: string, isSelected: boolean) => {
    const isVendido = status?.toLowerCase() === 'vendido';
    const isReservado = status?.toLowerCase() === 'reservado';

    return {
      fillColor: isVendido ? '#ef4444' : isReservado ? '#eab308' : '#22c55e',
      fillOpacity: isSelected ? 0.6 : 0.35,
      color: isSelected ? '#3b82f6' : isVendido ? '#b91c1c' : isReservado ? '#a16207' : '#15803d',
      weight: isSelected ? 3 : 1.5,
      dashArray: isSelected ? '' : '3',
    };
  };

  // Map click handler for custom Ruler Utility
  function RulerHandler() {
    useMapEvents({
      click(e) {
        if (!rulerActive) return;
        setRulerPoints(prev => [...prev, e.latlng]);
      }
    });
    return null;
  }

  // Calculate Ruler Segments and Calibrate
  const getRulerMeasurements = () => {
    if (rulerPoints.length < 2) return { segments: [], total: 0, totalCalibrated: 0 };
    const segments: { p1: L.LatLng, p2: L.LatLng, raw: number, calibrated: number }[] = [];
    let total = 0;
    let totalCalibrated = 0;

    for (let i = 0; i < rulerPoints.length - 1; i++) {
      const p1 = rulerPoints[i];
      const p2 = rulerPoints[i + 1];
      // Geodesic distance approximation
      const rawDist = p1.distanceTo(p2);
      const calibratedDist = calibrateDistance(rawDist);
      segments.push({ p1, p2, raw: rawDist, calibrated: calibratedDist });
      total += rawDist;
      totalCalibrated += calibratedDist;
    }

    return { segments, total, totalCalibrated };
  };

  const { segments: rulerSegments, total: rulerTotal, totalCalibrated: rulerTotalCalibrated } = getRulerMeasurements();

  // Filter lots based on query
  const filteredLots = lots.filter(lot => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const lNum = lot.lot_number || '';
    const bName = lot.block_name || '';
    return lNum.toLowerCase().includes(q) || bName.toLowerCase().includes(q) || `lote ${lNum}`.includes(q) || `quadra ${bName}`.includes(q);
  });

  return (
    <div className="relative w-full h-[550px] shadow-inner border border-slate-200 rounded-xl overflow-hidden bg-slate-100">
      {/* Search Bar / Map Overlay Controls */}
      <div className="absolute top-4 left-4 z-[999] flex flex-wrap gap-2 max-w-[calc(100%-2rem)]">
        <div className="flex bg-white/95 backdrop-blur shadow-md rounded-lg overflow-hidden border border-slate-200">
          <div className="flex items-center px-3 text-slate-400 bg-white border-r border-slate-100">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Localizar Lote ou Quadra..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 text-sm text-slate-800 bg-white placeholder-slate-400 outline-none w-52 focus:w-64 transition-all duration-300"
          />
        </div>

        {/* Layer Toggler */}
        <button
          onClick={() => setMapType(mapType === 'streets' ? 'satellite' : 'streets')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white/95 backdrop-blur hover:bg-slate-50 text-slate-700 rounded-lg shadow-md border border-slate-200 transition-all"
        >
          <Layers className="w-3.5 h-3.5 text-slate-500" />
          <span>{mapType === 'streets' ? 'Satélite' : 'Mapa'}</span>
        </button>

        {/* Ruler Toggler */}
        <button
          onClick={() => {
            setRulerActive(!rulerActive);
            setRulerPoints([]);
          }}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg shadow-md border transition-all ${
            rulerActive
              ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
              : 'bg-white/95 backdrop-blur hover:bg-slate-50 text-slate-700 border-slate-200'
          }`}
        >
          <Ruler className={`w-3.5 h-3.5 ${rulerActive ? 'text-white' : 'text-slate-500'}`} />
          <span>Régua {rulerActive ? 'Ativa' : 'Métrica'}</span>
        </button>

        {rulerActive && (
          <button
            onClick={() => setRulerPoints([])}
            className="px-2.5 py-2 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-md transition-all"
          >
            Limpar Régua
          </button>
        )}

        {/* Reload */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 bg-white/95 backdrop-blur hover:bg-slate-100 text-slate-600 disabled:opacity-50 rounded-lg shadow-md border border-slate-200 transition-all"
          title="Recarregar dados"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Ruler floating metrics card */}
      {rulerActive && rulerPoints.length > 0 && (
        <div className="absolute bottom-4 left-4 z-[999] bg-slate-900/95 backdrop-blur text-white p-4 rounded-xl shadow-xl max-w-sm border border-slate-705 font-mono text-xs shadow-slate-900/30">
          <h4 className="font-sans font-bold text-sm text-slate-300 flex items-center gap-2 mb-2">
            <Ruler className="w-4 h-4 text-blue-400" />
            <span>Medição de Régua Calibrada</span>
          </h4>
          <div className="space-y-1 text-slate-300">
            <div>Pontos demarcados: <span className="text-white font-bold">{rulerPoints.length}</span></div>
            <div>Distância física geométrica: <span className="text-white">{rulerTotal.toFixed(2)} m</span></div>
            <div className="text-emerald-400 font-bold border-t border-slate-800 pt-1 mt-1 flex justify-between">
              <span>Distância real (Calibrada):</span>
              <span>{rulerTotalCalibrated.toFixed(2)} m</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 italic leading-tight">
              Fator calibrado aplicado de {GLOBAL_MEASUREMENT_FACTOR}
            </div>
          </div>
        </div>
      )}

      {/* Main Map Container */}
      <MapContainer
        center={mapCenter}
        zoom={16}
        className="w-full h-full"
      >
        <TileLayer
          url={
            mapType === 'streets'
              ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          }
          attribution={
            mapType === 'streets'
              ? '&copy; OpenStreetMap contributors'
              : 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
          }
        />

        <RulerHandler />

        {/* Render Ruler lines on active */}
        {rulerActive && rulerPoints.length > 0 && (
          <>
            <Polyline positions={rulerPoints} color="#2563eb" weight={3} dashArray="5, 10" />
            {rulerPoints.map((pt, idx) => (
              <Marker key={idx} position={pt} />
            ))}
          </>
        )}

        {/* Display Lot Polygons */}
        {filteredLots.map(lot => {
          if (!lot.geometry || !lot.geometry.coordinates || lot.geometry.type !== 'Polygon') return null;

          // Convert coordinates arrays into Leaflet LatLng points: [lat, lng]
          // GeoJSON coordinates are in [lng, lat]
          const ring = lot.geometry.coordinates[0];
          const positions: [number, number][] = ring.map((c: any) => [c[1], c[0]]);

          const isSelected = lot.id === selectedLotId;
          const polygonStyle = getLotStyle(lot.status, isSelected);

          // Calculate precise calibrated boundaries
          const rawClosedCoords: [number, number][] = ring;
          const lotMetrics = calculateLotDimensions(rawClosedCoords, {
            frente: lot.frente,
            fundo: lot.fundo,
            lado_direito: lot.lado_direito,
            lado_esquerdo: lot.lado_esquerdo
          }, lot);

          return (
            <Polygon
              key={lot.id}
              positions={positions}
              pathOptions={polygonStyle}
              eventHandlers={{
                click: () => {
                  if (rulerActive) return;
                  onSelectLot(lot, lotMetrics);
                },
              }}
            >
              {/* Map label: Lot Number & Calibrated Area */}
              <Tooltip sticky direction="top" className="bg-white/90 text-slate-900 border border-slate-200 px-2 py-1 rounded shadow-md text-xs font-semibold">
                <div className="font-bold flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-brand-500" />
                  Q{lot.block_name} - L{lot.lot_number}
                </div>
                <div className="text-[10px] text-emerald-600 font-bold font-mono">
                  Área Cal: {lotMetrics.calibrated.area.toFixed(2)} m²
                </div>
              </Tooltip>

              {/* Lot Popup with Raw vs Calibrated metrics */}
              <Popup className="custom-leaflet-popup">
                <div className="p-2 min-w-56 font-sans">
                  <div className="border-b border-slate-100 pb-1.5 mb-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block font-mono">
                      Amostra de Lote GIS
                    </span>
                    <h3 className="text-sm font-bold text-slate-800 m-0">
                      Lote {lot.lot_number} — Quadra {lot.block_name}
                    </h3>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="grid grid-cols-3 font-semibold text-slate-400 text-[10px] pb-1 border-b border-dashed border-slate-100">
                      <span>Rumo</span>
                      <span className="text-right">Original</span>
                      <span className="text-right text-emerald-600">Calibrado</span>
                    </div>

                    <div className="grid grid-cols-3 py-0.5">
                      <span className="text-slate-500">Frente:</span>
                      <span className="text-right text-slate-400 font-mono">{lotMetrics.raw.frente.toFixed(2)}m</span>
                      <span className="text-right text-emerald-600 font-bold font-mono">{lotMetrics.calibrated.frente.toFixed(2)}m</span>
                    </div>

                    <div className="grid grid-cols-3 py-0.5">
                      <span className="text-slate-500">Fundo:</span>
                      <span className="text-right text-slate-400 font-mono">{lotMetrics.raw.fundo.toFixed(2)}m</span>
                      <span className="text-right text-emerald-600 font-bold font-mono">{lotMetrics.calibrated.fundo.toFixed(2)}m</span>
                    </div>

                    <div className="grid grid-cols-3 py-0.5">
                      <span className="text-slate-500">L. Dir:</span>
                      <span className="text-right text-slate-400 font-mono">{lotMetrics.raw.lado_direito.toFixed(2)}m</span>
                      <span className="text-right text-emerald-600 font-bold font-mono">{lotMetrics.calibrated.lado_direito.toFixed(2)}m</span>
                    </div>

                    <div className="grid grid-cols-3 py-0.5">
                      <span className="text-slate-500">L. Esq:</span>
                      <span className="text-right text-slate-400 font-mono">{lotMetrics.raw.lado_esquerdo.toFixed(2)}m</span>
                      <span className="text-right text-emerald-600 font-bold font-mono">{lotMetrics.calibrated.lado_esquerdo.toFixed(2)}m</span>
                    </div>

                    <div className="grid grid-cols-3 border-t border-slate-100 pt-1.5 mt-1 font-bold">
                      <span className="text-slate-700">Área:</span>
                      <span className="text-right text-slate-400 font-mono">{lotMetrics.raw.area.toFixed(1)}m²</span>
                      <span className="text-right text-emerald-600 font-mono">{lotMetrics.calibrated.area.toFixed(2)}m²</span>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      lot.status?.toLowerCase() === 'vendido' 
                        ? 'bg-red-50 text-red-600' 
                        : lot.status?.toLowerCase() === 'reservado' 
                        ? 'bg-yellow-50 text-yellow-700' 
                        : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {lot.status || 'Disponível'}
                    </span>
                    <button
                      onClick={() => onSelectLot(lot, lotMetrics)}
                      className="text-[10px] text-blue-600 font-semibold hover:underline flex items-center gap-1"
                    >
                      Ver Memorial
                    </button>
                  </div>
                </div>
              </Popup>
            </Polygon>
          );
        })}
      </MapContainer>
    </div>
  );
}
export const GLOBAL_MEASUREMENT_FACTOR = 1.0;
export { calibrateDistance, calibrateArea };
