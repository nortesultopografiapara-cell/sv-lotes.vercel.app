'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Popup, useMap, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Layers, Map as MapIcon } from 'lucide-react';

// FAKE GEOJSON DATA FOR THE SAKE OF PREVIEW
// In a real scenario, this would come from Supabase.
const MOCK_LOTS = [
  { id: '1', block: 'A', number: '01', status: 'AVAILABLE', area: 250, price: 150000, bounds: [[-1.4550, -48.4900], [-1.4550, -48.4895], [-1.4545, -48.4895], [-1.4545, -48.4900]] as [number, number][] },
  { id: '2', block: 'A', number: '02', status: 'RESERVED', area: 250, price: 150000, bounds: [[-1.4550, -48.4895], [-1.4550, -48.4890], [-1.4545, -48.4890], [-1.4545, -48.4895]] as [number, number][] },
  { id: '3', block: 'A', number: '03', status: 'SOLD', area: 300, price: 180000, bounds: [[-1.4550, -48.4890], [-1.4550, -48.4885], [-1.4545, -48.4885], [-1.4545, -48.4890]] as [number, number][] },
  { id: '4', block: 'B', number: '01', status: 'AVAILABLE', area: 200, price: 120000, bounds: [[-1.4556, -48.4900], [-1.4556, -48.4896], [-1.4552, -48.4896], [-1.4552, -48.4900]] as [number, number][] },
  { id: '5', block: 'B', number: '02', status: 'AVAILABLE', area: 200, price: 120000, bounds: [[-1.4556, -48.4896], [-1.4556, -48.4892], [-1.4552, -48.4892], [-1.4552, -48.4896]] as [number, number][] },
  { id: '6', block: 'B', number: '03', status: 'SOLD', area: 200, price: 120000, bounds: [[-1.4556, -48.4892], [-1.4556, -48.4888], [-1.4552, -48.4888], [-1.4552, -48.4892]] as [number, number][] }
];

const getStatusColor = (status: string) => {
  switch(status) {
    case 'AVAILABLE': return '#22C55E';
    case 'RESERVED': return '#EAB308';
    case 'SOLD': return '#EF4444';
    default: return '#A1A1AA';
  }
};

const getStatusLabel = (status: string) => {
  switch(status) {
    case 'AVAILABLE': return 'DISPONÍVEL';
    case 'RESERVED': return 'RESERVADO';
    case 'SOLD': return 'VENDIDO';
    default: return 'DESCONHECIDO';
  }
};

function MapController() {
  const map = useMap();
  useEffect(() => {
    // Optionally fit bounds based on lots
    if (MOCK_LOTS.length > 0) {
      const bounds = L.latLngBounds(MOCK_LOTS[0].bounds);
      MOCK_LOTS.forEach(lot => bounds.extend(L.latLngBounds(lot.bounds)));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map]);
  return null;
}

export default function GISMap() {
  // Center roughly in Belém/Castanhal area for the mock
  const [center] = useState<[number, number]>([-1.4553, -48.4892]);
  const [activeLayer, setActiveLayer] = useState<'streets'|'satellite'>('satellite');

  return (
    <div className="w-full h-full relative">
      <MapContainer 
        center={center} 
        zoom={18} 
        className="w-full h-full"
        zoomControl={false}
      >
        {activeLayer === 'streets' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        )}

        <ZoomControl position="bottomright" />
        <MapController />

        {MOCK_LOTS.map((lot) => {
          const color = getStatusColor(lot.status);
          return (
            <Polygon 
              key={lot.id}
              positions={lot.bounds}
              pathOptions={{ 
                color: color, 
                fillColor: color, 
                fillOpacity: lot.status === 'AVAILABLE' ? 0.3 : 0.6,
                weight: 2
              }}
              eventHandlers={{
                mouseover: (e) => {
                  const layer = e.target;
                  layer.setStyle({
                    fillOpacity: 0.8,
                    weight: 3
                  });
                },
                mouseout: (e) => {
                  const layer = e.target;
                  layer.setStyle({
                    fillOpacity: lot.status === 'AVAILABLE' ? 0.3 : 0.6,
                    weight: 2
                  });
                }
              }}
            >
              <Popup>
                <div className="p-1 min-w-[180px]">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-bold text-white text-lg">Lote {lot.number}</span>
                    <span className="text-[10px] font-mono uppercase bg-[var(--color-surface-dim)] px-2 py-1 rounded">
                      Quadra {lot.block}
                    </span>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--color-text-muted)]">Área total:</span>
                      <span className="font-mono text-white">{lot.area} m²</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--color-text-muted)]">Valor:</span>
                      <span className="font-mono text-white">R$ {lot.price.toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="flex justify-between text-sm items-center mt-2 pt-2 border-t border-[var(--color-border)]">
                      <span className="text-[var(--color-text-muted)]">Status:</span>
                      <span className="font-mono text-xs font-bold px-2 py-1 rounded" style={{ backgroundColor: `${color}20`, color: color }}>
                        {getStatusLabel(lot.status)}
                      </span>
                    </div>
                  </div>

                  {lot.status === 'AVAILABLE' && (
                    <button className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-bold py-2 rounded transition-colors">
                      Reservar Lote
                    </button>
                  )}
                  {lot.status === 'RESERVED' && (
                    <button className="w-full bg-[var(--color-success)] hover:bg-[#16a34a] text-white text-sm font-bold py-2 rounded transition-colors">
                      Efetivar Venda
                    </button>
                  )}
                  {lot.status === 'SOLD' && (
                    <button className="w-full bg-[var(--color-surface-dim)] text-[var(--color-text-muted)] hover:text-white border border-[var(--color-border)] text-sm font-bold py-2 rounded transition-colors">
                      Ver Contrato
                    </button>
                  )}
                </div>
              </Popup>
            </Polygon>
          );
        })}
      </MapContainer>

      {/* Layer Control Custom */}
      <div className="absolute bottom-6 left-4 md:left-[110px] z-[400]">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] p-1 rounded-lg flex shadow-lg">
          <button 
            onClick={() => setActiveLayer('satellite')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-colors flex items-center gap-2 ${activeLayer === 'satellite' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-white'}`}
          >
            <Layers className="w-4 h-4" /> Satélite
          </button>
          <button 
            onClick={() => setActiveLayer('streets')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-colors flex items-center gap-2 ${activeLayer === 'streets' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-white'}`}
          >
            <MapIcon className="w-4 h-4" /> Ruas
          </button>
        </div>
      </div>
    </div>
  );
}
