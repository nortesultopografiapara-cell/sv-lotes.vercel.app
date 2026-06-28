/**
 * Central operacional de cobranças — Fase 2.
 * npx tsx scripts/mandatory-charges-operational-tests.ts
 */

import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';
import { resolveChargeInstallmentActionsProps } from '../components/charges/ChargeInstallmentActions';
import {
  canGenerateAsaasCharge,
  canPerformMutableAsaasActions,
  computeAsaasOperationalKpis,
  mapCreateChargeApiError,
  resolveAsaasStatusDisplayLabel,
} from '../lib/charges/chargeOperationsHelpers';
import { buildChargeInstallmentView } from '../lib/charges/chargeInstallmentHelpers';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const pendingRow = {
  id: 'inst-1',
  amount: 9,
  due_date: '2026-07-01',
  status: 'pendente',
  paid_amount: 0,
  paid_at: null,
  installment_number: 1,
};

const paidRow = {
  ...pendingRow,
  id: 'inst-paid',
  status: 'pago',
  paid_amount: 9,
  paid_at: '2026-06-01T12:00:00Z',
};

function charge(partial: Partial<CompanyAsaasChargeResponse>): CompanyAsaasChargeResponse {
  return {
    id: 'ch-1',
    companyId: 'co-1',
    customerId: 'cust-1',
    saleId: 'sale-1',
    installmentId: 'inst-1',
    asaasPaymentId: 'pay_1',
    billingType: 'PIX',
    status: 'PENDING',
    value: 9,
    dueDate: '2026-07-01',
    invoiceUrl: null,
    bankSlipUrl: null,
    pixQrCode: null,
    pixCopyPaste: null,
    paymentLink: null,
    paidAt: null,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    ...partial,
  };
}

function testPendingWithoutChargeShowsGenerate() {
  const actions = resolveChargeInstallmentActionsProps({
    view: buildChargeInstallmentView(pendingRow, null),
    charge: null,
    installmentPaid: false,
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
    busy: false,
  });
  assert(actions.showGenerate, 'botão gerar cobrança visível');
  assert(!actions.showOpenLink, 'sem link antes de gerar');
  assert(resolveAsaasStatusDisplayLabel(null) === 'Não gerada', 'status Não gerada');
  console.log('OK testPendingWithoutChargeShowsGenerate');
}

function testPaidInstallmentCannotGenerate() {
  const canGenerate = canGenerateAsaasCharge({
    installmentPaid: true,
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
    charge: null,
  });
  assert(!canGenerate, 'parcela paga não gera cobrança');

  const actions = resolveChargeInstallmentActionsProps({
    view: buildChargeInstallmentView(paidRow, null),
    charge: null,
    installmentPaid: true,
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
    busy: false,
  });
  assert(!actions.showGenerate, 'sem botão gerar para parcela paga');
  console.log('OK testPaidInstallmentCannotGenerate');
}

function testOwnerReadOnlyHidesMutableActions() {
  const existing = charge({
    paymentLink: 'https://pay.example/1',
    pixCopyPaste: '000201',
    status: 'PENDING',
  });
  const actions = resolveChargeInstallmentActionsProps({
    view: buildChargeInstallmentView(pendingRow, existing),
    charge: existing,
    installmentPaid: false,
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: true,
    busy: false,
  });
  assert(!actions.showGenerate, 'owner não gera');
  assert(!actions.showRefreshStatus, 'owner não atualiza status');
  assert(!actions.showCancel, 'owner não cancela');
  assert(!actions.showRegenerate, 'owner não regenera');
  assert(actions.showOpenLink, 'owner abre link');
  assert(actions.showCopyPix, 'owner copia pix');
  assert(!canPerformMutableAsaasActions({
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: true,
  }), 'owner sem ações mutáveis');
  console.log('OK testOwnerReadOnlyHidesMutableActions');
}

function testCreateChargeApiPathAndDuplicateGuard() {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const createRoute = fs.readFileSync(
    path.join(process.cwd(), 'app/api/finance/asaas/create-charge/route.ts'),
    'utf8',
  );
  assert(createRoute.includes('createCompanyInstallmentCharge'), 'create-charge usa serviço company');
  assert(createRoute.includes('installmentId'), 'create-charge exige installmentId');
  assert(createRoute.includes('authorizeCompanyAsaasRoute'), 'create-charge protegida');

  const page = fs.readFileSync(
    path.join(process.cwd(), 'components/charges/ChargesPageClient.tsx'),
    'utf8',
  );
  assert(page.includes('/api/finance/asaas/create-charge'), 'charges chama create-charge');
  assert(page.includes('/api/finance/asaas/charge-status'), 'charges chama charge-status');
  assert(page.includes('/api/finance/asaas/regenerate-charge'), 'charges chama regenerate-charge');

  const dupMsg = mapCreateChargeApiError('Esta parcela já foi paga.');
  assert(dupMsg.includes('parcela paga'), 'mapeia erro parcela paga');
  console.log('OK testCreateChargeApiPathAndDuplicateGuard');
}

function testAsaasStatusLabels() {
  assert(resolveAsaasStatusDisplayLabel(null) === 'Não gerada', 'não gerada');
  assert(resolveAsaasStatusDisplayLabel(charge({ status: 'PENDING' })) === 'Pendente', 'pendente');
  assert(resolveAsaasStatusDisplayLabel(charge({ status: 'PAID' })) === 'Recebida/Paga', 'paga');
  assert(resolveAsaasStatusDisplayLabel(charge({ status: 'OVERDUE' })) === 'Vencida', 'vencida');
  assert(resolveAsaasStatusDisplayLabel(charge({ status: 'CANCELLED' })) === 'Cancelada', 'cancelada');
  assert(resolveAsaasStatusDisplayLabel(charge({ status: 'FAILED' })) === 'Erro', 'erro');
  console.log('OK testAsaasStatusLabels');
}

function testActionsOnlyWhenDataExists() {
  const withPix = charge({
    status: 'PENDING',
    paymentLink: 'https://pay.example/1',
    pixCopyPaste: '000201',
    bankSlipUrl: 'https://boleto.example/1',
  });
  const actions = resolveChargeInstallmentActionsProps({
    view: buildChargeInstallmentView(pendingRow, withPix),
    charge: withPix,
    installmentPaid: false,
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
    busy: false,
  });
  assert(!actions.showGenerate, 'com cobrança ativa não mostra gerar');
  assert(actions.showOpenLink, 'link');
  assert(actions.showOpenBoleto, 'boleto');
  assert(actions.showCopyPix, 'pix');
  assert(actions.showCopyLink, 'copiar link');
  assert(actions.showWhatsApp, 'whatsapp stub');

  const withoutExtras = charge({ status: 'PENDING' });
  const minimal = resolveChargeInstallmentActionsProps({
    view: buildChargeInstallmentView(pendingRow, withoutExtras),
    charge: withoutExtras,
    installmentPaid: false,
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
    busy: false,
  });
  assert(!minimal.showOpenLink, 'sem link');
  assert(!minimal.showCopyPix, 'sem pix');
  console.log('OK testActionsOnlyWhenDataExists');
}

function testInactiveIntegrationDisablesGenerate() {
  const canGenerate = canGenerateAsaasCharge({
    installmentPaid: false,
    integrationActive: false,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
    charge: null,
  });
  assert(!canGenerate, 'integração inativa desabilita geração');

  const inactiveMsg = mapCreateChargeApiError('Integração Asaas inativa para esta empresa.');
  assert(inactiveMsg.includes('Integração Asaas não está ativa'), 'mensagem integração inativa');
  console.log('OK testInactiveIntegrationDisablesGenerate');
}

function testAsaasOperationalKpis() {
  const rows = [pendingRow, paidRow];
  const charges = {
    'inst-1': charge({ status: 'PENDING', value: 9 }),
  };
  const kpis = computeAsaasOperationalKpis(rows, charges);
  assert(kpis.qtyCobrancasEmitidas === 1, '1 cobrança emitida');
  assert(kpis.cobrancasEmitidas === 9, 'valor emitido');
  assert(kpis.qtyAguardandoGeracao === 0, 'inst-1 tem cobrança ativa');
  console.log('OK testAsaasOperationalKpis');
}

function testNoDuplicateWhenActiveChargeExists() {
  const active = charge({ status: 'REGISTERED' });
  const canGenerate = canGenerateAsaasCharge({
    installmentPaid: false,
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
    charge: active,
  });
  assert(!canGenerate, 'não gera duplicata com cobrança ativa');
  console.log('OK testNoDuplicateWhenActiveChargeExists');
}

function main() {
  testPendingWithoutChargeShowsGenerate();
  testPaidInstallmentCannotGenerate();
  testOwnerReadOnlyHidesMutableActions();
  testCreateChargeApiPathAndDuplicateGuard();
  testAsaasStatusLabels();
  testActionsOnlyWhenDataExists();
  testInactiveIntegrationDisablesGenerate();
  testAsaasOperationalKpis();
  testNoDuplicateWhenActiveChargeExists();
  console.log('mandatory-charges-operational-tests: all passed');
}

main();
