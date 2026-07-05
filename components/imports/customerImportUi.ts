'use client';

import type {
  CustomerPreviewFilter,
  CustomerRowStatus,
  ValidatedCustomerRow,
} from '@/lib/imports/modules/customers/types';

export const CUSTOMER_PREVIEW_FILTERS: {
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

export const CUSTOMER_ROW_STATUS_LABELS: Record<CustomerRowStatus, string> = {
  valid: 'Válido',
  warning: 'Aviso',
  error: 'Erro',
  duplicate: 'Duplicado',
  existing: 'Existente',
};

export function filterCustomerPreviewRows(
  rows: ValidatedCustomerRow[],
  filter: CustomerPreviewFilter,
): ValidatedCustomerRow[] {
  if (filter === 'all') return rows;
  return rows.filter((row) => row.status === filter);
}

export function customerRowStatusClass(status: CustomerRowStatus): string {
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
