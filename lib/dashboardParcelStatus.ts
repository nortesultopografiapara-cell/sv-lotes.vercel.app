/**
 * Situação das parcelas no Dashboard — leitura dos finance_receipts já carregados.
 * Categorias persistidas: Pago | Pendente | Atrasado.
 *
 * NÃO aplica a regra de UI do Financeiro (pendente + due_date vencido = atrasado).
 * Essa diferença fica registrada para tarefa futura; o KPI Inadimplência permanece
 * apenas com status persistido atrasado/overdue.
 */

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

export type DashboardParcelStatusCounts = {
  pago: number;
  pendente: number;
  atrasado: number;
  total: number;
};

export type DashboardParcelPieSlice = {
  name: string;
  value: number;
  color: string;
};

const PARCEL_SLICE_COLORS = {
  pago: '#10b981',
  pendente: '#f59e0b',
  atrasado: '#ef4444',
} as const;

function normalizeReceiptStatus(status: unknown): string {
  return String(status || '')
    .trim()
    .toLowerCase();
}

/** Conta parcelas pelos status persistidos. Canceladas ficam de fora do total. */
export function summarizeDashboardParcelStatus(
  receipts: Array<{ status?: string | null }>,
): DashboardParcelStatusCounts {
  let pago = 0;
  let pendente = 0;
  let atrasado = 0;

  for (const receipt of receipts || []) {
    const st = normalizeReceiptStatus(receipt.status);
    if (st === 'pago' || st === 'paid') {
      pago += 1;
      continue;
    }
    if (st === 'atrasado' || st === 'overdue') {
      atrasado += 1;
      continue;
    }
    if (st === 'pendente' || st === 'pending') {
      pendente += 1;
    }
  }

  return {
    pago,
    pendente,
    atrasado,
    total: pago + pendente + atrasado,
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
