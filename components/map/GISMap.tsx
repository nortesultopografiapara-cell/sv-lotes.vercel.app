'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Popup, useMap, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Layers, Map as MapIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

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

function MapController({ lots }: { lots: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (lots.length > 0) {
      const bounds = L.latLngBounds(lots[0].bounds);
      lots.forEach(lot => {
         if (lot.bounds && lot.bounds.length > 0) {
            bounds.extend(L.latLngBounds(lot.bounds));
         }
      });
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, lots]);
  return null;
}

function LocationController({ active }: { active: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (active) {
      map.locate({ setView: true, maxZoom: 18, watch: true, enableHighAccuracy: true });
      map.on('locationfound', (e) => {
         // Could add a marker here for user position
      });
    } else {
      map.stopLocate();
    }
  }, [active, map]);
  return null;
}

export default function GISMap({ 
  projectId, 
  activeLayer = 'satellite',
  gpsActive = false,
  measureActive = false,
  refreshKey = 0
}: { 
  projectId?: string,
  activeLayer?: 'streets'|'satellite'|'dark',
  gpsActive?: boolean,
  measureActive?: boolean,
  refreshKey?: number
}) {
  const { user } = useAuth();
  const [center] = useState<[number, number]>([-1.4553, -48.4892]);
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    async function loadLots() {
      if (!user) return;
      try {
        let query = supabase.from('lots').select('*, blocks!inner(name, project_id, projects(name))');
        
        if (projectId) {
          query = query.eq('blocks.project_id', projectId);
        }
        
        if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
          query = query.eq('tenant_id', user.tenant_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        if (data) {
          const parsedLots = data.map(lot => {
            let bounds: [number, number][] = [];
            
            // Parse GeoJSON Polygon to Leaflet [lat, lng] array
            if (lot.geom && lot.geom.type === 'Polygon' && lot.geom.coordinates) {
              const coords = lot.geom.coordinates[0]; // exterior ring
              bounds = coords.map((c: number[]) => [c[1], c[0]]); // [lng, lat] -> [lat, lng]
            }

            return {
              id: lot.id,
              block: lot.blocks?.name || '?',
              projectName: lot.blocks?.projects?.name || '?',
              number: lot.number,
              status: lot.status,
              area: Number(lot.area),
              price: Number(lot.price),
              bounds
            };
          });
          
          setLots(parsedLots);
        }
      } catch (e) {
        console.error("Error loading map lots:", e);
      } finally {
        setLoading(false);
      }
    }
    
    loadLots();

    const channel = supabase.channel('realtime:lots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lots' }, () => {
         loadLots();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, projectId, refreshKey]);

  const handleLotAction = async (lot: any, action: 'RESERVE' | 'SELL') => {
    if (!user) return;
    setActionLoading(lot.id);
    const newStatus = action === 'RESERVE' ? 'RESERVED' : 'SOLD';
    
    try {
      const { error: updateError } = await supabase.from('lots')
        .update({ status: newStatus })
        .eq('id', lot.id);
        
      if (updateError) throw updateError;
      
      const title = action === 'RESERVE' 
        ? `Lote Quadra ${lot.block} Lote ${lot.number} reservado`
        : `Lote Quadra ${lot.block} Lote ${lot.number} vendido`;

      await supabase.from('logs').insert({
        tenant_id: user.tenant_id || lot.tenant_id,
        user_id: user.id,
        action: newStatus,
        details: {
          title,
          subtitle: `Ação no mapa por ${user.name}`
        }
      });
      
    } catch(e) {
      console.error("Action error:", e);
      alert("Erro ao realizar ação");
    } finally {
      setActionLoading(null);
    }
  };

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
        className="w-full h-full"
        zoomControl={false}
      >
        {activeLayer === 'streets' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        )}
        {activeLayer === 'satellite' && (
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        )}
        {activeLayer === 'dark' && (
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
        )}

        <ZoomControl position="bottomright" />
        <MapController lots={lots} />
        <LocationController active={gpsActive} />

        {lots.filter(lot => lot.bounds.length > 0).map((lot) => {
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
                  <div className="text-[11px] text-[var(--color-text-muted)] mb-2 font-bold uppercase tracking-wider">{lot.projectName}</div>
                  
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
                    <button 
                      onClick={() => handleLotAction(lot, 'RESERVE')}
                      disabled={actionLoading === lot.id}
                      className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-bold py-2 rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {actionLoading === lot.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reservar Lote'}
                    </button>
                  )}
                  {lot.status === 'RESERVED' && (
                    <button 
                      onClick={() => handleLotAction(lot, 'SELL')}
                      disabled={actionLoading === lot.id}
                      className="w-full bg-[var(--color-success)] hover:bg-[#16a34a] text-white text-sm font-bold py-2 rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {actionLoading === lot.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Efetivar Venda'}
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

    </div>
  );
}
