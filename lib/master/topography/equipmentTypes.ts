import type { EquipmentCategoryCode } from './equipmentCategories';
import type { EquipmentStatusCode } from './equipmentStatuses';

export type MasterTopographyEquipment = {
  id: string;
  code: string;
  name: string;
  category: EquipmentCategoryCode;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  asset_number: string | null;
  purchase_date: string | null;
  purchase_value: number | null;
  warranty_until: string | null;
  supplier: string | null;
  invoice_number: string | null;
  cost_center_id: string | null;
  status: EquipmentStatusCode;
  location: string | null;
  responsible_user_id: string | null;
  responsible_name: string | null;
  usage_hours: number;
  last_calibration_date: string | null;
  next_calibration_date: string | null;
  notes: string | null;
  photo_url: string | null;
  qr_payload: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterTopographyEquipmentInput = {
  name: string;
  category: EquipmentCategoryCode;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  asset_number?: string | null;
  purchase_date?: string | null;
  purchase_value?: number | null;
  warranty_until?: string | null;
  supplier?: string | null;
  invoice_number?: string | null;
  cost_center_id?: string | null;
  status: EquipmentStatusCode;
  location?: string | null;
  responsible_user_id?: string | null;
  responsible_name?: string | null;
  usage_hours?: number;
  last_calibration_date?: string | null;
  next_calibration_date?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  qr_payload?: string | null;
};

export type MasterTopographyEquipmentListFilters = {
  q?: string;
  status?: string;
  category?: string;
  location?: string;
  responsible?: string;
  includeArchived?: boolean;
  page?: number;
  limit?: number;
  sort?: 'created_at' | 'name' | 'code' | 'purchase_value' | 'next_calibration_date';
  order?: 'asc' | 'desc';
};

export type MasterTopographyEquipmentKpis = {
  total: number;
  available: number;
  inUse: number;
  reserved: number;
  maintenance: number;
  calibration: number;
  decommissioned: number;
  /** Σ purchase_value de ativos não baixados e não arquivados. */
  patrimonialValue: number;
  /** Próxima calibração vencida ou nos próximos 30 dias. */
  calibrationDueSoon: number;
};

export type MasterTopographyEquipmentListResult = {
  equipment: MasterTopographyEquipment[];
  total: number;
  page: number;
  limit: number;
  kpis: MasterTopographyEquipmentKpis;
};
