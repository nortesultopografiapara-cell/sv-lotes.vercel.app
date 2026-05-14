'use client';

import dynamic from 'next/dynamic';

const GISMap = dynamic(() => import('@/components/map/GISMap'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--color-background)]">
      <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-4" />
      <span className="font-mono text-sm uppercase tracking-wider text-[var(--color-text-muted)]">Carregando Motor GIS...</span>
    </div>
  )
});

export default function MapPage() {
  return (
    <div className="flex-1 w-full h-full flex flex-col pt-0 relative bg-[var(--color-background)]">
      {/* Search/Tools Overlay */}
      <div className="absolute top-4 left-4 right-4 md:left-24 md:right-auto md:w-96 z-[400] pointer-events-none">
        <div className="bg-[var(--color-surface)]/90 backdrop-blur-md border border-[var(--color-border)] rounded-xl shadow-lg p-4 pointer-events-auto">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-white mb-1">Módulo GIS</h2>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
              Reserva do Bosque
            </p>
          </div>
          
          <div className="space-y-3">
             <input 
                type="text" 
                placeholder="Buscar lote ou quadra..."
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2.5 px-4 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]"
              />
              
              <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)] mt-1">
                  <div className="w-3 h-3 rounded-sm bg-[#22c55e] border border-[#16a34a]" /> Disponível
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)]">
                  <div className="w-3 h-3 rounded-sm bg-[#eab308] border border-[#ca8a04]" /> Reservado
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)]">
                  <div className="w-3 h-3 rounded-sm bg-[#ef4444] border border-[#dc2626]" /> Vendido
                </div>
              </div>
          </div>
        </div>
      </div>
      
      {/* Map Container */}
      <div className="flex-1 w-full h-full z-0">
        <GISMap />
      </div>
    </div>
  );
}
