/**
 * DTOs de Minhas Vendas — sem campos financeiros.
 * Proibido: preço, comissão, entrada, parcelas, Asaas, caixa.
 */

export type MySalesRecordType = 'sale' | 'reservation';

export type MySalesListTab = 'all' | 'sales' | 'reservations';

export type MySalesSummary = {
  totalSales: number;
  salesThisMonth: number;
  activeReservations: number;
  pendingContracts: number;
  signedContracts: number;
};

export type MySalesListItem = {
  id: string;
  type: MySalesRecordType;
  typeLabel: string;
  date: string | null;
  projectName: string;
  blockLabel: string;
  lotLabel: string;
  customerName: string;
  customerPhone: string | null;
  statusKey: string;
  statusLabel: string;
  contractStatusKey: string | null;
  contractStatusLabel: string | null;
  reservationExpiresAt: string | null;
  contractSignedAt: string | null;
  saleId: string | null;
  reservationId: string | null;
  contractId: string | null;
  linkedSaleId: string | null;
};

export type MySalesDetail = MySalesListItem & {
  brokerName: string | null;
  projectId: string | null;
  blockId: string | null;
  customerId: string | null;
};

export type MySalesListFilters = {
  tab?: MySalesListTab;
  projectId?: string | null;
  status?: string | null;
  search?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  blockLabel?: string | null;
  lotLabel?: string | null;
  page?: number;
  pageSize?: number;
};

export type MySalesListResponse = {
  brokerUnlinked?: boolean;
  message?: string;
  brokerName?: string | null;
  summary: MySalesSummary;
  items: MySalesListItem[];
  total: number;
  page: number;
  pageSize: number;
  projects: Array<{ id: string; name: string }>;
  /** Presente em respostas de erro (HTTP 5xx) — UI não deve zerar KPIs. */
  summaryUnavailable?: boolean;
  error?: string;
  code?: string;
};

/** Campos proibidos — usados em testes de regressão. */
export const MY_SALES_FORBIDDEN_FIELD_KEYS = [
  'total_value',
  'agreed_price',
  'lot_price',
  'down_payment',
  'discount',
  'commission',
  'commission_percent',
  'comissao',
  'signal_amount',
  'paid_amount',
  'amount',
  'asaas',
  'finance_receipt',
  'cash_movement',
  'repasse',
] as const;
