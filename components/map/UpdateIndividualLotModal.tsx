'use client';

import { Loader2, Upload, X } from 'lucide-react';
import type { IndividualLotUpdateMode } from '@/lib/civil3dIndividualLotUpdate';

export type UpdateIndividualLotModalProps = {
  open: boolean;
  quadra: string;
  lotNumber: string;
  utmZone: string;
  file: File | null;
  mode: IndividualLotUpdateMode;
  loading: boolean;
  onClose: () => void;
  onQuadraChange: (value: string) => void;
  onLotNumberChange: (value: string) => void;
  onUtmZoneChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onModeChange: (mode: IndividualLotUpdateMode) => void;
  onSubmit: (e: React.FormEvent) => void;
};

const MODE_OPTIONS: {
  value: IndividualLotUpdateMode;
  label: string;
  hint: string;
}[] = [
  {
    value: 'geometry_technical',
    label: 'Substituir apenas geometria e dados técnicos (recomendado)',
    hint: 'Preserva preço, status, cliente, reserva, venda, contrato e confrontações manuais.',
  },
  {
    value: 'geometry_confrontations',
    label: 'Substituir geometria + confrontações',
    hint: 'Atualiza medidas e segmentos; remove confrontações manuais dos segmentos.',
  },
  {
    value: 'full_replacement',
    label: 'Substituição completa do lote',
    hint: 'Requer confirmação extra. Mantém vínculos comerciais, mas redefine frente/confrontações técnicas.',
  },
];

export function UpdateIndividualLotModal({
  open,
  quadra,
  lotNumber,
  utmZone,
  file,
  mode,
  loading,
  onClose,
  onQuadraChange,
  onLotNumberChange,
  onUtmZoneChange,
  onFileChange,
  onModeChange,
  onSubmit,
}: UpdateIndividualLotModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-lg overflow-hidden shadow-2xl fade-in-up max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h3 className="font-bold text-[var(--text-primary)] text-lg">
            Atualizar lote individual
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={onSubmit}
          className="p-6 flex flex-col gap-4 overflow-y-auto"
        >
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Substitui apenas o lote informado na quadra, sem apagar os demais
            lotes nem os dados comerciais já lançados (preço, status, cliente,
            reserva, venda e contrato).
          </p>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              Quadra
            </label>
            <input
              type="text"
              required
              value={quadra}
              onChange={(e) => onQuadraChange(e.target.value)}
              placeholder="Ex: 05"
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)] uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              Lote
            </label>
            <input
              type="text"
              required
              value={lotNumber}
              onChange={(e) => onLotNumberChange(e.target.value)}
              placeholder="Ex: 01"
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              Zona UTM
            </label>
            <select
              value={utmZone}
              onChange={(e) => onUtmZoneChange(e.target.value)}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
            >
              <option value="21S">Zona 21 Sul (21S)</option>
              <option value="22S">Zona 22 Sul (22S)</option>
              <option value="23S">Zona 23 Sul (23S)</option>
              <option value="24S">Zona 24 Sul (24S)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              Arquivo TXT Civil 3D
            </label>
            <input
              type="file"
              accept=".txt"
              required
              onChange={(e) => onFileChange(e.target.files?.[0] || null)}
              className="w-full text-sm text-[var(--color-text-muted)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)]/10 file:text-[var(--color-primary)] hover:file:bg-[var(--color-primary)]/20 file:transition-colors file:cursor-pointer cursor-pointer border border-[var(--color-border)] bg-[var(--color-background)] rounded-lg p-2"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              Modo de atualização
            </legend>
            {MODE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                  mode === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-background)]'
                }`}
              >
                <input
                  type="radio"
                  name="lotUpdateMode"
                  value={opt.value}
                  checked={mode === opt.value}
                  onChange={() => onModeChange(opt.value)}
                  className="mt-0.5 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--text-primary)]">
                    {opt.label}
                  </span>
                  <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                    {opt.hint}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <button
            type="submit"
            disabled={loading || !file}
            className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-[var(--text-primary)] font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2 shrink-0"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Atualizar lote
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
