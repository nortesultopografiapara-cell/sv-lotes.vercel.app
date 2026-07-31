export const OPERATION_DOCUMENT_TYPES = [
  { code: 'ORDEM_SERVICO', label: 'Ordem de Serviço' },
  { code: 'PHOTO', label: 'Foto' },
  { code: 'KMZ', label: 'KMZ' },
  { code: 'KML', label: 'KML' },
  { code: 'PDF', label: 'PDF' },
  { code: 'CHECKLIST', label: 'Checklist' },
  { code: 'REPORT', label: 'Relatório' },
  { code: 'RECEIPT', label: 'Comprovante' },
  { code: 'TECHNICAL_FILE', label: 'Arquivo técnico' },
  { code: 'OTHER', label: 'Outros' },
] as const;

export type OperationDocumentType = (typeof OPERATION_DOCUMENT_TYPES)[number]['code'];

export function isOperationDocumentType(v: string): v is OperationDocumentType {
  return OPERATION_DOCUMENT_TYPES.some((t) => t.code === v);
}

export function operationDocumentTypeLabel(code: string): string {
  return OPERATION_DOCUMENT_TYPES.find((t) => t.code === code)?.label ?? code;
}

export const OPERATION_DOCUMENTS_STORAGE_BUCKET = 'master-topography-operations';
export const OPERATION_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export const OPERATION_DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.google-earth.kml+xml',
  'application/vnd.google-earth.kmz',
  'application/xml',
  'text/xml',
  'application/zip',
  'application/octet-stream',
] as const;

export const OPERATION_DOCUMENT_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.kml',
  '.kmz',
] as const;

export type MasterTopographyOperationDocument = {
  id: string;
  operation_id: string;
  type: OperationDocumentType;
  title: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  file_hash: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type MasterTopographyOperationDocumentInput = {
  type: OperationDocumentType;
  title: string;
  notes?: string | null;
};
