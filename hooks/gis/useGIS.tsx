"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";

export interface LotData {
  id: string;
  project_id: string;
  quadra_id?: string;
  name?: string;
  block_name?: string;
  number?: string;
  area?: number;
  price?: number;
  status: string;
  customerName?: string | null;
  customerId?: string | null;
  geometry?: any;
  bounds?: any;
  [key: string]: any;
}

interface GISContextType {
  projects: any[];
  setProjects: (projects: any[]) => void;
  lots: LotData[];
  setLots: (lots: LotData[]) => void;
  blocksData: LotData[];
  setBlocksData: (lots: LotData[]) => void;
  
  selectedCompanyId: string;
  setSelectedCompanyId: (id: string) => void;
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedStatus: string;
  setSelectedStatus: (s: string) => void;
  selectedQuadra: string;
  setSelectedQuadra: (q: string) => void;

  selectedLot: LotData | null;
  setSelectedLot: (lot: LotData | null) => void;

  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;

  loading: boolean;
  setLoading: (l: boolean) => void;
  
  refreshMap: () => void;
  
  summary: { total: number; disponivel: number; vendido: number; reservado: number; inadimplente: number; bloqueado: number };
}

const GISContext = createContext<GISContextType | undefined>(undefined);

export function GISProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [lots, setLots] = useState<LotData[]>([]);
  const [blocksData, setBlocksData] = useState<LotData[]>([]);
  
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("Todos");
  const [selectedQuadra, setSelectedQuadra] = useState("Todas");

  const [selectedLot, setSelectedLot] = useState<LotData | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [loading, setLoading] = useState(false);

  const refreshMap = useCallback(() => {
  }, []);

  const summary = useMemo(() => {
    let total = 0, disponivel = 0, vendido = 0, reservado = 0, inadimplente = 0, bloqueado = 0;
    const all = [...lots, ...blocksData];
    total = all.length;
    all.forEach(l => {
      const s = l.status?.toLowerCase();
      if (s === 'vendido') vendido++;
      else if (s === 'reservado') reservado++;
      else if (s === 'inadimplente') inadimplente++;
      else if (s === 'bloqueado') bloqueado++;
      else disponivel++;
    });
    return { total, disponivel, vendido, reservado, inadimplente, bloqueado };
  }, [lots, blocksData]);

  const value = {
    projects, setProjects,
    lots, setLots,
    blocksData, setBlocksData,
    selectedCompanyId, setSelectedCompanyId,
    selectedProjectId, setSelectedProjectId,
    searchQuery, setSearchQuery,
    selectedStatus, setSelectedStatus,
    selectedQuadra, setSelectedQuadra,
    selectedLot, setSelectedLot,
    isDrawerOpen, setIsDrawerOpen,
    loading, setLoading,
    refreshMap,
    summary
  };

  return <GISContext.Provider value={value}>{children}</GISContext.Provider>;
}

export function useGIS() {
  const context = useContext(GISContext);
  if (context === undefined) {
    throw new Error("useGIS must be used within a GISProvider");
  }
  return context;
}
