"use client";

import { useGIS } from "@/hooks/gis/useGIS";
import { Search, Map } from "lucide-react";
import { useState } from "react";

export default function GISFilters({ isMobile = false }: { isMobile?: boolean }) {
  const { 
     projects, selectedProjectId, setSelectedProjectId,
     searchQuery, setSearchQuery, selectedStatus, setSelectedStatus,
     lots, blocksData, selectedQuadra, setSelectedQuadra, summary
  } = useGIS();

  const [expanded, setExpanded] = useState(false);

  const uniqueQuadras = Array.from(new Set([...lots, ...blocksData].map(l => l.block_name || l.name).filter(Boolean))).sort();

  if (isMobile) {
    return (
      <div className="flex flex-col gap-2">
        <div className="bg-[var(--color-surface)]/90 backdrop-blur-md rounded-2xl shadow-xl border border-[var(--color-border)] p-3 flex items-center justify-between">
          <div className="w-full flex items-center gap-3">
             <div className="p-2 bg-[var(--color-primary)] rounded-full">
               <Map className="w-5 h-5 text-white" />
             </div>
             <select 
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="flex-1 bg-transparent border-none text-white text-base font-bold focus:outline-none appearance-none"
             >
                <option value="" className="text-black">Empreendimento...</option>
                {projects.map(p => ( <option key={p.id} value={p.id} className="text-black">{p.name}</option> ))}
             </select>
             <button onClick={() => setExpanded(!expanded)} className="p-2 text-white">
               <Search className="w-5 h-5" />
             </button>
          </div>
        </div>
        
        {expanded && (
          <div className="bg-[var(--color-surface)]/90 backdrop-blur-md rounded-2xl shadow-xl border border-[var(--color-border)] p-4 flex flex-col gap-4 animate-in slide-in-from-top-2">
             <input 
               type="text" 
               placeholder="Buscar lote..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full h-12 px-4 bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
             />
             <div className="flex gap-2">
               <select 
                 value={selectedQuadra}
                 onChange={(e) => setSelectedQuadra(e.target.value)}
                 className="flex-1 h-12 px-3 bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl text-sm text-white focus:outline-none"
               >
                 <option value="Todas" className="text-black">Quadras</option>
                 {uniqueQuadras.map(q => ( <option key={q as string} value={q as string} className="text-black">Q {q}</option> ))}
               </select>
               <select 
                 value={selectedStatus}
                 onChange={(e) => setSelectedStatus(e.target.value)}
                 className="flex-1 h-12 px-3 bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl text-sm text-white focus:outline-none"
               >
                 <option value="Todos" className="text-black">Status</option>
                 <option value="Disponível" className="text-black">Disponível</option>
                 <option value="Reservado" className="text-black">Reservado</option>
                 <option value="Vendido" className="text-black">Vendido</option>
                 <option value="Inadimplente" className="text-black">Inadimplente</option>
               </select>
             </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop filters layout
  return (
    <div className="flex flex-col border-b border-[var(--color-border)] bg-[var(--color-surface)] z-20 shadow-sm shrink-0">
      <div className="h-16 flex items-center justify-between px-6">
         <div className="flex items-center gap-4">
            <div className="font-bold text-lg text-white mr-4 flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] shadow-[0_0_8px_var(--color-primary)]" />
               Território GIS
            </div>
            <select 
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="h-9 px-3 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-sm text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors min-w-[200px]"
            >
              <option value="" className="text-black">Selecione o Empreendimento</option>
              {projects.map(p => ( <option key={p.id} value={p.id} className="text-black">{p.name}</option> ))}
            </select>
            <select 
              value={selectedQuadra}
              onChange={(e) => setSelectedQuadra(e.target.value)}
              className="h-9 px-3 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-sm text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors min-w-[150px]"
            >
              <option value="Todas" className="text-black">Todas as Quadras</option>
              {uniqueQuadras.map(q => ( <option key={q as string} value={q as string} className="text-black">Quadra {q}</option> ))}
            </select>
            <select 
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-9 px-3 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md text-sm text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors min-w-[150px]"
            >
              <option value="Todos" className="text-black">Todos os Status</option>
              <option value="Disponível" className="text-black">Disponível</option>
              <option value="Reservado" className="text-black">Reservado</option>
              <option value="Vendido" className="text-black">Vendido</option>
              <option value="Inadimplente" className="text-black">Inadimplente</option>
              <option value="Bloqueado" className="text-black">Bloqueado</option>
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
    </div>
  );
}
