/**
 * Parcelas de venda devem nascer pendentes salvo pagamento explícito.
 * npx tsx scripts/mandatory-sale-finance-receipt-pending-tests.ts
 */

import type { LotFormConfirmPayload } from '../components/map/CustomerLotFormModal';
import {
  buildSaleEditFinancePayloads,
  isPaidFinanceReceipt,
} from '../lib/saleEditFinanceRecalc';
import { computeChargeKpiSummary } from '../lib/charges/chargeInstallmentHelpers';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const lot = { id: 'block-1', project_id: 'proj-1' };
const metricsToday = '2026-06-08';

function baseSaleForm(overrides: Partial<LotFormConfirmPayload> = {}): LotFormConfirmPayload {
  return {
    name: 'Cliente Teste',
    cpf_cnpj: '12345678901',
    payment_type: 'Parcelado',
    discount_value: '0',
    down_payment: '0',
    down_payment_due_date: '',
    installments_count: '1',
    first_installment_due_date: '2026-07-01',
    broker_id: '',
    notes: '',
    reservation_signal_paid: 0,
    lot_value: 10,
    final_value: 9,
    installment_value: 9,
    ...overrides,
  } as LotFormConfirmPayload;
}

function testSingleInstallmentWithDiscountPending() {
  const form = baseSaleForm({
    payment_type: 'Parcelado',
    discount_value: '1',
    installments_count: '1',
    final_value: 9,
  });

  const payloads = buildSaleEditFinancePayloads(
    'tenant-1',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'PADRAO' },
  );

  assert(payloads.length === 1, '1 parcela gerada');
  const parcel = payloads[0];
  assert(Number(parcel.amount) === 9, 'valor da parcela deve ser 9 (desconto não é pagamento)');
  assert(parcel.status === 'pendente', 'status pendente');
  assert(Number(parcel.paid_amount) === 0, 'paid_amount 0');
  assert(parcel.paid_at == null, 'paid_at null');
  assert(!isPaidFinanceReceipt(parcel), 'helper não classifica como paga');

  console.log('OK testSingleInstallmentWithDiscountPending');
}

function testSingleInstallmentWithoutDiscountPending() {
  const form = baseSaleForm({
    payment_type: 'Parcelado',
    discount_value: '0',
    lot_value: 10,
    final_value: 10,
    installment_value: 10,
  });

  const payloads = buildSaleEditFinancePayloads(
    'tenant-1',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'PADRAO' },
  );

  assert(payloads.length === 1, '1 parcela');
  assert(Number(payloads[0].amount) === 10, 'valor 10');
  assert(payloads[0].status === 'pendente', 'pendente sem pagamento manual');
  assert(Number(payloads[0].paid_amount) === 0, 'paid_amount 0');
  assert(payloads[0].paid_at == null, 'paid_at null');

  console.log('OK testSingleInstallmentWithoutDiscountPending');
}

function testCashSaleDoesNotAutoMarkPaidOnCreate() {
  const form = baseSaleForm({
    payment_type: 'À vista',
    discount_value: '1',
    down_payment_due_date: '2026-07-01',
    final_value: 9,
  });

  const payloads = buildSaleEditFinancePayloads(
    'tenant-1',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'PADRAO', cashInstallmentPaid: false },
  );

  assert(payloads.length === 1, '1 recebível à vista');
  assert(Number(payloads[0].amount) === 9, 'valor final com desconto');
  assert(payloads[0].status === 'pendente', 'à vista não nasce pago automaticamente');
  assert(Number(payloads[0].paid_amount) === 0, 'paid_amount 0');
  assert(payloads[0].paid_at == null, 'paid_at null');

  console.log('OK testCashSaleDoesNotAutoMarkPaidOnCreate');
}

function testExplicitCashPaymentMarksPaid() {
  const form = baseSaleForm({
    payment_type: 'À vista',
    down_payment_due_date: '2026-07-01',
    final_value: 9,
  });

  const payloads = buildSaleEditFinancePayloads(
    'tenant-1',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'PADRAO', cashInstallmentPaid: true },
  );

  assert(payloads[0].status === 'pago', 'pagamento explícito marca pago');
  assert(Number(payloads[0].paid_amount) === 9, 'paid_amount igual ao valor');
  assert(Boolean(payloads[0].paid_at), 'paid_at preenchido');

  console.log('OK testExplicitCashPaymentMarksPaid');
}

function testDiscountIsNotTreatedAsPayment() {
  const form = baseSaleForm({
    payment_type: 'Parcelado',
    discount_value: '5000',
    lot_value: 85000,
    final_value: 80000,
    installments_count: '10',
    first_installment_due_date: '2026-08-01',
    installment_value: 8000,
  });

  const payloads = buildSaleEditFinancePayloads(
    'tenant-1',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'PADRAO' },
  );

  const installments = payloads.filter((p) => Number(p.installment_number) >= 1);
  assert(installments.length === 10, '10 parcelas');
  assert(
    installments.every((p) => p.status === 'pendente' && Number(p.paid_amount) === 0),
    'desconto não gera parcelas pagas',
  );
  const sum = installments.reduce((acc, p) => acc + Number(p.amount), 0);
  assert(Math.abs(sum - 80000) < 0.05, 'soma parcelada reflete valor final, não desconto isolado');

  console.log('OK testDiscountIsNotTreatedAsPayment');
}

function testChargesKpisForPendingInstallment() {
  const row = {
    id: 'rec-1',
    amount: 9,
    due_date: '2026-07-01',
    status: 'pendente',
    paid_amount: 0,
    paid_at: null,
    installment_number: 1,
  };

  const kpis = computeChargeKpiSummary([row], metricsToday);
  assert(kpis.emAberto === 9, 'KPI em aberto R$ 9');
  assert(kpis.pagasMes === 0, 'KPI pagas no mês zero');
  assert(kpis.totalAReceber === 9, 'total a receber R$ 9');
  assert(kpis.qtyEmAberto === 1, '1 parcela em aberto');

  console.log('OK testChargesKpisForPendingInstallment');
}

function testPaidOnlyViaExplicitStatusOrWebhookFields() {
  const pending = {
    status: 'pendente',
    paid_amount: 0,
    paid_at: null,
  };
  const paidManual = {
    status: 'pago',
    paid_amount: 9,
    paid_at: '2026-06-08T12:00:00Z',
  };
  const paidWebhookStyle = {
    status: 'pago',
    paid_amount: 9,
    paid_at: '2026-06-08T15:00:00Z',
  };

  assert(!isPaidFinanceReceipt(pending), 'pendente não é paga');
  assert(isPaidFinanceReceipt(paidManual), 'pagamento manual');
  assert(isPaidFinanceReceipt(paidWebhookStyle), 'baixa webhook/manual');

  console.log('OK testPaidOnlyViaExplicitStatusOrWebhookFields');
}

function main() {
  testSingleInstallmentWithDiscountPending();
  testSingleInstallmentWithoutDiscountPending();
  testCashSaleDoesNotAutoMarkPaidOnCreate();
  testExplicitCashPaymentMarksPaid();
  testDiscountIsNotTreatedAsPayment();
  testChargesKpisForPendingInstallment();
  testPaidOnlyViaExplicitStatusOrWebhookFields();
  console.log('mandatory-sale-finance-receipt-pending-tests: all passed');
}

main();
