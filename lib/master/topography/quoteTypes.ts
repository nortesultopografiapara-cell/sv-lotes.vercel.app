import type { TopographyCategoryCode } from './categories';
import type { TopographyServiceTypeCode } from './serviceTypes';
import type { TopographyQuoteStatusCode } from './quoteStatuses';
import type { TopographyPriceBankCode } from './priceBanks';
import type { QuoteFinancialSummary } from './quoteFinancials';
import type { QuoteScopeSelectedItem } from './quoteScopeCatalog';

export type MasterTopographyQuote = {
  id: string;
  code: string;
  title: string | null;
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
  /** Cronograma estruturado (opcional) — não replica prazo global nas fases. */
  mobilization_deadline_text: string | null;
  field_duration_text: string | null;
  processing_deadline_text: string | null;
  delivery_deadline_text: string | null;
  total_deadline_text: string | null;
  methodology_notes: string | null;
  professional_name: string | null;
  professional_title: string | null;
  professional_council: string | null;
  professional_registration: string | null;
  professional_registration_uf: string | null;
  estimated_value: number | null;
  discount_value: number;
  discount_percent: number;
  bdi_percent: number;
  margin_percent: number;
  final_value: number | null;
  payment_method: string | null;
  payment_terms: string | null;
  internal_manager: string | null;
  internal_notes: string | null;
  technical_notes: string | null;
  /** Snapshot ordenado — equipamentos/recursos técnicos. */
  technical_resources: QuoteScopeSelectedItem[];
  /** Snapshot ordenado — produtos/dados entregues. */
  deliverables: QuoteScopeSelectedItem[];
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
  title?: string | null;
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
  mobilization_deadline_text?: string | null;
  field_duration_text?: string | null;
  processing_deadline_text?: string | null;
  delivery_deadline_text?: string | null;
  total_deadline_text?: string | null;
  methodology_notes?: string | null;
  professional_name?: string | null;
  professional_title?: string | null;
  professional_council?: string | null;
  professional_registration?: string | null;
  professional_registration_uf?: string | null;
  estimated_value?: number | null;
  discount_value?: number;
  discount_percent?: number;
  bdi_percent?: number;
  margin_percent?: number;
  final_value?: number | null;
  payment_method?: string | null;
  payment_terms?: string | null;
  internal_manager?: string | null;
  internal_notes?: string | null;
  technical_notes?: string | null;
  technical_resources?: QuoteScopeSelectedItem[];
  deliverables?: QuoteScopeSelectedItem[];
};

export type MasterTopographyQuoteItem = {
  id: string;
  quote_id: string;
  stage_id: string;
  code: string | null;
  price_bank: TopographyPriceBankCode | null;
  description: string;
  unit: string;
  quantity: number;
  /** @deprecated use adopted_price — mantido sincronizado */
  unit_value: number;
  reference_price: number;
  adopted_price: number;
  competence: string | null;
  uf: string | null;
  notes: string | null;
  /** Justificativa/premissas do item (memória de cálculo). */
  calculation_notes: string | null;
  catalog_item_id: string | null;
  custom_item_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type MasterTopographyQuoteStage = {
  id: string;
  quote_id: string;
  name: string;
  sort_order: number;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type MasterTopographyQuoteStageWithItems = MasterTopographyQuoteStage & {
  items: MasterTopographyQuoteItem[];
  itemCount: number;
  subtotal: number;
  percentOfBudget: number;
};

export type MasterTopographyQuoteStructure = {
  quote: MasterTopographyQuote;
  stages: MasterTopographyQuoteStageWithItems[];
  financials: QuoteFinancialSummary;
};

export type MasterTopographyQuoteItemInput = {
  id?: string;
  code?: string | null;
  price_bank?: TopographyPriceBankCode | null;
  description: string;
  unit: string;
  quantity: number;
  unit_value?: number;
  reference_price?: number;
  adopted_price?: number;
  competence?: string | null;
  uf?: string | null;
  notes?: string | null;
  calculation_notes?: string | null;
  catalog_item_id?: string | null;
  custom_item_id?: string | null;
  sort_order: number;
};

export type MasterTopographyQuoteStageInput = {
  id?: string;
  name: string;
  sort_order: number;
  is_system?: boolean;
  items: MasterTopographyQuoteItemInput[];
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
