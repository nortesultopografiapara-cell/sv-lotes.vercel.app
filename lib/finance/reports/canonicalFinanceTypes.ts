/**
 * Dataset financeiro canônico — tipos.
 * PDF e Excel são apenas apresentação deste objeto.
 *
 * Três universos, nunca misturados:
 * - wallet: carteira de parcelas (1 linha = 1 finance_receipt)
 * - cash: movimentação real de caixa (buildCashFlowItems)
 * - destinations: distribuição/split — NÃO é receita
 */

export const FINANCE_REPORT_ALL_PROJECTS = 'Todos os projetos';
export const FINANCE_REPORT_ALL_ACCOUNTS = 'Todas as contas';
export const FINANCE_REPORT_ALL_STATUSES = 'Todas as Situações';

export const DESTINATION_DISCLAIMER =
  'Valores desta aba representam distribuição de recebimentos e não devem ser somados novamente à receita. Bruto previsto e líquido liquidado são grandezas distintas e não devem ser somados entre si.';

export type DestinationAmountKind = 'settled' | 'estimated' | 'account';

export type CanonicalFinanceFilters = {
  startDate: string;
  endDate: string;
  projectFilter: string;
  financialAccountId: string;
  financialAccountLabel: string;
  statusFilter: string;
  search: string;
};

export type CanonicalFinanceCompany = {
  name: string;
  document: string;
  email?: string | null;
  phone?: string | null;
};

export type CanonicalFinanceMeta = {
  companyName: string;
  companyDocument: string;
  companyEmail: string | null;
  companyPhone: string | null;
  generatedAtIso: string;
  generatedAtLabel: string;
  periodStartIso: string;
  periodEndIso: string;
  periodLabel: string;
  filters: CanonicalFinanceFilters;
  filterLines: string[];
  dateSemantics: string[];
};

export type CanonicalSplitLeg = {
  beneficiaryName: string;
  sharePercent: number;
  /** Bruto contratado/previsto da perna. Nunca substituir pelo líquido. */
  amount: number;
  grossAmount: number;
  /**
   * Valor informado pelo Asaas (net_amount). Pode existir em PENDING como
   * previsto/estimado. Liquidado confirmado exige status SETTLED.
   */
  netAmount: number | null;
  amountKind: DestinationAmountKind;
  amountKindLabel: string;
  statusLabel: string;
  accountOrWallet: string | null;
  isIssuerRemainder: boolean;
};

export type CanonicalWalletMovement = {
  id: string;
  saleId: string | null;
  contractNumber: string;
  clientName: string;
  clientDocument: string;
  projectName: string;
  blockName: string;
  lotNumber: string;
  installmentNumber: number;
  installmentLabel: string;
  dueDate: string;
  dueDateLabel: string;
  paidAt: string | null;
  paidAtLabel: string;
  amount: number;
  paidAmount: number;
  status: string;
  statusLabel: string;
  financialAccountId: string | null;
  financialAccountLabel: string;
  hasSplit: boolean;
  split: CanonicalSplitLeg[];
  destinationFallbackLabel: string;
  chargeProvider: 'ASAAS' | 'INTER' | 'MANUAL' | null;
  gatewayFeeAmount: number | null;
};

export type CanonicalCashMovement = {
  id: string;
  date: string;
  dateLabel: string;
  tipo: 'entrada' | 'saida';
  tipoLabel: string;
  category: string;
  projectName: string;
  description: string;
  accountLabel: string | null;
  originLabel: string | null;
  amount: number;
  status: string;
};

export type CanonicalProjectBreakdown = {
  projectName: string;
  received: number;
  toReceive: number;
  overdue: number;
};

export type CanonicalDestinationTotal = {
  beneficiaryName: string;
  sharePercent: number | null;
  amount: number;
  grossAmount: number;
  netAmount: number | null;
  amountKind: DestinationAmountKind;
  amountKindLabel: string;
};

export type CanonicalOutflowByCategory = {
  category: string;
  amount: number;
};

export type CanonicalWalletUniverse = {
  movements: CanonicalWalletMovement[];
  receivedInPeriod: number;
  toReceive: number;
  overdue: number;
  qtyPaid: number;
  qtyPending: number;
  qtyOverdue: number;
  byProject: CanonicalProjectBreakdown[];
};

export type CanonicalCashUniverse = {
  openingBalance: number;
  inflows: number;
  outflows: number;
  closingBalance: number;
  movements: CanonicalCashMovement[];
  outflowsByCategory: CanonicalOutflowByCategory[];
};

export type CanonicalDestinationsUniverse = {
  rows: CanonicalDestinationTotal[];
  /** Sempre a soma dos brutos previstos — nunca mistura com líquido. */
  total: number;
  grossPredictedTotal: number;
  /** Soma de net_amount somente das pernas SETTLED. PENDING+net não entra. */
  netConfirmedTotal: number;
  persistedFeeTotal: number | null;
  disclaimer: string;
};

export type CanonicalFinanceReport = {
  meta: CanonicalFinanceMeta;
  wallet: CanonicalWalletUniverse;
  cash: CanonicalCashUniverse;
  destinations: CanonicalDestinationsUniverse;
};

export type CanonicalFinanceTotals = {
  walletReceived: number;
  walletToReceive: number;
  walletOverdue: number;
  qtyPaid: number;
  qtyPending: number;
  qtyOverdue: number;
  cashOpening: number;
  cashInflows: number;
  cashOutflows: number;
  cashClosing: number;
  destinationsTotal: number;
  destinationsGrossPredicted: number;
  destinationsNetConfirmed: number;
  walletMovementCount: number;
  cashMovementCount: number;
  destinationRowCount: number;
};

export type CanonicalSplitParticipantInput = {
  id?: string;
  displayName?: string;
  display_name?: string;
  sharePercent?: number;
  share_percent?: number;
  isIssuerRemainder?: boolean;
  is_issuer_remainder?: boolean;
  financialAccountId?: string | null;
  financial_account_id?: string | null;
  destinationIdentifier?: string | null;
  destination_identifier?: string | null;
};

export type CanonicalSplitLegInput = CanonicalSplitParticipantInput & {
  installmentId?: string;
  installment_id?: string;
  netAmount?: number | null;
  net_amount?: number | null;
  grossAmountEstimate?: number | null;
  gross_amount_estimate?: number | null;
  status?: string | null;
};

export type CanonicalSaleSplitView = {
  saleId: string;
  snapshot: { id: string } | null;
  participants: CanonicalSplitParticipantInput[];
  legs: CanonicalSplitLegInput[];
};

export type CanonicalChargeHint = {
  provider?: 'ASAAS' | 'INTER' | 'MANUAL' | null;
  feeAmount?: number | null;
};

export type CanonicalFinanceReportInput = {
  receipts: any[];
  cashMovements: any[];
  commissions?: any[];
  splitViews?: Record<string, CanonicalSaleSplitView | null | undefined>;
  accountLabels?: Record<string, string>;
  chargeHints?: Record<string, CanonicalChargeHint>;
  filters: CanonicalFinanceFilters;
  company: CanonicalFinanceCompany;
  todayIso: string;
  generatedAt?: Date;
};
