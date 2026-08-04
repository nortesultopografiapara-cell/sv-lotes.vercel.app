/** Tipos — exportação completa de empresa (Master F0/F1/F2). */

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

export const COMPANY_EXPORT_VERSIONS = ['F1_TABULAR', 'F2_COMPLETE'] as const;
export type CompanyExportVersion = (typeof COMPANY_EXPORT_VERSIONS)[number];

export const COMPANY_EXPORT_BUCKET = 'company-exports';
export const COMPANY_EXPORT_SCHEMA_VERSION = '2.0.0-f2-complete';
export const COMPANY_EXPORT_SCHEMA_VERSION_F1 = '1.0.0-f1-tabular';
export const COMPANY_EXPORT_PAGE_SIZE = 500;
export const COMPANY_EXPORT_RETENTION_DAYS = 7;
export const COMPANY_EXPORT_SIGNED_URL_SECONDS = 60 * 60;

export type CompanyExportOptions = {
  include_generated_plans: boolean;
};

export const DEFAULT_COMPANY_EXPORT_OPTIONS: CompanyExportOptions = {
  include_generated_plans: true,
};

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
  jsonExtraColumns?: readonly string[];
  optional?: boolean;
  description?: string;
};

export type CompanyExportPhase =
  | 'tables'
  | 'contract_html'
  | 'geojson_blocks'
  | 'inventory_storage'
  | 'copy_company_files'
  | 'copy_sale_documents'
  | 'copy_contract_files'
  | 'copy_legacy_contracts'
  | 'generate_memorials'
  | 'generate_lot_plans'
  | 'generate_general_plans'
  | 'build_file_index'
  | 'readme'
  | 'manifest'
  | 'zip_domains'
  | 'zip'
  | 'verify_checksums'
  | 'done';

export type CompanyExportFileEntry = {
  source_bucket: string | null;
  source_path: string;
  destination_path: string;
  category: string;
  related_company_id: string;
  related_project_id: string | null;
  related_sale_id: string | null;
  related_contract_id: string | null;
  related_customer_id: string | null;
  original_name: string;
  mime_type: string | null;
  size: number | null;
  checksum: string | null;
  status: string;
  external_reference_only?: boolean;
};

export type CompanyExportStepCursor = {
  phase: CompanyExportPhase;
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
  /** F2 */
  exportVersion?: CompanyExportVersion;
  options?: CompanyExportOptions;
  inventory?: CompanyExportFileEntry[];
  inventoryOffset?: number;
  copyOffset?: number;
  copiedKeys?: string[];
  missingFiles?: Array<Record<string, unknown>>;
  unresolvedFiles?: Array<Record<string, unknown>>;
  generationErrors?: Array<Record<string, unknown>>;
  generatedKeys?: string[];
  memorialOffset?: number;
  lotPlanOffset?: number;
  generalPlanOffset?: number;
  planTargets?: Array<{
    id: string;
    project_id: string;
    block_name?: string | null;
    lot_number?: string | null;
    number?: string | null;
  }>;
  projectTargets?: Array<{ id: string; name: string }>;
  asaasRefs?: Array<Record<string, unknown>>;
  fileChecksums?: Record<string, string>;
  storageFilesFound?: number;
  storageFilesCopied?: number;
  storageFilesMissing?: number;
  storageFilesDeduplicated?: number;
  generatedMemorials?: number;
  generatedLotPlans?: number;
  generatedGeneralPlans?: number;
  totalBinarySize?: number;
  zipDomainIndex?: number;
  zipDomainFileOffset?: number;
  zipPartRels?: string[];
  checksumLines?: string[];
  packageParts?: Array<{ name: string; bytes: number; checksum: string }>;
  originalSourceFileStatus?: 'NOT_PERSISTED' | 'FOUND' | 'PARTIAL';
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
  export_version: CompanyExportVersion;
  phase: 'F1_TABULAR' | 'F2_COMPLETE';
  options?: CompanyExportOptions;
  tables_exported: string[];
  records_per_table: Record<string, number>;
  files_generated: string[];
  total_size_bytes: number;
  errors: string[];
  warnings: string[];
  missing_files: Array<Record<string, unknown>> | string[];
  unresolved_files?: Array<Record<string, unknown>>;
  generation_errors?: Array<Record<string, unknown>>;
  storage_summary?: Record<string, unknown>;
  files?: CompanyExportFileEntry[];
  package_parts?: Array<{ name: string; bytes: number; checksum: string }>;
  original_source_file_status?: string;
  excluded_for_security: string[];
  checksum_sha256: string | null;
  external_asaas_refs?: Array<Record<string, unknown>>;
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
  export_version?: CompanyExportVersion | null;
  options?: CompanyExportOptions | Record<string, unknown> | null;
  storage_files_found?: number | null;
  storage_files_copied?: number | null;
  storage_files_missing?: number | null;
  storage_files_deduplicated?: number | null;
  generated_memorials?: number | null;
  generated_lot_plans?: number | null;
  generated_general_plans?: number | null;
  generation_errors?: number | null;
  package_parts?: number | null;
  total_binary_size?: number | null;
};

export function emptyStepCursor(
  version: CompanyExportVersion = 'F1_TABULAR',
  options: CompanyExportOptions = DEFAULT_COMPANY_EXPORT_OPTIONS,
): CompanyExportStepCursor {
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
    exportVersion: version,
    options,
    inventory: [],
    inventoryOffset: 0,
    copyOffset: 0,
    copiedKeys: [],
    missingFiles: [],
    unresolvedFiles: [],
    generationErrors: [],
    generatedKeys: [],
    memorialOffset: 0,
    lotPlanOffset: 0,
    generalPlanOffset: 0,
    planTargets: [],
    projectTargets: [],
    asaasRefs: [],
    fileChecksums: {},
    storageFilesFound: 0,
    storageFilesCopied: 0,
    storageFilesMissing: 0,
    storageFilesDeduplicated: 0,
    generatedMemorials: 0,
    generatedLotPlans: 0,
    generatedGeneralPlans: 0,
    totalBinarySize: 0,
    packageParts: [],
    originalSourceFileStatus: 'NOT_PERSISTED',
  };
}

export function isCompanyExportReason(value: unknown): value is CompanyExportReason {
  return (
    typeof value === 'string' &&
    (COMPANY_EXPORT_REASONS as readonly string[]).includes(value)
  );
}

export function isCompanyExportVersion(value: unknown): value is CompanyExportVersion {
  return (
    typeof value === 'string' &&
    (COMPANY_EXPORT_VERSIONS as readonly string[]).includes(value)
  );
}

export function normalizeExportVersion(value: unknown): CompanyExportVersion {
  if (isCompanyExportVersion(value)) return value;
  return 'F1_TABULAR';
}

export function normalizeExportOptions(raw: unknown): CompanyExportOptions {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    include_generated_plans:
      o.include_generated_plans === undefined
        ? DEFAULT_COMPANY_EXPORT_OPTIONS.include_generated_plans
        : Boolean(o.include_generated_plans),
  };
}
