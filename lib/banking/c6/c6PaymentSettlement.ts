/**
 * Baixa da parcela a partir do GET /v1/bank_slips/{id} (OpenAPI 1.7.2).
 * Status oficial: CREATED, PAID, CANCELLED. Pagamento em payments[].
 * Não baixa parcela de outra empresa e não cria segunda movimentação.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCashMovementEntradaPayload } from '@/lib/finance/cashMovementsSchema';
import type { C6BankSlipResponse } from '@/lib/banking/c6/c6BoletoTypes';

const PAID = 'pago';

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
    digitable_line: row.digitable_line != null ? String(row.digitable_line) : undefined,
    bar_code: row.bar_code != null ? String(row.bar_code) : undefined,
  };
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

  const financeReceiptId = String(charge.finance_receipt_id || '').trim();
  if (!financeReceiptId) return empty('Cobrança C6 sem parcela.');

  const { data: receipt, error } = await admin
    .from('finance_receipts')
    .select('id, status, tenant_id, company_id, sale_id, customer_id, project_id, amount, paid_amount, paid_at, installment_number')
    .eq('id', financeReceiptId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!receipt?.id) return empty('Parcela não encontrada.');
  const owner = String(receipt.company_id || receipt.tenant_id || '').trim();
  if (owner !== companyId) return empty('Parcela de outra empresa.');

  const expected = money(receipt.amount);
  const paid = money(slip.payments?.[0]?.amount ?? slip.amount);
  if (expected == null || paid == null || !sameMoney(expected, paid)) {
    return empty('Valor pago diverge da parcela. A baixa não foi feita.', { divergent: true });
  }

  const paidAt = String(slip.payments?.[0]?.date || new Date().toISOString());
  const alreadyPaid = ['pago', 'paid'].includes(String(receipt.status || '').toLowerCase());
  let receiptUpdated = false;
  if (!alreadyPaid) {
    const { error: updateError } = await admin
      .from('finance_receipts')
      .update({ status: PAID, paid_amount: paid, paid_at: paidAt })
      .eq('id', financeReceiptId);
    if (updateError) throw new Error(updateError.message);
    receiptUpdated = true;
  }

  const chargeId = String(charge.id || '');
  const { data: existingMv } = await admin
    .from('cash_movements')
    .select('id, metadata')
    .eq('company_id', companyId)
    .eq('type', 'entrada')
    .eq('status', 'ativo')
    .filter('metadata->>bank_charge_id', 'eq', chargeId)
    .filter('metadata->>provider', 'eq', 'C6');
  const found = (existingMv || []).find((row: { id?: string; metadata?: unknown }) => {
    const meta = asRecord(row.metadata);
    return meta?.bank_charge_id === chargeId && meta?.provider === 'C6';
  });
  let cashMovementId = found?.id ? String(found.id) : null;
  if (!cashMovementId) {
    const payload = buildCashMovementEntradaPayload({
      tenant_id: companyId,
      company_id: companyId,
      project_id: receipt.project_id || null,
      type: 'entrada',
      category: 'recebimento_parcela',
      description: `Recebimento C6 Bank — parcela ${receipt.installment_number ?? ''}`.trim(),
      amount: paid,
      customer_id: receipt.customer_id || charge.customer_id || null,
      sale_id: receipt.sale_id || charge.sale_id || null,
      movement_date: paidAt.slice(0, 10),
      status: 'ativo',
      metadata: {
        provider: 'C6',
        bank_charge_id: chargeId,
        installment_id: financeReceiptId,
        bank_slip_id: bankSlipId,
      },
    });
    const { data: created, error: mvError } = await admin
      .from('cash_movements')
      .insert(payload)
      .select('id')
      .single();
    if (mvError) throw new Error(mvError.message);
    cashMovementId = created?.id ? String(created.id) : null;
  }

  await admin.from('bank_charges').update({ status: 'PAID', updated_at: new Date().toISOString() }).eq('id', chargeId).eq('company_id', companyId).eq('provider', 'C6');
  try {
    await admin.from('audit_logs').insert({
      company_id: companyId,
      action: 'c6_boleto_settlement',
      metadata: {
        finance_receipt_id: financeReceiptId,
        bank_slip_id: bankSlipId,
        amount: paid,
        paid_at: paidAt,
        duplicate: alreadyPaid && Boolean(found?.id),
      },
    });
  } catch {
    /* auditoria não desfaz a baixa */
  }

  return {
    paid: true,
    duplicate: alreadyPaid && Boolean(found?.id),
    divergent: false,
    receiptUpdated,
    financeReceiptId,
    cashMovementId,
    bankSlipId,
    message: alreadyPaid && found?.id ? 'Pagamento C6 já conciliado.' : 'Parcela baixada pelo boleto C6.',
  };
}
