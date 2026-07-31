/** Tipos — equipe da Ordem de Serviço. */

export const OPERATION_ATTENDANCE_STATUSES = [
  { code: 'PLANNED', label: 'Planejado' },
  { code: 'CONFIRMED', label: 'Confirmado' },
  { code: 'PRESENT', label: 'Presente' },
  { code: 'ABSENT', label: 'Ausente' },
  { code: 'CANCELED', label: 'Cancelado' },
] as const;

export type OperationAttendanceStatus =
  (typeof OPERATION_ATTENDANCE_STATUSES)[number]['code'];

export function isOperationAttendanceStatus(
  value: string,
): value is OperationAttendanceStatus {
  return OPERATION_ATTENDANCE_STATUSES.some((s) => s.code === value);
}

export type MasterTopographyOperationTeamMember = {
  id: string;
  operation_id: string;
  user_id: string | null;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  is_lead: boolean;
  planned_start: string | null;
  planned_end: string | null;
  attendance_status: OperationAttendanceStatus;
  notes: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterTopographyOperationTeamInput = {
  user_id?: string | null;
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  is_lead?: boolean;
  planned_start?: string | null;
  planned_end?: string | null;
  attendance_status?: OperationAttendanceStatus;
  notes?: string | null;
};
