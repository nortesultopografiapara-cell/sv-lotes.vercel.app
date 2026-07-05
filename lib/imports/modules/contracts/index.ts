import type { ImportModuleDefinition } from '@/lib/imports/types';

export const contractsImportModule: ImportModuleDefinition = {
  id: 'contracts',
  title: 'Contratos',
  description: 'Importe metadados de contratos vinculados a vendas.',
  status: 'available_soon',
  statusLabel: 'Disponível em breve',
  enabled: true,
};

export const CONTRACTS_IMPORT_TEMPLATE_COLUMNS = [
  'numero_contrato',
  'cliente',
  'venda_id',
  'data_contrato',
  'status',
] as const;
