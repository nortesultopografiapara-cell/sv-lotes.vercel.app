import type { MasterTopographyOperationEquipmentInput } from './operationEquipmentTypes';

function cleanText(raw: unknown, max: number): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseUuid(raw: unknown, label: string): string {
  const s = String(raw || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
    throw new Error(`${label} inválido.`);
  }
  return s;
}

export function validateOperationEquipmentInput(
  raw: Record<string, unknown>,
): MasterTopographyOperationEquipmentInput {
  return {
    equipment_id: parseUuid(raw.equipment_id ?? raw.equipmentId, 'Equipamento'),
    notes: cleanText(raw.notes, 2000),
    reserve: raw.reserve !== false,
  };
}
