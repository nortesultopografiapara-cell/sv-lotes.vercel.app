"use client";

import { useGIS } from "@/hooks/gis/useGIS";
import dynamic from "next/dynamic";
import GISFilters from "./GISFilters";
import GISDrawer from "./GISDrawer";

const LeafletMap = dynamic(() => import("@/components/maps/LeafletMap"), {
  ssr: false,
  loading: () => (
     <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--color-background)]">
       <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-4" />
     </div>
  )
});

export default function DesktopGIS() {
  return (
    <div className="flex flex-col h-full w-full bg-[var(--color-background)] overflow-hidden relative">
      <GISFilters isMobile={false} />
      <div className="flex-1 w-full relative">
        <LeafletMap />
        <GISDrawer />
      </div>
    </div>
  );
}
