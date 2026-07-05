/**
 * Tipagens centrais — Migração de Dados (SV LOTES).
 */

import type {
  CustomerImportExecuteResult,
  CustomerImportValidationResult,
} from '@/lib/imports/modules/customers/types';

export type ImportModuleId =
  | 'customers'
  | 'brokers'
  | 'sales'
  | 'installments'
  | 'contracts'
  | 'attachments';

export type ImportModuleStatus =
  | 'available'
  | 'available_soon'
  | 'in_development';

export type MigrationWizardStepId =
  | 'welcome'
  | 'select-type'
  | 'template'
  | 'upload'
  | 'pre-validation'
  | 'preview'
  | 'confirmation';

export type UploadedImportFileMeta = {
  name: string;
  sizeBytes: number;
  sizeLabel: string;
  extension: string;
  mimeType: string;
  selectedAt: string;
  lastModified: string | null;
};

export type MigrationPreValidationSummary = {
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  warnings: number;
  errors: number;
};

export type MigrationHistoryRow = {
  id: string;
  date: string;
  type: ImportModuleId;
  typeLabel: string;
  fileName: string;
  userName: string;
  quantity: number | null;
  status: string;
};

export type ImportModuleDefinition = {
  id: ImportModuleId;
  title: string;
  description: string;
  status: ImportModuleStatus;
  statusLabel: string;
  enabled: boolean;
};

export type CustomerPreviewFilter =
  | 'all'
  | 'valid'
  | 'warning'
  | 'error'
  | 'duplicate'
  | 'existing';

export type MigrationWizardState = {
  step: MigrationWizardStepId;
  selectedModuleId: ImportModuleId | null;
  uploadedFile: UploadedImportFileMeta | null;
  customerValidation: CustomerImportValidationResult | null;
  customerPreviewFilter: CustomerPreviewFilter;
  customerImportResult: CustomerImportExecuteResult | null;
  validating: boolean;
  importing: boolean;
  validationError: string | null;
};
