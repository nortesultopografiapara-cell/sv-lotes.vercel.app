'use client';

import { Search, X } from 'lucide-react';
import type { LegacyContractLinkType } from '@/lib/legacy-contracts/constants';

export type LegacyContractsFilterValues = {
  projectId: string;
  quadra: string;
  lote: string;
  customer: string;
  fileName: string;
  linkType: LegacyContractLinkType | '';
};

type ProjectOption = {
  id: string;
  name: string;
};

type LegacyContractsFiltersProps = {
  values: LegacyContractsFilterValues;
  projects: ProjectOption[];
  loadingProjects: boolean;
  onChange: (values: LegacyContractsFilterValues) => void;
  onApply: () => void;
  onClear: () => void;
};

const EMPTY_FILTERS: LegacyContractsFilterValues = {
  projectId: '',
  quadra: '',
  lote: '',
  customer: '',
  fileName: '',
  linkType: '',
};

export { EMPTY_FILTERS };

export function LegacyContractsFilters({
  values,
  projects,
  loadingProjects,
  onChange,
  onApply,
  onClear,
}: LegacyContractsFiltersProps) {
  const setField = <K extends keyof LegacyContractsFilterValues>(
    key: K,
    value: LegacyContractsFilterValues[K],
  ) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <div
      className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-4"
      data-testid="legacy-contracts-filters"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Empreendimento</span>
          <select
            value={values.projectId}
            onChange={(event) => setField('projectId', event.target.value)}
            disabled={loadingProjects}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm"
          >
            <option value="">
              {loadingProjects ? 'Carregando…' : 'Todos os empreendimentos'}
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Quadra</span>
          <input
            type="text"
            value={values.quadra}
            onChange={(event) => setField('quadra', event.target.value)}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm"
            placeholder="Ex.: QD 01"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Lote</span>
          <input
            type="text"
            value={values.lote}
            onChange={(event) => setField('lote', event.target.value)}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm"
            placeholder="Ex.: 20"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Cliente</span>
          <input
            type="text"
            value={values.customer}
            onChange={(event) => setField('customer', event.target.value)}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm"
            placeholder="Nome do cliente"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Nome do arquivo</span>
          <input
            type="text"
            value={values.fileName}
            onChange={(event) => setField('fileName', event.target.value)}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm"
            placeholder="contrato.pdf"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Tipo de vínculo</span>
          <select
            value={values.linkType}
            onChange={(event) =>
              setField('linkType', event.target.value as LegacyContractsFilterValues['linkType'])
            }
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="automatic">Automático</option>
            <option value="manual">Manual</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onApply}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
          data-testid="legacy-contracts-apply-filters"
        >
          <Search className="w-4 h-4" />
          Filtrar
        </button>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
        >
          <X className="w-4 h-4" />
          Limpar
        </button>
      </div>
    </div>
  );
}
