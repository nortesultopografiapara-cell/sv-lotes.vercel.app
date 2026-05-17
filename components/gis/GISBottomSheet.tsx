"use client";

import { useGIS } from "@/hooks/gis/useGIS";
import { X, Ruler, DollarSign, User, FileText, ChevronUp, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

export default function GISBottomSheet() {
  const { isBottomSheetOpen, setIsBottomSheetOpen, selectedLot, setSelectedLot } = useGIS();
  const [expanded, setExpanded] = useState(false);

  // When selectedLot changes, open bottom sheet
  useEffect(() => {
    if (selectedLot) {
      setIsBottomSheetOpen(true);
      setExpanded(false);
    }
  }, [selectedLot, setIsBottomSheetOpen]);

  const handleClose = () => {
    setIsBottomSheetOpen(false);
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

  if (!selectedLot) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1001] flex flex-col pointer-events-none">
      {/* Backdrop for expanded view */}
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto ${expanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setExpanded(false)}
      />

      <div 
        className={`w-full bg-[var(--color-surface)] rounded-t-3xl border-t border-[var(--color-border)] shadow-2xl transition-all duration-300 ease-out pointer-events-auto flex flex-col`}
        style={{
          transform: isBottomSheetOpen ? 'translateY(0)' : 'translateY(100%)',
          height: expanded ? '85vh' : 'auto',
          maxHeight: '85vh'
        }}
      >
        {/* Handle bar to drag/expand */}
        <div 
           className="w-full h-8 flex items-center justify-center cursor-pointer"
           onClick={() => setExpanded(!expanded)}
        >
           <div className="w-12 h-1.5 bg-[var(--color-text-muted)] opacity-50 rounded-full" />
        </div>

        <div className="px-6 pb-6 pt-0 flex-1 overflow-y-auto scrollbar-none flex flex-col gap-5">
           <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-white">Lote {selectedLot.number || selectedLot.lot_number}</h2>
                <p className="text-[var(--color-text-muted)] text-sm font-mono mt-1 uppercase">Quadra {selectedLot.block_name || selectedLot.name}</p>
              </div>
              <div className="flex items-center gap-3">
                 <span className={`px-2.5 py-1 rounded text-xs uppercase font-bold border ${getStatusColor(selectedLot.status)}`}>
                   {selectedLot.status || 'Disponível'}
                 </span>
                 <button onClick={handleClose} className="p-2 bg-[var(--color-background)] rounded-full text-[var(--color-text-muted)]">
                   <X className="w-5 h-5" />
                 </button>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--color-background)] rounded-2xl p-4 border border-[var(--color-border)]">
                 <div className="text-xs text-[var(--color-text-muted)] font-bold uppercase flex items-center gap-2 mb-2"><Ruler className="w-4 h-4"/> Área</div>
                 <div className="text-xl text-white font-mono">{selectedLot.area || '0'} m²</div>
              </div>
              <div className="bg-[var(--color-background)] rounded-2xl p-4 border border-[var(--color-border)]">
                 <div className="text-xs text-[var(--color-text-muted)] font-bold uppercase flex items-center gap-2 mb-2"><DollarSign className="w-4 h-4"/> Valor</div>
                 <div className="text-xl text-emerald-400 font-mono font-bold">{formatCurrency(selectedLot.price || 0)}</div>
              </div>
           </div>

           {(selectedLot.customerName || selectedLot.buyer_name) && (
              <div className="bg-[var(--color-surface-bright)] rounded-2xl border border-[var(--color-border)] p-4 flex items-center gap-4">
                 <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6" />
                 </div>
                 <div>
                    <h3 className="text-xs text-[var(--color-text-muted)] font-bold uppercase mb-1">Cliente</h3>
                    <p className="text-base text-white font-bold">{selectedLot.customerName || selectedLot.buyer_name}</p>
                 </div>
              </div>
           )}

           {/* Mobile Action Buttons (Thick and Touch-Friendly) */}
           <div className="grid grid-cols-1 gap-3 mt-auto pt-4">
              {(!selectedLot.status || selectedLot.status === 'Disponível') && (
                 <>
                    <button className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-lg transition-colors shadow-lg shadow-amber-500/20">
                       Reservar Lote
                    </button>
                    <button className="w-full py-4 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-xl font-bold text-lg transition-colors shadow-lg shadow-[var(--color-primary)]/20">
                       Iniciar Venda
                    </button>
                 </>
              )}

              {selectedLot.status === 'Reservado' && (
                 <button className="w-full py-4 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-xl font-bold text-lg transition-colors shadow-lg shadow-[var(--color-primary)]/20">
                    Efetivar Venda
                 </button>
              )}

              {['Vendido', 'Inadimplente'].includes(selectedLot.status) && (
                 <button className="w-full py-4 bg-[var(--color-surface-bright)] border border-[var(--color-border)] hover:bg-[var(--color-border)] text-white rounded-xl font-bold text-lg transition-colors flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5"/> Acessar Contrato
                 </button>
              )}
           </div>

           {!expanded && isBottomSheetOpen && (
              <div className="text-center mt-2">
                 <p className="text-xs text-[var(--color-text-muted)] flex items-center justify-center gap-1">
                    Arraste para cima para mais detalhes <ChevronUp className="w-4 h-4"/>
                 </p>
              </div>
           )}
        </div>
      </div>
    </div>
  );
}
