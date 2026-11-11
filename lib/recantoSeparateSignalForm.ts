/**
 * Prévia do sinal parcelado na Nova Venda do Recanto Primavera.
 * A opção nasce desligada. A prévia não entra no payload da venda.
 */

import { formatCurrencyBRL } from '@/lib/currencyBrl';
import { normalizeSaleContractModel } from '@/lib/contractModel';
import { validateRecantoSignalPlan } from '@/lib/recantoSignalRemaining';
import {
  buildRecantoBrokerageSchedule,
  reaisToCents,
  RecantoBrokerageScheduleError,
  type RecantoBrokerageSchedule,
  type RecantoLotStartMode,
} from '@/lib/recantoBrokerageInstallments';

/** Interruptor da opção no formulário. Permanece desligado até a fase de persistência. */
export const RECANTO_SEPARATE_SIGNAL_ENABLED = false;

export const RECANTO_SEPARATE_SIGNAL_PREPARATION_MESSAGE =
  'O parcelamento separado do sinal ainda está em preparação e não pode ser gravado. A confirmação fica desabilitada até a próxima fase.';

export const RECANTO_SEPARATE_SIGNAL_SIMULATION_LABEL =
  'Simulação — estes valores não são gravados.';

export const RECANTO_SEPARATE_SIGNAL_PERSIST_WARNING =
  'Confirmar a venda grava estes registros no Supabase Develop.';

export type RecantoSeparateSignalFormInput = {
  contractModel: unknown;
  /** Quando omitido, usa RECANTO_SEPARATE_SIGNAL_ENABLED. */
  enabled?: boolean;
  selected: boolean;
  /** A opção só vale no parcelamento. À vista segue o fluxo atual. */
  installmentSale?: boolean;
  lotPrice: number;
  signalContract: number;
  paidAtAct: number;
  signalInstallmentCount: number;
  actDate?: string | null;
  signalFirstDueDate?: string | null;
  lotInstallmentCount: number;
  lotStartMode: RecantoLotStartMode | '';
  lotSpecificStartDate?: string | null;
  holdLotChargesUntilSignalSettled?: boolean;
  /** Só o servidor pode ligar. Omitido, a confirmação continua bloqueada. */
  writeEnabled?: boolean;
};

export type RecantoSeparateSignalPreview = {
  offered: boolean;
  active: boolean;
  schedule: RecantoBrokerageSchedule | null;
  error: string | null;
  confirmBlocked: boolean;
  confirmBlockMessage: string | null;
};

export function canOfferRecantoSeparateSignal(input: {
  contractModel: unknown;
  enabled?: boolean;
}): boolean {
  const enabled = input.enabled ?? RECANTO_SEPARATE_SIGNAL_ENABLED;
  return enabled === true
    && normalizeSaleContractModel(input.contractModel) === 'RECANTO_PRIMAVERA';
}

/** Troca o vocabulário interno do motor pela palavra usada na tela. */
export function signalScheduleMessage(message: string): string {
  return message
    .replaceAll('A corretagem', 'O sinal')
    .replaceAll('a corretagem', 'o sinal')
    .replaceAll('da corretagem', 'do sinal')
    .replaceAll('corretagem', 'sinal');
}

export function describeCentsInstallments(amounts: number[]): string {
  if (amounts.length === 0) return 'Sem parcelas futuras.';
  const first = amounts[0];
  const last = amounts[amounts.length - 1];
  const money = (cents: number) => formatCurrencyBRL(cents / 100);
  if (amounts.every((amount) => amount === first)) {
    return `${amounts.length} × ${money(first)}`;
  }
  return `${amounts.length - 1} × ${money(first)} e a última ${money(last)}`;
}

function inactive(offered: boolean): RecantoSeparateSignalPreview {
  return {
    offered,
    active: false,
    schedule: null,
    error: null,
    confirmBlocked: false,
    confirmBlockMessage: null,
  };
}

function reaisNumberToCents(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RecantoBrokerageScheduleError(`${label} é inválido.`);
  }
  return reaisToCents(value.toFixed(2));
}

/**
 * Na modalidade SEPARATE a quantidade fica em signalInstallmentCount.
 * O campo antigo remainingInstallments pertence só ao sinal embutido.
 */
export function validateRecantoSaleSignalOnSubmit(input: {
  separateActive: boolean;
  separateInstallmentCount: number;
  contractValue: number;
  paidAtSale: number;
  embeddedPaymentMode?: string | null;
  embeddedRemainingInstallments?: number | null;
  totalInstallments: number;
}): { valid: true } | { valid: false; message: string } {
  if (input.separateActive) {
    const remaining = input.contractValue - input.paidAtSale;
    const count = Math.floor(Number(input.separateInstallmentCount) || 0);
    if (remaining > 0.009 && count <= 0) {
      return {
        valid: false,
        message: 'Informe a quantidade de parcelas do sinal.',
      };
    }
    return { valid: true };
  }
  return validateRecantoSignalPlan({
    contractValue: input.contractValue,
    paidAtSale: input.paidAtSale,
    paymentMode: input.embeddedPaymentMode || 'FIRST_INSTALLMENTS',
    remainingInstallments: input.embeddedRemainingInstallments,
    totalInstallments: input.totalInstallments,
  });
}

export function buildRecantoSeparateSignalPreview(
  input: RecantoSeparateSignalFormInput,
): RecantoSeparateSignalPreview {
  const offered = canOfferRecantoSeparateSignal(input);
  const installmentSale = input.installmentSale !== false;
  if (!offered || !input.selected || !installmentSale) return inactive(offered);
  if (!input.lotStartMode) {
    const message = 'O início das parcelas do lote não está registrado nesta venda.';
    return {
      offered: true,
      active: true,
      schedule: null,
      error: message,
      confirmBlocked: true,
      confirmBlockMessage: message,
    };
  }

  try {
    const signalContractCents = reaisNumberToCents(input.signalContract, 'O valor do sinal');
    const paidAtActCents = reaisNumberToCents(input.paidAtAct, 'O valor pago no ato');
    const balanceCents = signalContractCents - paidAtActCents;
    const schedule = buildRecantoBrokerageSchedule({
      lotPriceCents: reaisNumberToCents(input.lotPrice, 'O valor do lote'),
      brokerageTotalCents: signalContractCents,
      paidAtActCents,
      brokerageInstallmentCount: balanceCents === 0 ? 0 : input.signalInstallmentCount,
      actDate: input.actDate,
      brokerageFirstDueDate: input.signalFirstDueDate,
      lotInstallmentCount: input.lotInstallmentCount,
      lotStartMode: input.lotStartMode,
      lotSpecificStartDate: input.lotSpecificStartDate,
      holdLotChargesUntilBrokerageSettled: Boolean(input.holdLotChargesUntilSignalSettled),
    });
    return {
      offered: true,
      active: true,
      schedule,
      error: null,
      confirmBlocked: input.writeEnabled !== true,
      confirmBlockMessage: input.writeEnabled === true
        ? null
        : RECANTO_SEPARATE_SIGNAL_PREPARATION_MESSAGE,
    };
  } catch (error) {
    const message = error instanceof RecantoBrokerageScheduleError
      ? signalScheduleMessage(error.message)
      : 'Não foi possível calcular a simulação do sinal.';
    return {
      offered: true,
      active: true,
      schedule: null,
      error: message,
      confirmBlocked: true,
      confirmBlockMessage: `${message} ${RECANTO_SEPARATE_SIGNAL_PREPARATION_MESSAGE}`,
    };
  }
}

export type PersistedSeparateSignalForm = {
  signal_schedule_mode: 'SEPARATE';
  signal_installment_count: string;
  signal_first_due_date: string;
  lot_schedule_start_mode: RecantoLotStartMode | '';
  hold_lot_charges_until_signal_settled: boolean;
  lot_schedule_first_due_date: string;
};

type SeparateSignalReceiptRef = {
  schedule_group?: string | null;
  installment_number?: number | string | null;
  amount?: number | string | null;
  due_date?: string | null;
  status?: string | null;
};

function dateOnly(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.includes('T') ? text.split('T')[0] : text.slice(0, 10);
}

function storedLotStartMode(value: unknown): RecantoLotStartMode | '' {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'AFTER_SIGNAL' || raw === 'AFTER_BROKERAGE') return 'AFTER_BROKERAGE';
  if (raw === 'SIMULTANEOUS' || raw === 'SPECIFIC_DATE') return raw;
  return '';
}

function cancelledReceipt(status: unknown): boolean {
  const raw = String(status ?? '').trim().toLowerCase();
  return raw === 'cancelado' || raw === 'canceled' || raw === 'cancelled' || raw === 'cancelada';
}

function consistentSignalFuture(receipts: SeparateSignalReceiptRef[]): {
  count: string;
  firstDueDate: string;
} | null {
  const rows = receipts.filter((row) => {
    if (String(row.schedule_group ?? '').trim().toUpperCase() !== 'SIGNAL') return false;
    if (cancelledReceipt(row.status)) return false;
    return Number(row.installment_number) > 0;
  });
  if (rows.length === 0) return null;
  const amounts = rows.map((row) => {
    const amount = Number(row.amount);
    return Number.isFinite(amount) ? Math.round(amount * 100) : null;
  });
  if (amounts.some((amount) => amount == null)) return null;
  const firstAmount = amounts[0];
  if (amounts.some((amount) => amount !== firstAmount)) return null;
  const dates = rows.map((row) => dateOnly(row.due_date)).filter(Boolean).sort();
  if (dates.length !== rows.length) return null;
  return { count: String(rows.length), firstDueDate: dates[0] };
}

/**
 * Lê a configuração SEPARATE já gravada. Não recalcula recebíveis.
 * A retenção só volta marcada quando a coluna está explicitamente verdadeira.
 */
export function readPersistedSeparateSignalForm(input: {
  sale: Record<string, unknown> | null | undefined;
  receipts?: SeparateSignalReceiptRef[] | null;
}): PersistedSeparateSignalForm | null {
  const sale = input.sale;
  if (String(sale?.signal_schedule_mode ?? '').trim().toUpperCase() !== 'SEPARATE') return null;
  const fromReceipts = consistentSignalFuture(input.receipts || []);
  const storedCount = Number(sale?.signal_installment_count);
  const count = Number.isInteger(storedCount) && storedCount > 0
    ? String(storedCount)
    : fromReceipts?.count || '';
  const storedDue = dateOnly(sale?.signal_first_due_date);
  return {
    signal_schedule_mode: 'SEPARATE',
    signal_installment_count: count,
    signal_first_due_date: storedDue || fromReceipts?.firstDueDate || '',
    lot_schedule_start_mode: storedLotStartMode(sale?.lot_schedule_start_mode),
    hold_lot_charges_until_signal_settled: sale?.hold_lot_charges_until_signal_settled === true,
    lot_schedule_first_due_date: dateOnly(sale?.lot_schedule_first_due_date),
  };
}
