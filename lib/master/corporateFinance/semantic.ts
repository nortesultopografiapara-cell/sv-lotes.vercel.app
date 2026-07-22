/**
 * Padrão visual semântico do Financeiro Corporativo MASTER (Fase 6.4).
 * Cores aplicadas via borda, ícone, badge e valor — não pintar card inteiro.
 */

export type CorporateFinanceSemanticTone =
  | 'income'
  | 'received'
  | 'expense'
  | 'paid'
  | 'open'
  | 'partial'
  | 'overdue'
  | 'dueMonth'
  | 'transfer'
  | 'balance'
  | 'balancePositive'
  | 'balanceNegative'
  | 'canceled'
  | 'archived'
  | 'alert'
  | 'neutral'
  | 'resultPositive'
  | 'resultNegative';

export const CORPORATE_FINANCE_SEMANTIC_COLORS: Record<
  CorporateFinanceSemanticTone,
  string
> = {
  income: '#16a34a',
  received: '#16a34a',
  expense: '#dc2626',
  paid: '#dc2626',
  open: '#2563eb',
  partial: '#7c3aed',
  overdue: '#b91c1c',
  dueMonth: '#d97706',
  transfer: '#0891b2',
  balance: '#2563eb',
  balancePositive: '#16a34a',
  balanceNegative: '#dc2626',
  canceled: '#64748b',
  archived: '#64748b',
  alert: '#ea580c',
  neutral: '#64748b',
  resultPositive: '#16a34a',
  resultNegative: '#dc2626',
};

export function semanticToneForReceivableStatus(status: string): CorporateFinanceSemanticTone {
  switch (String(status || '').toUpperCase()) {
    case 'RECEIVED':
    case 'PAID':
      return 'received';
    case 'PARTIAL':
      return 'partial';
    case 'OVERDUE':
      return 'overdue';
    case 'CANCELED':
      return 'canceled';
    case 'ARCHIVED':
      return 'archived';
    case 'OPEN':
    case 'PENDING':
    default:
      return 'open';
  }
}

export function semanticToneForPayableStatus(status: string): CorporateFinanceSemanticTone {
  switch (String(status || '').toUpperCase()) {
    case 'PAID':
      // Status concluído: verde (não confundir com saída de caixa)
      return 'received';
    case 'PARTIAL':
      return 'partial';
    case 'OVERDUE':
      return 'overdue';
    case 'CANCELED':
      return 'canceled';
    case 'ARCHIVED':
      return 'archived';
    case 'OPEN':
    case 'PENDING':
    default:
      return 'open';
  }
}

export function semanticToneForCashType(type: string): CorporateFinanceSemanticTone {
  switch (String(type || '').toUpperCase()) {
    case 'INCOME':
      return 'income';
    case 'EXPENSE':
      return 'expense';
    case 'TRANSFER_IN':
    case 'TRANSFER_OUT':
      return 'transfer';
    case 'REVERSAL':
      return 'alert';
    default:
      return 'neutral';
  }
}

export function semanticToneForSignedAmount(amount: number): CorporateFinanceSemanticTone {
  if (amount > 0) return 'balancePositive';
  if (amount < 0) return 'balanceNegative';
  return 'neutral';
}

export function semanticToneForResult(amount: number): CorporateFinanceSemanticTone {
  if (amount > 0) return 'resultPositive';
  if (amount < 0) return 'resultNegative';
  return 'neutral';
}

export function receivedSourceLabel(source: string): string {
  return source === 'CORPORATE_FINANCE' ? 'Financeiro corporativo' : 'Legado';
}

export function resolveCorporateFinanceSemantic(tone: CorporateFinanceSemanticTone): {
  tone: CorporateFinanceSemanticTone;
  color: string;
  label: string;
} {
  const labels: Record<CorporateFinanceSemanticTone, string> = {
    income: 'Receita',
    received: 'Recebido',
    expense: 'Despesa',
    paid: 'Pago',
    open: 'Em aberto',
    partial: 'Parcial',
    overdue: 'Vencido',
    dueMonth: 'Vence no mês',
    transfer: 'Transferência',
    balance: 'Saldo',
    balancePositive: 'Saldo positivo',
    balanceNegative: 'Saldo negativo',
    canceled: 'Cancelado',
    archived: 'Arquivado',
    alert: 'Alerta',
    neutral: 'Neutro',
    resultPositive: 'Resultado positivo',
    resultNegative: 'Resultado negativo',
  };
  return {
    tone,
    color: CORPORATE_FINANCE_SEMANTIC_COLORS[tone],
    label: labels[tone],
  };
}
