/** Tipos — exportação completa de empresa (Master F0/F1). */

export const COMPANY_EXPORT_REASONS = [
  'OFFBOARDING',
  'CLIENT_REQUEST',
  'MIGRATION',
  'BACKUP',
  'OTHER',
] as const;

export type CompanyExportReason = (typeof COMPANY_EXPORT_REASONS)[number];

export const COMPANY_EXPORT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type CompanyExportStatus = (typeof COMPANY_EXPORT_STATUSES)[number];

export const COMPANY_EXPORT_BUCKET = 'company-exports';
export const COMPANY_EXPORT_SCHEMA_VERSION = '1.0.0-f1-tabular';
export const COMPANY_EXPORT_PAGE_SIZE = 500;
export const COMPANY_EXPORT_RETENTION_DAYS = 7;
export const COMPANY_EXPORT_SIGNED_URL_SECONDS = 60 * 60; // 1h por download

export type CompanyExportScopeStrategy =
  | 'self_id'
  | 'company_or_tenant'
  | 'company_id'
  | 'tenant_id'
  | 'via_sales'
  | 'via_projects'
  | 'via_blocks'
  | 'via_contracts'
  | 'via_customers'
  | 'via_brokers';

export type CompanyExportFormat = 'csv' | 'json' | 'geojson' | 'html';

export type CompanyExportTableSpec = {
  id: string;
  table: string;
  folder: string;
  fileBase: string;
  columns: readonly string[];
  scope: CompanyExportScopeStrategy;
  formats: readonly CompanyExportFormat[];
  /** Colunas extras só no JSON (ex.: segments_json). */
  jsonExtraColumns?: readonly string[];
  optional?: boolean;
  /** Não exportar se tabela ausente. */
  description?: string;
};

export type CompanyExportStepCursor = {
  phase:
    | 'tables'
    | 'contract_html'
    | 'geojson_blocks'
    | 'readme'
    | 'manifest'
    | 'zip'
    | 'done';
  tableIndex: number;
  offset: number;
  contractHtmlOffset: number;
  geojsonOffset: number;
  recordCounts: Record<string, number>;
  files: string[];
  warnings: string[];
  errors: string[];
  missingOptionalTables: string[];
  companyName?: string;
  companyDocument?: string | null;
};

export type CompanyExportManifest = {
  export_id: string;
  company_id: string;
  company_name: string;
  company_document: string | null;
  requested_by: string;
  reason: CompanyExportReason;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  schema_version: string;
  phase: 'F1_TABULAR';
  tables_exported: string[];
  records_per_table: Record<string, number>;
  files_generated: string[];
  total_size_bytes: number;
  errors: string[];
  warnings: string[];
  missing_files: string[];
  excluded_for_security: string[];
  checksum_sha256: string | null;
};

export type CompanyExportJobRow = {
  id: string;
  company_id: string;
  requested_by: string;
  reason: CompanyExportReason;
  notes: string | null;
  status: CompanyExportStatus;
  progress: number;
  current_step: string | null;
  step_cursor: CompanyExportStepCursor | Record<string, unknown> | null;
  records_exported: number;
  files_exported: number;
  total_size: number;
  storage_bucket: string | null;
  storage_path: string | null;
  signed_url_expires_at: string | null;
  error_message: string | null;
  manifest: CompanyExportManifest | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
};

export function emptyStepCursor(): CompanyExportStepCursor {
  return {
    phase: 'tables',
    tableIndex: 0,
    offset: 0,
    contractHtmlOffset: 0,
    geojsonOffset: 0,
    recordCounts: {},
    files: [],
    warnings: [],
    errors: [],
    missingOptionalTables: [],
  };
}

export function isCompanyExportReason(value: unknown): value is CompanyExportReason {
  return (
    typeof value === 'string' &&
    (COMPANY_EXPORT_REASONS as readonly string[]).includes(value)
  );
}
