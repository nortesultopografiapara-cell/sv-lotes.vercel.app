'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, X, FileDown, Eye, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { loadLotSheetPayload } from '@/lib/lotSheetData';
import {
  downloadLotSheetPdf,
  generateLotSheetPdf,
  openLotSheetPdfPreview,
} from '@/lib/lotSheetPdf';

type MapLot = {
  id: string;
  number?: string;
  block?: string;
};

type Props = {
  projectId: string;
  tenantId: string;
  lot: MapLot | null;
  pickMode: boolean;
  onClose: () => void;
  onRequestPick: () => void;
};

export function LotSheetPrintModal({
  projectId,
  tenantId,
  lot,
  pickMode,
  onClose,
  onRequestPick,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewLot, setPreviewLot] = useState<MapLot | null>(lot);

  useEffect(() => {
    setPreviewLot(lot);
  }, [lot]);

  const runGenerate = useCallback(
    async (mode: 'download' | 'preview') => {
      if (!previewLot?.id) {
        setError('Selecione um lote no mapa.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const payload = await loadLotSheetPayload(supabase, {
          projectId,
          blockId: previewLot.id,
          tenantId,
        });
        const doc = generateLotSheetPdf(payload);
        const name = `prancha_lote_${previewLot.number || previewLot.id}.pdf`;
        if (mode === 'download') {
          downloadLotSheetPdf(doc, name);
        } else {
          openLotSheetPdfPreview(doc);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro ao gerar prancha';
        setError(msg);
        console.error('LOT_SHEET_ERROR', e);
      } finally {
        setLoading(false);
      }
    },
    [previewLot, projectId, tenantId],
  );

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto">
      <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl w-full max-w-md shadow-2xl text-white">
        <div className="flex items-center justify-between p-4 border-b border-[#2d3340]">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#4999e9]" />
            <h3 className="font-bold text-sm">Prancha do Lote (PDF)</h3>
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
          {pickMode ? (
            <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              Selecione o lote para gerar a prancha — clique em um lote no mapa.
            </p>
          ) : previewLot ? (
            <p className="text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
              Lote {previewLot.number || '—'}
              {previewLot.block ? ` · Quadra ${previewLot.block}` : ''} selecionado.
            </p>
          ) : (
            <p className="text-sm text-gray-400">
              Nenhum lote selecionado. Clique em &quot;Selecionar no mapa&quot;.
            </p>
          )}

          {error && (
            <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void runGenerate('download')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4999e9] hover:bg-[#3b82d9] rounded-lg text-sm font-semibold disabled:opacity-50"
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
              disabled={loading || !previewLot}
              onClick={() => void runGenerate('preview')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2d3340] hover:bg-[#3d4555] rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
              Visualizar
            </button>
            <button
              type="button"
              onClick={onRequestPick}
              className="w-full px-4 py-2 text-sm text-[#4999e9] hover:underline"
            >
              Selecionar outro lote no mapa
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-[#2d3340]">
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
