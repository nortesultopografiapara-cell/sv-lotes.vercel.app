/**
 * Motor da corretagem parcelada do Recanto. Sem banco e sem boleto.
 * npx tsx scripts/mandatory-recanto-brokerage-installments-tests.ts
 */

import {
  applySignalAddonToInstallmentAmounts,
  resolveRecantoSignalPlan,
} from '../lib/recantoSignalRemaining';
import {
  resolveInstallmentPrincipal,
  splitInstallmentAmounts,
} from '../lib/saleInstallmentCalc';
import {
  addMonthsKeepingEndOfMonth,
  buildRecantoBrokerageSchedule,
  reaisToCents,
  RecantoBrokerageScheduleError,
  splitCents,
  type RecantoBrokerageScheduleInput,
} from '../lib/recantoBrokerageInstallments';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => void, fragment: string) {
  try {
    run();
  } catch (error) {
    assert(error instanceof RecantoBrokerageScheduleError, 'erro do motor');
    assert(String(error.message).includes(fragment), error.message);
    return;
  }
  throw new Error(`deveria falhar: ${fragment}`);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

const LOT = reaisToCents('70933.85');
const BROKERAGE = reaisToCents('3500.00');
const PAID = reaisToCents('1000.00');
const BALANCE = reaisToCents('2500.00');
const TOTAL = reaisToCents('74433.85');

function example(overrides: Partial<RecantoBrokerageScheduleInput> = {}): RecantoBrokerageScheduleInput {
  return {
    lotPriceCents: LOT,
    brokerageTotalCents: BROKERAGE,
    paidAtActCents: PAID,
    brokerageInstallmentCount: 5,
    actDate: '2026-01-10',
    brokerageFirstDueDate: '2026-02-10',
    lotInstallmentCount: 10,
    lotStartMode: 'SIMULTANEOUS',
    ...overrides,
  };
}

function main() {
  assert(LOT === 7_093_385, 'lote em centavos');
  assert(BROKERAGE === 350_000, 'corretagem em centavos');
  assert(PAID === 100_000, 'ato em centavos');
  assert(BALANCE === 250_000, 'saldo em centavos');
  assert(TOTAL === LOT + BROKERAGE, 'total sem duplicidade');
  assert(TOTAL === 7_443_385, 'total do exemplo');

  const partial = buildRecantoBrokerageSchedule(example());
  assert(partial.brokerageBalanceCents === BALANCE, 'saldo parcial');
  assert(partial.financialTotalCents === TOTAL, 'total da operação');
  assert(partial.lotPriceCents === LOT, 'lote preservado');
  const initial = partial.brokerageLines.filter((line) => line.kind === 'INITIAL_PAYMENT');
  const pending = partial.brokerageLines.filter((line) => line.kind === 'INSTALLMENT');
  assert(initial.length === 1 && initial[0].amountCents === PAID, 'pago no ato');
  assert(initial[0].dueDate === '2026-01-10', 'data do ato');
  assert(pending.length === 5, 'cinco parcelas');
  assert(pending.every((line) => line.amountCents === 50_000), 'cinco de 500');
  assert(pending.map((line) => line.dueDate).join(',') === '2026-02-10,2026-03-10,2026-04-10,2026-05-10,2026-06-10', 'vencimentos da corretagem');
  assert(sum(partial.brokerageLines.map((line) => line.amountCents)) === BROKERAGE, 'soma da corretagem');
  assert(sum(partial.lotLines.map((line) => line.amountCents)) === LOT, 'soma do lote');
  assert(partial.lotLines.every((line) => line.group === 'LOT' && line.kind === 'INSTALLMENT'), 'grupo do lote');
  assert(partial.lotLines[0].dueDate === '2026-02-10', 'início simultâneo');
  assert(!partial.lotLines.some((line) => line.amountCents === 50_000), 'lote sem parcela de corretagem');

  const paidInFull = buildRecantoBrokerageSchedule(example({
    paidAtActCents: BROKERAGE,
    brokerageInstallmentCount: 0,
    brokerageFirstDueDate: null,
  }));
  assert(paidInFull.brokerageBalanceCents === 0, 'saldo zero');
  assert(paidInFull.brokerageLines.length === 1, 'somente o ato');
  assert(paidInFull.brokerageLines[0].amountCents === BROKERAGE, 'corretagem integral no ato');
  assert(sum(paidInFull.lotLines.map((line) => line.amountCents)) === LOT, 'lote após quitação');
  assert(paidInFull.financialTotalCents === TOTAL, 'total com corretagem quitada');

  const nonePaid = buildRecantoBrokerageSchedule(example({
    paidAtActCents: 0,
    actDate: null,
    brokerageInstallmentCount: 5,
  }));
  assert(nonePaid.brokerageLines.every((line) => line.kind === 'INSTALLMENT'), 'sem pagamento inicial');
  assert(sum(nonePaid.brokerageLines.map((line) => line.amountCents)) === BROKERAGE, 'corretagem toda parcelada');
  assert(nonePaid.brokerageLines.every((line) => line.amountCents === 70_000), 'cinco de 700');

  const uneven = splitCents(1_000, 3);
  assert(uneven.join(',') === '333,333,334', 'centavos na última');
  const unevenSchedule = buildRecantoBrokerageSchedule(example({
    brokerageTotalCents: 1_000,
    paidAtActCents: 0,
    actDate: null,
    brokerageInstallmentCount: 3,
    lotPriceCents: 1_000,
    lotInstallmentCount: 3,
  }));
  assert(
    unevenSchedule.brokerageLines.map((line) => line.amountCents).join(',') === '333,333,334',
    'parcelas desiguais',
  );
  assert(sum(unevenSchedule.brokerageLines.map((line) => line.amountCents)) === 1_000, 'fecha 1000');

  assert(addMonthsKeepingEndOfMonth('2026-01-31', 1) === '2026-02-28', 'fim de fevereiro');
  assert(addMonthsKeepingEndOfMonth('2024-01-31', 1) === '2024-02-29', 'ano bissexto');
  assert(addMonthsKeepingEndOfMonth('2026-01-31', 2) === '2026-03-31', 'volta ao dia 31');
  const monthEnd = buildRecantoBrokerageSchedule(example({
    paidAtActCents: 0,
    actDate: null,
    brokerageInstallmentCount: 3,
    brokerageFirstDueDate: '2026-01-31',
    lotStartMode: 'AFTER_BROKERAGE',
  }));
  assert(
    monthEnd.brokerageLines.map((line) => line.dueDate).join(',') === '2026-01-31,2026-02-28,2026-03-31',
    'série no fim do mês',
  );
  assert(monthEnd.lotFirstDueDate === '2026-04-30', 'lote depois da corretagem');

  const specific = buildRecantoBrokerageSchedule(example({
    lotStartMode: 'SPECIFIC_DATE',
    lotSpecificStartDate: '2026-08-15',
  }));
  assert(specific.lotLines[0].dueDate === '2026-08-15', 'data específica');
  assert(specific.holdLotChargesUntilBrokerageSettled === false, 'retenção desligada');

  const held = buildRecantoBrokerageSchedule(example({
    holdLotChargesUntilBrokerageSettled: true,
  }));
  assert(held.holdLotChargesUntilBrokerageSettled === true, 'retenção apenas marcada');
  assert(held.lotLines.length === 10, 'lote continua calculado');

  assertThrows(() => buildRecantoBrokerageSchedule(example({ lotPriceCents: -1 })), 'maior que zero');
  assertThrows(() => buildRecantoBrokerageSchedule(example({ brokerageTotalCents: -1 })), 'maior que zero');
  assertThrows(() => buildRecantoBrokerageSchedule(example({ paidAtActCents: -1 })), 'negativo');
  assertThrows(
    () => buildRecantoBrokerageSchedule(example({ paidAtActCents: BROKERAGE + 1 })),
    'maior que a corretagem',
  );
  assertThrows(() => buildRecantoBrokerageSchedule(example({ lotPriceCents: 10.5 })), 'centavos inteiros');
  assertThrows(() => reaisToCents('70933.850'), 'duas casas');
  assertThrows(() => buildRecantoBrokerageSchedule(example({ brokerageFirstDueDate: '2026-02-31' })), 'inválido');

  const oldPlan = resolveRecantoSignalPlan({
    contractValue: 3500,
    paidAtSale: 1000,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 5,
    totalInstallments: 10,
  });
  const oldBase = splitInstallmentAmounts(
    resolveInstallmentPrincipal({
      totalValue: 70933.85,
      downPayment: 3500,
      contractModel: 'RECANTO_PRIMAVERA',
    }),
    10,
  );
  const oldLines = applySignalAddonToInstallmentAmounts(oldBase, oldPlan);
  assert(oldLines[0].signalAddonAmount > 0, 'venda antiga ainda embute o sinal');
  assert(oldLines[0].amount > oldLines[0].baseAmount, 'acréscimo antigo preservado');
  assert(oldLines[5].signalAddonAmount === 0, 'demais parcelas antigas sem acréscimo');
  assert(
    Math.round(oldLines.reduce((total, line) => total + line.baseAmount, 0) * 100) === LOT,
    'base antiga continua o lote',
  );

  console.log('mandatory-recanto-brokerage-installments: ok');
}

main();
