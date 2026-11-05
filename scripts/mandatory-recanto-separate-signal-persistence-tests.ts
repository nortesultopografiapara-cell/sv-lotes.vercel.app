/**
 * Persistência do sinal separado. Memória local, sem banco e sem cobrança.
 * npx tsx scripts/mandatory-recanto-separate-signal-persistence-tests.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applySignalAddonToInstallmentAmounts,
  resolveRecantoSignalPlan,
} from '../lib/recantoSignalRemaining';
import {
  RECANTO_SEPARATE_SIGNAL_CHARGES_BLOCKED_MESSAGE,
  RECANTO_SEPARATE_SIGNAL_PERSIST_BLOCKED_MESSAGE,
  RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED,
  RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED,
  RecantoSeparateSignalPersistenceError,
  classifyExistingReceipt,
  clientRequestedSeparateSignal,
  emptySeparateSignalMemory,
  planRecantoSeparateSignalPersistence,
  rejectUnpersistedSeparateSignalRequest,
  simulateSeparateSignalPersistence,
  type SeparateSignalPersistenceInput,
} from '../lib/recantoSeparateSignalPersistence';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => void, fragment: string) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(error instanceof RecantoSeparateSignalPersistenceError, 'erro de persistência');
    assert(message.includes(fragment), message);
    return;
  }
  throw new Error(`deveria falhar: ${fragment}`);
}

function example(overrides: Partial<SeparateSignalPersistenceInput> = {}): SeparateSignalPersistenceInput {
  return {
    featureEnabled: true,
    contractModel: 'RECANTO_PRIMAVERA',
    saleId: 'sale-1',
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    projectId: 'project-1',
    blockId: 'lot-1',
    financialAccountId: 'conta-ivanilde',
    lotPrice: 70933.85,
    signalContract: 3500,
    paidAtAct: 1000,
    signalInstallmentCount: 5,
    actDate: '2026-01-10',
    signalFirstDueDate: '2026-02-10',
    lotInstallmentCount: 10,
    lotStartMode: 'AFTER_BROKERAGE',
    holdLotChargesUntilSignalSettled: true,
    ...overrides,
  };
}

function plan(overrides: Partial<SeparateSignalPersistenceInput> = {}) {
  return planRecantoSeparateSignalPersistence(example(overrides));
}

function sum(rows: Array<{ amountCents: number }>) {
  return rows.reduce((total, row) => total + row.amountCents, 0);
}

function main() {
  assert(RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED === false, 'schema não aplicado');
  assert(RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED === false, 'gravação real desligada');

  const partial = plan();
  const signal = partial.receipts.filter((row) => row.scheduleGroup === 'SIGNAL');
  const lot = partial.receipts.filter((row) => row.scheduleGroup === 'LOT');
  const act = signal.filter((row) => row.installmentNumber === 0);
  const future = signal.filter((row) => row.installmentNumber > 0);
  assert(act.length === 1 && act[0].amountCents === 100_000 && act[0].status === 'pago', 'parcial: pago no ato');
  assert(future.length === 5 && future.every((row) => row.amountCents === 50_000), 'parcial: 5 x 500');
  assert(future.map((row) => row.dueDate).join(',') === '2026-02-10,2026-03-10,2026-04-10,2026-05-10,2026-06-10', 'vencimentos do sinal');
  assert(lot[0]?.dueDate === '2026-07-10', 'lote começa depois do sinal');
  assert(future[0]?.dueDate !== lot[0]?.dueDate, 'vencimentos independentes');
  assert(sum(lot) === 7_093_385, 'lote exclusivo');
  assert(lot.every((row) => row.signalAddonAmountCents === 0), 'lote sem acréscimo');
  assert(sum(signal) === 350_000, 'sinal contratado');
  assert(act[0].amountCents + sum(future) === sum(signal), 'ato mais parcelas futuras');
  assert(sum(signal) + sum(lot) === partial.schedule.financialTotalCents, 'total sem duplicidade');
  assert(partial.sale.financialAccountId === 'conta-ivanilde', 'conta do sinal preservada');
  assert(signal.every((row) => row.financialAccountId === 'conta-ivanilde'), 'parcelas do sinal na mesma conta');
  assert(partial.brokerCommissions.length === 0, 'sem repasse automático');
  assert(partial.cashMovements.length === 0, 'sem fluxo de caixa');
  assert(partial.charges.length === 0 && partial.chargesBlocked, 'sem cobrança');
  assert(partial.confirmationAllowed === false, 'confirmação real bloqueada no plano');
  assert(partial.sale.signalRemainingPaymentMode === null, 'não reutiliza o modo embutido');
  assert(partial.sale.lotStartMode === 'AFTER_SIGNAL', 'início gravado como sinal');

  const paid = plan({ paidAtAct: 3500, signalInstallmentCount: 4 });
  const paidSignal = paid.receipts.filter((row) => row.scheduleGroup === 'SIGNAL');
  assert(paidSignal.length === 1 && paidSignal[0].status === 'pago', 'integral: só o ato');
  assert(paid.sale.signalBalanceCents === 0 && paid.sale.signalInstallmentCount === 0, 'integral: sem saldo');
  assert(sum(paid.receipts.filter((row) => row.scheduleGroup === 'LOT')) === 7_093_385, 'integral: lote intacto');

  const open = plan({ paidAtAct: 0, signalInstallmentCount: 5, actDate: '' });
  const openSignal = open.receipts.filter((row) => row.scheduleGroup === 'SIGNAL');
  assert(openSignal.every((row) => row.installmentNumber > 0 && row.status === 'pendente'), 'sem ato: só parcelas futuras');
  assert(openSignal.length === 5 && openSignal.every((row) => row.amountCents === 70_000), 'sem ato: 5 x 700');

  const cents = plan({ signalContract: 10, paidAtAct: 0, signalInstallmentCount: 3, actDate: '' });
  const split = cents.receipts
    .filter((row) => row.scheduleGroup === 'SIGNAL')
    .map((row) => row.amountCents);
  assert(split.join(',') === '333,333,334', 'ajuste de centavos');
  assert(sum(cents.receipts.filter((row) => row.scheduleGroup === 'SIGNAL')) === 1_000, 'centavos fecham');

  const state = emptySeparateSignalMemory();
  assertThrows(
    () => simulateSeparateSignalPersistence(state, partial),
    'bloqueada',
  );
  assert(state.sales.size === 0 && state.receipts.size === 0, 'recusa não grava');

  const authorized = { schemaApplied: true, persistEnabled: true };
  assertThrows(
    () => simulateSeparateSignalPersistence(state, partial, { ...authorized, failAt: 'receipts' }),
    'Nenhuma venda foi mantida',
  );
  assert(state.sales.size === 0 && state.receipts.size === 0, 'rollback limpa a venda');

  const first = simulateSeparateSignalPersistence(state, partial, authorized);
  const second = simulateSeparateSignalPersistence(state, partial, authorized);
  assert(first.created && !second.created, 'repetição não cria outra venda');
  assert(state.receipts.get(partial.sale.requestKey)?.length === partial.receipts.length, 'parcelas não duplicam');

  assertThrows(
    () => simulateSeparateSignalPersistence(state, plan({ signalInstallmentCount: 4 }), authorized),
    'outro cronograma',
  );
  assert(state.sales.size === 1, 'conflito não grava o segundo cronograma');

  assertThrows(() => plan({ featureEnabled: false }), 'desligada');
  for (const model of ['PADRAO', 'MUNDO_NOVO', 'MENESES', 'ARAGUAIA']) {
    assertThrows(() => plan({ contractModel: model }), 'Recanto Primavera');
  }

  const legacy = [
    { schedule_group: null, installment_number: 0, amount: 1000, signal_addon_amount: 0 },
    { schedule_group: null, installment_number: 1, amount: 7593.38, signal_addon_amount: 500 },
  ];
  assert(legacy.every((row) => classifyExistingReceipt(row) === 'LEGACY'), 'venda antiga continua legada');
  const legacyPlan = resolveRecantoSignalPlan({
    contractValue: 3500,
    paidAtSale: 1000,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 5,
    totalInstallments: 10,
  });
  const legacyLines = applySignalAddonToInstallmentAmounts([7093.38], legacyPlan);
  assert((legacyLines[0]?.signalAddonAmount ?? 0) > 0, 'fluxo embutido antigo permanece');

  assertThrows(
    () => rejectUnpersistedSeparateSignalRequest({ signal_schedule_mode: 'SEPARATE' }),
    RECANTO_SEPARATE_SIGNAL_PERSIST_BLOCKED_MESSAGE,
  );
  rejectUnpersistedSeparateSignalRequest({ signal_remaining_payment_mode: 'FIRST_INSTALLMENTS' });
  assert(clientRequestedSeparateSignal({ separate_signal: true }), 'pedido explícito');
  assert(!clientRequestedSeparateSignal({}), 'venda antiga não pede a modalidade');
  assert(partial.chargesBlocked && RECANTO_SEPARATE_SIGNAL_CHARGES_BLOCKED_MESSAGE.includes('bloqueados'), 'cobrança bloqueada');

  const service = readFileSync(resolve('lib/gisSaleCreateService.ts'), 'utf8');
  const guardAt = service.indexOf('rejectUnpersistedSeparateSignalRequest(customerData)');
  const nextQuery = service.indexOf(".from('blocks')", guardAt);
  assert(guardAt > 0 && nextQuery > guardAt, 'servidor recusa antes de consultar o lote');
  assert(!service.includes('simulateSeparateSignalPersistence'), 'criação real não usa o simulador');

  const migration = readFileSync(
    resolve('supabase/migrations/20261105143000_recanto_separate_signal_schedule.sql'),
    'utf8',
  );
  assert(migration.includes('schedule_group'), 'migration distingue os cronogramas');
  assert(migration.includes('Não aplicar'), 'migration não é instrução de execução');
  assert(!migration.toLowerCase().includes('delete from'), 'migration não apaga dados');

  console.log('mandatory-recanto-separate-signal-persistence: ok');
}

main();
