import type { ImportModuleDefinition } from '@/lib/imports/types';

export const salesImportModule: ImportModuleDefinition = {
  id: 'sales',
  title: 'Vendas',
  description: 'Importe vendas de lotes vinculadas a clientes e corretores.',
  status: 'available_soon',
  statusLabel: 'Disponível em breve',
  enabled: true,
};

export const SALES_IMPORT_TEMPLATE_COLUMNS = [
  'cliente',
  'corretor',
  'empreendimento',
  'quadra',
  'lote',
  'valor',
  'data_venda',
] as const;
