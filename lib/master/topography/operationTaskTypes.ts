/** Checklist / tasks da OS. */

export const OPERATION_TASK_STATUSES = [
  { code: 'PENDING', label: 'Pendente' },
  { code: 'IN_PROGRESS', label: 'Em andamento' },
  { code: 'COMPLETED', label: 'Concluído' },
  { code: 'SKIPPED', label: 'Ignorado' },
] as const;

export type OperationTaskStatus = (typeof OPERATION_TASK_STATUSES)[number]['code'];

export function isOperationTaskStatus(value: string): value is OperationTaskStatus {
  return OPERATION_TASK_STATUSES.some((s) => s.code === value);
}

export type MasterTopographyOperationTask = {
  id: string;
  operation_id: string;
  title: string;
  description: string | null;
  is_required: boolean;
  is_critical: boolean;
  status: OperationTaskStatus;
  order_index: number;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterTopographyOperationTaskInput = {
  title: string;
  description?: string | null;
  is_required?: boolean;
  is_critical?: boolean;
  status?: OperationTaskStatus;
  order_index?: number;
  notes?: string | null;
};

export type ChecklistTemplateCode = 'AEROLEVANTAMENTO' | 'LEVANTAMENTO_TOPOGRAFICO';
