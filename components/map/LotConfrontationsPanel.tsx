'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  confrontationRowHasData,
  loadLotConfrontations,
  type SideRole,
} from '@/lib/lotConfrontationsPanel';

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
}: LotConfrontationsPanelProps) {
  const [retryTick, setRetryTick] = useState(0);

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

  const retry = useCallback(() => {
    setRetryTick((n) => n + 1);
  }, []);

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

  return (
    <div className="space-y-1 text-[11px]">
      {allEmpty ? (
        <p className="text-[10px] text-gray-500 pb-1 text-center leading-snug">
          Confrontações ainda não definidas (A DEFINIR).
        </p>
      ) : null}
      {rows.map(({ key, sideLabel, segmentIndex, text, origin }) => (
        <div
          key={`${key}-${segmentIndex}`}
          className="flex items-center justify-between gap-1 py-0.5 border-b border-gray-50 last:border-0"
        >
          <span className="text-gray-500 shrink-0 w-[88px] leading-tight">
            {sideLabel}
            {segmentIndex >= 0 ? (
              <span className="block text-[9px] text-gray-400">
                Seg. {segmentIndex + 1}
              </span>
            ) : null}
          </span>
          <span className="flex-1 text-gray-900 font-medium text-right leading-tight min-w-0">
            <span className="block truncate">{text}</span>
            <span className="text-[9px] text-gray-400 font-normal">
              ({origin})
            </span>
          </span>
          <div className="shrink-0 flex flex-col items-end gap-0.5">
            {canEdit && (onEditSegment || onEditSide) ? (
              <button
                type="button"
                onClick={() => {
                  if (onEditSegment && segmentIndex >= 0) {
                    onEditSegment(lot, key, [segmentIndex]);
                  } else if (onEditSide) {
                    onEditSide(lot, key);
                  }
                }}
                className="text-[9px] font-bold text-blue-600 hover:underline px-1"
              >
                Editar
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
