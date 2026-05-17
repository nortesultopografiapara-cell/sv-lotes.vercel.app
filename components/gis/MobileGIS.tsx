"use client";

import { useGIS } from "@/hooks/gis/useGIS";
import dynamic from "next/dynamic";
import GISFilters from "./GISFilters";
import GISBottomSheet from "./GISBottomSheet";

const LeafletMap = dynamic(() => import("@/components/maps/LeafletMap"), {
  ssr: false,
  loading: () => (
     <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--color-background)]">
       <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-4" />
     </div>
  )
});

export default function MobileGIS() {
  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="absolute top-4 left-4 right-4 z-[1000]">
         <GISFilters isMobile={true} />
      </div>
      
      <div className="flex-1 w-full relative z-0">
        <LeafletMap />
      </div>

      <GISBottomSheet />
    </div>
  );
}
