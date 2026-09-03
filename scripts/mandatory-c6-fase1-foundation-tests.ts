/**
 * C6 Bank Fase 1 — fundação (sem emissão, sem HTTP ao banco).
 * npm run test:c6-fase1
 */
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BANK_PROVIDERS } from '../lib/banking/types';
import { getBankProvider } from '../lib/banking/registry';
import {
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  C6EmissionNotHomologatedError,
  throwIfC6EmissionAttempt,
} from '../lib/banking/c6/c6EmitGuard';
import { EMPTY_C6_BANK_CONFIG } from '../lib/banking/c6/c6ConfigTypes';
import { assertC6ConfigResponseSafe } from '../lib/banking/c6/c6ConfigRepository';
import {
  looksLikePemCertificate,
  looksLikePemPrivateKey,
  serializeC6CertificateCredential,
  parseC6CertificateCredential,
  validateC6CertificatePem,
  validateC6ClientId,
  validateC6ClientSecret,
  validateC6PrivateKeyPem,
} from '../lib/banking/c6/c6LocalValidation';
import {
  normalizeChargesEmitProvider,
  resolveChargesEmitProviderForAccount,
  resolveChargesEmitProviderByAccountId,
  UnknownChargesProviderError,
} from '../lib/charges/chargeProviderRouting';
import { FINANCIAL_GATEWAY_PROVIDERS } from '../lib/finance/FinancialGateway';
import { FINANCIAL_INTEGRATION_UI_CARDS } from '../lib/finance/financialIntegrationUi';
import {
  encryptBankingSecret,
  decryptBankingSecret,
} from '../lib/banking/credentialsCrypto';

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testEnumsAndRegistry() {
  assert.ok(BANK_PROVIDERS.includes('C6'), 'C6 no enum BANK_PROVIDERS');
  assert.ok(BANK_PROVIDERS.includes('INTER'), 'INTER preservado');
  assert.ok(BANK_PROVIDERS.includes('ASAAS_COMPANY'), 'ASAAS_COMPANY preservado');
  assert.equal(getBankProvider('C6'), null, 'C6 fora do registry genérico IBankProvider');
  assert.equal(getBankProvider('ASAAS_COMPANY'), null, 'Asaas continua fora do registry');
  assert.equal(getBankProvider('INTER')?.providerCode, 'INTER', 'Inter permanece no registry');
  console.log('OK testEnumsAndRegistry');
}

function testUiCardOrder() {
  const gatewayOrder = FINANCIAL_GATEWAY_PROVIDERS.filter((code) =>
    ['INTER', 'C6', 'NUBANK', 'CORA'].includes(code),
  );
  assert.deepEqual(gatewayOrder, ['INTER', 'C6', 'NUBANK', 'CORA'], 'ordem Inter | C6 | Nubank | Cora');

  const uiCodes = FINANCIAL_INTEGRATION_UI_CARDS.filter((c) => c.status === 'development').map(
    (c) => c.code,
  );
  assert.deepEqual(uiCodes, ['INTER', 'C6', 'NUBANK', 'CORA'], 'cards UI na mesma ordem');

  const banksPanel = read('components/finance/BanksDevelopmentPanel.tsx');
  assert.match(banksPanel, /Em homologação/);
  assert.match(banksPanel, /isC6/);
  assert.doesNotMatch(banksPanel, /Configurar Banco C6/);
  assert.match(banksPanel, /Configurar Banco Inter/);
  console.log('OK testUiCardOrder');
}

function testRoutingFailClosed() {
  assert.equal(normalizeChargesEmitProvider(null), 'ASAAS_COMPANY');
  assert.equal(normalizeChargesEmitProvider(''), 'ASAAS_COMPANY');
  assert.equal(normalizeChargesEmitProvider('ASAAS'), 'ASAAS_COMPANY');
  assert.equal(normalizeChargesEmitProvider('ASAAS_COMPANY'), 'ASAAS_COMPANY');
  assert.equal(normalizeChargesEmitProvider('INTER'), 'INTER');
  assert.equal(normalizeChargesEmitProvider('inter'), 'INTER');
  assert.equal(normalizeChargesEmitProvider('C6'), 'C6');
  assert.equal(normalizeChargesEmitProvider('c6'), 'C6');

  assert.throws(
    () => normalizeChargesEmitProvider('SICOOB'),
    (err: unknown) => err instanceof UnknownChargesProviderError,
  );
  assert.throws(
    () => normalizeChargesEmitProvider('NUBANK'),
    (err: unknown) => err instanceof UnknownChargesProviderError,
  );
  assert.throws(
    () => normalizeChargesEmitProvider('CORA'),
    (err: unknown) => err instanceof UnknownChargesProviderError,
  );

  assert.equal(
    resolveChargesEmitProviderForAccount({ provider: 'C6' }),
    'C6',
  );
  assert.equal(
    resolveChargesEmitProviderByAccountId('', { c6: { id: 'c6', provider: 'C6' } } as never),
    'ASAAS_COMPANY',
  );
  assert.equal(
    resolveChargesEmitProviderByAccountId('c6', {
      c6: { id: 'c6', provider: 'C6' },
    } as never),
    'C6',
  );
  console.log('OK testRoutingFailClosed');
}

function testEmitGuard() {
  assert.equal(
    C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
    'Integração C6 Bank ainda não homologada para emissão.',
  );
  try {
    throwIfC6EmissionAttempt('C6');
    throw new Error('deveria lançar');
  } catch (err) {
    assert.ok(err instanceof C6EmissionNotHomologatedError);
    assert.equal(err.message, C6_EMIT_NOT_HOMOLOGATED_MESSAGE);
  }
  throwIfC6EmissionAttempt('INTER');
  throwIfC6EmissionAttempt('ASAAS_COMPANY');
  throwIfC6EmissionAttempt(null);
  console.log('OK testEmitGuard');
}

function testNoHttpClient() {
  const dir = path.join(root, 'lib/banking/c6');
  for (const file of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.doesNotMatch(src, /https:\/\//, `${file} sem URL HTTP C6`);
    assert.doesNotMatch(src, /oauth\/v2/i, `${file} sem OAuth`);
    assert.doesNotMatch(src, /cobranca\/v3/i, `${file} sem cobrança remota`);
  }
  console.log('OK testNoHttpClient');
}

function testLocalValidationAndSafeResponse() {
  assert.equal(validateC6ClientId('').ok, false);
  assert.equal(validateC6ClientId('app-client').ok, true);
  assert.equal(validateC6ClientSecret('').ok, false);
  assert.equal(validateC6ClientSecret('x').ok, true);

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  assert.equal(looksLikePemPrivateKey(privateKey), true);
  assert.equal(validateC6PrivateKeyPem(privateKey).ok, true);

  const fakeCertBlock = '-----BEGIN CERTIFICATE-----\nC6FASE1\n-----END CERTIFICATE-----';
  assert.equal(looksLikePemCertificate(fakeCertBlock), true);
  assert.equal(validateC6CertificatePem(fakeCertBlock).ok, false);

  const serialized = serializeC6CertificateCredential({
    certificatePem: fakeCertBlock,
    privateKeyPem: privateKey,
    certificateFileName: 'cert.pem',
    privateKeyFileName: 'key.pem',
  });
  const parsed = parseC6CertificateCredential(serialized);
  assert.ok(parsed);
  assert.equal(parsed?.certificateFileName, 'cert.pem');

  const publicCfg = EMPTY_C6_BANK_CONFIG('company-1');
  publicCfg.hasClientSecret = true;
  publicCfg.hasCertificate = true;
  publicCfg.hasPrivateKey = true;
  publicCfg.clientId = 'visible-client-id';
  assertC6ConfigResponseSafe(publicCfg);

  const unsafe = { ...publicCfg, clientSecret: 'hidden' } as typeof publicCfg & {
    clientSecret: string;
  };
  assert.throws(() => assertC6ConfigResponseSafe(unsafe));
  console.log('OK testLocalValidationAndSafeResponse');
}

function testEncryptionReuse() {
  process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = 'sv-lotes-c6-fase1-test-key';
  const cipher = encryptBankingSecret('placeholder-value');
  assert.match(cipher, /^v1:/);
  assert.equal(decryptBankingSecret(cipher), 'placeholder-value');
  const repo = read('lib/banking/c6/c6ConfigRepository.ts');
  assert.match(repo, /encryptBankingSecret/);
  assert.match(repo, /from\('bank_credentials'\)/);
  assert.match(repo, /provider', 'C6'/);
  assert.match(repo, /is_default: false/);
  assert.match(repo, /assertC6ConfigResponseSafe/);
  assert.doesNotMatch(repo, /integrationRepository/);
  console.log('OK testEncryptionReuse');
}

function testSharedGuardsInEmitPaths() {
  const asaas = read('lib/finance/asaasCompanyChargeService.ts');
  assert.match(asaas, /throwIfC6EmissionAttempt/);
  assert.match(asaas, /UnknownChargesProviderError/);

  const asaasRoute = read('app/api/finance/asaas/create-charge/route.ts');
  assert.match(asaasRoute, /C6EmissionNotHomologatedError/);
  assert.match(asaasRoute, /C6_NOT_HOMOLOGATED/);

  const inter = read('lib/banking/inter/interSaleChargeService.ts');
  assert.equal((inter.match(/throwIfC6EmissionAttempt/g) || []).length >= 3, true);

  const interRoute = read('app/api/finance/inter/create-charge/route.ts');
  assert.match(interRoute, /C6EmissionNotHomologatedError/);

  const salePanel = read('components/sales/SaleChargesPanel.tsx');
  assert.match(salePanel, /C6_EMIT_NOT_HOMOLOGATED_MESSAGE/);
  assert.match(salePanel, /providerRaw === 'C6'/);

  const central = read('components/charges/ChargesPageClient.tsx');
  assert.match(central, /C6_EMIT_NOT_HOMOLOGATED_MESSAGE/);

  const resolver = read('lib/finance/saleChargesProvider.ts');
  assert.match(resolver, /normalizeChargesEmitProvider/);

  const creds = read('lib/finance/financialAccountCredentialResolver.ts');
  assert.match(creds, /C6EmissionNotHomologatedError/);

  const migration = read('supabase/migrations/20261013120000_bank_integrations_provider_c6.sql');
  assert.match(migration, /'C6'/);
  assert.match(migration, /'INTER'/);
  assert.match(migration, /'ASAAS_COMPANY'/);
  console.log('OK testSharedGuardsInEmitPaths');
}

function main() {
  testEnumsAndRegistry();
  testUiCardOrder();
  testRoutingFailClosed();
  testEmitGuard();
  testNoHttpClient();
  testLocalValidationAndSafeResponse();
  testEncryptionReuse();
  testSharedGuardsInEmitPaths();
  console.log('ALL mandatory-c6-fase1-foundation-tests passed');
}

main();
