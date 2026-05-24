'use client';

import React, { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { calculateLotDimensions, CalibratedLotData } from '@/utils/calculateLotDimensions';
import GISMap from '@/components/GISMap';
import LotDetailsPanel from '@/components/LotDetailsPanel';
import Dashboard from '@/components/Dashboard';
import { ShieldCheck, Database, RefreshCw, Layers, Award, LayoutDashboard } from 'lucide-react';

export default function Home() {
  const [lots, setLots] = useState<any[]>([]);
  const [selectedLot, setSelectedLot] = useState<any | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<CalibratedLotData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [notification, setNotification] = useState<string | null>(null);

  // Fetch lots from database (blocks table)
  const loadData = async () => {
    setIsLoading(true);
    try {
      const supabaseClient = getSupabase();
      const { data, error } = await supabaseClient
        .from('blocks')
        .select('*')
        .order('lot_number', { ascending: true });

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        setLots(data);

        // Auto-select "LOTE 02 QUADRA 01" Martine II as the primary demo lot
        const demoLot = data.find(
          (l: any) => l.lot_number === '2' && l.block_name === '01'
        );

        const activeLot = demoLot || data[0];
        
        if (activeLot) {
          const ring = activeLot.geometry?.coordinates?.[0] || [];
          const metrics = calculateLotDimensions(ring, {
            frente: activeLot.frente,
            fundo: activeLot.fundo,
            lado_direito: activeLot.lado_direito,
            lado_esquerdo: activeLot.lado_esquerdo
          });
          setSelectedLot(activeLot);
          setSelectedMetrics(metrics);
        }
      }
    } catch (e: any) {
      console.error('Error fetching blocks:', e.message);
      setNotification(`Erro ao consultar dados do Supabase. Utilizando dados fallback.`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectLot = (lot: any, metrics: CalibratedLotData) => {
    setSelectedLot(lot);
    setSelectedMetrics(metrics);
    setNotification(`Lote ${lot.lot_number} selecionado com calibração ativa!`);
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Visual Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6 bg-white p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600 animate-pulse" />
            <h1 className="text-xl sm:text-2xl font-black font-sans tracking-tight text-slate-800 uppercase">
              SV_LOTES <span className="text-neutral-400 font-normal">| Portal GIS Calibrado</span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
            Sistema decisório de Ajuste de Projeção Métrica SIG-UTM. Fator Corretivo Ativo: <span className="font-mono text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">0.9971090670170828</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {notification && (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl font-sans tracking-wide animate-fade-in animate-pulse shadow-sm">
              {notification}
            </span>
          )}
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4.5 py-2.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Recarregar SIG</span>
          </button>
        </div>
      </div>

      {/* Main interactive GIS section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Interactive map (col-span-7) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-brand-500" /> Mapas Integrados SIRGAS2000
              </span>
              <span className="flex items-center gap-1 font-mono text-slate-500 text-[10px]">
                <Database className="w-3.5 h-3.5" /> Supabase Conectado
              </span>
            </div>
            <GISMap
              onSelectLot={handleSelectLot}
              selectedLotId={selectedLot?.id || null}
              lots={lots}
              isLoading={isLoading}
              onRefresh={loadData}
            />
          </div>
        </div>

        {/* Dynamic Details / Sidebar Section (col-span-5) */}
        <div className="lg:col-span-5">
          <LotDetailsPanel lot={selectedLot} metrics={selectedMetrics} />
        </div>
      </div>

      {/* Complete Recharts Analytical dashboards */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <LayoutDashboard className="w-5 h-5 text-brand-500" />
          <h3 className="font-sans font-bold text-slate-700 text-sm uppercase tracking-wider">
            Painel Geral de Estatísticas e Metrologia Corretiva
          </h3>
        </div>
        <Dashboard lots={lots} />
      </div>
    </main>
  );
}
