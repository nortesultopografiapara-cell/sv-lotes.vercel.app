"use client";

import { useEffect } from "react";
import { useGIS } from "@/hooks/gis/useGIS";
import { useIsMobile } from "@/hooks/use-mobile";
import DesktopGIS from "./DesktopGIS";
import MobileGIS from "./MobileGIS";
import { supabase } from "@/lib/supabase";

export default function GISDashboard() {
  const isMobile = useIsMobile();
  const { 
    setProjects, 
    selectedProjectId, 
    setLoading, 
    setLots, 
    setBlocksData 
  } = useGIS();

  useEffect(() => {
    async function loadProjects() {
      // Fake session wait just for safety in case of auth dependencies
      // but here we just load directly if we don't need auth, or skip for now.
      const { data } = await supabase.from("projects").select("*").order("name");
      if (data) setProjects(data);
    }
    loadProjects();
  }, [setProjects]);

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
                calcBounds = [ [minLat, minLng], [maxLat, maxLng] ];
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
    <div className="w-full h-screen overflow-hidden bg-[var(--color-background)]">
      {isMobile ? <MobileGIS /> : <DesktopGIS />}
    </div>
  );
}
