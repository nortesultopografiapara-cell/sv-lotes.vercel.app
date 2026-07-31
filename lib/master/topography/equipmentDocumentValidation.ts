import {
  EQUIPMENT_DOCUMENT_ALLOWED_EXTENSIONS,
  EQUIPMENT_DOCUMENT_ALLOWED_MIME_TYPES,
  EQUIPMENT_DOCUMENT_MAX_BYTES,
  isEquipmentDocumentType,
  type MasterTopographyEquipmentDocumentInput,
} from './equipmentDocumentTypes';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, max = 500): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function cleanRequired(value: unknown, field: string, max = 200): string {
  const s = cleanText(value, max);
  if (!s) throw new Error(`${field} é obrigatório.`);
  return s;
}

function parseOptionalDate(value: unknown, field: string): string | null {
  const s = cleanText(value, 32);
  if (!s) return null;
  if (!DATE_RE.test(s)) throw new Error(`${field} inválida.`);
  return s;
}

function parseOptionalUuid(value: unknown, field: string): string | null {
  const s = cleanText(value, 64);
  if (!s) return null;
  if (!UUID_RE.test(s)) throw new Error(`${field} inválido.`);
  return s;
}

export function sanitizeEquipmentDocumentFileName(fileName: string): string {
  const base = String(fileName || 'arquivo')
    .trim()
    .replace(/[^\w.\-()+\s]/g, '_')
    .replace(/\s+/g, '_');
  return base.slice(0, 180) || 'arquivo';
}

export function validateEquipmentDocumentMimeType(
  mimeType: string,
  fileName?: string,
): { valid: true; mimeType: string } | { valid: false; message: string } {
  const mime = String(mimeType || '')
    .trim()
    .toLowerCase();
  const name = String(fileName || '').toLowerCase();
  const extOk = EQUIPMENT_DOCUMENT_ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));

  if (
    (EQUIPMENT_DOCUMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(mime) ||
    (mime === 'image/jpg' && extOk)
  ) {
    return {
      valid: true,
      mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime,
    };
  }

  if (!mime && extOk) {
    if (name.endsWith('.pdf')) return { valid: true, mimeType: 'application/pdf' };
    if (name.endsWith('.png')) return { valid: true, mimeType: 'image/png' };
    if (name.endsWith('.webp')) return { valid: true, mimeType: 'image/webp' };
    return { valid: true, mimeType: 'image/jpeg' };
  }

  return {
    valid: false,
    message: 'Formato não permitido. Use PDF, JPG, JPEG, PNG ou WEBP.',
  };
}

export function validateEquipmentDocumentFileSize(
  sizeBytes: number,
  maxBytes: number = EQUIPMENT_DOCUMENT_MAX_BYTES,
): { valid: true } | { valid: false; message: string } {
  const size = Number(sizeBytes) || 0;
  if (size <= 0) {
    return { valid: false, message: 'Arquivo vazio.' };
  }
  if (size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return {
      valid: false,
      message: `Arquivo excede o limite de ${mb} MB.`,
    };
  }
  return { valid: true };
}

export function validateEquipmentDocumentMeta(
  raw: Record<string, unknown>,
): MasterTopographyEquipmentDocumentInput {
  const tipoRaw = String(raw.tipo ?? raw.type ?? '').trim().toUpperCase();
  if (!isEquipmentDocumentType(tipoRaw)) {
    throw new Error('Tipo de documento inválido.');
  }

  const titulo = cleanRequired(raw.titulo ?? raw.title, 'Título', 200);
  const issued = parseOptionalDate(raw.issued_at ?? raw.issuedAt, 'Emissão');
  const validUntil = parseOptionalDate(raw.valid_until ?? raw.validUntil, 'Validade');
  if (issued && validUntil && validUntil < issued) {
    throw new Error('Validade não pode ser anterior à emissão.');
  }

  return {
    tipo: tipoRaw,
    titulo,
    issued_at: issued,
    valid_until: validUntil,
    notes: cleanText(raw.notes ?? raw.observacoes, 4000),
    maintenance_id: parseOptionalUuid(
      raw.maintenance_id ?? raw.maintenanceId,
      'Manutenção vinculada',
    ),
  };
}

import { randomUUID } from 'crypto';

export function buildEquipmentDocumentStoragePath(input: {
  equipmentId: string;
  fileName: string;
  uuid?: string;
}): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const id = input.uuid || randomUUID();
  const safe = sanitizeEquipmentDocumentFileName(input.fileName);
  return `${input.equipmentId}/${yyyy}/${mm}/${id}-${safe}`;
}
