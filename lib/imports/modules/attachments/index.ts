import type { ImportModuleDefinition } from '@/lib/imports/types';

export const attachmentsImportModule: ImportModuleDefinition = {
  id: 'attachments',
  title: 'Anexos',
  description: 'Importação de documentos e anexos vinculados a registros.',
  status: 'in_development',
  statusLabel: 'Em desenvolvimento',
  enabled: false,
};

export const ATTACHMENTS_IMPORT_TEMPLATE_COLUMNS = [
  'referencia',
  'tipo',
  'arquivo',
  'observacao',
] as const;
