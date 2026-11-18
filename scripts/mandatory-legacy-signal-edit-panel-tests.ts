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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const modal = fs.readFileSync(path.join(root, 'components', 'map', 'CustomerLotFormModal.tsx'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'components', 'finance', 'LegacySignalRegularizationPanel.tsx'), 'utf8');
const formStart = modal.indexOf('<form id="customer-lot-form"');
const formEnd = modal.indexOf('</form>', formStart);
const panelAt = modal.indexOf('<LegacySignalRegularizationPanel');
assert(formStart > 0 && formEnd > formStart, 'formulário da venda localizado');
assert(panelAt > formEnd, 'a regularização fica fora do formulário Salvar alterações');
assert(modal.includes('suggestedReceived={formData.signal_paid_at_sale'), 'o valor recebido sugerido vem da venda aberta');
assert(modal.includes('saleId={saleId}'), 'a edição usa a venda selecionada');
assert(!modal.slice(formStart, formEnd).includes('legacy-signal-regularization'), 'salvar a venda não chama a regularização');

assert(panel.includes('/api/finance/legacy-signal-regularization/preview'), 'consulta a prévia existente');
assert(panel.includes('/api/finance/legacy-signal-regularization/execute'), 'confirma pela função existente');
assert(panel.includes('confirm: false') && panel.includes('confirm: true'), 'confirmação explícita separada da consulta');
assert(panel.includes("type=\"button\""), 'os botões da regularização não submetem a venda');
assert(panel.includes('needs_regenerar: true'), 'a regeneração apenas marca o contrato');
assert(!panel.includes('regenerateContract') && !panel.includes('contractRegeneration'), 'não regenera o texto do contrato');
assert(panel.includes("new Event('finance_updated')"), 'atualiza a visualização financeira');
assert(panel.includes('Há lançamento de caixa vinculado.'), 'bloqueio de caixa visível');
assert(panel.includes('Há cobrança bancária vinculada.'), 'bloqueio bancário visível');

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
