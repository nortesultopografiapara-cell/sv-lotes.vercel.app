import type { TopographyCategoryCode } from './categories';
import type { TopographyServiceTypeCode } from './serviceTypes';
import type { TopographyQuoteStatusCode } from './quoteStatuses';

export type MasterTopographyQuote = {
  id: string;
  code: string;
  client_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  distance_km: number | null;
  category: TopographyCategoryCode;
  service_type: TopographyServiceTypeCode;
  description: string | null;
  status: TopographyQuoteStatusCode;
  proposal_date: string | null;
  expiration_date: string | null;
  estimated_deadline: string | null;
  estimated_value: number | null;
  discount_value: number;
  final_value: number | null;
  payment_method: string | null;
  payment_terms: string | null;
  internal_manager: string | null;
  internal_notes: string | null;
  technical_notes: string | null;
  approved_at: string | null;
  approved_by: string | null;
  converted_project_id: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterTopographyQuoteInput = {
  client_name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  distance_km?: number | null;
  category: TopographyCategoryCode;
  service_type: TopographyServiceTypeCode;
  description?: string | null;
  status: TopographyQuoteStatusCode;
  proposal_date?: string | null;
  expiration_date?: string | null;
  estimated_deadline?: string | null;
  estimated_value?: number | null;
  discount_value?: number;
  final_value?: number | null;
  payment_method?: string | null;
  payment_terms?: string | null;
  internal_manager?: string | null;
  internal_notes?: string | null;
  technical_notes?: string | null;
};

export type MasterTopographyQuoteListFilters = {
  q?: string;
  status?: string;
  category?: string;
  serviceType?: string;
  city?: string;
  manager?: string;
  fromDate?: string;
  toDate?: string;
  includeArchived?: boolean;
  page?: number;
  limit?: number;
  sort?: 'created_at' | 'proposal_date' | 'final_value' | 'code' | 'client_name';
  order?: 'asc' | 'desc';
};

export type MasterTopographyQuoteKpis = {
  active: number;
  inNegotiation: number;
  approved: number;
  refused: number;
  totalQuotedValue: number;
  totalApprovedValue: number;
  approvalRate: number;
};

export type MasterTopographyQuoteListResult = {
  quotes: MasterTopographyQuote[];
  total: number;
  page: number;
  limit: number;
  kpis: MasterTopographyQuoteKpis;
};
