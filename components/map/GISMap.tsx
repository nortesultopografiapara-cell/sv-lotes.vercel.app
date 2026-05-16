'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Popup, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Layers, Map as MapIcon, Loader2, X, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

const getStatusColor = (status: string) => {
  switch(status) {
    case 'Disponível': return '#22C55E';
    case 'Reservado': return '#EAB308';
    case 'Vendido': return '#EF4444';
    default: return '#22C55E';
  }
};

const getStatusLabel = (status: string) => {
  switch(status) {
    case 'Disponível': return 'DISPONÍVEL';
    case 'Reservado': return 'RESERVADO';
    case 'Vendido': return 'VENDIDO';
    default: return 'DISPONÍVEL';
  }
};

function MapController({ lots, blocksData }: { lots: any[], blocksData: any[] }) {
  const map = useMap();
  useEffect(() => {
    let allBounds: [number, number][] = [];
    lots.forEach(l => {
       if (l.bounds) allBounds.push(...l.bounds);
    });
    blocksData.forEach(b => {
       if (b.bounds) allBounds.push(...b.bounds);
    });

    if (allBounds.length > 0) {
       map.fitBounds(L.latLngBounds(allBounds), { padding: [50, 50] });
    }
  }, [lots, blocksData, map]);
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

function MeasureInteraction({ 
  active, 
  points, 
  setPoints, 
  closed, 
  setClosed, 
  setStr 
}: { 
  active: boolean, 
  points: L.LatLng[], 
  setPoints: any, 
  closed: boolean, 
  setClosed: any, 
  setStr: any 
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
      }
  });

  useEffect(() => {
     if (!active) {
       setPoints([]);
       setClosed(false);
       setStr('');
     }
     
     if (active) {
         if (closed) {
            map.getContainer().style.cursor = 'default';
         } else {
            map.getContainer().style.cursor = 'crosshair';
         }
     } else {
         map.getContainer().style.cursor = 'grab'; // default leaflet
     }
  }, [active, closed, map, setPoints, setClosed, setStr]);

  useEffect(() => {
      if (points.length === 0) {
          setStr('');
          return;
      }
      let dist = 0;
      for (let i = 1; i < points.length; i++) {
          dist += points[i-1].distanceTo(points[i]);
      }
      if (closed && points.length > 2) {
          dist += points[points.length-1].distanceTo(points[0]);
          
          let area = 0.0;
          for (let i = 0; i < points.length; i++) {
              let p1 = points[i];
              let p2 = points[(i + 1) % points.length];
              area += ((p2.lng - p1.lng) * Math.PI / 180) * (2 + Math.sin(p1.lat * Math.PI / 180) + Math.sin(p2.lat * Math.PI / 180));
          }
          area = Math.abs(area * 6378137.0 * 6378137.0 / 2.0);
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
              positions={points.map(p => [p.lat, p.lng])} 
              pathOptions={{ color: '#ef4444', weight: 2, dashArray: '5, 5', fillColor: 'rgba(239, 68, 68, 0.2)' }} 
           />
        ) : (
           <Polyline 
              positions={points.map(p => [p.lat, p.lng])} 
              pathOptions={{ color: '#ef4444', weight: 2, dashArray: '5, 5' }} 
           />
        )}
        {points.map((p, idx) => (
           <CircleMarker 
              key={`m-${idx}`} 
              center={[p.lat, p.lng]} 
              radius={5}
              pathOptions={{ color: '#ef4444', fillColor: 'white', fillOpacity: 1, weight: 2 }} 
              eventHandlers={{
                 click: (e) => {
                    L.DomEvent.stopPropagation(e as any);
                    if (!closed && active && idx === 0 && points.length > 2) {
                       setClosed(true);
                    }
                 }
              }}
           />
        ))}
     </>
  );
}

function LotPopupContent({ lot, onAction, actionLoading }: { lot: any, onAction: (lot: any, action: string, newPrice?: number) => void, actionLoading: string | null }) {
  const [editedPrice, setEditedPrice] = useState(lot.price.toString());
  const color = getStatusColor(lot.status);

  return (
    <div className="p-1 min-w-[200px]">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold text-white text-lg">Lote {lot.number}</span>
        <span className="text-[10px] font-mono uppercase bg-[var(--color-surface-dim)] px-2 py-1 rounded">
          Quadra {lot.block}
        </span>
      </div>
      <div className="text-[11px] text-[var(--color-text-muted)] mb-2 font-bold uppercase tracking-wider">{lot.projectName}</div>
      
      <div className="space-y-3 mb-4">
        <div className="flex justify-between text-sm items-center">
          <span className="text-[var(--color-text-muted)]">Área total:</span>
          <span className="font-mono text-white">{lot.area} m²</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[var(--color-text-muted)] text-sm">Valor (R$):</span>
          <input 
            type="number" 
            value={editedPrice}
            onChange={(e) => setEditedPrice(e.target.value)}
            className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] font-mono"
          />
        </div>
        <div className="flex justify-between text-sm items-center mt-2 pt-2 border-t border-[var(--color-border)]">
          <span className="text-[var(--color-text-muted)]">Status:</span>
          <span className="font-mono text-xs font-bold px-2 py-1 rounded" style={{ backgroundColor: `${color}20`, color: color }}>
            {getStatusLabel(lot.status)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 mb-2">
         <button onClick={() => onAction(lot, 'Disponível', Number(editedPrice))} disabled={actionLoading === lot.id} className="bg-[#22C55E]/20 text-[#22C55E] hover:bg-[#22C55E]/30 text-[10px] font-bold py-1.5 rounded uppercase flex justify-center items-center">D</button>
         <button onClick={() => onAction(lot, 'Reservado', Number(editedPrice))} disabled={actionLoading === lot.id} className="bg-[#EAB308]/20 text-[#EAB308] hover:bg-[#EAB308]/30 text-[10px] font-bold py-1.5 rounded uppercase flex justify-center items-center">R</button>
         <button onClick={() => onAction(lot, 'Vendido', Number(editedPrice))} disabled={actionLoading === lot.id} className="bg-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444]/30 text-[10px] font-bold py-1.5 rounded uppercase flex justify-center items-center">V</button>
      </div>

      <button onClick={() => onAction(lot, lot.status, Number(editedPrice))} disabled={actionLoading === lot.id} className="w-full bg-[var(--color-surface-dim)] text-[var(--color-text-muted)] hover:text-white border border-[var(--color-border)] text-sm font-bold py-1.5 rounded transition-colors flex items-center justify-center">
         {actionLoading === lot.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Valor'}
      </button>
    </div>
  );
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
  const [blocksData, setBlocksData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // States para Medição (Measure Tool)
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([]);
  const [measureClosed, setMeasureClosed] = useState(false);
  const [measureStr, setMeasureStr] = useState<string>('');

  useEffect(() => {
    async function loadLots() {
      if (!user) return;
      try {
        let blocksQuery = supabase.from('blocks').select('*, projects(name)');
        
        if (projectId) {
          blocksQuery = blocksQuery.eq('project_id', projectId);
        }
        
        if (user.role !== 'SUPER_ADMIN' && user.email !== 'severino@nortesultopografia.com.br' && user.tenant_id) {
          blocksQuery = blocksQuery.eq('tenant_id', user.tenant_id);
        }

        const blocksRes = await blocksQuery;
        if (blocksRes.error) throw blocksRes.error;
        
        if (blocksRes.data) {
           const parsedBlocks = blocksRes.data.map(b => {
             let bounds: [number, number][] = [];
             if (b.geometry && b.geometry.type === 'LineString' && b.geometry.coordinates) {
                 bounds = b.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
             } else if (b.geometry && b.geometry.type === 'Polygon' && b.geometry.coordinates) {
                 bounds = b.geometry.coordinates[0].map((c: number[]) => [c[1], c[0]]);
             }
             return { 
               id: b.id,
               block: b.block_name || b.name || '?',
               projectName: b.projects?.name || '?',
               number: b.number || '0',
               status: b.status || 'Disponível',
               area: Number(b.area || 2500),
               price: Number(b.price || 50000),
               geometryType: b.geometry?.type,
               bounds 
             };
           }).filter(b => b.bounds.length > 0);
           setLots(parsedBlocks.filter(b => b.geometryType === 'Polygon'));
           // Separando os dados de bloco caso o componente espere 'blocksData' e 'lots'
           setBlocksData(parsedBlocks.filter(b => b.geometryType === 'LineString'));
        }
        
      } catch (e) {
        console.error("Error loading map geometries:", e);
      } finally {
        setLoading(false);
      }
    }
    
    loadLots();

    const channel = supabase.channel('realtime:blocks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks' }, () => {
         loadLots();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, projectId, refreshKey]);

  const handleLotAction = async (lot: any, newStatusString: string, newPrice?: number) => {
    if (!user) return;
    setActionLoading(lot.id);
    const newStatus = newStatusString;
    const finalPrice = newPrice !== undefined ? newPrice : lot.price;
    
    try {
      const { error: updateError } = await supabase.from('blocks')
        .update({ status: newStatus, price: finalPrice })
        .eq('id', lot.id);
        
      if (updateError) throw updateError;
      
      const title = `Lote Quadra ${lot.block} Lote ${lot.number} atualizado para ${newStatus}`;

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
        <MapController lots={lots} blocksData={blocksData} />
        <LocationController active={gpsActive} />

        {lots.filter(lot => lot.bounds.length > 0).map((lot) => {
          const color = getStatusColor(lot.status);
          return (
            <Polygon 
              key={lot.id}
              positions={lot.bounds}
              pathOptions={{ 
                color: getStatusColor(lot.status), 
                fillColor: getStatusColor(lot.status), 
                fillOpacity: lot.status === 'Disponível' ? 0.3 : 0.6,
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
                    fillOpacity: lot.status === 'Disponível' ? 0.3 : 0.6,
                    weight: 2
                  });
                }
              }}
            >
              <Popup>
                 <LotPopupContent lot={lot} onAction={handleLotAction} actionLoading={actionLoading} />
              </Popup>
            </Polygon>
          );
        })}

        {blocksData.map(block => (
           <Polyline 
              key={`block-${block.id}`} 
              positions={block.bounds} 
              pathOptions={{ color: getStatusColor(block.status), weight: 3, dashArray: '5, 10' }} 
           >
              <Popup>
                 <LotPopupContent lot={block} onAction={handleLotAction} actionLoading={actionLoading} />
              </Popup>
           </Polyline>
        ))}

        <MeasureInteraction 
           active={measureActive} 
           points={measurePoints} 
           setPoints={setMeasurePoints} 
           closed={measureClosed} 
           setClosed={setMeasureClosed} 
           setStr={setMeasureStr} 
        />

      </MapContainer>

      {/* Floating Panel for Measurement */}
      {measureActive && measureStr && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-auto bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-border)] rounded-full px-4 py-2 shadow-lg flex items-center gap-3 fade-in-up">
           <span className="text-sm font-bold text-white whitespace-nowrap">{measureStr}</span>
           <button 
              onClick={() => {
                 setMeasurePoints([]);
                 setMeasureClosed(false);
                 setMeasureStr('');
              }}
              className="p-1.5 bg-[var(--color-background)] hover:bg-[var(--color-border)] rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-all"
              title="Limpar Medição"
           >
              <Trash2 className="w-4 h-4" />
           </button>
        </div>
      )}

    </div>
  );
}
