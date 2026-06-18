/**
 * Planejamento puro do recálculo financeiro na edição de venda.
 * Testável sem Supabase.
 */

import type { LotFormConfirmPayload } from '@/components/map/CustomerLotFormModal';
import { parseValidatedInstallmentsCount } from '@/lib/installmentsCount';
import {
  expectedSaleFinanceTotal,
  resolveInstallmentPrincipal,
  splitInstallmentAmounts,
} from '@/lib/saleInstallmentCalc';

export type SaleFinancePayloadOptions = {
  contractModel?: unknown;
  /** Na criação de venda à vista, marcar a parcela única como paga. */
  cashInstallmentPaid?: boolean;
};

export type FinanceReceiptRow = {
  id: string;
  status?: string | null;
  paid_at?: string | null;
  installment_number: number | string;
  amount?: number | string | null;
};

export type FinanceReceiptPayload = Record<string, unknown> & {
  installment_number: number;
  amount: number;
  due_date: string;
  status: string;
};

export function isPaidFinanceReceipt(r: {
  status?: string | null;
  paid_at?: string | null;
}): boolean {
  const st = String(r.status || '').toLowerCase().trim();
  return st === 'pago' || st === 'paid' || Boolean(r.paid_at);
}

export function isCancelledFinanceReceipt(r: { status?: string | null }): boolean {
  const st = String(r.status || '').toLowerCase().trim();
  return st === 'cancelado' || st === 'cancelled';
}

export function isPendingFinanceReceipt(r: FinanceReceiptRow): boolean {
  if (isCancelledFinanceReceipt(r)) return false;
  return !isPaidFinanceReceipt(r);
}

export function installmentKey(value: number | string | null | undefined): number {
  return Number(value);
}

export function buildSaleEditFinancePayloads(
  tenantId: string,
  saleId: string,
  customerId: string,
  brokerId: string | null,
  lot: { id: string; project_id?: string | null },
  data: LotFormConfirmPayload,
  options?: SaleFinancePayloadOptions,
): FinanceReceiptPayload[] {
  const financePayloads: FinanceReceiptPayload[] = [];
  const pmtType = data.payment_type || 'À vista';
  const grossDownPayment = Number(data.down_payment) || 0;
  const reservationSignalPaid = Number(data.reservation_signal_paid) || 0;
  let downPayment = grossDownPayment;
  const instCount =
    pmtType === 'Parcelado'
      ? parseValidatedInstallmentsCount(String(data.installments_count ?? ''))
      : 1;
  const fValue = data.final_value;

  if (reservationSignalPaid > 0 && pmtType === 'Parcelado') {
    downPayment = Math.max(0, grossDownPayment - reservationSignalPaid);
  }

  if (pmtType === 'À vista') {
    financePayloads.push({
      tenant_id: tenantId,
      company_id: tenantId,
      sale_id: saleId,
      customer_id: customerId,
      broker_id: brokerId,
      project_id: lot.project_id || null,
      block_id: lot.id,
      installment_number: 1,
      amount: fValue,
      due_date: data.down_payment_due_date || new Date().toISOString().split('T')[0],
      status: options?.cashInstallmentPaid ? 'pago' : 'pendente',
      ...(options?.cashInstallmentPaid
        ? { paid_at: new Date().toISOString() }
        : {}),
    });
  } else if (pmtType === 'Parcelado') {
    let currentInst = 1;
    if (reservationSignalPaid > 0) {
      financePayloads.push({
        tenant_id: tenantId,
        company_id: tenantId,
        sale_id: saleId,
        customer_id: customerId,
        broker_id: brokerId,
        project_id: lot.project_id || null,
        block_id: lot.id,
        installment_number: -1,
        amount: reservationSignalPaid,
        due_date:
          data.signal_date ||
          data.down_payment_due_date ||
          new Date().toISOString().split('T')[0],
        status: 'pago',
        paid_at: new Date().toISOString(),
      });
    }
    if (downPayment > 0 && data.down_payment_due_date) {
      financePayloads.push({
        tenant_id: tenantId,
        company_id: tenantId,
        sale_id: saleId,
        customer_id: customerId,
        broker_id: brokerId,
        project_id: lot.project_id || null,
        block_id: lot.id,
        installment_number: 0,
        amount: downPayment,
        due_date: data.down_payment_due_date,
        status: 'pendente',
      });
    }
    if (data.first_installment_due_date) {
      const principal = resolveInstallmentPrincipal({
        totalValue: fValue,
        downPayment,
        contractModel: options?.contractModel,
      });
      const amounts = splitInstallmentAmounts(principal, instCount);
      let cDate = new Date(data.first_installment_due_date + 'T12:00:00Z');
      for (let i = 0; i < instCount; i++) {
        financePayloads.push({
          tenant_id: tenantId,
          company_id: tenantId,
          sale_id: saleId,
          customer_id: customerId,
          broker_id: brokerId,
          project_id: lot.project_id || null,
          block_id: lot.id,
          installment_number: currentInst++,
          amount: amounts[i] ?? 0,
          due_date: cDate.toISOString().split('T')[0],
          status: 'pendente',
        });
        cDate.setMonth(cDate.getMonth() + 1);
      }
    }
  }

  return financePayloads;
}

export type PartialRecalcPlan = {
  paid: FinanceReceiptRow[];
  pending: FinanceReceiptRow[];
  paidInstallmentNumbers: Set<number>;
  toDeleteIds: string[];
  toInsert: FinanceReceiptPayload[];
  needsConfirm: boolean;
  totalDiff: number;
};

export function planPartialFinanceRecalc(
  receipts: FinanceReceiptRow[],
  newPayloads: FinanceReceiptPayload[],
  finalValue: number,
  options?: {
    contractModel?: unknown;
    grossDownPayment?: number;
    paymentType?: string;
  },
): PartialRecalcPlan {
  const paid = receipts.filter(isPaidFinanceReceipt);
  const pending = receipts.filter(isPendingFinanceReceipt);
  const paidInstallmentNumbers = new Set(
    paid.map((r) => installmentKey(r.installment_number)),
  );

  const paidTotal = paid.reduce((s, r) => s + Number(r.amount || 0), 0);
  const newPendingTotal = newPayloads
    .filter((p) => p.status === 'pendente')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const expectedTotal = expectedSaleFinanceTotal({
    finalValue,
    grossDownPayment: options?.grossDownPayment,
    contractModel: options?.contractModel,
    paymentType: options?.paymentType,
  });
  const totalDiff = Math.abs(paidTotal + newPendingTotal - expectedTotal);
  const needsConfirm =
    totalDiff > 0.05 && (pending.length > 0 || newPendingTotal > 0);

  const toDeleteIds = pending.map((r) => r.id);
  const toInsert = newPayloads.filter(
    (p) =>
      p.status === 'pendente' &&
      !paidInstallmentNumbers.has(installmentKey(p.installment_number)),
  );

  return {
    paid,
    pending,
    paidInstallmentNumbers,
    toDeleteIds,
    toInsert,
    needsConfirm,
    totalDiff,
  };
}

export function planFullFinanceRecalc(
  newPayloads: FinanceReceiptPayload[],
): { toInsert: FinanceReceiptPayload[] } {
  return { toInsert: newPayloads };
}
