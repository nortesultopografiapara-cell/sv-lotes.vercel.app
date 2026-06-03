'use client';

import { useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import {
  CONFRONTANT_PRESETS,
  type ConfrontantPresetType,
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
  onClose: () => void;
  onConfirm: (
    confrontant: string,
    confrontantType: ConfrontantPresetType | string | null,
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
  onClose,
  onConfirm,
}: InformConfrontantModalProps) {
  const [preset, setPreset] = useState<ConfrontantPresetType>('remnant_area');
  const [customText, setCustomText] = useState('');
  const [scope, setScope] = useState<PropagationScope>('lot_only');
  const [saving, setSaving] = useState(false);

  const selectedPreset = CONFRONTANT_PRESETS.find((p) => p.type === preset);
  const confrontantName =
    preset === 'other'
      ? customText.trim() || 'Outro'
      : customText.trim() || selectedPreset?.label || 'Outro';

  const targets = findPropagationTargets(
    allBlocks,
    block,
    blockId,
    side,
    scope,
  );

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

  const sideLabel =
    side === 'frente'
      ? 'Frente'
      : side === 'fundo'
        ? 'Fundo'
        : side === 'ladoDireito'
          ? 'Lado Direito'
          : 'Lado Esquerdo';

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl w-full max-w-md shadow-2xl text-white">
        <div className="flex items-center justify-between p-4 border-b border-[#2d3340]">
          <h3 className="font-bold text-sm">Informar confrontante</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-gray-400">
            {sideLabel}
            {segmentLabel ? ` · ${segmentLabel}` : ''} — lote{' '}
            {String(block.number ?? '')}
          </p>

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
              Nome do confrontante
            </label>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={
                preset === 'other'
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
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-[#2d3340]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-[#2d3340] text-sm font-semibold text-gray-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
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
  );
}
