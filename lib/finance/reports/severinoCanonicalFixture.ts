/**
 * Fixture canônica — Contrato 000000007/2026 / SEVERINO JOSE DE FRANÇA.
 * Usada pelos testes e pela geração de PDF/Excel de inspeção.
 */
import {
  FINANCE_REPORT_ALL_ACCOUNTS,
  FINANCE_REPORT_ALL_PROJECTS,
  FINANCE_REPORT_ALL_STATUSES,
  type CanonicalFinanceReportInput,
  type CanonicalSaleSplitView,
} from './canonicalFinanceTypes';

export const SEVERINO_CONTRACT = '000000007/2026';
export const SEVERINO_CLIENT = 'SEVERINO JOSE DE FRANÇA';
export const SEVERINO_PROJECT = 'Chacreamento Araguaia';
export const SEVERINO_TODAY = '2026-09-17';

const SALE_ID = 'sale-severino-araguaia';
const ENTRADA_ID = 'receipt-severino-entrada';
const PARCELA_ID = 'receipt-severino-parcela';
const SNAPSHOT_ID = 'snap-severino';

function customer() {
  return {
    name: SEVERINO_CLIENT,
    document: '123.456.789-00',
    cpf_cnpj: '123.456.789-00',
  };
}

function blocks() {
  return { block_name: '02', name: '02', number: '41' };
}

function sales() {
  return {
    id: SALE_ID,
    installments_count: 2,
    financial_account_id: 'fa-admin',
    projects: { name: SEVERINO_PROJECT },
    contracts: [{ contract_number: SEVERINO_CONTRACT }],
  };
}

export function buildSeverinoSplitView(over: Partial<CanonicalSaleSplitView> = {}): CanonicalSaleSplitView {
  const participants = [
    {
      id: 'part-admin',
      displayName: 'Administradora',
      sharePercent: 50,
      isIssuerRemainder: true,
      financialAccountId: 'fa-admin',
      destinationIdentifier: 'wallet-admin',
    },
    {
      id: 'part-ana',
      displayName: 'ANA VITORIA',
      sharePercent: 50,
      isIssuerRemainder: false,
      financialAccountId: 'fa-ana',
      destinationIdentifier: 'wallet-ana',
    },
  ];
  return {
    saleId: SALE_ID,
    snapshot: { id: SNAPSHOT_ID },
    participants,
    legs: [
      {
        id: 'leg-admin-parcela',
        installmentId: PARCELA_ID,
        displayName: 'Administradora',
        sharePercent: 50,
        isIssuerRemainder: true,
        financialAccountId: 'fa-admin',
        destinationIdentifier: 'wallet-admin',
        grossAmountEstimate: 16.67,
        netAmount: null,
        status: 'SETTLED',
      },
      {
        id: 'leg-ana-parcela',
        installmentId: PARCELA_ID,
        displayName: 'ANA VITORIA',
        sharePercent: 50,
        isIssuerRemainder: false,
        financialAccountId: 'fa-ana',
        destinationIdentifier: 'wallet-ana',
        grossAmountEstimate: 16.67,
        netAmount: null,
        status: 'SETTLED',
      },
    ],
    ...over,
  };
}

export function buildSeverinoCanonicalInput(
  over: Partial<CanonicalFinanceReportInput> = {},
): CanonicalFinanceReportInput {
  const splitView = buildSeverinoSplitView();
  return {
    receipts: [
      {
        id: ENTRADA_ID,
        sale_id: SALE_ID,
        installment_number: 0,
        amount: 33.33,
        paid_amount: 33.33,
        status: 'pago',
        due_date: '2026-09-10',
        paid_at: '2026-09-14T10:30:00.000Z',
        financial_account_id: 'fa-admin',
        customers: customer(),
        projects: { name: SEVERINO_PROJECT },
        blocks: blocks(),
        sales: sales(),
      },
      {
        id: PARCELA_ID,
        sale_id: SALE_ID,
        installment_number: 1,
        amount: 33.34,
        paid_amount: 33.34,
        status: 'pago',
        due_date: '2026-09-14',
        paid_at: '2026-09-14T10:32:00.000Z',
        financial_account_id: 'fa-admin',
        customers: customer(),
        projects: { name: SEVERINO_PROJECT },
        blocks: blocks(),
        sales: sales(),
      },
    ],
    cashMovements: [
      {
        id: 'cash-entrada-severino',
        type: 'entrada',
        status: 'ativo',
        amount: 33.33,
        category: 'Sinal/Entrada',
        description: 'Recebimento entrada contrato 000000007/2026',
        movement_date: '2026-09-14',
        metadata: { installment_id: ENTRADA_ID, financial_account_id: 'fa-admin', provider: 'ASAAS_COMPANY' },
        projects: { name: SEVERINO_PROJECT },
      },
      {
        id: 'cash-parcela-severino',
        type: 'entrada',
        status: 'ativo',
        amount: 33.34,
        category: 'Parcela',
        description: 'Recebimento parcela 1 contrato 000000007/2026',
        movement_date: '2026-09-14',
        metadata: { installment_id: PARCELA_ID, financial_account_id: 'fa-admin', provider: 'ASAAS_COMPANY' },
        projects: { name: SEVERINO_PROJECT },
      },
      {
        id: 'cash-saida-admin',
        type: 'saida',
        status: 'ativo',
        amount: 14,
        category: 'Despesas administrativas',
        description: 'Material de escritório',
        movement_date: '2026-09-12',
        projects: { name: SEVERINO_PROJECT },
      },
    ],
    commissions: [],
    splitViews: { [SALE_ID]: splitView },
    accountLabels: {
      'fa-admin': 'Administradora — Asaas',
      'fa-ana': 'ANA VITORIA — Asaas',
    },
    chargeHints: {
      [PARCELA_ID]: { provider: 'ASAAS', feeAmount: null },
      [ENTRADA_ID]: { provider: 'ASAAS', feeAmount: null },
    },
    filters: {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      projectFilter: SEVERINO_PROJECT,
      financialAccountId: FINANCE_REPORT_ALL_ACCOUNTS,
      financialAccountLabel: FINANCE_REPORT_ALL_ACCOUNTS,
      statusFilter: FINANCE_REPORT_ALL_STATUSES,
      search: '',
    },
    company: {
      name: 'SV LOTES DEMO',
      document: '12.345.678/0001-90',
    },
    todayIso: SEVERINO_TODAY,
    generatedAt: new Date('2026-09-17T17:00:00.000-03:00'),
    ...over,
  };
}

export const SEVERINO_IDS = {
  SALE_ID,
  ENTRADA_ID,
  PARCELA_ID,
  SNAPSHOT_ID,
};

export const DEFAULT_REPORT_FILTERS = {
  startDate: '',
  endDate: '',
  projectFilter: FINANCE_REPORT_ALL_PROJECTS,
  financialAccountId: FINANCE_REPORT_ALL_ACCOUNTS,
  financialAccountLabel: FINANCE_REPORT_ALL_ACCOUNTS,
  statusFilter: FINANCE_REPORT_ALL_STATUSES,
  search: '',
};
