/** Tipos de manutenção de equipamento — Master Topografia Fase 2. */

export const EQUIPMENT_MAINTENANCE_TYPES = [
  { code: 'PREVENTIVE', label: 'Preventiva' },
  { code: 'CORRECTIVE', label: 'Corretiva' },
  { code: 'CALIBRATION', label: 'Calibração' },
  { code: 'PARTS_REPLACEMENT', label: 'Troca de peças' },
  { code: 'INSPECTION', label: 'Inspeção' },
  { code: 'FIRMWARE_UPDATE', label: 'Atualização de firmware' },
  { code: 'OTHER', label: 'Outros' },
] as const;

export type EquipmentMaintenanceTypeCode =
  (typeof EQUIPMENT_MAINTENANCE_TYPES)[number]['code'];

export const EQUIPMENT_MAINTENANCE_STATUSES = [
  { code: 'PLANNED', label: 'Planejada' },
  { code: 'IN_PROGRESS', label: 'Em andamento' },
  { code: 'DONE', label: 'Concluída' },
  { code: 'CANCELED', label: 'Cancelada' },
] as const;

export type EquipmentMaintenanceStatusCode =
  (typeof EQUIPMENT_MAINTENANCE_STATUSES)[number]['code'];

export function isEquipmentMaintenanceType(
  value: string,
): value is EquipmentMaintenanceTypeCode {
  return EQUIPMENT_MAINTENANCE_TYPES.some((t) => t.code === value);
}

export function isEquipmentMaintenanceStatus(
  value: string,
): value is EquipmentMaintenanceStatusCode {
  return EQUIPMENT_MAINTENANCE_STATUSES.some((s) => s.code === value);
}

export function equipmentMaintenanceTypeLabel(code: string): string {
  return EQUIPMENT_MAINTENANCE_TYPES.find((t) => t.code === code)?.label ?? code;
}

export function equipmentMaintenanceStatusLabel(code: string): string {
  return EQUIPMENT_MAINTENANCE_STATUSES.find((s) => s.code === code)?.label ?? code;
}

export type MasterTopographyEquipmentMaintenance = {
  id: string;
  equipment_id: string;
  tipo: EquipmentMaintenanceTypeCode;
  status: EquipmentMaintenanceStatusCode;
  description: string;
  supplier: string | null;
  scheduled_at: string | null;
  performed_at: string | null;
  cost: number | null;
  next_review_at: string | null;
  parts: string | null;
  notes: string | null;
  payable_id: string | null;
  previous_equipment_status: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterTopographyEquipmentMaintenanceInput = {
  tipo: EquipmentMaintenanceTypeCode;
  status: EquipmentMaintenanceStatusCode;
  description: string;
  supplier?: string | null;
  scheduled_at?: string | null;
  performed_at?: string | null;
  cost?: number | null;
  next_review_at?: string | null;
  parts?: string | null;
  notes?: string | null;
};
