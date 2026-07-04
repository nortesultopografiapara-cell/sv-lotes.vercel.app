'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import {
  validateAreaMeasureExportForm,
  type AreaMeasureExportForm,
} from '@/lib/gis/areaMeasurePdf';

export type AreaMeasureExportModalProps = {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (form: AreaMeasureExportForm) => void;
};

export function AreaMeasureExportModal({
  open,
  loading = false,
  onClose,
  onSubmit,
}: AreaMeasureExportModalProps) {
  const [form, setForm] = useState<AreaMeasureExportForm>({
    propertyName: '',
    ownerName: '',
    observations: '',
  });
  const [error, setError] = useState('');
  const propertyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError('');
      setTimeout(() => propertyRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!loading) onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, loading, onClose]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateAreaMeasureExportForm(form);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError('');
    onSubmit({
      propertyName: form.propertyName.trim(),
      ownerName: form.ownerName.trim(),
      observations: form.observations.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl fade-in-up"
        data-testid="gis-area-measure-export-modal"
      >
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="font-bold text-[var(--text-primary)] text-base">
            Identificação da Área
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-[var(--color-text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              Nome da propriedade *
            </label>
            <input
              ref={propertyRef}
              type="text"
              required
              value={form.propertyName}
              onChange={(e) => setForm((f) => ({ ...f, propertyName: e.target.value }))}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
              placeholder="Ex.: Fazenda Santa Maria"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              Nome do proprietário *
            </label>
            <input
              type="text"
              required
              value={form.ownerName}
              onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
              placeholder="Ex.: João da Silva"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              Observações (opcional)
            </label>
            <textarea
              value={form.observations}
              onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
              rows={3}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Informações adicionais sobre a medição"
            />
          </div>

          {error ? (
            <p className="text-xs text-red-400 font-medium">{error}</p>
          ) : null}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--text-secondary)] font-semibold hover:bg-[var(--color-background)] transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="gis-area-measure-export-submit"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Gerar PDF
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
