/** Vínculo equipamento ↔ OS. */

export type MasterTopographyOperationEquipmentLink = {
  id: string;
  operation_id: string;
  equipment_id: string;
  reserved_at: string | null;
  checked_out_at: string | null;
  returned_at: string | null;
  condition_out: string | null;
  condition_return: string | null;
  previous_equipment_status: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Enriquecido na listagem */
  equipment_code?: string | null;
  equipment_name?: string | null;
  equipment_status?: string | null;
};

export type MasterTopographyOperationEquipmentInput = {
  equipment_id: string;
  notes?: string | null;
  reserve?: boolean;
};
