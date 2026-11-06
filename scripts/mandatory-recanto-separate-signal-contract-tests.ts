/**
 * Contrato do sinal parcelado do Recanto Primavera.
 * npx tsx scripts/mandatory-recanto-separate-signal-contract-tests.ts
 */

import { buildRecantoBrokerageSchedule } from '../lib/recantoBrokerageInstallments';
import { generateRecantoPrimaveraContract } from '../lib/recantoPrimaveraContractTemplate';
import { buildSeparateSignalContractSchedule } from '../lib/recantoSeparateSignalContract';
import { RECANTO_SEPARATE_SIGNAL_ENABLED } from '../lib/recantoSeparateSignalForm';
import {
  RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED,
  RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED,
} from '../lib/recantoSeparateSignalPersistence';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function text(value: string): string {
  return value.replace(/\u00a0/g, ' ');
}

const tenant = {
  name: 'IVANILDE DE MOURA SILVA',
  fantasy_name: 'RECANTO PRIMAVERA',
  cnpj: '32641281104',
  phone: '(94) 99999-0001',
  email: 'contato@recantoprimavera.test',
  address: 'Rua das Flores, 100',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
  contract_model: 'RECANTO_PRIMAVERA',
};

const customer = {
  name: 'Comprador Teste',
  document: '12345678901',
  profession: 'Engenheiro',
  civil_state: 'Solteiro',
  address: 'Rua A',
  neighborhood: 'Centro',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
};

const project = { name: 'Recanto Primavera', city: 'Parauapebas', uf: 'PA' };
const block = { quadra: '01', lot: '10', area: 250, frente: 10, fundo: 10 };

function scheduleFor(input: { paidAtActCents: number; brokerageInstallmentCount: number }) {
  return buildRecantoBrokerageSchedule({
    lotPriceCents: 6_000_000,
    brokerageTotalCents: 350_000,
    paidAtActCents: input.paidAtActCents,
    brokerageInstallmentCount: input.brokerageInstallmentCount,
    actDate: '2026-11-06',
    brokerageFirstDueDate: input.brokerageInstallmentCount > 0 ? '2026-12-10' : null,
    lotInstallmentCount: 12,
    lotStartMode: 'SIMULTANEOUS',
  });
}

function receiptsOf(schedule: ReturnType<typeof buildRecantoBrokerageSchedule>) {
  return [
    ...schedule.brokerageLines.map((line) => ({
      schedule_group: 'SIGNAL' as const,
      installment_number: line.sequence,
      amount: line.amountCents / 100,
      due_date: line.dueDate,
      signal_addon_amount: 0,
    })),
    ...schedule.lotLines.map((line) => ({
      schedule_group: 'LOT' as const,
      installment_number: line.sequence,
      amount: line.amountCents / 100,
      due_date: line.dueDate,
      signal_addon_amount: 0,
    })),
  ];
}

function contractFor(
  schedule: ReturnType<typeof buildRecantoBrokerageSchedule>,
  paidAtActCents: number,
  extras: Record<string, unknown> = {},
) {
  return generateRecantoPrimaveraContract({
    tenant,
    customer,
    project,
    block,
    sale: {
      payment_type: 'Parcelado',
      installments_count: 12,
      total_value: 60000,
      signal_contract_value: 3500,
      signal_paid_at_sale: paidAtActCents / 100,
      signal_schedule_mode: 'SEPARATE',
      signal_remaining_payment_mode: null,
      signal_remaining_installments: null,
      signal_remaining_installment_value: null,
      created_at: '2026-11-06',
      ...extras,
    },
    financeReceipts: receiptsOf(schedule),
    contractDate: '2026-11-06',
  });
}

function assertSchedule(
  schedule: ReturnType<typeof buildRecantoBrokerageSchedule>,
  expected: {
    paidAtActCents: number;
    balanceCents: number;
    count: number;
    installmentCents: number;
  },
) {
  const view = buildSeparateSignalContractSchedule({
    sale: { signal_schedule_mode: 'SEPARATE', signal_contract_value: 3500 },
    receipts: receiptsOf(schedule),
  });
  assert(view != null, 'cronograma SEPARATE reconhecido');
  const resolved = view as NonNullable<typeof view>;
  assert(resolved.signalTotalCents === 350_000, 'sinal total em centavos');
  assert(resolved.paidAtActCents === expected.paidAtActCents, 'pagamento inicial em centavos');
  assert(resolved.balanceCents === expected.balanceCents, 'saldo do sinal em centavos');
  assert(resolved.signalInstallmentCount === expected.count, 'quantidade de parcelas do sinal');
  assert(
    resolved.signalInstallmentCents.every((cents) => cents === expected.installmentCents),
    'valor individual das parcelas do sinal',
  );
  assert(resolved.lotTotalCents === 6_000_000, 'preço do lote em centavos');
  assert(
    resolved.financialTotalCents === resolved.signalTotalCents + resolved.lotTotalCents,
    'total sem duplicidade',
  );
  assert(
    resolved.signalLines.every((line) => line.signalAddonCents === 0) &&
      resolved.lotLines.every((line) => line.signalAddonCents === 0),
    'sinal não entra nas parcelas do lote',
  );
  const expectedDates = schedule.brokerageLines
    .filter((line) => line.sequence > 0)
    .map((line) => line.dueDate);
  assert(
    resolved.signalDueDates.join('|') === expectedDates.join('|'),
    'vencimentos do sinal iguais ao cronograma',
  );
  assert(
    resolved.lotDueDates.join('|') === schedule.lotLines.map((line) => line.dueDate).join('|'),
    'vencimentos do lote iguais ao cronograma',
  );
  assert(!/corretagem/i.test(resolved.clauseText + resolved.scheduleHtml), 'texto usa SINAL');
  assert(resolved.clauseText.includes('SINAL'), 'a palavra SINAL permanece');
  assert(resolved.clauseText.includes('não reduz o preço do lote'), 'sinal não reduz o lote');
  return resolved;
}

function assertDatesInHtml(
  html: string,
  schedule: ReturnType<typeof buildRecantoBrokerageSchedule>,
) {
  const normalized = text(html);
  for (const line of [...schedule.brokerageLines, ...schedule.lotLines]) {
    const [year, month, day] = line.dueDate.split('-');
    assert(normalized.includes(`${day}/${month}/${year}`), `vencimento ${line.dueDate} no contrato`);
  }
  assert(normalized.includes('Cronograma do SINAL'), 'cronograma do sinal');
  assert(normalized.includes('Cronograma do lote'), 'cronograma do lote');
  assert(!normalized.includes('Complemento do sinal'), 'sem acréscimo do sinal nas parcelas do lote');
  assert(!/corretagem/i.test(normalized), 'contrato sem a palavra corretagem');
  assert(normalized.includes('data-party-role="VENDOR"'), 'assinatura do vendedor preservada');
  assert(normalized.includes('data-party-role="BUYER"'), 'assinatura do comprador preservada');
}

const scenarioA = scheduleFor({ paidAtActCents: 350_000, brokerageInstallmentCount: 0 });
const viewA = assertSchedule(scenarioA, {
  paidAtActCents: 350_000,
  balanceCents: 0,
  count: 0,
  installmentCents: 0,
});
assert(viewA.clauseText.includes('pago integralmente'), 'cenário A integral');
assertDatesInHtml(contractFor(scenarioA, 350_000), scenarioA);

const scenarioB = scheduleFor({ paidAtActCents: 100_000, brokerageInstallmentCount: 5 });
const viewB = assertSchedule(scenarioB, {
  paidAtActCents: 100_000,
  balanceCents: 250_000,
  count: 5,
  installmentCents: 50_000,
});
assert(text(viewB.clauseText).includes('R$ 3.500,00'), 'cenário B valor do sinal');
assert(text(viewB.clauseText).includes('R$ 1.000,00'), 'cenário B pagamento inicial');
assert(text(viewB.clauseText).includes('R$ 2.500,00'), 'cenário B saldo');
assert(text(viewB.clauseText).includes('5 parcelas de R$ 500,00'), 'cenário B cinco parcelas');
assertDatesInHtml(contractFor(scenarioB, 100_000), scenarioB);

const scenarioC = scheduleFor({ paidAtActCents: 0, brokerageInstallmentCount: 7 });
const viewC = assertSchedule(scenarioC, {
  paidAtActCents: 0,
  balanceCents: 350_000,
  count: 7,
  installmentCents: 50_000,
});
assert(viewC.clauseText.includes('Nenhum valor deste SINAL foi pago inicialmente'), 'cenário C sem entrada');
assert(text(viewC.clauseText).includes('7 parcelas de R$ 500,00'), 'cenário C sete parcelas');
assertDatesInHtml(contractFor(scenarioC, 0), scenarioC);

const oldHtml = text(generateRecantoPrimaveraContract({
  tenant,
  customer,
  project,
  block,
  sale: {
    payment_type: 'Parcelado',
    installments_count: 12,
    total_value: 60000,
    signal_contract_value: 3500,
    signal_paid_at_sale: 1000,
    signal_remaining_payment_mode: 'ALL_INSTALLMENTS',
    created_at: '2026-06-01',
  },
  contractDate: '2026-06-08',
}));
assert(oldHtml.includes('Complemento do sinal'), 'modalidade antiga mantém o quadro atual');
assert(oldHtml.includes('saldo parcelado do lote'), 'modalidade antiga mantém a cláusula atual');
assert(!oldHtml.includes('cronograma próprio'), 'modalidade antiga sem cláusula nova');
assert(!oldHtml.includes('data-schedule-group='), 'modalidade antiga sem cronograma separado');

const frozenHtml = text(generateRecantoPrimaveraContract({
  tenant,
  customer,
  project,
  block,
  sale: {
    payment_type: 'Parcelado',
    installments_count: 12,
    total_value: 60000,
    signal_contract_value: 3500,
    signal_paid_at_sale: 3500,
    signal_schedule_mode: 'SEPARATE',
    created_at: '2026-06-01',
  },
  contractSnapshot: { signal_schedule_mode: null },
  financeReceipts: receiptsOf(scenarioB),
  contractDate: '2026-06-08',
}));
assert(frozenHtml.includes('sinal contratual'), 'snapshot da emissão preserva a cláusula antiga');
assert(!frozenHtml.includes('Cronograma do SINAL'), 'snapshot da emissão não recebe o cronograma novo');

assert(RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED === false, 'schema flag desligada');
assert(RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED === false, 'persistência desligada');
assert(RECANTO_SEPARATE_SIGNAL_ENABLED === false, 'formulário desligado');

console.log('mandatory-recanto-separate-signal-contract-tests: ok');
