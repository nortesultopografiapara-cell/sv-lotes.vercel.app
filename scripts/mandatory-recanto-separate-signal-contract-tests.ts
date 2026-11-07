/**
 * Contrato do sinal parcelado do Recanto Primavera.
 * npx tsx scripts/mandatory-recanto-separate-signal-contract-tests.ts
 */

import { buildRecantoBrokerageSchedule } from '../lib/recantoBrokerageInstallments';
import { generateRecantoPrimaveraContract } from '../lib/recantoPrimaveraContractTemplate';
import {
  buildSeparateSignalContractSchedule,
  groupSeparateSignalScheduleLines,
} from '../lib/recantoSeparateSignalContract';
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

function dateBr(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function assertDatesInHtml(
  html: string,
  schedule: ReturnType<typeof buildRecantoBrokerageSchedule>,
) {
  const normalized = text(html);
  const signalFuture = schedule.brokerageLines.filter((line) => line.sequence > 0);
  const endpoints = [
    schedule.brokerageLines.find((line) => line.sequence === 0),
    signalFuture[0],
    signalFuture[signalFuture.length - 1],
    schedule.lotLines[0],
    schedule.lotLines[schedule.lotLines.length - 1],
  ].filter((line): line is NonNullable<typeof line> => Boolean(line));
  for (const line of endpoints) {
    assert(normalized.includes(dateBr(line.dueDate)), `vencimento ${line.dueDate} no resumo`);
  }
  assert(normalized.includes('Cronograma do SINAL'), 'cronograma do sinal');
  assert(normalized.includes('Cronograma do lote'), 'cronograma do lote');
  assert(!normalized.includes('Complemento do sinal'), 'sem acréscimo do sinal nas parcelas do lote');
  assert(!/corretagem/i.test(normalized), 'contrato sem a palavra corretagem');
  assert(normalized.includes('data-party-role="VENDOR"'), 'assinatura do vendedor preservada');
  assert(normalized.includes('data-party-role="BUYER"'), 'assinatura do comprador preservada');
  const bands = normalized.match(/data-schedule-band=/g)?.length ?? 0;
  assert(bands > 0 && bands < schedule.brokerageLines.length + schedule.lotLines.length, 'o resumo continua com uma linha por parcela');
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

const longSchedule = buildRecantoBrokerageSchedule({
  lotPriceCents: 6_618_805,
  brokerageTotalCents: 350_000,
  paidAtActCents: 100_000,
  brokerageInstallmentCount: 5,
  actDate: '2026-11-06',
  brokerageFirstDueDate: '2026-12-06',
  lotInstallmentCount: 120,
  lotStartMode: 'AFTER_BROKERAGE',
});
const longReceipts = receiptsOf(longSchedule).map((row) => ({
  ...row,
  status: row.installment_number === 0 ? 'pago' : 'pendente',
}));
const longView = buildSeparateSignalContractSchedule({
  sale: { signal_schedule_mode: 'SEPARATE', signal_contract_value: 3500 },
  receipts: longReceipts,
});
assert(longView != null, 'prévia do contrato longo');
const longResolved = longView as NonNullable<typeof longView>;
assert(longResolved.signalLines.length === 6, 'recebíveis de sinal preservados');
assert(longResolved.lotLines.length === 120, 'recebíveis de lote preservados');
assert(longResolved.signalInstallmentCount === 5, 'pagamento inicial fora das cinco parcelas');
assert(longResolved.financialTotalCents === 6_968_805, 'total financeiro da operação');
const signalBands = groupSeparateSignalScheduleLines(longResolved.signalLines);
const lotBands = groupSeparateSignalScheduleLines(longResolved.lotLines);
assert(signalBands.length === 2 && signalBands[0]?.kind === 'initial' && signalBands[1]?.fromNumber === 1 && signalBands[1]?.toNumber === 5, 'sinal 1 a 5');
assert(signalBands[1]?.amountCents === 50_000, 'valor das parcelas do sinal');
assert(lotBands.length === 2 && lotBands[0]?.fromNumber === 1 && lotBands[0]?.toNumber === 119 && lotBands[0]?.amountCents === 55_157, 'lote 1 a 119');
assert(lotBands[1]?.fromNumber === 120 && lotBands[1]?.amountCents === 55_122, 'ajuste da parcela 120');
const longHtml = text(longResolved.scheduleHtml);
assert(longHtml.includes('Pagamento inicial') && longHtml.includes('pago em 06/11/2026'), 'pagamento inicial destacado');
assert(longHtml.includes('Parcelas 1 a 5') && longHtml.includes('06/12/2026') && longHtml.includes('06/04/2027'), 'intervalo do sinal');
assert(longHtml.includes('Parcelas 1 a 119') && longHtml.includes('06/05/2027') && longHtml.includes('06/03/2037'), 'intervalo do lote');
assert(longHtml.includes('Parcela 120') && longHtml.includes('06/04/2037'), 'vencimento final');
assert(longHtml.includes('Total do SINAL') && longHtml.includes('Total do lote') && longHtml.includes('Total financeiro da operação'), 'totais do quadro');
assert((longHtml.match(/data-schedule-band=/g) || []).length === 4, 'quadro resumido');
assert(longReceipts.length === 126, 'a prévia não remove recebíveis');

const irregular = groupSeparateSignalScheduleLines([
  { scheduleGroup: 'SIGNAL', installmentNumber: 1, amountCents: 50_000, amountReais: 500, dueDate: '2026-12-06', status: 'pendente', signalAddonCents: 0 },
  { scheduleGroup: 'SIGNAL', installmentNumber: 2, amountCents: 50_000, amountReais: 500, dueDate: '2027-01-06', status: 'pendente', signalAddonCents: 0 },
  { scheduleGroup: 'SIGNAL', installmentNumber: 3, amountCents: 50_000, amountReais: 500, dueDate: '2027-03-06', status: 'pendente', signalAddonCents: 0 },
]);
assert(irregular.length === 2 && irregular[0]?.toNumber === 2 && irregular[1]?.fromNumber === 3, 'vencimento irregular fica separado');

const mixedStatus = groupSeparateSignalScheduleLines([
  { scheduleGroup: 'LOT', installmentNumber: 1, amountCents: 55_157, amountReais: 551.57, dueDate: '2027-05-06', status: 'pendente', signalAddonCents: 0 },
  { scheduleGroup: 'LOT', installmentNumber: 2, amountCents: 55_157, amountReais: 551.57, dueDate: '2027-06-06', status: 'pago', signalAddonCents: 0 },
]);
assert(mixedStatus.length === 2, 'status diferente fica separado');

const balloon = groupSeparateSignalScheduleLines([
  { scheduleGroup: 'LOT', installmentNumber: 1, amountCents: 55_157, amountReais: 551.57, dueDate: '2027-05-06', status: 'pendente', signalAddonCents: 0 },
  { scheduleGroup: 'LOT', installmentNumber: 2, amountCents: 55_157, amountReais: 551.57, dueDate: '2027-06-06', status: 'pendente', signalAddonCents: 10_000 },
]);
assert(balloon.length === 2 && balloon[1]?.signalAddonCents === 10_000, 'parcela com complemento fica separada');

const longContract = text(generateRecantoPrimaveraContract({
  tenant,
  customer,
  project,
  block,
  sale: {
    payment_type: 'Parcelado',
    installments_count: 120,
    total_value: 66188.05,
    signal_contract_value: 3500,
    signal_paid_at_sale: 1000,
    signal_schedule_mode: 'SEPARATE',
    signal_remaining_payment_mode: null,
    created_at: '2026-11-06',
  },
  financeReceipts: longReceipts,
  contractDate: '2026-11-06',
}));
const scheduleRows = (longContract.match(/data-schedule-band=/g) || []).length;
const oldRowPages = Math.ceil(126 * 10 / 250);
const summaryRowPages = Math.ceil(scheduleRows * 10 / 250);
assert(longContract.includes('CLÁUSULA TERCEIRA'), 'cláusula de pagamento preservada');
assert(!/corretagem/i.test(longContract), 'prévia sem corretagem');
assert(scheduleRows === 4, 'prévia do contrato usa o quadro resumido');
console.log(JSON.stringify({
  scheduleBands: scheduleRows,
  previousSchedulePagesEstimate: oldRowPages,
  summarySchedulePagesEstimate: summaryRowPages,
  fullContractPagesEstimate: 6 + summaryRowPages,
}));

assert(RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED === false, 'schema flag desligada');
assert(RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED === false, 'persistência desligada');
assert(RECANTO_SEPARATE_SIGNAL_ENABLED === false, 'formulário desligado');

console.log('mandatory-recanto-separate-signal-contract-tests: ok');
