/** Categorias de serviço — SV Topografia & Projetos (Master). */

export const TOPOGRAPHY_CATEGORIES = [
  { code: 'TOPOGRAFIA', label: 'Topografia' },
  { code: 'GEORREFERENCIAMENTO', label: 'Georreferenciamento' },
  { code: 'DRONE', label: 'Drone' },
  { code: 'LIDAR', label: 'LiDAR' },
  { code: 'PROJETOS', label: 'Projetos' },
  { code: 'REGULARIZACAO', label: 'Regularização' },
  { code: 'OBRAS', label: 'Obras' },
  { code: 'CONSULTORIA', label: 'Consultoria' },
] as const;

export type TopographyCategoryCode = (typeof TOPOGRAPHY_CATEGORIES)[number]['code'];

export function isTopographyCategory(value: string): value is TopographyCategoryCode {
  return TOPOGRAPHY_CATEGORIES.some((c) => c.code === value);
}

export function topographyCategoryLabel(code: string): string {
  return TOPOGRAPHY_CATEGORIES.find((c) => c.code === code)?.label ?? code;
}
