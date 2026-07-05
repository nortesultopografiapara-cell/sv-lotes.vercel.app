import type { ImportModuleDefinition } from '@/lib/imports/types';

export const installmentsImportModule: ImportModuleDefinition = {
  id: 'installments',
  title: 'Parcelas',
  description: 'Importe parcelas e vencimentos vinculados a vendas existentes.',
  status: 'available_soon',
  statusLabel: 'Disponível em breve',
  enabled: true,
};

export const INSTALLMENTS_IMPORT_TEMPLATE_COLUMNS = [
  'venda_id',
  'numero_parcela',
  'valor',
  'vencimento',
  'status',
] as const;
