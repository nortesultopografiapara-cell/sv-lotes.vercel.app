import type { ImportModuleDefinition } from '@/lib/imports/types';

export const legacyContractsImportModule: ImportModuleDefinition = {
  id: 'legacy_contracts',
  title: 'Contratos Antigos',
  description: 'Anexe PDFs de contratos antigos a vendas já existentes.',
  status: 'available',
  statusLabel: 'Disponível',
  enabled: true,
};

export { LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS } from '@/lib/imports/modules/legacy-contracts/constants';
