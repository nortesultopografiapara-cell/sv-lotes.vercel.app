"use client";

import { useGIS } from "@/hooks/gis/useGIS";
import TopFilters from "./TopFilters";
import dynamic from "next/dynamic";
import LotDrawer from "./LotDrawer";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

const LeafletMap = dynamic(() => import("@/components/maps/LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--color-background)]">
      <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-4" />
      <span className="font-mono text-sm uppercase tracking-wider text-[var(--color-text-muted)]">
        Carregando Motor GIS...
      </span>
    </div>
  ),
});

export default function GISDashboard() {
  const { user } = useAuth();
  const { 
    setProjects, 
    selectedProjectId, 
    setLoading, 
    setLots, 
    setBlocksData 
  } = useGIS();

  useEffect(() => {
    async function loadProjects() {
      if (!user) return;
      const { data } = await supabase.from("projects").select("*").order("name");
      if (data) setProjects(data);
    }
    loadProjects();
  }, [user, setProjects]);

  useEffect(() => {
    async function fetchLots() {
      if (!selectedProjectId) {
         setLots([]);
         setBlocksData([]);
         return;
      }
      setLoading(true);
      try {
        const { data: lotesData } = await supabase
          .from("lotes")
          .select("*, customers(name)")
          .eq("project_id", selectedProjectId);

        const { data: bData } = await supabase
          .from("blocks")
          .select("*, customers(name)")
          .eq("project_id", selectedProjectId);

        const mapGeom = (item: any) => {
          let parsedGeom = null;
          let calcBounds = null;
          if (item.geometry) {
            try {
              parsedGeom = typeof item.geometry === "string" ? JSON.parse(item.geometry) : item.geometry;
              if (parsedGeom && parsedGeom.coordinates) {
                // Approximate bounding boxes
                let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
                const coords = Array.isArray(parsedGeom.coordinates[0][0])
                  ? parsedGeom.coordinates[0]
                  : parsedGeom.coordinates;
                coords.forEach((coord: [number, number]) => {
                  const lng = coord[0];
                  const lat = coord[1];
                  if (lat < minLat) minLat = lat;
                  if (lat > maxLat) maxLat = lat;
                  if (lng < minLng) minLng = lng;
                  if (lng > maxLng) maxLng = lng;
                });
                calcBounds = [
                  [minLat, minLng],
                  [maxLat, maxLng],
                ];
              }
            } catch (e) {}
          }
          return {
             ...item,
             geometry: parsedGeom,
             bounds: calcBounds,
             customerName: item.customers?.name || item.customerName || item.buyer_name
          };
        };

        if (lotesData) setLots(lotesData.map(mapGeom));
        if (bData) setBlocksData(bData.map(mapGeom));

      } catch (err) {
        console.error("GIS fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchLots();
  }, [selectedProjectId, setLoading, setLots, setBlocksData]);

  return (
    <div className="flex flex-col h-full w-full bg-[var(--color-background)] overflow-hidden relative">
      <TopFilters />
      
      <div className="flex-1 w-full relative">
        <LeafletMap />
        <LotDrawer />
      </div>
    </div>
  );
}
