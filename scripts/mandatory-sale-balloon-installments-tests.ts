/**
 * Parcelas balão — camada opcional sem regressão no parcelamento padrão.
 * npx tsx scripts/mandatory-sale-balloon-installments-tests.ts
 * npm run test:sale-balloon
 */

import type { LotFormConfirmPayload } from '../components/map/CustomerLotFormModal';
import { buildSaleEditFinancePayloads } from '../lib/saleEditFinanceRecalc';
import {
  resolveInstallmentPrincipal,
  splitInstallmentAmounts,
} from '../lib/saleInstallmentCalc';
import {
  applyBalloonToInstallmentAmounts,
  BALLOON_EDIT_LOCKED_MESSAGE,
  BALLOON_FINANCE_MISMATCH_MESSAGE,
  BALLOON_MIGRATION_REQUIRED_MESSAGE,
  buildBalloonFinancePreview,
  resolveSaleBalloonPlan,
  toCents,
  validateSaleBalloonConfiguration,
  type SaleBalloonFormConfig,
} from '../lib/saleBalloonInstallments';
import { buildSaleContractClauseQuartaHtml } from '../lib/saleContractLegalTemplate';
import {
  buildSaleContractInstallmentScheduleHtml,
  hasVariableInstallmentAmounts,
} from '../lib/saleContractPaymentSummary';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function baseForm(overrides: Partial<LotFormConfirmPayload> = {}): LotFormConfirmPayload {
  return {
    name: 'Cliente',
    cpf_cnpj: '12345678901',
    payment_type: 'Parcelado',
    discount_value: '0',
    down_payment: '0',
    down_payment_due_date: '',
    installments_count: '36',
    first_installment_due_date: '2026-08-01',
    broker_id: '',
    notes: '',
    financial_account_id: '',
    installment_correction_type: 'NONE',
    lot_value: 180000,
    final_value: 180000,
    installment_value: 5000,
    use_balloon_installments: false,
    balloon_config: null,
    ...overrides,
  } as LotFormConfirmPayload;
}

function payloadsFor(form: LotFormConfirmPayload) {
  return buildSaleEditFinancePayloads(
    't1',
    's1',
    'c1',
    null,
    { id: 'b1', project_id: 'p1' },
    form,
    { contractModel: 'PADRAO' },
  );
}

function monthlyAmounts(form: LotFormConfirmPayload) {
  return payloadsFor(form)
    .filter((p) => Number(p.installment_number) >= 1)
    .map((p) => Number(p.amount));
}

// ─── A. Sem balão ───────────────────────────────────────────────

function testWithoutBalloonMatchesCurrentSplit() {
  const principal = 180000;
  const count = 36;
  const classic = splitInstallmentAmounts(principal, count);
  const balloonOff = applyBalloonToInstallmentAmounts(principal, count, {
    enabled: false,
    mode: 'MANUAL',
    items: [],
  });
  assert(balloonOff.length === classic.length, 'mesma quantidade');
  for (let i = 0; i < classic.length; i++) {
    assert(balloonOff[i].amount === classic[i], `parcela ${i + 1} idêntica`);
    assert(balloonOff[i].balloonAddonAmount === 0, `sem addon ${i + 1}`);
  }

  const a = monthlyAmounts(baseForm());
  const b = monthlyAmounts(baseForm({ use_balloon_installments: false }));
  assert(a.length === b.length, 'mesmo número');
  for (let i = 0; i < a.length; i++) {
    assert(a[i] === b[i], `receipt ${i} igual`);
  }
  console.log('OK testWithoutBalloonMatchesCurrentSplit');
}

// ─── B. Manual ──────────────────────────────────────────────────

function testTwoManualBalloons() {
  const principal = 180000;
  const count = 36;
  const plan = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: count,
    contractValue: principal,
    config: {
      mode: 'MANUAL',
      manualRows: [
        { installmentNumber: '12', additionalAmount: '20000' },
        { installmentNumber: '24', additionalAmount: '30000' },
      ],
    },
  });
  assert(plan.items.length === 2, '2 balões');
  const comps = applyBalloonToInstallmentAmounts(principal, count, plan);
  assert(comps[11].amount === money(comps[11].baseAmount + 20000), 'parcela 12 +20k');
  assert(comps[23].amount === money(comps[23].baseAmount + 30000), 'parcela 24 +30k');
  assert(comps[0].amount === comps[0].baseAmount, 'parcela 1 sem balão');
  const sum = money(comps.reduce((s, c) => s + c.amount, 0));
  assert(sum === principal, `soma = principal (${sum})`);
  console.log('OK testTwoManualBalloons');
}

function testOneManualBalloon() {
  const plan = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: 24,
    contractValue: 100000,
    config: {
      mode: 'MANUAL',
      manualRows: [{ installmentNumber: '12', additionalAmount: '15000' }],
    },
  });
  const comps = applyBalloonToInstallmentAmounts(100000, 24, plan);
  assert(comps[11].balloonAddonAmount === 15000, 'addon 15k');
  assert(money(comps.reduce((s, c) => s + c.amount, 0)) === 100000, 'fecha');
  console.log('OK testOneManualBalloon');
}

function testDuplicateManualRejected() {
  const result = validateSaleBalloonConfiguration({
    plan: resolveSaleBalloonPlan({
      useBalloon: true,
      installmentsCount: 36,
      contractValue: 180000,
      config: {
        mode: 'MANUAL',
        manualRows: [
          { installmentNumber: '12', additionalAmount: '10000' },
          { installmentNumber: '12', additionalAmount: '5000' },
        ],
      },
    }),
    paymentType: 'Parcelado',
    installmentsCount: 36,
    principal: 180000,
    finalValue: 180000,
    entryAmount: 0,
  });
  assert(!result.valid, 'duplicata rejeitada');
  assert(
    !result.valid && result.message.includes('duas configurações'),
    'mensagem duplicata',
  );
  console.log('OK testDuplicateManualRejected');
}

function testOutOfRangeRejected() {
  const result = validateSaleBalloonConfiguration({
    plan: resolveSaleBalloonPlan({
      useBalloon: true,
      installmentsCount: 12,
      contractValue: 50000,
      config: {
        mode: 'MANUAL',
        manualRows: [{ installmentNumber: '24', additionalAmount: '1000' }],
      },
    }),
    paymentType: 'Parcelado',
    installmentsCount: 12,
    principal: 50000,
    finalValue: 50000,
    entryAmount: 0,
  });
  assert(!result.valid, 'fora do limite');
  console.log('OK testOutOfRangeRejected');
}

// ─── C. Final ───────────────────────────────────────────────────

function testFinalBalloon() {
  const principal = 100000;
  const count = 24;
  const plan = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: count,
    contractValue: 100000,
    config: {
      mode: 'FINAL',
      finalUseLast: true,
      finalAmountMode: 'VALUE',
      finalValue: '80000',
    },
  });
  assert(plan.items[0]?.installmentNumber === 24, 'última parcela');
  const comps = applyBalloonToInstallmentAmounts(principal, count, plan);
  assert(comps[23].balloonAddonAmount === 80000, 'addon na última');
  assert(money(comps.reduce((s, c) => s + c.amount, 0)) === principal, 'soma');
  console.log('OK testFinalBalloon');
}

function testFinalPercentBalloon() {
  const plan = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: 36,
    contractValue: 200000,
    config: {
      mode: 'FINAL',
      finalUseLast: true,
      finalAmountMode: 'PERCENT',
      finalPercent: '25',
    },
  });
  assert(plan.items[0]?.additionalAmount === 50000, '25% = 50k');
  assert(plan.items[0]?.installmentNumber === 36, 'última');
  console.log('OK testFinalPercentBalloon');
}

function testFinalPercentInvalid() {
  const zero = validateSaleBalloonConfiguration({
    plan: {
      enabled: true,
      mode: 'FINAL',
      items: [],
      config: {
        mode: 'FINAL',
        finalUseLast: true,
        finalAmountMode: 'PERCENT',
        finalPercent: '0',
      },
    },
    paymentType: 'Parcelado',
    installmentsCount: 12,
    principal: 10000,
    finalValue: 10000,
  });
  assert(!zero.valid, 'percent 0 rejeitado');

  const over = validateSaleBalloonConfiguration({
    plan: {
      enabled: true,
      mode: 'FINAL',
      items: [],
      config: {
        mode: 'FINAL',
        finalUseLast: true,
        finalAmountMode: 'PERCENT',
        finalPercent: '120',
      },
    },
    paymentType: 'Parcelado',
    installmentsCount: 12,
    principal: 10000,
    finalValue: 10000,
  });
  assert(!over.valid, 'percent >100 rejeitado');
  console.log('OK testFinalPercentInvalid');
}

// ─── D. Recorrente ──────────────────────────────────────────────

function testRecurrentAnnualBalloons() {
  const principal = 200000;
  const count = 60;
  const plan = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: count,
    contractValue: principal,
    config: {
      mode: 'RECURRENT',
      recurrentEnabled: true,
      recurrentIntervalMonths: 12,
      recurrentQuantity: '5',
      recurrentValue: '15000',
    },
  });
  assert(
    plan.items.map((i) => i.installmentNumber).join(',') === '12,24,36,48,60',
    'anuais',
  );
  const comps = applyBalloonToInstallmentAmounts(principal, count, plan);
  assert(money(comps.reduce((s, c) => s + c.amount, 0)) === principal, 'soma');
  console.log('OK testRecurrentAnnualBalloons');
}

function testRecurrentSemestral() {
  const plan = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: 24,
    contractValue: 120000,
    config: {
      mode: 'RECURRENT',
      recurrentEnabled: true,
      recurrentIntervalMonths: 6,
      recurrentQuantity: '4',
      recurrentValue: '5000',
    },
  });
  assert(
    plan.items.map((i) => i.installmentNumber).join(',') === '6,12,18,24',
    'semestral',
  );
  console.log('OK testRecurrentSemestral');
}

function testRecurrent18And24() {
  const p18 = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: 54,
    contractValue: 100000,
    config: {
      mode: 'RECURRENT',
      recurrentEnabled: true,
      recurrentIntervalMonths: 18,
      recurrentQuantity: '3',
      recurrentValue: '10000',
    },
  });
  assert(p18.items.map((i) => i.installmentNumber).join(',') === '18,36,54', '18m');

  const p24 = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: 48,
    contractValue: 100000,
    config: {
      mode: 'RECURRENT',
      recurrentEnabled: true,
      recurrentIntervalMonths: 24,
      recurrentQuantity: '2',
      recurrentValue: '20000',
    },
  });
  assert(p24.items.map((i) => i.installmentNumber).join(',') === '24,48', '24m');
  console.log('OK testRecurrent18And24');
}

function testRecurrentExceedsLimit() {
  const result = validateSaleBalloonConfiguration({
    plan: {
      enabled: true,
      mode: 'RECURRENT',
      items: [],
      config: {
        mode: 'RECURRENT',
        recurrentEnabled: true,
        recurrentIntervalMonths: 12,
        recurrentQuantity: '10',
        recurrentValue: '1000',
      },
    },
    paymentType: 'Parcelado',
    installmentsCount: 36,
    principal: 100000,
    finalValue: 100000,
  });
  assert(!result.valid, 'recorrência acima do limite');
  assert(
    !result.valid && result.message.includes('acima do limite'),
    'mensagem limite',
  );
  console.log('OK testRecurrentExceedsLimit');
}

// ─── E. Combinações financeiras ─────────────────────────────────

function testEntryPlusBalloon() {
  const finalValue = 180000;
  const entry = 10000;
  const principal = resolveInstallmentPrincipal({
    totalValue: finalValue,
    downPayment: entry,
    contractModel: 'PADRAO',
  });
  assert(principal === 170000, 'principal após entrada');

  const config: SaleBalloonFormConfig = {
    mode: 'MANUAL',
    manualRows: [
      { installmentNumber: '12', additionalAmount: '20000' },
      { installmentNumber: '24', additionalAmount: '30000' },
    ],
  };
  const plan = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: 36,
    contractValue: finalValue,
    config,
  });
  const preview = buildBalloonFinancePreview({
    finalValue,
    entryAmount: entry,
    principal,
    installmentsCount: 36,
    plan,
  });
  assert(preview.balloonTotal === 50000, 'balões 50k');
  assert(preview.parcelableBalance === 120000, 'saldo 120k');
  assert(preview.totalsMatch, 'fecha entrada+parcelas');
  assert(toCents(preview.grandTotal) === toCents(finalValue), 'grand = final');

  const payloads = payloadsFor(
    baseForm({
      final_value: finalValue,
      lot_value: finalValue,
      down_payment: '10000',
      down_payment_due_date: '2026-07-15',
      use_balloon_installments: true,
      balloon_config: config,
    }),
  );
  const entryRow = payloads.find((p) => Number(p.installment_number) === 0);
  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  assert(Number(entryRow?.amount) === 10000, 'entrada 10k');
  assert(
    money(monthly.reduce((s, p) => s + Number(p.amount), 0)) === 170000,
    'parcelas = principal',
  );
  console.log('OK testEntryPlusBalloon');
}

function testDiscountPlusBalloon() {
  // lote 200k, desconto 20k → final 180k; balões 50k
  const form = baseForm({
    lot_value: 200000,
    discount_value: '20000',
    final_value: 180000,
    use_balloon_installments: true,
    balloon_config: {
      mode: 'MANUAL',
      manualRows: [
        { installmentNumber: '12', additionalAmount: '20000' },
        { installmentNumber: '24', additionalAmount: '30000' },
      ],
    },
  });
  const monthly = monthlyAmounts(form);
  assert(money(monthly.reduce((s, a) => s + a, 0)) === 180000, 'não subtrai desconto 2x');
  console.log('OK testDiscountPlusBalloon');
}

function testEntryDiscountBalloon() {
  const finalValue = 170000; // 200k - 30k desconto
  const entry = 20000;
  const principal = 150000;
  const plan = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: 30,
    contractValue: finalValue,
    config: {
      mode: 'MANUAL',
      manualRows: [{ installmentNumber: '15', additionalAmount: '30000' }],
    },
  });
  const preview = buildBalloonFinancePreview({
    finalValue,
    entryAmount: entry,
    principal,
    installmentsCount: 30,
    plan,
  });
  assert(preview.parcelableBalance === 120000, '150k-30k');
  assert(preview.totalsMatch, 'fecha');
  assert(toCents(preview.grandTotal) === toCents(finalValue), 'grand');
  console.log('OK testEntryDiscountBalloon');
}

function testRoundingCents() {
  // 100000.03 / 3 com balão 0.01 na parcela 2
  const principal = 100000.03;
  const plan = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: 3,
    contractValue: principal,
    config: {
      mode: 'MANUAL',
      manualRows: [{ installmentNumber: '2', additionalAmount: '10000.01' }],
    },
  });
  const comps = applyBalloonToInstallmentAmounts(principal, 3, plan);
  const sum = money(comps.reduce((s, c) => s + c.amount, 0));
  assert(Math.abs(toCents(sum) - toCents(principal)) <= 1, 'arredondamento ok');
  console.log('OK testRoundingCents');
}

function testCashSaleRejectsBalloon() {
  const result = validateSaleBalloonConfiguration({
    plan: {
      enabled: true,
      mode: 'MANUAL',
      items: [{ installmentNumber: 1, additionalAmount: 1000 }],
      config: {
        mode: 'MANUAL',
        manualRows: [{ installmentNumber: '1', additionalAmount: '1000' }],
      },
    },
    paymentType: 'À vista',
    installmentsCount: 1,
    principal: 10000,
    finalValue: 10000,
  });
  assert(!result.valid, 'à vista bloqueado');
  console.log('OK testCashSaleRejectsBalloon');
}

function testBalloonEqualsPrincipalRejected() {
  const result = validateSaleBalloonConfiguration({
    plan: resolveSaleBalloonPlan({
      useBalloon: true,
      installmentsCount: 12,
      contractValue: 10000,
      config: {
        mode: 'MANUAL',
        manualRows: [{ installmentNumber: '6', additionalAmount: '10000' }],
      },
    }),
    paymentType: 'Parcelado',
    installmentsCount: 12,
    principal: 10000,
    finalValue: 10000,
    entryAmount: 0,
  });
  assert(!result.valid, 'balão = principal rejeitado');
  console.log('OK testBalloonEqualsPrincipalRejected');
}

function testValidationRejectsOverPrincipal() {
  const plan = resolveSaleBalloonPlan({
    useBalloon: true,
    installmentsCount: 12,
    contractValue: 10000,
    config: {
      mode: 'MANUAL',
      manualRows: [{ installmentNumber: '6', additionalAmount: '15000' }],
    },
  });
  const result = validateSaleBalloonConfiguration({
    plan,
    paymentType: 'Parcelado',
    installmentsCount: 12,
    principal: 10000,
    finalValue: 10000,
  });
  assert(!result.valid, 'deve rejeitar balão > principal');
  console.log('OK testValidationRejectsOverPrincipal');
}

function testDueDateBeforeSaleRejected() {
  const result = validateSaleBalloonConfiguration({
    plan: {
      enabled: true,
      mode: 'MANUAL',
      items: [{ installmentNumber: 6, additionalAmount: 1000, dueDate: '2020-01-01' }],
      config: {
        mode: 'MANUAL',
        manualRows: [
          {
            installmentNumber: '6',
            additionalAmount: '1000',
            dueDate: '2020-01-01',
          },
        ],
      },
    },
    paymentType: 'Parcelado',
    installmentsCount: 12,
    principal: 50000,
    finalValue: 50000,
    saleDateIso: '2026-07-09',
  });
  assert(!result.valid, 'data anterior rejeitada');
  console.log('OK testDueDateBeforeSaleRejected');
}

// ─── F. Mensagens / lock ────────────────────────────────────────

function testLockAndMigrationMessages() {
  assert(
    BALLOON_EDIT_LOCKED_MESSAGE.includes('cobranças geradas'),
    'mensagem lock',
  );
  assert(
    BALLOON_MIGRATION_REQUIRED_MESSAGE.includes('não estão disponíveis'),
    'mensagem migration',
  );
  assert(
    BALLOON_FINANCE_MISMATCH_MESSAGE.includes('não corresponde'),
    'mensagem mismatch',
  );
  console.log('OK testLockAndMigrationMessages');
}

// ─── G. Contrato ────────────────────────────────────────────────

function testContractClauseVariableInstallments() {
  const equal = buildSaleContractClauseQuartaHtml({
    isCash: false,
    valorTotalFmt: 'R$ 100,00',
    valorTotalExtenso: 'cem reais',
    valorEntradaFmt: 'R$ 0,00',
    valorEntradaExtenso: 'zero reais',
    qtdParcelas: 12,
    valorParcelaFmt: 'R$ 8,33',
    valorParcelaExtenso: 'oito reais',
    dataPrimeiraParcelaFmt: '01/01/2026',
    dataUltimaParcelaFmt: '01/12/2026',
  });
  assert(equal.includes('parcelas iguais'), 'sem balão: texto iguais');

  const variable = buildSaleContractClauseQuartaHtml({
    isCash: false,
    valorTotalFmt: 'R$ 100,00',
    valorTotalExtenso: 'cem reais',
    valorEntradaFmt: 'R$ 0,00',
    valorEntradaExtenso: 'zero reais',
    qtdParcelas: 12,
    valorParcelaFmt: 'R$ 5,00',
    valorParcelaExtenso: 'cinco reais',
    dataPrimeiraParcelaFmt: '01/01/2026',
    dataUltimaParcelaFmt: '01/12/2026',
    hasVariableInstallments: true,
  });
  assert(!variable.includes('parcelas iguais'), 'com balão: sem iguais');
  assert(
    variable.toLowerCase().includes('quadro financeiro'),
    'referencia quadro',
  );

  const schedule = buildSaleContractInstallmentScheduleHtml([
    { installmentNumber: 1, amount: 1000, dueDate: '2026-08-01' },
    { installmentNumber: 12, amount: 21000, dueDate: '2027-07-01' },
  ]);
  assert(schedule.includes('(balão)'), 'marca parcela balão');
  assert(schedule.includes('Total das parcelas'), 'total no quadro');

  assert(
    hasVariableInstallmentAmounts([
      { installmentNumber: 1, amount: 100 },
      { installmentNumber: 2, amount: 100 },
    ]) === false,
    'iguais → false',
  );
  assert(
    hasVariableInstallmentAmounts([
      { installmentNumber: 1, amount: 100 },
      { installmentNumber: 12, amount: 500 },
    ]) === true,
    'variáveis → true',
  );
  console.log('OK testContractClauseVariableInstallments');
}

function testFinancePayloadsWithBalloon() {
  const config: SaleBalloonFormConfig = {
    mode: 'MANUAL',
    manualRows: [
      { installmentNumber: '12', additionalAmount: '20000' },
      { installmentNumber: '24', additionalAmount: '30000' },
    ],
  };
  const payloads = payloadsFor(
    baseForm({
      use_balloon_installments: true,
      balloon_config: config,
      down_payment: '0',
    }),
  );
  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  assert(monthly.length === 36, '36 parcelas');
  const p12 = monthly.find((p) => Number(p.installment_number) === 12)!;
  const p1 = monthly.find((p) => Number(p.installment_number) === 1)!;
  assert(Number(p12.amount) > Number(p1.amount), '12 maior que base');
  const sum = money(monthly.reduce((s, p) => s + Number(p.amount), 0));
  assert(sum === 180000, `soma receipts = 180000 (${sum})`);
  console.log('OK testFinancePayloadsWithBalloon');
}

function main() {
  testWithoutBalloonMatchesCurrentSplit();
  testOneManualBalloon();
  testTwoManualBalloons();
  testDuplicateManualRejected();
  testOutOfRangeRejected();
  testFinalBalloon();
  testFinalPercentBalloon();
  testFinalPercentInvalid();
  testRecurrentAnnualBalloons();
  testRecurrentSemestral();
  testRecurrent18And24();
  testRecurrentExceedsLimit();
  testEntryPlusBalloon();
  testDiscountPlusBalloon();
  testEntryDiscountBalloon();
  testRoundingCents();
  testCashSaleRejectsBalloon();
  testBalloonEqualsPrincipalRejected();
  testValidationRejectsOverPrincipal();
  testDueDateBeforeSaleRejected();
  testLockAndMigrationMessages();
  testContractClauseVariableInstallments();
  testFinancePayloadsWithBalloon();
  console.log('mandatory-sale-balloon-installments-tests: all passed');
}

main();
