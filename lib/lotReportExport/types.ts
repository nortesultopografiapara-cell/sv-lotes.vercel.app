import type { EnterpriseLotStatus } from '@/lib/enterpriseValueSummary';

export type LotReportGroupBy = 'quadra' | 'valor' | 'status' | 'none';
export type LotReportSortBy = 'quadra_lote' | 'valor_asc' | 'valor_desc' | 'status';
export type LotReportFormat = 'excel' | 'pdf';

export type LotReportStatusFilters = {
  includeAvailable: boolean;
  includeReserved: boolean;
  includeSold: boolean;
  includePaid: boolean;
};

export type LotReportOptions = {
  groupBy: LotReportGroupBy;
  sortBy: LotReportSortBy;
  filters: LotReportStatusFilters;
  format: LotReportFormat;
};

export type LotReportRow = {
  projectId: string;
  projectName: string;
  blockName: string;
  lotNumber: string;
  areaM2: number;
  price: number;
  statusKey: EnterpriseLotStatus;
  statusLabel: string;
};

export type LotReportGroupSummary = {
  count: number;
  totalArea: number;
  totalValue: number;
};

export type LotReportGroup = {
  key: string;
  title: string;
  rows: LotReportRow[];
  summary: LotReportGroupSummary;
};

export type LotReportSummary = {
  totalLots: number;
  totalArea: number;
  totalValue: number;
  availableCount: number;
  availableValue: number;
  reservedCount: number;
  reservedValue: number;
  soldCount: number;
  soldValue: number;
  paidCount: number;
  paidValue: number;
};

export type LotReportMeta = {
  companyName: string;
  companyLogoUrl?: string | null;
  projectLabel: string;
  issuedAt: Date;
  groupBy: LotReportGroupBy;
  sortBy: LotReportSortBy;
};

export type LotReportBuildResult = {
  rows: LotReportRow[];
  groups: LotReportGroup[];
  summary: LotReportSummary;
};

export type LotReportBlockRecord = {
  project_id?: string | null;
  block_name?: string | null;
  name?: string | null;
  number?: string | null;
  lot_number?: string | null;
  area?: number | string | null;
  price?: number | string | null;
  status?: string | null;
  projects?: { id?: string; name?: string | null } | null;
};
