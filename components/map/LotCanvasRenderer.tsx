'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

const LotCanvasRendererContext = createContext<L.Canvas | null>(null);

export function useLotCanvasRenderer(): L.Canvas | null {
  return useContext(LotCanvasRendererContext);
}

/**
 * Renderer Canvas compartilhado APENAS para polígonos de lote.
 * Não usa preferCanvas global no MapContainer (preserva Google Mutant / tiles).
 */
export function LotCanvasRendererProvider({ children }: { children: ReactNode }) {
  const map = useMap();
  const [renderer, setRenderer] = useState<L.Canvas | null>(null);

  useEffect(() => {
    const canvasRenderer = L.canvas({
      padding: 0.5,
      tolerance: 5,
    });

    // Garante pane de overlay com canvas transparente (não cobre o tile)
    const pane = map.getPane('overlayPane');
    if (pane) {
      pane.style.pointerEvents = 'auto';
    }

    setRenderer(canvasRenderer);

    return () => {
      setRenderer(null);
    };
  }, [map]);

  const value = useMemo(() => renderer, [renderer]);

  return (
    <LotCanvasRendererContext.Provider value={value}>
      {children}
    </LotCanvasRendererContext.Provider>
  );
}
