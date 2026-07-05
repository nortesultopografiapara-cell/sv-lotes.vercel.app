/**
 * Registro central dos módulos de importação.
 */

import { attachmentsImportModule } from '@/lib/imports/modules/attachments';
import { brokersImportModule } from '@/lib/imports/modules/brokers';
import { contractsImportModule } from '@/lib/imports/modules/contracts';
import { customersImportModule } from '@/lib/imports/modules/customers';
import { installmentsImportModule } from '@/lib/imports/modules/installments';
import { salesImportModule } from '@/lib/imports/modules/sales';
import type { ImportModuleDefinition, ImportModuleId } from '@/lib/imports/types';

export const IMPORT_MODULES: ImportModuleDefinition[] = [
  customersImportModule,
  brokersImportModule,
  salesImportModule,
  installmentsImportModule,
  contractsImportModule,
  attachmentsImportModule,
];

export function listImportModules(): ImportModuleDefinition[] {
  return [...IMPORT_MODULES];
}

export function getImportModuleById(id: ImportModuleId): ImportModuleDefinition | undefined {
  return IMPORT_MODULES.find((m) => m.id === id);
}

export {
  customersImportModule,
  brokersImportModule,
  salesImportModule,
  installmentsImportModule,
  contractsImportModule,
  attachmentsImportModule,
};
