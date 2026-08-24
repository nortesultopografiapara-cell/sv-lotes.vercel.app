'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  confrontationRowHasData,
  loadLotConfrontations,
} from '@/lib/lotConfrontationsPanel';
import type { SideRole } from '@/lib/assistedConfrontation';
import { parseOfficialSegmentsFromBlock } from '@/lib/officialLotMeasurements';
import { LotConfrontationGeometryPreview } from '@/components/map/LotConfrontationGeometryPreview';
import { useIsWideDesktop } from '@/hooks/use-mobile';
import type { OfficialSideKind } from '@/lib/officialLotMeasurements';
import type { ConfrontantPresetType } from '@/lib/confrontantTypes';
import { getSegmentConfrontantRecord } from '@/lib/segmentConfrontantPersist';
import {
  applySingleOfficialSegmentDraftToBlock,
  draftMapFromBlock,
} from '@/lib/officialSidePersist';
import { LotSegmentInlineEditor } from '@/components/map/LotSegmentInlineEditor';
import type {
  ConfrontantDraftMap,
  OfficialSideDraftMap,
} from '@/lib/officialSidePersist';

const SUMMARY_SIDES: Array<{ key: SideRole; fallbackLabel: string }> = [
  { key: 'frente', fallbackLabel: 'Frente' },
  { key: 'fundo', fallbackLabel: 'Fundo' },
  { key: 'ladoDireito', fallbackLabel: 'Lado direito' },
  { key: 'ladoEsquerdo', fallbackLabel: 'Lado esquerdo' },
];

function sideRoleToKind(role: SideRole): OfficialSideKind | null {
  if (role === 'frente') return 'front';
  if (role === 'fundo') return 'back';
  if (role === 'ladoDireito') return 'right';
  if (role === 'ladoEsquerdo') return 'left';
  return null;
}

function pickType(raw: string | null | undefined): ConfrontantPresetType {
  if (
    raw === 'lot' ||
    raw === 'street' ||
    raw === 'private_property' ||
    raw === 'app' ||
    raw === 'institutional_area' ||
    raw === 'other'
  ) {
    return raw;
  }
  return 'lot';
}

export type LotConfrontationsPanelProps = {
  lot: Record<string, unknown>;
  streetGuides?: Record<string, unknown>[];
  allBlocks?: Record<string, unknown>[];
  frenteConfrontLabel?: string | null;
  frontStreetLabel?: string | null;
  canEdit?: boolean;
  onEditSide?: (lot: Record<string, unknown>, side: SideRole) => void;
  onEditSegment?: (
    lot: Record<string, unknown>,
    side: SideRole,
    segmentIndexes: number[],
  ) => void;
  cleanedCoords?: Array<[number, number]> | null;
  selectedSegmentIndexes?: number[];
  onStartOfficialSidesEdit?: (
    lot: Record<string, unknown>,
    initialSelected?: number[],
  ) => void;
  editingOfficialSides?: boolean;
  onEditorSlotReady?: (el: HTMLElement | null) => void;
  officialSidesSaving?: boolean;
  onPersistOfficialSides?: (
    patched: Record<string, unknown>,
    sideDraft: OfficialSideDraftMap,
    confrontantDraft: ConfrontantDraftMap,
  ) => Promise<void>;
};

export function LotConfrontationsPanel({
  lot,
  streetGuides = [],
  allBlocks = [],
  frenteConfrontLabel = null,
  frontStreetLabel = null,
  canEdit = false,
  onEditSide,
  onEditSegment,
  cleanedCoords = null,
  selectedSegmentIndexes = [],
  onStartOfficialSidesEdit,
  editingOfficialSides = false,
  onEditorSlotReady,
  officialSidesSaving = false,
  onPersistOfficialSides,
}: LotConfrontationsPanelProps) {
  const isWideDesktop = useIsWideDesktop();
  const [retryTick, setRetryTick] = useState(0);
  const [localSelected, setLocalSelected] = useState<number | null>(null);
  const [draftSide, setDraftSide] = useState<OfficialSideKind | null>(null);
  const [draftConfrontant, setDraftConfrontant] = useState('');
  const [draftType, setDraftType] = useState<ConfrontantPresetType>('lot');
  const [persistedSide, setPersistedSide] = useState<OfficialSideKind | null>(
    null,
  );
  const [persistedConfrontant, setPersistedConfrontant] = useState('');
  const [guardVisible, setGuardVisible] = useState(false);
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const selectedIdxRef = useRef<number | null>(null);

  const result = useMemo(() => {
    void retryTick;
    return loadLotConfrontations({
      lot,
      allBlocks,
      streetGuides,
      frenteConfrontLabel,
      frontStreetLabel,
    });
  }, [
    lot,
    allBlocks,
    streetGuides,
    frenteConfrontLabel,
    frontStreetLabel,
    retryTick,
  ]);

  const segmentDistances = useMemo(() => {
    try {
      const parsed = parseOfficialSegmentsFromBlock(lot);
      const map = new Map<number, number>();
      for (const s of parsed) {
        const idx = Number(s.segment_index);
        if (Number.isFinite(idx) && Number.isFinite(s.distance)) {
          map.set(idx, Number(s.distance));
        }
      }
      return map;
    } catch {
      return new Map<number, number>();
    }
  }, [lot]);

  const retry = useCallback(() => {
    setRetryTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!editingOfficialSides) {
      onEditorSlotReady?.(null);
    }
  }, [editingOfficialSides, onEditorSlotReady]);

  const selectedSet = useMemo(() => {
    if (selectedSegmentIndexes.length) return new Set(selectedSegmentIndexes);
    if (localSelected != null) return new Set([localSelected]);
    return new Set<number>();
  }, [selectedSegmentIndexes, localSelected]);

  const selectedIdx =
    localSelected != null
      ? localSelected
      : selectedSegmentIndexes[0] != null
        ? selectedSegmentIndexes[0]
        : null;

  const loadSnap = useCallback(
    (idx: number, role: SideRole, rowText: string) => {
      const official = draftMapFromBlock(lot).get(idx) ?? null;
      const rec = getSegmentConfrontantRecord(lot, idx);
      const name = (rec?.confrontant?.trim() || rowText || '').trim();
      return {
        side: official ?? sideRoleToKind(role),
        name,
        type: pickType(rec?.confrontant_type),
      };
    },
    [lot],
  );

  useEffect(() => {
    if (selectedIdx == null || result.status !== 'ready') return;
    const row = result.rows.find((r) => r.segmentIndex === selectedIdx);
    if (!row) return;
    const snap = loadSnap(selectedIdx, row.key, row.text);
    setPersistedSide(snap.side);
    setPersistedConfrontant(snap.name);
    if (selectedIdxRef.current !== selectedIdx) {
      selectedIdxRef.current = selectedIdx;
      setDraftSide(snap.side);
      setDraftConfrontant(snap.name);
      setDraftType(snap.type);
      setGuardVisible(false);
      setSaveError(null);
      setSavedFlash(false);
    }
  }, [lot, selectedIdx, result, loadSnap]);

  const dirty =
    selectedIdx != null &&
    (draftSide !== persistedSide ||
      draftConfrontant.trim() !== persistedConfrontant.trim());

  const startEdit = (indexes?: number[]) => {
    if (onStartOfficialSidesEdit) {
      onStartOfficialSidesEdit(lot, indexes);
    }
  };

  const stopMapLeak = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    const native = e.nativeEvent;
    native.stopPropagation();
    native.stopImmediatePropagation?.();
  };

  const applySelection = (idx: number) => {
    setLocalSelected(idx);
    setGuardVisible(false);
    setPendingIdx(null);
    setSavedFlash(false);
    setSaveError(null);
  };

  const trySelect = (idx: number) => {
    if (dirty && selectedIdx != null && idx !== selectedIdx) {
      setGuardVisible(true);
      setPendingIdx(idx);
      return;
    }
    applySelection(idx);
  };

  const handleSegmentClick = (
    e: React.MouseEvent,
    segmentIndex: number,
    side: SideRole,
  ) => {
    stopMapLeak(e);
    if (isWideDesktop && canEdit && onPersistOfficialSides) {
      trySelect(segmentIndex);
      return;
    }
    setLocalSelected(segmentIndex);
    if (onStartOfficialSidesEdit) {
      startEdit([segmentIndex]);
      return;
    }
    if (canEdit && onEditSegment && segmentIndex >= 0) {
      onEditSegment(lot, side, [segmentIndex]);
    } else if (canEdit && onEditSide) {
      onEditSide(lot, side);
    }
  };

  useEffect(() => {
    const container = listRef.current;
    const el = selectedCardRef.current;
    if (!container || !el) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    if (eRect.bottom > cRect.bottom) {
      container.scrollTop += eRect.bottom - cRect.bottom + 8;
    } else if (eRect.top < cRect.top) {
      container.scrollTop -= cRect.top - eRect.top + 8;
    }
  }, [selectedIdx, dirty, guardVisible]);

  const handleSave = async () => {
    if (!onPersistOfficialSides || selectedIdx == null || !dirty) return;
    setSaveError(null);
    const { patched, sideDraft, confrontantDraft } =
      applySingleOfficialSegmentDraftToBlock(
        lot,
        selectedIdx,
        draftSide,
        {
          name: draftConfrontant,
          type: draftType,
          previous: persistedConfrontant,
        },
      );
    try {
      await onPersistOfficialSides(patched, sideDraft, confrontantDraft);
      setPersistedSide(draftSide);
      setPersistedConfrontant(draftConfrontant.trim());
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1400);
    } catch (e: unknown) {
      setSaveError(
        e instanceof Error ? e.message : 'Erro ao salvar o segmento.',
      );
    }
  };

  const handleDiscard = () => {
    setDraftSide(persistedSide);
    setDraftConfrontant(persistedConfrontant);
    setGuardVisible(false);
    const next = pendingIdx;
    setPendingIdx(null);
    if (next != null) applySelection(next);
  };

  if (result.status === 'error') {
    return (
      <div className="space-y-2 py-2 text-center">
        <p className="text-[10px] text-red-600 font-semibold leading-snug">
          {result.error ?? 'Erro ao carregar confrontações.'}
        </p>
        <button
          type="button"
          onClick={retry}
          className="text-[10px] font-bold text-blue-600 hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (result.status === 'empty') {
    return (
      <p className="text-[10px] text-gray-500 py-2 text-center leading-snug">
        Nenhuma confrontação cadastrada para este lote.
      </p>
    );
  }

  const rows = result.rows;
  const allEmpty = rows.every((row) => !confrontationRowHasData(row));
  const summary = SUMMARY_SIDES.map(({ key, fallbackLabel }) => {
    const ofSide = rows.filter((r) => r.key === key);
    const texts = ofSide
      .filter((r) => confrontationRowHasData(r))
      .map((r) => r.text.trim())
      .filter(Boolean);
    return {
      key,
      label: ofSide[0]?.sideLabel ?? fallbackLabel,
      text: texts.length ? texts.join(' · ') : '—',
    };
  });

  const canStartOfficialEdit = Boolean(
    canEdit &&
      onStartOfficialSidesEdit &&
      !editingOfficialSides &&
      !isWideDesktop,
  );
  const inlineEnabled = Boolean(
    isWideDesktop && canEdit && onPersistOfficialSides,
  );

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full text-[11px]">
      <section className="shrink-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Resumo das confrontações
          </p>
          {canStartOfficialEdit ? (
            <button
              type="button"
              onClick={() => startEdit()}
              className="text-[10px] font-bold text-blue-700 hover:underline shrink-0"
            >
              Editar
            </button>
          ) : null}
        </div>
        {allEmpty ? (
          <p className="text-[10px] text-gray-500 pb-1 leading-snug">
            Confrontações ainda não definidas (A DEFINIR).
          </p>
        ) : null}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {summary.map((card) => (
            <div
              key={card.key}
              className="rounded-lg border border-gray-200 bg-gray-50/70 px-2.5 py-2 min-w-0"
            >
              <p className="text-[10px] text-gray-500 font-semibold">
                {card.label}
              </p>
              <p
                className="font-semibold text-gray-900 leading-snug truncate"
                title={card.text}
              >
                {card.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div
        data-testid="confrontations-workspace"
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,38%)_minmax(0,62%)] gap-3 min-h-0 flex-1 lg:min-h-[min(70vh,520px)]"
      >
        <section className="min-h-0 flex flex-col">
          <div className="min-h-[170px] lg:min-h-0 lg:flex-1 h-[220px] lg:h-auto">
            <LotConfrontationGeometryPreview
              positions={cleanedCoords}
              selectedIndexes={[...selectedSet]}
              onSelectIndex={(idx) => {
                if (inlineEnabled) {
                  trySelect(idx);
                  return;
                }
                setLocalSelected(idx);
                if (onStartOfficialSidesEdit) startEdit([idx]);
              }}
            />
          </div>
        </section>
        <section className="min-h-0 flex flex-col">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1.5 shrink-0">
            Segmentos do lote
          </p>
          <div
            ref={listRef}
            data-testid="confrontations-segment-list"
            className="min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-0.5"
          >
            {rows.map((row) => {
              const idx = row.segmentIndex;
              const isSel = selectedSet.has(idx);
              const dist = segmentDistances.get(idx);
              const distLabel =
                dist != null && Number.isFinite(dist)
                  ? `${dist.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} m`
                  : null;
              const segLabel = `Seg. ${idx >= 0 ? idx + 1 : '—'}${
                distLabel ? ` · ${distLabel}` : ''
              }`;
              const showInline = inlineEnabled && isSel;
              return showInline ? (
                <div
                  key={`${row.key}-${idx}`}
                  ref={selectedCardRef}
                  data-testid="segment-card-selected"
                  className="w-full text-left rounded-lg border px-2.5 py-2 border-blue-400 bg-blue-50/80 ring-1 ring-blue-200"
                  onMouseDown={stopMapLeak}
                  onPointerDown={stopMapLeak}
                >
                  <LotSegmentInlineEditor
                    persistedSegLabel={segLabel}
                    persistedSideLabel={row.sideLabel}
                    persistedConfrontant={row.text || '—'}
                    draftSide={draftSide}
                    onDraftSideChange={(side) => {
                      setDraftSide(side);
                      setSavedFlash(false);
                    }}
                    draftConfrontant={draftConfrontant}
                    onDraftConfrontantChange={(value) => {
                      setDraftConfrontant(value);
                      setSavedFlash(false);
                    }}
                    dirty={dirty}
                    saving={officialSidesSaving}
                    savedFlash={savedFlash}
                    error={saveError}
                    guardVisible={guardVisible}
                    onSave={() => void handleSave()}
                    onDiscard={handleDiscard}
                  />
                </div>
              ) : (
                <button
                  key={`${row.key}-${idx}`}
                  type="button"
                  data-testid="segment-card"
                  aria-pressed={isSel}
                  onMouseDown={stopMapLeak}
                  onPointerDown={stopMapLeak}
                  onClick={(e) => handleSegmentClick(e, idx, row.key)}
                  className={`w-full text-left rounded-lg border px-2.5 py-2 transition-colors ${
                    isSel
                      ? 'border-blue-400 bg-blue-50/80 ring-1 ring-blue-200'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{segLabel}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        {row.sideLabel}
                      </p>
                      <p
                        className="text-gray-800 font-medium truncate"
                        title={row.text}
                      >
                        {row.text || '—'}
                      </p>
                    </div>
                    <span
                      className={`text-[9px] shrink-0 ${
                        isSel
                          ? 'text-blue-600 font-semibold'
                          : 'text-gray-400'
                      }`}
                    >
                      {isSel ? 'selecionado' : row.origin}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
