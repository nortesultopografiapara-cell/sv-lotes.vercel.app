'use client';

import { useState } from 'react';
import { Eraser, Loader2, Save, X } from 'lucide-react';
import {
  CONFRONTANT_PRESETS,
  sourceDisplayLabel,
  type ConfrontantPresetType,
  type ConfrontantSource,
} from '@/lib/confrontantTypes';
import {
  findPropagationTargets,
  type PropagationScope,
} from '@/lib/assistedConfrontation';
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
  ) => Promise<void>;
  onClear?: (
    scope: PropagationScope,
    targetBlockIds: string[],
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
  const [scope, setScope] = useState<PropagationScope>('lot_only');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const selectedPreset = CONFRONTANT_PRESETS.find((p) => p.type === preset);
  const confrontantName =
    preset === 'other'
      ? customText.trim() || 'Outro'
      : customText.trim() || selectedPreset?.label || 'Outro';

  /**
   * Proteção secundária: nunca lançar na renderização (derruba /map → Something went wrong!).
   * Em falha: registra contexto, avisa o usuário e restringe ao lote atual com os
   * segmentIndexes já resolvidos pelo caller — sem inventar índices.
   */
  let targets: ReturnType<typeof findPropagationTargets> = [];
  let targetsError: string | null = null;
  try {
    targets = findPropagationTargets(
      allBlocks,
      block,
      blockId,
      side,
      scope,
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
      scope,
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
        segmentIndexes: Array.isArray(segmentIndexes) ? [...segmentIndexes] : [],
      },
    ];
  }

  const handleSave = async () => {
    if (!confrontantName.trim()) {
      alert('Informe o nome do confrontante.');
      return;
    }
    setSaving(true);
    try {
      upsertProjectConfrontationGuide(projectId, {
        name: confrontantName,
        type: preset === 'other' ? null : preset,
      });
      await onConfirm(
        confrontantName,
        preset === 'other' ? null : preset,
        scope,
        targets.map((t) => t.blockId),
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
      await onClear(scope, targets.map((t) => t.blockId));
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
      <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl w-full max-w-md shadow-2xl text-white">
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
              Aplicar em
            </label>
            <div className="space-y-1.5 text-xs">
              {(
                [
                  ['lot_only', 'Apenas este lote'],
                  ['quadra_same_side', 'Todos os fundos desta quadra (lados pendentes)'],
                  ['aligned_nearby', 'Segmentos alinhados pendentes na quadra'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === value}
                    onChange={() => setScope(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-amber-400/90 mt-2">
              {targets.length} lote(s) serão atualizados (manual não será
              sobrescrito pela automática).
            </p>
            {targetsError ? (
              <p className="text-[10px] text-red-400 mt-1">{targetsError}</p>
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
              disabled={saving || clearing}
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
