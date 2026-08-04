'use client';

import { useMemo, useState } from 'react';
import { Eraser, Loader2, Save, X } from 'lucide-react';
import {
  CONFRONTANT_PRESETS,
  sourceDisplayLabel,
  type ConfrontantPresetType,
  type ConfrontantSource,
} from '@/lib/confrontantTypes';
import {
  findPropagationTargets,
  resolveSegmentPersistIndexes,
  type PropagationScope,
  type SegmentPersistScope,
} from '@/lib/assistedConfrontation';
import { getSegmentConfrontantRecord } from '@/lib/segmentConfrontantPersist';
import type { SideRole } from '@/lib/lotSegmentConfrontation';
import { upsertProjectConfrontationGuide } from '@/lib/projectConfrontationGuides';

export type InformConfrontantModalProps = {
  projectId: string;
  blockId: string;
  block: Record<string, unknown>;
  allBlocks: Record<string, unknown>[];
  side: SideRole;
  segmentIndexes: number[];
  segmentLabel?: string;
  currentConfrontant?: string | null;
  currentSource?: ConfrontantSource | null;
  onClose: () => void;
  onConfirm: (
    confrontant: string,
    confrontantType: ConfrontantPresetType | string | null,
    scope: PropagationScope,
    targetBlockIds: string[],
    persistScope: SegmentPersistScope,
    explicitIndexes: number[],
  ) => Promise<void>;
  onClear?: (
    scope: PropagationScope,
    targetBlockIds: string[],
    persistScope: SegmentPersistScope,
    explicitIndexes: number[],
  ) => Promise<void>;
};

export function InformConfrontantModal({
  projectId,
  blockId,
  block,
  allBlocks,
  side,
  segmentIndexes,
  segmentLabel,
  currentConfrontant,
  currentSource,
  onClose,
  onConfirm,
  onClear,
}: InformConfrontantModalProps) {
  const [preset, setPreset] = useState<ConfrontantPresetType>('lot');
  const [customText, setCustomText] = useState('');
  const [persistScope, setPersistScope] =
    useState<SegmentPersistScope>('selected_only');
  const [lotScope, setLotScope] = useState<PropagationScope>('lot_only');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const selectedPreset = CONFRONTANT_PRESETS.find((p) => p.type === preset);
  const confrontantName =
    preset === 'other'
      ? customText.trim() || 'Outro'
      : customText.trim() || selectedPreset?.label || 'Outro';

  const resolvedIndexes = useMemo(() => {
    try {
      return resolveSegmentPersistIndexes({
        block,
        allBlocks,
        side,
        selectedIndexes: segmentIndexes,
        persistScope,
      });
    } catch {
      return Array.isArray(segmentIndexes) ? [...segmentIndexes] : [];
    }
  }, [block, allBlocks, side, segmentIndexes, persistScope]);

  /**
   * Proteção secundária: nunca lançar na renderização.
   */
  let targets: ReturnType<typeof findPropagationTargets> = [];
  let targetsError: string | null = null;
  try {
    const effectiveLotScope: PropagationScope =
      persistScope === 'selected_only' ||
      persistScope === 'consecutive_same_confrontant'
        ? 'lot_only'
        : lotScope;
    targets = findPropagationTargets(
      allBlocks,
      block,
      blockId,
      side,
      effectiveLotScope,
      null,
      {
        explicitIndexes: segmentIndexes,
        persistScope,
      },
    );
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : 'Falha ao calcular alvos de propagação.';
    console.error('[InformConfrontantModal] findPropagationTargets', {
      projectId,
      blockId,
      lotNumber: block?.number ?? null,
      side,
      persistScope,
      lotScope,
      segmentIndexes,
      message: msg,
      err,
    });
    targetsError =
      'Não foi possível calcular a propagação automática. O mapa continua ativo — salve apenas neste lote ou feche e tente novamente.';
    targets = [
      {
        blockId,
        block,
        segmentIndexes: resolvedIndexes,
      },
    ];
  }

  const previewRows = useMemo(() => {
    return resolvedIndexes.map((idx) => {
      const prev =
        getSegmentConfrontantRecord(block, idx)?.confrontant ??
        currentConfrontant ??
        'A DEFINIR';
      return { idx, prev };
    });
  }, [resolvedIndexes, block, currentConfrontant]);

  const handleSave = async () => {
    if (!confrontantName.trim()) {
      alert('Informe o nome do confrontante.');
      return;
    }
    if (!resolvedIndexes.length) {
      alert('Nenhum segmento no escopo selecionado.');
      return;
    }
    setSaving(true);
    try {
      upsertProjectConfrontationGuide(projectId, {
        project_id: projectId,
        name: confrontantName,
        type: preset === 'other' ? null : preset,
      });
      const effectiveLotScope: PropagationScope =
        persistScope === 'selected_only' ||
        persistScope === 'consecutive_same_confrontant'
          ? 'lot_only'
          : lotScope;
      await onConfirm(
        confrontantName,
        preset === 'other' ? null : preset,
        effectiveLotScope,
        targets.map((t) => t.blockId),
        persistScope,
        segmentIndexes,
      );
      onClose();
    } catch (e: unknown) {
      alert(
        e instanceof Error ? e.message : 'Erro ao salvar confrontante',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!onClear) return;
    if (
      !confirm(
        'Remover a correção manual deste(s) segmento(s)? O confrontante automático será restaurado.',
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      const effectiveLotScope: PropagationScope =
        persistScope === 'selected_only' ||
        persistScope === 'consecutive_same_confrontant'
          ? 'lot_only'
          : lotScope;
      await onClear(
        effectiveLotScope,
        targets.map((t) => t.blockId),
        persistScope,
        segmentIndexes,
      );
      onClose();
    } catch (e: unknown) {
      alert(
        e instanceof Error ? e.message : 'Erro ao limpar confrontante',
      );
    } finally {
      setClearing(false);
    }
  };

  const sideLabel =
    side === 'frente'
      ? 'Frente'
      : side === 'fundo'
        ? 'Fundo'
        : side === 'ladoDireito'
          ? 'Lado Direito'
          : 'Lado Esquerdo';

  const segmentDisplay =
    segmentIndexes.length === 1
      ? `Segmento ${segmentIndexes[0] + 1}`
      : `Segmentos ${segmentIndexes.map((i) => i + 1).join(', ')}`;

  const canClearManual = currentSource === 'manual';

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl w-full max-w-md shadow-2xl text-white max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-[#2d3340]">
          <h3 className="font-bold text-sm">Editar Confrontação</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-lg border border-[#2d3340] bg-[#0f1318] px-3 py-2 text-xs space-y-1">
            <p>
              <span className="text-gray-500">Lote:</span>{' '}
              <strong>{String(block.number ?? '')}</strong>
              {block.block_name ? (
                <span className="text-gray-400">
                  {' '}
                  · QD {String(block.block_name)}
                </span>
              ) : null}
            </p>
            <p>
              <span className="text-gray-500">Lado:</span>{' '}
              <strong>{sideLabel}</strong>
            </p>
            <p>
              <span className="text-gray-500">Seleção:</span>{' '}
              <strong>{segmentLabel ?? segmentDisplay}</strong>
            </p>
            {currentConfrontant ? (
              <p>
                <span className="text-gray-500">Atual:</span>{' '}
                <strong>{currentConfrontant}</strong>
                {currentSource ? (
                  <span className="text-gray-500">
                    {' '}
                    ({sourceDisplayLabel(currentSource)})
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-amber-400/90">Confrontante pendente (A DEFINIR)</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">
              Tipo
            </label>
            <select
              value={preset}
              onChange={(e) =>
                setPreset(e.target.value as ConfrontantPresetType)
              }
              className="w-full rounded-lg border border-[#2d3340] bg-[#0f1318] px-3 py-2 text-sm"
            >
              {CONFRONTANT_PRESETS.map((p) => (
                <option key={p.type} value={p.type}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">
              Novo confrontante
            </label>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={
                preset === 'lot'
                  ? 'Ex.: Lote 07'
                  : preset === 'street'
                    ? 'Ex.: RUA CENTRAL 01'
                    : preset === 'other'
                      ? 'Texto livre'
                      : selectedPreset?.label ?? ''
              }
              className="w-full rounded-lg border border-[#2d3340] bg-[#0f1318] px-3 py-2 text-sm"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Será salvo como: <strong>{confrontantName}</strong>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Segmentos neste lote
            </label>
            <div className="space-y-1.5 text-xs">
              {(
                [
                  ['selected_only', 'Somente este segmento'],
                  ['entire_side', 'Todos os segmentos deste lado'],
                  [
                    'consecutive_same_confrontant',
                    'Segmentos consecutivos com o mesmo confrontante',
                  ],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="persistScope"
                    checked={persistScope === value}
                    onChange={() => setPersistScope(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {persistScope === 'entire_side' ? (
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2">
                Propagar para outros lotes
              </label>
              <div className="space-y-1.5 text-xs">
                {(
                  [
                    ['lot_only', 'Apenas este lote'],
                    [
                      'quadra_same_side',
                      'Mesmo lado nesta quadra (lados pendentes)',
                    ],
                    [
                      'aligned_nearby',
                      'Segmentos alinhados pendentes na quadra',
                    ],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="lotScope"
                      checked={lotScope === value}
                      onChange={() => setLotScope(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-[#2d3340] bg-[#0f1318] px-3 py-2 text-[10px] space-y-1">
            <p className="font-semibold text-gray-300">Prévia do salvamento</p>
            <p className="text-gray-500">
              {targets.length} lote(s) · segmentos neste lote:{' '}
              <strong className="text-gray-200">
                {resolvedIndexes.map((i) => i + 1).join(', ') || '—'}
              </strong>
            </p>
            {previewRows.slice(0, 8).map((row) => (
              <p key={row.idx} className="text-gray-400">
                Seg. {row.idx + 1}: “{row.prev}” → “{confrontantName}”
              </p>
            ))}
            {previewRows.length > 8 ? (
              <p className="text-gray-500">
                … e mais {previewRows.length - 8} segmento(s)
              </p>
            ) : null}
            {targetsError ? (
              <p className="text-red-400 mt-1">{targetsError}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 p-4 border-t border-[#2d3340]">
          {onClear && canClearManual ? (
            <button
              type="button"
              disabled={clearing || saving}
              onClick={() => void handleClear()}
              className="w-full py-2 rounded-lg border border-amber-600/50 text-amber-400 hover:bg-amber-500/10 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {clearing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eraser className="w-4 h-4" />
              )}
              Limpar correção manual
            </button>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[#2d3340] text-sm font-semibold text-gray-300 hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || clearing || !resolvedIndexes.length}
              onClick={() => void handleSave()}
              className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
