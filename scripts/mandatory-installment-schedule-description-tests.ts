/**
 * Resumo comercial das parcelas no contrato.
 * npx tsx scripts/mandatory-installment-schedule-description-tests.ts
 */
import { formatInstallmentScheduleDescription } from '../lib/installmentScheduleDescription';
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

function testSale000000012() {
  const values = resolveCustomPreviewValues({
    tenantId: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
    company: { razao_social: 'L.F. IMÓVEIS LTDA' },
    sale: {
      company_id: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
      total_value: 74.38,
      down_payment: 10,
      installment_value: 12.88,
      signal_contract_value: 10,
      signal_paid_at_sale: 3,
      signal_remaining_value: 7,
      signal_remaining_payment_mode: 'FIRST_INSTALLMENTS',
      signal_remaining_installments: 3,
      signal_remaining_installment_value: 2.33,
      installments_count: 5,
      first_installment_due_date: '2026-10-05',
    },
    receipts: [
      { installment_number: 0, amount: 3, due_date: '2026-10-02' },
      { installment_number: 1, amount: 15.21, due_date: '2026-10-05' },
      { installment_number: 2, amount: 15.21, due_date: '2026-11-05' },
      { installment_number: 3, amount: 15.22, due_date: '2026-12-05' },
      { installment_number: 4, amount: 12.88, due_date: '2027-01-05' },
      { installment_number: 5, amount: 12.86, due_date: '2027-02-05' },
    ],
  });
  assert(String(values.DOWN_PAYMENT || '').includes('10,00'), 'sinal contratado R$ 10,00');
  assert(!String(values.DOWN_PAYMENT || '').includes('3,00'), 'sinal não é o pago no ato');
  assert(values.FIRST_DUE_DATE === '05/10/2026', 'primeiro vencimento 05/10/2026');
  assert(
    values.INSTALLMENTS_SCHEDULE === '5 parcelas — 1ª à 3ª de R$ 15,21; 4ª à 5ª de R$ 12,88',
    `resolver: ${values.INSTALLMENTS_SCHEDULE}`,
  );
  assert(!String(values.INSTALLMENTS_SCHEDULE || '').includes('15,22'), 'não imprime 15,22');
  assert(!String(values.INSTALLMENTS_SCHEDULE || '').includes('12,86'), 'não imprime 12,86');
  assert(
    !String(values.INSTALLMENTS_SCHEDULE || '').includes('5 parcelas de R$ 15,21'),
    'resolver não imprime 5 parcelas de 15,21',
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
  testSale000000012();
  console.log('OK — mandatory-installment-schedule-description-tests passed');
}

main();
