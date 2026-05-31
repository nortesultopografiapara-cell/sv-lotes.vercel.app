'use client';

import { useCallback, useState } from 'react';
import { Loader2, X, FileDown, Eye, Printer, MapPin } from 'lucide-react';
import { CorrectConfrontationsModal } from '@/components/map/CorrectConfrontationsModal';
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
  lot: MapLot;
  onClose: () => void;
  onSelectAnotherLot: () => void;
};

export function LotSheetPrintModal({
  projectId,
  tenantId,
  lot,
  onClose,
  onSelectAnotherLot,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confrontOpen, setConfrontOpen] = useState(false);
  const [confrontCtx, setConfrontCtx] = useState<{
    block: Record<string, unknown>;
    blocks: Record<string, unknown>[];
    guides: Record<string, unknown>[];
  } | null>(null);
  const [confrontLoading, setConfrontLoading] = useState(false);

  const runGenerate = useCallback(
    async (mode: 'download' | 'preview') => {
      setLoading(true);
      setError(null);
      try {
        const payload = await loadLotSheetPayload(supabase, {
          projectId,
          blockId: lot.id,
          tenantId,
        });
        const doc = await generateLotSheetPdf(payload);
        console.log('LOT_SHEET_PDF_GENERATED', {
          lotId: lot.id,
          number: lot.number,
          mode,
        });
        const name = `prancha_lote_${lot.number || lot.id}.pdf`;
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
    [lot, projectId, tenantId],
  );

  const openConfrontations = useCallback(async () => {
    setConfrontLoading(true);
    setError(null);
    try {
      const { data: block, error: blockErr } = await supabase
        .from('blocks')
        .select('*')
        .eq('id', lot.id)
        .single();
      if (blockErr || !block) throw new Error(blockErr?.message || 'Lote não encontrado');

      const { data: blocks } = await supabase
        .from('blocks')
        .select('id, number, block, block_name, quadra, project_id, geometry, front_segment_index')
        .eq('project_id', projectId);

      const { data: guides } = await supabase
        .from('street_guides')
        .select('*')
        .eq('project_id', projectId);

      setConfrontCtx({
        block: block as Record<string, unknown>,
        blocks: (blocks || []) as Record<string, unknown>[],
        guides: (guides || []) as Record<string, unknown>[],
      });
      setConfrontOpen(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar confrontações');
    } finally {
      setConfrontLoading(false);
    }
  }, [lot.id, projectId]);

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
          <p className="text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
            Lote {lot.number || '—'}
            {lot.block ? ` · Quadra ${lot.block}` : ''} selecionado.
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
              disabled={loading}
              onClick={() => void runGenerate('preview')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2d3340] hover:bg-[#3d4555] rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
              Visualizar
            </button>
            <button
              type="button"
              disabled={loading || confrontLoading}
              onClick={() => void openConfrontations()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600/90 hover:bg-amber-500 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {confrontLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
              CORRIGIR CONFRONTAÇÕES
            </button>
            <button
              type="button"
              onClick={onSelectAnotherLot}
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

      {confrontOpen && confrontCtx && (
        <CorrectConfrontationsModal
          blockId={lot.id}
          block={confrontCtx.block}
          blocks={confrontCtx.blocks}
          streetGuides={confrontCtx.guides}
          onClose={() => setConfrontOpen(false)}
        />
      )}
    </div>
  );
}
