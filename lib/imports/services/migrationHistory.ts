/**
 * Histórico de migrações — stub fase 1 (sem persistência).
 */

import { listImportModules } from '@/lib/imports/modules';
import type { MigrationHistoryRow } from '@/lib/imports/types';

export function listMigrationHistory(): MigrationHistoryRow[] {
  return [];
}

export function getMigrationHistoryColumns(): {
  key: keyof MigrationHistoryRow;
  label: string;
}[] {
  return [
    { key: 'date', label: 'Data' },
    { key: 'typeLabel', label: 'Tipo' },
    { key: 'fileName', label: 'Arquivo' },
    { key: 'userName', label: 'Usuário' },
    { key: 'quantity', label: 'Quantidade' },
    { key: 'status', label: 'Status' },
  ];
}

export function resolveMigrationTypeLabel(type: MigrationHistoryRow['type']): string {
  return listImportModules().find((m) => m.id === type)?.title ?? type;
}
