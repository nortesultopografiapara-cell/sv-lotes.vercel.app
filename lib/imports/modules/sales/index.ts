import type { ImportModuleDefinition } from '@/lib/imports/types';

export const salesImportModule: ImportModuleDefinition = {
  id: 'sales',
  title: 'Vendas',
  description: 'Importe vendas de lotes vinculadas a clientes, corretores e empreendimentos existentes.',
  status: 'available',
  statusLabel: 'Disponível',
  enabled: true,
};

export { SALES_IMPORT_TEMPLATE_COLUMNS } from '@/lib/imports/modules/sales/constants';
