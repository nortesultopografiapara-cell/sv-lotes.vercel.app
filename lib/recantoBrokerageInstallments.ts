/**
 * Corretagem parcelada do Recanto Primavera.
 * Cronograma em memória, em centavos inteiros.
 * Não grava recebível, não emite boleto e não altera o sinal embutido das vendas atuais.
 */

export const RECANTO_BROKERAGE_GROUPS = ['BROKERAGE', 'LOT'] as const;
export type RecantoBrokerageGroup = (typeof RECANTO_BROKERAGE_GROUPS)[number];

export const RECANTO_LOT_START_MODES = [
  'AFTER_BROKERAGE',
  'SIMULTANEOUS',
  'SPECIFIC_DATE',
] as const;
export type RecantoLotStartMode = (typeof RECANTO_LOT_START_MODES)[number];

export type RecantoBrokerageLineKind = 'INITIAL_PAYMENT' | 'INSTALLMENT';

export type RecantoBrokerageScheduleInput = {
  lotPriceCents: number;
  brokerageTotalCents: number;
  paidAtActCents: number;
  brokerageInstallmentCount: number;
  actDate?: string | null;
  brokerageFirstDueDate?: string | null;
  lotInstallmentCount: number;
  lotStartMode: RecantoLotStartMode;
  lotSpecificStartDate?: string | null;
  /** Preparado para a emissão futura. Não altera valores, datas nem boletos. */
  holdLotChargesUntilBrokerageSettled?: boolean;
};

export type RecantoBrokerageLine = {
  group: RecantoBrokerageGroup;
  kind: RecantoBrokerageLineKind;
  sequence: number;
  amountCents: number;
  dueDate: string;
};

export type RecantoBrokerageSchedule = {
  lotPriceCents: number;
  brokerageTotalCents: number;
  paidAtActCents: number;
  brokerageBalanceCents: number;
  brokerageLines: RecantoBrokerageLine[];
  lotLines: RecantoBrokerageLine[];
  financialTotalCents: number;
  lotStartMode: RecantoLotStartMode;
  lotFirstDueDate: string;
  holdLotChargesUntilBrokerageSettled: boolean;
};

export class RecantoBrokerageScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecantoBrokerageScheduleError';
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function fail(message: string): never {
  throw new RecantoBrokerageScheduleError(message);
}

function assertIntegerCents(value: number, label: string) {
  if (!Number.isInteger(value)) {
    fail(`${label} deve estar em centavos inteiros.`);
  }
}

export function reaisToCents(value: string): number {
  const match = String(value).trim().match(/^(\d+)\.(\d{2})$/);
  if (!match) fail('Valor em reais deve usar duas casas decimais.');
  return Number(match[1]) * 100 + Number(match[2]);
}

export function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(String(value || '').trim());
  if (!match) fail('Data deve estar no formato YYYY-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) fail('Mês da data é inválido.');
  const limit = daysInMonth(year, month);
  if (day < 1 || day > limit) fail('Dia da data é inválido.');
  return { year, month, day };
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Soma meses e mantém o dia, recuando para o último dia quando o mês é mais curto. */
export function addMonthsKeepingEndOfMonth(isoDate: string, months: number): string {
  if (!Number.isInteger(months)) fail('A quantidade de meses deve ser inteira.');
  const parsed = parseIsoDate(isoDate);
  const index = parsed.month - 1 + months;
  const year = parsed.year + Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12 + 1;
  const day = Math.min(parsed.day, daysInMonth(year, month));
  return formatIsoDate(year, month, day);
}

/** Divide centavos inteiros. A diferença do arredondamento fica na última parcela. */
export function splitCents(totalCents: number, count: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    fail('O valor a dividir deve ser um total inteiro de centavos.');
  }
  if (!Number.isInteger(count) || count <= 0) {
    fail('A quantidade de parcelas deve ser maior que zero.');
  }
  const unit = Math.round(totalCents / count);
  const amounts: number[] = [];
  let accumulated = 0;
  for (let index = 0; index < count; index += 1) {
    const amount = index === count - 1 ? totalCents - accumulated : unit;
    if (amount <= 0) {
      fail('A quantidade de parcelas produz um boleto sem valor. Reduza a quantidade.');
    }
    amounts.push(amount);
    accumulated += amount;
  }
  return amounts;
}

function requireDate(value: string | null | undefined, label: string): string {
  if (!value || !String(value).trim()) fail(`${label} é obrigatória.`);
  parseIsoDate(value);
  return value;
}

function resolveLotFirstDueDate(input: {
  mode: RecantoLotStartMode;
  specificDate?: string | null;
  brokerageAnchorDate: string;
  brokerageLastDueDate: string;
}): string {
  if (input.mode === 'SPECIFIC_DATE') {
    return requireDate(input.specificDate, 'A data específica de início do lote');
  }
  if (input.mode === 'SIMULTANEOUS') return input.brokerageAnchorDate;
  if (input.mode === 'AFTER_BROKERAGE') {
    return addMonthsKeepingEndOfMonth(input.brokerageLastDueDate, 1);
  }
  fail('O início das parcelas do lote é inválido.');
}

export function buildRecantoBrokerageSchedule(
  input: RecantoBrokerageScheduleInput,
): RecantoBrokerageSchedule {
  assertIntegerCents(input.lotPriceCents, 'O valor do lote');
  assertIntegerCents(input.brokerageTotalCents, 'O valor da corretagem');
  assertIntegerCents(input.paidAtActCents, 'O valor pago no ato');
  assertIntegerCents(input.brokerageInstallmentCount, 'A quantidade de parcelas da corretagem');
  assertIntegerCents(input.lotInstallmentCount, 'A quantidade de parcelas do lote');

  if (input.lotPriceCents <= 0) fail('O valor do lote deve ser maior que zero.');
  if (input.brokerageTotalCents <= 0) fail('O valor da corretagem deve ser maior que zero.');
  if (input.paidAtActCents < 0) fail('O valor pago no ato não pode ser negativo.');
  if (input.paidAtActCents > input.brokerageTotalCents) {
    fail('O valor pago no ato não pode ser maior que a corretagem.');
  }
  if (input.lotInstallmentCount <= 0) {
    fail('A quantidade de parcelas do lote deve ser maior que zero.');
  }
  if (input.brokerageInstallmentCount < 0) {
    fail('A quantidade de parcelas da corretagem não pode ser negativa.');
  }
  if (!RECANTO_LOT_START_MODES.includes(input.lotStartMode)) {
    fail('O início das parcelas do lote é inválido.');
  }

  const balance = input.brokerageTotalCents - input.paidAtActCents;
  if (balance > 0 && input.brokerageInstallmentCount <= 0) {
    fail('Informe a quantidade de parcelas do saldo da corretagem.');
  }
  if (balance === 0 && input.brokerageInstallmentCount > 0) {
    fail('A corretagem paga no ato não possui parcelas pendentes.');
  }

  const brokerageLines: RecantoBrokerageLine[] = [];
  if (input.paidAtActCents > 0) {
    brokerageLines.push({
      group: 'BROKERAGE',
      kind: 'INITIAL_PAYMENT',
      sequence: 0,
      amountCents: input.paidAtActCents,
      dueDate: requireDate(input.actDate, 'A data do pagamento no ato'),
    });
  }

  const brokerageAmounts = balance > 0
    ? splitCents(balance, input.brokerageInstallmentCount)
    : [];
  const brokerageFirstDue = balance > 0
    ? requireDate(input.brokerageFirstDueDate, 'A data da primeira parcela da corretagem')
    : null;
  brokerageAmounts.forEach((amountCents, index) => {
    brokerageLines.push({
      group: 'BROKERAGE',
      kind: 'INSTALLMENT',
      sequence: index + 1,
      amountCents,
      dueDate: addMonthsKeepingEndOfMonth(brokerageFirstDue as string, index),
    });
  });

  const brokerageAnchor = brokerageFirstDue
    || (input.paidAtActCents > 0 ? requireDate(input.actDate, 'A data do pagamento no ato') : null);
  const brokerageLastDue = brokerageLines.length
    ? brokerageLines[brokerageLines.length - 1].dueDate
    : null;
  if (!brokerageAnchor || !brokerageLastDue) {
    fail('A corretagem precisa de uma data para posicionar o cronograma do lote.');
  }

  const lotFirstDueDate = resolveLotFirstDueDate({
    mode: input.lotStartMode,
    specificDate: input.lotSpecificStartDate,
    brokerageAnchorDate: brokerageAnchor,
    brokerageLastDueDate: brokerageLastDue,
  });
  const lotAmounts = splitCents(input.lotPriceCents, input.lotInstallmentCount);
  const lotLines: RecantoBrokerageLine[] = lotAmounts.map((amountCents, index) => ({
    group: 'LOT',
    kind: 'INSTALLMENT',
    sequence: index + 1,
    amountCents,
    dueDate: addMonthsKeepingEndOfMonth(lotFirstDueDate, index),
  }));

  const brokerageSum = brokerageLines.reduce((sum, line) => sum + line.amountCents, 0);
  const lotSum = lotLines.reduce((sum, line) => sum + line.amountCents, 0);
  const financialTotalCents = input.lotPriceCents + input.brokerageTotalCents;
  if (brokerageSum !== input.brokerageTotalCents || lotSum !== input.lotPriceCents) {
    fail('A soma dos cronogramas não fecha com o total financeiro.');
  }
  if (lotSum + brokerageSum !== financialTotalCents) {
    fail('O total financeiro está duplicado ou incompleto.');
  }

  return {
    lotPriceCents: input.lotPriceCents,
    brokerageTotalCents: input.brokerageTotalCents,
    paidAtActCents: input.paidAtActCents,
    brokerageBalanceCents: balance,
    brokerageLines,
    lotLines,
    financialTotalCents,
    lotStartMode: input.lotStartMode,
    lotFirstDueDate,
    holdLotChargesUntilBrokerageSettled: Boolean(input.holdLotChargesUntilBrokerageSettled),
  };
}
