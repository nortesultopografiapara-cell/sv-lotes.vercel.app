import type { MasterTopographyEquipmentTransferInput } from './equipmentAssignmentTypes';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, max = 500): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseOptionalUuid(value: unknown, field: string): string | null {
  const s = cleanText(value, 64);
  if (!s) return null;
  if (!UUID_RE.test(s)) throw new Error(`${field} inválido.`);
  return s;
}

export function validateEquipmentTransferInput(
  raw: Record<string, unknown>,
): MasterTopographyEquipmentTransferInput {
  const toName = cleanText(
    raw.to_responsible_name ?? raw.toResponsibleName ?? raw.responsible_name,
    160,
  );
  const toUserId = parseOptionalUuid(
    raw.to_responsible_user_id ?? raw.toResponsibleUserId ?? raw.responsible_user_id,
    'Novo responsável',
  );
  const toLocation = cleanText(raw.to_location ?? raw.toLocation ?? raw.location, 200);
  const projectId = parseOptionalUuid(raw.project_id ?? raw.projectId, 'Projeto');
  const reason = cleanText(raw.reason ?? raw.motivo, 500);
  const notes = cleanText(raw.notes ?? raw.observacoes, 4000);
  const movedAt = cleanText(raw.moved_at ?? raw.movedAt, 40);

  if (!toName && !toUserId && toLocation == null && !projectId && !reason) {
    // Allow transfer that only clears/sets location empty if location key present
    const hasLocationKey =
      raw.to_location !== undefined ||
      raw.toLocation !== undefined ||
      raw.location !== undefined;
    if (!hasLocationKey) {
      throw new Error('Informe o novo responsável, localização ou motivo da transferência.');
    }
  }

  return {
    to_responsible_user_id: toUserId,
    to_responsible_name: toName,
    to_location: toLocation,
    project_id: projectId,
    reason,
    notes,
    moved_at: movedAt,
  };
}
