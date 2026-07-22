import type { TopographyCategoryCode } from './categories';
import type { TopographyFinancialSituationCode, TopographyOriginCode } from './origins';
import type { TopographyPriorityCode } from './priorities';
import type { TopographyServiceTypeCode } from './serviceTypes';
import type { TopographyStatusCode } from './statuses';

export type MasterTopographyProject = {
  id: string;
  code: string;
  title: string;
  client_name: string;
  client_contact_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  category: TopographyCategoryCode;
  service_type: TopographyServiceTypeCode;
  origin: TopographyOriginCode | null;
  description: string | null;
  status: TopographyStatusCode;
  priority: TopographyPriorityCode;
  financial_situation: TopographyFinancialSituationCode;
  city: string | null;
  state: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_from_parauapebas_km: number | null;
  contract_date: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_end_date: string | null;
  contract_value: number | null;
  /** Entrada/adiantamento recebido (persistido). */
  valor_recebido: number;
  /** Derivado: contratado − recebido (não gravado). */
  saldo_receber: number;
  /** Derivado: % recebido (não gravado). */
  percentual_recebido: number;
  /** Aliases camelCase para o service/UI. */
  valorRecebido: number;
  saldoReceber: number;
  percentualRecebido: number;
  payment_terms: string | null;
  origin_budget_number: string | null;
  internal_manager: string | null;
  technical_manager: string | null;
  team_notes: string | null;
  progress_percent: number;
  physical_progress_percent: number;
  current_stage: string | null;
  technical_notes: string | null;
  pending_items: string | null;
  next_action: string | null;
  next_action_date: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterTopographyProjectInput = {
  title: string;
  client_name: string;
  client_contact_name?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  category: TopographyCategoryCode;
  service_type: TopographyServiceTypeCode;
  origin?: TopographyOriginCode | null;
  description?: string | null;
  status: TopographyStatusCode;
  priority?: TopographyPriorityCode;
  financial_situation?: TopographyFinancialSituationCode;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distance_from_parauapebas_km?: number | null;
  contract_date?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_end_date?: string | null;
  contract_value?: number | null;
  valor_recebido?: number;
  payment_terms?: string | null;
  origin_budget_number?: string | null;
  internal_manager?: string | null;
  technical_manager?: string | null;
  team_notes?: string | null;
  progress_percent?: number;
  physical_progress_percent?: number;
  current_stage?: string | null;
  technical_notes?: string | null;
  pending_items?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
};

export type MasterTopographyProjectListFilters = {
  q?: string;
  status?: string;
  category?: string;
  serviceType?: string;
  priority?: string;
  city?: string;
  manager?: string;
  fromDate?: string;
  toDate?: string;
  includeArchived?: boolean;
  page?: number;
  limit?: number;
  sort?: 'created_at' | 'planned_end_date' | 'title' | 'contract_value' | 'code';
  order?: 'asc' | 'desc';
};

export type MasterTopographyProjectKpis = {
  active: number;
  inField: number;
  inProcessing: number;
  overdue: number;
  completedThisMonth: number;
  activeContractValue: number;
  /** Totais financeiros respeitando filtros da listagem. */
  totalContractValue: number;
  totalReceived: number;
  totalBalance: number;
};

export type MasterTopographyProjectListResult = {
  projects: MasterTopographyProject[];
  total: number;
  page: number;
  limit: number;
  kpis: MasterTopographyProjectKpis;
};
