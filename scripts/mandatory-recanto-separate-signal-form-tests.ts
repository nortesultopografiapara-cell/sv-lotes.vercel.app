/**
 * Prévia do sinal separado no formulário. Sem banco, sem boleto e sem venda.
 * npx tsx scripts/mandatory-recanto-separate-signal-form-tests.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applySignalAddonToInstallmentAmounts,
  resolveRecantoSignalPlan,
} from '../lib/recantoSignalRemaining';
import {
  buildRecantoSeparateSignalPreview,
  canOfferRecantoSeparateSignal,
  describeCentsInstallments,
  RECANTO_SEPARATE_SIGNAL_ENABLED,
  RECANTO_SEPARATE_SIGNAL_PREPARATION_MESSAGE,
  type RecantoSeparateSignalFormInput,
} from '../lib/recantoSeparateSignalForm';
import type { RecantoLotStartMode } from '../lib/recantoBrokerageInstallments';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function example(
  overrides: Partial<RecantoSeparateSignalFormInput> = {},
): RecantoSeparateSignalFormInput {
  return {
    contractModel: 'RECANTO_PRIMAVERA',
    enabled: true,
    selected: true,
    installmentSale: true,
    lotPrice: 70933.85,
    signalContract: 3500,
    paidAtAct: 1000,
    signalInstallmentCount: 5,
    actDate: '2026-01-10',
    signalFirstDueDate: '2026-02-10',
    lotInstallmentCount: 10,
    lotStartMode: 'AFTER_BROKERAGE',
    lotSpecificStartDate: '2026-08-15',
    holdLotChargesUntilSignalSettled: false,
    ...overrides,
  };
}

function preview(overrides: Partial<RecantoSeparateSignalFormInput> = {}) {
  return buildRecantoSeparateSignalPreview(example(overrides));
}

function main() {
  assert(RECANTO_SEPARATE_SIGNAL_ENABLED === false, '1. flag desligada');
  const off = preview({ enabled: false, selected: true });
  assert(off.offered === false && off.active === false, '1. Recanto desligado não oferece');
  assert(off.confirmBlocked === false && off.schedule === null, '1. Recanto desligado confirma o fluxo antigo');
  assert(
    canOfferRecantoSeparateSignal({ contractModel: 'RECANTO_PRIMAVERA' }) === false,
    '1. omissão do interruptor permanece desligada',
  );

  const on = preview();
  assert(on.offered && on.active && on.schedule, '2. Recanto habilitado calcula a prévia');
  assert(on.error === null, '2. exemplo comercial sem erro');

  for (const model of ['PADRAO', 'MUNDO_NOVO', 'MENESES', 'ARAGUAIA', 'SV_LOTES_2']) {
    const other = preview({ contractModel: model, enabled: true, selected: true });
    assert(other.offered === false && other.confirmBlocked === false, `3. ${model} sem a opção`);
  }

  const paid = preview({ paidAtAct: 3500, signalInstallmentCount: 9 });
  assert(paid.schedule?.paidAtActCents === 350_000, '4. sinal integral no ato');
  assert(paid.schedule?.brokerageBalanceCents === 0, '4. sem saldo');
  assert(
    paid.schedule?.brokerageLines.every((line) => line.kind === 'INITIAL_PAYMENT'),
    '4. sem parcelas futuras',
  );
  assert(paid.schedule?.lotPriceCents === 7_093_385, '4. lote preservado');

  const partial = on.schedule!;
  assert(partial.brokerageBalanceCents === 250_000, '5. restante 2500');
  assert(partial.paidAtActCents === 100_000, '5. pago no ato 1000');
  const pending = partial.brokerageLines.filter((line) => line.kind === 'INSTALLMENT');
  assert(pending.length === 5 && pending.every((line) => line.amountCents === 50_000), '5. cinco de 500');
  assert(
    describeCentsInstallments(pending.map((line) => line.amountCents)).startsWith('5 ×'),
    '5. frase do parcelamento',
  );

  const noneAtAct = preview({ paidAtAct: 0, signalInstallmentCount: 5, actDate: '' });
  const open = noneAtAct.schedule?.brokerageLines ?? [];
  assert(open.length === 5 && open.every((line) => line.amountCents === 70_000), '6. sinal sem pagamento no ato');
  assert(open[0]?.dueDate === '2026-02-10', '6. primeiro vencimento');

  const cents = preview({
    signalContract: 10,
    paidAtAct: 0,
    signalInstallmentCount: 3,
    actDate: '',
  });
  const split = (cents.schedule?.brokerageLines ?? []).map((line) => line.amountCents);
  assert(split.join(',') === '333,333,334', '7. ajuste de centavos na última');
  assert(describeCentsInstallments(split).includes('última'), '7. frase do ajuste');

  const four = preview({ signalInstallmentCount: 4 });
  const fourAmounts = (four.schedule?.brokerageLines ?? [])
    .filter((line) => line.kind === 'INSTALLMENT')
    .map((line) => line.amountCents);
  assert(fourAmounts.length === 4 && fourAmounts.join(',') !== '50000,50000,50000,50000,50000', '8. quantidade altera as parcelas');
  assert(fourAmounts.reduce((sum, amount) => sum + amount, 0) === 250_000, '8. saldo preservado');

  const later = preview({ signalFirstDueDate: '2026-03-31', lotStartMode: 'SIMULTANEOUS' });
  const laterPending = (later.schedule?.brokerageLines ?? []).filter((line) => line.kind === 'INSTALLMENT');
  assert(laterPending[0]?.dueDate === '2026-03-31', '9. vencimento alterado');
  assert(laterPending[1]?.dueDate === '2026-04-30', '9. fim de mês');
  assert(later.schedule?.lotFirstDueDate === '2026-03-31', '9. lote simultâneo');
  const specific = preview({ lotStartMode: 'SPECIFIC_DATE' satisfies RecantoLotStartMode });
  assert(specific.schedule?.lotFirstDueDate === '2026-08-15', '9. data específica');
  assert(on.schedule?.lotFirstDueDate === '2026-07-10', '9. lote após o sinal');

  assert(partial.financialTotalCents === 7_443_385, '10. total 74433,85');
  assert(partial.financialTotalCents === partial.lotPriceCents + partial.brokerageTotalCents, '10. lote mais sinal');
  assert(
    partial.lotLines.reduce((sum, line) => sum + line.amountCents, 0) === partial.lotPriceCents,
    '10. parcelas do lote somam o preço do lote',
  );
  assert(partial.lotPriceCents === 7_093_385, '10. preço do lote não reduz');
  const held = preview({ holdLotChargesUntilSignalSettled: true });
  assert(held.schedule?.holdLotChargesUntilBrokerageSettled === true, '10. retenção só marcada');
  assert(held.schedule?.lotLines.length === partial.lotLines.length, '10. retenção não remove o lote');

  const idle = preview({ selected: false });
  assert(idle.active === false && idle.confirmBlocked === false && idle.schedule === null, '11. desmarcado não troca o fluxo');
  const cash = preview({ installmentSale: false });
  assert(cash.confirmBlocked === false, '11. venda à vista não bloqueia');
  const legacy = resolveRecantoSignalPlan({
    contractValue: 3500,
    paidAtSale: 1000,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 5,
    totalInstallments: 10,
  });
  const legacyLines = applySignalAddonToInstallmentAmounts([7093.38, 7093.39], legacy);
  assert((legacyLines[0]?.signalAddonAmount ?? 0) > 0, '11. sinal embutido antigo continua somando na parcela');

  assert(on.confirmBlocked === true, '12. modalidade nova não confirma');
  assert(on.confirmBlockMessage === RECANTO_SEPARATE_SIGNAL_PREPARATION_MESSAGE, '12. mensagem de preparação');
  const invalid = preview({ signalFirstDueDate: '' });
  assert(invalid.confirmBlocked && invalid.schedule === null, '12. prévia inválida também não confirma');
  assert(!String(invalid.error).toLowerCase().includes('corretagem'), '12. erro na tela diz sinal');
  assert(String(invalid.confirmBlockMessage).includes('preparação'), '12. preparação permanece na mensagem');

  const modal = readFileSync(
    resolve('components/map/CustomerLotFormModal.tsx'),
    'utf8',
  );
  const confirmStart = modal.indexOf('await onConfirm({');
  const confirmEnd = modal.indexOf('setSubmitting(false);', confirmStart);
  const payload = modal.slice(confirmStart, confirmEnd);
  assert(confirmStart > 0 && payload.includes('...formData'), '12. payload antigo preservado');
  assert(!payload.includes('separateSignal'), '12. estado novo não vai no payload');
  assert(!payload.includes('holdLotCharges'), '12. retenção não vai no payload');
  assert(!payload.includes('lotStartMode'), '12. início do lote não vai no payload');
  assert(modal.includes('if (separateSignalPreview.confirmBlocked)'), '12. submit interrompido');
  assert(modal.includes('Parcelar sinal separadamente das parcelas do lote'), '2. rótulo da opção');
  assert(modal.includes('enabled: separateSignalEnabled'), '2. interruptor vem de fora');
  assert(!modal.includes('RECANTO_SEPARATE_SIGNAL_ENABLED = true'), '1. modal não liga a flag');

  console.log('mandatory-recanto-separate-signal-form: ok');
}

main();
