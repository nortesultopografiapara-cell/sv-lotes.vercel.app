'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  confrontationRowHasData,
  loadLotConfrontations,
  type SideRole,
} from '@/lib/lotConfrontationsPanel';
import { parseOfficialSegmentsFromBlock } from '@/lib/officialLotMeasurements';
import { LotConfrontationGeometryPreview } from '@/components/map/LotConfrontationGeometryPreview';

const SUMMARY_SIDES: Array<{ key: SideRole; fallbackLabel: string }> = [
  { key: 'frente', fallbackLabel: 'Frente' },
  { key: 'fundo', fallbackLabel: 'Fundo' },
  { key: 'ladoDireito', fallbackLabel: 'Lado direito' },
  { key: 'ladoEsquerdo', fallbackLabel: 'Lado esquerdo' },
];

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
};

/**
 * Aba Confrontações do popup do lote — carga e lista independentes da toolbar MapGIS.
 */
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
}: LotConfrontationsPanelProps) {
  const [retryTick, setRetryTick] = useState(0);
  const [localSelected, setLocalSelected] = useState<number | null>(null);

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

  const handleSegmentClick = (
    e: React.MouseEvent,
    segmentIndex: number,
    side: SideRole,
  ) => {
    stopMapLeak(e);
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
    canEdit && onStartOfficialSidesEdit && !editingOfficialSides,
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 min-h-0 flex-1">
        <section className="lg:col-span-2 min-h-[140px]">
          <LotConfrontationGeometryPreview
            positions={cleanedCoords}
            selectedIndexes={[...selectedSet]}
          />
        </section>
        <section className="lg:col-span-3 min-h-0 flex flex-col">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1.5 shrink-0">
            Segmentos do lote
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-0.5">
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
              return (
                <button
                  key={`${row.key}-${idx}`}
                  type="button"
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
                      <p className="font-bold text-gray-900">
                        Seg. {idx >= 0 ? idx + 1 : '—'}
                        {distLabel ? (
                          <span className="text-gray-500 font-semibold">
                            {' '}
                            · {distLabel}
                          </span>
                        ) : null}
                      </p>
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
                        isSel ? 'text-blue-600 font-semibold' : 'text-gray-400'
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

      {editingOfficialSides ? (
        <section className="shrink-0 min-h-[220px] max-h-[min(42vh,320px)] overflow-hidden">
          <div
            ref={(el) => {
              onEditorSlotReady?.(el);
            }}
            className="h-full min-h-[220px] overflow-hidden"
            data-testid="official-sides-editor-slot"
          />
        </section>
      ) : null}
    </div>
  );
}
