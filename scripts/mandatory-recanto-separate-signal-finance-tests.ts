/**
 * Compatibilidade financeira do sinal separado. Sem banco e sem provedor.
 * npx tsx scripts/mandatory-recanto-separate-signal-finance-tests.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isEligibleInstallmentForAsaasCharge } from '../lib/finance/saleChargesShared';
import {
  AMBIGUOUS_INSTALLMENT_MESSAGE,
  SEPARATE_SIGNAL_CHARGE_BLOCKED_MESSAGE,
  SEPARATE_SIGNAL_RECALC_BLOCKED_MESSAGE,
  SEPARATE_SIGNAL_RELEASE_BLOCKED_MESSAGE,
  assertNoActiveChargeForReceipt,
  assertSeparateScheduleChargeAllowed,
  assertSeparateScheduleRecalcSupported,
  assertSeparateScheduleReleaseSupported,
  assertSettlementTargetsReceipt,
  cashFlowFromSeparateSale,
  distratoScheduleBalances,
  findReceiptById,
  findReceiptByInstallmentNumber,
  findReceiptByLogicalSlot,
  readReceiptScheduleGroup,
  separateSignalConsumersEnabled,
  settleReceiptById,
  summarizeReceiptSchedules,
  type SettledReceipt,
} from '../lib/finance/recantoReceiptSchedule';
import {
  RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED,
  RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED,
} from '../lib/recantoSeparateSignalPersistence';
import { RECANTO_SEPARATE_SIGNAL_ENABLED } from '../lib/recantoSeparateSignalForm';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => void, fragment: string) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(fragment), message);
    return;
  }
  throw new Error(`deveria falhar: ${fragment}`);
}

function row(partial: Partial<SettledReceipt> & Pick<SettledReceipt, 'id'>): SettledReceipt {
  return {
    saleId: 'sale-1',
    sale_id: 'sale-1',
    installmentNumber: 1,
    installment_number: 1,
    amountCents: 50_000,
    amount: 500,
    status: 'pendente',
    paidAmountCents: 0,
    dueDate: '2026-02-10',
    due_date: '2026-02-10',
    settlementEventId: null,
    ...partial,
  };
}

function main() {
  assert(RECANTO_SEPARATE_SIGNAL_ENABLED === false, '15. formulário desligado');
  assert(RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED === false, '15. schema desligado');
  assert(RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED === false, '15. persistência desligada');
  assert(separateSignalConsumersEnabled() === false, '15. consumidores não habilitam a modalidade');

  const legacy = [
    row({ id: 'legacy-0', schedule_group: null, installment_number: 0, installmentNumber: 0, amountCents: 100_000, amount: 1000, status: 'pago', paidAmountCents: 100_000 }),
    row({ id: 'legacy-1', schedule_group: null, installment_number: 1, installmentNumber: 1, amountCents: 759_338, amount: 7593.38, status: 'pendente' }),
  ];
  assert(legacy.every((item) => readReceiptScheduleGroup(item) === 'LEGACY'), '1. nulo permanece legado');
  assert(!separateScheduleChargeBlocked(legacy[1]), '1. cobrança antiga continua elegível pelo grupo');
  assertSeparateScheduleRecalcSupported(legacy);
  assertSeparateScheduleReleaseSupported(legacy);
  const legacySummary = summarizeReceiptSchedules(legacy);
  assert(legacySummary.signalReceivedCents === 0 && legacySummary.lotReceivedCents === 0, '1. legado não vira sinal nem lote');
  assert(legacySummary.legacyReceivedCents === 100_000, '1. recebimento antigo preservado');
  assert(distratoScheduleBalances(legacy).blocked === false, '12. distrato antigo segue liberado');

  const separate = [
    row({ id: 'signal-0', schedule_group: 'SIGNAL', installment_number: 0, installmentNumber: 0, amountCents: 100_000, status: 'pago', paidAmountCents: 100_000, due_date: '2026-01-10' }),
    row({ id: 'signal-1', schedule_group: 'SIGNAL', installment_number: 1, installmentNumber: 1, amountCents: 50_000, status: 'pendente', due_date: '2026-02-10' }),
    row({ id: 'lot-1', schedule_group: 'LOT', installment_number: 1, installmentNumber: 1, amountCents: 709_339, status: 'pendente', due_date: '2026-07-10' }),
  ];
  assert(readReceiptScheduleGroup(separate[1]) === 'SIGNAL', '2. grupo do sinal');
  assert(readReceiptScheduleGroup(separate[2]) === 'LOT', '2. grupo do lote');
  assert(findReceiptByLogicalSlot(separate, { saleId: 'sale-1', group: 'SIGNAL', installmentNumber: 1 })?.id === 'signal-1', '3. parcela 1 do sinal');
  assert(findReceiptByLogicalSlot(separate, { saleId: 'sale-1', group: 'LOT', installmentNumber: 1 })?.id === 'lot-1', '3. parcela 1 do lote');
  assertThrows(() => findReceiptByInstallmentNumber(separate, 'sale-1', 1), AMBIGUOUS_INSTALLMENT_MESSAGE);
  assert(findReceiptById(separate, 'lot-1')?.id === 'lot-1', '4. seleção pelo id');

  assertThrows(() => assertSeparateScheduleChargeAllowed(separate[1]), SEPARATE_SIGNAL_CHARGE_BLOCKED_MESSAGE);
  assertThrows(() => assertSeparateScheduleChargeAllowed(separate[2]), SEPARATE_SIGNAL_CHARGE_BLOCKED_MESSAGE);
  assertThrows(
    () => assertNoActiveChargeForReceipt([{ receiptId: 'legacy-1', active: true }], 'legacy-1'),
    'cobrança ativa',
  );
  assertNoActiveChargeForReceipt([{ receiptId: 'legacy-1', active: false }], 'legacy-1');
  assert(
    isEligibleInstallmentForAsaasCharge({
      id: 'signal-1',
      sale_id: 'sale-1',
      installment_number: 1,
      due_date: '2026-02-10',
      amount: 500,
      status: 'pendente',
      schedule_group: 'SIGNAL',
    }) === false,
    '5. sinal separado fora da fila de emissão',
  );
  assert(
    isEligibleInstallmentForAsaasCharge({
      id: 'legacy-1',
      sale_id: 'sale-1',
      installment_number: 1,
      due_date: '2026-03-10',
      amount: 500,
      status: 'pendente',
      schedule_group: null,
    }) === true,
    '13. parcela antiga permanece elegível',
  );

  const paidSignal = settleReceiptById(separate, { receiptId: 'signal-1', eventId: 'evt-1' });
  assert(paidSignal.cashEntries === 1, '6. baixa do sinal gera uma entrada');
  assert(paidSignal.receipts.find((item) => item.id === 'lot-1')?.status === 'pendente', '6. lote não quita');
  assert(paidSignal.receipts.find((item) => item.id === 'signal-1')?.status === 'pago', '6. sinal quita');
  const paidLot = settleReceiptById(separate, { receiptId: 'lot-1', eventId: 'evt-lot' });
  assert(paidLot.receipts.find((item) => item.id === 'signal-1')?.status === 'pendente', '7. sinal não quita');
  const repeated = settleReceiptById(paidSignal.receipts, { receiptId: 'signal-1', eventId: 'evt-1' });
  assert(repeated.duplicate && repeated.cashEntries === 0, '8. webhook repetido não lança de novo');
  assert(repeated.receipts.filter((item) => item.id === 'signal-1').length === 1, '8. recebível único');
  assertThrows(() => assertSettlementTargetsReceipt('signal-1', 'lot-1'), 'id do recebível');

  assertThrows(() => assertSeparateScheduleRecalcSupported(separate), SEPARATE_SIGNAL_RECALC_BLOCKED_MESSAGE);
  assertSeparateScheduleRecalcSupported([row({ id: 'other', schedule_group: null, sale_id: 'sale-padrao' })]);

  const summary = summarizeReceiptSchedules(separate, '2026-03-01');
  assert(summary.signalReceivedCents === 100_000, '10. sinal recebido');
  assert(summary.signalPendingCents === 50_000, '10. sinal pendente');
  assert(summary.signalOverdueCents === 50_000, '10. inadimplência do sinal');
  assert(summary.lotPendingCents === 709_339 && summary.lotReceivedCents === 0, '10. lote separado');
  assert(summary.totalReceivedCents === 100_000, '10. total recebido sem duplicar');
  assert(summary.totalPendingCents === 50_000 + 709_339, '10. total pendente');

  const flow = cashFlowFromSeparateSale({
    receipts: paidSignal.receipts,
    manualOutflowsCents: [20_000],
    paidCommissionCents: [20_000],
  });
  assert(flow.entriesCents === 150_000, '11. receita do sinal e do ato uma vez');
  assert(flow.exitsCents === 20_000, '11. repasse manual não vira outra receita');
  assert(flow.commissionEntries === 0, '11. comissão não entra de novo');

  const distrato = distratoScheduleBalances(separate);
  assert(distrato.blocked, '14. distrato separado bloqueado');
  assert(distrato.message === SEPARATE_SIGNAL_RELEASE_BLOCKED_MESSAGE, '14. mensagem do distrato');
  assert(distrato.signalPendingCents === 50_000 && distrato.lotPendingCents === 709_339, '12. saldos não se misturam');
  assert(distrato.signalReceivedCents === 100_000, '12. sinal recebido isolado');
  assertThrows(() => assertSeparateScheduleReleaseSupported(separate), SEPARATE_SIGNAL_RELEASE_BLOCKED_MESSAGE);

  const sources = [
    'lib/finance/saleChargesService.ts',
    'lib/finance/asaasCompanyChargeService.ts',
    'lib/banking/inter/interSaleChargeService.ts',
    'lib/banking/inter/interPaymentSettlement.ts',
    'lib/finance/companyAsaasPaymentReconciliation.ts',
    'lib/saleEdit.ts',
    'lib/finance/releaseLotService.ts',
  ];
  for (const file of sources) {
    const source = readFileSync(resolve(file), 'utf8');
    assert(source.includes('recantoReceiptSchedule'), `${file} usa a compatibilidade`);
  }

  console.log('mandatory-recanto-separate-signal-finance: ok');
}

function separateScheduleChargeBlocked(item: SettledReceipt): boolean {
  try {
    assertSeparateScheduleChargeAllowed(item);
    return false;
  } catch {
    return true;
  }
}

main();
