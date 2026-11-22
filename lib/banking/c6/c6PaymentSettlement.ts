/**
 * Baixa da parcela a partir do GET /v1/bank_slips/{id} (OpenAPI 1.7.3).
 * Status oficial: CREATED, PAID, CANCELLED.
 * O valor liquidado vem de payments[] ou de payment_amount. O valor de face não quita.
 * Não baixa parcela de outra empresa, cancelada, estornada ou já quitada por outro meio.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { C6BankSlipResponse } from '@/lib/banking/c6/c6BoletoTypes';
import {
  SETTLE_COMPANY_C6_BANK_SLIP_RPC,
  type C6SettlementTxnCode,
} from '@/lib/banking/c6/c6SettlementTransaction';

const TXN_MESSAGES: Record<C6SettlementTxnCode, string> = {
  settled: 'Parcela baixada pelo boleto C6.',
  duplicate: 'Pagamento C6 já conciliado.',
  cancelled: 'Parcela cancelada. A baixa não foi feita.',
  reversed: 'Parcela estornada. A baixa não foi feita.',
  already_paid: 'Parcela já quitada. A baixa não foi feita.',
  divergent: 'Valor pago diverge da parcela. A baixa não foi feita.',
  foreign_company: 'Parcela de outra empresa.',
  mismatch: 'Conta financeira não confere com a cobrança C6.',
  ineligible: 'Parcela inelegível para baixa C6.',
  not_found: 'Parcela não encontrada.',
};

export type C6SettlementResult = {
  paid: boolean;
  duplicate: boolean;
  divergent: boolean;
  receiptUpdated: boolean;
  financeReceiptId: string | null;
  cashMovementId: string | null;
  bankSlipId: string | null;
  message: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readOfficialC6BankSlip(body: unknown): C6BankSlipResponse | null {
  const row = asRecord(body);
  if (!row) return null;
  const status = String(row.status || '').toUpperCase();
  if (status && status !== 'CREATED' && status !== 'PAID' && status !== 'CANCELLED') return null;
  const payments = Array.isArray(row.payments)
    ? row.payments
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => ({
          date: item.date != null ? String(item.date) : undefined,
          amount: item.amount != null ? Number(item.amount) : undefined,
        }))
    : undefined;
  return {
    id: row.id != null ? String(row.id) : undefined,
    amount: row.amount != null ? Number(row.amount) : undefined,
    due_date: row.due_date != null ? String(row.due_date) : undefined,
    status,
    payments,
    payment_amount: row.payment_amount != null ? Number(row.payment_amount) : undefined,
    payment_date: row.payment_date != null ? String(row.payment_date) : undefined,
    digitable_line: row.digitable_line != null ? String(row.digitable_line) : undefined,
    bar_code: row.bar_code != null ? String(row.bar_code) : undefined,
  };
}

export type C6ConfirmedPayment = { amount: number; paidAt: string };

/** PAID com valor e data confirmados. payments[] e payment_amount divergentes não confirmam. */
export function readConfirmedC6Payment(slip: C6BankSlipResponse): C6ConfirmedPayment | null {
  if (String(slip.status || '').toUpperCase() !== 'PAID') return null;
  const payments = Array.isArray(slip.payments) ? slip.payments : [];
  let listedAmount: number | null = null;
  let listedDate: string | null = null;
  if (payments.length > 0) {
    const amounts = payments.map((item) => money(item.amount));
    const dates = payments.map((item) => String(item.date || '').trim().slice(0, 10));
    if (amounts.some((item) => item == null) || dates.some((item) => !item)) return null;
    if (new Set(dates).size !== 1) return null;
    listedAmount = money(amounts.reduce((sum, item) => sum + (item as number), 0));
    listedDate = dates[0];
  }
  const headerAmount = slip.payment_amount == null ? null : money(slip.payment_amount);
  const headerDate = String(slip.payment_date || '').trim().slice(0, 10) || null;
  if (listedAmount != null && headerAmount != null && !sameMoney(listedAmount, headerAmount)) return null;
  if (listedDate && headerDate && listedDate !== headerDate) return null;
  const amount = listedAmount ?? headerAmount;
  const paidAt = listedDate || headerDate;
  if (amount == null || !paidAt) return null;
  return { amount, paidAt };
}

function money(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

export async function settleC6PaidSlip(
  admin: SupabaseClient,
  input: {
    companyId: string;
    charge: Record<string, unknown>;
    slip: C6BankSlipResponse;
  },
): Promise<C6SettlementResult> {
  const companyId = String(input.companyId || '').trim();
  const charge = input.charge;
  const slip = input.slip;
  const bankSlipId = String(slip.id || charge.external_id || '').trim() || null;
  const empty = (message: string, extra?: Partial<C6SettlementResult>): C6SettlementResult => ({
    paid: false,
    duplicate: false,
    divergent: false,
    receiptUpdated: false,
    financeReceiptId: charge.finance_receipt_id ? String(charge.finance_receipt_id) : null,
    cashMovementId: null,
    bankSlipId,
    message,
    ...extra,
  });

  if (String(charge.company_id || '') !== companyId || String(charge.provider || '') !== 'C6') {
    return empty('Cobrança C6 não pertence a esta empresa.');
  }
  if (String(slip.status || '').toUpperCase() !== 'PAID') {
    return empty('Boleto C6 ainda não está pago.');
  }
  const confirmed = readConfirmedC6Payment(slip);
  if (!confirmed) return empty('O valor pago do boleto C6 não está confirmado.');

  const financeReceiptId = String(charge.finance_receipt_id || '').trim();
  if (!financeReceiptId) return empty('Cobrança C6 sem parcela.');
  const chargeId = String(charge.id || '').trim();
  const slipId = String(slip.id || '').trim();
  const externalId = String(charge.external_id || '').trim();
  if (!chargeId || !slipId || (externalId && externalId !== slipId)) {
    return empty('Boleto C6 não confere com a cobrança.');
  }

  const { data, error } = await admin.rpc(SETTLE_COMPANY_C6_BANK_SLIP_RPC, {
    p_company_id: companyId,
    p_charge_id: chargeId,
    p_receipt_id: financeReceiptId,
    p_integration_id: String(charge.integration_id || ''),
    p_financial_account_id: String(charge.financial_account_id || '') || null,
    p_bank_slip_id: slipId,
    p_paid_amount: confirmed.amount,
    p_paid_on: confirmed.paidAt,
  });
  if (error) throw new Error(error.message || 'Não foi possível baixar o boleto C6.');
  const body = asRecord(data);
  const code = String(body?.code || '') as C6SettlementTxnCode;
  if (!TXN_MESSAGES[code]) return empty('Não foi possível baixar o boleto C6.');
  return {
    paid: code === 'settled' || code === 'duplicate',
    duplicate: code === 'duplicate',
    divergent: code === 'divergent',
    receiptUpdated: body?.receiptUpdated === true,
    financeReceiptId,
    cashMovementId: body?.cashMovementId ? String(body.cashMovementId) : null,
    bankSlipId,
    message: TXN_MESSAGES[code],
  };
}
