'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { CalibratedLotData } from '@/utils/calculateLotDimensions';

interface GISMapProps {
  onSelectLot: (lot: any, calData: CalibratedLotData) => void;
  selectedLotId: string | null;
  lots: any[];
  isLoading: boolean;
  onRefresh: () => void;
}

const DynamicGISMapInside = dynamic(
  () => import('./GISMapInside'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[550px] bg-[var(--color-background)] flex flex-col items-center justify-center border border-[var(--color-border)] rounded-xl">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2"></div>
        <span className="text-sm text-[var(--color-text-muted)] font-semibold font-mono animate-pulse">
          Carregando Mapa Dinâmico do GIS...
        </span>
      </div>
    )
  }
);

export default function GISMap(props: GISMapProps) {
  return <DynamicGISMapInside {...props} />;
}
