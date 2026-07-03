'use client';

import { Loader2, Trash2, X } from 'lucide-react';
import { formatQuadraLabel } from '@/lib/projectQuadras';
import { buildIndividualLotDeleteConfirmMessage } from '@/lib/gis/deleteIndividualLot';

export type DeleteIndividualLotModalProps = {
  open: boolean;
  quadra: string;
  lotNumber: string;
  confirmStep: boolean;
  loading: boolean;
  onClose: () => void;
  onQuadraChange: (value: string) => void;
  onLotNumberChange: (value: string) => void;
  onRequestConfirm: (e: React.FormEvent) => void;
  onBackToForm: () => void;
  onConfirmDelete: () => void;
};

export function DeleteIndividualLotModal({
  open,
  quadra,
  lotNumber,
  confirmStep,
  loading,
  onClose,
  onQuadraChange,
  onLotNumberChange,
  onRequestConfirm,
  onBackToForm,
  onConfirmDelete,
}: DeleteIndividualLotModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl fade-in-up">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="font-bold text-[var(--text-primary)] text-lg">Excluir lote</h3>
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

        {confirmStep ? (
          <div className="p-6">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
              {buildIndividualLotDeleteConfirmMessage(quadra, lotNumber)}
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                disabled={loading}
                onClick={onBackToForm}
                className="flex-1 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--text-secondary)] font-semibold hover:bg-[var(--color-background)] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={onConfirmDelete}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Excluir lote
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onRequestConfirm} className="p-6 flex flex-col gap-4">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Informe o lote da {formatQuadraLabel(quadra)} que deseja excluir
              permanentemente do mapa. A quadra e os demais lotes permanecem intactos.
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
                placeholder="Ex: 02"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)] uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                Número do lote
              </label>
              <input
                type="text"
                required
                value={lotNumber}
                onChange={(e) => onLotNumberChange(e.target.value)}
                placeholder="Ex: 04"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div className="flex gap-3 mt-2">
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
                disabled={loading || !quadra.trim() || !lotNumber.trim()}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Excluir lote
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
