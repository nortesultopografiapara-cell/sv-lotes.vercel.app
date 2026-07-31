import {
  OPERATION_DOCUMENT_ALLOWED_EXTENSIONS,
  OPERATION_DOCUMENT_ALLOWED_MIME_TYPES,
  OPERATION_DOCUMENT_MAX_BYTES,
  isOperationDocumentType,
  type MasterTopographyOperationDocumentInput,
} from './operationDocumentTypes';

function cleanText(value: unknown, max = 500): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function sanitizeOperationDocumentFileName(fileName: string): string {
  const base = String(fileName || 'arquivo')
    .trim()
    .replace(/[^\w.\-()+\s]/g, '_')
    .replace(/\s+/g, '_');
  return base.slice(0, 180) || 'arquivo';
}

export function validateOperationDocumentMimeType(
  mimeType: string,
  fileName?: string,
): { valid: true; mimeType: string } | { valid: false; message: string } {
  const mime = String(mimeType || '').trim().toLowerCase();
  const name = String(fileName || '').toLowerCase();
  const extOk = OPERATION_DOCUMENT_ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));

  if ((OPERATION_DOCUMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(mime) && extOk) {
    return { valid: true, mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime };
  }

  if (extOk) {
    if (name.endsWith('.pdf')) return { valid: true, mimeType: 'application/pdf' };
    if (name.endsWith('.png')) return { valid: true, mimeType: 'image/png' };
    if (name.endsWith('.webp')) return { valid: true, mimeType: 'image/webp' };
    if (name.endsWith('.kml')) {
      return { valid: true, mimeType: 'application/vnd.google-earth.kml+xml' };
    }
    if (name.endsWith('.kmz')) {
      return { valid: true, mimeType: 'application/vnd.google-earth.kmz' };
    }
    return { valid: true, mimeType: 'image/jpeg' };
  }

  return {
    valid: false,
    message: 'Formato não permitido. Use PDF, JPG, PNG, WEBP, KML ou KMZ.',
  };
}

export function validateOperationDocumentFileSize(
  bytes: number,
): { valid: true } | { valid: false; message: string } {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { valid: false, message: 'Arquivo vazio.' };
  }
  if (bytes > OPERATION_DOCUMENT_MAX_BYTES) {
    return { valid: false, message: 'Arquivo excede o limite de 20 MB.' };
  }
  return { valid: true };
}

export function buildOperationDocumentStoragePath(params: {
  operationId: string;
  fileName: string;
}): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safe = sanitizeOperationDocumentFileName(params.fileName);
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${params.operationId}/${yyyy}/${mm}/${id}-${safe}`;
}

export function validateOperationDocumentInput(
  raw: Record<string, unknown>,
): MasterTopographyOperationDocumentInput {
  const title = cleanText(raw.title ?? raw.titulo, 200);
  if (!title) throw new Error('Título do documento é obrigatório.');
  const type = String(raw.type ?? raw.tipo ?? 'OTHER').trim();
  if (!isOperationDocumentType(type)) throw new Error('Tipo de documento inválido.');
  return {
    type,
    title,
    notes: cleanText(raw.notes, 2000),
  };
}
