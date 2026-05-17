"use client";

import { useGIS } from "@/hooks/gis/useGIS";
import { X, User, Ruler, DollarSign, FileText, CreditCard, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function GISDrawer() {
  const { isDrawerOpen, setIsDrawerOpen, selectedLot, setSelectedLot } = useGIS();
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);

  useEffect(() => {
     if (isDrawerOpen && selectedLot) {
        setLoading(true);
        supabase.from("contracts")
          .select("*, customers(name, phone, email, status)")
          .eq("lote_id", selectedLot.id)
          .then(({ data }) => {
             setContracts(data || []);
             setLoading(false);
          });
     }
  }, [isDrawerOpen, selectedLot]);

  if (!isDrawerOpen || !selectedLot) return null;

  const handleClose = () => {
    setIsDrawerOpen(false);
    setTimeout(() => setSelectedLot(null), 300);
  };

  const getStatusColor = (s: string) => {
    switch (s?.toLowerCase()) {
      case 'disponível': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'reservado': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'vendido': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'inadimplente': return 'bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20';
      case 'bloqueado': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const activeContract = contracts.find(c => c.status === 'ativo' || c.status === 'inadimplente') || contracts[0];

  return (
    <>
      <div 
        className="absolute inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity hidden md:block" 
        onClick={handleClose}
      />
      <div className={`absolute right-0 top-0 bottom-0 w-[400px] bg-[var(--color-surface)] border-l border-[var(--color-border)] z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out transform ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-bright)]/30 backdrop-blur-md">
           <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                 Lote {selectedLot.number || selectedLot.lot_number}
              </h2>
              <p className="text-[11px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider mt-0.5">
                 Quadra {selectedLot.block_name || selectedLot.name}
              </p>
           </div>
           <div className="flex items-center gap-3">
             <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${getStatusColor(selectedLot.status)}`}>
               {selectedLot.status || 'Disponível'}
             </span>
             <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white transition-colors">
                <X className="w-5 h-5" />
             </button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
           <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--color-background)] rounded-lg p-3 border border-[var(--color-border)]">
                 <div className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><Ruler className="w-3 h-3"/> Área Total</div>
                 <div className="text-base text-white font-mono">{selectedLot.area || selectedLot.area_oficial || '0'} m²</div>
              </div>
              <div className="bg-[var(--color-background)] rounded-lg p-3 border border-[var(--color-border)]">
                 <div className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><DollarSign className="w-3 h-3"/> Valor Base</div>
                 <div className="text-base text-emerald-400 font-mono font-bold">{formatCurrency(selectedLot.price || 0)}</div>
              </div>
           </div>

           {activeContract ? (
              <div className="bg-[var(--color-surface-bright)] rounded-xl border border-[var(--color-border)] overflow-hidden">
                 <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2 bg-[var(--color-background)]/50">
                    <User className="w-4 h-4 text-[var(--color-primary)]" />
                    <h3 className="text-sm font-bold text-white">Comprador Atual</h3>
                 </div>
                 <div className="p-4">
                    <p className="font-bold text-white">{activeContract.customers?.name || activeContract.buyer_name}</p>
                    {activeContract.customers?.phone && <p className="text-xs text-[var(--color-text-muted)] mt-1">{activeContract.customers.phone}</p>}
                    {activeContract.customers?.email && <p className="text-xs text-[var(--color-text-muted)] mt-1">{activeContract.customers.email}</p>}
                 </div>
              </div>
           ) : selectedLot.customerName ? (
              <div className="bg-[var(--color-surface-bright)] rounded-xl border border-[var(--color-border)] overflow-hidden">
                 <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2 bg-[var(--color-background)]/50">
                    <User className="w-4 h-4 text-[var(--color-primary)]" />
                    <h3 className="text-sm font-bold text-white">Responsável</h3>
                 </div>
                 <div className="p-4">
                    <p className="font-bold text-white">{selectedLot.customerName}</p>
                 </div>
              </div>
           ) : (
              <div className="flex border border-dashed border-[var(--color-border)] rounded-xl p-6 items-center justify-center text-[var(--color-text-muted)] text-sm">
                 Nenhum cliente vinculado a este lote.
              </div>
           )}

           {activeContract && (
              <div className="space-y-2">
                 <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Informações do Contrato</h3>
                 <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                         <FileText className="w-4 h-4" />
                       </div>
                       <div>
                          <p className="text-sm font-bold text-white group-hover:text-[var(--color-primary)] transition-colors">Contrato C-{activeContract.id.substring(0, 5).toUpperCase()}</p>
                          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Criado em {new Date(activeContract.created_at).toLocaleDateString()}</p>
                       </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors" />
                 </div>
              </div>
           )}
        </div>

        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col gap-3">
           <div className="grid grid-cols-2 gap-3">
              {(!selectedLot.status || selectedLot.status === 'Disponível') && (
                 <>
                    <button className="flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 transition-all">
                       Reservar
                    </button>
                    <button className="flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white shadow-lg shadow-[var(--color-primary)]/20 transition-all">
                       Vender
                    </button>
                 </>
              )}
              {selectedLot.status === 'Reservado' && (
                 <button className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white shadow-lg shadow-[var(--color-primary)]/20 transition-all">
                    Efetivar Venda
                 </button>
              )}
              {['Vendido', 'Inadimplente'].includes(selectedLot.status) && (
                <button className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm bg-[var(--color-surface-bright)] border border-[var(--color-border)] hover:bg-[var(--color-border)] text-white transition-all">
                   Painel Financeiro
                </button>
              )}
           </div>
        </div>
      </div>
    </>
  );
}
