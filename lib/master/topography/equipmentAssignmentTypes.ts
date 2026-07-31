/** Tipos de movimentação (assignment) de equipamento — Master Topografia Fase 2. */

export type MasterTopographyEquipmentAssignment = {
  id: string;
  equipment_id: string;
  from_responsible_user_id: string | null;
  from_responsible_name: string | null;
  to_responsible_user_id: string | null;
  to_responsible_name: string | null;
  from_location: string | null;
  to_location: string | null;
  project_id: string | null;
  moved_at: string;
  reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type MasterTopographyEquipmentTransferInput = {
  to_responsible_user_id?: string | null;
  to_responsible_name?: string | null;
  to_location?: string | null;
  project_id?: string | null;
  reason?: string | null;
  notes?: string | null;
  moved_at?: string | null;
};
