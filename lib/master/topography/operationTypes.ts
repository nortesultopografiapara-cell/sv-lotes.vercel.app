import type { OperationPriorityCode, OperationStatusCode } from './operationStatuses';

export type MasterTopographyOperation = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  project_id: string | null;
  quote_id: string | null;
  client_id: string | null;
  client_name: string | null;
  service_type: string | null;
  status: OperationStatusCode;
  priority: OperationPriorityCode;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  location_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  responsible_user_id: string | null;
  responsible_name: string | null;
  responsible_phone: string | null;
  responsible_email: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  notes: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completion_override_reason?: string | null;
  completion_override_by?: string | null;
  completion_override_at?: string | null;
  field_requirements_override_reason?: string | null;
  field_requirements_override_by?: string | null;
  field_requirements_override_at?: string | null;
};

export type MasterTopographyOperationInput = {
  title: string;
  description?: string | null;
  project_id?: string | null;
  quote_id?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  service_type?: string | null;
  status: OperationStatusCode;
  priority: OperationPriorityCode;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  location_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  responsible_user_id?: string | null;
  responsible_name?: string | null;
  responsible_phone?: string | null;
  responsible_email?: string | null;
  estimated_cost?: number | null;
  actual_cost?: number | null;
  notes?: string | null;
};

export type MasterTopographyOperationListFilters = {
  q?: string;
  status?: string;
  priority?: string;
  projectId?: string;
  quoteId?: string;
  clientId?: string;
  responsible?: string;
  equipmentId?: string;
  openOccurrence?: boolean;
  pendingChecklist?: boolean;
  /** IDs pré-resolvidos por filtros de filhos (interno). */
  operationIds?: string[];
  scheduledFrom?: string;
  scheduledTo?: string;
  includeArchived?: boolean;
  page?: number;
  limit?: number;
  sort?: 'created_at' | 'title' | 'code' | 'scheduled_start' | 'priority' | 'status';
  order?: 'asc' | 'desc';
};

export type MasterTopographyOperationKpis = {
  total: number;
  draft: number;
  planned: number;
  scheduled: number;
  inField: number;
  processing: number;
  waitingClient: number;
  completed: number;
  /** Concluídas no mês civil UTC corrente (por actual_end ou updated_at). */
  completedThisMonth: number;
  canceled: number;
  /** Agendadas/em andamento com scheduled_end no passado. */
  overdue: number;
  estimatedCostSum: number;
  actualCostSum: number;
  costDeviation: number;
  equipmentInUse: number;
  openOccurrences: number;
  pendingChecklist: number;
};

export type MasterTopographyOperationListResult = {
  operations: MasterTopographyOperation[];
  total: number;
  page: number;
  limit: number;
  kpis: MasterTopographyOperationKpis;
};
