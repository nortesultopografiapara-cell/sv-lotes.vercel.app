'use client';

import {
  Crosshair,
  FolderOpen,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { formatQuadraLabel } from '@/lib/projectQuadras';

export type ProjectQuadrasPanelProps = {
  open: boolean;
  onToggleOpen: () => void;
  quadras: string[];
  loading?: boolean;
  actionLoading?: string | null;
  onViewOnMap: (blockName: string) => void;
  onReimportTxt: (blockName: string) => void;
  onUpdateIndividualLot: (blockName: string) => void;
  onRequestDelete: (blockName: string) => void;
};

export function ProjectQuadrasPanel({
  open,
  onToggleOpen,
  quadras,
  loading = false,
  actionLoading = null,
  onViewOnMap,
  onReimportTxt,
  onUpdateIndividualLot,
  onRequestDelete,
}: ProjectQuadrasPanelProps) {
  return (
    <>
      <button
        type="button"
        onClick={onToggleOpen}
        className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${
          open
            ? 'bg-[color-mix(in_srgb,var(--info)_20%,transparent)] text-[var(--info)]'
            : 'bg-transparent hover:bg-[var(--bg-card-alt)] text-[var(--text-secondary)] hover:text-[var(--info)]'
        }`}
        title="Quadras do Projeto"
      >
        <LayoutGrid className="w-4 h-4 md:w-5 md:h-5" />
        <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">
          Quadras do Projeto
        </span>
      </button>

      {open && (
        <div className="gis-shell-panel absolute top-0 right-full mr-2 w-[min(100vw-5rem,300px)] max-h-[min(70vh,420px)] flex flex-col bg-[var(--bg-card)]/98 backdrop-blur-md border border-[var(--border-color)] rounded-lg shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--border-color)] shrink-0">
            <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
              Quadras do Projeto
            </h3>
            <button
              type="button"
              onClick={onToggleOpen}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-alt)] transition-colors"
              aria-label="Fechar painel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-[var(--text-muted)]">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : quadras.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)] text-center py-6 px-2">
                Nenhuma quadra importada neste projeto.
              </p>
            ) : (
              quadras.map((blockName) => {
                const busy = actionLoading === blockName;
                return (
                  <div
                    key={blockName}
                    className="rounded-md border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5"
                  >
                    <p className="text-sm font-semibold text-[var(--text-primary)] mb-2 truncate">
                      {formatQuadraLabel(blockName)}
                    </p>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onViewOnMap(blockName)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                      >
                        <Crosshair className="w-3.5 h-3.5 shrink-0 text-[#10b981]" />
                        Ver no mapa
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onReimportTxt(blockName)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                      >
                        <FolderOpen className="w-3.5 h-3.5 shrink-0 text-[#4999e9]" />
                        Reimportar TXT
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onUpdateIndividualLot(blockName)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        Atualizar lote
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRequestDelete(blockName)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-[11px] font-medium text-red-400/90 hover:bg-red-500/10 hover:text-red-300 transition-colors disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        )}
                        Excluir quadra
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
