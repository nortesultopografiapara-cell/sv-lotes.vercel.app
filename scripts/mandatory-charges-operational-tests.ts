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
  assert(page.includes('FINANCE_RECEIPTS_LIST_SELECT'), 'charges usa select compartilhado');

  const chargeService = fs.readFileSync(
    path.join(process.cwd(), 'lib/finance/asaasCompanyChargeService.ts'),
    'utf8',
  );
  assert(
    chargeService.includes('FINANCE_RECEIPTS_CHARGE_SELECT'),
    'create charge usa select explícito de finance_receipts',
  );
  assert(
    !chargeService.includes('customers(name, cpf'),
    'create charge não usa colunas inexistentes cpf/cnpj',
  );
  assert(
    chargeService.includes('resolveCustomerDocumentDigits'),
    'create charge resolve documento via campos reais',
  );

  const {
    FINANCE_RECEIPTS_CUSTOMER_FKEY,
    FINANCE_RECEIPTS_LIST_SELECT,
    FINANCE_RECEIPTS_CHARGE_SELECT,
    FINANCE_RECEIPTS_CHARGE_CUSTOMER_FIELDS,
  } = require('../lib/finance/financeReceiptsEmbed') as typeof import('../lib/finance/financeReceiptsEmbed');
  assert(
    FINANCE_RECEIPTS_CUSTOMER_FKEY === 'finance_receipts_customer_id_fkey',
    'FK customers explícita',
  );
  assert(
    FINANCE_RECEIPTS_LIST_SELECT.includes(`customers!${FINANCE_RECEIPTS_CUSTOMER_FKEY}`),
    'list select usa embed explícito de customers',
  );
  assert(
    FINANCE_RECEIPTS_CHARGE_SELECT.includes(`customers!${FINANCE_RECEIPTS_CUSTOMER_FKEY}`),
    'charge select usa embed explícito de customers',
  );
  assert(
    FINANCE_RECEIPTS_CHARGE_CUSTOMER_FIELDS.split(',').map((f) => f.trim()).includes('cpf_cnpj'),
    'charge select usa cpf_cnpj',
  );
  assert(
    !FINANCE_RECEIPTS_CHARGE_SELECT.includes(' cpf,') &&
      !FINANCE_RECEIPTS_CHARGE_SELECT.includes(' cnpj,') &&
      !FINANCE_RECEIPTS_CHARGE_SELECT.includes('(cpf,') &&
      !FINANCE_RECEIPTS_CHARGE_SELECT.includes(', cnpj'),
    'charge select não pede colunas cpf/cnpj separadas',
  );

  const {
    resolveCustomerDocumentDigits,
    isValidBrazilianTaxDocument,
  } = require('../lib/customerIdentity') as typeof import('../lib/customerIdentity');
  assert(
    resolveCustomerDocumentDigits({ cpf_cnpj: '123.456.789-01', document: null }) === '12345678901',
    'resolve documento de cpf_cnpj',
  );
  assert(
    resolveCustomerDocumentDigits({ cpf_cnpj: null, document: '12.345.678/0001-99' }) ===
      '12345678000199',
    'resolve documento de document',
  );
  assert(isValidBrazilianTaxDocument('12345678901'), 'CPF válido por tamanho');
  assert(isValidBrazilianTaxDocument('12345678000199'), 'CNPJ válido por tamanho');
  assert(!isValidBrazilianTaxDocument(''), 'documento vazio inválido');

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

  const withoutData = canGenerateAsaasCharge({
    installmentPaid: false,
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
    charge: null,
    installmentsDataReady: false,
    installmentId: 'inst-1',
  });
  assert(!withoutData, 'parcelas não carregadas desabilita geração');

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

function testIntegrationReadyWithLegacyDraftStatus() {
  const { isCompanyAsaasIntegrationReady } = require('../lib/finance/companyAsaasChargeTypes') as {
    isCompanyAsaasIntegrationReady: (config: Record<string, unknown>) => boolean;
  };
  const { buildAsaasSetupStatusCards } = require('../lib/finance/asaasIntegrationUiHelpers') as {
    buildAsaasSetupStatusCards: (config: Record<string, unknown>) => Array<{ id: string; status: string }>;
  };

  const legacyConfig = {
    connectionStatus: 'CONNECTED',
    status: 'DRAFT',
    environment: 'SANDBOX',
    hasSandboxApiKey: true,
    hasProductionApiKey: false,
    webhookActive: true,
    webhookConfigured: true,
    accountValidated: true,
  };

  assert(isCompanyAsaasIntegrationReady(legacyConfig), 'integração pronta com DRAFT legado');
  const cards = buildAsaasSetupStatusCards({
    id: 'int-1',
    companyId: 'co-1',
    companyName: 'SV Topografia',
    webhookUrl: 'https://example.com/webhook',
    hasWebhookToken: true,
    features: { pix: true, boleto: true, card: true, paymentLink: true, autoSync: true },
    sync: { lastAt: null, chargesCount: 0 },
    configuredAt: null,
    updatedAt: null,
    lastConnectionTestAt: '2026-06-01T00:00:00Z',
    lastConnectionError: null,
    ...legacyConfig,
  });
  const accountCard = cards.find((card) => card.id === 'account');
  assert(accountCard?.status === 'verified', 'Conta Asaas verificada quando integração pronta');
  console.log('OK testIntegrationReadyWithLegacyDraftStatus');
}

function testSavePreservesActiveStatus() {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const repo = fs.readFileSync(
    path.join(process.cwd(), 'lib/finance/asaasIntegrationRepository.ts'),
    'utf8',
  );
  assert(
    repo.includes('integrationId ? existing.status || \'DRAFT\' : \'DRAFT\''),
    'save preserva status ACTIVE em updates',
  );
  console.log('OK testSavePreservesActiveStatus');
}

function testChargesUsesSameIntegrationReadyRuleAsSettings() {
  const {
    resolveChargesIntegrationReady,
    countSelectedGeneratableCharges,
    countSelectedWithAsaasCharge,
  } = require('../lib/charges/chargeIntegrationHelpers') as typeof import('../lib/charges/chargeIntegrationHelpers');
  const { isAsaasIntegrationVerified } = require('../lib/finance/asaasIntegrationUiHelpers') as {
    isAsaasIntegrationVerified: (config: Record<string, unknown>) => boolean;
  };

  const legacyConfig = {
    id: 'int-1',
    companyId: 'co-1',
    companyName: 'SV Topografia',
    connectionStatus: 'CONNECTED',
    status: 'DRAFT',
    environment: 'SANDBOX',
    hasSandboxApiKey: true,
    hasProductionApiKey: false,
    webhookActive: true,
    webhookConfigured: true,
    accountValidated: true,
    webhookUrl: 'https://example.com/webhook',
    hasWebhookToken: true,
    features: { pix: true, boleto: true, card: true, paymentLink: true, autoSync: true },
    sync: { lastAt: null, chargesCount: 0 },
    configuredAt: null,
    updatedAt: null,
    lastConnectionTestAt: '2026-06-01T00:00:00Z',
    lastConnectionError: null,
  };

  assert(
    resolveChargesIntegrationReady(legacyConfig) === isAsaasIntegrationVerified(legacyConfig),
    'charges usa mesma regra de prontidão que Configurações',
  );
  assert(resolveChargesIntegrationReady(null, true), 'api ready flag ativa integração');
  assert(!resolveChargesIntegrationReady(null, false), 'sem config e sem flag = inativa');

  const generatable = countSelectedGeneratableCharges({
    selectedIds: new Set(['inst-1', 'inst-paid']),
    payments: [pendingRow, paidRow],
    chargesByInstallment: {},
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
  });
  assert(generatable === 1, 'apenas parcela pendente conta para geração em lote');

  const withCharge = countSelectedWithAsaasCharge(
    new Set(['inst-1', 'inst-paid']),
    { 'inst-1': charge({ status: 'PENDING' }) },
  );
  assert(withCharge === 1, 'contagem de parcelas com cobrança Asaas');

  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const pageClient = fs.readFileSync(
    path.join(process.cwd(), 'components/charges/ChargesPageClient.tsx'),
    'utf8',
  );
  const chargesPage = fs.readFileSync(
    path.join(process.cwd(), 'app/charges/page.tsx'),
    'utf8',
  );
  assert(pageClient.includes('resolveChargesIntegrationReady'), 'ChargesPageClient usa helper unificado');
  assert(
    pageClient.includes('loadIntegrationStatus'),
    'charges recarrega status da integração',
  );
  assert(pageClient.includes('loadError'), 'charges exibe erro de carregamento');
  assert(
    pageClient.includes('Nenhuma cobrança Asaas gerada para atualizar.'),
    'mensagem clara ao atualizar status sem cobrança',
  );
  assert(
    pageClient.includes('selectedGeneratableCount === 0'),
    'botão gerar desabilitado sem parcelas geráveis',
  );
  assert(
    pageClient.includes('selectedWithChargeCount === 0'),
    'botão atualizar status desabilitado sem cobrança',
  );
  assert(chargesPage.includes('resolveBankingUiEnabled'), 'charges recebe bankingUiEnabled do servidor');
  console.log('OK testChargesUsesSameIntegrationReadyRuleAsSettings');
}

function testCompanyAsaasPaidChargeReconcilesFinanceReceipt() {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const service = fs.readFileSync(
    path.join(process.cwd(), 'lib/finance/asaasCompanyChargeService.ts'),
    'utf8',
  );
  const reconciliation = fs.readFileSync(
    path.join(process.cwd(), 'lib/finance/companyAsaasPaymentReconciliation.ts'),
    'utf8',
  );
  const integrationService = fs.readFileSync(
    path.join(process.cwd(), 'lib/finance/asaasIntegrationService.ts'),
    'utf8',
  );

  assert(
    !service.includes("'PAID' || charge.status === 'CANCELLED'"),
    'status manual não retorna cedo quando cobrança já está PAID',
  );
  assert(
    service.includes('ensureCompanyAsaasInstallmentReconciled'),
    'sync manual garante baixa por installment_id',
  );
  assert(
    reconciliation.includes("status: 'pago'") && reconciliation.includes('paid_amount'),
    'conciliação baixa finance_receipts',
  );
  assert(
    reconciliation.includes('markFinanceReceiptPaidFromCompanyAsaasCharge'),
    'baixa finance_receipts dedicada',
  );
  assert(
    reconciliation.includes('ensureCompanyAsaasInstallmentReconciled'),
    'conciliação por installment_id',
  );
  assert(
    fs.readFileSync(path.join(process.cwd(), 'app/api/finance/asaas/charges/route.ts'), 'utf8')
      .includes('ensureCompanyAsaasInstallmentReconciledIfNeeded'),
    'listagem de cobranças faz backfill da parcela',
  );
  assert(
    fs.readFileSync(path.join(process.cwd(), 'app/api/finance/asaas/charge-status/route.ts'), 'utf8')
      .includes('receiptUpdated'),
    'status manual retorna receiptUpdated',
  );
  assert(
    integrationService.includes('reprocessCompanyAsaasPaidCharges'),
    'Configurações reprocessa cobranças Company pagas',
  );

  const {
    isCompanyAsaasChargeFullyReconciled,
    isCompanyAsaasPaidWebhookEvent,
  } = require('../lib/finance/companyAsaasPaymentReconciliation') as typeof import('../lib/finance/companyAsaasPaymentReconciliation');

  assert(
    isCompanyAsaasChargeFullyReconciled({
      chargeStatus: 'PAID',
      receiptStatus: 'pago',
      cashMovementId: 'cm-1',
    }),
    'cobrança totalmente conciliada',
  );
  assert(
    !isCompanyAsaasChargeFullyReconciled({
      chargeStatus: 'PAID',
      receiptStatus: 'pendente',
      cashMovementId: 'cm-1',
    }),
    'cobrança paga com parcela pendente precisa reprocessar',
  );
  assert(
    !isCompanyAsaasChargeFullyReconciled({
      chargeStatus: 'PENDING',
      receiptStatus: 'pendente',
      cashMovementId: null,
    }),
    'cobrança pendente não concilia parcela',
  );
  assert(isCompanyAsaasPaidWebhookEvent('PAYMENT_RECEIVED'), 'webhook recebido concilia');

  console.log('OK testCompanyAsaasPaidChargeReconcilesFinanceReceipt');
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
  testIntegrationReadyWithLegacyDraftStatus();
  testSavePreservesActiveStatus();
  testChargesUsesSameIntegrationReadyRuleAsSettings();
  testCompanyAsaasPaidChargeReconcilesFinanceReceipt();
  console.log('mandatory-charges-operational-tests: all passed');
}

main();
