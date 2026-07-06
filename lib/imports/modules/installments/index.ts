import type { ImportModuleDefinition } from '@/lib/imports/types';
import { INSTALLMENTS_IMPORT_TEMPLATE_COLUMNS } from '@/lib/imports/modules/installments/constants';

export const installmentsImportModule: ImportModuleDefinition = {
  id: 'installments',
  title: 'Atualizar Parcelas das Vendas Importadas',
  description:
    'Atualize status, vencimentos, pagamentos e valores das parcelas já geradas pelas vendas importadas.',
  status: 'available',
  statusLabel: 'Disponível',
  enabled: true,
};

export { INSTALLMENTS_IMPORT_TEMPLATE_COLUMNS };
