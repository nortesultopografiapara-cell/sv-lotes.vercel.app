/**
 * Planejamento puro do recálculo financeiro na edição de venda.
 * Testável sem Supabase.
 */

import type { LotFormConfirmPayload } from '@/components/map/CustomerLotFormModal';

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
): FinanceReceiptPayload[] {
  const financePayloads: FinanceReceiptPayload[] = [];
  const pmtType = data.payment_type || 'À vista';
  const grossDownPayment = Number(data.down_payment) || 0;
  const reservationSignalPaid = Number(data.reservation_signal_paid) || 0;
  let downPayment = grossDownPayment;
  const instCount = Math.max(1, Number(data.installments_count) || 1);
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
      status: 'pendente',
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
      const totalRestante = Math.max(0, fValue - downPayment);
      const parValue = Math.round((totalRestante / instCount) * 100) / 100;
      let accumulated = 0;
      let cDate = new Date(data.first_installment_due_date + 'T12:00:00Z');
      for (let i = 0; i < instCount; i++) {
        const isLast = i === instCount - 1;
        const currentAmount = isLast
          ? Number((totalRestante - accumulated).toFixed(2))
          : parValue;
        accumulated += currentAmount;
        financePayloads.push({
          tenant_id: tenantId,
          company_id: tenantId,
          sale_id: saleId,
          customer_id: customerId,
          broker_id: brokerId,
          project_id: lot.project_id || null,
          block_id: lot.id,
          installment_number: currentInst++,
          amount: currentAmount,
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
  const totalDiff = Math.abs(paidTotal + newPendingTotal - finalValue);
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
