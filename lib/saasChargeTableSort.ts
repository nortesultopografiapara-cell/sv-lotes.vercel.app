import type { SaasInvoiceChargeRow } from '@/lib/saasInvoiceChargeView';
import {
  resolveSaasChargeDisplayStatus,
  type SaasChargeDisplayStatus,
} from '@/lib/masterSaasPanel';

export type SaasChargeSortColumn =
  | 'companyName'
  | 'referenceMonth'
  | 'amount'
  | 'dueDate'
  | 'status';

export type SaasChargeSortDirection = 'asc' | 'desc';

export type SaasChargeSortState = {
  column: SaasChargeSortColumn;
  direction: SaasChargeSortDirection;
};

export type SaasChargeSortPreset =
  | 'due_asc'
  | 'due_desc'
  | 'amount_asc'
  | 'amount_desc'
  | 'company_asc'
  | 'company_desc'
  | 'reference_asc'
  | 'reference_desc'
  | 'status';

export const DEFAULT_SAAS_CHARGE_SORT: SaasChargeSortState = {
  column: 'dueDate',
  direction: 'asc',
};

export const SAAS_CHARGE_SORT_PRESET_OPTIONS: Array<{ value: SaasChargeSortPreset; label: string }> =
  [
    { value: 'due_asc', label: 'Vencimento ↑' },
    { value: 'due_desc', label: 'Vencimento ↓' },
    { value: 'amount_asc', label: 'Valor ↑' },
    { value: 'amount_desc', label: 'Valor ↓' },
    { value: 'company_asc', label: 'Empresa A-Z' },
    { value: 'company_desc', label: 'Empresa Z-A' },
    { value: 'reference_asc', label: 'Competência ↑' },
    { value: 'reference_desc', label: 'Competência ↓' },
    { value: 'status', label: 'Status' },
  ];

const STATUS_PRIORITY: Record<SaasChargeDisplayStatus, number> = {
  VENCIDA: 0,
  GERADA: 1,
  VISUALIZADA: 2,
  ENVIADA: 3,
  PAGA: 4,
  CANCELADA: 5,
};

function compareDueDateAsc(a: SaasInvoiceChargeRow, b: SaasInvoiceChargeRow): number {
  const da = String(a.dueDate || '').trim();
  const db = String(b.dueDate || '').trim();
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.localeCompare(db);
}

function compareStatusPriority(
  a: SaasInvoiceChargeRow,
  b: SaasInvoiceChargeRow,
  direction: SaasChargeSortDirection,
): number {
  const sa = STATUS_PRIORITY[resolveSaasChargeDisplayStatus(a)];
  const sb = STATUS_PRIORITY[resolveSaasChargeDisplayStatus(b)];
  const dir = direction === 'asc' ? 1 : -1;
  if (sa !== sb) return (sa - sb) * dir;
  return compareDueDateAsc(a, b);
}

export function saasChargeSortPresetToState(preset: SaasChargeSortPreset): SaasChargeSortState {
  switch (preset) {
    case 'due_asc':
      return { column: 'dueDate', direction: 'asc' };
    case 'due_desc':
      return { column: 'dueDate', direction: 'desc' };
    case 'amount_asc':
      return { column: 'amount', direction: 'asc' };
    case 'amount_desc':
      return { column: 'amount', direction: 'desc' };
    case 'company_asc':
      return { column: 'companyName', direction: 'asc' };
    case 'company_desc':
      return { column: 'companyName', direction: 'desc' };
    case 'reference_asc':
      return { column: 'referenceMonth', direction: 'asc' };
    case 'reference_desc':
      return { column: 'referenceMonth', direction: 'desc' };
    case 'status':
      return { column: 'status', direction: 'asc' };
    default:
      return DEFAULT_SAAS_CHARGE_SORT;
  }
}

export function saasChargeSortStateToPreset(state: SaasChargeSortState): SaasChargeSortPreset | null {
  if (state.column === 'status') return 'status';

  const key = `${state.column}_${state.direction}` as const;
  const map: Partial<Record<string, SaasChargeSortPreset>> = {
    dueDate_asc: 'due_asc',
    dueDate_desc: 'due_desc',
    amount_asc: 'amount_asc',
    amount_desc: 'amount_desc',
    companyName_asc: 'company_asc',
    companyName_desc: 'company_desc',
    referenceMonth_asc: 'reference_asc',
    referenceMonth_desc: 'reference_desc',
  };

  return map[key] ?? null;
}

export function resolveSaasChargeSortPresetValue(state: SaasChargeSortState): SaasChargeSortPreset {
  return saasChargeSortStateToPreset(state) ?? 'due_asc';
}

export function compareSaasChargeRows(
  a: SaasInvoiceChargeRow,
  b: SaasInvoiceChargeRow,
  state: SaasChargeSortState,
): number {
  if (state.column === 'status') {
    return compareStatusPriority(a, b, state.direction);
  }

  const dir = state.direction === 'asc' ? 1 : -1;
  let cmp = 0;

  switch (state.column) {
    case 'companyName':
      cmp = a.companyName.localeCompare(b.companyName, 'pt-BR', { sensitivity: 'base' });
      break;
    case 'referenceMonth':
      cmp = String(a.referenceMonth).localeCompare(String(b.referenceMonth));
      break;
    case 'amount':
      cmp = Number(a.amount || 0) - Number(b.amount || 0);
      break;
    case 'dueDate':
      cmp = compareDueDateAsc(a, b);
      break;
    default:
      cmp = 0;
  }

  if (cmp !== 0) return cmp * dir;

  const dueTie = compareDueDateAsc(a, b);
  if (dueTie !== 0) return dueTie;

  return String(a.invoiceId).localeCompare(String(b.invoiceId));
}

export function sortSaasInvoiceChargeRows(
  rows: SaasInvoiceChargeRow[],
  state: SaasChargeSortState = DEFAULT_SAAS_CHARGE_SORT,
): SaasInvoiceChargeRow[] {
  return [...rows].sort((a, b) => compareSaasChargeRows(a, b, state));
}

export function toggleSaasChargeColumnSort(
  current: SaasChargeSortState,
  column: SaasChargeSortColumn,
): SaasChargeSortState {
  if (current.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { column, direction: 'asc' };
}

export function saasChargeSortColumnLabel(column: SaasChargeSortColumn): string {
  switch (column) {
    case 'companyName':
      return 'Empresa';
    case 'referenceMonth':
      return 'Competência';
    case 'amount':
      return 'Valor';
    case 'dueDate':
      return 'Vencimento';
    case 'status':
      return 'Status';
    default:
      return column;
  }
}
