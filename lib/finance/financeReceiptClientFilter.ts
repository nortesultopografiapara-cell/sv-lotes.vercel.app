/**
 * Filtro da tabela do Financeiro. A mesma regra da tela publicada:
 * busca em contrato, venda, cliente e lote; status nulo entra em
 * "Todas as Situações"; canceladas só aparecem no filtro Cancelado.
 */

export type FinanceReceiptClientFilterInput = {
  search: string;
  statusFilter: string;
  projectFilter: string;
  financialAccountFilter: string;
  startDate: string;
  endDate: string;
  todayIso?: string;
};

export function financeReceiptFiltersAreActive(
  filters: FinanceReceiptClientFilterInput,
): boolean {
  return (
    String(filters.search || '').trim() !== '' ||
    filters.statusFilter !== 'Todas as Situações' ||
    filters.projectFilter !== 'Todos os projetos' ||
    filters.financialAccountFilter !== 'Todas as contas' ||
    String(filters.startDate || '') !== '' ||
    String(filters.endDate || '') !== ''
  );
}

export function filterFinanceReceiptRows<T extends Record<string, any>>(
  rows: T[],
  filters: FinanceReceiptClientFilterInput,
): T[] {
  const todayIso = filters.todayIso || new Date().toISOString().split('T')[0];
  const search = filters.search || '';
  const statusFilter = filters.statusFilter;
  const projectFilter = filters.projectFilter;
  const financialAccountFilter = filters.financialAccountFilter;
  const startDate = filters.startDate;
  const endDate = filters.endDate;

  return rows.filter((p) => {
    const computedContract =
      p.sales?.contracts?.[0]?.contract_number ||
      (p.sales?.id
        ? 'CT-' +
          new Date(p.created_at || new Date()).getFullYear() +
          '-' +
          p.sales.id.substring(0, 6).toUpperCase()
        : 'CT-S/N');
    const computedProjName =
      p.projects?.name ||
      p.sales?.projects?.name ||
      p.blocks?.projects?.name ||
      'Projeto Desconhecido';

    const matchSearch = search
      ? computedContract.toLowerCase().includes(search.toLowerCase()) ||
        p.sales?.id?.toLowerCase().includes(search.toLowerCase()) ||
        p.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.blocks?.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.blocks?.block_name?.toLowerCase().includes(search.toLowerCase()) ||
        String(p.blocks?.number).includes(search)
      : true;

    const matchStatus =
      statusFilter !== 'Todas as Situações'
        ? (statusFilter.toLowerCase() === 'pago' &&
            (p.status === 'pago' || p.status === 'PAID')) ||
          (statusFilter.toLowerCase() === 'pendente' &&
            (p.status === 'pendente' || p.status === 'PENDING') &&
            p.due_date >= todayIso) ||
          (statusFilter.toLowerCase() === 'atrasado' &&
            (p.status === 'atrasado' ||
              p.status === 'OVERDUE' ||
              ((p.status === 'pendente' || p.status === 'PENDING') &&
                p.due_date < todayIso))) ||
          (statusFilter.toLowerCase() === 'cancelado' &&
            (p.status === 'cancelado' ||
              p.status === 'CANCELED' ||
              p.status === 'cancelled' ||
              p.status === 'CANCELLED'))
        : (() => {
            const st = String(p.status || '').toLowerCase();
            return st !== 'cancelado' && st !== 'canceled' && st !== 'cancelled';
          })();

    const matchProject =
      projectFilter !== 'Todos os projetos' ? computedProjName === projectFilter : true;

    const receiptAccountId = String(
      p.financial_account_id || p.sales?.financial_account_id || '',
    ).trim();
    const matchFinancialAccount =
      financialAccountFilter === 'Todas as contas'
        ? true
        : receiptAccountId === financialAccountFilter;

    const matchStartDate = startDate ? p.due_date >= startDate : true;
    const matchEndDate = endDate ? p.due_date <= endDate : true;

    return (
      matchSearch &&
      matchStatus &&
      matchProject &&
      matchFinancialAccount &&
      matchStartDate &&
      matchEndDate
    );
  });
}
