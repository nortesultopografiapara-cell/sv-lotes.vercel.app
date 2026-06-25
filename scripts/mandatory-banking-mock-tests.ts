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
} from '../lib/banking';
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
  assert(result.paymentUrl.includes('mock.sv-lotes.local'), 'link fictício');
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
  assert(result.paymentUrl.includes('/pix/'), 'link pagamento pix');
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

  const pix = await runMockCreatePix(companyId);
  assert(pix.charge.pixQrCode.startsWith('data:image/svg+xml,'), 'handler pix qrCode fictício');
  assert(pix.charge.status === 'PENDING', 'handler pix PENDING');
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
  assert(settingsShell.includes('Integração Bancária'), 'label da aba presente');

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
  testMockRouteGuardsInSource();

  console.log('OK — mandatory banking mock tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
