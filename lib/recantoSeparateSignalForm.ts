/**
 * Prévia do sinal parcelado na Nova Venda do Recanto Primavera.
 * A opção nasce desligada. A prévia não entra no payload da venda.
 */

import { formatCurrencyBRL } from '@/lib/currencyBrl';
import { normalizeSaleContractModel } from '@/lib/contractModel';
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
  lotStartMode: RecantoLotStartMode;
  lotSpecificStartDate?: string | null;
  holdLotChargesUntilSignalSettled?: boolean;
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

export function buildRecantoSeparateSignalPreview(
  input: RecantoSeparateSignalFormInput,
): RecantoSeparateSignalPreview {
  const offered = canOfferRecantoSeparateSignal(input);
  const installmentSale = input.installmentSale !== false;
  if (!offered || !input.selected || !installmentSale) return inactive(offered);

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
      confirmBlocked: true,
      confirmBlockMessage: RECANTO_SEPARATE_SIGNAL_PREPARATION_MESSAGE,
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
