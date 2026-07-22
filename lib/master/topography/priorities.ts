/** Prioridades — SV Topografia & Projetos (Master). */

export const TOPOGRAPHY_PRIORITIES = [
  { code: 'BAIXA', label: 'Baixa', color: '#64748b' },
  { code: 'NORMAL', label: 'Normal', color: '#0284c7' },
  { code: 'ALTA', label: 'Alta', color: '#ea580c' },
  { code: 'URGENTE', label: 'Urgente', color: '#e11d48' },
] as const;

export type TopographyPriorityCode = (typeof TOPOGRAPHY_PRIORITIES)[number]['code'];

export function isTopographyPriority(value: string): value is TopographyPriorityCode {
  return TOPOGRAPHY_PRIORITIES.some((p) => p.code === value);
}

export function topographyPriorityLabel(code: string): string {
  return TOPOGRAPHY_PRIORITIES.find((p) => p.code === code)?.label ?? code;
}

export function topographyPriorityColor(code: string): string {
  return TOPOGRAPHY_PRIORITIES.find((p) => p.code === code)?.color ?? '#64748b';
}
