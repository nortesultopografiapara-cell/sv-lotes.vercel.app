"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useGIS } from "@/hooks/gis/useGIS";
import { useIsMobile } from "@/hooks/use-mobile";

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case "disponível": return "#22C55E";
    case "reservado": return "#F59E0B";
    case "vendido": return "#EF4444";
    case "inadimplente": return "#D946EF";
    case "bloqueado": return "#64748B";
    default: return "#22C55E"; // Default to available
  }
};

function MapController({ lots, blocksData }: { lots: any[]; blocksData: any[] }) {
  const map = useMap();
  useEffect(() => {
    let allBounds: [number, number][] = [];
    lots.forEach((l) => { if (l.bounds) allBounds.push(...l.bounds); });
    blocksData.forEach((b) => { if (b.bounds) allBounds.push(...b.bounds); });
    if (allBounds.length > 0) {
      map.fitBounds(L.latLngBounds(allBounds), { padding: [20, 20], maxZoom: 19 });
    }
  }, [lots, blocksData, map]);
  return null;
}

export default function LeafletMap() {
  const { 
    lots, blocksData, searchQuery, selectedStatus, selectedQuadra, 
    setSelectedLot, setIsDrawerOpen, setIsBottomSheetOpen, selectedLot 
  } = useGIS();
  
  const isMobile = useIsMobile();
  const [center] = useState<[number, number]>([-1.4553, -48.4892]);

  const handleLotClick = (lot: any) => {
    setSelectedLot(lot);
    if (isMobile) {
      setIsBottomSheetOpen(true);
    } else {
      setIsDrawerOpen(true);
    }
  };

  const isVisible = (status: string, numberStr: string, blockStr: string) => {
     let matchesStatus = selectedStatus === 'Todos' || (status || 'Disponível').toLowerCase() === selectedStatus.toLowerCase();
     if (!matchesStatus) return false;
     
     if (selectedQuadra !== 'Todas' && blockStr !== selectedQuadra) {
        return false;
     }
     
     if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!numberStr?.toLowerCase().includes(q) && !blockStr?.toLowerCase().includes(q)) {
            return false;
        }
     }
     return true;
  };

  const renderPolygons = (items: any[]) => items.map(item => {
    if (!item.bounds || !item.geometry) return null;
    const num = item.number || item.lot_number;
    const block = item.block_name || item.name;
    const stat = item.status || 'Disponível';

    if (!isVisible(stat, String(num), String(block))) return null;

    let coordsForLeaflet = item.bounds; 
    
    try {
      if (item.geometry && item.geometry.coordinates) {
        const raw = item.geometry.coordinates;
        const mapped = (Array.isArray(raw[0][0]) ? raw[0] : raw).map((c: any) => [c[1], c[0]]);
        coordsForLeaflet = mapped;
      }
    } catch(e) {}

    const isSelected = selectedLot?.id === item.id;
    const color = isSelected ? '#3B82F6' : getStatusColor(stat); 
    const opacity = isSelected ? 0.9 : 0.6;
    const weight = isSelected ? 3 : 1;

    return (
      <Polygon
        key={item.id}
        positions={coordsForLeaflet}
        pathOptions={{
          color: isSelected ? "#FFFFFF" : "#0f172a",
          fillColor: color,
          fillOpacity: opacity,
          stroke: true,
          weight: weight,
        }}
        eventHandlers={{
          mouseover: (e) => {
            if (isSelected) return;
            const layer = e.target;
            layer.setStyle({ fillOpacity: 0.8, weight: 2 });
          },
          mouseout: (e) => {
            if (isSelected) return;
            const layer = e.target;
            layer.setStyle({ fillOpacity: 0.6, weight: 1 });
          },
          click: () => {
            handleLotClick(item);
          }
        }}
      >
        {num && num !== "0" && (
          <Tooltip permanent direction="center" className="bg-transparent border-0 shadow-none text-white font-bold text-[10px]" opacity={isSelected ? 1 : 0.9}>
            <div style={{ textShadow: "1px 1px 2px #000" }}>{num}</div>
          </Tooltip>
        )}
      </Polygon>
    );
  });

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer
        center={center}
        zoom={16}
        scrollWheelZoom={true}
        dragging={true}
        touchZoom={true}
        zoomControl={!isMobile} // Custom position or hide on mobile so it doesn't overlap
        style={{ width: "100%", height: "100%", zIndex: 0 }}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={20}
          maxNativeZoom={19}
        />
        <MapController lots={lots} blocksData={blocksData} />
        {renderPolygons(lots)}
        {renderPolygons(blocksData)}
      </MapContainer>
    </div>
  );
}
