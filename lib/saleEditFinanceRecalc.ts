/**
 * Planejamento puro do recálculo financeiro na edição de venda.
 * Testável sem Supabase.
 */

import type { LotFormConfirmPayload } from '@/components/map/CustomerLotFormModal';
import { parseValidatedInstallmentsCount } from '@/lib/installmentsCount';
import {
  expectedSaleFinanceTotal,
  resolveInstallmentPrincipal,
} from '@/lib/saleInstallmentCalc';
import { parseCurrencyBRLNumber } from '@/lib/currencyBrl';
import {
  applySignalAddonToInstallmentAmounts,
  isRecantoPrimaveraSaleModel,
  resolveRecantoSignalPlan,
} from '@/lib/recantoSignalRemaining';
import {
  applyBalloonToInstallmentAmounts,
  resolveSaleBalloonPlan,
  type SaleBalloonFormConfig,
} from '@/lib/saleBalloonInstallments';
import { resolveSalePaymentMode } from '@/lib/salePaymentMode';

export type SaleFinancePayloadOptions = {
  contractModel?: unknown;
  /** Marcar parcela única como paga somente quando o usuário registrar pagamento no ato da venda. */
  cashInstallmentPaid?: boolean;
  financialAccountId?: string | null;
};

export type FinanceReceiptRow = {
  id: string;
  status?: string | null;
  paid_at?: string | null;
  installment_number: number | string;
  amount?: number | string | null;
  due_date?: string | null;
};

export type FinanceReceiptPayload = Record<string, unknown> & {
  installment_number: number;
  amount: number;
  due_date: string;
  status: string;
  base_amount?: number | null;
  signal_addon_amount?: number | null;
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
  const financialAccountId = options?.financialAccountId ?? null;
  const financialAccountPatch = financialAccountId
    ? { financial_account_id: financialAccountId }
    : {};
  const pmtType = data.payment_type || 'À vista';
  const paymentMode = resolveSalePaymentMode({
    payment_type: pmtType,
    installments_count: data.installments_count,
    down_payment: data.down_payment,
  });
  const grossDownPayment = parseCurrencyBRLNumber(data.down_payment);
  const reservationSignalPaid = Number(data.reservation_signal_paid) || 0;
  let downPayment = grossDownPayment;
  const instCount =
    paymentMode.isInstallment
      ? parseValidatedInstallmentsCount(String(data.installments_count ?? ''))
      : 1;
  const fValue = data.final_value;

  if (reservationSignalPaid > 0 && paymentMode.isInstallment) {
    downPayment = Math.max(0, grossDownPayment - reservationSignalPaid);
  }

  if (paymentMode.isImmediateCash || paymentMode.isSingleFuture) {
    // Pagamento único futuro: sempre pendente (nunca quita na assinatura).
    const markPaid =
      paymentMode.isImmediateCash && Boolean(options?.cashInstallmentPaid);
    financePayloads.push({
      tenant_id: tenantId,
      company_id: tenantId,
      sale_id: saleId,
      customer_id: customerId,
      broker_id: brokerId,
      project_id: lot.project_id || null,
      block_id: lot.id,
      ...financialAccountPatch,
      installment_number: 1,
      amount: fValue,
      due_date: data.down_payment_due_date || new Date().toISOString().split('T')[0],
      status: markPaid ? 'pago' : 'pendente',
      paid_amount: markPaid ? fValue : 0,
      ...(markPaid
        ? { paid_at: new Date().toISOString() }
        : { paid_at: null }),
    });
  } else if (paymentMode.isInstallment) {
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
        ...financialAccountPatch,
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
    const isRecanto = isRecantoPrimaveraSaleModel(options?.contractModel);
    const hasExplicitSignalPaidAtSale =
      data.signal_paid_at_sale != null &&
      String(data.signal_paid_at_sale).trim() !== '';
    const recantoSignalPlan = isRecanto
      ? resolveRecantoSignalPlan({
          contractValue:
            data.signal_contract_value != null &&
            String(data.signal_contract_value).trim() !== ''
              ? parseCurrencyBRLNumber(String(data.signal_contract_value))
              : grossDownPayment,
          paidAtSale: hasExplicitSignalPaidAtSale
            ? parseCurrencyBRLNumber(String(data.signal_paid_at_sale))
            : undefined,
          paymentMode: data.signal_remaining_payment_mode,
          remainingInstallments: data.signal_remaining_installments
            ? Number(data.signal_remaining_installments)
            : null,
          totalInstallments: instCount,
        })
      : null;

    const signalLineAmount =
      isRecanto && hasExplicitSignalPaidAtSale
        ? recantoSignalPlan?.paidAtSale ?? 0
        : downPayment;
    const signalLinePaidAtAct =
      isRecanto && hasExplicitSignalPaidAtSale && signalLineAmount > 0;

    if (signalLineAmount > 0 && data.down_payment_due_date) {
      financePayloads.push({
        tenant_id: tenantId,
        company_id: tenantId,
        sale_id: saleId,
        customer_id: customerId,
        broker_id: brokerId,
        project_id: lot.project_id || null,
        block_id: lot.id,
        ...financialAccountPatch,
        installment_number: 0,
        amount: signalLineAmount,
        base_amount: signalLineAmount,
        signal_addon_amount: 0,
        due_date: data.down_payment_due_date,
        status: signalLinePaidAtAct ? 'pago' : 'pendente',
        paid_amount: signalLinePaidAtAct ? signalLineAmount : 0,
        paid_at: signalLinePaidAtAct ? new Date().toISOString() : null,
      });
    }
    if (data.first_installment_due_date) {
      const principal = resolveInstallmentPrincipal({
        totalValue: fValue,
        downPayment,
        contractModel: options?.contractModel,
      });

      // Camada opcional: balão só altera valores quando use_balloon_installments=true.
      // Sem balão, applyBalloonToInstallmentAmounts == splitInstallmentAmounts.
      const balloonPlan = resolveSaleBalloonPlan({
        useBalloon: Boolean(data.use_balloon_installments),
        installmentsCount: instCount,
        contractValue: fValue,
        config: (data.balloon_config as SaleBalloonFormConfig | null | undefined) ?? null,
      });
      const balloonComps = applyBalloonToInstallmentAmounts(
        principal,
        instCount,
        balloonPlan,
      );
      const amountsBeforeSignal = balloonComps.map((c) => c.amount);

      let compositions = amountsBeforeSignal.map((amount, index) => ({
        baseAmount: amount,
        signalAddonAmount: 0,
        amount,
        dueDateOverride: balloonComps[index]?.dueDateOverride ?? null,
      }));

      if (recantoSignalPlan && hasExplicitSignalPaidAtSale) {
        const withSignal = applySignalAddonToInstallmentAmounts(
          amountsBeforeSignal,
          recantoSignalPlan,
        );
        compositions = withSignal.map((row, index) => ({
          baseAmount: row.baseAmount,
          signalAddonAmount: row.signalAddonAmount,
          amount: row.amount,
          dueDateOverride: balloonComps[index]?.dueDateOverride ?? null,
        }));
      }

      let cDate = new Date(data.first_installment_due_date + 'T12:00:00Z');
      for (let i = 0; i < instCount; i++) {
        const row = compositions[i] ?? {
          baseAmount: amountsBeforeSignal[i] ?? 0,
          signalAddonAmount: 0,
          amount: amountsBeforeSignal[i] ?? 0,
          dueDateOverride: null as string | null,
        };
        const dueOverride = row.dueDateOverride
          ? String(row.dueDateOverride).split('T')[0]
          : null;
        financePayloads.push({
          tenant_id: tenantId,
          company_id: tenantId,
          sale_id: saleId,
          customer_id: customerId,
          broker_id: brokerId,
          project_id: lot.project_id || null,
          block_id: lot.id,
          ...financialAccountPatch,
          installment_number: currentInst++,
          amount: row.amount,
          base_amount: row.baseAmount,
          signal_addon_amount: row.signalAddonAmount,
          due_date: dueOverride || cDate.toISOString().split('T')[0],
          status: 'pendente',
          paid_amount: 0,
          paid_at: null,
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
