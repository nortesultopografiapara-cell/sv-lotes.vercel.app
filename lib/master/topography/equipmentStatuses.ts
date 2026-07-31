/** Status patrimoniais — Equipamentos SV Topografia & Projetos (Master). */

export const EQUIPMENT_STATUSES = [
  { code: 'AVAILABLE', label: 'Disponível', color: '#059669', order: 1, isFinal: false },
  { code: 'IN_USE', label: 'Em uso', color: '#2563eb', order: 2, isFinal: false },
  { code: 'RESERVED', label: 'Reservado', color: '#0284c7', order: 3, isFinal: false },
  { code: 'MAINTENANCE', label: 'Em manutenção', color: '#d97706', order: 4, isFinal: false },
  { code: 'CALIBRATION', label: 'Calibração', color: '#7c3aed', order: 5, isFinal: false },
  { code: 'DECOMMISSIONED', label: 'Baixado', color: '#64748b', order: 6, isFinal: true },
] as const;

export type EquipmentStatusCode = (typeof EQUIPMENT_STATUSES)[number]['code'];

/** Status operacionais (não baixados) para KPIs. */
export const EQUIPMENT_ACTIVE_STATUS_CODES: EquipmentStatusCode[] = EQUIPMENT_STATUSES.filter(
  (s) => !s.isFinal,
).map((s) => s.code);

export function isEquipmentStatus(value: string): value is EquipmentStatusCode {
  return EQUIPMENT_STATUSES.some((s) => s.code === value);
}

export function equipmentStatusMeta(code: string) {
  return EQUIPMENT_STATUSES.find((s) => s.code === code) ?? null;
}

export function equipmentStatusLabel(code: string): string {
  return equipmentStatusMeta(code)?.label ?? code;
}
