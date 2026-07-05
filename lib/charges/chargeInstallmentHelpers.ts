import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import { resolveAsaasStatusDisplayLabel } from '@/lib/charges/chargeOperationsHelpers';

export type FinanceReceiptRow = Record<string, unknown>;

export type ChargeInstallmentView = {
  id: string;
  clientName: string;
  projectName: string;
  lotLabel: string;
  parcelLabel: string;
  dueDateIso: string;
  dueDateLabel: string;
  amount: number;
  installmentStatus: string;
  installmentStatusLabel: string;
  asaasStatusLabel: string;
};

export type ChargeKpiSummary = {
  emAberto: number;
  vencidas: number;
  vencemHoje: number;
  pagasMes: number;
  totalAReceber: number;
  qtyEmAberto: number;
  qtyVencidas: number;
  qtyVencemHoje: number;
  qtyPagasMes: number;
};

function todayIsoDate(): string {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today.toISOString().split('T')[0];
}

export function computeInstallmentStatus(
  row: FinanceReceiptRow,
  todayStr = todayIsoDate(),
): string {
  const raw = String(row.status || 'pendente').toLowerCase();
  const dueStr = String(row.due_date || '').split('T')[0];
  if ((raw === 'pendente' || raw === 'pending') && dueStr && dueStr < todayStr) {
    return 'atrasado';
  }
  return raw;
}

export function formatInstallmentStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === 'pago' || s === 'paid') return 'Pago';
  if (s === 'pendente' || s === 'pending') return 'Pendente';
  if (s === 'atrasado' || s === 'overdue') return 'Vencido';
  if (s === 'cancelado' || s === 'canceled') return 'Cancelado';
  return status;
}

export function buildChargeInstallmentView(
  row: FinanceReceiptRow,
  asaasCharge: CompanyAsaasChargeResponse | null | undefined,
  todayStr = todayIsoDate(),
): ChargeInstallmentView {
  const projects = row.projects as { name?: string } | undefined;
  const sales = row.sales as {
    projects?: { name?: string };
    installments_count?: number;
  } | undefined;
  const blocks = row.blocks as {
    block_name?: string;
    name?: string;
    number?: string;
    projects?: { name?: string };
  } | undefined;
  const customers = row.customers as { name?: string; full_name?: string } | undefined;

  const projectName =
    projects?.name || sales?.projects?.name || blocks?.projects?.name || '—';
  const blockName = blocks?.block_name || blocks?.name || '?';
  const lotNumber = blocks?.number || '?';
  const lotLabel = `QD ${blockName} • LT ${lotNumber}`;

  const isEntry =
    row.installment_number === 0 || row.installment_number === '0';
  const parcelInfo = isEntry ? 'ENTRADA' : String(row.installment_number || 1);
  const maxParcel =
    sales?.installments_count && !isEntry ? ` / ${sales.installments_count}` : '';
  const parcelLabel = isEntry ? 'Entrada' : `Parcela ${parcelInfo}${maxParcel}`;

  const dueStr = String(row.due_date || '').split('T')[0];
  const installmentStatus = computeInstallmentStatus(row, todayStr);

  return {
    id: String(row.id),
    clientName: customers?.name || customers?.full_name || '—',
    projectName,
    lotLabel,
    parcelLabel,
    dueDateIso: dueStr,
    dueDateLabel: dueStr
      ? new Date(`${dueStr}T12:00:00Z`).toLocaleDateString('pt-BR')
      : '—',
    amount: Number(row.amount) || 0,
    installmentStatus,
    installmentStatusLabel: formatInstallmentStatusLabel(installmentStatus),
    asaasStatusLabel: resolveAsaasStatusDisplayLabel(asaasCharge),
  };
}

export function computeChargeKpiSummary(
  rows: FinanceReceiptRow[],
  todayStr = todayIsoDate(),
): ChargeKpiSummary {
  const today = new Date(`${todayStr}T12:00:00Z`);
  const currentMonth = today.getUTCMonth();
  const currentYear = today.getUTCFullYear();

  let emAberto = 0;
  let vencidas = 0;
  let vencemHoje = 0;
  let pagasMes = 0;
  let totalAReceber = 0;
  let qtyEmAberto = 0;
  let qtyVencidas = 0;
  let qtyVencemHoje = 0;
  let qtyPagasMes = 0;

  for (const row of rows) {
    const amt = Number(row.amount) || 0;
    const status = computeInstallmentStatus(row, todayStr);
    const dueStr = String(row.due_date || '').split('T')[0];
    const isEntry = row.installment_number === 0 || row.installment_number === '0';

    if (status === 'pago' || status === 'paid') {
      const paidAt = row.paid_at ? new Date(String(row.paid_at)) : new Date(`${dueStr}T12:00:00Z`);
      if (paidAt.getUTCMonth() === currentMonth && paidAt.getUTCFullYear() === currentYear) {
        pagasMes += amt;
        qtyPagasMes += 1;
      }
      continue;
    }

    if (status === 'cancelado' || status === 'canceled') continue;

    totalAReceber += amt;

    if (status === 'atrasado' || status === 'overdue') {
      vencidas += amt;
      if (!isEntry) qtyVencidas += 1;
      continue;
    }

    if (status === 'pendente' || status === 'pending') {
      emAberto += amt;
      if (!isEntry) qtyEmAberto += 1;
      if (dueStr === todayStr) {
        vencemHoje += amt;
        if (!isEntry) qtyVencemHoje += 1;
      }
    }
  }

  return {
    emAberto,
    vencidas,
    vencemHoje,
    pagasMes,
    totalAReceber,
    qtyEmAberto,
    qtyVencidas,
    qtyVencemHoje,
    qtyPagasMes,
  };
}

export function filterChargeInstallments(
  rows: FinanceReceiptRow[],
  filters: {
    search: string;
    statusFilter: string;
    projectFilter: string;
    startDate: string;
    endDate: string;
  },
  todayStr = todayIsoDate(),
): FinanceReceiptRow[] {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    const view = buildChargeInstallmentView(row, null, todayStr);
    const matchSearch = search
      ? view.clientName.toLowerCase().includes(search) ||
        view.projectName.toLowerCase().includes(search) ||
        view.lotLabel.toLowerCase().includes(search) ||
        view.parcelLabel.toLowerCase().includes(search)
      : true;

    const status = view.installmentStatus;
    const matchStatus =
      filters.statusFilter === 'Todas'
        ? true
        : filters.statusFilter === 'Pago'
          ? status === 'pago' || status === 'paid'
          : filters.statusFilter === 'Pendente'
            ? status === 'pendente' || status === 'pending'
            : filters.statusFilter === 'Vencido'
              ? status === 'atrasado' || status === 'overdue'
              : filters.statusFilter === 'Cancelado'
                ? status === 'cancelado' || status === 'canceled'
                : true;

    const matchProject =
      filters.projectFilter === 'Todos os projetos'
        ? true
        : view.projectName === filters.projectFilter;

    const matchStart = filters.startDate ? view.dueDateIso >= filters.startDate : true;
    const matchEnd = filters.endDate ? view.dueDateIso <= filters.endDate : true;

    return matchSearch && matchStatus && matchProject && matchStart && matchEnd;
  });
}
