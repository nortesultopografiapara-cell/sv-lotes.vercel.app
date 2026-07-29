/**
 * Registro central dos módulos de importação.
 */

import { attachmentsImportModule } from '@/lib/imports/modules/attachments';
import { brokersImportModule } from '@/lib/imports/modules/brokers';
import { customersImportModule } from '@/lib/imports/modules/customers';
import { installmentsImportModule } from '@/lib/imports/modules/installments';
import { legacyContractsImportModule } from '@/lib/imports/modules/legacy-contracts';
import { salesImportModule } from '@/lib/imports/modules/sales';
import type { ImportModuleDefinition, ImportModuleId } from '@/lib/imports/types';

/**
 * Módulos exibidos no assistente para novas importações.
 * Contratos Antigos permanece implementado (APIs/histórico), mas oculto na UI —
 * novos documentos devem ir em Documentos da Venda (GIS → Editar Venda).
 */
export const IMPORT_MODULES: ImportModuleDefinition[] = [
  customersImportModule,
  brokersImportModule,
  salesImportModule,
  installmentsImportModule,
];

export function listImportModules(): ImportModuleDefinition[] {
  return [...IMPORT_MODULES];
}

export function getImportModuleById(id: ImportModuleId): ImportModuleDefinition | undefined {
  if (id === 'attachments') return attachmentsImportModule;
  if (id === 'legacy_contracts') return legacyContractsImportModule;
  return IMPORT_MODULES.find((m) => m.id === id);
}

export {
  customersImportModule,
  brokersImportModule,
  salesImportModule,
  installmentsImportModule,
  legacyContractsImportModule,
  attachmentsImportModule,
};
