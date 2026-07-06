import type { LegacyContractLinkType } from '@/lib/legacy-contracts/constants';

export type LegacyContractListFilters = {
  projectId?: string;
  quadra?: string;
  lote?: string;
  customer?: string;
  fileName?: string;
  linkType?: LegacyContractLinkType | '';
  page?: number;
  pageSize?: number;
};

export type LegacyContractListItem = {
  id: string;
  sale_id: string;
  customer_id: string | null;
  project_id: string | null;
  block_id: string | null;
  project_name: string | null;
  customer_name: string | null;
  quadra: string | null;
  lote: string | null;
  original_file_name: string;
  link_type: LegacyContractLinkType;
  source: string;
  migration_id: string | null;
  notes: string | null;
  contract_number: string | null;
  contract_date: string | null;
  status: string;
  created_at: string;
};

export type LegacyContractListSummary = {
  total: number;
  automatic: number;
  manual: number;
  unlinked: number;
};

export type LegacyContractListResult = {
  items: LegacyContractListItem[];
  summary: LegacyContractListSummary;
  total: number;
  page: number;
  pageSize: number;
};
