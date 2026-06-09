'use client';

import { useState } from 'react';
import { Eraser, Loader2, Save, X } from 'lucide-react';
import {
  getAutomaticOfficialSideForSegment,
  officialSideDisplayLabel,
  readManualOfficialSideMap,
  type OfficialSideKind,
} from '@/lib/officialLotMeasurements';
import { getSegmentDistanceFromBlock } from '@/lib/officialSidePersist';

export type OfficialSideSelectValue =
  | 'auto'
  | OfficialSideKind;

const SIDE_OPTIONS: { value: OfficialSideSelectValue; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'front', label: 'Frente' },
  { value: 'back', label: 'Fundo' },
  { value: 'right', label: 'Lado Direito' },
  { value: 'left', label: 'Lado Esquerdo' },
  { value: 'chanfre', label: 'Chanfre' },
];

export type DefineOfficialSideModalProps = {
  blockId: string;
  block: Record<string, unknown>;
  segmentIndex: number;
  onClose: () => void;
  onSave: (side: OfficialSideKind) => Promise<void>;
  onClear: () => Promise<void>;
};

export function DefineOfficialSideModal({
  blockId,
  block,
  segmentIndex,
  onClose,
  onSave,
  onClear,
}: DefineOfficialSideModalProps) {
  const manualMap = readManualOfficialSideMap(block);
  const savedSide = manualMap.get(segmentIndex) ?? null;
  const autoSide = getAutomaticOfficialSideForSegment(
    block,
    segmentIndex,
    block.number,
  );
  const distance = getSegmentDistanceFromBlock(block, segmentIndex);

  const [selection, setSelection] = useState<OfficialSideSelectValue>(
    savedSide ?? 'auto',
  );
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleSave = async () => {
    if (selection === 'auto') {
      alert('Escolha um lado ou use Limpar para voltar ao automático.');
      return;
    }
    setSaving(true);
    try {
      await onSave(selection);
      onClose();
    } catch (e: unknown) {
      alert(
        e instanceof Error ? e.message : 'Erro ao salvar lado oficial',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (
      !confirm(
        'Remover o lado oficial deste segmento? A classificação automática será restaurada.',
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      await onClear();
      onClose();
    } catch (e: unknown) {
      alert(
        e instanceof Error ? e.message : 'Erro ao limpar lado oficial',
      );
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl w-full max-w-md shadow-2xl text-white">
        <div className="flex items-center justify-between p-4 border-b border-[#2d3340]">
          <h3 className="font-bold text-sm">Definir Medida Oficial</h3>
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
              <span className="text-gray-500">Segmento:</span>{' '}
              <strong>{segmentIndex + 1}</strong>
            </p>
            <p>
              <span className="text-gray-500">Comprimento:</span>{' '}
              <strong>
                {distance != null
                  ? `${distance.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} m`
                  : '—'}
              </strong>
            </p>
            <p>
              <span className="text-gray-500">Lado automático:</span>{' '}
              <strong>
                {autoSide
                  ? (officialSideDisplayLabel(autoSide) ?? autoSide)
                  : '—'}
              </strong>
            </p>
            <p>
              <span className="text-gray-500">Lado oficial salvo:</span>{' '}
              <strong className={savedSide ? 'text-violet-300' : 'text-gray-400'}>
                {savedSide
                  ? (officialSideDisplayLabel(savedSide) ?? savedSide)
                  : 'Automático'}
              </strong>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">
              Lado oficial da medida
            </label>
            <select
              value={selection}
              onChange={(e) =>
                setSelection(e.target.value as OfficialSideSelectValue)
              }
              className="w-full rounded-lg border border-[#2d3340] bg-[#0f1318] px-3 py-2 text-sm"
            >
              {SIDE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">
              ID bloco: {blockId.slice(0, 8)}…
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || clearing || selection === 'auto'}
              className="flex-1 min-w-[7rem] inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-3 py-2 text-xs font-bold"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar
            </button>
            {savedSide ? (
              <button
                type="button"
                onClick={() => void handleClear()}
                disabled={saving || clearing}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#2d3340] hover:bg-white/5 disabled:opacity-50 px-3 py-2 text-xs font-bold text-amber-300"
              >
                {clearing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Eraser className="w-4 h-4" />
                )}
                Limpar
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              disabled={saving || clearing}
              className="inline-flex items-center justify-center rounded-lg border border-[#2d3340] hover:bg-white/5 px-3 py-2 text-xs font-bold text-gray-400"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
