/**
 * Rótulos do sinal separado na listagem financeira. Sem banco e sem venda.
 * npx tsx scripts/mandatory-recanto-separate-signal-finance-label-tests.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  countFutureSignalInstallments,
  formatFinanceParcelLabel,
  futureSignalCountsBySale,
} from '../lib/finance/separateScheduleParcelLabel';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const saleId = 'sale-046';
const rows = [
  { saleId, scheduleGroup: 'SIGNAL', installmentNumber: 0, dueDate: '2026-11-06' },
  { saleId, scheduleGroup: 'SIGNAL', installmentNumber: 1, dueDate: '2026-12-10' },
  { saleId, scheduleGroup: 'SIGNAL', installmentNumber: 2, dueDate: '2027-01-10' },
  { saleId, scheduleGroup: 'SIGNAL', installmentNumber: 3, dueDate: '2027-02-10' },
  { saleId, scheduleGroup: 'SIGNAL', installmentNumber: 4, dueDate: '2027-03-10' },
  { saleId, scheduleGroup: 'SIGNAL', installmentNumber: 5, dueDate: '2027-04-10' },
  ...Array.from({ length: 120 }, (_, index) => ({
    saleId,
    scheduleGroup: 'LOT',
    installmentNumber: index + 1,
    dueDate: `lot-${index + 1}`,
  })),
  { saleId: 'old-sale', scheduleGroup: null, installmentNumber: 0, dueDate: '2024-01-10' },
  { saleId: 'old-sale', scheduleGroup: null, installmentNumber: 1, dueDate: '2024-02-10' },
  { saleId: 'embedded', scheduleGroup: null, installmentNumber: 3, dueDate: '2025-03-10' },
];

const signalCount = countFutureSignalInstallments(rows, saleId);
assert(signalCount === 5, 'o pagamento inicial entrou na contagem do sinal');
assert(futureSignalCountsBySale(rows).get(saleId) === 5, 'contagem por venda diferente de 5');
assert(futureSignalCountsBySale(rows).has('old-sale') === false, 'venda antiga ganhou contagem de sinal');

assert(
  formatFinanceParcelLabel({
    scheduleGroup: 'SIGNAL',
    installmentNumber: 0,
    lotInstallmentCount: 120,
    signalFutureCount: signalCount,
  }) === 'SINAL — Pagamento inicial',
  'pagamento inicial do sinal',
);
for (let number = 1; number <= 5; number += 1) {
  assert(
    formatFinanceParcelLabel({
      scheduleGroup: 'SIGNAL',
      installmentNumber: number,
      lotInstallmentCount: 120,
      signalFutureCount: signalCount,
    }) === `SINAL — Parcela ${number}/5`,
    `sinal ${number}/5`,
  );
}
assert(
  formatFinanceParcelLabel({
    scheduleGroup: 'LOT',
    installmentNumber: 1,
    lotInstallmentCount: 120,
    signalFutureCount: signalCount,
  }) === 'LOTE — Parcela 1/120',
  'primeira parcela do lote',
);
assert(
  formatFinanceParcelLabel({
    scheduleGroup: 'LOT',
    installmentNumber: 120,
    lotInstallmentCount: 120,
    signalFutureCount: signalCount,
  }) === 'LOTE — Parcela 120/120',
  'última parcela do lote',
);

assert(
  formatFinanceParcelLabel({
    scheduleGroup: null,
    installmentNumber: 0,
    lotInstallmentCount: 120,
  }) === 'Entrada',
  'entrada antiga',
);
assert(
  formatFinanceParcelLabel({
    scheduleGroup: null,
    installmentNumber: 1,
    lotInstallmentCount: 120,
    signalFutureCount: 5,
  }) === 'Parcela 1 / 120',
  'parcela antiga',
);
assert(
  formatFinanceParcelLabel({
    scheduleGroup: null,
    installmentNumber: 3,
    lotInstallmentCount: 120,
  }) === 'Parcela 3 / 120',
  'parcela EMBEDDED sem grupo',
);
assert(
  !formatFinanceParcelLabel({
    scheduleGroup: 'SIGNAL',
    installmentNumber: 1,
    signalFutureCount: 5,
  }).toLowerCase().includes('corretagem'),
  'rótulo renomeou o sinal',
);

const chronological = [...rows.filter((row) => row.saleId === saleId)].sort((a, b) => {
  const byDate = a.dueDate.localeCompare(b.dueDate);
  return byDate || a.installmentNumber - b.installmentNumber;
});
assert(chronological[0]?.scheduleGroup === 'SIGNAL' && chronological[0]?.installmentNumber === 0, 'ordem não começa no pagamento inicial');
assert(chronological[5]?.installmentNumber === 5, 'as cinco parcelas do sinal não ficam juntas');
assert(chronological[6]?.scheduleGroup === 'LOT' && chronological[6]?.installmentNumber === 1, 'o lote não segue o sinal');

const page = readFileSync(resolve('app/finance/page.tsx'), 'utf8');
const fetchSource = readFileSync(resolve('lib/finance/fetchFinanceReceiptsPaged.ts'), 'utf8');
const labelSource = readFileSync(resolve('lib/finance/separateScheduleParcelLabel.ts'), 'utf8');
assert(page.includes('futureSignalCountsBySale(payments.map'), 'a contagem usa a lista filtrada');
assert(page.includes('paginateFinanceReceiptRows(filteredPayments'), 'a paginação foi removida');
assert(page.includes("statusFilter !== 'Todas as Situações'"), 'o filtro de status foi removido');
assert(fetchSource.includes(".order('due_date', { ascending: true })"), 'a ordem deixou de ser cronológica');
assert(fetchSource.includes(".order('installment_number', { ascending: true })"), 'o desempate da parcela foi removido');
assert(!labelSource.includes('amount'), 'o rótulo altera valores');
assert(!labelSource.includes('.status'), 'o rótulo altera status');
assert(page.includes('localTotal += amt'), 'a soma financeira foi removida');

console.log('ok recanto separate signal finance labels');
