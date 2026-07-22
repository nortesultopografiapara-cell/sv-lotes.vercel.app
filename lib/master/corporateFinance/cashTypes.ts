/** Tipos — Fluxo de Caixa Corporativo (Fase 6.3). */

export const CORPORATE_CASH_MOVEMENT_TYPES = [
  'INCOME',
  'EXPENSE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'REVERSAL',
] as const;

export type CorporateCashMovementType = (typeof CORPORATE_CASH_MOVEMENT_TYPES)[number];

export const CORPORATE_CASH_MOVEMENT_ORIGINS = [
  'RECEIVABLE_PAYMENT',
  'PAYABLE_PAYMENT',
  'MANUAL_INCOME',
  'MANUAL_EXPENSE',
  'ACCOUNT_TRANSFER',
  'REVERSAL',
  'BACKFILL_RECEIVABLE',
  'BACKFILL_PAYABLE',
  'LEGACY_PROJECT_RECEIVED',
  'ASAAS',
] as const;

export type CorporateCashMovementOrigin = (typeof CORPORATE_CASH_MOVEMENT_ORIGINS)[number];

export type MasterCorporateCashMovement = {
  id: string;
  code: string;
  movement_date: string;
  competence_date: string;
  type: CorporateCashMovementType;
  amount: number;
  description: string;
  financial_account_id: string;
  category_id: string | null;
  cost_center_id: string | null;
  project_id: string | null;
  quote_id: string | null;
  receivable_id: string | null;
  receivable_payment_id: string | null;
  payable_id: string | null;
  payable_payment_id: string | null;
  transfer_group_id: string | null;
  origin: CorporateCashMovementOrigin;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  idempotency_key: string | null;
  is_reversed: boolean;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
  reversal_movement_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterCorporateCashMovementInput = {
  movement_date: string;
  competence_date: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  description: string;
  financial_account_id: string;
  category_id: string;
  cost_center_id: string | null;
  project_id: string | null;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
};

export type MasterCorporateTransferInput = {
  from_account_id: string;
  to_account_id: string;
  movement_date: string;
  amount: number;
  notes: string | null;
};

export type MasterCorporateCashListFilters = {
  q?: string;
  type?: string;
  origin?: string;
  financialAccountId?: string;
  categoryId?: string;
  costCenterId?: string;
  projectId?: string;
  paymentMethod?: string;
  fromDate?: string;
  toDate?: string;
  includeReversed?: boolean;
  page?: number;
  limit?: number;
};

export type MasterCorporateCashKpis = {
  currentBalance: number;
  periodIncome: number;
  periodExpense: number;
  periodNet: number;
  openingBalanceInPeriod: number;
  closingBalance: number;
  movementsCount: number;
};

export type MasterCorporateAccountBalance = {
  accountId: string;
  openingBalance: number;
  openingBalanceDate: string | null;
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  currentBalance: number;
  lastMovementAt: string | null;
};

export type CorporateMonthlyRevenueExpense = {
  year: number;
  months: Array<{
    month: number;
    income: number;
    expense: number;
    net: number;
  }>;
  totals: { income: number; expense: number; net: number };
};

export function corporateCashTypeLabel(type: string): string {
  switch (type) {
    case 'INCOME':
      return 'Entrada';
    case 'EXPENSE':
      return 'Saída';
    case 'TRANSFER_IN':
      return 'Transferência entrada';
    case 'TRANSFER_OUT':
      return 'Transferência saída';
    case 'REVERSAL':
      return 'Estorno';
    default:
      return type;
  }
}

export function corporateCashOriginLabel(origin: string): string {
  switch (origin) {
    case 'RECEIVABLE_PAYMENT':
      return 'Recebimento';
    case 'PAYABLE_PAYMENT':
      return 'Pagamento';
    case 'MANUAL_INCOME':
      return 'Entrada manual';
    case 'MANUAL_EXPENSE':
      return 'Despesa manual';
    case 'ACCOUNT_TRANSFER':
      return 'Transferência';
    case 'REVERSAL':
      return 'Estorno';
    case 'BACKFILL_RECEIVABLE':
      return 'Backfill recebimento';
    case 'BACKFILL_PAYABLE':
      return 'Backfill pagamento';
    case 'LEGACY_PROJECT_RECEIVED':
      return 'Legado projeto';
    case 'ASAAS':
      return 'Asaas';
    default:
      return origin;
  }
}

/** Sinal do movimento no saldo da conta (ignorando is_reversed no cálculo externo). */
export function cashMovementSignedAmount(
  type: string,
  amount: number,
  isReversed: boolean,
): number {
  if (isReversed) return 0;
  const n = Number(amount) || 0;
  switch (type) {
    case 'INCOME':
    case 'TRANSFER_IN':
      return n;
    case 'EXPENSE':
    case 'TRANSFER_OUT':
      return -n;
    case 'REVERSAL':
      // REVERSAL amount is stored positive; direction encoded by pairing — signed at create time via type of counter-entry
      // For listing, reversals that restore cash are TRANSFER-like: we store reversing INCOME as type REVERSAL with positive impact via notes?
      // Model: reverse INCOME creates REVERSAL with negative effect = we use amount and a convention:
      // reversal of income = expense effect (-), reversal of expense = income effect (+)
      // Stored in `type=REVERSAL` only; signed amount passed explicitly in service when aggregating via linked original.
      return 0;
    default:
      return 0;
  }
}
