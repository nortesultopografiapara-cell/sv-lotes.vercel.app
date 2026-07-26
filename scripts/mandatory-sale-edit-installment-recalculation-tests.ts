/**
 * Recálculo de parcelas na edição de venda.
 * npx tsx scripts/mandatory-sale-edit-installment-recalculation-tests.ts
 */

import type { LotFormConfirmPayload } from '../components/map/CustomerLotFormModal';
import {
  buildSaleEditFinancePayloads,
  FINANCE_SCHEDULE_EDIT_LOCKED_MESSAGE,
  isPaidFinanceReceipt,
  isPendingFinanceReceipt,
  planFullFinanceRecalc,
  planPartialFinanceRecalc,
  resolveFinanceScheduleEditLock,
  simulateSaleFinanceEditReplace,
  type FinanceReceiptRow,
} from '../lib/saleEditFinanceRecalc';
import { expectedSaleFinanceTotal } from '../lib/saleInstallmentCalc';
import { generateContractHTML } from '../lib/contractTemplate';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const baseForm = (): LotFormConfirmPayload => ({
  ...({
    name: 'Cliente',
    cpf_cnpj: '12345678901',
    payment_type: 'Parcelado',
    discount_value: '0',
    down_payment: '10000',
    down_payment_due_date: '2026-02-01',
    installments_count: '4',
    first_installment_due_date: '2026-03-01',
    broker_id: '',
    notes: '',
    reservation_signal_paid: 0,
  } as LotFormConfirmPayload),
  lot_value: 100000,
  final_value: 100000,
  installment_value: 22500,
});

const lot = { id: 'block-1', project_id: 'proj-1' };

function receipt(
  id: string,
  installment: number,
  amount: number,
  status: string,
  paidAt: string | null = null,
): FinanceReceiptRow {
  return {
    id,
    installment_number: installment,
    amount,
    status,
    paid_at: paidAt,
  };
}

function testNoPaidFullRecalc() {
  const form = baseForm();
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
  );
  const plan = planFullFinanceRecalc(payloads);
  assert(plan.toInsert.length === 5, 'entrada + 4 parcelas');
  assert(
    plan.toInsert.filter((p) => p.status === 'pendente').length === 5,
    'todas pendentes',
  );
  console.log('OK testNoPaidFullRecalc');
}

function testPaidEntryPreservesAndRecalcsPending() {
  const receipts = [
    receipt('e0', 0, 10000, 'pago', '2026-01-10T00:00:00Z'),
    receipt('p1', 1, 20000, 'pendente'),
    receipt('p2', 2, 20000, 'pendente'),
    receipt('p3', 3, 20000, 'pendente'),
    receipt('p4', 4, 20000, 'pendente'),
  ];
  const form = { ...baseForm(), final_value: 90000, installments_count: '3' };
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
  );
  const plan = planPartialFinanceRecalc(receipts, payloads, form.final_value);
  assert(plan.paid.length === 1, 'preserva entrada paga');
  assert(plan.paid[0].id === 'e0', 'entrada paga mantida');
  assert(plan.pending.length === 4, '4 parcelas pendentes');
  assert(plan.toDeleteIds.length === 4, 'remove pendentes antigas');
  assert(plan.toInsert.length === 3, 'insere 3 novas parcelas');
  assert(
    !plan.toInsert.some((p) => p.installment_number === 0),
    'não reinsere entrada paga',
  );
  const inst1 = plan.toInsert.find((p) => p.installment_number === 1);
  assert(inst1 != null, 'parcela 1 recalculada');
  assert(
    Math.abs(Number(inst1?.amount) - 26666.67) < 0.02,
    `valor parcela 1 esperado ~26666.67, got ${inst1?.amount}`,
  );
  console.log('OK testPaidEntryPreservesAndRecalcsPending');
}

function testPaidFirstInstallmentPreservesAndRecalcsOpen() {
  const receipts = [
    receipt('e0', 0, 10000, 'pendente'),
    receipt('p1', 1, 22500, 'PAGO', '2026-02-01T00:00:00Z'),
    receipt('p2', 2, 22500, 'pendente'),
    receipt('p3', 3, 22500, 'pendente'),
    receipt('p4', 4, 22500, 'pendente'),
  ];
  const form = { ...baseForm(), discount_value: '10000', final_value: 90000 };
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
  );
  const plan = planPartialFinanceRecalc(receipts, payloads, form.final_value);
  assert(plan.paid.length === 1, 'parcela 1 paga');
  assert(plan.paidInstallmentNumbers.has(1), 'número 1 preservado');
  assert(plan.toDeleteIds.includes('e0'), 'entrada pendente removida');
  assert(plan.toDeleteIds.includes('p2'), 'parcela 2 pendente removida');
  assert(!plan.toDeleteIds.includes('p1'), 'parcela 1 paga não removida');
  assert(
    !plan.toInsert.some((p) => p.installment_number === 1),
    'não reinsere parcela 1 paga',
  );
  assert(plan.toInsert.length === 4, 'entrada + parcelas 2-4');
  console.log('OK testPaidFirstInstallmentPreservesAndRecalcsOpen');
}

function testChangeInstallmentCount() {
  const receipts = [
    receipt('p1', 1, 18000, 'paid', '2026-01-01T00:00:00Z'),
    ...Array.from({ length: 11 }, (_, i) =>
      receipt(`p${i + 2}`, i + 2, 18000, 'pendente'),
    ),
  ];
  const form = { ...baseForm(), installments_count: '6', final_value: 100000 };
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
  );
  const plan = planPartialFinanceRecalc(receipts, payloads, form.final_value);
  assert(plan.toDeleteIds.length === 11, 'remove 11 pendentes');
  assert(plan.toInsert.length === 6, 'cria parcelas 2-6 (1 paga preservada)');
  assert(
    !plan.toInsert.some((p) => p.installment_number === 1),
    'parcela 1 paga preservada',
  );
  console.log('OK testChangeInstallmentCount');
}

function testChangeFirstInstallmentDueDate() {
  const receipts = [
    receipt('p1', 1, 22500, 'pendente'),
    receipt('p2', 2, 22500, 'pendente'),
  ];
  const form = {
    ...baseForm(),
    down_payment: '0',
    down_payment_due_date: '',
    first_installment_due_date: '2026-06-15',
    installments_count: '2',
  };
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
  );
  const plan = planPartialFinanceRecalc(receipts, payloads, form.final_value);
  assert(plan.toInsert.length === 2, 'duas parcelas novas');
  assert(
    plan.toInsert[0].due_date === '2026-06-15',
    `1ª parcela em 2026-06-15, got ${plan.toInsert[0].due_date}`,
  );
  assert(
    plan.toInsert[1].due_date === '2026-07-15',
    `2ª parcela em 2026-07-15, got ${plan.toInsert[1].due_date}`,
  );
  console.log('OK testChangeFirstInstallmentDueDate');
}

function testPaidStatusVariants() {
  assert(isPaidFinanceReceipt({ status: 'PAGO', paid_at: null }), 'PAGO');
  assert(isPaidFinanceReceipt({ status: 'paid', paid_at: null }), 'paid');
  assert(isPaidFinanceReceipt({ status: 'pago', paid_at: null }), 'pago');
  assert(
    isPaidFinanceReceipt({ status: 'pendente', paid_at: '2026-01-01' }),
    'paid_at define pago',
  );
  assert(!isPaidFinanceReceipt({ status: 'pendente', paid_at: null }), 'pendente');
  assert(!isPaidFinanceReceipt({ status: 'PENDENTE', paid_at: null }), 'PENDENTE');
  assert(!isPendingFinanceReceipt(receipt('c1', 1, 100, 'cancelado')), 'cancelado');
  assert(isPendingFinanceReceipt(receipt('a1', 1, 100, 'atrasado')), 'atrasado pendente');
  console.log('OK testPaidStatusVariants');
}

function testInstallmentNumberCoercion() {
  const receipts = [
    { ...receipt('p1', 1, 100, 'pago', '2026-01-01'), installment_number: '1' },
    receipt('p2', 2, 100, 'pendente'),
  ];
  const form = baseForm();
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
  );
  const plan = planPartialFinanceRecalc(receipts, payloads, form.final_value);
  assert(plan.paidInstallmentNumbers.has(1), 'coerção string→number');
  assert(
    !plan.toInsert.some((p) => p.installment_number === 1),
    'não duplica parcela 1 paga',
  );
  console.log('OK testInstallmentNumberCoercion');
}

function testPendingEntryRecalculatedWhenNotPaid() {
  const receipts = [
    receipt('e0', 0, 5000, 'pendente'),
    receipt('p1', 1, 20000, 'pendente'),
  ];
  const form = { ...baseForm(), down_payment: '15000' };
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
  );
  const plan = planPartialFinanceRecalc(receipts, payloads, form.final_value);
  assert(plan.paid.length === 0, 'nenhuma paga');
  assert(plan.toDeleteIds.length === 2, 'remove entrada e parcela pendentes');
  const entry = plan.toInsert.find((p) => p.installment_number === 0);
  assert(entry != null, 'recria entrada');
  assert(Number(entry?.amount) === 15000, 'entrada com novo valor');
  console.log('OK testPendingEntryRecalculatedWhenNotPaid');
}

function receiptsFromPayloads(
  payloads: ReturnType<typeof buildSaleEditFinancePayloads>,
  prefix: string,
): FinanceReceiptRow[] {
  return payloads.map((p, i) => ({
    id: `${prefix}-${i}`,
    installment_number: Number(p.installment_number),
    amount: Number(p.amount),
    status: String(p.status || 'pendente'),
    paid_at: p.paid_at ? String(p.paid_at) : null,
  }));
}

function assertUniqueInstallmentNumbers(nums: number[], msg: string) {
  assert(new Set(nums).size === nums.length, msg);
}

/** BY_COUNT → FIXED_AMOUNT (+ residual) sem parcelas mensais pagas. */
function testRecantoEditByCountToFixedNoDuplicates() {
  const LOT = 73296.99;
  const SIGNAL = 3500;
  const PAID_SIGNAL = 1750;
  const byCountForm = {
    ...baseForm(),
    lot_value: LOT,
    final_value: LOT,
    down_payment: String(SIGNAL),
    signal_contract_value: String(SIGNAL),
    signal_paid_at_sale: String(PAID_SIGNAL),
    signal_remaining_payment_mode: 'FIRST_INSTALLMENTS' as const,
    signal_remaining_installments: '20',
    installments_count: '122',
    installment_definition_mode: 'BY_COUNT',
    regular_installment_amount: '',
    generate_residual_installment: false,
  };
  const byCountPayloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-edit-1',
    'cust-1',
    null,
    lot,
    byCountForm,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );
  const existing = receiptsFromPayloads(byCountPayloads, 'old').map((r) =>
    Number(r.installment_number) === 0
      ? { ...r, status: 'pago', paid_at: '2026-01-01T00:00:00Z' }
      : r,
  );
  assert(
    existing.filter((r) => Number(r.installment_number) >= 1).length === 122,
    'BY_COUNT gera 122 mensais',
  );

  const fixedForm = {
    ...byCountForm,
    installment_definition_mode: 'FIXED_AMOUNT',
    regular_installment_amount: '597.97',
    generate_residual_installment: true,
  };
  const fixedPayloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-edit-1',
    'cust-1',
    null,
    lot,
    fixedForm,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );
  const sim = simulateSaleFinanceEditReplace({
    existing,
    newPayloads: fixedPayloads,
    finalValue: LOT,
    options: {
      contractModel: 'RECANTO_PRIMAVERA',
      grossDownPayment: SIGNAL,
      paymentType: 'Parcelado',
    },
  });

  assert(sim.mode === 'partial', 'sinal pago → partial');
  assert(sim.keptPaid.length === 1, 'preserva só sinal pago');
  assert(Number(sim.keptPaid[0]!.installment_number) === 0, 'sinal = 0');
  assert(sim.deletedIds.length === 122, 'remove 122 mensais antigas');
  assert(sim.inserted.length === 123, 'insere 122 + residual');
  assertUniqueInstallmentNumbers(
    sim.resultingInstallmentNumbers,
    'sem installment_number duplicado após FIXED',
  );
  assert(
    sim.resultingInstallmentNumbers.filter((n) => n >= 1).length === 123,
    '123 vencimentos mensais',
  );
  assert(
    sim.inserted.filter((p) => Number(p.installment_number) === 123).length === 1,
    'residual #123 uma única vez',
  );
  const residual = sim.inserted.find((p) => Number(p.installment_number) === 123)!;
  assert(Math.abs(Number(residual.amount) - 344.65) < 0.01, 'residual 344,65');
  assert(Number(residual.signal_addon_amount || 0) === 0, 'residual sem addon');

  const monthly = sim.inserted
    .filter((p) => Number(p.installment_number) >= 1)
    .sort(
      (a, b) => Number(a.installment_number) - Number(b.installment_number),
    );
  for (let i = 0; i < 20; i++) {
    assert(Math.abs(Number(monthly[i]!.amount) - 685.47) < 0.01, `p${i + 1}=685,47`);
  }
  for (let i = 20; i < 122; i++) {
    assert(Math.abs(Number(monthly[i]!.amount) - 597.97) < 0.01, `p${i + 1}=597,97`);
  }

  const basesSum = monthly.reduce((s, p) => s + Number(p.base_amount || 0), 0);
  assert(Math.abs(basesSum - LOT) < 0.01, 'soma bases = lote');

  const expected = expectedSaleFinanceTotal({
    finalValue: LOT,
    grossDownPayment: SIGNAL,
    contractModel: 'RECANTO_PRIMAVERA',
    paymentType: 'Parcelado',
  });
  const total =
    Number(sim.keptPaid[0]!.amount) +
    sim.inserted.reduce((s, p) => s + Number(p.amount || 0), 0);
  assert(Math.abs(total - expected) < 0.02, 'total financeiro consistente');
  assert(Number(fixedForm.installments_count) === 122, 'installments_count = 122');

  const html = generateContractHTML({
    tenant: {
      name: 'IVANILDE',
      contract_model: 'RECANTO_PRIMAVERA',
      cnpj: '32641281104',
    },
    customer: { name: 'Cliente', document: '12345678901', cpf: '12345678901' },
    project: { name: 'Recanto', city: 'Parauapebas', uf: 'PA' },
    block: { quadra: '01', lot: '01', area: 300 },
    sale: {
      payment_type: 'Parcelado',
      total_value: LOT,
      down_payment: SIGNAL,
      signal_contract_value: SIGNAL,
      signal_paid_at_sale: PAID_SIGNAL,
      signal_remaining_payment_mode: 'FIRST_INSTALLMENTS',
      signal_remaining_installments: 20,
      installments_count: 122,
      installment_definition_mode: 'FIXED_AMOUNT',
      regular_installment_amount: 597.97,
      has_residual_installment: true,
      residual_installment_amount: 344.65,
      first_installment_due_date: '2026-03-01',
    },
    contractDate: '2026-06-17',
  });
  assert(/parcela final de ajuste/i.test(html), 'contrato com residual');

  console.log('OK testRecantoEditByCountToFixedNoDuplicates');
}

/** FIXED_AMOUNT → BY_COUNT remove residual e recria média. */
function testRecantoEditFixedToByCountRemovesResidual() {
  const LOT = 73296.99;
  const SIGNAL = 3500;
  const PAID_SIGNAL = 1750;
  const fixedForm = {
    ...baseForm(),
    lot_value: LOT,
    final_value: LOT,
    down_payment: String(SIGNAL),
    signal_contract_value: String(SIGNAL),
    signal_paid_at_sale: String(PAID_SIGNAL),
    signal_remaining_payment_mode: 'FIRST_INSTALLMENTS' as const,
    signal_remaining_installments: '20',
    installments_count: '122',
    installment_definition_mode: 'FIXED_AMOUNT',
    regular_installment_amount: '597.97',
    generate_residual_installment: true,
  };
  const fixedPayloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-edit-2',
    'cust-1',
    null,
    lot,
    fixedForm,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );
  const existing = receiptsFromPayloads(fixedPayloads, 'fx').map((r) =>
    Number(r.installment_number) === 0
      ? { ...r, status: 'pago', paid_at: '2026-01-01T00:00:00Z' }
      : r,
  );
  assert(
    existing.some((r) => Number(r.installment_number) === 123),
    'estado FIXED tem #123',
  );

  const byCountForm = {
    ...fixedForm,
    installment_definition_mode: 'BY_COUNT',
    regular_installment_amount: '',
    generate_residual_installment: false,
  };
  const byCountPayloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-edit-2',
    'cust-1',
    null,
    lot,
    byCountForm,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );
  const sim = simulateSaleFinanceEditReplace({
    existing,
    newPayloads: byCountPayloads,
    finalValue: LOT,
    options: {
      contractModel: 'RECANTO_PRIMAVERA',
      grossDownPayment: SIGNAL,
      paymentType: 'Parcelado',
    },
  });

  assert(sim.deletedIds.length === 123, 'remove 122 + residual');
  assert(
    !sim.inserted.some((p) => Number(p.installment_number) === 123),
    'BY_COUNT sem residual #123',
  );
  assert(
    sim.inserted.filter((p) => Number(p.installment_number) >= 1).length === 122,
    'recria exatamente 122 mensais',
  );
  assertUniqueInstallmentNumbers(
    sim.resultingInstallmentNumbers,
    'sem duplicidade no retorno a BY_COUNT',
  );
  assert(
    !sim.resultingInstallmentNumbers.includes(123),
    'nenhum resíduo #123 no resultado',
  );

  console.log('OK testRecantoEditFixedToByCountRemovesResidual');
}

function testFinanceScheduleLockBlocksPaidMonthlyAndAsaas() {
  const unlocked = resolveFinanceScheduleEditLock({
    financePlanChanged: true,
    hasAsaasCharges: false,
    receipts: [
      receipt('s0', 0, 1750, 'pago', '2026-01-01'),
      receipt('p1', 1, 600, 'pendente'),
    ],
  });
  assert(!unlocked.blocked, 'sinal pago não bloqueia');

  const paidMonthly = resolveFinanceScheduleEditLock({
    financePlanChanged: true,
    hasAsaasCharges: false,
    receipts: [
      receipt('s0', 0, 1750, 'pago', '2026-01-01'),
      receipt('p1', 1, 600, 'pago', '2026-02-01'),
    ],
  });
  assert(paidMonthly.blocked, 'parcela mensal paga bloqueia');
  assert(
    paidMonthly.message === FINANCE_SCHEDULE_EDIT_LOCKED_MESSAGE,
    'mensagem clara de lock',
  );

  const asaas = resolveFinanceScheduleEditLock({
    financePlanChanged: true,
    hasAsaasCharges: true,
    receipts: [receipt('p1', 1, 600, 'pendente')],
  });
  assert(asaas.blocked, 'Asaas bloqueia regeneração');

  const noPlanChange = resolveFinanceScheduleEditLock({
    financePlanChanged: false,
    hasAsaasCharges: true,
    receipts: [receipt('p1', 1, 600, 'pago', '2026-02-01')],
  });
  assert(!noPlanChange.blocked, 'sem mudança de plano não bloqueia por esta trava');

  console.log('OK testFinanceScheduleLockBlocksPaidMonthlyAndAsaas');
}

function testFullRecalcNoOrphansWhenNothingPaid() {
  const LOT = 1000;
  const formA = {
    ...baseForm(),
    lot_value: LOT,
    final_value: LOT,
    down_payment: '0',
    signal_contract_value: '0',
    signal_paid_at_sale: '0',
    installments_count: '10',
    installment_definition_mode: 'FIXED_AMOUNT',
    regular_installment_amount: '100',
    generate_residual_installment: true,
  };
  const payloadsA = buildSaleEditFinancePayloads(
    'tenant',
    'sale-full',
    'cust-1',
    null,
    lot,
    formA,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );
  const existing = receiptsFromPayloads(payloadsA, 'a');
  const formB = {
    ...formA,
    installment_definition_mode: 'BY_COUNT',
    regular_installment_amount: '',
  };
  const payloadsB = buildSaleEditFinancePayloads(
    'tenant',
    'sale-full',
    'cust-1',
    null,
    lot,
    formB,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );
  const sim = simulateSaleFinanceEditReplace({
    existing,
    newPayloads: payloadsB,
    finalValue: LOT,
  });
  assert(sim.mode === 'full', 'sem pagas → full replace');
  assert(sim.deletedIds.length === existing.length, 'apaga todas antigas');
  assertUniqueInstallmentNumbers(
    sim.resultingInstallmentNumbers,
    'full replace sem duplicidade',
  );
  console.log('OK testFullRecalcNoOrphansWhenNothingPaid');
}

function main() {
  testNoPaidFullRecalc();
  testPaidEntryPreservesAndRecalcsPending();
  testPaidFirstInstallmentPreservesAndRecalcsOpen();
  testChangeInstallmentCount();
  testChangeFirstInstallmentDueDate();
  testPaidStatusVariants();
  testInstallmentNumberCoercion();
  testPendingEntryRecalculatedWhenNotPaid();
  testRecantoEditByCountToFixedNoDuplicates();
  testRecantoEditFixedToByCountRemovesResidual();
  testFinanceScheduleLockBlocksPaidMonthlyAndAsaas();
  testFullRecalcNoOrphansWhenNothingPaid();
  console.log('mandatory-sale-edit-installment-recalculation-tests: all passed');
}

main();
