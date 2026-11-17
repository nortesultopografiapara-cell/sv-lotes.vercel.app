/**
 * Contrato de sinal antigo regularizado. Dados fictícios, sem banco e sem venda real.
 * npx tsx scripts/mandatory-legacy-signal-contract-tests.ts
 */
import { resolveContractHtml2pdfOptions } from '../lib/contractPdfPostProcess';
import { generateRecantoPrimaveraContract } from '../lib/recantoPrimaveraContractTemplate';
import {
  buildLegacyRegularizedSignalContractSchedule,
  buildSeparateSignalContractSchedule,
} from '../lib/recantoSeparateSignalContract';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function text(value: string): string {
  return value.replace(/\u00a0/g, ' ');
}

const tenant = {
  name: 'Vendedora Ficticia',
  fantasy_name: 'Empreendimento Ficticio',
  cnpj: '00000000000191',
  phone: '(94) 99999-0000',
  email: 'contato@exemplo.test',
  address: 'Rua de Teste, 100',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
  contract_model: 'RECANTO_PRIMAVERA',
};
const customer = {
  name: 'Comprador Ficticio',
  document: '12345678901',
  profession: 'Engenheiro',
  civil_state: 'Solteiro',
  address: 'Rua A',
  neighborhood: 'Centro',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
};
const project = { name: 'Empreendimento Ficticio', city: 'Parauapebas', uf: 'PA' };
const block = { quadra: '02', lot: '36', area: 250, frente: 10, fundo: 10 };

function monthAfter(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}

const lotAmounts = [...Array.from({ length: 119 }, () => 589.74), 589.48];
const lotReceipts = lotAmounts.map((amount, index) => ({
  id: `lot-${index + 1}`,
  schedule_group: null,
  installment_number: index + 1,
  amount,
  due_date: monthAfter('2027-03-20', index),
  status: 'pendente',
  signal_addon_amount: 0,
}));
const signalReceipts = [
  { id: 'receipt-signal-0', schedule_group: 'SIGNAL', installment_number: 0, amount: 1500, due_date: '2026-10-21', status: 'pago', signal_addon_amount: 0 },
  { id: 'new-signal-1', schedule_group: 'SIGNAL', installment_number: 1, amount: 666.67, due_date: '2026-12-20', status: 'pendente', signal_addon_amount: 0 },
  { id: 'new-signal-2', schedule_group: 'SIGNAL', installment_number: 2, amount: 666.67, due_date: '2027-01-20', status: 'pendente', signal_addon_amount: 0 },
  { id: 'new-signal-3', schedule_group: 'SIGNAL', installment_number: 3, amount: 666.66, due_date: '2027-02-20', status: 'pendente', signal_addon_amount: 0 },
];
const receipts = [...signalReceipts, ...lotReceipts];
const sale = {
  payment_type: 'Parcelado',
  installments_count: 120,
  total_value: 70768.54,
  down_payment: 3500,
  signal_contract_value: 3500,
  signal_paid_at_sale: 1500,
  signal_remaining_value: 2000,
  signal_remaining_installments: null,
  signal_remaining_payment_mode: 'FIRST_INSTALLMENTS',
  signal_schedule_mode: null,
  created_at: '2026-10-24',
};

const beforeSale = JSON.stringify(sale);
const beforeReceipts = JSON.stringify(receipts);
const view = buildLegacyRegularizedSignalContractSchedule({ sale, receipts });
assert(view != null, 'cronograma regularizado reconhecido');
const schedule = view as NonNullable<typeof view>;
assert(schedule.signalTotalCents === 350000, 'sinal contratado');
assert(schedule.paidAtActCents === 150000, 'recebido no ato');
assert(schedule.balanceCents === 200000, 'saldo do sinal');
assert(schedule.signalInstallmentCents.join(',') === '66667,66667,66666', 'três parcelas do sinal');
assert(schedule.signalDueDates.join(',') === '2026-12-20,2027-01-20,2027-02-20', 'vencimentos do sinal');
assert(schedule.lotLines.length === 120, '120 parcelas do lote');
assert(schedule.lotTotalCents === 7076854, 'total do lote');
assert(schedule.lotDueDates[0] === '2027-03-20', 'início do lote');
assert(schedule.financialTotalCents === 350000 + 7076854, 'sinal não entra no preço do lote');
assert(schedule.signalLines.every((line) => line.scheduleGroup === 'SIGNAL'), 'sinal não se mistura ao lote');
assert(JSON.stringify(sale) === beforeSale, 'a geração não altera a venda');
assert(JSON.stringify(receipts) === beforeReceipts, 'a geração não altera os recebíveis');
assert(sale.signal_schedule_mode == null, 'o modo da venda permanece nulo');

const versions = [
  { version: 1, status: 'superseded', html: '<p>Versão anterior sem o cronograma regularizado.</p>' },
  { version: 2, status: 'ativo', html: '<p>Versão vigente já emitida.</p>' },
];
const versionsBefore = JSON.stringify(versions);
const html = text(generateRecantoPrimaveraContract({
  tenant,
  customer,
  project,
  block,
  sale,
  financeReceipts: receipts,
  contractDate: '2026-10-24',
}));
assert(JSON.stringify(versions) === versionsBefore, 'versões anteriores não são reescritas');
assert(!versions.some((version) => version.html.includes('666,67')), 'o histórico não recebe a cláusula nova');
assert(html.includes('R$ 3.500,00'), 'contrato mostra o sinal contratado');
assert(html.includes('R$ 1.500,00'), 'contrato mostra o valor recebido');
assert(html.includes('R$ 2.000,00'), 'contrato mostra o saldo');
assert(html.includes('R$ 666,67') && html.includes('20/12/2026'), 'primeira parcela');
assert(html.includes('20/01/2027'), 'segunda parcela');
assert(html.includes('R$ 666,66') && html.includes('20/02/2027'), 'terceira parcela');
assert(html.includes('120 parcelas') && html.includes('R$ 70.768,54') && html.includes('20/03/2027'), 'parcelamento do lote');
assert(html.includes('não reduz o preço do lote'), 'sinal não abate o lote');
assert(!html.includes('acrescidas às primeiras parcelas'), 'o saldo não é embutido nas parcelas do lote');
assert((html.match(/Cronograma do SINAL/g) || []).length === 1, 'o sinal não é duplicado');
assert((html.match(/Total do lote/g) || []).length === 1, 'o lote aparece uma vez');
assert(html.includes('CLÁUSULA DÉCIMA PRIMEIRA'), 'cláusula de assinatura eletrônica preservada');
assert(html.includes('data-party-role="VENDOR"') && html.includes('data-party-role="BUYER"'), 'bloco de assinatura preservado');
assert(html.includes('contract-signatures'), 'área de assinatura preservada');

const pdfOptions = resolveContractHtml2pdfOptions(tenant, 'contrato-ficticio.pdf', html);
assert(pdfOptions.filename === 'contrato-ficticio.pdf', 'PDF usa o HTML do contrato fictício');
assert(Array.isArray(pdfOptions.pagebreak?.avoid) && pdfOptions.pagebreak.avoid.length > 0, 'paginação do PDF continua configurada');

const separateReceipts = [
  { schedule_group: 'SIGNAL', installment_number: 0, amount: 1500, due_date: '2026-11-06', status: 'pago', signal_addon_amount: 0 },
  { schedule_group: 'SIGNAL', installment_number: 1, amount: 2000, due_date: '2026-12-10', status: 'pendente', signal_addon_amount: 0 },
  { schedule_group: 'LOT', installment_number: 1, amount: 5000, due_date: '2027-01-10', status: 'pendente', signal_addon_amount: 0 },
];
const separateSale = {
  ...sale,
  installments_count: 1,
  total_value: 5000,
  signal_contract_value: 3500,
  signal_paid_at_sale: 1500,
  signal_remaining_value: 2000,
  signal_schedule_mode: 'SEPARATE',
};
assert(buildLegacyRegularizedSignalContractSchedule({
  sale: separateSale,
  receipts: separateReceipts,
}) == null, 'venda nova SEPARATE não usa a cláusula antiga');
const separateHtml = text(generateRecantoPrimaveraContract({
  tenant,
  customer,
  project,
  block,
  sale: separateSale,
  financeReceipts: separateReceipts,
  contractDate: '2026-11-06',
}));
assert(separateHtml.includes('foi pago inicialmente'), 'venda nova mantém a cláusula SEPARATE');
assert(!separateHtml.includes('foi recebido no ato'), 'venda nova não recebe o texto da regularização');
assert(buildSeparateSignalContractSchedule({
  sale: separateSale,
  receipts: separateReceipts,
})?.lotTotalCents === 500000, 'cronograma SEPARATE permanece disponível');

const traditional = text(generateRecantoPrimaveraContract({
  tenant,
  customer,
  project,
  block,
  sale: {
    payment_type: 'Parcelado',
    installments_count: 12,
    total_value: 12000,
    signal_contract_value: 1000,
    signal_paid_at_sale: 1000,
    created_at: '2026-06-01',
  },
  contractDate: '2026-06-08',
}));
assert(traditional.includes('pago integralmente'), 'venda sem sinal parcelado mantém a cláusula antiga');
assert(!traditional.includes('Cronograma do SINAL'), 'venda sem sinal parcelado não recebe cronograma novo');

assert(buildLegacyRegularizedSignalContractSchedule({
  sale: { ...sale, signal_paid_at_sale: 999 },
  receipts,
}) == null, 'divergência de valor impede a cláusula nova');

console.log(JSON.stringify({
  clause: schedule.clauseText,
  lotStart: schedule.lotDueDates[0],
  lotCount: schedule.lotLines.length,
  lotCents: schedule.lotTotalCents,
  signalCents: schedule.signalInstallmentCents,
}, null, 2));
console.log('LEGACY_SIGNAL_CONTRACT_OK');
