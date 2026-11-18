/**
 * Preservação do sinal antigo na edição da venda e rótulos de Cobranças.
 * Dados fictícios. Não grava banco e não usa a venda real.
 * npx tsx scripts/mandatory-legacy-signal-edit-preservation-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildChargeInstallmentView, chargeParcelLabelContext } from '../lib/charges/chargeInstallmentHelpers';
import { formatChargeParcelLabel } from '../lib/finance/separateScheduleParcelLabel';
import {
  executeLegacySignalRegularization,
  type LegacySignalActor,
  type LegacySignalState,
} from '../lib/finance/legacySignalRegularization';
import { SEPARATE_SIGNAL_RECALC_BLOCKED_MESSAGE } from '../lib/finance/recantoReceiptSchedule';
import {
  isLotScheduleReceipt,
  isPaidScheduleInstallment,
  isSignalScheduleReceipt,
  LEGACY_SIGNAL_EDIT_BLOCKED_MESSAGE,
  legacySignalPlanConflicts,
  planPartialFinanceRecalc,
  resolveFinanceScheduleEditLock,
  saleEditShouldRewriteReceipts,
  type FinanceReceiptRow,
} from '../lib/saleEditFinanceRecalc';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const company = '11111111-1111-4111-8111-111111111111';
const admin: LegacySignalActor = { id: 'admin-1', tenantId: company, role: 'ADMIN', status: 'ACTIVE' };
const lotAmounts = [...Array.from({ length: 119 }, () => 589.74), 589.48];

function cents(value: number): number {
  return Math.round(value * 100);
}

function regularizedState(): LegacySignalState {
  const saleId = 'sale-ficticia';
  return {
    sale: {
      id: saleId,
      tenantId: company,
      companyId: company,
      status: 'ACTIVE',
      signalScheduleMode: null,
      totalCents: 7076854,
      signalContractCents: 350000,
      signalPaidAtSaleCents: 150000,
      signalRemainingCents: 200000,
    },
    receipts: [
      {
        id: 'receipt-signal-0',
        saleId,
        tenantId: company,
        companyId: company,
        customerId: 'customer-ficticio',
        projectId: 'project-ficticio',
        blockId: 'lot-ficticio',
        brokerId: null,
        contractId: 'contract-ficticio',
        installmentNumber: 0,
        dueDate: '2026-10-21',
        amountCents: 350000,
        paidAmountCents: 350000,
        paidAt: '2026-10-24T14:12:49.000Z',
        status: 'pago',
        scheduleGroup: null,
        financialAccountId: null,
      },
      ...lotAmounts.map((amount, index) => ({
        id: `lot-${index + 1}`,
        saleId,
        tenantId: company,
        companyId: company,
        customerId: 'customer-ficticio',
        projectId: 'project-ficticio',
        blockId: 'lot-ficticio',
        brokerId: null,
        contractId: 'contract-ficticio',
        installmentNumber: index + 1,
        dueDate: index === 0 ? '2027-03-20' : '2027-04-20',
        amountCents: cents(amount),
        paidAmountCents: null,
        paidAt: null,
        status: 'pendente',
        scheduleGroup: null,
        financialAccountId: null,
      })),
    ],
    cash: [],
    bankCharges: [],
    asaasCharges: [],
    settlements: [],
    commissions: [],
    contracts: [{ id: 'contract-ficticio', saleId, version: 2 }],
    audits: [],
  };
}

const applied = executeLegacySignalRegularization(regularizedState(), admin, {
  receivedCents: 150000,
  installments: [
    { dueDate: '2026-12-20', amountCents: 66667 },
    { dueDate: '2027-01-20', amountCents: 66667 },
    { dueDate: '2027-02-20', amountCents: 66666 },
  ],
  reason: 'Saldo do sinal antigo ainda pendente.',
  requestKey: 'regularizacao-preservacao-01',
  confirm: true,
});
assert(applied.result.ok && applied.result.code === 'applied', 'regularização fictícia aplicada');
const signal = applied.state.receipts.filter((row) => row.scheduleGroup === 'SIGNAL');
assert(signal.length === 4, 'um sinal recebido e três parcelas');
assert(signal.find((row) => row.installmentNumber === 0)?.amountCents === 150000, 'recebido no ato');
assert(signal.filter((row) => row.installmentNumber > 0).reduce((sum, row) => sum + row.amountCents, 0) === 200000, 'saldo de 2000');
const lot = applied.state.receipts.filter((row) => row.scheduleGroup == null && row.installmentNumber >= 1);
assert(lot.length === 120, '120 parcelas do lote');
assert(lot.reduce((sum, row) => sum + row.amountCents, 0) === 7076854, 'lote permanece 70768,54');

const rows: FinanceReceiptRow[] = applied.state.receipts.map((row) => ({
  id: row.id,
  status: row.status,
  paid_at: row.paidAt,
  installment_number: row.installmentNumber,
  amount: row.amountCents / 100,
  paid_amount: row.paidAmountCents == null ? null : row.paidAmountCents / 100,
  due_date: row.dueDate,
  schedule_group: row.scheduleGroup,
}));

const firstLot = rows.find((row) => isLotScheduleReceipt(row) && Number(row.installment_number) === 1);
assert(firstLot?.id === 'lot-1' && firstLot.due_date === '2027-03-20', 'primeira parcela do lote continua visível');
assert(rows.filter((row) => isSignalScheduleReceipt(row)).every((row) => !isLotScheduleReceipt(row)), 'sinal não é parcela do lote');

const samePlan = planPartialFinanceRecalc(rows, [], 70768.54);
const signalIds = rows.filter((row) => isSignalScheduleReceipt(row)).map((row) => row.id);
assert(signalIds.every((id) => !samePlan.toDeleteIds.includes(id)), 'recálculo do lote não apaga o sinal');
const lotRewrite = planPartialFinanceRecalc(rows, [
  { installment_number: 0, amount: 3500, due_date: '2026-10-21', status: 'pendente' },
  { installment_number: 1, amount: 589.74, due_date: '2027-03-20', status: 'pendente' },
], 70768.54, { grossDownPayment: 3500, contractModel: 'RECANTO_PRIMAVERA' });
assert(!lotRewrite.toInsert.some((row) => row.installment_number <= 0), 'a entrada do sinal não é recriada');
assert(lotRewrite.toInsert.some((row) => row.installment_number === 1), 'a parcela do lote pode ser recriada');

assert(saleEditShouldRewriteReceipts({
  financePlanChanged: false,
  previousFirstDue: '2027-03-20',
  nextFirstDue: '2027-03-20',
  previousEntryDue: '2026-10-21',
  nextEntryDue: '2026-10-21',
}) === false, 'campo não financeiro não regrava parcelas');

const paidSignal = rows.map((row) => row.id === 'new-signal-1'
  ? { ...row, status: 'pago', paid_at: '2026-12-20', paid_amount: row.amount }
  : row);
const paidPlan = planPartialFinanceRecalc(paidSignal, [
  { installment_number: 1, amount: 589.74, due_date: '2027-03-20', status: 'pendente' },
], 70768.54);
assert(!paidPlan.toDeleteIds.includes('new-signal-1'), 'parcela paga do sinal conserva o id');
assert(paidPlan.toInsert.some((row) => row.installment_number === 1), 'parcela 1 do lote não é bloqueada pelo sinal pago');
assert(isPaidScheduleInstallment(paidSignal.find((row) => row.id === 'new-signal-1')!) === false, 'sinal pago não trava o lote');
assert(resolveFinanceScheduleEditLock({
  financePlanChanged: true,
  hasAsaasCharges: false,
  receipts: paidSignal.filter((row) => isSignalScheduleReceipt(row)),
}).blocked === false, 'histórico do sinal não bloqueia a edição do lote');

assert(legacySignalPlanConflicts(rows, { signalContractCents: 300000, paidAtSaleCents: 150000 }) === true, 'mudança do sinal é bloqueada');
assert(LEGACY_SIGNAL_EDIT_BLOCKED_MESSAGE.includes('Corrigir sinal antigo'), 'orientação para a rotina do Financeiro');
assert(legacySignalPlanConflicts(rows, { signalContractCents: 350000, paidAtSaleCents: 150000 }) === false, 'o mesmo sinal pode ser salvo');

const chargeRows = rows.map((row) => ({
  ...row,
  sale_id: 'sale-ficticia',
  sales: { installments_count: 120 },
}));
const labels = chargeParcelLabelContext(chargeRows);
const context = labels.get('sale-ficticia');
const labelOf = (id: string) => buildChargeInstallmentView(
  chargeRows.find((row) => row.id === id)!,
  null,
  '2026-11-17',
  undefined,
  context,
).parcelLabel;
assert(labelOf('receipt-signal-0') === 'Sinal — recebido no ato', 'rótulo do sinal recebido');
assert(labelOf('new-signal-1') === 'Sinal — parcela 1/3', 'rótulo da primeira parcela do sinal');
assert(labelOf('new-signal-2') === 'Sinal — parcela 2/3', 'rótulo da segunda parcela do sinal');
assert(labelOf('new-signal-3') === 'Sinal — parcela 3/3', 'rótulo da terceira parcela do sinal');
assert(labelOf('lot-1') === 'Lote — parcela 1/120', 'rótulo da primeira parcela do lote');

const separateRows: FinanceReceiptRow[] = [
  { id: 'new-signal-0', installment_number: 0, amount: 1500, status: 'pago', paid_at: '2026-11-01', schedule_group: 'SIGNAL' },
  { id: 'new-signal-1', installment_number: 1, amount: 1000, status: 'pendente', schedule_group: 'SIGNAL' },
  { id: 'new-lot-1', installment_number: 1, amount: 500, status: 'pendente', schedule_group: 'LOT' },
];
const separatePlan = planPartialFinanceRecalc(separateRows, [
  { installment_number: 1, amount: 500, due_date: '2027-03-20', status: 'pendente' },
], 500);
assert(separatePlan.toDeleteIds.join(',') === 'new-lot-1', 'sinal novo não entra no recálculo do lote');
assert(saleEditShouldRewriteReceipts({ financePlanChanged: false }) === false, 'venda nova sem mudança financeira preserva as parcelas');
assert(SEPARATE_SIGNAL_RECALC_BLOCKED_MESSAGE.includes('sinal separado'), 'mudança financeira do sinal novo continua bloqueada');

const plainRows: FinanceReceiptRow[] = [
  { id: 'plain-0', installment_number: 0, amount: 1000, status: 'pago', paid_at: '2026-11-01', schedule_group: null },
  { id: 'plain-1', installment_number: 1, amount: 500, status: 'pendente', schedule_group: null },
];
const plainPlan = planPartialFinanceRecalc(plainRows, [
  { installment_number: 1, amount: 500, due_date: '2027-03-20', status: 'pendente' },
], 1500);
assert(plainPlan.toDeleteIds.join(',') === 'plain-1', 'venda sem sinal parcelado continua recalculando o lote pendente');
assert(formatChargeParcelLabel({ installmentNumber: 0, lotInstallmentCount: 120 }) === 'Entrada', 'rótulo antigo da entrada');
assert(formatChargeParcelLabel({ installmentNumber: 1, lotInstallmentCount: 120 }) === 'Parcela 1 / 120', 'rótulo antigo da parcela');

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20261117120000_legacy_signal_regularization.sql'),
  'utf8',
);
assert(sql.includes("SET search_path = public"), 'search_path permanece fixo');
assert(!/UPDATE\s+public\.sales/i.test(sql), 'a função não altera a venda');
assert(!/signal_schedule_mode\s*=\s*'SEPARATE'/i.test(sql), 'a função não muda o modo do contrato');
assert(!/DELETE\s+FROM\s+public\.finance_receipts/i.test(sql), 'a função não apaga recebimentos');
assert(sql.includes('schedule_group = \'SIGNAL\''), 'as parcelas novas continuam no grupo SIGNAL');

console.log(JSON.stringify({
  signal: signal.map((row) => ({ id: row.id, number: row.installmentNumber, cents: row.amountCents, status: row.status })),
  firstLotDue: firstLot?.due_date,
  lotCount: lot.length,
  preservedSignalIds: signalIds,
  paidSignalKept: !paidPlan.toDeleteIds.includes('new-signal-1'),
  labels: ['receipt-signal-0', 'new-signal-1', 'new-signal-2', 'new-signal-3', 'lot-1'].map(labelOf),
}, null, 2));
console.log('LEGACY_SIGNAL_EDIT_PRESERVATION_OK');
