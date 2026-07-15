/**
 * Testes obrigatórios — Correção da dupla contagem do sinal no financeiro.
 *
 * Bug: buildSaleEditFinancePayloads passava downPayment (líquido, após
 *      subtração do sinal) para resolveInstallmentPrincipal, causando
 *      principal = finalPrice - (grossEntry - signal) em vez de
 *      principal = finalPrice - grossEntry.
 *      Resultado: excesso de exatamente o valor do sinal na soma financeira.
 *
 * Correção: passar grossDownPayment para resolveInstallmentPrincipal.
 *
 * Execução: npx tsx scripts/mandatory-signal-double-count-fix-tests.ts
 */

import {
  buildSaleEditFinancePayloads,
  type FinanceReceiptPayload,
} from '@/lib/saleEditFinanceRecalc';
import {
  resolveInstallmentPrincipal,
  splitInstallmentAmounts,
  downPaymentReducesInstallmentBase,
} from '@/lib/saleInstallmentCalc';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function money(v: number): number {
  return Math.round(v * 100) / 100;
}

function sumAmounts(payloads: FinanceReceiptPayload[]): number {
  return money(payloads.reduce((s, p) => s + Number(p.amount || 0), 0));
}

function findByInstNumber(
  payloads: FinanceReceiptPayload[],
  n: number,
): FinanceReceiptPayload | undefined {
  return payloads.find((p) => p.installment_number === n);
}

function filterByInstRange(
  payloads: FinanceReceiptPayload[],
  min: number,
  max: number,
): FinanceReceiptPayload[] {
  return payloads.filter(
    (p) => p.installment_number >= min && p.installment_number <= max,
  );
}

function buildTestPayloads(overrides: Record<string, unknown>): FinanceReceiptPayload[] {
  const defaults: Record<string, unknown> = {
    payment_type: 'Parcelado',
    installments_count: '99',
    down_payment: '1150',
    down_payment_due_date: '2026-08-01',
    first_installment_due_date: '2026-09-01',
    final_value: 95000,
    reservation_signal_paid: 200,
  };
  const data = { ...defaults, ...overrides };
  return buildSaleEditFinancePayloads(
    'tenant-test',
    'sale-test',
    'customer-test',
    null,
    { id: 'lot-test', project_id: 'proj-test' },
    data as never,
    { contractModel: overrides.contractModel ?? 'PADRAO', cashInstallmentPaid: false },
  );
}

// ────────────────────────────────────────────────────────────────────
console.log('\n═══ TESTE 1: Venda padrão SEM sinal ═══');
{
  const payloads = buildTestPayloads({
    reservation_signal_paid: 0,
    down_payment: '5000',
    final_value: 100000,
    installments_count: '10',
  });
  const signal = findByInstNumber(payloads, -1);
  const entry = findByInstNumber(payloads, 0);
  const installments = filterByInstRange(payloads, 1, 999);
  const total = sumAmounts(payloads);

  assert(signal === undefined, 'Sem parcela de sinal');
  assert(entry !== undefined && entry.amount === 5000, `Entrada = R$ 5.000 (got ${entry?.amount})`);
  assert(installments.length === 10, `10 parcelas (got ${installments.length})`);
  const expectedPrincipal = 95000;
  const instSum = money(installments.reduce((s, p) => s + p.amount, 0));
  assert(instSum === expectedPrincipal, `Soma parcelas = R$ ${expectedPrincipal} (got ${instSum})`);
  assert(total === 100000, `Total = R$ 100.000 (got ${total})`);
}

// ────────────────────────────────────────────────────────────────────
console.log('\n═══ TESTE 2: Venda padrão COM sinal (caso 000000045/2026) ═══');
{
  const payloads = buildTestPayloads({
    reservation_signal_paid: 200,
    down_payment: '1150',
    final_value: 95000,
    installments_count: '99',
  });
  const signal = findByInstNumber(payloads, -1);
  const entry = findByInstNumber(payloads, 0);
  const installments = filterByInstRange(payloads, 1, 999);
  const total = sumAmounts(payloads);

  assert(signal !== undefined && signal.amount === 200, `Sinal = R$ 200 (got ${signal?.amount})`);
  assert(signal?.status === 'pago', `Sinal status = pago (got ${signal?.status})`);
  assert(entry !== undefined && entry.amount === 950, `Complemento entrada = R$ 950 (got ${entry?.amount})`);
  assert(installments.length === 99, `99 parcelas (got ${installments.length})`);

  const instSum = money(installments.reduce((s, p) => s + p.amount, 0));
  assert(instSum === 93850, `Soma parcelas = R$ 93.850 (got ${instSum})`);

  assert(total === 95000, `Total geral = R$ 95.000 (got ${total})`);

  const expectedParcel = money(93850 / 99);
  const firstParcel = installments[0]?.amount ?? 0;
  assert(
    firstParcel === expectedParcel,
    `Parcela base = R$ ${expectedParcel} (got ${firstParcel})`,
  );
}

// ────────────────────────────────────────────────────────────────────
console.log('\n═══ TESTE 3: Edição de venda padrão com sinal ═══');
{
  const payloads = buildTestPayloads({
    reservation_signal_paid: 500,
    down_payment: '3000',
    final_value: 80000,
    installments_count: '48',
  });
  const signal = findByInstNumber(payloads, -1);
  const entry = findByInstNumber(payloads, 0);
  const installments = filterByInstRange(payloads, 1, 999);
  const total = sumAmounts(payloads);

  assert(signal?.amount === 500, `Sinal = R$ 500 (got ${signal?.amount})`);
  assert(entry?.amount === 2500, `Complemento = R$ 2.500 (got ${entry?.amount})`);
  const expectedPrincipal = 77000;
  const instSum = money(installments.reduce((s, p) => s + p.amount, 0));
  assert(instSum === expectedPrincipal, `Soma parcelas = R$ ${expectedPrincipal} (got ${instSum})`);
  assert(total === 80000, `Total = R$ 80.000 (got ${total})`);
}

// ────────────────────────────────────────────────────────────────────
console.log('\n═══ TESTE 4: Sinal R$ 200, entrada R$ 1.150, complemento R$ 950 ═══');
{
  const payloads = buildTestPayloads({});
  const signal = findByInstNumber(payloads, -1);
  const entry = findByInstNumber(payloads, 0);
  assert(signal?.amount === 200, `Sinal = R$ 200`);
  assert(entry?.amount === 950, `Complemento = R$ 950`);
  assert(
    money(200 + 950) === 1150,
    `Sinal + complemento = R$ 1.150 (entrada bruta)`,
  );
}

// ────────────────────────────────────────────────────────────────────
console.log('\n═══ TESTE 5: sinal + entrada + parcelas = valor final ═══');
{
  const payloads = buildTestPayloads({});
  const total = sumAmounts(payloads);
  assert(
    total === 95000,
    `sinal + entrada + parcelas = R$ 95.000 (got ${total})`,
  );
}

// ────────────────────────────────────────────────────────────────────
console.log('\n═══ TESTE 6: Parcelas fecham exatamente o saldo financiado ═══');
{
  const payloads = buildTestPayloads({
    reservation_signal_paid: 300,
    down_payment: '2000',
    final_value: 50000,
    installments_count: '7',
  });
  const installments = filterByInstRange(payloads, 1, 999);
  const expectedPrincipal = 48000;
  const instSum = money(installments.reduce((s, p) => s + p.amount, 0));
  assert(instSum === expectedPrincipal, `Soma parcelas = R$ ${expectedPrincipal} (got ${instSum})`);
  assert(sumAmounts(payloads) === 50000, `Total geral = R$ 50.000`);
}

// ────────────────────────────────────────────────────────────────────
console.log('\n═══ TESTE 7: Ajuste de arredondamento na última parcela ═══');
{
  const payloads = buildTestPayloads({
    reservation_signal_paid: 100,
    down_payment: '1000',
    final_value: 100000,
    installments_count: '7',
  });
  const installments = filterByInstRange(payloads, 1, 999);
  const expectedPrincipal = 99000;
  const parBase = money(expectedPrincipal / 7);

  const firstSix = installments.slice(0, 6);
  const lastOne = installments[6];
  assert(
    firstSix.every((p) => p.amount === parBase),
    `Parcelas 1-6 = R$ ${parBase}`,
  );

  const expectedLast = money(expectedPrincipal - parBase * 6);
  assert(
    lastOne?.amount === expectedLast,
    `Última parcela (ajuste) = R$ ${expectedLast} (got ${lastOne?.amount})`,
  );

  const instSum = money(installments.reduce((s, p) => s + p.amount, 0));
  assert(instSum === expectedPrincipal, `Soma exata = R$ ${expectedPrincipal} (got ${instSum})`);
}

// ────────────────────────────────────────────────────────────────────
console.log('\n═══ TESTE 8: Parcelas pagas não são recriadas (planPartialFinanceRecalc) ═══');
{
  const { planPartialFinanceRecalc } = require('@/lib/saleEditFinanceRecalc') as typeof import('@/lib/saleEditFinanceRecalc');

  const existingReceipts = [
    { id: 'r-signal', installment_number: -1, amount: 200, status: 'pago', paid_at: '2026-01-01' },
    { id: 'r-entry', installment_number: 0, amount: 950, status: 'pago', paid_at: '2026-02-01' },
    { id: 'r1', installment_number: 1, amount: 950, status: 'pago', paid_at: '2026-03-01' },
    { id: 'r2', installment_number: 2, amount: 950, status: 'pendente' },
    { id: 'r3', installment_number: 3, amount: 950, status: 'pendente' },
  ];

  const newPayloads = buildTestPayloads({
    reservation_signal_paid: 200,
    down_payment: '1150',
    final_value: 95000,
    installments_count: '99',
  });

  const plan = planPartialFinanceRecalc(
    existingReceipts as never[],
    newPayloads,
    95000,
    { contractModel: 'PADRAO', grossDownPayment: 1150, paymentType: 'Parcelado' },
  );

  assert(plan.paid.length === 3, `3 parcelas pagas preservadas (got ${plan.paid.length})`);
  assert(
    plan.toInsert.every((p: FinanceReceiptPayload) => p.status === 'pendente'),
    'Inserções são somente pendentes',
  );
  assert(
    !plan.toInsert.some((p: FinanceReceiptPayload) =>
      plan.paidInstallmentNumbers.has(p.installment_number),
    ),
    'Nenhuma parcela paga é reinserida',
  );
}

// ────────────────────────────────────────────────────────────────────
console.log('\n═══ TESTE 9: Contrato exibe entrada bruta e saldo correto ═══');
{
  const principal = resolveInstallmentPrincipal({
    totalValue: 95000,
    downPayment: 1150,
    contractModel: 'PADRAO',
  });
  assert(principal === 93850, `Principal contrato = R$ 93.850 (got ${principal})`);

  const amounts = splitInstallmentAmounts(principal, 99);
  const sum = money(amounts.reduce((s, a) => s + a, 0));
  assert(sum === 93850, `Soma splitInstallmentAmounts = R$ 93.850 (got ${sum})`);
}

// ────────────────────────────────────────────────────────────────────
console.log('\n═══ TESTE 10: RECANTO_PRIMAVERA — comportamento preservado ═══');
{
  assert(
    downPaymentReducesInstallmentBase('RECANTO_PRIMAVERA') === false,
    'Recanto: entrada NÃO reduz base',
  );
  assert(
    downPaymentReducesInstallmentBase('PADRAO') === true,
    'Padrão: entrada reduz base',
  );

  const recantoPayloads = buildSaleEditFinancePayloads(
    'tenant-rec',
    'sale-rec',
    'customer-rec',
    null,
    { id: 'lot-rec', project_id: 'proj-rec' },
    {
      payment_type: 'Parcelado',
      installments_count: '12',
      down_payment: '3000',
      down_payment_due_date: '2026-08-01',
      first_installment_due_date: '2026-09-01',
      final_value: 60000,
      reservation_signal_paid: 0,
      signal_contract_value: '3000',
      signal_paid_at_sale: '3000',
      signal_remaining_payment_mode: '',
    } as never,
    { contractModel: 'RECANTO_PRIMAVERA', cashInstallmentPaid: false },
  );

  const recantoInstallments = recantoPayloads.filter(
    (p) => p.installment_number >= 1,
  );
  const recantoEntry = findByInstNumber(recantoPayloads, 0);

  const recantoPrincipal = resolveInstallmentPrincipal({
    totalValue: 60000,
    downPayment: 3000,
    contractModel: 'RECANTO_PRIMAVERA',
  });
  assert(
    recantoPrincipal === 60000,
    `Recanto principal = R$ 60.000 (sinal NÃO abate) (got ${recantoPrincipal})`,
  );

  const recantoInstSum = money(
    recantoInstallments.reduce((s, p) => s + p.amount, 0),
  );
  assert(
    recantoInstSum === 60000,
    `Recanto soma parcelas = R$ 60.000 (got ${recantoInstSum})`,
  );
}

// ────────────────────────────────────────────────────────────────────
console.log('\n═══ TESTE EXTRA: Sinal igual à entrada (complemento = 0) ═══');
{
  const payloads = buildTestPayloads({
    reservation_signal_paid: 1000,
    down_payment: '1000',
    final_value: 50000,
    installments_count: '10',
  });
  const signal = findByInstNumber(payloads, -1);
  const entry = findByInstNumber(payloads, 0);
  const installments = filterByInstRange(payloads, 1, 999);
  const total = sumAmounts(payloads);

  assert(signal?.amount === 1000, `Sinal = R$ 1.000`);
  assert(entry === undefined, `Sem parcela de complemento (entrada = sinal)`);
  const expectedPrincipal = 49000;
  const instSum = money(installments.reduce((s, p) => s + p.amount, 0));
  assert(instSum === expectedPrincipal, `Soma parcelas = R$ ${expectedPrincipal} (got ${instSum})`);
  assert(total === 50000, `Total = R$ 50.000 (got ${total})`);
}

// ────────────────────────────────────────────────────────────────────
console.log('\n═══ TESTE EXTRA: Sinal maior que entrada informada ═══');
{
  const payloads = buildTestPayloads({
    reservation_signal_paid: 2000,
    down_payment: '1500',
    final_value: 50000,
    installments_count: '10',
  });
  const signal = findByInstNumber(payloads, -1);
  const entry = findByInstNumber(payloads, 0);
  const installments = filterByInstRange(payloads, 1, 999);
  const total = sumAmounts(payloads);

  assert(signal?.amount === 2000, `Sinal = R$ 2.000`);
  assert(entry === undefined, `Sem complemento (sinal > entrada)`);
  const expectedPrincipal = 48500;
  const instSum = money(installments.reduce((s, p) => s + p.amount, 0));
  assert(instSum === expectedPrincipal, `Soma parcelas = R$ ${expectedPrincipal} (got ${instSum})`);
  assert(total === 50500, `Total = R$ 50.500 (sinal excede entrada) (got ${total})`);
}

// ════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════');
console.log(`RESULTADO: ${passed} passou, ${failed} falhou`);
if (failed > 0) {
  console.error('❌ TESTES FALHARAM');
  process.exit(1);
} else {
  console.log('✅ TODOS OS TESTES PASSARAM');
  process.exit(0);
}
