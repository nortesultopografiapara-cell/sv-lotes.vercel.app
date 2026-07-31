import type { OperationPriorityCode, OperationStatusCode } from './operationStatuses';

export type MasterTopographyOperation = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  project_id: string | null;
  quote_id: string | null;
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
  estimated_cost: number | null;
  actual_cost: number | null;
  notes: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterTopographyOperationInput = {
  title: string;
  description?: string | null;
  project_id?: string | null;
  quote_id?: string | null;
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
  estimated_cost?: number | null;
  actual_cost?: number | null;
  notes?: string | null;
};

export type MasterTopographyOperationListFilters = {
  q?: string;
  status?: string;
  priority?: string;
  projectId?: string;
  responsible?: string;
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
};

export type MasterTopographyOperationListResult = {
  operations: MasterTopographyOperation[];
  total: number;
  page: number;
  limit: number;
  kpis: MasterTopographyOperationKpis;
};
