import type { ImportModuleDefinition } from '@/lib/imports/types';

export const customersImportModule: ImportModuleDefinition = {
  id: 'customers',
  title: 'Clientes',
  description: 'Importe cadastro de clientes a partir de planilhas Excel ou CSV.',
  status: 'available_soon',
  statusLabel: 'Disponível em breve',
  enabled: true,
};

export const CUSTOMERS_IMPORT_TEMPLATE_COLUMNS = [
  'nome',
  'cpf',
  'email',
  'telefone',
  'endereco',
] as const;
