'use client';

import { FileSpreadsheet, FileText, Loader2, Route, X } from 'lucide-react';
import { formatLengthMetersPtBr } from '@/lib/enterpriseOverviewStreets';

export type StreetGuidesReportModalProps = {
  open: boolean;
  projectName: string;
  streetCount: number;
  totalLengthM: number;
  loadingPdf: boolean;
  loadingExcel: boolean;
  onClose: () => void;
  onExportPdf: () => void;
  onExportExcel: () => void;
};

export function StreetGuidesReportModal({
  open,
  projectName,
  streetCount,
  totalLengthM,
  loadingPdf,
  loadingExcel,
  onClose,
  onExportPdf,
  onExportExcel,
}: StreetGuidesReportModalProps) {
  if (!open) return null;

  const busy = loadingPdf || loadingExcel;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto">
      <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl w-full max-w-md shadow-2xl text-white">
        <div className="flex items-center justify-between p-4 border-b border-[#2d3340]">
          <div className="flex items-center gap-2">
            <Route className="w-5 h-5 text-sky-400" />
            <h3 className="font-bold text-sm uppercase tracking-wide">
              Relatório de Vias
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded hover:bg-white/10 text-[var(--text-secondary)] disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
              Empreendimento
            </label>
            <input
              type="text"
              readOnly
              value={projectName}
              className="w-full bg-[#0f1319] border border-[#2d3340] rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[#2d3340] bg-[#0f1319] px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Total de vias
              </p>
              <p className="text-lg font-bold text-sky-300 mt-0.5">{streetCount}</p>
            </div>
            <div className="rounded-lg border border-[#2d3340] bg-[#0f1319] px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Comprimento total
              </p>
              <p className="text-lg font-bold text-sky-300 mt-0.5">
                {formatLengthMetersPtBr(totalLengthM)}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={onExportPdf}
              disabled={busy || streetCount === 0}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#0B3A66] hover:bg-[#0d4a82] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-bold"
            >
              {loadingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Exportar PDF
            </button>
            <button
              type="button"
              onClick={onExportExcel}
              disabled={busy || streetCount === 0}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-bold text-emerald-300"
            >
              {loadingExcel ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              Exportar Excel
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="w-full rounded-lg border border-[#2d3340] hover:bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-secondary)] disabled:opacity-50"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
