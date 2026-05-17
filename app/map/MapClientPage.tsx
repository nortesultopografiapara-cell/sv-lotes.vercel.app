"use client";

import { GISProvider } from "@/hooks/gis/useGIS";
import GISDashboard from "@/components/gis/GISDashboard";

export default function MapClientPage() {
  return (
    <GISProvider>
      <GISDashboard />
    </GISProvider>
  );
}
