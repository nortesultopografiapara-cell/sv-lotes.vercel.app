import { isEquipmentCategory } from './equipmentCategories';
import { isEquipmentStatus } from './equipmentStatuses';
import type { MasterTopographyEquipmentInput } from './equipmentTypes';

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

function parseOptionalMoney(value: unknown, field = 'Valor'): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${field} não pode ser negativo.`);
  }
  return Math.round(n * 100) / 100;
}

function parseUsageHours(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Horas de uso não podem ser negativas.');
  }
  return Math.round(n * 100) / 100;
}

function parseOptionalUuid(value: unknown, field: string): string | null {
  const s = cleanText(value, 64);
  if (!s) return null;
  if (!UUID_RE.test(s)) throw new Error(`${field} inválido.`);
  return s;
}

/**
 * Valida e normaliza payload de criação/edição de equipamento.
 * Obrigatórios: name, category, status.
 */
export function validateTopographyEquipmentInput(
  raw: Record<string, unknown>,
): MasterTopographyEquipmentInput {
  const name = cleanRequired(raw.name, 'Nome', 200);

  const categoryRaw = String(raw.category || '').trim();
  if (!isEquipmentCategory(categoryRaw)) throw new Error('Categoria inválida.');

  const statusRaw = String(raw.status || 'AVAILABLE').trim();
  if (!isEquipmentStatus(statusRaw)) throw new Error('Status inválido.');

  const lastCal = parseOptionalDate(
    raw.last_calibration_date ?? raw.lastCalibrationDate,
    'Última calibração',
  );
  const nextCal = parseOptionalDate(
    raw.next_calibration_date ?? raw.nextCalibrationDate,
    'Próxima calibração',
  );
  if (lastCal && nextCal && nextCal < lastCal) {
    throw new Error('Próxima calibração não pode ser anterior à última calibração.');
  }

  return {
    name,
    category: categoryRaw,
    manufacturer: cleanText(raw.manufacturer, 160),
    model: cleanText(raw.model, 160),
    serial_number: cleanText(raw.serial_number ?? raw.serialNumber, 120),
    asset_number: cleanText(raw.asset_number ?? raw.assetNumber, 120),
    purchase_date: parseOptionalDate(raw.purchase_date ?? raw.purchaseDate, 'Data de compra'),
    purchase_value: parseOptionalMoney(
      raw.purchase_value ?? raw.purchaseValue,
      'Valor de compra',
    ),
    warranty_until: parseOptionalDate(raw.warranty_until ?? raw.warrantyUntil, 'Garantia até'),
    supplier: cleanText(raw.supplier, 200),
    invoice_number: cleanText(raw.invoice_number ?? raw.invoiceNumber, 80),
    cost_center_id: parseOptionalUuid(
      raw.cost_center_id ?? raw.costCenterId,
      'Centro de custo',
    ),
    status: statusRaw,
    location: cleanText(raw.location, 200),
    responsible_user_id: parseOptionalUuid(
      raw.responsible_user_id ?? raw.responsibleUserId,
      'Responsável',
    ),
    responsible_name: cleanText(raw.responsible_name ?? raw.responsibleName, 160),
    usage_hours: parseUsageHours(raw.usage_hours ?? raw.usageHours),
    last_calibration_date: lastCal,
    next_calibration_date: nextCal,
    notes: cleanText(raw.notes, 4000),
    photo_url: cleanText(raw.photo_url ?? raw.photoUrl, 1000),
    qr_payload: cleanText(raw.qr_payload ?? raw.qrPayload, 500),
  };
}
