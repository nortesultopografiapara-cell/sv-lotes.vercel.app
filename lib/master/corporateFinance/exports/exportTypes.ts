/** Tipos compartilhados — exportações Financeiro Corporativo Master (Fase 6.5). */

export const CORPORATE_EXPORT_FORMATS = ['xlsx', 'pdf', 'csv'] as const;
export type CorporateExportFormat = (typeof CORPORATE_EXPORT_FORMATS)[number];

export const CORPORATE_EXPORT_MODULES = [
  'cash-flow',
  'receivables',
  'payables',
] as const;
export type CorporateExportModule = (typeof CORPORATE_EXPORT_MODULES)[number];

/** Limite de segurança configurável (linhas). */
export const CORPORATE_EXPORT_MAX_ROWS = Number(
  process.env.CORPORATE_FINANCE_EXPORT_MAX_ROWS || 5000,
);

export type CorporateExportNameMaps = {
  accounts: Map<string, string>;
  categories: Map<string, string>;
  costCenters: Map<string, string>;
  projects: Map<string, string>;
  quotes: Map<string, string>;
};

export type CorporateExportMeta = {
  companyName: string;
  legalName: string;
  title: string;
  module: CorporateExportModule;
  format: CorporateExportFormat;
  periodLabel: string;
  generatedAt: Date;
  generatedAtLabel: string;
  filtersLabel: string;
  filterSummary: Record<string, string | boolean | number | null | undefined>;
  rowCount: number;
};

export type CorporateCashExportSummary = {
  openingBalance: number;
  periodIncome: number;
  periodExpense: number;
  netResult: number;
  closingBalance: number;
  movementCount: number;
};

export type CorporateCashExportRow = {
  date: string;
  code: string;
  description: string;
  type: string;
  origin: string;
  category: string;
  account: string;
  costCenter: string;
  project: string;
  paymentMethod: string;
  income: number | null;
  expense: number | null;
  runningBalance: number | null;
  status: string;
};

export type CorporateArApExportSummary = {
  openAmount: number;
  dueThisMonthAmount: number;
  settledThisMonthAmount: number;
  overdueAmount: number;
  statusCounts: Record<string, number>;
  rowCount: number;
};

export type CorporateReceivableExportRow = {
  code: string;
  businessUnit: string;
  customer: string;
  project: string;
  quote: string;
  description: string;
  issueDate: string;
  dueDate: string;
  originalAmount: number;
  discount: number;
  interest: number;
  fine: number;
  netAmount: number;
  received: number;
  remaining: number;
  status: string;
  account: string;
  paymentMethod: string;
};

export type CorporatePayableExportRow = {
  code: string;
  supplier: string;
  project: string;
  description: string;
  issueDate: string;
  dueDate: string;
  originalAmount: number;
  discount: number;
  interest: number;
  fine: number;
  netAmount: number;
  paid: number;
  remaining: number;
  status: string;
  account: string;
  paymentMethod: string;
};

export class CorporateExportEmptyError extends Error {
  constructor(message = 'Nenhum registro encontrado para os filtros selecionados.') {
    super(message);
    this.name = 'CorporateExportEmptyError';
  }
}

export function parseCorporateExportFormat(
  raw: string | null | undefined,
): CorporateExportFormat {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if ((CORPORATE_EXPORT_FORMATS as readonly string[]).includes(v)) {
    return v as CorporateExportFormat;
  }
  throw new Error('Formato inválido. Use format=xlsx|pdf|csv.');
}

export function clampExportLimit(requested?: number): number {
  const max = Number.isFinite(CORPORATE_EXPORT_MAX_ROWS) && CORPORATE_EXPORT_MAX_ROWS > 0
    ? Math.floor(CORPORATE_EXPORT_MAX_ROWS)
    : 5000;
  const n = Math.max(1, Math.floor(requested || max));
  return Math.min(max, n);
}
