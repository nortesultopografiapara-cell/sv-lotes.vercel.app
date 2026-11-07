/**
 * Entrada recebida no ato da venda.
 * O valor sai de paid_amount. Valor previsto, zero ou ausente não gera caixa.
 * A consulta anterior ao INSERT não impede duas requisições simultâneas.
 * A unicidade real depende do índice proposto e ainda não aplicado.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildManualFinanceReceiptCashMovement } from '@/lib/finance/cashMovementsSchema';

export const SALE_INITIAL_CASH_PROVIDER = 'SALE_CREATE';
export const SALE_INITIAL_CASH_UNIQUE_INDEX = 'cash_movements_sale_create_receipt_uidx';

export class SaleInitialCashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaleInitialCashError';
  }
}

export type SaleInitialReceipt = {
  id: string;
  tenantId?: string | null;
  companyId?: string | null;
  saleId?: string | null;
  amount?: number | string | null;
  paidAmount?: number | string | null;
  status?: string | null;
  installmentNumber?: number | string | null;
  scheduleGroup?: string | null;
  projectId?: string | null;
  customerId?: string | null;
};

export type OwnedSaleCreateCash = {
  id: string;
  tenantId: string;
  saleId: string;
  receiptId: string;
};

function paidStatus(status: string | null | undefined): boolean {
  const value = String(status || '').toLowerCase().trim();
  return value === 'pago' || value === 'paid' || value === 'paga';
}

function cents(value: number): number {
  return Math.round(value * 100);
}

/** Valor confirmado da parcela 0. Zero, ausente ou não pago devolve null. */
export function confirmedInitialReceivedCents(row: SaleInitialReceipt): number | null {
  if (Number(row.installmentNumber) !== 0) return null;
  if (!paidStatus(row.status)) return null;
  if (row.paidAmount == null || String(row.paidAmount).trim() === '') return null;
  const paid = Number(row.paidAmount);
  if (!Number.isFinite(paid)) {
    throw new SaleInitialCashError('O valor recebido é inválido.');
  }
  if (paid < 0) {
    throw new SaleInitialCashError('O valor recebido não pode ser negativo.');
  }
  if (paid === 0) return null;
  const amount = Number(row.amount);
  if (Number.isFinite(amount) && amount > 0 && cents(paid) > cents(amount)) {
    throw new SaleInitialCashError('O valor recebido é maior que a parcela.');
  }
  return cents(paid);
}

export function isSaleInitialReceivedReceipt(row: SaleInitialReceipt): boolean {
  return confirmedInitialReceivedCents(row) != null;
}

export function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (String(error.code || '') === '23505') return true;
  return /duplicate key|unique constraint/i.test(String(error.message || ''));
}

export function planSaleInitialCashMovements(input: {
  tenantId: string;
  saleId: string;
  userId: string;
  contractNumber?: string | null;
  receipts: SaleInitialReceipt[];
  paidAt?: string;
}): Record<string, unknown>[] {
  const tenantId = String(input.tenantId || '').trim();
  const saleId = String(input.saleId || '').trim();
  if (!tenantId || !saleId) {
    throw new SaleInitialCashError('A entrada recebida ficou sem empresa ou sem venda.');
  }
  const plans: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const row of input.receipts) {
    const receivedCents = confirmedInitialReceivedCents(row);
    if (receivedCents == null) continue;
    const receiptTenant = String(row.tenantId || '').trim();
    const receiptCompany = String(row.companyId || '').trim();
    if ((receiptTenant && receiptTenant !== tenantId) || (receiptCompany && receiptCompany !== tenantId)) {
      throw new SaleInitialCashError('O recebível pertence a outra empresa.');
    }
    const receiptSale = String(row.saleId || '').trim();
    if (receiptSale && receiptSale !== saleId) {
      throw new SaleInitialCashError('O recebível pertence a outra venda.');
    }
    const receiptId = String(row.id || '').trim();
    if (!receiptId || seen.has(receiptId)) continue;
    seen.add(receiptId);
    plans.push(buildManualFinanceReceiptCashMovement({
      tenantId,
      receiptId,
      amount: receivedCents / 100,
      installmentNumber: 0,
      contractNumber: input.contractNumber,
      customerId: row.customerId,
      saleId,
      projectId: row.projectId,
      userId: input.userId,
      paidAt: input.paidAt,
      provider: SALE_INITIAL_CASH_PROVIDER,
    }));
  }

  return plans;
}

/**
 * Insere a entrada. Não consulta o caixa antes.
 * Se o índice único existir, a segunda requisição recebe 23505 e não cria outro movimento.
 * Sem esse índice, as duas inserções são gravadas. A aplicação não disfarça essa corrida.
 */
export async function ensureSaleInitialReceiptCash(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    saleId: string;
    userId: string;
    contractNumber?: string | null;
    receipts: SaleInitialReceipt[];
    paidAt?: string;
  },
): Promise<OwnedSaleCreateCash[]> {
  const plans = planSaleInitialCashMovements(input);
  const owned: OwnedSaleCreateCash[] = [];
  for (const payload of plans) {
    const metadata = payload.metadata as { installment_id?: string };
    const receiptId = String(metadata.installment_id || '');
    const { data, error } = await supabase
      .from('cash_movements')
      .insert(payload)
      .select('id')
      .maybeSingle();
    if (isUniqueViolation(error)) continue;
    if (error || !data?.id) {
      throw new SaleInitialCashError(error?.message || 'Falha ao lançar a entrada no caixa.');
    }
    owned.push({
      id: String(data.id),
      tenantId: input.tenantId,
      saleId: input.saleId,
      receiptId,
    });
  }
  return owned;
}
