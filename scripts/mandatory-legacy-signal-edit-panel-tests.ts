/**
 * Integração da regularização na edição da venda. Sem banco e sem a venda real.
 * npx tsx scripts/mandatory-legacy-signal-edit-panel-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  financialPicture,
  previewLegacySignalRegularization,
  type LegacySignalActor,
  type LegacySignalState,
} from '../lib/finance/legacySignalRegularization';
import {
  findReceiptByInstallmentNumber,
  separateScheduleChargeAllowed,
} from '../lib/finance/recantoReceiptSchedule';
import { formatFinanceParcelLabel } from '../lib/finance/separateScheduleParcelLabel';
import { isDevelopHomologRuntime } from '../lib/homolog/env';
import { legacySignalParcelActionVisible } from '../lib/finance/legacySignalParcelAction';
import { planExplicitSeparateSignalEdit, planSeparatedSignalScheduleEdit } from '../lib/saleEditFinanceRecalc';
import { planReceiptPaymentReversal } from '../lib/finance/reverseReceiptPayment';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const modal = fs.readFileSync(path.join(root, 'components', 'map', 'CustomerLotFormModal.tsx'), 'utf8');
const dialog = fs.readFileSync(path.join(root, 'components', 'finance', 'ReversePaymentDialog.tsx'), 'utf8');
const reversal = fs.readFileSync(path.join(root, 'lib', 'finance', 'reverseReceiptPayment.ts'), 'utf8');
const finance = fs.readFileSync(path.join(root, 'app', 'finance', 'page.tsx'), 'utf8');
const financeRow = fs.readFileSync(path.join(root, 'components', 'finance', 'FinancePremiumUI.tsx'), 'utf8');
const saleEdit = fs.readFileSync(path.join(root, 'lib', 'saleEdit.ts'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'components', 'Layout.tsx'), 'utf8');
const formStart = modal.indexOf('<form id="customer-lot-form"');
const formEnd = modal.indexOf('</form>', formStart);
assert(formStart > 0 && formEnd > formStart, 'formulário da venda localizado');
assert(!modal.includes('LegacySignalRegularizationPanel'), 'o painel amarelo saiu da edição da venda');
assert(!fs.existsSync(path.join(root, 'components', 'finance', 'LegacySignalRegularizationPanel.tsx')), 'o painel amarelo foi removido');
assert(!fs.existsSync(path.join(root, 'app', 'finance', 'regularizar-sinal', 'page.tsx')), 'a rota antiga foi removida');
assert(!layout.includes('/finance/regularizar-sinal'), 'o menu Regularizar sinal foi removido');
assert(modal.includes('Saldo do sinal em parcelas separadas do lote'), 'a edição mostra o saldo já separado');
assert(modal.includes('persist_separate_signal_schedule'), 'a edição grava o saldo separado do lote');
assert(!modal.slice(formStart, formEnd).includes('legacy-signal-regularization'), 'salvar a venda não chama a regularização');
assert(!finance.includes('LegacySignalCorrectionDialog'), 'a tela paralela saiu do Financeiro');
assert(finance.includes('ReversePaymentDialog') && financeRow.includes('title="Estornar pagamento"'), 'o estorno fica nas parcelas');
assert(saleEdit.includes('planExplicitSeparateSignalEdit'), 'salvar grava as parcelas do sinal');
assert(saleEdit.includes("rpc('apply_sale_edit_finance'"), 'a edição grava venda e parcelas na mesma função');
assert(!saleEdit.includes('Erro ao incluir parcela do cronograma'), 'a edição não grava parcelas uma a uma');
const reversalRoute = fs.readFileSync(path.join(root, 'app', 'api', 'finance', 'receipt-payment-reversal', 'route.ts'), 'utf8');
const reversalSql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261117233000_receipt_reversal_and_sale_edit_finance.sql'), 'utf8');
assert(reversalRoute.includes("rpc('execute_receipt_payment_reversal'"), 'o estorno confirma pela função do banco');
assert(!reversalRoute.includes("status: 'estornado'"), 'o estorno não grava o caixa fora da transação');
assert(reversalSql.includes('pg_advisory_xact_lock'), 'a função serializa a mesma venda');
assert(!reversalSql.includes('DELETE FROM public.cash_movements'), 'o caixa não é apagado');
assert(reversalSql.includes('Parcela paga ou com cobrança bancária'), 'parcela protegida bloqueia a edição inteira');
assert(!reversalSql.includes('entity_type') && !reversalSql.includes('old_data') && !reversalSql.includes('new_data'), 'a auditoria usa só colunas existentes');
assert(reversalRoute.includes('functionNotInApi'), 'só a ausência no cache da API vira função indisponível');
assert(!reversalRoute.includes('execute_receipt_payment_reversal|schema cache|does not exist'), 'erro de coluna não é tratado como função ausente');
assert(saleEdit.includes('preparedPayloads = buildSaleEditFinancePayloads'), 'a edição prepara o cronograma antes de gravar');

assert(dialog.includes('/api/finance/receipt-payment-reversal'), 'consulta e confirma o estorno');
assert(dialog.includes('confirm: false') && dialog.includes('confirm: true'), 'confirmação explícita separada da consulta');
assert(dialog.includes('type="button"'), 'os botões do estorno não submetem outro formulário');
assert(!dialog.includes('regenerateContract') && !dialog.includes('needs_regenerar'), 'o estorno não regenera o contrato');
assert(dialog.includes("new Event('finance_updated')"), 'atualiza a visualização financeira');
assert(reversal.includes('será estornado e não apagado'), 'caixa existente é estornado');
assert(reversal.includes('Há cobrança bancária vinculada'), 'cobrança bancária bloqueia o estorno');
assert(reversal.includes('Há recibo emitido'), 'recibo emitido bloqueia o estorno');

const paidSignal = {
  installment_number: 0,
  status: 'pago',
  amount: 3500,
  paid_amount: 3500,
  paid_at: '2026-10-24T14:12:49.000Z',
  schedule_group: null,
  sales: { status: 'ACTIVE' },
};
assert(legacySignalParcelActionVisible(paidSignal), 'parcela antiga paga aparece na ação');
assert(!legacySignalParcelActionVisible({ ...paidSignal, installment_number: 1 }), 'parcela do lote não aparece');
assert(!legacySignalParcelActionVisible({ ...paidSignal, schedule_group: 'SIGNAL' }), 'sinal já separado não aparece');
assert(!legacySignalParcelActionVisible({ ...paidSignal, sales: { status: 'cancelada' } }), 'venda encerrada não aparece');
assert(!legacySignalParcelActionVisible(paidSignal, { asaasStatus: 'PENDING' }), 'cobrança Asaas oculta a ação');
assert(legacySignalParcelActionVisible(paidSignal, { asaasStatus: 'CANCELLED' }), 'cobrança cancelada não impede a ação');

const reversalPlan = planReceiptPaymentReversal({
  receipt: { id: 'receipt-1', amount: 3500, paidAmount: 3500, paidAt: '2026-10-24T14:12:49.000Z', status: 'pago' },
  cash: [{ id: 'cash-1', receiptId: 'receipt-1', status: 'ativo' }],
  bankCharges: [],
  asaasCharges: [],
  commissions: [],
  reason: 'O valor recebido foi menor que o lançado.',
});
assert(reversalPlan.ok && reversalPlan.cashIds[0] === 'cash-1', 'estorno devolve o caixa para reversão');
assert(reversalPlan.previous?.paidAt === '2026-10-24T14:12:49.000Z', 'estorno conserva a data anterior na auditoria');
const blockedBank = planReceiptPaymentReversal({
  receipt: { id: 'receipt-1', amount: 3500, paidAmount: 3500, paidAt: '2026-10-24', status: 'pago' },
  cash: [],
  bankCharges: [{ id: 'bank-1', receiptId: 'receipt-1', status: 'PENDING' }],
  asaasCharges: [],
  commissions: [],
  reason: 'Tentativa com cobrança bancária.',
});
assert(!blockedBank.ok, 'cobrança bancária impede o estorno');
const alreadyPending = planReceiptPaymentReversal({
  receipt: { id: 'receipt-1', amount: 1500, paidAmount: null, paidAt: null, status: 'pendente' },
  cash: [],
  bankCharges: [],
  asaasCharges: [],
  commissions: [],
  reason: 'Segunda execução do estorno.',
});
assert(!alreadyPending.ok, 'segunda execução não estorna de novo');

const separateEdit = planExplicitSeparateSignalEdit({
  receipts: [{
    id: 'signal-act',
    installment_number: 0,
    amount: 3500,
    due_date: '2026-10-24',
    status: 'pendente',
    schedule_group: null,
  }, {
    id: 'lot-1',
    installment_number: 1,
    amount: 589.74,
    due_date: '2027-03-20',
    status: 'pendente',
    schedule_group: null,
  }],
  protectedIds: new Set(),
  lotPayloads: [{
    installment_number: 1,
    amount: 589.74,
    due_date: '2027-03-20',
    status: 'pendente',
    tenant_id: 'tenant',
    sale_id: 'sale',
  }],
  paidAtAct: 1500,
  actDueDate: '2026-10-24',
  balance: [
    { amount: 666.67, dueDate: '2026-12-20' },
    { amount: 666.67, dueDate: '2027-01-20' },
    { amount: 666.66, dueDate: '2027-02-20' },
  ],
});
assert(separateEdit.blocked === null, 'edição após o estorno grava o novo sinal');
assert(separateEdit.updates.some((row) => row.id === 'signal-act' && row.amount === 1500 && row.status === 'pago' && row.schedule_group === 'SIGNAL'), 'o valor recebido fica na parcela do sinal');
assert(separateEdit.inserts.filter((row) => row.schedule_group === 'SIGNAL' && Number(row.installment_number) > 0).length === 3, 'o saldo vira três parcelas');
assert(!separateEdit.updates.some((row) => row.id === 'lot-1' && row.amount != null && Math.abs(Number(row.amount) - 589.74) > 0.009), 'o saldo não entra na parcela do lote');
assert(separateEdit.updates.some((row) => row.id === 'lot-1' && row.schedule_group === 'LOT'), 'a parcela pendente do lote fica no grupo LOT');
const separateWithoutLotTemplate = planExplicitSeparateSignalEdit({
  receipts: [{
    id: 'signal-act',
    installment_number: 0,
    amount: 3500,
    due_date: '2026-10-24',
    status: 'pendente',
  }, {
    id: 'lot-1',
    installment_number: 1,
    amount: 589.74,
    due_date: '2026-11-25',
    status: 'pendente',
  }],
  protectedIds: new Set(),
  lotPayloads: [],
  signalTemplate: {
    installment_number: 0,
    amount: 0,
    due_date: '2026-10-24',
    status: 'pendente',
    tenant_id: 'tenant',
    sale_id: 'sale',
    customer_id: 'customer',
  },
  paidAtAct: 1500,
  actDueDate: '2026-10-24',
  balance: [
    { amount: 666.67, dueDate: '2026-12-20' },
    { amount: 666.67, dueDate: '2027-01-20' },
    { amount: 666.66, dueDate: '2027-02-20' },
  ],
});
assert(separateWithoutLotTemplate.blocked === null, 'o saldo do sinal não depende de parcela do lote');
assert(separateWithoutLotTemplate.deleteIds.length === 0, 'a ausência do modelo não apaga as parcelas do lote');
assert(separateWithoutLotTemplate.inserts.filter((row) => row.schedule_group === 'SIGNAL').length === 3, 'as três parcelas do saldo são criadas');
const paidConflict = planExplicitSeparateSignalEdit({
  receipts: [{
    id: 'signal-act',
    installment_number: 0,
    amount: 3500,
    due_date: '2026-10-24',
    status: 'pago',
    paid_at: '2026-10-24',
    schedule_group: null,
  }],
  protectedIds: new Set(),
  lotPayloads: [{ installment_number: 1, amount: 589.74, due_date: '2027-03-20', status: 'pendente' }],
  paidAtAct: 1500,
  actDueDate: '2026-10-24',
  balance: [{ amount: 2000, dueDate: '2026-12-20' }],
});
assert(paidConflict.blocked != null && paidConflict.updates.length === 0, 'parcela paga bloqueia a alteração e não salva parcialmente');

const openLot = {
  id: 'lot-open',
  installment_number: 1,
  amount: 589.74,
  due_date: '2027-03-20',
  status: 'pendente',
  schedule_group: null,
};
const paidLot = {
  id: 'lot-paid',
  installment_number: 2,
  amount: 589.74,
  due_date: '2027-04-20',
  status: 'pago',
  paid_at: '2027-04-20',
  schedule_group: null,
};
const chargedLot = {
  id: 'lot-charged',
  installment_number: 3,
  amount: 589.74,
  due_date: '2027-05-20',
  status: 'pendente',
  schedule_group: null,
};
const signalPaid = {
  id: 'signal-paid',
  installment_number: 0,
  amount: 1500,
  due_date: '2026-10-24',
  status: 'pago',
  paid_at: '2026-10-24',
  schedule_group: 'SIGNAL',
};
const signalOpen = {
  id: 'signal-open',
  installment_number: 1,
  amount: 666.67,
  due_date: '2026-12-20',
  status: 'pendente',
  schedule_group: 'SIGNAL',
};
const receipts = [signalPaid, signalOpen, openLot, paidLot, chargedLot];
const nextLots = [
  { installment_number: 1, amount: 600, due_date: '2027-06-20', status: 'pendente' },
  { installment_number: 2, amount: 589.74, due_date: '2027-07-20', status: 'pendente' },
  { installment_number: 3, amount: 589.74, due_date: '2027-08-20', status: 'pendente' },
];
const edited = planSeparatedSignalScheduleEdit({
  receipts,
  protectedIds: new Set(['lot-charged']),
  lotPayloads: nextLots,
  signalDueDates: { 'signal-open': '2026-12-25' },
});
assert(edited.blocked === null, 'parcelas em aberto podem ser editadas');
assert(edited.updates.some((row) => row.id === 'lot-open' && row.amount === 600 && row.due_date === '2027-06-20'), 'parcela em aberto recebe valor e vencimento');
assert(!edited.updates.some((row) => row.id === 'lot-paid' || row.id === 'lot-charged'), 'paga e cobrada permanecem');
assert(edited.updates.some((row) => row.id === 'signal-open' && row.due_date === '2026-12-25' && row.amount == null), 'vencimento do saldo muda sem alterar o valor');
assert(!edited.deleteIds.includes('signal-paid') && !edited.deleteIds.includes('signal-open'), 'as parcelas do sinal não são apagadas');
const blockedAmount = planSeparatedSignalScheduleEdit({
  receipts,
  protectedIds: new Set(),
  lotPayloads: nextLots.map((row) => row.installment_number === 2 ? { ...row, amount: 1 } : row),
});
assert(blockedAmount.blocked != null && blockedAmount.updates.length === 0, 'valor de parcela paga bloqueia a gravação');
const blockedCharge = planSeparatedSignalScheduleEdit({
  receipts,
  protectedIds: new Set(['lot-charged']),
  lotPayloads: nextLots.map((row) => row.installment_number === 3 ? { ...row, amount: 1 } : row),
});
assert(blockedCharge.blocked != null, 'valor de parcela com cobrança bloqueia a gravação');
const droppedPaid = planSeparatedSignalScheduleEdit({
  receipts,
  protectedIds: new Set(),
  lotPayloads: nextLots.filter((row) => row.installment_number !== 2),
});
assert(droppedPaid.blocked != null, 'reduzir a quantidade não remove parcela paga');

const company = '11111111-1111-4111-8111-111111111111';
const admin: LegacySignalActor = { id: 'admin-1', tenantId: company, role: 'ADMIN', status: 'ACTIVE' };
const lotAmounts = [...Array.from({ length: 119 }, () => 58974), 58948];
const saleId = 'sale-ficticia';
const state: LegacySignalState = {
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
      paidAt: '2026-10-24',
      status: 'pago',
      scheduleGroup: null,
      financialAccountId: null,
    },
    ...lotAmounts.map((amountCents, index) => ({
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
      dueDate: '2027-03-20',
      amountCents,
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

const preview = previewLegacySignalRegularization(state, admin, {
  receivedCents: 150000,
  installments: [
    { dueDate: '2026-12-20', amountCents: 66667 },
    { dueDate: '2027-01-20', amountCents: 66667 },
    { dueDate: '2027-02-20', amountCents: 66666 },
  ],
  reason: 'Regularização fictícia do sinal antigo.',
  requestKey: 'painel-edicao-0001',
  confirm: false,
});
assert(preview.ok, 'prévia fictícia aceita');
assert(preview.after?.signalPaidCents === 150000, 'recebido fica 1500');
assert(preview.after?.signalPendingCents === 200000, 'saldo fica 2000');
assert(preview.after?.lotCents === 7076854 && preview.after.lotCount === 120, 'lote preservado na prévia');
assert(financialPicture(state).originalAmountCents === 350000, 'registro atual permanece 3500 antes da confirmação');

const sameNumber = [
  { saleId, installmentNumber: 1, scheduleGroup: 'SIGNAL', amountCents: 66667 },
  { saleId, installmentNumber: 1, scheduleGroup: null, amountCents: 58974 },
];
assert(
  formatFinanceParcelLabel({ installmentNumber: 1, scheduleGroup: 'SIGNAL', signalFutureCount: 3 }) === 'SINAL — Parcela 1/3',
  'rótulo do sinal',
);
assert(
  formatFinanceParcelLabel({ installmentNumber: 1, scheduleGroup: 'LOT', lotInstallmentCount: 120 }) === 'LOTE — Parcela 1/120',
  'rótulo do lote',
);
let ambiguous = false;
try {
  findReceiptByInstallmentNumber(sameNumber, saleId, 1);
} catch {
  ambiguous = true;
}
assert(ambiguous, 'número repetido não escolhe a parcela errada');
assert(separateScheduleChargeAllowed({ scheduleGroup: 'SIGNAL' }) === false, 'boleto do sinal bloqueado');
assert(separateScheduleChargeAllowed({ scheduleGroup: 'LOT' }) === false, 'boleto do lote separado bloqueado');
assert(isDevelopHomologRuntime('https://hoynysmynxncdlptuzub.supabase.co') === true, 'Develop bloqueia chamada externa');
assert(isDevelopHomologRuntime('https://aezktedncttwpqeunjej.supabase.co') === false, 'Production não usa o bloqueio de homologação');

const blocked = previewLegacySignalRegularization({
  ...state,
  cash: [{ id: 'cash-1', saleId, status: 'ativo' }],
}, admin, {
  receivedCents: 150000,
  installments: [
    { dueDate: '2026-12-20', amountCents: 66667 },
    { dueDate: '2027-01-20', amountCents: 66667 },
    { dueDate: '2027-02-20', amountCents: 66666 },
  ],
  reason: 'Regularização fictícia do sinal antigo.',
  requestKey: 'painel-edicao-0002',
  confirm: false,
});
assert(blocked.ok === false && blocked.blockers.includes('cash'), 'caixa bloqueia');

const otherCompany = previewLegacySignalRegularization(state, { ...admin, tenantId: '22222222-2222-4222-8222-222222222222' }, {
  receivedCents: 150000,
  installments: [
    { dueDate: '2026-12-20', amountCents: 66667 },
    { dueDate: '2027-01-20', amountCents: 66667 },
    { dueDate: '2027-02-20', amountCents: 66666 },
  ],
  reason: 'Regularização fictícia do sinal antigo.',
  requestKey: 'painel-edicao-0003',
  confirm: false,
});
assert(otherCompany.code === 'wrong_company', 'outra empresa é recusada');

console.log('LEGACY_SIGNAL_EDIT_PANEL_OK');
