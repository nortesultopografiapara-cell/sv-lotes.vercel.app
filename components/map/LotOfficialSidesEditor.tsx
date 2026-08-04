'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, Save, X } from 'lucide-react';
import type { OfficialSideKind } from '@/lib/officialLotMeasurements';
import { parseOfficialSegmentsFromBlock } from '@/lib/officialLotMeasurements';
import { getSegmentConfrontantRecord } from '@/lib/segmentConfrontantPersist';
import {
  applyOfficialSideDraftToBlock,
  draftMapFromBlock,
  previewOfficialSideDraft,
  setDraftSides,
  type OfficialSideDraftMap,
} from '@/lib/officialSidePersist';

const SIDE_ACTIONS: Array<{ side: OfficialSideKind | null; label: string }> = [
  { side: 'front', label: 'Frente' },
  { side: 'back', label: 'Fundo' },
  { side: 'right', label: 'Lado direito' },
  { side: 'left', label: 'Lado esquerdo' },
  { side: null, label: 'Limpar' },
];

function sideLabel(side: OfficialSideKind | null | undefined): string {
  if (side === 'front') return 'Frente';
  if (side === 'back') return 'Fundo';
  if (side === 'right') return 'Dir.';
  if (side === 'left') return 'Esq.';
  if (side === 'chanfre') return 'Chanfre';
  return '—';
}

export type LotOfficialSidesEditorProps = {
  lot: Record<string, unknown>;
  saving?: boolean;
  /** Seleção controlada (mapa ↔ painel). */
  selected?: number[];
  onSelectedChange?: (indexes: number[]) => void;
  onDraftChange?: (draft: OfficialSideDraftMap) => void;
  onClose: () => void;
  onSave: (
    patchedBlock: Record<string, unknown>,
    draft: OfficialSideDraftMap,
  ) => Promise<void>;
  onRestoreAutomatic: () => Promise<void>;
};

export function LotOfficialSidesEditor({
  lot,
  saving = false,
  selected: selectedProp,
  onSelectedChange,
  onDraftChange,
  onClose,
  onSave,
  onRestoreAutomatic,
}: LotOfficialSidesEditorProps) {
  const [draft, setDraft] = useState<OfficialSideDraftMap>(() =>
    draftMapFromBlock(lot),
  );
  const [selectedLocal, setSelectedLocal] = useState<number[]>([]);
  const selected = selectedProp ?? selectedLocal;

  const setSelected = (next: number[] | ((prev: number[]) => number[])) => {
    const resolved =
      typeof next === 'function' ? next(selectedProp ?? selectedLocal) : next;
    if (onSelectedChange) onSelectedChange(resolved);
    else setSelectedLocal(resolved);
  };

  useEffect(() => {
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);

  const segments = useMemo(
    () =>
      [...parseOfficialSegmentsFromBlock(lot)].sort(
        (a, b) => a.segment_index - b.segment_index,
      ),
    [lot],
  );

  const preview = useMemo(
    () => previewOfficialSideDraft(lot, draft),
    [lot, draft],
  );
  const { validation, measures } = preview;

  const toggleSelect = (idx: number, additive: boolean) => {
    setSelected((prev) => {
      if (additive) {
        return prev.includes(idx)
          ? prev.filter((x) => x !== idx)
          : [...prev, idx].sort((a, b) => a - b);
      }
      return prev.length === 1 && prev[0] === idx ? [] : [idx];
    });
  };

  const applySide = (side: OfficialSideKind | null) => {
    if (!selected.length) {
      alert('Selecione um ou mais segmentos.');
      return;
    }
    setDraft((d) => setDraftSides(d, selected, side));
  };

  const handleSave = async () => {
    if (!validation.ok) {
      alert(validation.errors.join('\n') || 'Classificação incompleta.');
      return;
    }
    const patched = applyOfficialSideDraftToBlock(lot, draft);
    await onSave(patched, draft);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[1200] w-[min(100vw-2rem,380px)] max-h-[min(85vh,640px)] overflow-hidden rounded-xl border border-[#2d3340] bg-[#1a1f29] text-white shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d3340]">
        <div>
          <h3 className="text-sm font-bold">Editar lados do lote</h3>
          <p className="text-[10px] text-gray-400">
            Lote {String(lot.number ?? '')}
            {lot.block_name || lot.block
              ? ` · QD ${String(lot.block_name ?? lot.block)}`
              : ''}
            {' · clique nas arestas do mapa'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-[#2d3340] flex flex-wrap gap-1">
        {SIDE_ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => applySide(a.side)}
            disabled={!selected.length || saving}
            className="px-2 py-1 rounded text-[10px] font-bold border border-[#2d3340] bg-[#0f1318] hover:bg-white/10 disabled:opacity-40"
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {segments.map((s) => {
          const idx = s.segment_index;
          const isSel = selected.includes(idx);
          const side = draft.get(idx) ?? null;
          const confront =
            getSegmentConfrontantRecord(lot, idx)?.confrontant ?? '—';
          return (
            <button
              key={idx}
              type="button"
              onClick={(e) =>
                toggleSelect(idx, e.shiftKey || e.ctrlKey || e.metaKey)
              }
              className={`w-full text-left rounded-lg border px-2 py-1.5 text-[11px] ${
                isSel
                  ? 'border-emerald-500/60 bg-emerald-500/10'
                  : 'border-[#2d3340] bg-[#0f1318] hover:bg-white/5'
              }`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-bold">
                  Seg. {idx + 1}
                  <span className="text-gray-400 font-normal">
                    {' '}
                    · {Number(s.distance).toFixed(2)} m
                  </span>
                </span>
                <span className="text-amber-300 font-semibold">
                  {sideLabel(side)}
                </span>
              </div>
              <div className="text-[10px] text-gray-400 truncate">
                {confront}
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-3 py-2 border-t border-[#2d3340] text-[10px] space-y-1 bg-[#0f1318]">
        <p>
          Frente [{validation.indexes.front.map((i) => i + 1).join(',') || '—'}] ={' '}
          <strong>{validation.totals.frente.toFixed(2)} m</strong>
        </p>
        <p>
          Dir. [{validation.indexes.right.map((i) => i + 1).join(',') || '—'}] ={' '}
          <strong>{validation.totals.ladoDireito.toFixed(2)} m</strong>
        </p>
        <p>
          Fundo [{validation.indexes.back.map((i) => i + 1).join(',') || '—'}] ={' '}
          <strong>{validation.totals.fundo.toFixed(2)} m</strong>
        </p>
        <p>
          Esq. [{validation.indexes.left.map((i) => i + 1).join(',') || '—'}] ={' '}
          <strong>{validation.totals.ladoEsquerdo.toFixed(2)} m</strong>
        </p>
        <p className="text-gray-400">
          Cobertura {validation.coverage.covered}/{validation.coverage.total}
          {validation.orphans.length
            ? ` · órfãos: ${validation.orphans.map((i) => i + 1).join(',')}`
            : ''}
          {' · '}Δ perímetro{' '}
          {Math.abs(
            validation.totals.sidesSum - validation.totals.perimeter,
          ).toFixed(2)}{' '}
          m
        </p>
        {validation.errors.map((e) => (
          <p key={e} className="text-red-400">
            {e}
          </p>
        ))}
        {validation.warnings.map((w) => (
          <p key={w} className="text-amber-400/90">
            {w}
          </p>
        ))}
        <p className="text-gray-500">
          Medição oficial: F {Number(measures.frente ?? 0).toFixed(2)} · D{' '}
          {Number(measures.ladoDireito ?? 0).toFixed(2)} · Fu{' '}
          {Number(measures.fundo ?? 0).toFixed(2)} · E{' '}
          {Number(measures.ladoEsquerdo ?? 0).toFixed(2)}
        </p>
      </div>

      <div className="p-3 border-t border-[#2d3340] flex flex-col gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void onRestoreAutomatic()}
          className="w-full py-2 rounded-lg border border-amber-600/40 text-amber-300 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restaurar classificação automática
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-[#2d3340] text-xs font-semibold text-gray-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !validation.ok}
            onClick={() => void handleSave()}
            className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
