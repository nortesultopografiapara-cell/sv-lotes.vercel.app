/** Tipos de documento de equipamento — Master Topografia Fase 2. */

export const EQUIPMENT_DOCUMENT_TYPES = [
  { code: 'INVOICE', label: 'Nota fiscal' },
  { code: 'MANUAL', label: 'Manual' },
  { code: 'WARRANTY', label: 'Garantia' },
  { code: 'CERTIFICATE', label: 'Certificado' },
  { code: 'ANAC', label: 'ANAC' },
  { code: 'ANATEL', label: 'ANATEL' },
  { code: 'PHOTO', label: 'Foto' },
  { code: 'REPORT', label: 'Laudo' },
  { code: 'CALIBRATION', label: 'Calibração' },
  { code: 'OTHER', label: 'Outros' },
] as const;

export type EquipmentDocumentTypeCode = (typeof EQUIPMENT_DOCUMENT_TYPES)[number]['code'];

export function isEquipmentDocumentType(value: string): value is EquipmentDocumentTypeCode {
  return EQUIPMENT_DOCUMENT_TYPES.some((t) => t.code === value);
}

export function equipmentDocumentTypeLabel(code: string): string {
  return EQUIPMENT_DOCUMENT_TYPES.find((t) => t.code === code)?.label ?? code;
}

export const EQUIPMENT_DOCUMENTS_STORAGE_BUCKET = 'master-topography-equipment';
export const EQUIPMENT_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export const EQUIPMENT_DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const EQUIPMENT_DOCUMENT_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
] as const;

export type MasterTopographyEquipmentDocument = {
  id: string;
  equipment_id: string;
  maintenance_id: string | null;
  tipo: EquipmentDocumentTypeCode;
  titulo: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  content_hash: string | null;
  issued_at: string | null;
  valid_until: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type MasterTopographyEquipmentDocumentInput = {
  tipo: EquipmentDocumentTypeCode;
  titulo: string;
  issued_at?: string | null;
  valid_until?: string | null;
  notes?: string | null;
  maintenance_id?: string | null;
};
