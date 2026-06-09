/**
 * Recálculo de parcelas na edição de venda.
 * npx tsx scripts/mandatory-sale-edit-installment-recalculation-tests.ts
 */

import type { LotFormConfirmPayload } from '../components/map/CustomerLotFormModal';
import {
  buildSaleEditFinancePayloads,
  isPaidFinanceReceipt,
  isPendingFinanceReceipt,
  planFullFinanceRecalc,
  planPartialFinanceRecalc,
  type FinanceReceiptRow,
} from '../lib/saleEditFinanceRecalc';

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

function main() {
  testNoPaidFullRecalc();
  testPaidEntryPreservesAndRecalcsPending();
  testPaidFirstInstallmentPreservesAndRecalcsOpen();
  testChangeInstallmentCount();
  testChangeFirstInstallmentDueDate();
  testPaidStatusVariants();
  testInstallmentNumberCoercion();
  testPendingEntryRecalculatedWhenNotPaid();
  console.log('mandatory-sale-edit-installment-recalculation-tests: all passed');
}

main();
