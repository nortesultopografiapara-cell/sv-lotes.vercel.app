'use client';

import { EQUIPMENT_CATEGORIES } from '@/lib/master/topography/equipmentCategories';
import { EQUIPMENT_STATUSES } from '@/lib/master/topography/equipmentStatuses';
import styles from './equipment.module.css';

export type EquipmentFiltersState = {
  q: string;
  category: string;
  status: string;
  responsible: string;
  location: string;
  includeArchived: boolean;
};

type Props = {
  value: EquipmentFiltersState;
  onChange: (next: EquipmentFiltersState) => void;
};

export function EquipmentFilters({ value, onChange }: Props) {
  const set = <K extends keyof EquipmentFiltersState>(key: K, v: EquipmentFiltersState[K]) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <div className={styles.toolbar} aria-label="Filtros de equipamentos">
      <input
        className={styles.searchInput}
        placeholder="Buscar código, nome, fabricante, modelo, série ou patrimônio…"
        value={value.q}
        onChange={(e) => set('q', e.target.value)}
      />
      <select
        className={styles.select}
        value={value.category}
        onChange={(e) => set('category', e.target.value)}
      >
        <option value="">Categoria</option>
        {EQUIPMENT_CATEGORIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={value.status}
        onChange={(e) => set('status', e.target.value)}
      >
        <option value="">Status</option>
        {EQUIPMENT_STATUSES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.label}
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
        placeholder="Localização"
        value={value.location}
        onChange={(e) => set('location', e.target.value)}
        style={{ minWidth: '9rem' }}
      />
      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={value.includeArchived}
          onChange={(e) => set('includeArchived', e.target.checked)}
        />
        Incluir arquivados
      </label>
    </div>
  );
}
