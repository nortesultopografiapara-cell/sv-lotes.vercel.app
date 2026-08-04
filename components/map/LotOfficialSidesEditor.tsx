'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RotateCcw, Save, X } from 'lucide-react';
import type { OfficialSideKind } from '@/lib/officialLotMeasurements';
import { parseOfficialSegmentsFromBlock } from '@/lib/officialLotMeasurements';
import { getSegmentConfrontantRecord } from '@/lib/segmentConfrontantPersist';
import type { ConfrontantPresetType } from '@/lib/confrontantTypes';
import {
  applyOfficialEditorDraftToBlock,
  draftMapFromBlock,
  looksLikeAggregatedSideConfrontant,
  OFFICIAL_SIDES_PANEL_POSITION_CLASS,
  previewOfficialSideDraft,
  resolveIndividualSegmentConfrontantLabel,
  setConfrontantDraftEntry,
  setDraftSides,
  snapshotSegmentsJson,
  type ConfrontantDraftMap,
  type OfficialSideDraftMap,
} from '@/lib/officialSidePersist';

const SIDE_ACTIONS: Array<{ side: OfficialSideKind | null; label: string }> = [
  { side: 'front', label: 'Frente' },
  { side: 'back', label: 'Fundo' },
  { side: 'right', label: 'Lado direito' },
  { side: 'left', label: 'Lado esquerdo' },
  { side: null, label: 'Limpar' },
];

const EDITOR_CONFRONTANT_TYPES: Array<{
  type: ConfrontantPresetType;
  label: string;
}> = [
  { type: 'lot', label: 'Lote' },
  { type: 'street', label: 'Rua' },
  { type: 'private_property', label: 'Propriedade particular' },
  { type: 'app', label: 'APP' },
  { type: 'institutional_area', label: 'Área pública' },
  { type: 'other', label: 'Outro' },
];

function sideLabel(side: OfficialSideKind | null | undefined): string {
  if (side === 'front') return 'Frente';
  if (side === 'back') return 'Fundo';
  if (side === 'right') return 'Dir.';
  if (side === 'left') return 'Esq.';
  if (side === 'chanfre') return 'Chanfre';
  return '—';
}

function pickType(raw: string | null | undefined): ConfrontantPresetType {
  if (raw && EDITOR_CONFRONTANT_TYPES.some((p) => p.type === raw)) {
    return raw as ConfrontantPresetType;
  }
  return 'lot';
}

function SegmentConfrontantForm({
  focusIdx,
  distanceM,
  currentLabel,
  initialName,
  initialType,
  saving,
  onApply,
}: {
  focusIdx: number;
  distanceM: number;
  currentLabel: string;
  initialName: string;
  initialType: ConfrontantPresetType;
  saving: boolean;
  onApply: (name: string, type: ConfrontantPresetType) => void;
}) {
  const [newConfrontant, setNewConfrontant] = useState(initialName);
  const [confrontantType, setConfrontantType] =
    useState<ConfrontantPresetType>(initialType);

  return (
    <div className="px-3 py-2 border-t border-[#2d3340] space-y-2 shrink-0 bg-[#12161e]">
      <p className="text-[11px] font-bold text-emerald-300">
        Confrontante · Seg. {focusIdx + 1}
      </p>
      <p className="text-[10px] text-gray-400">
        {distanceM.toFixed(2)} m · atual:{' '}
        <strong className="text-gray-200">{currentLabel}</strong>
      </p>
      {looksLikeAggregatedSideConfrontant(currentLabel) ? (
        <p className="text-[10px] text-amber-400/90">
          Este texto parece agregação do lado inteiro. Corrija para o
          confrontante individual deste segmento.
        </p>
      ) : null}
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">Tipo</label>
        <select
          value={confrontantType}
          onChange={(e) =>
            setConfrontantType(e.target.value as ConfrontantPresetType)
          }
          className="w-full rounded-lg border border-[#2d3340] bg-[#0f1318] px-2 py-1.5 text-[11px]"
        >
          {EDITOR_CONFRONTANT_TYPES.map((p) => (
            <option key={p.type} value={p.type}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">
          Novo confrontante
        </label>
        <input
          value={newConfrontant}
          onChange={(e) => setNewConfrontant(e.target.value)}
          className="w-full rounded-lg border border-[#2d3340] bg-[#0f1318] px-2 py-1.5 text-[11px]"
          placeholder="Ex.: LOTE 02"
        />
      </div>
      <button
        type="button"
        disabled={saving || !newConfrontant.trim()}
        onClick={() => onApply(newConfrontant.trim(), confrontantType)}
        className="w-full py-1.5 rounded-lg border border-sky-500/50 bg-sky-500/15 text-sky-200 text-[10px] font-bold disabled:opacity-40"
      >
        Aplicar somente neste segmento
      </button>
    </div>
  );
}

export type LotOfficialSidesEditorProps = {
  lot: Record<string, unknown>;
  saving?: boolean;
  selected?: number[];
  onSelectedChange?: (indexes: number[]) => void;
  onDraftChange?: (draft: OfficialSideDraftMap) => void;
  onClose: () => void;
  onSave: (
    patchedBlock: Record<string, unknown>,
    draft: OfficialSideDraftMap,
    confrontantDraft: ConfrontantDraftMap,
  ) => Promise<void>;
  onRestoreAutomatic: (
    sessionBaseline: Record<string, unknown>[] | null,
  ) => Promise<void>;
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
  const sessionBaselineRef = useRef(snapshotSegmentsJson(lot));
  const [draft, setDraft] = useState<OfficialSideDraftMap>(() =>
    draftMapFromBlock(lot),
  );
  const [confrontantDraft, setConfrontantDraft] = useState<ConfrontantDraftMap>(
    () => new Map(),
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

  const focusIdx = selected.length === 1 ? selected[0] : null;

  const segments = useMemo(
    () =>
      [...parseOfficialSegmentsFromBlock(lot)].sort(
        (a, b) => a.segment_index - b.segment_index,
      ),
    [lot],
  );

  const preview = useMemo(
    () => previewOfficialSideDraft(lot, draft, confrontantDraft),
    [lot, draft, confrontantDraft],
  );
  const { validation, measures } = preview;

  const focusSegment =
    focusIdx != null
      ? segments.find((s) => s.segment_index === focusIdx) ?? null
      : null;

  const focusCurrentLabel =
    focusIdx != null
      ? resolveIndividualSegmentConfrontantLabel(
          lot,
          focusIdx,
          confrontantDraft,
        )
      : '—';

  const formInitial = useMemo(() => {
    if (focusIdx == null) {
      return { name: '', type: 'lot' as ConfrontantPresetType, key: 'none' };
    }
    const draftEntry = confrontantDraft.get(focusIdx);
    if (draftEntry) {
      return {
        name: draftEntry.confrontant,
        type: pickType(
          typeof draftEntry.confrontant_type === 'string'
            ? draftEntry.confrontant_type
            : null,
        ),
        key: `d-${focusIdx}-${draftEntry.confrontant}`,
      };
    }
    const rec = getSegmentConfrontantRecord(lot, focusIdx);
    return {
      name: rec?.confrontant ?? '',
      type: pickType(
        typeof rec?.confrontant_type === 'string' ? rec.confrontant_type : null,
      ),
      key: `p-${focusIdx}-${rec?.confrontant ?? ''}`,
    };
  }, [focusIdx, confrontantDraft, lot]);

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

  const applyConfrontantSelectedOnly = (
    name: string,
    type: ConfrontantPresetType,
  ) => {
    if (focusIdx == null) {
      alert('Selecione exatamente um segmento para editar o confrontante.');
      return;
    }
    if (!name.trim()) {
      alert('Informe o novo confrontante.');
      return;
    }
    const previous = resolveIndividualSegmentConfrontantLabel(lot, focusIdx);
    setConfrontantDraft((d) =>
      setConfrontantDraftEntry(d, focusIdx, {
        confrontant: name.trim(),
        confrontant_type: type === 'other' ? null : type,
        previous: previous === '—' ? '' : previous,
      }),
    );
  };

  const handleSave = async () => {
    if (!validation.ok) {
      alert(validation.errors.join('\n') || 'Classificação incompleta.');
      return;
    }
    const patched = applyOfficialEditorDraftToBlock(
      lot,
      draft,
      confrontantDraft,
    );
    await onSave(patched, draft, confrontantDraft);
  };

  const confrontantPreviewRows = useMemo(
    () =>
      [...confrontantDraft.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([idx, entry]) => ({
          idx,
          prev: entry.previous || '—',
          next: entry.confrontant,
        })),
    [confrontantDraft],
  );

  return (
    <div
      data-testid="official-sides-editor-panel"
      className={`${OFFICIAL_SIDES_PANEL_POSITION_CLASS} overflow-hidden rounded-xl border border-[#2d3340] bg-[#1a1f29] text-white shadow-2xl flex flex-col`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d3340] shrink-0">
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

      <div className="px-3 py-2 border-b border-[#2d3340] flex flex-wrap gap-1 shrink-0">
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

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1">
        {segments.map((s) => {
          const idx = s.segment_index;
          const isSel = selected.includes(idx);
          const side = draft.get(idx) ?? null;
          const confront = resolveIndividualSegmentConfrontantLabel(
            lot,
            idx,
            confrontantDraft,
          );
          const pendingEdit = confrontantDraft.has(idx);
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
                  {pendingEdit ? (
                    <span className="ml-1 text-sky-400 font-semibold">
                      · editado
                    </span>
                  ) : null}
                </span>
                <span className="text-amber-300 font-semibold">
                  {sideLabel(side)}
                </span>
              </div>
              <div
                className="text-[10px] text-gray-400 truncate"
                title={confront}
              >
                {confront}
              </div>
            </button>
          );
        })}
      </div>

      {focusIdx != null && focusSegment ? (
        <>
          <SegmentConfrontantForm
            key={formInitial.key}
            focusIdx={focusIdx}
            distanceM={Number(focusSegment.distance)}
            currentLabel={focusCurrentLabel}
            initialName={formInitial.name}
            initialType={formInitial.type}
            saving={saving}
            onApply={applyConfrontantSelectedOnly}
          />
          {confrontantPreviewRows.length > 0 ? (
            <div className="px-3 py-1.5 border-t border-[#2d3340] shrink-0">
              <div className="rounded-lg border border-[#2d3340] bg-[#0f1318] px-2 py-1.5 text-[10px] space-y-1">
                <p className="font-semibold text-gray-300">
                  Prévia (em memória até Salvar)
                </p>
                {confrontantPreviewRows.map((row) => (
                  <p key={row.idx} className="text-gray-400">
                    Seg. {row.idx + 1}:{' '}
                    <span className="text-red-300/90">{row.prev}</span>
                    {' → '}
                    <span className="text-emerald-300">{row.next}</span>
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="px-3 py-1.5 border-t border-[#2d3340] text-[10px] text-gray-500 shrink-0">
          Selecione um segmento para editar o confrontante individual
          (selected_only).
        </div>
      )}

      <div className="px-3 py-2 border-t border-[#2d3340] text-[10px] space-y-1 bg-[#0f1318] shrink-0">
        <p>
          Frente [{validation.indexes.front.map((i) => i + 1).join(',') || '—'}]
          = <strong>{validation.totals.frente.toFixed(2)} m</strong>
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

      <div className="p-3 border-t border-[#2d3340] flex flex-col gap-2 shrink-0">
        <button
          type="button"
          disabled={saving}
          onClick={() => void onRestoreAutomatic(sessionBaselineRef.current)}
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
