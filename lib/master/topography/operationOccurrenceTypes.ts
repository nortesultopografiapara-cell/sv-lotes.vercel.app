export const OPERATION_OCCURRENCE_TYPES = [
  { code: 'TECHNICAL', label: 'Técnica' },
  { code: 'SAFETY', label: 'Segurança' },
  { code: 'WEATHER', label: 'Clima' },
  { code: 'EQUIPMENT', label: 'Equipamento' },
  { code: 'CLIENT', label: 'Cliente' },
  { code: 'ACCESS', label: 'Acesso' },
  { code: 'OTHER', label: 'Outros' },
] as const;

export const OPERATION_OCCURRENCE_SEVERITIES = [
  { code: 'LOW', label: 'Baixa' },
  { code: 'MEDIUM', label: 'Média' },
  { code: 'HIGH', label: 'Alta' },
  { code: 'CRITICAL', label: 'Crítica' },
] as const;

export const OPERATION_OCCURRENCE_STATUSES = [
  { code: 'OPEN', label: 'Aberta' },
  { code: 'IN_ANALYSIS', label: 'Em análise' },
  { code: 'RESOLVED', label: 'Resolvida' },
  { code: 'CANCELED', label: 'Cancelada' },
] as const;

export type OperationOccurrenceType = (typeof OPERATION_OCCURRENCE_TYPES)[number]['code'];
export type OperationOccurrenceSeverity =
  (typeof OPERATION_OCCURRENCE_SEVERITIES)[number]['code'];
export type OperationOccurrenceStatus =
  (typeof OPERATION_OCCURRENCE_STATUSES)[number]['code'];

export function isOperationOccurrenceType(v: string): v is OperationOccurrenceType {
  return OPERATION_OCCURRENCE_TYPES.some((t) => t.code === v);
}
export function isOperationOccurrenceSeverity(v: string): v is OperationOccurrenceSeverity {
  return OPERATION_OCCURRENCE_SEVERITIES.some((t) => t.code === v);
}
export function isOperationOccurrenceStatus(v: string): v is OperationOccurrenceStatus {
  return OPERATION_OCCURRENCE_STATUSES.some((t) => t.code === v);
}

export type MasterTopographyOperationOccurrence = {
  id: string;
  operation_id: string;
  type: OperationOccurrenceType;
  severity: OperationOccurrenceSeverity;
  title: string;
  description: string | null;
  occurred_at: string;
  action_taken: string | null;
  status: OperationOccurrenceStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  evidence_document_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterTopographyOperationOccurrenceInput = {
  type: OperationOccurrenceType;
  severity: OperationOccurrenceSeverity;
  title: string;
  description?: string | null;
  occurred_at?: string | null;
  action_taken?: string | null;
  status?: OperationOccurrenceStatus;
  evidence_document_id?: string | null;
};
