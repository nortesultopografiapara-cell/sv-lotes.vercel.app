'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import {
  autoLotSideConfrontants,
  loadManualConfrontants,
  resolveLotSideConfrontants,
  saveManualConfrontants,
  type ManualSideConfrontants,
} from '@/lib/lotConfrontations';
import type { LotSheetSideConfrontants } from '@/lib/lotSheetEnrichment';

type Props = {
  blockId: string;
  block: Record<string, unknown>;
  blocks: Record<string, unknown>[];
  streetGuides: Record<string, unknown>[];
  onClose: () => void;
  onSaved?: () => void;
};

export function CorrectConfrontationsModal({
  blockId,
  block,
  blocks,
  streetGuides,
  onClose,
  onSaved,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [auto, setAuto] = useState<LotSheetSideConfrontants>({
    frente: '',
    fundo: '',
    ladoDireito: '',
    ladoEsquerdo: '',
  });
  const [form, setForm] = useState<LotSheetSideConfrontants>({
    frente: '',
    fundo: '',
    ladoDireito: '',
    ladoEsquerdo: '',
  });

  useEffect(() => {
    const resolved = resolveLotSideConfrontants(
      block,
      blockId,
      blocks,
      streetGuides,
    );
    const manual = loadManualConfrontants(blockId);
    setAuto(autoLotSideConfrontants(block, blockId, blocks, streetGuides));
    setForm({
      frente: manual?.frente ?? resolved.frente,
      fundo: manual?.fundo ?? resolved.fundo,
      ladoDireito: manual?.ladoDireito ?? resolved.ladoDireito,
      ladoEsquerdo: manual?.ladoEsquerdo ?? resolved.ladoEsquerdo,
    });
  }, [block, blockId, blocks, streetGuides]);

  const handleChange = (key: keyof LotSheetSideConfrontants, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setSaving(true);
    const payload: ManualSideConfrontants = {
      frente: form.frente.trim() || undefined,
      fundo: form.fundo.trim() || undefined,
      ladoDireito: form.ladoDireito.trim() || undefined,
      ladoEsquerdo: form.ladoEsquerdo.trim() || undefined,
    };
    saveManualConfrontants(blockId, payload);
    setSaving(false);
    onSaved?.();
    onClose();
  };

  const fields: { key: keyof LotSheetSideConfrontants; label: string }[] = [
    { key: 'frente', label: 'Frente' },
    { key: 'ladoDireito', label: 'Lado Direito' },
    { key: 'ladoEsquerdo', label: 'Lado Esquerdo' },
    { key: 'fundo', label: 'Fundos' },
  ];

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl w-full max-w-lg shadow-2xl text-white">
        <div className="flex items-center justify-between p-4 border-b border-[#2d3340]">
          <h3 className="font-bold text-sm">Corrigir Confrontações</h3>
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
            Sugestão automática com base na quadra e ruas. Ajuste manualmente quando
            necessário; a correção vale para prancha e memorial.
          </p>

          {fields.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-400 mb-1">
                {label}
              </label>
              <input
                type="text"
                value={form[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={auto[key] || '—'}
                className="w-full px-3 py-2 bg-[#0f1319] border border-[#2d3340] rounded-lg text-sm text-white focus:outline-none focus:border-[#4999e9]"
              />
              {auto[key] && auto[key] !== form[key] && (
                <p className="text-[10px] text-gray-500 mt-1">
                  Automático: {auto[key]}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 p-4 border-t border-[#2d3340]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-400 hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-semibold disabled:opacity-50"
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
