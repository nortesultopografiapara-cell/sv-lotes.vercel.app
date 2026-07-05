import type { ImportModuleDefinition } from '@/lib/imports/types';

export const brokersImportModule: ImportModuleDefinition = {
  id: 'brokers',
  title: 'Corretores',
  description: 'Importe corretores e percentuais de comissão a partir de planilhas Excel ou CSV.',
  status: 'available',
  statusLabel: 'Disponível',
  enabled: true,
};

export { BROKER_IMPORT_TEMPLATE_COLUMNS } from '@/lib/imports/modules/brokers/constants';
