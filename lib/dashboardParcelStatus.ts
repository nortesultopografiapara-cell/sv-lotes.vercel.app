/**
 * Situação das parcelas no Dashboard — leitura dos finance_receipts já carregados.
 * Classificação operacional: mesma regra do Financeiro/Cobranças
 * (`computeInstallmentStatus`) — pendente + due_date < hoje vira atrasado
 * só na UI, sem persistir status.
 */

import { computeInstallmentStatus } from '@/lib/charges/chargeInstallmentHelpers';

export type DashboardFinanceReceiptRow = {
  id?: string;
  status?: string | null;
  amount?: number | string | null;
  paid_amount?: number | string | null;
  paid_at?: string | null;
  due_date?: string | null;
  sale_id?: string | null;
  project_id?: string | null;
  customer_id?: string | null;
  block_id?: string | null;
  projects?: { id?: string; name?: string | null } | null;
  sales?: {
    id?: string;
    project_id?: string | null;
    projects?: { id?: string; name?: string | null } | null;
  } | null;
  blocks?: {
    project_id?: string | null;
    projects?: { id?: string; name?: string | null } | null;
  } | null;
};

export type DashboardParcelBucket = 'pago' | 'pendente' | 'atrasado' | 'cancelado' | 'other';

export type DashboardParcelStatusCounts = {
  pago: number;
  pendente: number;
  atrasado: number;
  total: number;
  pendenteAmount: number;
  atrasadoAmount: number;
};

export type DashboardParcelPieSlice = {
  name: string;
  value: number;
  color: string;
};

export const EMPTY_DASHBOARD_PARCEL_STATUS: DashboardParcelStatusCounts = {
  pago: 0,
  pendente: 0,
  atrasado: 0,
  total: 0,
  pendenteAmount: 0,
  atrasadoAmount: 0,
};

const PARCEL_SLICE_COLORS = {
  pago: '#10b981',
  pendente: '#f59e0b',
  atrasado: '#ef4444',
} as const;

/** Mesma classificação operacional do Financeiro (via computeInstallmentStatus). */
export function classifyDashboardParcelBucket(
  row: { status?: string | null; due_date?: string | null },
  todayStr?: string,
): DashboardParcelBucket {
  const computed = computeInstallmentStatus(row, todayStr).toLowerCase();
  if (computed === 'pago' || computed === 'paid') return 'pago';
  if (computed === 'cancelado' || computed === 'canceled' || computed === 'cancelled') {
    return 'cancelado';
  }
  if (computed === 'atrasado' || computed === 'overdue') return 'atrasado';
  if (computed === 'pendente' || computed === 'pending') return 'pendente';
  return 'other';
}

/** Conta parcelas pela classificação operacional. Canceladas ficam de fora do total. */
export function summarizeDashboardParcelStatus(
  receipts: Array<{
    status?: string | null;
    due_date?: string | null;
    amount?: number | string | null;
  }>,
  todayStr?: string,
): DashboardParcelStatusCounts {
  let pago = 0;
  let pendente = 0;
  let atrasado = 0;
  let pendenteAmount = 0;
  let atrasadoAmount = 0;

  for (const receipt of receipts || []) {
    const bucket = classifyDashboardParcelBucket(receipt, todayStr);
    const amount = Number(receipt.amount) || 0;
    if (bucket === 'pago') {
      pago += 1;
      continue;
    }
    if (bucket === 'atrasado') {
      atrasado += 1;
      atrasadoAmount += amount;
      continue;
    }
    if (bucket === 'pendente') {
      pendente += 1;
      pendenteAmount += amount;
    }
  }

  return {
    pago,
    pendente,
    atrasado,
    total: pago + pendente + atrasado,
    pendenteAmount,
    atrasadoAmount,
  };
}

export function buildDashboardParcelPieData(
  counts: DashboardParcelStatusCounts,
): DashboardParcelPieSlice[] {
  return [
    { name: 'Pago', value: counts.pago, color: PARCEL_SLICE_COLORS.pago },
    { name: 'Pendente', value: counts.pendente, color: PARCEL_SLICE_COLORS.pendente },
    { name: 'Atrasado', value: counts.atrasado, color: PARCEL_SLICE_COLORS.atrasado },
  ];
}

/** Select enxuto para totais e filtro de empreendimento (helper paginado). */
export const DASHBOARD_FINANCE_RECEIPTS_SELECT = `
  id, status, amount, paid_amount, paid_at, due_date, sale_id, project_id, customer_id, block_id,
  projects:project_id(id, name),
  sales:sale_id(id, project_id, projects(id, name)),
  blocks:block_id(project_id, projects(id, name))
`;

export const DASHBOARD_FINANCE_RECEIPTS_SELECT_FALLBACK = `
  id, status, amount, paid_amount, paid_at, due_date, sale_id, project_id, customer_id, block_id
`;
