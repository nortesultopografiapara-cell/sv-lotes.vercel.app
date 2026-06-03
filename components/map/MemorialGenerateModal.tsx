'use client';

import { useCallback, useState } from 'react';
import { Loader2, X, FileDown, Eye, ScrollText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { loadMemorialPayload } from '@/lib/memorial/memorialData';
import {
  downloadMemorialPdf,
  generateMemorialPdf,
  openMemorialPdfPreview,
} from '@/lib/memorial/memorialPdf';
import { MEMORIAL_PENDING_CONFIRM_MESSAGE } from '@/lib/memorial/memorialText';

type MapLot = {
  id: string;
  number?: string;
  block?: string;
};

type Props = {
  projectId: string;
  tenantId: string;
  lot: MapLot;
  onClose: () => void;
  onSelectAnotherLot: () => void;
};

export function MemorialGenerateModal({
  projectId,
  tenantId,
  lot,
  onClose,
  onSelectAnotherLot,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runGenerate = useCallback(
    async (mode: 'download' | 'preview', allowPending: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const payload = await loadMemorialPayload(supabase, {
          projectId,
          blockId: lot.id,
          tenantId,
        });

        if (payload.hasPendingConfrontations && !allowPending) {
          const ok = window.confirm(MEMORIAL_PENDING_CONFIRM_MESSAGE);
          if (!ok) {
            setLoading(false);
            return;
          }
        }

        const doc = await generateMemorialPdf(payload);
        const name = `memorial_lote_${lot.number || lot.id}.pdf`;
        if (mode === 'download') {
          downloadMemorialPdf(doc, name);
        } else {
          openMemorialPdfPreview(doc);
        }
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : 'Erro ao gerar memorial descritivo';
        setError(msg);
        console.error('[Memorial]', e);
      } finally {
        setLoading(false);
      }
    },
    [lot, projectId, tenantId],
  );

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto">
      <div className="bg-[#1a1f29] border border-[#2d3344] rounded-xl w-full max-w-md shadow-2xl text-white">
        <div className="flex items-center justify-between p-4 border-b border-[#2d3344]">
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-[#f59e0b]" />
            <h3 className="font-bold text-sm">Memorial Descritivo (PDF)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            Lote {lot.number || '—'}
            {lot.block ? ` · Quadra ${lot.block}` : ''}
          </p>
          <p className="text-xs text-gray-400">
            Usa segmentos oficiais, confrontações do mapa e dados da empresa
            logada. Suporta qualquer quantidade de vértices.
          </p>

          {error && (
            <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void runGenerate('download', false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#f59e0b] hover:bg-[#d97706] rounded-lg text-sm font-semibold text-black disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              Gerar PDF / Baixar
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void runGenerate('preview', false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2d3344] hover:bg-[#3d4555] rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
              Visualizar
            </button>
            <button
              type="button"
              onClick={onSelectAnotherLot}
              className="w-full px-4 py-2 text-sm text-[#f59e0b] hover:underline"
            >
              Selecionar outro lote no mapa
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-[#2d3344]">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm text-gray-400 hover:text-white"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
