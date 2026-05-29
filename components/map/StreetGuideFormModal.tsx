'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, MapPin } from 'lucide-react';
import {
  STREET_TYPES,
  emptyStreetGuideForm,
  streetGuideFromRecord,
  type StreetGuideFormValues,
  type StreetGuideRecord,
} from '@/lib/streetGuide';

type Props = {
  mode: 'create' | 'edit';
  guide?: StreetGuideRecord | null;
  onClose: () => void;
  onSave: (form: StreetGuideFormValues) => Promise<void>;
};

export function StreetGuideFormModal({
  mode,
  guide,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<StreetGuideFormValues>(emptyStreetGuideForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'edit' && guide) {
      setForm(streetGuideFromRecord(guide));
    } else {
      setForm(emptyStreetGuideForm());
    }
  }, [mode, guide]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Informe o nome do logradouro.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar logradouro');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl w-full max-w-md shadow-2xl text-white">
        <div className="flex items-center justify-between p-4 border-b border-[#2d3340]">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm">
              {mode === 'create' ? 'Cadastrar Logradouro' : 'Editar Logradouro'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">
              Tipo
            </label>
            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-[#0f1218] border border-[#2d3340] rounded-lg text-sm text-white"
            >
              {STREET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">
              Nome do logradouro *
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Ex.: das Acácias"
              className="w-full px-3 py-2 bg-[#0f1218] border border-[#2d3340] rounded-lg text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">
                Código interno
              </label>
              <input
                type="text"
                name="code"
                value={form.code}
                onChange={handleChange}
                placeholder="RUA-01"
                className="w-full px-3 py-2 bg-[#0f1218] border border-[#2d3340] rounded-lg text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">
                Largura da via (m)
              </label>
              <input
                type="text"
                name="width"
                value={form.width}
                onChange={handleChange}
                placeholder="12,00"
                className="w-full px-3 py-2 bg-[#0f1218] border border-[#2d3340] rounded-lg text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">
              Sentido / observação
            </label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={2}
              className="w-full px-3 py-2 bg-[#0f1218] border border-[#2d3340] rounded-lg text-sm text-white resize-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              name="active"
              checked={form.active}
              onChange={handleChange}
              className="rounded"
            />
            Ativo
          </label>

          {error && (
            <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : null}
            Salvar logradouro
          </button>
        </form>
      </div>
    </div>
  );
}
