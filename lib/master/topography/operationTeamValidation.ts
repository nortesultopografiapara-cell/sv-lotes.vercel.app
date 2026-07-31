import {
  isOperationAttendanceStatus,
  type MasterTopographyOperationTeamInput,
} from './operationTeamTypes';

function cleanText(raw: unknown, max: number): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseOptionalIso(raw: unknown, label: string): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) throw new Error(`${label} inválido.`);
  return new Date(ms).toISOString();
}

function parseOptionalUuid(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
    throw new Error('Usuário inválido.');
  }
  return s;
}

export function validateOperationTeamInput(raw: Record<string, unknown>): MasterTopographyOperationTeamInput {
  const name = cleanText(raw.name, 200);
  if (!name) throw new Error('Nome do integrante é obrigatório.');

  const attendanceRaw = String(raw.attendance_status ?? raw.attendanceStatus ?? 'PLANNED').trim();
  if (!isOperationAttendanceStatus(attendanceRaw)) {
    throw new Error('Status de presença inválido.');
  }

  return {
    user_id: parseOptionalUuid(raw.user_id ?? raw.userId),
    name,
    role: cleanText(raw.role, 120),
    phone: cleanText(raw.phone, 40),
    email: cleanText(raw.email, 200),
    is_lead: Boolean(raw.is_lead ?? raw.isLead),
    planned_start: parseOptionalIso(raw.planned_start ?? raw.plannedStart, 'Início planejado'),
    planned_end: parseOptionalIso(raw.planned_end ?? raw.plannedEnd, 'Fim planejado'),
    attendance_status: attendanceRaw,
    notes: cleanText(raw.notes, 2000),
  };
}
