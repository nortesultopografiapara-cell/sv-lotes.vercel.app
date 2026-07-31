'use client';

import { OPERATION_PRIORITIES, OPERATION_STATUSES } from '@/lib/master/topography/operationStatuses';
import styles from './operation.module.css';

export type OperationFiltersState = {
  q: string;
  status: string;
  priority: string;
  projectId: string;
  responsible: string;
  equipmentId: string;
  scheduledFrom: string;
  scheduledTo: string;
  includeArchived: boolean;
  openOccurrence: boolean;
  pendingChecklist: boolean;
};

export type ProjectOption = { id: string; label: string };
export type EquipmentFilterOption = { id: string; label: string };

type Props = {
  value: OperationFiltersState;
  onChange: (next: OperationFiltersState) => void;
  projects: ProjectOption[];
  equipment: EquipmentFilterOption[];
};

export function OperationFilters({ value, onChange, projects, equipment }: Props) {
  const set = <K extends keyof OperationFiltersState>(key: K, v: OperationFiltersState[K]) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <div className={styles.toolbar} aria-label="Filtros de operações">
      <input
        className={styles.searchInput}
        placeholder="Buscar código, título, cliente, local ou responsável…"
        value={value.q}
        onChange={(e) => set('q', e.target.value)}
      />
      <select
        className={styles.select}
        value={value.status}
        onChange={(e) => set('status', e.target.value)}
      >
        <option value="">Status</option>
        {OPERATION_STATUSES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.label}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={value.priority}
        onChange={(e) => set('priority', e.target.value)}
      >
        <option value="">Prioridade</option>
        {OPERATION_PRIORITIES.map((p) => (
          <option key={p.code} value={p.code}>
            {p.label}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={value.projectId}
        onChange={(e) => set('projectId', e.target.value)}
        style={{ minWidth: '11rem' }}
      >
        <option value="">Projeto</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={value.equipmentId}
        onChange={(e) => set('equipmentId', e.target.value)}
        style={{ minWidth: '11rem' }}
        title="Filtrar OS com equipamento vinculado"
      >
        <option value="">Equipamento</option>
        {equipment.map((eq) => (
          <option key={eq.id} value={eq.id}>
            {eq.label}
          </option>
        ))}
      </select>
      <input
        className={styles.input}
        placeholder="Responsável"
        value={value.responsible}
        onChange={(e) => set('responsible', e.target.value)}
        style={{ minWidth: '9rem' }}
      />
      <input
        className={styles.input}
        type="date"
        title="Período agendado — de"
        value={value.scheduledFrom}
        onChange={(e) => set('scheduledFrom', e.target.value)}
      />
      <input
        className={styles.input}
        type="date"
        title="Período agendado — até"
        value={value.scheduledTo}
        onChange={(e) => set('scheduledTo', e.target.value)}
      />
      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={value.includeArchived}
          onChange={(e) => set('includeArchived', e.target.checked)}
        />
        Incluir arquivadas
      </label>
      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={value.openOccurrence}
          onChange={(e) => set('openOccurrence', e.target.checked)}
        />
        Com ocorrência aberta
      </label>
      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={value.pendingChecklist}
          onChange={(e) => set('pendingChecklist', e.target.checked)}
        />
        Checklist pendente
      </label>
    </div>
  );
}
