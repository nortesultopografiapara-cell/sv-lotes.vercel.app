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
import { usesSplitDownPaymentFinance } from '@/lib/saleFinanceConfig';
import {
  applySignalAddonToInstallmentAmounts,
  resolveRecantoSignalPlan,
} from '@/lib/recantoSignalRemaining';
import {
  normalizeRecantoInstallmentDefinitionMode,
  resolveRecantoLotInstallmentPlan,
} from '@/lib/recantoFixedInstallmentPlan';
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
  schedule_group?: string | null;
  scheduleGroup?: string | null;
};

export const LEGACY_SIGNAL_EDIT_BLOCKED_MESSAGE =
  'Estorne o pagamento do sinal antes de alterar o valor recebido. Depois salve a edição da venda para gravar o saldo em parcelas separadas.';

export const SIGNAL_REVERSAL_REQUIRED_MESSAGE =
  'Estorne o pagamento desta parcela antes de alterar o valor recebido. A edição não foi salva.';

export const LEGACY_SIGNAL_SEPARATED_SAVE_MESSAGE =
  'Parcelas pagas ou com cobrança bancária permanecem. A edição grava vencimento e valor somente nas parcelas em aberto e sem cobrança.';

export function lotPayloadsWithoutEmbeddedSignal(
  payloads: FinanceReceiptPayload[],
): FinanceReceiptPayload[] {
  return payloads
    .filter((payload) => Number(payload.installment_number) >= 1)
    .map((payload) => {
      const addon = Number(payload.signal_addon_amount || 0);
      const base = payload.base_amount != null
        ? Number(payload.base_amount)
        : Number(payload.amount) - addon;
      const amount = Number.isFinite(base) ? Math.round(base * 100) / 100 : Number(payload.amount);
      return {
        ...payload,
        amount,
        base_amount: amount,
        signal_addon_amount: 0,
      };
    });
}

export function planSeparatedSignalScheduleEdit(input: {
  receipts: FinanceReceiptRow[];
  protectedIds: ReadonlySet<string>;
  lotPayloads: FinanceReceiptPayload[];
  signalDueDates?: Record<string, string> | null;
}): {
  updates: Array<{
    id: string;
    due_date?: string;
    amount?: number;
    status?: string;
    paid_amount?: number | null;
    paid_at?: string | null;
    schedule_group?: string;
  }>;
  deleteIds: string[];
  inserts: FinanceReceiptPayload[];
  blocked: string | null;
} {
  const empty = { updates: [], deleteIds: [], inserts: [] as FinanceReceiptPayload[] };
  const updates: Array<{
    id: string;
    due_date?: string;
    amount?: number;
    status?: string;
    paid_amount?: number | null;
    paid_at?: string | null;
    schedule_group?: string;
  }> = [];
  const deleteIds: string[] = [];
  const lotPayloads = input.lotPayloads.filter((payload) => Number(payload.installment_number) >= 1);
  const byNumber = new Map(lotPayloads.map((payload) => [Number(payload.installment_number), payload]));
  const seen = new Set<number>();

  for (const row of input.receipts) {
    if (isSignalScheduleReceipt(row) || isCancelledFinanceReceipt(row)) continue;
    const number = Number(row.installment_number);
    if (!Number.isFinite(number) || number < 1) continue;
    seen.add(number);
    const next = byNumber.get(number);
    const locked = isPaidFinanceReceipt(row) || input.protectedIds.has(row.id);
    if (!next) {
      if (locked) return { ...empty, blocked: LEGACY_SIGNAL_SEPARATED_SAVE_MESSAGE };
      deleteIds.push(row.id);
      continue;
    }
    const nextAmount = Number(next.amount);
    const currentAmount = Number(row.amount);
    if (locked) {
      if (Math.abs(nextAmount - currentAmount) > 0.009) {
        return { ...empty, blocked: LEGACY_SIGNAL_SEPARATED_SAVE_MESSAGE };
      }
      continue;
    }
    const nextDue = String(next.due_date || '').slice(0, 10);
    const currentDue = String(row.due_date || '').slice(0, 10);
    const patch: { id: string; due_date?: string; amount?: number } = { id: row.id };
    if (nextDue && nextDue !== currentDue) patch.due_date = nextDue;
    if (Math.abs(nextAmount - currentAmount) > 0.009) patch.amount = nextAmount;
    if (patch.due_date || patch.amount != null) updates.push(patch);
  }

  const inserts = lotPayloads
    .filter((payload) => !seen.has(Number(payload.installment_number)))
    .map((payload) => ({
      ...payload,
      status: 'pendente',
      paid_amount: 0,
      paid_at: null,
    }));

  for (const row of input.receipts.filter((item) => isSignalScheduleReceipt(item))) {
    const requested = String(input.signalDueDates?.[row.id] || '').slice(0, 10);
    const current = String(row.due_date || '').slice(0, 10);
    if (!requested || requested === current) continue;
    if (isPaidFinanceReceipt(row) || input.protectedIds.has(row.id)) {
      return { ...empty, blocked: LEGACY_SIGNAL_SEPARATED_SAVE_MESSAGE };
    }
    updates.push({ id: row.id, due_date: requested });
  }

  return { updates, deleteIds, inserts, blocked: null };
}

export function planExplicitSeparateSignalEdit(input: {
  receipts: FinanceReceiptRow[];
  protectedIds: ReadonlySet<string>;
  lotPayloads: FinanceReceiptPayload[];
  paidAtAct: number;
  actDueDate: string;
  balance: Array<{ amount: number; dueDate: string }>;
}): ReturnType<typeof planSeparatedSignalScheduleEdit> {
  const lotPlan = planSeparatedSignalScheduleEdit({
    receipts: input.receipts,
    protectedIds: input.protectedIds,
    lotPayloads: input.lotPayloads,
  });
  if (lotPlan.blocked) return lotPlan;

  const active = input.receipts.filter((row) => !isCancelledFinanceReceipt(row));
  const act = active.find((row) => isSignalScheduleReceipt(row) && Number(row.installment_number) === 0)
    || active.find((row) => Number(row.installment_number) === 0)
    || null;
  const updates = [...lotPlan.updates];
  const deleteIds = [...lotPlan.deleteIds];
  const inserts = [...lotPlan.inserts];
  const locked = (row: FinanceReceiptRow) => isPaidFinanceReceipt(row) || input.protectedIds.has(row.id);

  if (act) {
    const currentAmount = Number(act.amount);
    if (locked(act)) {
      if (Math.abs(currentAmount - input.paidAtAct) > 0.009) {
        return { updates: [], deleteIds: [], inserts: [], blocked: SIGNAL_REVERSAL_REQUIRED_MESSAGE };
      }
    } else {
      updates.push({
        id: act.id,
        amount: input.paidAtAct,
        due_date: input.actDueDate || undefined,
        status: input.paidAtAct > 0.009 ? 'pago' : 'pendente',
        paid_amount: input.paidAtAct > 0.009 ? input.paidAtAct : 0,
        paid_at: input.paidAtAct > 0.009 ? input.actDueDate || null : null,
        schedule_group: 'SIGNAL',
      });
    }
  } else if (input.paidAtAct > 0.009) {
    const template = input.lotPayloads[0];
    if (!template) {
      return { updates: [], deleteIds: [], inserts: [], blocked: 'Não há parcela do lote para vincular o sinal recebido.' };
    }
    inserts.push({
      ...template,
      installment_number: 0,
      amount: input.paidAtAct,
      base_amount: input.paidAtAct,
      signal_addon_amount: 0,
      due_date: input.actDueDate,
      status: 'pago',
      paid_amount: input.paidAtAct,
      paid_at: input.actDueDate || null,
      schedule_group: 'SIGNAL',
    });
  }

  const futures = active.filter((row) => isSignalScheduleReceipt(row) && Number(row.installment_number) > 0);
  const byNumber = new Map(futures.map((row) => [Number(row.installment_number), row]));
  for (let index = 0; index < input.balance.length; index += 1) {
    const item = input.balance[index]!;
    const number = index + 1;
    const row = byNumber.get(number);
    if (!row) {
      const template = input.lotPayloads[0];
      if (!template) {
        return { updates: [], deleteIds: [], inserts: [], blocked: 'Não há parcela do lote para vincular o saldo do sinal.' };
      }
      inserts.push({
        ...template,
        installment_number: number,
        amount: item.amount,
        base_amount: item.amount,
        signal_addon_amount: 0,
        due_date: item.dueDate,
        status: 'pendente',
        paid_amount: 0,
        paid_at: null,
        schedule_group: 'SIGNAL',
      });
      continue;
    }
    byNumber.delete(number);
    const sameAmount = Math.abs(Number(row.amount) - item.amount) <= 0.009;
    const sameDue = String(row.due_date || '').slice(0, 10) === item.dueDate;
    if (locked(row)) {
      if (!sameAmount || !sameDue) {
        return { updates: [], deleteIds: [], inserts: [], blocked: SIGNAL_REVERSAL_REQUIRED_MESSAGE };
      }
      continue;
    }
    if (!sameAmount || !sameDue) {
      updates.push({
        id: row.id,
        amount: item.amount,
        due_date: item.dueDate,
        schedule_group: 'SIGNAL',
      });
    }
  }
  for (const row of byNumber.values()) {
    if (locked(row)) {
      return { updates: [], deleteIds: [], inserts: [], blocked: SIGNAL_REVERSAL_REQUIRED_MESSAGE };
    }
    deleteIds.push(row.id);
  }

  return { updates, deleteIds, inserts, blocked: null };
}

export function isSignalScheduleReceipt(row: {
  schedule_group?: string | null;
  scheduleGroup?: string | null;
} | null | undefined): boolean {
  return String(row?.schedule_group ?? row?.scheduleGroup ?? '').trim().toUpperCase() === 'SIGNAL';
}

export function isLotScheduleReceipt(row: {
  schedule_group?: string | null;
  scheduleGroup?: string | null;
  installment_number?: number | string | null;
} | null | undefined): boolean {
  if (isSignalScheduleReceipt(row)) return false;
  const group = String(row?.schedule_group ?? row?.scheduleGroup ?? '').trim().toUpperCase();
  return group === 'LOT' || group === '';
}

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
    const isRecanto = usesSplitDownPaymentFinance(options?.contractModel);
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
        downPayment: recantoSignalPlan?.contractValue ?? grossDownPayment,
        contractModel: options?.contractModel,
      });

      const installmentMode = isRecanto
        ? normalizeRecantoInstallmentDefinitionMode(data.installment_definition_mode)
        : 'BY_COUNT';
      const fixedAmount =
        installmentMode === 'FIXED_AMOUNT'
          ? parseCurrencyBRLNumber(String(data.regular_installment_amount || ''))
          : 0;
      const generateResidual = data.generate_residual_installment !== false;

      let compositions: Array<{
        baseAmount: number;
        signalAddonAmount: number;
        amount: number;
        dueDateOverride: string | null;
        isResidual?: boolean;
      }> = [];

      if (isRecanto && installmentMode === 'FIXED_AMOUNT') {
        const lotPlan = resolveRecantoLotInstallmentPlan({
          lotValue: principal,
          regularCount: instCount,
          mode: 'FIXED_AMOUNT',
          regularAmount: fixedAmount,
          generateResidual,
          useBalloon: Boolean(data.use_balloon_installments),
        });
        if (!lotPlan.ok) {
          throw new Error(lotPlan.errors[0] || 'Parcelamento fixo inválido.');
        }
        const regularBases = lotPlan.baseAmounts.slice(0, lotPlan.regularCount);
        let withSignal = regularBases.map((baseAmount) => ({
          baseAmount,
          signalAddonAmount: 0,
          amount: baseAmount,
        }));
        if (recantoSignalPlan && hasExplicitSignalPaidAtSale) {
          withSignal = applySignalAddonToInstallmentAmounts(
            regularBases,
            recantoSignalPlan,
          );
        }
        compositions = withSignal.map((row) => ({
          ...row,
          dueDateOverride: null,
          isResidual: false,
        }));
        if (lotPlan.hasResidual) {
          compositions.push({
            baseAmount: lotPlan.residualAmount,
            signalAddonAmount: 0,
            amount: lotPlan.residualAmount,
            dueDateOverride: null,
            isResidual: true,
          });
        }
      } else {
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

        compositions = amountsBeforeSignal.map((amount, index) => ({
          baseAmount: amount,
          signalAddonAmount: 0,
          amount,
          dueDateOverride: balloonComps[index]?.dueDateOverride ?? null,
          isResidual: false,
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
            isResidual: false,
          }));
        }
      }

      let cDate = new Date(data.first_installment_due_date + 'T12:00:00Z');
      for (let i = 0; i < compositions.length; i++) {
        const row = compositions[i]!;
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
  const preservedSignal = receipts.filter((row) => isSignalScheduleReceipt(row));
  const editable = receipts.filter((row) => !isSignalScheduleReceipt(row));
  const paid = editable.filter(isPaidFinanceReceipt);
  const pending = editable.filter(isPendingFinanceReceipt);
  const paidInstallmentNumbers = new Set(
    paid.map((r) => installmentKey(r.installment_number)),
  );
  const preservedSignalTotal = preservedSignal.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const paidTotal = paid.reduce((s, r) => s + Number(r.amount || 0), 0) + preservedSignalTotal;
  const replacesPreservedSignal = (installmentNumber: number) =>
    preservedSignal.length > 0 && installmentNumber <= 0;
  const newPendingTotal = newPayloads
    .filter((p) => p.status === 'pendente' && !replacesPreservedSignal(installmentKey(p.installment_number)))
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
      !paidInstallmentNumbers.has(installmentKey(p.installment_number)) &&
      !replacesPreservedSignal(installmentKey(p.installment_number)),
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

/**
 * Parcela do cronograma mensal (1..N), excluindo sinal/reserva (0 / -1).
 * Usado para bloquear regeneração do plano quando já há quitação no cronograma.
 */
export function isPaidScheduleInstallment(r: {
  status?: string | null;
  paid_at?: string | null;
  installment_number?: number | string | null;
  schedule_group?: string | null;
  scheduleGroup?: string | null;
}): boolean {
  if (isSignalScheduleReceipt(r)) return false;
  return installmentKey(r.installment_number) >= 1 && isPaidFinanceReceipt(r);
}

export function saleEditShouldRewriteReceipts(input: {
  financePlanChanged: boolean;
  previousFirstDue?: string | null;
  nextFirstDue?: string | null;
  previousEntryDue?: string | null;
  nextEntryDue?: string | null;
}): boolean {
  if (input.financePlanChanged) return true;
  const day = (value?: string | null) => String(value || '').slice(0, 10);
  return day(input.previousFirstDue) !== day(input.nextFirstDue)
    || day(input.previousEntryDue) !== day(input.nextEntryDue);
}

export function legacySignalPlanConflicts(
  receipts: Array<{
    schedule_group?: string | null;
    scheduleGroup?: string | null;
    amount?: number | string | null;
    paid_amount?: number | string | null;
    status?: string | null;
    paid_at?: string | null;
  }>,
  proposal: { signalContractCents: number | null; paidAtSaleCents: number | null },
): boolean {
  const signal = receipts.filter((row) => isSignalScheduleReceipt(row));
  if (signal.length === 0) return false;
  const cents = (value: number | string | null | undefined) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
  };
  const total = signal.reduce((sum, row) => sum + cents(row.amount), 0);
  const paid = signal
    .filter((row) => isPaidFinanceReceipt(row))
    .reduce((sum, row) => sum + cents(row.paid_amount ?? row.amount), 0);
  if (proposal.signalContractCents != null && proposal.signalContractCents !== total) return true;
  if (proposal.paidAtSaleCents != null && proposal.paidAtSaleCents !== paid) return true;
  return false;
}

export function hasPaidScheduleInstallments(
  receipts: Array<{
    status?: string | null;
    paid_at?: string | null;
    installment_number?: number | string | null;
  }>,
): boolean {
  return receipts.some(isPaidScheduleInstallment);
}

export const FINANCE_SCHEDULE_EDIT_LOCKED_MESSAGE =
  'Não é possível alterar o cronograma de parcelamento desta venda: já existem parcelas mensais pagas/liquidadas ou cobranças Asaas vinculadas. Cancele as cobranças e mantenha o plano atual para preservar a integridade financeira.';

/**
 * Bloqueia regeneração do cronograma quando há Asaas ou parcela mensal paga.
 * Sinal/reserva pagos (installment_number <= 0) NÃO bloqueiam — o recalc parcial
 * preserva essas linhas e substitui apenas as mensais pendentes.
 */
export function resolveFinanceScheduleEditLock(input: {
  financePlanChanged: boolean;
  hasAsaasCharges: boolean;
  receipts: Array<{
    status?: string | null;
    paid_at?: string | null;
    installment_number?: number | string | null;
  }>;
}): { blocked: boolean; message: string | null } {
  if (!input.financePlanChanged) {
    return { blocked: false, message: null };
  }
  if (input.hasAsaasCharges || hasPaidScheduleInstallments(input.receipts)) {
    return { blocked: true, message: FINANCE_SCHEDULE_EDIT_LOCKED_MESSAGE };
  }
  return { blocked: false, message: null };
}

/**
 * Simula o resultado pós-edição sem DB: remove pendentes (ou tudo no full),
 * preserva pagas, insere novos payloads sem colidir com números pagos.
 */
export function simulateSaleFinanceEditReplace(input: {
  existing: FinanceReceiptRow[];
  newPayloads: FinanceReceiptPayload[];
  finalValue: number;
  options?: {
    contractModel?: unknown;
    grossDownPayment?: number;
    paymentType?: string;
  };
}): {
  mode: 'full' | 'partial';
  keptPaid: FinanceReceiptRow[];
  deletedIds: string[];
  inserted: FinanceReceiptPayload[];
  resultingInstallmentNumbers: number[];
} {
  const paid = input.existing.filter(isPaidFinanceReceipt);
  if (paid.length === 0) {
    const inserted = planFullFinanceRecalc(input.newPayloads).toInsert;
    return {
      mode: 'full',
      keptPaid: [],
      deletedIds: input.existing.map((r) => r.id),
      inserted,
      resultingInstallmentNumbers: inserted.map((p) =>
        installmentKey(p.installment_number),
      ),
    };
  }
  const plan = planPartialFinanceRecalc(
    input.existing,
    input.newPayloads,
    input.finalValue,
    input.options,
  );
  const resultingInstallmentNumbers = [
    ...plan.paid.map((r) => installmentKey(r.installment_number)),
    ...plan.toInsert.map((p) => installmentKey(p.installment_number)),
  ].sort((a, b) => a - b);
  return {
    mode: 'partial',
    keptPaid: plan.paid,
    deletedIds: plan.toDeleteIds,
    inserted: plan.toInsert,
    resultingInstallmentNumbers,
  };
}
