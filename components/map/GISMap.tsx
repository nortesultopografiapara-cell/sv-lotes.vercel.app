'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Popup, Tooltip, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
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
  
  const area = lot.area || 0;
  const currentPrice = Number(editedPrice) || 0;
  const meterPrice = area > 0 ? (currentPrice / area) : 0;

  return (
    <div className="p-2 min-w-[280px] bg-white text-gray-900 rounded-md font-sans">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold text-lg text-gray-900">Lote {lot.number}</span>
      </div>
      
      <div className="space-y-2 mb-4 text-sm">
        <div className="flex justify-between border-b pb-1">
          <span className="text-gray-600 font-semibold">Projeto:</span>
          <span className="text-gray-900 text-right max-w-[150px] truncate">{lot.projectName}</span>
        </div>
        <div className="flex justify-between border-b pb-1">
          <span className="text-gray-600 font-semibold">Quadra (Quadra):</span>
          <span className="text-gray-900">{lot.block}</span>
        </div>
        <div className="flex justify-between border-b pb-1">
          <span className="text-gray-600 font-semibold">Lote (Lote):</span>
          <span className="text-gray-900">{lot.number}</span>
        </div>
        <div className="flex justify-between items-center border-b pb-1">
          <span className="text-gray-600 font-semibold">Status:</span>
          <span className="text-white text-[11px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: color }}>
            {getStatusLabel(lot.status)}
          </span>
        </div>
        <div className="flex justify-between border-b pb-1">
          <span className="text-gray-600 font-semibold">Área (m²):</span>
          <span className="text-gray-900">{area.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between border-b pb-1 items-center">
          <span className="text-gray-600 font-semibold">Valor do Metro (R$/m²):</span>
          <span className="text-gray-900">{meterPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</span>
        </div>
        <div className="flex justify-between items-center pt-1">
          <span className="text-gray-600 font-semibold">Valor do Lote (R$):</span>
          <input 
            type="number" 
            value={editedPrice}
            onChange={(e) => setEditedPrice(e.target.value)}
            className="w-24 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-blue-500 font-mono text-right"
          />
        </div>
      </div>

      <div className="mb-2">
        <span className="text-sm font-semibold text-gray-800">Ações de comercial</span>
        <div className="flex gap-1 mt-1">
           <button onClick={() => onAction(lot, 'Disponível', Number(editedPrice))} disabled={actionLoading === lot.id} className="flex-1 bg-gray-200 text-gray-700 hover:bg-gray-300 text-[10px] font-bold py-2 rounded">
             Disponibilizar
           </button>
           <button onClick={() => onAction(lot, 'Reservado', Number(editedPrice))} disabled={actionLoading === lot.id} className="flex-1 bg-yellow-400 text-yellow-900 hover:bg-yellow-500 text-[10px] font-bold py-2 rounded">
             Reservar
           </button>
           <button onClick={() => onAction(lot, 'Vendido', Number(editedPrice))} disabled={actionLoading === lot.id} className="flex-1 bg-red-600 text-white hover:bg-red-700 text-[10px] font-bold py-2 rounded">
             Vender
           </button>
           <button onClick={() => onAction(lot, lot.status, Number(editedPrice))} disabled={actionLoading === lot.id} className="flex-none px-2 bg-gray-100 text-gray-500 hover:text-gray-900 border border-gray-200 hover:bg-gray-200 rounded flex flex-col items-center justify-center">
             {actionLoading === lot.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
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
    
    // Optimistic UI updates
    setLots((prev) => prev.map((l) => l.id === lot.id ? { ...l, status: newStatus, price: finalPrice } : l));
    setBlocksData((prev) => prev.map((l) => l.id === lot.id ? { ...l, status: newStatus, price: finalPrice } : l));

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
                color: '#000000', 
                fillColor: getStatusColor(lot.status), 
                fillOpacity: 0.75,
                stroke: true,
                weight: 1
              }}
              eventHandlers={{
                mouseover: (e) => {
                  const layer = e.target;
                  layer.setStyle({
                    fillOpacity: 1,
                    weight: 2
                  });
                },
                mouseout: (e) => {
                  const layer = e.target;
                  layer.setStyle({
                    fillOpacity: 0.75,
                    weight: 1
                  });
                }
              }}
            >
              {lot.number !== '0' && (
                <Tooltip permanent direction="center" className="bg-transparent border-0 shadow-none text-white font-bold text-[11px]" opacity={1}>
                   <div style={{ textShadow: '1px 1px 2px black, 0 0 1em black' }}>
                     Lote {lot.number}
                   </div>
                </Tooltip>
              )}
              <Popup>
                 <LotPopupContent lot={lot} onAction={handleLotAction} actionLoading={actionLoading} />
              </Popup>
            </Polygon>
          );
        })}

        {blocksData.map(block => (
           <Polygon 
              key={`block-${block.id}`} 
              positions={block.bounds} 
              pathOptions={{ 
                color: '#000000', 
                fillColor: getStatusColor(block.status), 
                fillOpacity: 0.75,
                stroke: true,
                weight: 1 
              }} 
              eventHandlers={{
                mouseover: (e) => {
                  const layer = e.target;
                  layer.setStyle({
                    fillOpacity: 1,
                    weight: 2
                  });
                },
                mouseout: (e) => {
                  const layer = e.target;
                  layer.setStyle({
                    fillOpacity: 0.75,
                    weight: 1
                  });
                }
              }}
           >
              {block.number !== '0' && (
                <Tooltip permanent direction="center" className="bg-transparent border-0 shadow-none text-white font-bold text-[11px]" opacity={1}>
                   <div style={{ textShadow: '1px 1px 2px black, 0 0 1em black' }}>
                     {block.name || block.block_name} {block.number !== '0' && `(Linha ${block.number})`}
                   </div>
                </Tooltip>
              )}
              <Popup>
                 <LotPopupContent lot={block} onAction={handleLotAction} actionLoading={actionLoading} />
              </Popup>
           </Polygon>
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
