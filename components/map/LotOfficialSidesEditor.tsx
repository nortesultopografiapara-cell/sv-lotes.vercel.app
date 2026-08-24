'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  embedded = false,
}: {
  focusIdx: number;
  distanceM: number;
  currentLabel: string;
  initialName: string;
  initialType: ConfrontantPresetType;
  saving: boolean;
  onApply: (name: string, type: ConfrontantPresetType) => void;
  embedded?: boolean;
}) {
  const [newConfrontant, setNewConfrontant] = useState(initialName);
  const [confrontantType, setConfrontantType] =
    useState<ConfrontantPresetType>(initialType);

  return (
    <div
      className={
        embedded
          ? 'px-3 py-2 border-t border-gray-200 space-y-2 shrink-0 bg-gray-50/80'
          : 'px-3 py-2 border-t border-[#2d3340] space-y-2 shrink-0 bg-[#12161e]'
      }
    >
      <p
        className={
          embedded
            ? 'text-[11px] font-bold text-emerald-800'
            : 'text-[11px] font-bold text-emerald-300'
        }
      >
        Editar segmento · Seg. {focusIdx + 1}
      </p>
      <p
        className={
          embedded ? 'text-[10px] text-gray-500' : 'text-[10px] text-gray-400'
        }
      >
        Comprimento: {distanceM.toFixed(2)} m · atual:{' '}
        <strong className={embedded ? 'text-gray-800' : 'text-gray-200'}>
          {currentLabel}
        </strong>
      </p>
      {looksLikeAggregatedSideConfrontant(currentLabel) ? (
        <p
          className={
            embedded
              ? 'text-[10px] text-amber-700'
              : 'text-[10px] text-amber-400/90'
          }
        >
          Este texto parece agregação do lado inteiro. Corrija para o
          confrontante individual deste segmento.
        </p>
      ) : null}
      <div>
        <label
          className={
            embedded
              ? 'block text-[10px] text-gray-500 mb-0.5'
              : 'block text-[10px] text-gray-500 mb-0.5'
          }
        >
          Tipo
        </label>
        <select
          value={confrontantType}
          onChange={(e) =>
            setConfrontantType(e.target.value as ConfrontantPresetType)
          }
          className={
            embedded
              ? 'w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-900'
              : 'w-full rounded-lg border border-[#2d3340] bg-[#0f1318] px-2 py-1.5 text-[11px]'
          }
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
          Confrontante
        </label>
        <input
          value={newConfrontant}
          onChange={(e) => setNewConfrontant(e.target.value)}
          className={
            embedded
              ? 'w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-900'
              : 'w-full rounded-lg border border-[#2d3340] bg-[#0f1318] px-2 py-1.5 text-[11px]'
          }
          placeholder="Ex.: LOTE 02"
        />
      </div>
      <button
        type="button"
        disabled={saving || !newConfrontant.trim()}
        onClick={() => onApply(newConfrontant.trim(), confrontantType)}
        className={
          embedded
            ? 'w-full py-1.5 rounded-lg border border-sky-300 bg-sky-50 text-sky-900 text-[10px] font-bold disabled:opacity-40'
            : 'w-full py-1.5 rounded-lg border border-sky-500/50 bg-sky-500/15 text-sky-200 text-[10px] font-bold disabled:opacity-40'
        }
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
  /** overlay = painel lateral escuro; embedded = aba Confrontações (mesmo motor). */
  variant?: 'overlay' | 'embedded';
  portalTarget?: HTMLElement | null;
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
  variant = 'overlay',
  portalTarget = null,
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

  const embedded = variant === 'embedded';
  const uniformSide =
    selected.length > 0 &&
    selected.every(
      (i) => (draft.get(i) ?? null) === (draft.get(selected[0]) ?? null),
    )
      ? (draft.get(selected[0]) ?? null)
      : undefined;

  const hairline = embedded ? 'border-gray-200' : 'border-[#2d3340]';
  const muted = embedded ? 'text-gray-500' : 'text-gray-400';
  const panel = (
    <div
      data-testid="official-sides-editor-panel"
      data-variant={variant}
      className={
        embedded
          ? 'flex flex-col min-h-0 h-full overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900'
          : `${OFFICIAL_SIDES_PANEL_POSITION_CLASS} overflow-hidden rounded-xl border border-[#2d3340] bg-[#1a1f29] text-white shadow-2xl flex flex-col`
      }
    >
      <div
        className={`flex items-center justify-between px-3 py-2 border-b ${hairline} shrink-0`}
      >
        <div>
          <h3 className="text-sm font-bold">Editar lados do lote</h3>
          <p className={`text-[10px] ${muted}`}>
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
          className={
            embedded
              ? 'p-1.5 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-100'
              : 'p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10'
          }
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        className={`px-3 py-2 border-b ${hairline} flex flex-wrap gap-1 shrink-0`}
      >
        {SIDE_ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => applySide(a.side)}
            disabled={!selected.length || saving}
            className={`px-2 py-1 rounded text-[10px] font-bold border disabled:opacity-40 ${
              selected.length > 0 && uniformSide === a.side
                ? embedded
                  ? 'border-blue-500 bg-blue-50 text-blue-800'
                  : 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100'
                : embedded
                  ? 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                  : 'border-[#2d3340] bg-[#0f1318] hover:bg-white/10'
            }`}
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
                  ? embedded
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-emerald-500/60 bg-emerald-500/10'
                  : embedded
                    ? 'border-gray-200 bg-white hover:bg-gray-50'
                    : 'border-[#2d3340] bg-[#0f1318] hover:bg-white/5'
              }`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-bold">
                  Seg. {idx + 1}
                  <span
                    className={`${embedded ? 'text-gray-500' : 'text-gray-400'} font-normal`}
                  >
                    {' '}
                    · {Number(s.distance).toFixed(2)} m
                  </span>
                  {pendingEdit ? (
                    <span
                      className={`ml-1 font-semibold ${embedded ? 'text-sky-700' : 'text-sky-400'}`}
                    >
                      · editado
                    </span>
                  ) : null}
                </span>
                <span
                  className={`font-semibold ${embedded ? 'text-amber-800' : 'text-amber-300'}`}
                >
                  {sideLabel(side)}
                </span>
              </div>
              <div
                className={`text-[10px] truncate ${muted}`}
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
            embedded={embedded}
          />
          {confrontantPreviewRows.length > 0 ? (
            <div className={`px-3 py-1.5 border-t ${hairline} shrink-0`}>
              <div
                className={`rounded-lg border px-2 py-1.5 text-[10px] space-y-1 ${
                  embedded
                    ? 'border-gray-200 bg-gray-50'
                    : 'border-[#2d3340] bg-[#0f1318]'
                }`}
              >
                <p
                  className={`font-semibold ${embedded ? 'text-gray-700' : 'text-gray-300'}`}
                >
                  Prévia (em memória até Salvar)
                </p>
                {confrontantPreviewRows.map((row) => (
                  <p
                    key={row.idx}
                    className={embedded ? 'text-gray-600' : 'text-gray-400'}
                  >
                    Seg. {row.idx + 1}:{' '}
                    <span
                      className={embedded ? 'text-red-700' : 'text-red-300/90'}
                    >
                      {row.prev}
                    </span>
                    {' → '}
                    <span
                      className={
                        embedded ? 'text-emerald-700' : 'text-emerald-300'
                      }
                    >
                      {row.next}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div
          className={`px-3 py-1.5 border-t ${hairline} text-[10px] ${muted} shrink-0`}
        >
          Selecione um segmento para editar o confrontante individual
          (selected_only).
        </div>
      )}

      <div
        className={`px-3 py-2 border-t ${hairline} text-[10px] space-y-1 shrink-0 ${
          embedded ? 'bg-gray-50/80' : 'bg-[#0f1318]'
        }`}
      >
        {embedded ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
              Diagnóstico da geometria
            </p>
            <div className="grid grid-cols-2 gap-1.5 pb-1">
              <div className="rounded-md border border-gray-200 bg-white px-2 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                  Cobertura
                </p>
                <p className="font-bold text-gray-900">
                  {validation.coverage.covered} / {validation.coverage.total}{' '}
                  segmentos
                </p>
              </div>
              <div className="rounded-md border border-gray-200 bg-white px-2 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                  Órfãos
                </p>
                <p className="font-bold text-gray-900">
                  {validation.orphans.length}
                </p>
              </div>
              <div className="rounded-md border border-gray-200 bg-white px-2 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                  Perímetro
                </p>
                <p className="font-bold text-gray-900">
                  {validation.totals.perimeter.toFixed(2)} m
                </p>
              </div>
              <div className="rounded-md border border-gray-200 bg-white px-2 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                  Classificação
                </p>
                <p className="font-bold text-gray-900">
                  {validation.ok ? 'Completa' : 'Incompleta'}
                </p>
              </div>
            </div>
          </>
        ) : null}
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
        <p className={muted}>
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
          <p key={e} className={embedded ? 'text-red-600' : 'text-red-400'}>
            {e}
          </p>
        ))}
        {validation.warnings.map((w) => (
          <p
            key={w}
            className={embedded ? 'text-amber-700' : 'text-amber-400/90'}
          >
            {w}
          </p>
        ))}
        <p className={embedded ? 'text-gray-500' : 'text-gray-500'}>
          Medição oficial: F {Number(measures.frente ?? 0).toFixed(2)} · D{' '}
          {Number(measures.ladoDireito ?? 0).toFixed(2)} · Fu{' '}
          {Number(measures.fundo ?? 0).toFixed(2)} · E{' '}
          {Number(measures.ladoEsquerdo ?? 0).toFixed(2)}
        </p>
      </div>

      <div
        className={`p-3 border-t ${hairline} flex flex-col gap-2 shrink-0`}
      >
        <button
          type="button"
          disabled={saving}
          onClick={() => void onRestoreAutomatic(sessionBaselineRef.current)}
          className={
            embedded
              ? 'w-full py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50'
              : 'w-full py-2 rounded-lg border border-amber-600/40 text-amber-300 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50'
          }
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restaurar classificação automática
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className={
              embedded
                ? 'flex-1 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50'
                : 'flex-1 py-2 rounded-lg border border-[#2d3340] text-xs font-semibold text-gray-300'
            }
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !validation.ok}
            onClick={() => void handleSave()}
            className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
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

  if (embedded) {
    if (!portalTarget) return null;
    return createPortal(panel, portalTarget);
  }
  return panel;
}
