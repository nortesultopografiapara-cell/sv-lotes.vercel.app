/**
 * Persistência local do sinal separado do Recanto Primavera.
 * Monta os dois cronogramas e recusa a gravação real enquanto o schema não estiver homologado.
 * Não emite boleto, não chama banco e não gera movimentação de caixa.
 */

import { normalizeSaleContractModel } from '@/lib/contractModel';
import {
  buildRecantoBrokerageSchedule,
  reaisToCents,
  RecantoBrokerageScheduleError,
  type RecantoBrokerageSchedule,
  type RecantoLotStartMode,
} from '@/lib/recantoBrokerageInstallments';

/** O arquivo SQL desta fase ainda não foi aplicado em nenhum banco. */
export const RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED = false;

/** A confirmação real permanece desligada mesmo depois do planejamento. */
export const RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED = false;

export const RECANTO_SEPARATE_SIGNAL_PERSIST_BLOCKED_MESSAGE =
  'O parcelamento separado do sinal ainda não pode ser gravado. A confirmação real permanece bloqueada até a homologação do schema.';

export const RECANTO_SEPARATE_SIGNAL_CHARGES_BLOCKED_MESSAGE =
  'Cobranças, boletos e Pix do sinal separado permanecem bloqueados nesta fase.';

export const RECANTO_SIGNAL_SCHEDULE_MODES = ['EMBEDDED', 'SEPARATE'] as const;
export type RecantoSignalScheduleMode = (typeof RECANTO_SIGNAL_SCHEDULE_MODES)[number];

export const RECANTO_RECEIPT_GROUPS = ['SIGNAL', 'LOT'] as const;
export type RecantoReceiptGroup = (typeof RECANTO_RECEIPT_GROUPS)[number];

export const RECANTO_STORED_LOT_START_MODES = [
  'AFTER_SIGNAL',
  'SIMULTANEOUS',
  'SPECIFIC_DATE',
] as const;
export type RecantoStoredLotStartMode = (typeof RECANTO_STORED_LOT_START_MODES)[number];

const STORED_LOT_START: Record<RecantoLotStartMode, RecantoStoredLotStartMode> = {
  AFTER_BROKERAGE: 'AFTER_SIGNAL',
  SIMULTANEOUS: 'SIMULTANEOUS',
  SPECIFIC_DATE: 'SPECIFIC_DATE',
};

export class RecantoSeparateSignalPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecantoSeparateSignalPersistenceError';
  }
}

export type SeparateSignalPersistenceInput = {
  featureEnabled: boolean;
  contractModel: unknown;
  saleId: string;
  tenantId: string;
  customerId: string;
  projectId?: string | null;
  blockId?: string | null;
  /** Conta já resolvida da venda. O sinal usa esta mesma conta, sem abrir outra. */
  financialAccountId?: string | null;
  lotPrice: number;
  signalContract: number;
  paidAtAct: number;
  signalInstallmentCount: number;
  actDate?: string | null;
  signalFirstDueDate?: string | null;
  lotInstallmentCount: number;
  lotStartMode: RecantoLotStartMode;
  lotSpecificStartDate?: string | null;
  holdLotChargesUntilSignalSettled?: boolean;
};

export type SeparateSignalReceiptDraft = {
  saleId: string;
  tenantId: string;
  customerId: string;
  projectId: string | null;
  blockId: string | null;
  financialAccountId: string | null;
  scheduleGroup: RecantoReceiptGroup;
  installmentNumber: number;
  amountCents: number;
  baseAmountCents: number;
  signalAddonAmountCents: number;
  dueDate: string;
  status: 'pago' | 'pendente';
  paidAmountCents: number;
};

export type SeparateSignalSaleDraft = {
  saleId: string;
  tenantId: string;
  signalScheduleMode: 'SEPARATE';
  signalContractCents: number;
  paidAtActCents: number;
  signalBalanceCents: number;
  signalInstallmentCount: number;
  signalFirstDueDate: string | null;
  lotInstallmentCount: number;
  lotStartMode: RecantoStoredLotStartMode;
  lotFirstDueDate: string;
  holdLotChargesUntilSignalSettled: boolean;
  financialAccountId: string | null;
  requestKey: string;
  signalRemainingPaymentMode: null;
  signalRemainingInstallments: null;
  signalRemainingInstallmentValueCents: null;
};

export type SeparateSignalPersistencePlan = {
  sale: SeparateSignalSaleDraft;
  receipts: SeparateSignalReceiptDraft[];
  schedule: RecantoBrokerageSchedule;
  charges: [];
  cashMovements: [];
  brokerCommissions: [];
  chargesBlocked: true;
  confirmationAllowed: false;
};

export type SeparateSignalMemoryState = {
  sales: Map<string, SeparateSignalSaleDraft>;
  receipts: Map<string, SeparateSignalReceiptDraft[]>;
};

export function clientRequestedSeparateSignal(customerData: Record<string, unknown>): boolean {
  const mode = String(customerData.signal_schedule_mode ?? '').trim().toUpperCase();
  return mode === 'SEPARATE' || customerData.separate_signal === true;
}

export function rejectUnpersistedSeparateSignalRequest(customerData: Record<string, unknown>): void {
  if (!clientRequestedSeparateSignal(customerData)) return;
  assertRecantoSeparateSignalPersistAuthorized();
}

export function assertRecantoSeparateSignalPersistAuthorized(): void {
  if (!RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED || !RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED) {
    throw new RecantoSeparateSignalPersistenceError(RECANTO_SEPARATE_SIGNAL_PERSIST_BLOCKED_MESSAGE);
  }
}

export function classifyExistingReceipt(row: {
  schedule_group?: string | null;
  scheduleGroup?: string | null;
}): 'LEGACY' | RecantoReceiptGroup {
  const group = String(row.schedule_group ?? row.scheduleGroup ?? '').trim().toUpperCase();
  if (group === 'SIGNAL' || group === 'LOT') return group;
  return 'LEGACY';
}

export function emptySeparateSignalMemory(): SeparateSignalMemoryState {
  return { sales: new Map(), receipts: new Map() };
}

function reaisNumberToCents(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RecantoSeparateSignalPersistenceError(`${label} é inválido.`);
  }
  try {
    return reaisToCents(value.toFixed(2));
  } catch (error) {
    if (error instanceof RecantoBrokerageScheduleError) {
      throw new RecantoSeparateSignalPersistenceError(error.message.replaceAll('corretagem', 'sinal'));
    }
    throw error;
  }
}

function requestKey(parts: Array<string | number | boolean | null>): string {
  return `recanto-separate:v1:${parts.map((part) => String(part ?? '')).join('|')}`;
}

function receiptIdentity(row: SeparateSignalReceiptDraft): string {
  return `${row.scheduleGroup}:${row.installmentNumber}`;
}

export function planRecantoSeparateSignalPersistence(
  input: SeparateSignalPersistenceInput,
): SeparateSignalPersistencePlan {
  if (input.featureEnabled !== true) {
    throw new RecantoSeparateSignalPersistenceError('A modalidade de sinal separado está desligada.');
  }
  if (normalizeSaleContractModel(input.contractModel) !== 'RECANTO_PRIMAVERA') {
    throw new RecantoSeparateSignalPersistenceError(
      'O sinal separado só existe no modelo Recanto Primavera.',
    );
  }
  if (!String(input.saleId || '').trim() || !String(input.tenantId || '').trim()) {
    throw new RecantoSeparateSignalPersistenceError('A venda e a empresa são obrigatórias.');
  }
  if (!String(input.customerId || '').trim()) {
    throw new RecantoSeparateSignalPersistenceError('O cliente da venda é obrigatório.');
  }

  let schedule: RecantoBrokerageSchedule;
  try {
    const signalContractCents = reaisNumberToCents(input.signalContract, 'O valor do sinal');
    const paidAtActCents = reaisNumberToCents(input.paidAtAct, 'O valor pago no ato');
    schedule = buildRecantoBrokerageSchedule({
      lotPriceCents: reaisNumberToCents(input.lotPrice, 'O valor do lote'),
      brokerageTotalCents: signalContractCents,
      paidAtActCents,
      brokerageInstallmentCount: signalContractCents - paidAtActCents === 0
        ? 0
        : input.signalInstallmentCount,
      actDate: input.actDate,
      brokerageFirstDueDate: input.signalFirstDueDate,
      lotInstallmentCount: input.lotInstallmentCount,
      lotStartMode: input.lotStartMode,
      lotSpecificStartDate: input.lotSpecificStartDate,
      holdLotChargesUntilBrokerageSettled: Boolean(input.holdLotChargesUntilSignalSettled),
    });
  } catch (error) {
    if (error instanceof RecantoSeparateSignalPersistenceError) throw error;
    if (error instanceof RecantoBrokerageScheduleError) {
      throw new RecantoSeparateSignalPersistenceError(
        error.message
          .replaceAll('A corretagem', 'O sinal')
          .replaceAll('a corretagem', 'o sinal')
          .replaceAll('da corretagem', 'do sinal')
          .replaceAll('corretagem', 'sinal'),
      );
    }
    throw error;
  }

  const financialAccountId = input.financialAccountId ? String(input.financialAccountId) : null;
  const receipts: SeparateSignalReceiptDraft[] = [];
  const pushLine = (
    group: RecantoReceiptGroup,
    installmentNumber: number,
    amountCents: number,
    dueDate: string,
    status: 'pago' | 'pendente',
  ) => {
    receipts.push({
      saleId: input.saleId,
      tenantId: input.tenantId,
      customerId: input.customerId,
      projectId: input.projectId ?? null,
      blockId: input.blockId ?? null,
      financialAccountId,
      scheduleGroup: group,
      installmentNumber,
      amountCents,
      baseAmountCents: amountCents,
      signalAddonAmountCents: 0,
      dueDate,
      status,
      paidAmountCents: status === 'pago' ? amountCents : 0,
    });
  };

  for (const line of schedule.brokerageLines) {
    pushLine(
      'SIGNAL',
      line.sequence,
      line.amountCents,
      line.dueDate,
      line.kind === 'INITIAL_PAYMENT' ? 'pago' : 'pendente',
    );
  }
  for (const line of schedule.lotLines) {
    pushLine('LOT', line.sequence, line.amountCents, line.dueDate, 'pendente');
  }

  const identities = receipts.map(receiptIdentity);
  if (new Set(identities).size !== identities.length) {
    throw new RecantoSeparateSignalPersistenceError('Há parcelas duplicadas no cronograma.');
  }

  const signalReceipts = receipts.filter((row) => row.scheduleGroup === 'SIGNAL');
  const lotReceipts = receipts.filter((row) => row.scheduleGroup === 'LOT');
  const signalSum = signalReceipts.reduce((sum, row) => sum + row.amountCents, 0);
  const lotSum = lotReceipts.reduce((sum, row) => sum + row.amountCents, 0);
  const paidSum = signalReceipts
    .filter((row) => row.installmentNumber === 0)
    .reduce((sum, row) => sum + row.amountCents, 0);
  const futureSignalSum = signalReceipts
    .filter((row) => row.installmentNumber > 0)
    .reduce((sum, row) => sum + row.amountCents, 0);
  if (signalSum !== schedule.brokerageTotalCents || paidSum + futureSignalSum !== signalSum) {
    throw new RecantoSeparateSignalPersistenceError('O sinal contratado não fecha com as parcelas.');
  }
  if (lotSum !== schedule.lotPriceCents) {
    throw new RecantoSeparateSignalPersistenceError('As parcelas do lote não fecham com o preço do lote.');
  }
  if (lotSum + signalSum !== schedule.financialTotalCents) {
    throw new RecantoSeparateSignalPersistenceError('O total da operação está duplicado ou incompleto.');
  }
  if (lotReceipts.some((row) => row.signalAddonAmountCents !== 0)) {
    throw new RecantoSeparateSignalPersistenceError('O saldo do sinal não pode entrar nas parcelas do lote.');
  }

  const signalFutureCount = signalReceipts.filter((row) => row.installmentNumber > 0).length;
  const sale: SeparateSignalSaleDraft = {
    saleId: input.saleId,
    tenantId: input.tenantId,
    signalScheduleMode: 'SEPARATE',
    signalContractCents: schedule.brokerageTotalCents,
    paidAtActCents: schedule.paidAtActCents,
    signalBalanceCents: schedule.brokerageBalanceCents,
    signalInstallmentCount: signalFutureCount,
    signalFirstDueDate: signalFutureCount > 0 ? signalReceipts.find((row) => row.installmentNumber === 1)?.dueDate ?? null : null,
    lotInstallmentCount: lotReceipts.length,
    lotStartMode: STORED_LOT_START[schedule.lotStartMode],
    lotFirstDueDate: schedule.lotFirstDueDate,
    holdLotChargesUntilSignalSettled: schedule.holdLotChargesUntilBrokerageSettled,
    financialAccountId,
    requestKey: requestKey([
      input.tenantId,
      schedule.lotPriceCents,
      schedule.brokerageTotalCents,
      schedule.paidAtActCents,
      signalFutureCount,
      input.actDate || '',
      saleFirstDue(signalReceipts),
      lotReceipts.length,
      STORED_LOT_START[schedule.lotStartMode],
      schedule.lotFirstDueDate,
      schedule.holdLotChargesUntilBrokerageSettled,
    ]),
    signalRemainingPaymentMode: null,
    signalRemainingInstallments: null,
    signalRemainingInstallmentValueCents: null,
  };

  return {
    sale,
    receipts,
    schedule,
    charges: [],
    cashMovements: [],
    brokerCommissions: [],
    chargesBlocked: true,
    confirmationAllowed: false,
  };
}

function saleFirstDue(rows: SeparateSignalReceiptDraft[]): string {
  return rows.find((row) => row.installmentNumber === 1)?.dueDate ?? '';
}

export type SeparateSignalSimulationOptions = {
  schemaApplied?: boolean;
  persistEnabled?: boolean;
  failAt?: 'receipts' | null;
};

export function simulateSeparateSignalPersistence(
  state: SeparateSignalMemoryState,
  plan: SeparateSignalPersistencePlan,
  options: SeparateSignalSimulationOptions = {},
): { created: boolean; receiptCount: number } {
  if (options.schemaApplied !== true || options.persistEnabled !== true) {
    throw new RecantoSeparateSignalPersistenceError(RECANTO_SEPARATE_SIGNAL_PERSIST_BLOCKED_MESSAGE);
  }
  if (plan.confirmationAllowed || plan.charges.length > 0 || plan.cashMovements.length > 0) {
    throw new RecantoSeparateSignalPersistenceError(RECANTO_SEPARATE_SIGNAL_CHARGES_BLOCKED_MESSAGE);
  }

  for (const sale of state.sales.values()) {
    if (sale.saleId === plan.sale.saleId && sale.requestKey !== plan.sale.requestKey) {
      throw new RecantoSeparateSignalPersistenceError('A mesma venda já possui outro cronograma.');
    }
  }

  const existing = state.sales.get(plan.sale.requestKey);
  if (existing) {
    const stored = state.receipts.get(plan.sale.requestKey) ?? [];
    if (stored.length !== plan.receipts.length) {
      throw new RecantoSeparateSignalPersistenceError('A mesma venda já possui outro cronograma.');
    }
    return { created: false, receiptCount: stored.length };
  }

  if (options.failAt === 'receipts') {
    throw new RecantoSeparateSignalPersistenceError('Falha ao gravar as parcelas. Nenhuma venda foi mantida.');
  }

  const salesSnapshot = new Map(state.sales);
  const receiptsSnapshot = new Map(state.receipts);
  try {
    state.sales.set(plan.sale.requestKey, plan.sale);
    state.receipts.set(plan.sale.requestKey, plan.receipts.map((row) => ({ ...row })));
    if (state.receipts.get(plan.sale.requestKey)?.length !== plan.receipts.length) {
      throw new RecantoSeparateSignalPersistenceError('Falha ao gravar as parcelas. Nenhuma venda foi mantida.');
    }
  } catch (error) {
    state.sales.clear();
    state.receipts.clear();
    for (const [key, value] of salesSnapshot) state.sales.set(key, value);
    for (const [key, value] of receiptsSnapshot) state.receipts.set(key, value);
    throw error;
  }

  return { created: true, receiptCount: plan.receipts.length };
}
