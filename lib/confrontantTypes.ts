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
  | 'lot'
  | 'street'
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
  { type: 'lot', label: 'Lote' },
  { type: 'street', label: 'Rua' },
  { type: 'remnant_area', label: 'Área Remanescente' },
  { type: 'institutional_area', label: 'Área Institucional' },
  { type: 'green_area', label: 'Área Verde' },
  { type: 'app', label: 'APP' },
  { type: 'vicinal_road', label: 'Estrada/Vicinal' },
  { type: 'private_property', label: 'Propriedade Particular' },
  { type: 'other', label: 'Manual / Outro' },
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

/** Junta confrontantes distintos de um mesmo lado (ordem preservada). */
export function concatDistinctSideConfrontants(
  labels: Iterable<string>,
  separator = ' / ',
): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const t = String(raw ?? '').trim();
    if (!t || isPendingConfrontantLabel(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.length > 0 ? out.join(separator) : PENDING_CONFRONTANT_LABEL;
}

const SOURCE_PRIORITY: Record<ConfrontantSource, number> = {
  manual: 5,
  street_guide: 4,
  neighbor: 3,
  project_guide: 2,
  auto: 1,
  undefined: 0,
};

/** Fonte dominante ao agregar vários segmentos do mesmo lado. */
export function dominantConfrontantSource(
  sources: ConfrontantSource[],
): ConfrontantSource {
  if (!sources.length) return 'undefined';
  return sources.reduce(
    (best, s) => (SOURCE_PRIORITY[s] > SOURCE_PRIORITY[best] ? s : best),
    'undefined' as ConfrontantSource,
  );
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
