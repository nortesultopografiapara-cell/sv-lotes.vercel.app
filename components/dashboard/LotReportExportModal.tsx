'use client';

import { useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2, X } from 'lucide-react';
import type {
  LotReportFormat,
  LotReportGroupBy,
  LotReportOptions,
  LotReportSortBy,
} from '@/lib/lotReportExport/types';

export type LotReportExportModalProps = {
  open: boolean;
  initialFormat: LotReportFormat;
  projectLabel: string;
  loading?: boolean;
  onClose: () => void;
  onGenerate: (options: LotReportOptions) => Promise<void>;
};

const defaultFilters = {
  includeAvailable: true,
  includeReserved: true,
  includeSold: true,
  includePaid: true,
};

export function LotReportExportModal({
  open,
  initialFormat,
  projectLabel,
  loading = false,
  onClose,
  onGenerate,
}: LotReportExportModalProps) {
  const [format, setFormat] = useState<LotReportFormat>(initialFormat);
  const [groupBy, setGroupBy] = useState<LotReportGroupBy>('quadra');
  const [sortBy, setSortBy] = useState<LotReportSortBy>('quadra_lote');
  const [filters, setFilters] = useState(defaultFilters);

  useEffect(() => {
    if (open) setFormat(initialFormat);
  }, [open, initialFormat]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const anyStatus =
      filters.includeAvailable ||
      filters.includeReserved ||
      filters.includeSold ||
      filters.includePaid;
    if (!anyStatus) {
      alert('Selecione ao menos um status para incluir no relatório.');
      return;
    }
    await onGenerate({ format, groupBy, sortBy, filters });
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white text-gray-900 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Exportar Relatório de Lotes</h2>
            <p className="text-xs text-gray-500 mt-0.5">{projectLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Formato</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('excel')}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${
                  format === 'excel'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-gray-200 text-gray-700'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel
              </button>
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${
                  format === 'pdf'
                    ? 'border-red-600 bg-red-50 text-red-800'
                    : 'border-gray-200 text-gray-700'
                }`}
              >
                <FileText className="w-4 h-4" />
                PDF
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Agrupar por</label>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as LotReportGroupBy)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="quadra">Quadra</option>
                <option value="valor">Valor</option>
                <option value="status">Status</option>
                <option value="none">Sem agrupamento</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Ordenação</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as LotReportSortBy)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="quadra_lote">Quadra/Lote</option>
                <option value="valor_asc">Valor crescente</option>
                <option value="valor_desc">Valor decrescente</option>
                <option value="status">Status</option>
              </select>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Incluir</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {(
                [
                  ['includeAvailable', 'Somente disponíveis', filters.includeAvailable],
                  ['includeReserved', 'Incluir reservados', filters.includeReserved],
                  ['includeSold', 'Incluir vendidos', filters.includeSold],
                  ['includePaid', 'Incluir quitados', filters.includePaid],
                ] as const
              ).map(([key, label, checked]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="rounded border-gray-300"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando…
                </>
              ) : (
                'Gerar'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
