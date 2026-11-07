/**
 * Prévia em memória do sinal parcelado homologado.
 * Não grava venda, contrato, recebível nem cobrança.
 * npx tsx scripts/mandatory-recanto-separate-signal-homolog-values-tests.ts
 */
import { buildSeparateSignalContractSchedule } from '../lib/recantoSeparateSignalContract';
import { planRecantoSeparateSignalPersistence } from '../lib/recantoSeparateSignalPersistence';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function brl(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100)
    .replace(/\u00a0/g, ' ');
}

const plan = planRecantoSeparateSignalPersistence({
  featureEnabled: true,
  contractModel: 'RECANTO_PRIMAVERA',
  saleId: 'memoria-sinal-parcelado',
  tenantId: 'empresa-ficticia',
  customerId: 'cliente-ficticio',
  lotPrice: 70753.29,
  signalContract: 3500,
  paidAtAct: 1000,
  signalInstallmentCount: 5,
  actDate: '2026-11-06',
  signalFirstDueDate: '2026-12-06',
  lotInstallmentCount: 120,
  lotStartMode: 'AFTER_BROKERAGE',
});

const signal = plan.receipts.filter((row) => row.scheduleGroup === 'SIGNAL');
const lot = plan.receipts.filter((row) => row.scheduleGroup === 'LOT');
const paid = signal.filter((row) => row.installmentNumber === 0);
const future = signal.filter((row) => row.installmentNumber > 0);
const sum = plan.receipts.reduce((total, row) => total + row.amountCents, 0);

assert(signal.length === 6, 'recebíveis do sinal');
assert(lot.length === 120, 'recebíveis do lote');
assert(plan.receipts.length === 126, 'total de recebíveis');
assert(sum === 7425329, 'soma financeira');
assert(plan.charges.length === 0 && plan.cashMovements.length === 0, 'sem cobrança nem caixa');

assert(paid.length === 1 && paid[0].amountCents === 100000, 'pagamento no ato');
assert(paid[0].status === 'pago' && paid[0].paidAmountCents === 100000, 'ato já recebido');
assert(future.length === 5, 'cinco parcelas futuras');
assert(future.every((row) => row.amountCents === 50000 && row.status === 'pendente' && row.paidAmountCents === 0), 'saldo do sinal');
assert(future.map((row) => row.dueDate).join(',') === '2026-12-06,2027-01-06,2027-02-06,2027-03-06,2027-04-06', 'vencimentos do sinal');
assert(lot.filter((row) => row.amountCents === 58961).length === 119, 'parcelas regulares do lote');
assert(lot[119].amountCents === 58970 && lot[119].status === 'pendente', 'última parcela do lote');
assert(lot[0].dueDate === '2027-05-06', 'primeiro vencimento do lote');
assert(lot.every((row) => row.signalAddonAmountCents === 0 && row.paidAmountCents === 0), 'lote sem o sinal');
assert(!lot.some((row) => row.amountCents === 100000), 'ato não reaparece no lote');

const contract = buildSeparateSignalContractSchedule({
  sale: {
    signal_schedule_mode: 'SEPARATE',
    signal_contract_value: 3500,
    signal_paid_at_sale: 1000,
  },
  receipts: plan.receipts.map((row) => ({
    schedule_group: row.scheduleGroup,
    installment_number: row.installmentNumber,
    amount: row.amountCents / 100,
    due_date: row.dueDate,
    signal_addon_amount: 0,
  })),
});
assert(contract !== null, 'cláusula separada');
const clause = contract.clauseText.replace(/\u00a0/g, ' ');
assert(clause.includes(`a título de SINAL, o valor de ${brl(350000)}`), 'cláusula do sinal');
assert(clause.includes(`${brl(100000)} foi pago inicialmente`), 'pagamento inicial');
assert(clause.includes(`em 5 parcelas de ${brl(50000)}`), 'cinco parcelas');
assert(clause.includes('independente das parcelas do lote'), 'cronograma independente');
assert(clause.includes('não reduz o preço do lote'), 'sinal não abate o lote');
assert(!clause.toLowerCase().includes('corretagem'), 'vocabulário do contrato');
assert(contract.financialTotalCents === 7425329, 'total sem duplicidade');
assert(contract.signalTotalCents + contract.lotTotalCents === contract.financialTotalCents, 'soma única');
assert(contract.scheduleHtml.includes('06/12/2026') && contract.scheduleHtml.includes('06/04/2027'), 'datas do sinal');
assert(contract.scheduleHtml.includes('06/05/2027'), 'data do lote');

assert(buildSeparateSignalContractSchedule({
  sale: { signal_schedule_mode: 'EMBEDDED', signal_contract_value: 3500 },
  receipts: [],
}) === null, 'modalidade embutida preservada');
assert(buildSeparateSignalContractSchedule({
  sale: { signal_contract_value: 3500 },
  receipts: [],
}) === null, 'venda antiga preservada');

console.log(JSON.stringify({
  status: 'MEMORY_ONLY',
  persisted: false,
  signalReceipts: signal.length,
  lotReceipts: lot.length,
  receipts: plan.receipts.length,
  financialTotalCents: sum,
  actStatus: paid[0].status,
  futureSignalDue: future.map((row) => row.dueDate),
  lotFirstDue: lot[0].dueDate,
  lotLastCents: lot[119].amountCents,
  clause,
}));
