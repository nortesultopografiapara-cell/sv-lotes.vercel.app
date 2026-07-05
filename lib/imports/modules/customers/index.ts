import type { ImportModuleDefinition } from '@/lib/imports/types';

export const customersImportModule: ImportModuleDefinition = {
  id: 'customers',
  title: 'Clientes',
  description: 'Importe cadastro de clientes a partir de planilhas Excel ou CSV.',
  status: 'available',
  statusLabel: 'Disponível',
  enabled: true,
};

export {
  CUSTOMER_IMPORT_TEMPLATE_COLUMNS,
} from '@/lib/imports/modules/customers/constants';
