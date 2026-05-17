"use client";

import { useGIS } from "@/hooks/gis/useGIS";
import { Search } from "lucide-react";

export default function TopFilters() {
  const { 
     projects, selectedProjectId, setSelectedProjectId,
     searchQuery, setSearchQuery, selectedStatus, setSelectedStatus,
     lots, blocksData, selectedQuadra, setSelectedQuadra, summary
  } = useGIS();

  const uniqueQuadras = Array.from(new Set([...lots, ...blocksData].map(l => l.block_name || l.name).filter(Boolean))).sort();

  return (
    <div className="flex flex-col border-b border-[var(--color-border)] bg-[var(--color-surface)] z-20 shadow-sm shrink-0">
      <div className="h-16 flex items-center justify-between px-6">
         <div className="flex items-center gap-4">
            <div className="font-bold text-lg text-white mr-4 shadow-text tracking-tight flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] shadow-[0_0_8px_var(--color-primary)]" />
               Território GIS
            </div>

            <select 
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="h-9 px-3 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-sm text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors min-w-[200px]"
            >
              <option value="">Selecione o Empreendimento</option>
              {projects.map(p => ( <option key={p.id} value={p.id}>{p.name}</option> ))}
            </select>

            <select 
              value={selectedQuadra}
              onChange={(e) => setSelectedQuadra(e.target.value)}
              className="h-9 px-3 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-sm text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors min-w-[150px]"
              disabled={uniqueQuadras.length === 0}
            >
              <option value="Todas">Todas as Quadras</option>
              {uniqueQuadras.map(q => ( <option key={q as string} value={q as string}>Quadra {q}</option> ))}
            </select>

            <select 
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-9 px-3 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-sm text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors min-w-[150px]"
            >
              <option value="Todos">Todos os Status</option>
              <option value="Disponível">Disponível</option>
              <option value="Reservado">Reservado</option>
              <option value="Vendido">Vendido</option>
              <option value="Inadimplente">Inadimplente</option>
              <option value="Bloqueado">Bloqueado</option>
            </select>
         </div>

         <div className="flex items-center gap-4">
            <div className="relative">
               <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
               <input 
                 type="text" 
                 placeholder="Buscar lote..." 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="h-9 pl-9 pr-4 bg-[var(--color-background)] border border-[var(--color-border)] rounded-full text-sm text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors w-64"
               />
            </div>
         </div>
      </div>
      
      {selectedProjectId && (
        <div className="px-6 py-2 bg-[var(--color-surface-bright)] border-t border-[var(--color-border)] flex items-center gap-6 overflow-x-auto scrollbar-none">
           <div className="flex items-center gap-2">
             <div className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Total</div>
             <div className="font-mono text-sm text-white">{summary.total}</div>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-emerald-500" />
             <div className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Disponíveis</div>
             <div className="font-mono text-sm text-emerald-400">{summary.disponivel}</div>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-amber-500" />
             <div className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Reservados</div>
             <div className="font-mono text-sm text-amber-500">{summary.reservado}</div>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-red-500" />
             <div className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Vendidos</div>
             <div className="font-mono text-sm text-red-500">{summary.vendido}</div>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-fuchsia-500" />
             <div className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Inadimplentes</div>
             <div className="font-mono text-sm text-fuchsia-400">{summary.inadimplente}</div>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-slate-500" />
             <div className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Bloqueados</div>
             <div className="font-mono text-sm text-slate-400">{summary.bloqueado}</div>
           </div>
        </div>
      )}
    </div>
  );
}
