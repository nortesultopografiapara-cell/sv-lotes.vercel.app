/**
 * Testes obrigatórios — modalidade Pagamento único futuro.
 * npx tsx scripts/mandatory-sale-payment-mode-single-future-tests.ts
 */

import type { LotFormConfirmPayload } from '../components/map/CustomerLotFormModal';
import { buildSaleEditFinancePayloads } from '../lib/saleEditFinanceRecalc';
import {
  buildSaleContractClauseQuartaHtml,
  buildSaleContractClauseTerceiraHtml,
  isSaleContractCashPayment,
} from '../lib/saleContractLegalTemplate';
import {
  buildSaleContractPaymentSummaryHtml,
  resolveSaleContractPaymentBreakdown,
} from '../lib/saleContractPaymentSummary';
import { formatContractDueDateLongBr } from '../lib/contractPaymentDates';
import {
  PAYMENT_TYPE_IMMEDIATE_CASH,
  PAYMENT_TYPE_INSTALLMENT,
  PAYMENT_TYPE_SINGLE_FUTURE,
  resolveSalePaymentMode,
} from '../lib/salePaymentMode';
import { expectedSaleFinanceTotal } from '../lib/saleInstallmentCalc';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const lot = { id: 'block-1', project_id: 'proj-1' };

function baseForm(
  overrides: Partial<LotFormConfirmPayload> = {},
): LotFormConfirmPayload {
  return {
    name: 'Cliente Teste',
    cpf_cnpj: '12345678901',
    payment_type: PAYMENT_TYPE_SINGLE_FUTURE,
    discount_value: '0',
    down_payment: '0',
    down_payment_due_date: '2032-01-15',
    installments_count: '',
    first_installment_due_date: '',
    broker_id: '',
    notes: '',
    reservation_signal_paid: 0,
    lot_value: 115000,
    final_value: 115000,
    installment_value: 0,
    ...overrides,
  } as LotFormConfirmPayload;
}

function testResolveModes() {
  assert(
    resolveSalePaymentMode({ payment_type: PAYMENT_TYPE_IMMEDIATE_CASH })
      .mode === 'IMMEDIATE_CASH',
    'à vista imediato',
  );
  assert(
    resolveSalePaymentMode({ payment_type: PAYMENT_TYPE_SINGLE_FUTURE })
      .mode === 'SINGLE_FUTURE',
    'único futuro',
  );
  assert(
    resolveSalePaymentMode({ payment_type: PAYMENT_TYPE_INSTALLMENT })
      .mode === 'INSTALLMENT',
    'parcelado',
  );
  assert(
    !isSaleContractCashPayment({
      payment_type: PAYMENT_TYPE_SINGLE_FUTURE,
      installments_count: 1,
      down_payment: 0,
    }),
    'único futuro NÃO é cash imediato',
  );
  assert(
    isSaleContractCashPayment({
      payment_type: PAYMENT_TYPE_IMMEDIATE_CASH,
      installments_count: 1,
      down_payment: 0,
    }),
    'à vista legado permanece cash',
  );
  console.log('OK testResolveModes');
}

function testSingleFutureFinanceReceipt() {
  const payloads = buildSaleEditFinancePayloads(
    'tenant-1',
    'sale-1',
    'cust-1',
    null,
    lot,
    baseForm(),
    { contractModel: 'PADRAO', cashInstallmentPaid: true },
  );
  assert(payloads.length === 1, 'exatamente 1 recebível');
  assert(payloads[0].installment_number === 1, 'installment_number = 1');
  assert(Number(payloads[0].amount) === 115000, 'valor líquido total');
  assert(payloads[0].due_date === '2032-01-15', 'vencimento futuro preservado');
  assert(payloads[0].status === 'pendente', 'sempre pendente (ignora cashPaid)');
  assert(payloads[0].paid_at == null, 'sem paid_at');
  assert(
    expectedSaleFinanceTotal({
      finalValue: 115000,
      paymentType: PAYMENT_TYPE_SINGLE_FUTURE,
    }) === 115000,
    'total financeiro esperado',
  );
  console.log('OK testSingleFutureFinanceReceipt');
}

function testImmediateCashPreserved() {
  const payloads = buildSaleEditFinancePayloads(
    'tenant-1',
    'sale-1',
    'cust-1',
    null,
    lot,
    baseForm({
      payment_type: PAYMENT_TYPE_IMMEDIATE_CASH,
      down_payment_due_date: '2026-07-11',
      final_value: 10000,
    }),
    { contractModel: 'PADRAO', cashInstallmentPaid: true },
  );
  assert(payloads[0].status === 'pago', 'à vista imediato ainda pode marcar pago');
  console.log('OK testImmediateCashPreserved');
}

function testTimezoneDueDateLong() {
  const long = formatContractDueDateLongBr('2032-01-15');
  assert(long.includes('2032'), 'ano 2032');
  assert(long.includes('janeiro'), 'mês por extenso sem deslocar');
  assert(long.startsWith('15'), 'dia 15');
  console.log('OK testTimezoneDueDateLong');
}

function testContractTextSingleFuture() {
  const sale = {
    payment_type: PAYMENT_TYPE_SINGLE_FUTURE,
    lot_price: 115000,
    discount: 0,
    down_payment: 0,
    installments_count: 1,
    down_payment_due_date: '2032-01-15',
  };
  const dueLong = formatContractDueDateLongBr(sale.down_payment_due_date);
  const terceira = buildSaleContractClauseTerceiraHtml({
    mode: 'SINGLE_FUTURE',
    valorTotalFmt: 'R$ 115.000,00',
    valorTotalExtenso: 'cento e quinze mil reais',
    dueDateLongFmt: dueLong,
  });
  assert(terceira.includes('pagamento único'), 'cláusula pagamento único');
  assert(terceira.includes(dueLong), 'data por extenso na cláusula');
  assert(
    !/no ato da assinatura/i.test(terceira),
    'não afirma pagamento na assinatura',
  );
  assert(
    /somente será concedida após a efetiva confirmação/i.test(terceira),
    'quitação só após confirmação',
  );
  assert(!/PROMISSÁRIO VENDEDOR/i.test(terceira), 'sem PROMISSÁRIO VENDEDOR');

  const quarta = buildSaleContractClauseQuartaHtml({
    isCash: false,
    mode: 'SINGLE_FUTURE',
    valorTotalFmt: 'R$ 115.000,00',
    valorTotalExtenso: 'cento e quinze mil reais',
    valorEntradaFmt: 'R$ 0,00',
    valorEntradaExtenso: 'zero reais',
    qtdParcelas: 1,
    valorParcelaFmt: 'R$ 0,00',
    valorParcelaExtenso: 'zero reais',
    dataPrimeiraParcelaFmt: '—',
    dataUltimaParcelaFmt: '—',
    singleFutureDueLongFmt: dueLong,
  });
  assert(quarta.includes('pagamento único'), 'quarta pagamento único');
  assert(!/na data da assinatura/i.test(quarta), 'quarta sem assinatura');

  const breakdown = resolveSaleContractPaymentBreakdown(sale);
  const summary = buildSaleContractPaymentSummaryHtml(breakdown);
  assert(
    summary.includes('Pagamento único com vencimento futuro'),
    'quadro forma de pagamento',
  );
  assert(!summary.includes('Quantidade de parcelas'), 'sem qtd parcelas');
  assert(!summary.includes('Saldo parcelado'), 'sem saldo parcelado');
  assert(!summary.includes('Valor da parcela'), 'sem valor parcela');
  console.log('OK testContractTextSingleFuture');
}

function testEditDoesNotDuplicate() {
  const first = buildSaleEditFinancePayloads(
    'tenant-1',
    'sale-1',
    'cust-1',
    null,
    lot,
    baseForm({ down_payment_due_date: '2032-01-15' }),
  );
  const second = buildSaleEditFinancePayloads(
    'tenant-1',
    'sale-1',
    'cust-1',
    null,
    lot,
    baseForm({ down_payment_due_date: '2032-06-20' }),
  );
  assert(first.length === 1 && second.length === 1, 'sempre 1 payload');
  assert(second[0].due_date === '2032-06-20', 'alteração de data no payload');
  console.log('OK testEditDoesNotDuplicate');
}

function testLegacyVistaNotAutoConverted() {
  const mode = resolveSalePaymentMode({
    payment_type: 'À vista',
    installments_count: 1,
    down_payment: 0,
  });
  assert(mode.mode === 'IMMEDIATE_CASH', 'legado À vista permanece imediato');
  assert(mode.persistedType === PAYMENT_TYPE_IMMEDIATE_CASH, 'valor persistido');
  console.log('OK testLegacyVistaNotAutoConverted');
}

function testInstallmentFortyEight() {
  const payloads = buildSaleEditFinancePayloads(
    'tenant-1',
    'sale-1',
    'cust-1',
    null,
    lot,
    baseForm({
      payment_type: PAYMENT_TYPE_INSTALLMENT,
      installments_count: '48',
      first_installment_due_date: '2026-08-10',
      down_payment: '0',
      down_payment_due_date: '',
      final_value: 120000,
      installment_value: 2500,
    }),
    { contractModel: 'PADRAO' },
  );
  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  assert(monthly.length === 48, '48 parcelas');
  assert(
    monthly[monthly.length - 1].installment_number === 48,
    'última 48/48',
  );
  console.log('OK testInstallmentFortyEight');
}

function main() {
  testResolveModes();
  testSingleFutureFinanceReceipt();
  testImmediateCashPreserved();
  testTimezoneDueDateLong();
  testContractTextSingleFuture();
  testEditDoesNotDuplicate();
  testLegacyVistaNotAutoConverted();
  testInstallmentFortyEight();
  console.log('ALL mandatory-sale-payment-mode-single-future-tests PASSED');
}

main();
