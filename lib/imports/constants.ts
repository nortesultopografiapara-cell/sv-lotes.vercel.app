/**
 * Constantes — wizard e rotas de migração.
 */

import type { MigrationWizardStepId } from '@/lib/imports/types';

export const DATA_MIGRATION_ROUTE = '/data-migration' as const;

export const MIGRATION_WIZARD_STEPS: {
  id: MigrationWizardStepId;
  label: string;
  order: number;
}[] = [
  { id: 'welcome', label: 'Boas-vindas', order: 1 },
  { id: 'select-type', label: 'Tipo', order: 2 },
  { id: 'template', label: 'Modelo', order: 3 },
  { id: 'upload', label: 'Upload', order: 4 },
  { id: 'pre-validation', label: 'Pré-validação', order: 5 },
  { id: 'preview', label: 'Pré-visualização', order: 6 },
  { id: 'confirmation', label: 'Confirmação', order: 7 },
];

export const ACCEPTED_IMPORT_EXTENSIONS = ['.xlsx', '.xls', '.csv'] as const;

export const ACCEPTED_IMPORT_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/plain',
] as const;

export const ACCEPTED_IMPORT_ACCEPT_ATTR =
  '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
