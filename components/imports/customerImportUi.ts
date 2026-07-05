'use client';

import type { CustomerPreviewFilter } from '@/lib/imports/types';

export const IMPORT_PREVIEW_FILTERS: {
  id: CustomerPreviewFilter;
  label: string;
}[] = [
  { id: 'all', label: 'Todos' },
  { id: 'valid', label: 'Válidos' },
  { id: 'warning', label: 'Avisos' },
  { id: 'error', label: 'Erros' },
  { id: 'duplicate', label: 'Duplicados' },
  { id: 'existing', label: 'Existentes' },
];

export const IMPORT_ROW_STATUS_LABELS: Record<CustomerRowStatus | string, string> = {
  valid: 'Válido',
  warning: 'Aviso',
  error: 'Erro',
  duplicate: 'Duplicado',
  existing: 'Existente',
};

export const CUSTOMER_PREVIEW_FILTERS = IMPORT_PREVIEW_FILTERS;
export const CUSTOMER_ROW_STATUS_LABELS = IMPORT_ROW_STATUS_LABELS;

export function filterImportPreviewRows<T extends { status: string }>(
  rows: T[],
  filter: CustomerPreviewFilter,
): T[] {
  if (filter === 'all') return rows;
  return rows.filter((row) => row.status === filter);
}

/** @deprecated Use filterImportPreviewRows */
export const filterCustomerPreviewRows = filterImportPreviewRows;

export function customerRowStatusClass(status: string): string {
  switch (status) {
    case 'valid':
      return 'text-emerald-400';
    case 'warning':
      return 'text-amber-400';
    case 'error':
      return 'text-red-400';
    case 'duplicate':
      return 'text-orange-400';
    case 'existing':
      return 'text-slate-400';
    default:
      return 'text-[var(--text-secondary)]';
  }
}

export function detectImportFileStatusLabel(
  fileType: string,
  rowCount: number,
): string {
  if (rowCount <= 0) return 'Arquivo vazio ou sem linhas de dados';
  if (fileType === 'unknown') return 'Tipo não reconhecido';
  return 'Pronto para validação';
}
