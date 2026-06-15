'use client';

import { Loader2, Map, X } from 'lucide-react';
import {
  DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  type EnterpriseOverviewOptions,
  type EnterprisePrintFormat,
} from '@/lib/enterpriseOverviewLayout';
export type EnterpriseOverviewModalProps = {
  open: boolean;
  projectName: string;
  options: EnterpriseOverviewOptions;
  loading: boolean;
  onClose: () => void;
  onOptionsChange: (options: EnterpriseOverviewOptions) => void;
  onSubmit: (e: React.FormEvent) => void;
};

const FORMAT_OPTIONS: { value: EnterprisePrintFormat; label: string }[] = [
  { value: 'a4_landscape', label: 'A4 Horizontal' },
  { value: 'a3_landscape', label: 'A3 Horizontal (padrão)' },
  { value: 'a3_portrait', label: 'A3 Vertical' },
];

export function EnterpriseOverviewModal({
  open,
  projectName,
  options,
  loading,
  onClose,
  onOptionsChange,
  onSubmit,
}: EnterpriseOverviewModalProps) {
  if (!open) return null;

  const setOpt = <K extends keyof EnterpriseOverviewOptions>(
    key: K,
    value: EnterpriseOverviewOptions[K],
  ) => {
    onOptionsChange({ ...options, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto">
      <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl w-full max-w-lg shadow-2xl text-white">
        <div className="flex items-center justify-between p-4 border-b border-[#2d3340]">
          <div className="flex items-center gap-2">
            <Map className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm uppercase tracking-wide">
              Prancha Geral do Empreendimento
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-[var(--text-secondary)]"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-4 space-y-4">
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

          <fieldset>
            <legend className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
              Formato
            </legend>
            <div className="space-y-2">
              {FORMAT_OPTIONS.map((fmt) => (
                <label
                  key={fmt.value}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="enterprise-format"
                    checked={options.format === fmt.value}
                    onChange={() => setOpt('format', fmt.value)}
                    className="accent-emerald-500"
                  />
                  {fmt.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
              Conteúdo
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {(
                [
                  ['showLegend', 'Mostrar legenda'],
                  ['showLogo', 'Mostrar logo da empresa'],
                  ['showGraphicScale', 'Mostrar escala gráfica'],
                  ['showNorth', 'Mostrar norte'],
                  ['showStreets', 'Mostrar ruas'],
                  ['showLotNumbers', 'Mostrar numeração dos lotes'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={(e) => setOpt(key, e.target.checked)}
                    className="accent-emerald-500 rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
            O mapa será enquadrado automaticamente em todos os lotes do empreendimento,
            com rotação inteligente para melhor aproveitamento da folha. Elementos da
            interface GIS não serão incluídos no PDF.
          </p>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-[#2d3340] text-sm font-semibold hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando…
                </>
              ) : (
                'Gerar PDF'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export { DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS };
