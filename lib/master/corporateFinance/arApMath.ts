/**
 * Cálculos e status de AR/AP corporativo (Fase 6.2).
 * Sem movimentos de caixa — apenas obrigação + liquidações.
 */

import type {
  CorporatePayableStatus,
  CorporateReceivableStatus,
} from './arApTypes';

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeNetAmount(params: {
  original_amount: number;
  discount_amount: number;
  interest_amount: number;
  fine_amount: number;
}): number {
  const net = roundMoney(
    params.original_amount -
      params.discount_amount +
      params.interest_amount +
      params.fine_amount,
  );
  if (net < 0) throw new Error('Valor líquido não pode ser negativo.');
  return net;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function computeReceivableStatus(params: {
  net_amount: number;
  received_amount: number;
  due_date: string;
  is_archived: boolean;
  canceled_at: string | null;
  preferDraft?: boolean;
  today?: string;
}): CorporateReceivableStatus {
  if (params.canceled_at) return 'CANCELED';
  if (params.is_archived) return 'ARCHIVED';

  const received = roundMoney(params.received_amount);
  const net = roundMoney(params.net_amount);
  const remaining = roundMoney(net - received);

  if (remaining <= 0 && net > 0) return 'RECEIVED';
  if (remaining <= 0 && net === 0 && received === 0) {
    return params.preferDraft ? 'DRAFT' : 'OPEN';
  }
  if (received > 0 && remaining > 0) {
    const today = params.today || todayUtcDate();
    if (params.due_date < today) return 'OVERDUE';
    return 'PARTIAL';
  }
  if (params.preferDraft && received === 0) return 'DRAFT';

  const today = params.today || todayUtcDate();
  if (params.due_date < today && remaining > 0) return 'OVERDUE';
  return 'OPEN';
}

export function computePayableStatus(params: {
  net_amount: number;
  paid_amount: number;
  due_date: string;
  is_archived: boolean;
  canceled_at: string | null;
  preferDraft?: boolean;
  today?: string;
}): CorporatePayableStatus {
  if (params.canceled_at) return 'CANCELED';
  if (params.is_archived) return 'ARCHIVED';

  const paid = roundMoney(params.paid_amount);
  const net = roundMoney(params.net_amount);
  const remaining = roundMoney(net - paid);

  if (remaining <= 0 && net > 0) return 'PAID';
  if (remaining <= 0 && net === 0 && paid === 0) {
    return params.preferDraft ? 'DRAFT' : 'OPEN';
  }
  if (paid > 0 && remaining > 0) {
    const today = params.today || todayUtcDate();
    if (params.due_date < today) return 'OVERDUE';
    return 'PARTIAL';
  }
  if (params.preferDraft && paid === 0) return 'DRAFT';

  const today = params.today || todayUtcDate();
  if (params.due_date < today && remaining > 0) return 'OVERDUE';
  return 'OPEN';
}

/** Quotes elegíveis para vínculo em recebível. */
export const LINKABLE_QUOTE_STATUSES = ['APROVADO', 'CONVERTIDO'] as const;

export function isLinkableQuoteStatus(status: string): boolean {
  return (LINKABLE_QUOTE_STATUSES as readonly string[]).includes(status);
}
