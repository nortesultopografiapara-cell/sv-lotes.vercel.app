/**
 * Tipos e rótulos de confrontantes (GIS-005).
 */

export const PENDING_CONFRONTANT_LABEL = 'A DEFINIR';

export type ConfrontantSource =
  | 'manual'
  | 'street_guide'
  | 'neighbor'
  | 'auto'
  | 'undefined'
  | 'project_guide';

export type ConfrontantPresetType =
  | 'remnant_area'
  | 'green_area'
  | 'app'
  | 'institutional_area'
  | 'vicinal_road'
  | 'private_property'
  | 'other';

export type ConfrontantPreset = {
  type: ConfrontantPresetType;
  label: string;
};

export const CONFRONTANT_PRESETS: ConfrontantPreset[] = [
  { type: 'remnant_area', label: 'Área Remanescente' },
  { type: 'green_area', label: 'Área Verde' },
  { type: 'app', label: 'APP' },
  { type: 'institutional_area', label: 'Área Institucional' },
  { type: 'vicinal_road', label: 'Estrada/Vicinal' },
  { type: 'private_property', label: 'Propriedade Particular' },
  { type: 'other', label: 'Outro' },
];

export type SegmentConfrontantRecord = {
  confrontant: string;
  confrontant_type?: ConfrontantPresetType | string | null;
  confrontant_source: ConfrontantSource;
};

export function isPendingConfrontantLabel(label: string | null | undefined): boolean {
  const t = String(label ?? '').trim();
  if (!t) return true;
  const u = t.toUpperCase();
  return (
    u === '—' ||
    u === '-' ||
    u === PENDING_CONFRONTANT_LABEL ||
    u === 'A DEFINIR' ||
    u === 'UNDEFINED' ||
    u === 'NULL'
  );
}

/** Normaliza saída automática para exibição. */
export function normalizeConfrontantLabel(
  label: string | null | undefined,
): string {
  const t = String(label ?? '').trim();
  if (!t || isPendingConfrontantLabel(t)) return PENDING_CONFRONTANT_LABEL;
  return t;
}

export function sourceDisplayLabel(source: ConfrontantSource): string {
  switch (source) {
    case 'manual':
      return 'manual';
    case 'street_guide':
      return 'rua';
    case 'neighbor':
      return 'vizinho';
    case 'auto':
      return 'auto';
    case 'project_guide':
      return 'guia';
    default:
      return 'indefinido';
  }
}
