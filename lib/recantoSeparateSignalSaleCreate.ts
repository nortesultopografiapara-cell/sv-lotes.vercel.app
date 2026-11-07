/**
 * Traduz o plano do sinal separado para as colunas reais da venda.
 * Não grava banco, não emite boleto e não altera o fluxo embutido.
 */

import type { RecantoLotStartMode } from '@/lib/recantoBrokerageInstallments';
import { parseCurrencyBRLNumber } from '@/lib/currencyBrl';
import {
  RecantoSeparateSignalPersistenceError,
  planRecantoSeparateSignalPersistence,
  type SeparateSignalPersistencePlan,
} from '@/lib/recantoSeparateSignalPersistence';

const LOT_START_MODES = new Set<RecantoLotStartMode>([
  'AFTER_BROKERAGE',
  'SIMULTANEOUS',
  'SPECIFIC_DATE',
]);

export const SEPARATE_SIGNAL_PRESERVE_SALE_COLUMNS = [
  'signal_schedule_mode',
  'separate_signal_request_key',
  'signal_installment_count',
  'lot_schedule_start_mode',
] as const;

export const SEPARATE_SIGNAL_PRESERVE_RECEIPT_COLUMNS = [
  'schedule_group',
] as const;

export type SeparateSaleCreateContext = {
  tenantId: string;
  customerId: string;
  projectId?: string | null;
  blockId?: string | null;
  financialAccountId?: string | null;
  brokerId?: string | null;
  lotPrice: number;
  contractModel: unknown;
};

export type SeparateSaleCreateDraft = {
  plan: SeparateSignalPersistencePlan;
  requestKey: string;
  saleFields: Record<string, unknown>;
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function money(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return parseCurrencyBRLNumber(text(value));
}

function lotStartMode(customerData: Record<string, unknown>): RecantoLotStartMode {
  const raw = text(customerData.lot_schedule_start_mode || customerData.lot_start_mode).toUpperCase();
  if (raw === 'AFTER_SIGNAL' || raw === 'AFTER_BROKERAGE') return 'AFTER_BROKERAGE';
  if (LOT_START_MODES.has(raw as RecantoLotStartMode)) return raw as RecantoLotStartMode;
  return 'SIMULTANEOUS';
}

function reaisFromCents(cents: number): number {
  return cents / 100;
}

export function buildRecantoSeparateSaleCreate(
  customerData: Record<string, unknown>,
  context: SeparateSaleCreateContext,
): SeparateSaleCreateDraft {
  const paidRaw = customerData.signal_paid_at_sale;
  const paidAtAct = paidRaw == null || text(paidRaw) === '' ? 0 : money(paidRaw);
  const signalContract = money(customerData.signal_contract_value || customerData.down_payment);
  const balance = signalContract - paidAtAct;
  const plan = planRecantoSeparateSignalPersistence({
    featureEnabled: true,
    contractModel: context.contractModel,
    saleId: 'pending-sale',
    tenantId: context.tenantId,
    companyId: context.tenantId,
    customerId: context.customerId,
    projectId: context.projectId,
    blockId: context.blockId,
    financialAccountId: context.financialAccountId,
    lotPrice: context.lotPrice,
    signalContract,
    paidAtAct,
    signalInstallmentCount: balance === 0
      ? 0
      : Number(customerData.signal_installment_count) || 0,
    actDate: text(customerData.down_payment_due_date || customerData.act_date),
    signalFirstDueDate: text(customerData.signal_first_due_date),
    lotInstallmentCount: Number(customerData.installments_count) || 0,
    lotStartMode: lotStartMode(customerData),
    lotSpecificStartDate: text(
      customerData.lot_specific_start_date || customerData.first_installment_due_date,
    ),
    holdLotChargesUntilSignalSettled: customerData.hold_lot_charges_until_signal_settled === true,
    clientSchedule: customerData.client_schedule,
  });

  return {
    plan,
    requestKey: plan.sale.requestKey,
    saleFields: {
      signal_schedule_mode: 'SEPARATE',
      signal_contract_value: reaisFromCents(plan.sale.signalContractCents),
      signal_paid_at_sale: reaisFromCents(plan.sale.paidAtActCents),
      signal_remaining_value: null,
      signal_remaining_payment_mode: null,
      signal_remaining_installments: null,
      signal_remaining_installment_value: null,
      signal_installment_count: plan.sale.signalInstallmentCount,
      signal_first_due_date: plan.sale.signalFirstDueDate,
      lot_schedule_start_mode: plan.sale.lotStartMode,
      lot_schedule_first_due_date: plan.sale.lotFirstDueDate,
      hold_lot_charges_until_signal_settled: plan.sale.holdLotChargesUntilSignalSettled,
      separate_signal_request_key: plan.sale.requestKey,
      installments_count: plan.sale.lotInstallmentCount,
      down_payment: reaisFromCents(plan.sale.signalContractCents),
      total_value: context.lotPrice,
    },
  };
}

export function separateSignalReceiptRows(
  draft: SeparateSaleCreateDraft,
  ids: {
    saleId: string;
    tenantId: string;
    customerId: string;
    projectId?: string | null;
    blockId?: string | null;
    brokerId?: string | null;
    financialAccountId?: string | null;
  },
): Record<string, unknown>[] {
  if (ids.tenantId !== draft.plan.sale.tenantId) {
    throw new RecantoSeparateSignalPersistenceError('Os recebíveis não pertencem a esta empresa.');
  }
  return draft.plan.receipts.map((row) => {
    const payload: Record<string, unknown> = {
      tenant_id: ids.tenantId,
      company_id: ids.tenantId,
      sale_id: ids.saleId,
      customer_id: ids.customerId,
      broker_id: ids.brokerId ?? null,
      project_id: ids.projectId ?? null,
      block_id: ids.blockId ?? null,
      schedule_group: row.scheduleGroup,
      installment_number: row.installmentNumber,
      amount: reaisFromCents(row.amountCents),
      base_amount: reaisFromCents(row.baseAmountCents),
      signal_addon_amount: 0,
      due_date: row.dueDate,
      status: row.status,
      paid_amount: reaisFromCents(row.paidAmountCents),
      paid_at: row.status === 'pago' ? `${row.dueDate}T12:00:00.000Z` : null,
    };
    if (ids.financialAccountId) payload.financial_account_id = ids.financialAccountId;
    return payload;
  });
}

export function assertSeparateSignalConfirmationAvailable(
  existing: { tenantId: string } | null,
  tenantId: string,
): void {
  if (!existing) return;
  if (existing.tenantId !== tenantId) {
    throw new RecantoSeparateSignalPersistenceError('A confirmação pertence a outra empresa.');
  }
  throw new RecantoSeparateSignalPersistenceError('Esta confirmação de sinal já foi registrada.');
}

export function requireCompleteSeparateReceipts(expected: number, inserted: number): void {
  if (inserted !== expected) {
    throw new RecantoSeparateSignalPersistenceError(
      'Falha ao gravar as parcelas. Nenhuma venda foi mantida.',
    );
  }
}

/** Função ainda não aplicada. A proposta está em supabase/proposals. */
export const SEPARATE_SIGNAL_ATOMIC_RPC = 'create_separate_signal_sale_with_receipts';

const CHARGE_KEYS = ['asaas', 'pix', 'boleto', 'barcode', 'charge_id', 'asaas_payment_id'] as const;

type AtomicRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export function assertSeparateSignalAtomicBatch(
  sale: Record<string, unknown>,
  receipts: Record<string, unknown>[],
): void {
  if (sale.signal_schedule_mode !== 'SEPARATE') {
    throw new RecantoSeparateSignalPersistenceError('A venda não está na modalidade separada.');
  }
  const tenantId = text(sale.tenant_id);
  if (!tenantId || text(sale.company_id) !== tenantId || !text(sale.separate_signal_request_key)) {
    throw new RecantoSeparateSignalPersistenceError('Os recebíveis não pertencem a esta empresa.');
  }
  if (
    sale.signal_remaining_payment_mode != null
    || sale.signal_remaining_installments != null
    || sale.signal_remaining_installment_value != null
    || sale.use_balloon_installments === true
  ) {
    throw new RecantoSeparateSignalPersistenceError(
      'A modalidade separada não aceita o parcelamento embutido.',
    );
  }
  if (receipts.length === 0) {
    throw new RecantoSeparateSignalPersistenceError(
      'Falha ao gravar as parcelas. Nenhuma venda foi mantida.',
    );
  }
  for (const row of receipts) {
    if (text(row.tenant_id) !== tenantId || text(row.company_id) !== tenantId) {
      throw new RecantoSeparateSignalPersistenceError('Os recebíveis não pertencem a esta empresa.');
    }
    if (row.schedule_group !== 'SIGNAL' && row.schedule_group !== 'LOT') {
      throw new RecantoSeparateSignalPersistenceError(
        'Falha ao gravar as parcelas. Nenhuma venda foi mantida.',
      );
    }
    if (row.signal_addon_amount != null && Number(row.signal_addon_amount) !== 0) {
      throw new RecantoSeparateSignalPersistenceError('O lote não pode receber complemento do sinal.');
    }
    for (const key of CHARGE_KEYS) {
      if (key in row) {
        throw new RecantoSeparateSignalPersistenceError('A gravação do sinal separado não emite cobrança.');
      }
    }
  }
}

export async function insertSeparateSignalSaleAtomically(
  supabase: AtomicRpc,
  sale: Record<string, unknown>,
  receipts: Record<string, unknown>[],
): Promise<{ saleId: string; receiptCount: number }> {
  assertSeparateSignalAtomicBatch(sale, receipts);
  const safeReceipts = receipts.map((row) => {
    const { sale_id: _clientSaleId, ...rest } = row;
    return rest;
  });
  const { data, error } = await supabase.rpc(SEPARATE_SIGNAL_ATOMIC_RPC, {
    p_sale: sale,
    p_receipts: safeReceipts,
  });
  if (error) {
    const message = error.message || '';
    if (/could not find the function|schema cache|PGRST202/i.test(message)) {
      throw new RecantoSeparateSignalPersistenceError(
        'A gravação atômica do sinal separado ainda não está disponível neste ambiente.',
      );
    }
    if (/SEPARATE_SIGNAL_ALREADY_REGISTERED|já foi registrada/i.test(message)) {
      throw new RecantoSeparateSignalPersistenceError('Esta confirmação de sinal já foi registrada.');
    }
    if (/SEPARATE_SIGNAL_CUSTOMER_FORBIDDEN/i.test(message)) {
      throw new RecantoSeparateSignalPersistenceError('O cliente não pertence a esta empresa.');
    }
    if (/SEPARATE_SIGNAL_TENANT_MISMATCH|outra empresa/i.test(message)) {
      throw new RecantoSeparateSignalPersistenceError('A confirmação pertence a outra empresa.');
    }
    throw new RecantoSeparateSignalPersistenceError(
      'Falha ao gravar as parcelas. Nenhuma venda foi mantida.',
    );
  }
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const saleId = text(body.sale_id);
  const receiptCount = Number(body.receipt_count);
  if (!saleId || receiptCount !== receipts.length) {
    throw new RecantoSeparateSignalPersistenceError(
      'Falha ao gravar as parcelas. Nenhuma venda foi mantida.',
    );
  }
  return { saleId, receiptCount };
}
