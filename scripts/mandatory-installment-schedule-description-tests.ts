/**
 * Resumo comercial das parcelas no contrato.
 * npx tsx scripts/mandatory-installment-schedule-description-tests.ts
 */
import {
  formatInstallmentScheduleDescription,
  resolveCommercialInstallmentBaseAmount,
  resolveCommercialInstallmentScheduleFromSale,
} from '../lib/installmentScheduleDescription';
import { resolveCustomPreviewValues } from '../lib/customContractPreviewResolver';
import { buildLfEstrelaCustomHtml } from '../lib/lfEstrelaCustomTemplate';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testEqualInstallments() {
  const text = formatInstallmentScheduleDescription({
    totalCount: 120,
    baseAmount: 500,
  });
  assert(text === '120 parcelas de R$ 500,00', `iguais: ${text}`);
  console.log('OK todas iguais');
}

function testFirstFiveAddon() {
  const text = formatInstallmentScheduleDescription({
    totalCount: 120,
    baseAmount: 12.88,
    remainingMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 5,
    remainingAddon: 2.33,
  });
  assert(
    text === '120 parcelas — 1ª à 5ª de R$ 15,21; 6ª à 120ª de R$ 12,88',
    `5 primeiras: ${text}`,
  );
  console.log('OK acréscimo nas primeiras 5');
}

function testFirstFourAddon() {
  const text = formatInstallmentScheduleDescription({
    totalCount: 120,
    baseAmount: 18,
    remainingMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 4,
    remainingAddon: 2,
  });
  assert(
    text === '120 parcelas — 1ª à 4ª de R$ 20,00; 5ª à 120ª de R$ 18,00',
    `4 primeiras: ${text}`,
  );
  console.log('OK acréscimo nas primeiras 4');
}

function testFirstThreeAddon() {
  const text = formatInstallmentScheduleDescription({
    totalCount: 120,
    baseAmount: 12.88,
    remainingMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 3,
    remainingAddon: 2.33,
  });
  assert(
    text === '120 parcelas — 1ª à 3ª de R$ 15,21; 4ª à 120ª de R$ 12,88',
    `3 primeiras: ${text}`,
  );
  console.log('OK acréscimo nas primeiras 3');
}

function testDistributedEqual() {
  const text = formatInstallmentScheduleDescription({
    totalCount: 120,
    baseAmount: 12.88,
    remainingMode: 'ALL_INSTALLMENTS',
    remainingInstallments: 120,
    remainingAddon: 1.4,
  });
  assert(text === '120 parcelas de R$ 14,28', `distribuídas iguais: ${text}`);
  console.log('OK distribuição em todas com valor único');
}

function testIgnoresReceiptCentRounding() {
  const text = formatInstallmentScheduleDescription({
    totalCount: 5,
    baseAmount: 12.88,
    remainingMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 3,
    remainingAddon: 2.33,
  });
  assert(
    text === '5 parcelas — 1ª à 3ª de R$ 15,21; 4ª à 5ª de R$ 12,88',
    `resumo comercial: ${text}`,
  );
  assert(!text.includes('15,22'), 'não lista 3ª de R$ 15,22');
  assert(!text.includes('12,86'), 'não lista 5ª de R$ 12,86');
  console.log('OK centavos de fechamento não fragmentam o contrato');
}

const SALE_000000012_SNAPSHOT = {
  company_id: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
  contract_model: 'ESTRELA_DO_SUL',
  total_value: 64.38,
  agreed_price: 64.38,
  lot_price: 64.38,
  down_payment: 10,
  signal_contract_value: 10,
  signal_paid_at_sale: 3,
  signal_remaining_value: 7,
  signal_remaining_payment_mode: 'FIRST_INSTALLMENTS',
  signal_remaining_installments: 3,
  signal_remaining_installment_value: 2.33,
  installments_count: 5,
  installment_definition_mode: 'BY_COUNT',
  first_installment_due_date: '2026-10-05',
};

const RECEIPTS_000000012 = [
  { installment_number: 0, amount: 3, due_date: '2026-10-02' },
  { installment_number: 1, amount: 15.21, due_date: '2026-10-05' },
  { installment_number: 2, amount: 15.21, due_date: '2026-11-05' },
  { installment_number: 3, amount: 15.22, due_date: '2026-12-05' },
  { installment_number: 4, amount: 12.88, due_date: '2027-01-05' },
  { installment_number: 5, amount: 12.86, due_date: '2027-02-05' },
];

function testOneHundredTwentyWithAddon() {
  const text = formatInstallmentScheduleDescription({
    totalCount: 120,
    baseAmount: 590.77,
    remainingMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 3,
    remainingAddon: 500,
  });
  assert(
    text === '120 parcelas — 1ª à 3ª de R$ 1.090,77; 4ª à 120ª de R$ 590,77',
    `120 com 3 acréscimos: ${text}`,
  );
  console.log('OK 120 parcelas com acréscimo nas primeiras 3');
}

function testDoesNotUseAddonAsBase() {
  let threw = false;
  try {
    formatInstallmentScheduleDescription({
      totalCount: 5,
      baseAmount: 0,
      remainingMode: 'FIRST_INSTALLMENTS',
      remainingInstallments: 3,
      remainingAddon: 2.33,
    });
  } catch (err) {
    threw = String(err).includes('parcela-base ausente');
  }
  assert(threw, 'sem parcela-base não imprime R$ 2,33 / R$ 0,00');
  console.log('OK recusa acréscimo como valor-base');
}

function testSale000000012RealSnapshot() {
  assert(
    !('installment_value' in SALE_000000012_SNAPSHOT),
    'snapshot real não persiste installment_value',
  );
  assert(
    SALE_000000012_SNAPSHOT.signal_remaining_installment_value === 2.33,
    '2,33 é só o acréscimo',
  );
  const base = resolveCommercialInstallmentBaseAmount(SALE_000000012_SNAPSHOT);
  assert(base === 10.88, `base comercial 10,88 (54,38/5), obtido ${base}`);
  const text = resolveCommercialInstallmentScheduleFromSale(SALE_000000012_SNAPSHOT);
  assert(
    text === '5 parcelas — 1ª à 3ª de R$ 13,21; 4ª à 5ª de R$ 10,88',
    `snapshot real: ${text}`,
  );
  assert(!text.includes('2,33'), 'contrato não imprime o acréscimo isolado');
  assert(!text.includes('0,00'), 'contrato não imprime parcela R$ 0,00');
  console.log('OK snapshot real sem installment_value');
}

function testSale000000012() {
  const values = resolveCustomPreviewValues({
    tenantId: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
    company: { razao_social: 'L.F. IMÓVEIS LTDA' },
    sale: SALE_000000012_SNAPSHOT,
    receipts: RECEIPTS_000000012,
  });
  assert(String(values.DOWN_PAYMENT || '').includes('10,00'), 'sinal contratado R$ 10,00');
  assert(!String(values.DOWN_PAYMENT || '').includes('3,00'), 'sinal não é o pago no ato');
  assert(values.FIRST_DUE_DATE === '05/10/2026', 'primeiro vencimento 05/10/2026');
  assert(
    values.INSTALLMENTS_SCHEDULE === '5 parcelas — 1ª à 3ª de R$ 13,21; 4ª à 5ª de R$ 10,88',
    `resolver: ${values.INSTALLMENTS_SCHEDULE}`,
  );
  assert(!String(values.INSTALLMENTS_SCHEDULE || '').includes('2,33'), 'não imprime acréscimo 2,33');
  assert(!String(values.INSTALLMENTS_SCHEDULE || '').includes('0,00'), 'não imprime R$ 0,00');
  assert(!String(values.INSTALLMENTS_SCHEDULE || '').includes('15,22'), 'não imprime 15,22');
  assert(!String(values.INSTALLMENTS_SCHEDULE || '').includes('12,86'), 'não imprime 12,86');
  assert(
    !String(values.INSTALLMENTS_SCHEDULE || '').includes('5 parcelas de R$ 13,21'),
    'resolver não imprime 5 parcelas de 13,21',
  );

  const html = buildLfEstrelaCustomHtml();
  assert(html.includes('{{INSTALLMENTS_SCHEDULE}}'), 'LF ESTRELA usa o token de cronograma');
  assert(!html.includes('parcelas de {{INSTALLMENT_VALUE}}'), 'LF ESTRELA não concatena só a 1ª parcela');
  console.log('OK venda 000000012/2026');
}

function main() {
  testEqualInstallments();
  testFirstFiveAddon();
  testFirstFourAddon();
  testFirstThreeAddon();
  testDistributedEqual();
  testIgnoresReceiptCentRounding();
  testOneHundredTwentyWithAddon();
  testDoesNotUseAddonAsBase();
  testSale000000012RealSnapshot();
  testSale000000012();
  console.log('OK — mandatory-installment-schedule-description-tests passed');
}

main();
