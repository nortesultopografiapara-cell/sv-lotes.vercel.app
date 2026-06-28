/**
 * Testes obrigatórios — Módulo Bancário MOCK (Fases 1 e 1.1).
 * npm run test:banking-mock
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  assertBankingModuleEnabled,
  assertIntegrationResponseSafe,
  clearMockBankProviderStateForTests,
  clearWebhookEventCacheForTests,
  decryptBankingSecret,
  encryptBankingSecret,
  getBankingEncryptionKeyDebugPayload,
  getBankingEncryptionKeyDiagnostics,
  isBankingModuleEnabled,
  isBankingModuleEnabledForUi,
  mockBankProvider,
  parseBankingEnvFlag,
  rejectNonMockProvider,
  resolveBankingUiEnabled,
  runMockCreateBoleto,
  runMockCreatePix,
  runMockTestConnection,
  getBankProvider,
  sicoobBankProvider,
  sicrediBankProvider,
  validateSicoobConfig,
  validateSicrediConfig,
  SICOOB_BOLETO_NOT_ENABLED_MESSAGE,
  SICOOB_PIX_NOT_ENABLED_MESSAGE,
  SICREDI_BOLETO_NOT_ENABLED_MESSAGE,
  SICREDI_PIX_NOT_ENABLED_MESSAGE,
} from '../lib/banking';
import {
  getPrimaryFinancialGateway,
  isFinancialGatewayProviderActive,
  listFinancialGatewayProviders,
} from '../lib/finance/FinancialGateway';
import { assertAsaasIntegrationResponseSafe } from '../lib/finance/asaasIntegrationRepository';
import { EMPTY_ASAAS_INTEGRATION_CONFIG, buildDefaultAsaasWebhookUrl } from '../lib/finance/asaasIntegrationConfig';
import {
  isAsaasIntegrationVerified,
  hasAsaasIntegrationStarted,
  buildAsaasSetupStatusCards,
} from '../lib/finance/asaasIntegrationUiHelpers';
import {
  mapAsaasPaymentStatusToCompanyCharge,
  isCompanyAsaasIntegrationReady,
} from '../lib/finance/companyAsaasChargeTypes';
import { assertCompanyAsaasChargeResponseSafe } from '../lib/finance/asaasCompanyChargeService';
import {
  assertCanCreateCompanyAsaasCharge,
  assertCanRegenerateCompanyAsaasCharge,
  formatCompanyAsaasChargeStatusLabel,
  isActiveCompanyAsaasChargeStatus,
  isRegeneratableCompanyAsaasChargeStatus,
  resolveCompanyAsaasBoletoUrl,
  resolveCompanyAsaasChargeWorkflowState,
  resolveCompanyAsaasPaymentLink,
  summarizeCompanyAsaasCharges,
} from '../lib/finance/companyAsaasChargeWorkflow';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';
import { EMPTY_BANK_INTEGRATION_CONFIG } from '../lib/banking/integrationConfig';

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const context = {
  integrationId: '11111111-1111-1111-1111-111111111111',
  companyId: '22222222-2222-2222-2222-222222222222',
  environment: 'SANDBOX' as const,
};

async function testMockCreatesBoleto(): Promise<void> {
  const result = await mockBankProvider.createBoleto(
    {
      companyId: context.companyId,
      integrationId: context.integrationId,
      financeReceiptId: '33333333-3333-3333-3333-333333333333',
      amount: 1500.5,
      dueDate: '2026-07-15',
      payerName: 'Cliente Teste',
      payerDocument: '00000000000',
      idempotencyKey: 'boleto-test-1',
    },
    context,
  );

  assert(result.status === 'PENDING', 'boleto status PENDING');
  assert(result.digitableLine.includes('75691'), 'linha digitável fictícia');
  assert(result.barcode.length === 44, 'código de barras 44 dígitos');
  assert(result.paymentUrl.startsWith('/banking/mock/pay/'), 'link interno boleto');
  assert(!result.paymentUrl.includes('mock.sv-lotes.local'), 'boleto sem domínio fictício externo');
}

async function testMockCreatesPix(): Promise<void> {
  const result = await mockBankProvider.createPix(
    {
      companyId: context.companyId,
      integrationId: context.integrationId,
      financeReceiptId: '44444444-4444-4444-4444-444444444444',
      amount: 890.0,
      dueDate: '2026-07-20',
      payerName: 'Cliente Pix',
      idempotencyKey: 'pix-test-1',
    },
    context,
  );

  assert(result.status === 'PENDING', 'pix status PENDING');
  assert(result.pixCopyPaste.includes('BR.GOV.BCB.PIX'), 'QR Pix fictício EMV');
  assert(result.pixQrCode.startsWith('data:image/svg+xml,'), 'imagem QR fictícia');
  assert(result.paymentUrl.startsWith('/banking/mock/pix/'), 'link interno pix');
  assert(!result.paymentUrl.includes('mock.sv-lotes.local'), 'pix sem domínio fictício externo');
}

function testParseWebhookNoDuplicate(): void {
  const payload = {
    eventId: 'evt_mock_001',
    eventType: 'payment.confirmed',
    chargeExternalId: 'mock_pix_abc',
    paidAmount: 890,
  };

  const first = mockBankProvider.parseWebhook(payload, context);
  const second = mockBankProvider.parseWebhook(payload, context);

  assert(first.duplicate === false, 'primeiro webhook não duplica');
  assert(first.event?.processingStatus === 'PENDING', 'primeiro evento PENDING');
  assert(second.duplicate === true, 'segundo webhook marcado duplicado');
  assert(second.event?.processingStatus === 'DUPLICATE', 'status DUPLICATE');
}

async function testReconcilePaymentStructure(): Promise<void> {
  const pix = await mockBankProvider.createPix(
    {
      companyId: context.companyId,
      integrationId: context.integrationId,
      financeReceiptId: '55555555-5555-5555-5555-555555555555',
      amount: 500,
      dueDate: '2026-08-01',
      payerName: 'Reconcile Test',
      idempotencyKey: 'pix-reconcile-1',
    },
    context,
  );

  const charge = await mockBankProvider.getCharge(pix.externalId, context);
  assert(charge, 'cobrança recuperada');

  const parsed = mockBankProvider.parseWebhook(
    {
      eventId: 'evt_reconcile_001',
      eventType: 'payment.confirmed',
      paidAmount: 500,
      paidAt: '2026-08-02T12:00:00.000Z',
      feeAmount: 2.5,
    },
    context,
  );

  assert(parsed.event && !parsed.duplicate, 'evento reconcile válido');
  const result = mockBankProvider.reconcilePayment(parsed.event!, charge!);

  assert(result.newStatus === 'PAID', 'parcela baixada PAID');
  assert(result.cashMovement.type === 'entrada', 'entrada no caixa');
  assert(result.cashMovement.category === 'parcela', 'categoria parcela');
  assert(result.feeMovement?.category === 'tarifa_bancaria', 'tarifa registrada');
  assert(result.financeReceiptId === charge!.financeReceiptId, 'vínculo parcela');
}

function testFeatureFlagDefaultOff(): void {
  const original = process.env.BANKING_MODULE_ENABLED;
  const originalUi = process.env.NEXT_PUBLIC_BANKING_MODULE_ENABLED;
  delete process.env.BANKING_MODULE_ENABLED;
  delete process.env.NEXT_PUBLIC_BANKING_MODULE_ENABLED;
  assert(isBankingModuleEnabled() === false, 'flag server desligada por padrão');
  assert(isBankingModuleEnabledForUi() === false, 'flag UI desligada por padrão');
  assert(resolveBankingUiEnabled() === false, 'resolve UI desligada por padrão');
  process.env.BANKING_MODULE_ENABLED = 'true';
  process.env.NEXT_PUBLIC_BANKING_MODULE_ENABLED = 'true';
  assert(isBankingModuleEnabled() === true, 'flag server liga com true');
  assert(isBankingModuleEnabledForUi() === true, 'flag UI liga com true');
  assert(resolveBankingUiEnabled() === true, 'resolve UI liga com true');
  if (original === undefined) delete process.env.BANKING_MODULE_ENABLED;
  else process.env.BANKING_MODULE_ENABLED = original;
  if (originalUi === undefined) delete process.env.NEXT_PUBLIC_BANKING_MODULE_ENABLED;
  else process.env.NEXT_PUBLIC_BANKING_MODULE_ENABLED = originalUi;
}

function testIsBankingModuleEnabledForUi(): void {
  assert(parseBankingEnvFlag('true') === true, 'parse true');
  assert(parseBankingEnvFlag('TRUE') === true, 'parse TRUE');
  assert(parseBankingEnvFlag(' true ') === true, 'parse trim');
  assert(parseBankingEnvFlag('false') === false, 'parse false');
  assert(parseBankingEnvFlag(undefined) === false, 'parse undefined');
  assert(parseBankingEnvFlag('1') === false, 'parse 1 rejeitado');

  const originalUi = process.env.NEXT_PUBLIC_BANKING_MODULE_ENABLED;
  process.env.NEXT_PUBLIC_BANKING_MODULE_ENABLED = 'true';
  assert(isBankingModuleEnabledForUi() === true, 'UI true com NEXT_PUBLIC');
  process.env.NEXT_PUBLIC_BANKING_MODULE_ENABLED = 'false';
  assert(isBankingModuleEnabledForUi() === false, 'UI false com NEXT_PUBLIC false');
  if (originalUi === undefined) delete process.env.NEXT_PUBLIC_BANKING_MODULE_ENABLED;
  else process.env.NEXT_PUBLIC_BANKING_MODULE_ENABLED = originalUi;
}

function testFeatureFlagBlocksRoutes(): void {
  const original = process.env.BANKING_MODULE_ENABLED;
  delete process.env.BANKING_MODULE_ENABLED;
  const blocked = assertBankingModuleEnabled();
  assert(blocked?.status === 404, 'rotas bloqueadas com 404 quando flag false');
  process.env.BANKING_MODULE_ENABLED = 'true';
  assert(assertBankingModuleEnabled() === null, 'rotas liberadas quando flag true');
  if (original === undefined) delete process.env.BANKING_MODULE_ENABLED;
  else process.env.BANKING_MODULE_ENABLED = original;
}

function testRejectNonMockProvider(): void {
  const rejected = rejectNonMockProvider({ provider: 'SICOOB' });
  assert(rejected?.status === 400, 'provider real rejeitado');
  assert(rejectNonMockProvider({ provider: 'MOCK' }) === null, 'MOCK aceito');
  assert(rejectNonMockProvider({}) === null, 'body sem provider aceito');
}

async function testMockApiHandlers(): Promise<void> {
  process.env.BANKING_MODULE_ENABLED = 'true';
  const companyId = context.companyId;

  const connection = await runMockTestConnection(companyId);
  assert(connection.connection.ok === true, 'mock testConnection retorna sucesso');
  assert(connection.provider === 'MOCK', 'provider MOCK');
  assert(connection.environment === 'SANDBOX', 'ambiente SANDBOX');

  const boleto = await runMockCreateBoleto(companyId);
  assert(boleto.charge.digitableLine.includes('75691'), 'handler boleto linha digitável');
  assert(boleto.charge.status === 'PENDING', 'handler boleto PENDING');
  assert(boleto.charge.paymentUrl?.startsWith('/banking/mock/pay/'), 'handler boleto link interno');

  const pix = await runMockCreatePix(companyId);
  assert(pix.charge.pixQrCode.startsWith('data:image/svg+xml,'), 'handler pix qrCode fictício');
  assert(pix.charge.status === 'PENDING', 'handler pix PENDING');
  assert(pix.charge.paymentUrl?.startsWith('/banking/mock/pix/'), 'handler pix link interno');
}

function testCredentialsCrypto(): void {
  const original = process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = 'test-banking-key-32chars-min!!';
  const plain = 'client-secret-mock-value';
  const encrypted = encryptBankingSecret(plain);
  assert(encrypted.startsWith('v1:'), 'ciphertext prefixo v1');
  assert(decryptBankingSecret(encrypted) === plain, 'roundtrip decrypt');
  const diag = getBankingEncryptionKeyDiagnostics();
  assert(diag.bankingEncryptionKeyExists === true, 'diag key exists');
  assert(diag.bankingEncryptionKeyLength >= 16, 'diag key length');
  assert(diag.encryptionKeyConfigured === true, 'diag key configured');
  const debug = getBankingEncryptionKeyDebugPayload();
  assert(debug.encryptionKeyExists === true, 'debug payload exists');
  assert(typeof debug.encryptionKeyLength === 'number', 'debug payload length');
  if (original === undefined) delete process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  else process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = original;
}

function testEncryptionKeyDynamicRead(): void {
  const cryptoSource = read('lib/banking/credentialsCrypto.ts');
  assert(cryptoSource.includes('process.env[envKey]'), 'leitura dinâmica da env key');
  assert(cryptoSource.includes('BANKING_CREDENTIALS_KEY_ENV'), 'constante nome env');
  assert(!cryptoSource.includes('process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY'), 'sem dot access estático');

  const debugRoute = read('app/api/banking/debug-encryption-key/route.ts');
  assert(debugRoute.includes('authorizeBankingRoute'), 'debug route exige auth');
  assert(debugRoute.includes('getBankingEncryptionKeyDebugPayload'), 'debug route payload seguro');
  assert(debugRoute.includes("dynamic = 'force-dynamic'"), 'debug route force-dynamic');

  const integrationRoute = read('app/api/banking/integration/route.ts');
  assert(integrationRoute.includes("dynamic = 'force-dynamic'"), 'integration route force-dynamic');
  assert(integrationRoute.includes('getBankingEncryptionKeyDiagnostics'), 'integration log diagnostics');
}

function testIntegrationResponseSafe(): void {
  const safe = {
    ...EMPTY_BANK_INTEGRATION_CONFIG,
    companyId: context.companyId,
    id: '11111111-1111-1111-1111-111111111111',
  };
  assertIntegrationResponseSafe(safe);
  assert(safe.hasClientSecret === false, 'flags has* default false');
}

function testPhase12Source(): void {
  const migration = read('supabase/migrations/20260826120000_banking_module_phase12_config.sql');
  assert(migration.includes('bank_provider'), 'migration bank_provider');
  assert(migration.includes('client_id'), 'migration client_id');
  assert(migration.includes('ITAU'), 'migration ITAU');

  const integrationRoute = read('app/api/banking/integration/route.ts');
  assert(integrationRoute.includes('assertIntegrationResponseSafe'), 'API sanitiza resposta');
  assert(integrationRoute.includes('saveCompanyBankIntegrationConfig'), 'API persiste config');

  const panel = read('components/banking/BankingIntegrationPanel.tsx');
  assert(panel.includes('/api/banking/integration'), 'painel carrega/salva integração');
  assert(panel.includes('Salvar Configuração'), 'botão salvar');
  assert(panel.includes('type="password"'), 'campos secret como password');
}

function testMockPaymentPagesSource(): void {
  const payPage = read('app/banking/mock/pay/[id]/page.tsx');
  const pixPage = read('app/banking/mock/pix/[id]/page.tsx');
  const provider = read('lib/banking/providers/mockBankProvider.ts');

  assert(!provider.includes('mock.sv-lotes.local'), 'provider sem domínio externo fictício');
  assert(provider.includes('MOCK_BOLETO_PAY_PATH_PREFIX'), 'provider define path boleto interno');
  assert(provider.includes('MOCK_PIX_PAY_PATH_PREFIX'), 'provider define path pix interno');
  assert(provider.includes('buildMockBoletoPaymentPath'), 'provider helper boleto path');
  assert(provider.includes('buildMockPixPaymentPath'), 'provider helper pix path');

  for (const [label, source] of [
    ['pay page', payPage],
    ['pix page', pixPage],
  ] as const) {
    assert(source.includes('isBankingModuleEnabled'), `${label} protegida por feature flag`);
    assert(source.includes('notFound'), `${label} retorna 404 quando flag off`);
    assert(source.includes('MockPaymentView'), `${label} usa MockPaymentView`);
  }

  assert(payPage.includes('isMockBoletoExternalId'), 'pay page valida id boleto');
  assert(pixPage.includes('isMockPixExternalId'), 'pix page valida id pix');

  const view = read('components/banking/MockPaymentView.tsx');
  assert(view.includes('Cobrança fictícia'), 'aviso cobrança fictícia');
  assert(view.includes('Voltar para Integração Financeira'), 'botão voltar integração financeira');
}

function testMockRouteGuardsInSource(): void {
  const routes = [
    'app/api/banking/mock/test-connection/route.ts',
    'app/api/banking/mock/create-boleto/route.ts',
    'app/api/banking/mock/create-pix/route.ts',
  ];

  for (const routePath of routes) {
    const source = read(routePath);
    assert(source.includes('authorizeBankingRoute'), `${routePath} exige auth`);
    assert(source.includes('rejectNonMockProvider'), `${routePath} rejeita provider real`);
    assert(source.includes('runMock'), `${routePath} usa handlers MOCK`);
  }

  const settingsShell = read('components/settings/CompanySettingsV2Shell.tsx');
  assert(settingsShell.includes('bankingUiEnabled'), 'aba condicionada à prop bankingUiEnabled');
  assert(settingsShell.includes('Integração Financeira'), 'label da aba presente');
  assert(settingsShell.includes('FinancialIntegrationPanel'), 'painel financeiro integrado');

  const settingsPage = read('app/settings/page.tsx');
  assert(settingsPage.includes('resolveBankingUiEnabled'), 'settings resolve flag em runtime (RSC)');
  assert(settingsPage.includes("dynamic = 'force-dynamic'"), 'settings força runtime env');

  const nextConfig = read('next.config.ts');
  assert(nextConfig.includes('NEXT_PUBLIC_BANKING_MODULE_ENABLED'), 'next.config expõe flag UI no build');

  const panel = read('components/banking/BankingIntegrationPanel.tsx');
  assert(panel.includes('/api/banking/mock/test-connection'), 'painel chama rota test-connection');
  assert(!panel.includes('encrypted_payload'), 'painel não expõe credenciais');
  assert(!panel.includes('api_key'), 'painel não expõe api_key');
}

function testSicoobInRegistry(): void {
  const provider = getBankProvider('SICOOB');
  assert(provider === sicoobBankProvider, 'SICOOB registrado no registry');
  assert(getBankProvider('MOCK'), 'MOCK permanece no registry');
  assert(getBankProvider('SICREDI') === sicrediBankProvider, 'SICREDI registrado no registry');
}

function testSicoobValidationMissingFields(): void {
  const result = validateSicoobConfig({});
  assert(result.ok === false, 'Sicoob inválido sem campos');
  assert(result.missingFields.includes('clientId'), 'clientId obrigatório');
  assert(result.missingFields.includes('clientSecret'), 'clientSecret obrigatório');
  assert(result.message.includes('Campos obrigatórios'), 'mensagem clara');
}

function testSicoobValidationComplete(): void {
  const result = validateSicoobConfig({
    clientId: 'client-id',
    hasClientSecret: true,
    environment: 'SANDBOX',
    agency: '1234',
    accountNumber: '56789',
    accountDigit: '0',
    walletCode: '1',
    agreementCode: '999',
    beneficiaryCode: '123456',
    pixKey: 'pix@test.com',
    certificateName: 'cert.pfx',
    hasCertificatePassword: true,
  });
  assert(result.ok === true, 'Sicoob válido com todos os campos');
}

async function testSicoobCreateBoletoBlocked(): Promise<void> {
  let caught = false;
  try {
    await sicoobBankProvider.createBoleto(
      {
        companyId: context.companyId,
        integrationId: context.integrationId,
        financeReceiptId: '33333333-3333-3333-3333-333333333333',
        amount: 100,
        dueDate: '2026-08-01',
        payerName: 'Teste',
        idempotencyKey: 'sicoob-boleto-block',
      },
      context,
    );
  } catch (err) {
    caught = true;
    assert(
      err instanceof Error && err.message === SICOOB_BOLETO_NOT_ENABLED_MESSAGE,
      'createBoleto bloqueado',
    );
  }
  assert(caught, 'createBoleto lança erro');
}

async function testSicoobCreatePixBlocked(): Promise<void> {
  let caught = false;
  try {
    await sicoobBankProvider.createPix(
      {
        companyId: context.companyId,
        integrationId: context.integrationId,
        financeReceiptId: '44444444-4444-4444-4444-444444444444',
        amount: 100,
        dueDate: '2026-08-01',
        payerName: 'Teste',
        idempotencyKey: 'sicoob-pix-block',
      },
      context,
    );
  } catch (err) {
    caught = true;
    assert(
      err instanceof Error && err.message === SICOOB_PIX_NOT_ENABLED_MESSAGE,
      'createPix bloqueado',
    );
  }
  assert(caught, 'createPix lança erro');
}

async function testSicoobTestConnectionValidatesConfig(): Promise<void> {
  const result = await sicoobBankProvider.testConnection({
    ...context,
    config: {
      clientId: 'abc',
      hasClientSecret: true,
      environment: 'SANDBOX',
      agency: '1',
      accountNumber: '2',
      accountDigit: '3',
      walletCode: '4',
      agreementCode: '5',
      beneficiaryCode: '6',
      pixKey: '7',
      certificateName: 'cert.pfx',
      hasCertificatePassword: true,
    },
  });
  assert(result.ok === true, 'testConnection ok com config completa');
  assert(result.message.includes('API real ainda não habilitada'), 'sem chamada API real');
}

function testSicoobPhase20Source(): void {
  const provider = read('lib/banking/providers/sicoobBankProvider.ts');
  assert(provider.includes('SICOOB_BOLETO_NOT_ENABLED_MESSAGE'), 'bloqueio boleto');
  assert(provider.includes('SICOOB_PIX_NOT_ENABLED_MESSAGE'), 'bloqueio pix');
  assert(!provider.includes('fetch('), 'sem fetch HTTP real');

  const registry = read('lib/banking/registry.ts');
  assert(registry.includes('SICOOB: sicoobBankProvider'), 'registry SICOOB');

  const validation = read('lib/banking/sicoobConfigValidation.ts');
  assert(validation.includes('validateSicoobConfig'), 'validação Sicoob');

  const sicoobRoute = read('app/api/banking/sicoob/test-connection/route.ts');
  assert(sicoobRoute.includes('authorizeBankingRoute'), 'rota Sicoob protegida');
  assert(sicoobRoute.includes('runSicoobTestConnection'), 'handler test connection');

  const panel = read('components/banking/BankingIntegrationPanel.tsx');
  assert(panel.includes('Integração Sicoob em preparação'), 'aviso UI Sicoob');
  assert(panel.includes('/api/banking/sicoob/test-connection'), 'UI rota Sicoob');
  assert(panel.includes('isMockProvider'), 'botões MOCK condicionais');
}

function testSicrediValidationMissingFields(): void {
  const result = validateSicrediConfig({});
  assert(result.ok === false, 'Sicredi inválido sem campos');
  assert(result.missingFields.includes('clientId'), 'clientId obrigatório');
  assert(result.message.includes('Campos obrigatórios Sicredi'), 'mensagem clara');
}

function testSicrediValidationComplete(): void {
  const result = validateSicrediConfig({
    clientId: 'client-id',
    hasClientSecret: true,
    environment: 'SANDBOX',
    agency: '1234',
    accountNumber: '56789',
    accountDigit: '0',
    walletCode: '1',
    agreementCode: '999',
    beneficiaryCode: '123456',
    pixKey: 'pix@test.com',
    certificateName: 'cert.pfx',
    hasCertificatePassword: true,
  });
  assert(result.ok === true, 'Sicredi válido com todos os campos');
  assert(result.message.includes('Fase 2.0-Sicredi'), 'mensagem fase Sicredi');
}

async function testSicrediCreateBoletoBlocked(): Promise<void> {
  let caught = false;
  try {
    await sicrediBankProvider.createBoleto(
      {
        companyId: context.companyId,
        integrationId: context.integrationId,
        financeReceiptId: '33333333-3333-3333-3333-333333333333',
        amount: 100,
        dueDate: '2026-08-01',
        payerName: 'Teste',
        idempotencyKey: 'sicredi-boleto-block',
      },
      context,
    );
  } catch (err) {
    caught = true;
    assert(
      err instanceof Error && err.message === SICREDI_BOLETO_NOT_ENABLED_MESSAGE,
      'createBoleto bloqueado',
    );
  }
  assert(caught, 'createBoleto lança erro');
}

async function testSicrediCreatePixBlocked(): Promise<void> {
  let caught = false;
  try {
    await sicrediBankProvider.createPix(
      {
        companyId: context.companyId,
        integrationId: context.integrationId,
        financeReceiptId: '44444444-4444-4444-4444-444444444444',
        amount: 100,
        dueDate: '2026-08-01',
        payerName: 'Teste',
        idempotencyKey: 'sicredi-pix-block',
      },
      context,
    );
  } catch (err) {
    caught = true;
    assert(
      err instanceof Error && err.message === SICREDI_PIX_NOT_ENABLED_MESSAGE,
      'createPix bloqueado',
    );
  }
  assert(caught, 'createPix lança erro');
}

async function testSicrediTestConnectionValidatesConfig(): Promise<void> {
  const result = await sicrediBankProvider.testConnection({
    ...context,
    config: {
      clientId: 'abc',
      hasClientSecret: true,
      environment: 'SANDBOX',
      agency: '1',
      accountNumber: '2',
      accountDigit: '3',
      walletCode: '4',
      agreementCode: '5',
      beneficiaryCode: '6',
      pixKey: '7',
      certificateName: 'cert.pfx',
      hasCertificatePassword: true,
    },
  });
  assert(result.ok === true, 'testConnection ok com config completa');
  assert(result.message.includes('Fase 2.0-Sicredi'), 'sem chamada API real');
}

function testFinancialIntegrationSource(): void {
  assert(getPrimaryFinancialGateway() === 'ASAAS', 'ASAAS gateway principal');
  assert(isFinancialGatewayProviderActive('ASAAS'), 'ASAAS ativo');
  assert(!isFinancialGatewayProviderActive('SICOOB'), 'Sicoob inativo no gateway');
  assert(!isFinancialGatewayProviderActive('SICREDI'), 'Sicredi inativo no gateway');

  const providers = listFinancialGatewayProviders();
  assert(providers.some((p) => p.code === 'ASAAS' && p.active), 'lista ASAAS ativo');
  assert(providers.some((p) => p.code === 'NUBANK' && !p.active), 'lista Nubank em dev');

  const gateway = read('lib/finance/FinancialGateway.ts');
  assert(gateway.includes('ACTIVE_FINANCIAL_GATEWAY_PROVIDERS'), 'gateway define ativos');

  const asaasPanel = read('components/finance/AsaasIntegrationPanel.tsx');
  assert(asaasPanel.includes('/api/finance/asaas/integration'), 'painel Asaas carrega API');
  assert(asaasPanel.includes('Conectar conta Asaas'), 'título amigável');
  assert(asaasPanel.includes('AsaasConnectionWizard'), 'painel usa wizard');
  assert(asaasPanel.includes('Integração verificada'), 'selo verificado');
  assert(asaasPanel.includes('Nenhuma conta Asaas conectada'), 'estado vazio');
  assert(!asaasPanel.includes('sandboxApiKey":'), 'painel não expõe chaves salvas');

  const wizard = read('components/finance/AsaasConnectionWizard.tsx');
  assert(wizard.includes('type="password"'), 'wizard usa campos password');
  assert(wizard.includes('API Key salva — deixe vazio para manter'), 'placeholder api key');
  assert(wizard.includes('Webhook Token salvo — deixe vazio para manter'), 'placeholder webhook');
  assert(wizard.includes('Ativar integração'), 'botão ativar');
  assert(wizard.includes('buildDefaultAsaasWebhookUrl'), 'wizard gera URL webhook');

  const financeShell = read('components/finance/FinancialIntegrationPanel.tsx');
  assert(financeShell.includes('ASAAS (Principal)'), 'aba ASAAS principal');
  assert(financeShell.includes('Bancos (Em desenvolvimento)'), 'aba bancos em dev');

  const banksPanel = read('components/finance/BanksDevelopmentPanel.tsx');
  assert(banksPanel.includes('Em desenvolvimento'), 'bancos marcados em desenvolvimento');

  const asaasRoute = read('app/api/finance/asaas/integration/route.ts');
  assert(asaasRoute.includes('assertAsaasIntegrationResponseSafe'), 'API Asaas sanitiza resposta');
  assert(asaasRoute.includes('authorizeBankingRoute'), 'API Asaas protegida');

  const bankingPanel = read('components/banking/BankingIntegrationPanel.tsx');
  assert(bankingPanel.includes('/api/banking/integration'), 'painel bancário legado preservado');

  const dashboard = read('app/dashboard/page.tsx');
  assert(dashboard.includes('FinancialIntegrationDashboardCard'), 'card dashboard financeiro');

  const webhookUrl = buildDefaultAsaasWebhookUrl('https://preview.example.com', 'company-uuid');
  assert(
    webhookUrl === 'https://preview.example.com/api/finance/asaas/company-webhook?companyId=company-uuid',
    'webhook URL company correta',
  );

  const cards = buildAsaasSetupStatusCards({
    ...EMPTY_ASAAS_INTEGRATION_CONFIG,
    companyId: 'c1',
    companyName: 'Teste',
    connectionStatus: 'CONNECTED',
    status: 'ACTIVE',
    hasSandboxApiKey: true,
    webhookActive: true,
    accountValidated: true,
  });
  assert(cards.length === 6, 'seis cards de status');
  assert(
    isAsaasIntegrationVerified({
      ...EMPTY_ASAAS_INTEGRATION_CONFIG,
      companyId: 'c1',
      companyName: 'Teste',
      connectionStatus: 'CONNECTED',
      status: 'ACTIVE',
      hasSandboxApiKey: true,
      webhookActive: true,
      accountValidated: true,
    }),
    'integração verificada helper',
  );
  assert(
    !hasAsaasIntegrationStarted({
      ...EMPTY_ASAAS_INTEGRATION_CONFIG,
      companyId: 'c1',
      companyName: 'Teste',
    }),
    'sem config detectada',
  );
}

function testCompanyAsaasChargeFoundation(): void {
  const companyClient = read('lib/finance/asaasCompanyClient.ts');
  assert(!companyClient.includes('process.env.ASAAS_API_KEY'), 'client Company não usa ASAAS_API_KEY Master');
  assert(!companyClient.includes('process.env.ASAAS'), 'client Company não lê env Master');
  assert(companyClient.includes('access_token: apiKey'), 'client Company usa apiKey do tenant');

  const masterProvider = read('lib/payments/providers/asaas.ts');
  assert(masterProvider.includes('process.env.ASAAS_API_KEY'), 'Master Asaas preservado');

  const service = read('lib/finance/asaasCompanyChargeService.ts');
  assert(service.includes('loadAsaasApiKeyForEnvironment'), 'service usa credencial da empresa');
  assert(service.includes('createCompanyPixCharge'), 'createCompanyPixCharge definido');
  assert(service.includes('createCompanyBoletoCharge'), 'createCompanyBoletoCharge definido');
  assert(service.includes('reconcileCompanyAsaasPaidCharge'), 'reconcile webhook definido');
  assert(service.includes("source_table: 'company_asaas_charges'"), 'caixa vinculado à cobrança company');
  assert(service.includes('regenerateCompanyInstallmentCharge'), 'regenerate service');
  assert(service.includes('getCompanyAsaasChargeDashboardSummary'), 'dashboard summary service');
  assert(service.includes('CompanyAsaasChargePaidError'), 'erro parcela paga');
  assert(service.includes('assertCanCreateCompanyAsaasCharge'), 'service usa workflow idempotência');

  const migration = read('supabase/migrations/20260827130000_company_asaas_charges.sql');
  assert(migration.includes('company_asaas_charges'), 'migration company_asaas_charges');
  assert(migration.includes('installment_id'), 'migration installment_id');
  assert(migration.includes('company_asaas_webhook_events'), 'migration webhook events');

  const webhookRoute = read('app/api/finance/asaas/company-webhook/route.ts');
  assert(webhookRoute.includes('handleCompanyAsaasPaymentWebhook'), 'rota webhook company');

  const createRoute = read('app/api/finance/asaas/create-charge/route.ts');
  assert(createRoute.includes('authorizeBankingRoute'), 'create-charge protegida');
  assert(createRoute.includes('installmentId'), 'create-charge exige installmentId');

  const financeUi = read('components/finance/FinancePremiumUI.tsx');
  assert(financeUi.includes('asaasEnabled'), 'UI condiciona ações Asaas');
  assert(financeUi.includes('AsaasInstallmentChargePanel'), 'UI painel Asaas parcelas');

  const chargePanel = read('components/finance/AsaasInstallmentChargePanel.tsx');
  assert(chargePanel.includes('Gerar Cobrança'), 'painel botão Gerar Cobrança');
  assert(chargePanel.includes('Copiar PIX'), 'painel copiar PIX');
  assert(chargePanel.includes('Abrir boleto'), 'painel abrir boleto');
  assert(chargePanel.includes('Regenerar cobrança'), 'painel regenerar');
  assert(chargePanel.includes('min-h-[44px]'), 'painel responsivo mobile');
  assert(chargePanel.includes('flex-wrap'), 'painel botões sem overflow');

  const workflow = read('lib/finance/companyAsaasChargeWorkflow.ts');
  assert(workflow.includes('assertCanCreateCompanyAsaasCharge'), 'workflow idempotência');
  assert(workflow.includes('Esta parcela já foi paga.'), 'workflow bloqueio paga');

  const regenerateRoute = read('app/api/finance/asaas/regenerate-charge/route.ts');
  assert(regenerateRoute.includes('regenerateCompanyInstallmentCharge'), 'rota regenerate');

  const summaryRoute = read('app/api/finance/asaas/charge-summary/route.ts');
  assert(summaryRoute.includes('getCompanyAsaasChargeDashboardSummary'), 'rota charge-summary');

  const financePage = read('app/finance/page.tsx');
  assert(financePage.includes('companyAsaasActive'), 'finance page carrega contexto Asaas');
  assert(financePage.includes('isCompanyAsaasIntegrationReady'), 'finance page valida integração ativa');
  assert(financePage.includes('asaasChargeSummary'), 'finance page dashboard Asaas');
  assert(financePage.includes('handleRegenerateAsaasCharge'), 'finance page regenerar');
  assert(financePage.includes('handleCancelAsaasCharge'), 'finance page cancelar');

  assert(mapAsaasPaymentStatusToCompanyCharge('RECEIVED') === 'PAID', 'status RECEIVED -> PAID');
  assert(isCompanyAsaasIntegrationReady({
    connectionStatus: 'CONNECTED',
    status: 'ACTIVE',
    environment: 'SANDBOX',
    hasSandboxApiKey: true,
    hasProductionApiKey: false,
  }), 'integração company pronta');

  assert(!isCompanyAsaasIntegrationReady({
    connectionStatus: 'DISCONNECTED',
    status: 'DRAFT',
    environment: 'SANDBOX',
    hasSandboxApiKey: false,
    hasProductionApiKey: false,
  }), 'integração inativa oculta botões');

  assertCompanyAsaasChargeResponseSafe({
    id: '1',
    companyId: 'c1',
    customerId: null,
    saleId: null,
    installmentId: 'i1',
    asaasPaymentId: 'pay_1',
    billingType: 'PIX',
    status: 'PENDING',
    value: 100,
    dueDate: '2026-07-01',
    invoiceUrl: null,
    bankSlipUrl: null,
    pixQrCode: null,
    pixCopyPaste: 'abc',
    paymentLink: null,
    paidAt: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  });

  const webhookHandler = read('lib/finance/companyAsaasWebhookHandler.ts');
  assert(webhookHandler.includes('registerCompanyAsaasWebhookEvent'), 'webhook registra evento');
  assert(webhookHandler.includes('reconcileCompanyAsaasPaidCharge'), 'webhook reconcilia pagamento');
  assert(webhookHandler.includes('loadCompanyAsaasWebhookToken'), 'webhook valida token por empresa');
}

function testCompanyAsaasChargeWorkflow(): void {
  const sampleCharge = (status: CompanyAsaasChargeResponse['status']): CompanyAsaasChargeResponse => ({
    id: 'c1',
    companyId: 'co1',
    customerId: null,
    saleId: null,
    installmentId: 'i1',
    asaasPaymentId: 'pay_1',
    billingType: 'PIX',
    status,
    value: 250,
    dueDate: '2026-07-01',
    invoiceUrl: 'https://asaas.test/invoice/1',
    bankSlipUrl: 'https://asaas.test/boleto/1',
    pixQrCode: 'abc123',
    pixCopyPaste: '00020126pix',
    paymentLink: 'https://asaas.test/invoice/1',
    paidAt: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
  });

  assert(resolveCompanyAsaasChargeWorkflowState(null) === 'none', 'sem cobrança');
  assert(resolveCompanyAsaasChargeWorkflowState(sampleCharge('PENDING')) === 'active', 'ativa');
  assert(resolveCompanyAsaasChargeWorkflowState(sampleCharge('PAID')) === 'paid', 'paga');
  assert(resolveCompanyAsaasChargeWorkflowState(sampleCharge('CANCELLED')) === 'cancelled', 'cancelada');

  assert(isActiveCompanyAsaasChargeStatus('OVERDUE'), 'OVERDUE ativa');
  assert(isRegeneratableCompanyAsaasChargeStatus('CANCELLED'), 'CANCELLED regenerável');

  const active = assertCanCreateCompanyAsaasCharge(sampleCharge('PENDING'));
  assert(active?.id === 'c1', 'idempotência retorna existente');

  let blockedPaid = false;
  try {
    assertCanCreateCompanyAsaasCharge(sampleCharge('PAID'));
  } catch (err) {
    blockedPaid = err instanceof Error && err.message === 'Esta parcela já foi paga.';
  }
  assert(blockedPaid, 'bloqueia geração quando paga');

  let blockedRegeneratePaid = false;
  try {
    assertCanRegenerateCompanyAsaasCharge(sampleCharge('PAID'));
  } catch (err) {
    blockedRegeneratePaid = err instanceof Error && err.message === 'Esta parcela já foi paga.';
  }
  assert(blockedRegeneratePaid, 'bloqueia regenerar quando paga');

  assertCanRegenerateCompanyAsaasCharge(sampleCharge('CANCELLED'));

  assert(
    resolveCompanyAsaasPaymentLink(sampleCharge('PENDING')) === 'https://asaas.test/invoice/1',
    'resolve link pagamento',
  );
  assert(
    resolveCompanyAsaasBoletoUrl(sampleCharge('PENDING')) === 'https://asaas.test/boleto/1',
    'resolve boleto',
  );
  assert(formatCompanyAsaasChargeStatusLabel('OVERDUE') === 'Vencida', 'label status');

  const summary = summarizeCompanyAsaasCharges([
    sampleCharge('PENDING'),
    sampleCharge('PAID'),
    sampleCharge('OVERDUE'),
  ]);
  assert(summary.totalCharges === 3, 'summary total');
  assert(summary.pendingCount === 2, 'summary pendentes');
  assert(summary.openValue === 500, 'summary valor aberto');
}

function testAsaasIntegrationResponseSafe(): void {
  assertAsaasIntegrationResponseSafe({
    ...EMPTY_ASAAS_INTEGRATION_CONFIG,
    companyId: 'test',
    companyName: 'Teste',
  });
}

function testSicrediPhase20Source(): void {
  const provider = read('lib/banking/providers/sicrediBankProvider.ts');
  assert(provider.includes('SICREDI_BOLETO_NOT_ENABLED_MESSAGE'), 'bloqueio boleto');
  assert(provider.includes('SICREDI_PIX_NOT_ENABLED_MESSAGE'), 'bloqueio pix');
  assert(!provider.includes('fetch('), 'sem fetch HTTP real');

  const registry = read('lib/banking/registry.ts');
  assert(registry.includes('SICREDI: sicrediBankProvider'), 'registry SICREDI');
  assert(registry.includes('SICOOB: sicoobBankProvider'), 'registry SICOOB preservado');

  const validation = read('lib/banking/sicrediConfigValidation.ts');
  assert(validation.includes('validateSicrediConfig'), 'validação Sicredi');

  const sicrediRoute = read('app/api/banking/sicredi/test-connection/route.ts');
  assert(sicrediRoute.includes('authorizeBankingRoute'), 'rota Sicredi protegida');
  assert(sicrediRoute.includes('runSicrediTestConnection'), 'handler test connection');

  const panel = read('components/banking/BankingIntegrationPanel.tsx');
  assert(panel.includes('Integração Sicredi em preparação'), 'aviso UI Sicredi');
  assert(panel.includes('/api/banking/sicredi/test-connection'), 'UI rota Sicredi');
  assert(panel.includes('Integração Sicoob em preparação'), 'aviso UI Sicoob preservado');

  const sicrediDoc = read('docs/SICREDI_HOMOLOGATION_CHECKLIST.md');
  assert(sicrediDoc.includes('Fase 2.0-Sicredi'), 'doc homologação Sicredi');
}

async function main(): Promise<void> {
  clearMockBankProviderStateForTests();
  clearWebhookEventCacheForTests();

  await testMockCreatesBoleto();
  await testMockCreatesPix();
  testParseWebhookNoDuplicate();
  await testReconcilePaymentStructure();
  testFeatureFlagDefaultOff();
  testIsBankingModuleEnabledForUi();
  testCredentialsCrypto();
  testEncryptionKeyDynamicRead();
  testIntegrationResponseSafe();
  testFeatureFlagBlocksRoutes();
  testRejectNonMockProvider();
  await testMockApiHandlers();
  testPhase12Source();
  testMockPaymentPagesSource();
  testMockRouteGuardsInSource();
  testSicoobInRegistry();
  testSicoobValidationMissingFields();
  testSicoobValidationComplete();
  await testSicoobCreateBoletoBlocked();
  await testSicoobCreatePixBlocked();
  await testSicoobTestConnectionValidatesConfig();
  testSicoobPhase20Source();
  testSicrediValidationMissingFields();
  testSicrediValidationComplete();
  await testSicrediCreateBoletoBlocked();
  await testSicrediCreatePixBlocked();
  await testSicrediTestConnectionValidatesConfig();
  testSicrediPhase20Source();
  testFinancialIntegrationSource();
  testAsaasIntegrationResponseSafe();
  testCompanyAsaasChargeFoundation();
  testCompanyAsaasChargeWorkflow();

  console.log('OK — mandatory banking mock tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
