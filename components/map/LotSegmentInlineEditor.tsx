'use client';

import type { OfficialSideKind } from '@/lib/officialLotMeasurements';
import { OFFICIAL_SIDE_ACTIONS } from '@/lib/officialSidePersist';

export function LotSegmentInlineEditor({
  persistedSegLabel,
  persistedSideLabel,
  persistedConfrontant,
  draftSide,
  onDraftSideChange,
  draftConfrontant,
  onDraftConfrontantChange,
  dirty,
  saving,
  savedFlash,
  error,
  guardVisible,
  onSave,
  onDiscard,
}: {
  persistedSegLabel: string;
  persistedSideLabel: string;
  persistedConfrontant: string;
  draftSide: OfficialSideKind | null;
  onDraftSideChange: (side: OfficialSideKind | null) => void;
  draftConfrontant: string;
  onDraftConfrontantChange: (value: string) => void;
  dirty: boolean;
  saving: boolean;
  savedFlash: boolean;
  error: string | null;
  guardVisible: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const saveDisabled = !dirty || saving;
  const saveLabel = saving
    ? 'Salvando...'
    : savedFlash
      ? '✓ Salvo'
      : 'Salvar';

  return (
    <div
      data-testid="segment-inline-editor"
      className="flex gap-2.5 min-w-0"
    >
      <div
        data-testid="segment-card-persisted"
        className="w-[32%] min-w-0 shrink-0 pr-1"
      >
        <p className="font-bold text-gray-900 leading-tight">
          {persistedSegLabel}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">
          {persistedSideLabel}
        </p>
        <p
          className="text-gray-800 font-medium leading-snug mt-0.5 break-words"
          title={persistedConfrontant}
        >
          {persistedConfrontant || '—'}
        </p>
      </div>
      <div className="flex-1 min-w-0 border-l border-gray-200 pl-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <select
            data-testid="segment-side-select"
            aria-label="selecionar lados"
            value={draftSide ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              onDraftSideChange(v === '' ? null : (v as OfficialSideKind));
            }}
            className="flex-1 min-w-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-900"
          >
            {OFFICIAL_SIDE_ACTIONS.map((a) => (
              <option key={a.label} value={a.side ?? ''}>
                {a.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="segment-save"
            onClick={onSave}
            disabled={saveDisabled}
            className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] font-bold ${
              savedFlash
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : saveDisabled
                  ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                  : 'bg-blue-600 text-white border border-blue-600 hover:bg-blue-700'
            }`}
          >
            {saveLabel}
          </button>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-0.5">
            Confrontante
          </p>
          <input
            data-testid="segment-confrontant-input"
            value={draftConfrontant}
            onChange={(e) => onDraftConfrontantChange(e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-900"
          />
        </div>
        {error ? (
          <p className="text-[10px] font-semibold text-red-600 leading-snug">
            {error}
          </p>
        ) : null}
        {guardVisible ? (
          <div
            data-testid="segment-unsaved-guard"
            className="rounded-md bg-amber-50 px-2 py-1.5 space-y-1"
          >
            <p className="text-[10px] text-amber-900 leading-snug">
              Salve ou descarte as alteracoes do segmento atual antes de
              continuar.
            </p>
            <button
              type="button"
              onClick={onDiscard}
              className="text-[10px] font-bold text-amber-800 hover:underline"
            >
              Descartar alteracoes
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
