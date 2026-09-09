/**
 * C6 Bank Fase 3A — autenticação real + teste de conexão (sem emissão).
 * npm run test:c6-fase3
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import {
  requestC6AccessToken,
  sanitizeC6Scopes,
  toPublicC6ConnectionTest,
  type C6AuthFetchFn,
} from '../lib/banking/c6/c6AuthClient';
import {
  C6_AUTH_GRANT_TYPE,
  C6_AUTH_URL,
  buildC6AuthFormBody,
  getC6AuthUrl,
  parseC6AuthFormBody,
} from '../lib/banking/c6/c6Endpoints';
import {
  clearAllC6TokenCacheForTests,
  getCachedC6Token,
  setCachedC6Token,
} from '../lib/banking/c6/c6TokenCache';
import { hasMinimumC6AuthConfig } from '../lib/banking/c6/c6ConfigTypes';
import {
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  throwIfC6EmissionAttempt,
} from '../lib/banking/c6/c6EmitGuard';
import { normalizeChargesEmitProvider } from '../lib/charges/chargeProviderRouting';

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const baseCreds = {
  companyId: 'co-c6-1',
  integrationId: 'int-c6-1',
  environment: 'SANDBOX' as const,
  clientId: 'c6-client-id',
  clientSecret: 'c6-client-secret',
  certificatePem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
};

async function testFormBodyAndGrantType() {
  const body = buildC6AuthFormBody('id-1', 'sec-2');
  const parsed = parseC6AuthFormBody(body);
  assert.equal(parsed.client_id, 'id-1');
  assert.equal(parsed.client_secret, 'sec-2');
  assert.equal(parsed.grant_type, 'client_credentials');
  assert.equal(C6_AUTH_GRANT_TYPE, 'client_credentials');
  assert.equal(body.includes('grant_type=client_credentials'), true);
  assert.equal(body.includes('application/json'), false);
  console.log('OK testFormBodyAndGrantType');
}

function testEnvironmentUrls() {
  assert.equal(getC6AuthUrl('SANDBOX'), C6_AUTH_URL.SANDBOX);
  assert.equal(getC6AuthUrl('PRODUCTION'), C6_AUTH_URL.PRODUCTION);
  assert.equal(C6_AUTH_URL.SANDBOX, 'https://baas-api-sandbox.c6bank.info/v1/auth/');
  assert.equal(C6_AUTH_URL.PRODUCTION, 'https://baas-api.c6bank.info/v1/auth/');
  assert.match(C6_AUTH_URL.SANDBOX, /\/v1\/auth\/$/);
  assert.match(C6_AUTH_URL.PRODUCTION, /\/v1\/auth\/$/);
  console.log('OK testEnvironmentUrls');
}

async function testMissingCertAndKey() {
  {
    const r = await requestC6AccessToken({ ...baseCreds, certificatePem: '' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'MISSING_CERTIFICATE');
  }
  {
    const r = await requestC6AccessToken({ ...baseCreds, privateKeyPem: '' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'MISSING_PRIVATE_KEY');
  }
  {
    const r = await requestC6AccessToken({ ...baseCreds, clientSecret: '' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'MISSING_CLIENT_SECRET');
  }
  console.log('OK testMissingCertAndKey');
}

async function testMtlsRequiredAndSandboxPost() {
  let seenUrl = '';
  let seenMethod = '';
  let seenContentType = '';
  let seenBody = '';
  let seenAgent: https.Agent | null = null;
  const fetchFn: C6AuthFetchFn = async (url, init) => {
    seenUrl = url;
    seenMethod = init.method;
    seenContentType = init.headers['Content-Type'];
    seenBody = init.body;
    seenAgent = init.agent;
    return {
      status: 200,
      bodyText: JSON.stringify({
        access_token: 'tok-secret-should-not-leak',
        expires_in: 300,
        token_type: 'Bearer',
        scope: 'baas.auth baas.invalid<script>',
      }),
    };
  };
  const r = await requestC6AccessToken(baseCreds, { fetchFn, bypassCache: true });
  assert.equal(r.ok, true);
  assert.equal(seenUrl, C6_AUTH_URL.SANDBOX);
  assert.equal(seenMethod, 'POST');
  assert.equal(seenContentType, 'application/x-www-form-urlencoded');
  const parsed = parseC6AuthFormBody(seenBody);
  assert.equal(parsed.grant_type, 'client_credentials');
  assert.equal(parsed.client_id, 'c6-client-id');
  assert.ok(seenAgent, 'mTLS agent obrigatório');
  const agentOpts = seenAgent as https.Agent & { options?: { cert?: string; key?: string } };
  assert.equal(Boolean(agentOpts.options?.cert), true, 'agent.cert');
  assert.equal(Boolean(agentOpts.options?.key), true, 'agent.key');
  console.log('OK testMtlsRequiredAndSandboxPost');
}

async function testProductionBlockedAndUrlStillMapped() {
  assert.equal(getC6AuthUrl('PRODUCTION'), C6_AUTH_URL.PRODUCTION);
  let called = false;
  const fetchFn: C6AuthFetchFn = async () => {
    called = true;
    return { status: 200, bodyText: '{"access_token":"x"}' };
  };
  const r = await requestC6AccessToken(
    { ...baseCreds, environment: 'PRODUCTION' },
    { fetchFn, bypassCache: true },
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, 'PRODUCTION_AUTH_BLOCKED');
  assert.equal(called, false, 'Produção C6 não é chamada nesta fase');
  console.log('OK testProductionBlockedAndUrlStillMapped');
}

async function testHttpErrorsAndTls() {
  {
    const fetchFn: C6AuthFetchFn = async () => {
      const err = new Error('unable to verify the first certificate');
      (err as Error & { code?: string }).code = 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
      throw err;
    };
    const r = await requestC6AccessToken(baseCreds, { fetchFn, bypassCache: true });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'MTLS_ERROR');
  }
  {
    const fetchFn: C6AuthFetchFn = async () => ({
      status: 401,
      bodyText: JSON.stringify({ error: 'invalid_client', access_token: 'nope' }),
    });
    const r = await requestC6AccessToken(baseCreds, { fetchFn, bypassCache: true });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'AUTH_REJECTED');
  }
  {
    const fetchFn: C6AuthFetchFn = async () => ({
      status: 403,
      bodyText: JSON.stringify({ error: 'forbidden' }),
    });
    const r = await requestC6AccessToken(baseCreds, { fetchFn, bypassCache: true });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'AUTH_FORBIDDEN');
  }
  console.log('OK testHttpErrorsAndTls');
}

async function testPublicPayloadNeverHasToken() {
  const fetchFn: C6AuthFetchFn = async () => ({
    status: 200,
    bodyText: JSON.stringify({
      access_token: 'super-secret-token-value',
      expires_in: 120,
      token_type: 'Bearer',
      scope: 'baas.read baas.write',
    }),
  });
  const r = await requestC6AccessToken(baseCreds, { fetchFn, bypassCache: true });
  assert.equal(r.ok, true);
  const pub = toPublicC6ConnectionTest(r);
  const json = JSON.stringify(pub);
  assert.equal(json.includes('access_token'), false);
  assert.equal(json.includes('accessToken'), false);
  assert.equal(json.includes('super-secret-token-value'), false);
  assert.equal(pub.success, true);
  assert.deepEqual(pub.scopes, ['baas.read', 'baas.write']);
  assert.equal(pub.tokenType, 'Bearer');
  assert.equal(pub.expiresIn, 120);
  console.log('OK testPublicPayloadNeverHasToken');
}

function testScopesSanitized() {
  assert.deepEqual(sanitizeC6Scopes('baas.read baas.write'), ['baas.read', 'baas.write']);
  assert.deepEqual(sanitizeC6Scopes('ok,<script>,baas:pix'), ['ok', 'baas:pix']);
  assert.equal(sanitizeC6Scopes('a'.repeat(81)).length, 0);
  console.log('OK testScopesSanitized');
}

function testTenantIsolationCache() {
  clearAllC6TokenCacheForTests();
  setCachedC6Token(
    'co-a',
    'SANDBOX',
    {
      accessToken: 'token-a',
      expiresAtMs: Date.now() + 60_000,
      tokenType: 'Bearer',
      scope: 'a',
    },
    'int-a',
  );
  assert.equal(getCachedC6Token('co-b', 'SANDBOX', 0, 'int-a')?.accessToken, undefined);
  assert.equal(getCachedC6Token('co-a', 'SANDBOX', 0, 'int-b')?.accessToken, undefined);
  assert.equal(getCachedC6Token('co-a', 'SANDBOX', 0, 'int-a')?.accessToken, 'token-a');
  console.log('OK testTenantIsolationCache');
}

function testUiRouteAndBadge() {
  const panel = read('components/finance/C6BankConfigPanel.tsx');
  assert.match(panel, /Testar conexão/);
  assert.match(panel, /Não testado/);
  assert.match(panel, /Testando…/);
  assert.match(panel, /Conexão validada/);
  assert.match(panel, /Falha na autenticação/);
  assert.match(panel, /\/api\/banking\/c6\/test-connection/);
  assert.match(panel, /payloadJson\.includes\('access_token'\)/);
  assert.match(panel, /ainda não homologada para emissão/);

  const banks = read('components/finance/BanksDevelopmentPanel.tsx');
  assert.match(banks, /Em homologação/);
  assert.doesNotMatch(banks, />Ativo</);

  const route = read('app/api/banking/c6/test-connection/route.ts');
  assert.match(route, /authorizeBankingRoute/);
  assert.match(route, /success/);
  assert.match(route, /tokenType/);
  assert.match(route, /expiresIn/);
  assert.match(route, /scopes/);
  assert.match(route, /json\.includes\('access_token'\)/);
  assert.doesNotMatch(route, /asaas|interSaleCharge/i);

  const authClient = read('lib/banking/c6/c6AuthClient.ts');
  assert.match(authClient, /new https\.Agent/);
  assert.match(authClient, /cert: certificatePem/);
  assert.match(authClient, /key: privateKeyPem/);
  console.log('OK testUiRouteAndBadge');
}

function testDoesNotFallIntoAsaasInterAndEmitBlocked() {
  assert.equal(normalizeChargesEmitProvider('C6'), 'C6');
  assert.equal(normalizeChargesEmitProvider('INTER'), 'INTER');
  assert.equal(normalizeChargesEmitProvider('ASAAS_COMPANY'), 'ASAAS_COMPANY');
  try {
    throwIfC6EmissionAttempt('C6');
    throw new Error('emissão deveria permanecer bloqueada');
  } catch (err) {
    assert.equal((err as Error).message, C6_EMIT_NOT_HOMOLOGATED_MESSAGE);
  }
  const asaas = read('lib/finance/asaasCompanyChargeService.ts');
  assert.match(asaas, /throwIfC6EmissionAttempt/);
  const inter = read('lib/banking/inter/interSaleChargeService.ts');
  assert.match(inter, /throwIfC6EmissionAttempt/);
  const auth = read('lib/banking/c6/c6AuthClient.ts');
  assert.doesNotMatch(auth, /create-charge|boleto|bolepix|\/pix/i);
  console.log('OK testDoesNotFallIntoAsaasInterAndEmitBlocked');
}

function testMinimumConfigHelper() {
  assert.equal(
    hasMinimumC6AuthConfig({
      id: 'x',
      companyId: 'c',
      provider: 'C6',
      environment: 'SANDBOX',
      status: 'DRAFT',
      clientId: 'id',
      clientIdConfigured: true,
      hasClientSecret: true,
      hasCertificate: true,
      hasPrivateKey: true,
      certificateFileName: 'a.crt',
      privateKeyFileName: 'a.key',
      configuredAt: null,
      updatedAt: null,
      message: '',
    }),
    true,
  );
  assert.equal(
    hasMinimumC6AuthConfig({
      id: 'x',
      companyId: 'c',
      provider: 'C6',
      environment: 'SANDBOX',
      status: 'DRAFT',
      clientId: 'id',
      clientIdConfigured: true,
      hasClientSecret: true,
      hasCertificate: false,
      hasPrivateKey: true,
      certificateFileName: null,
      privateKeyFileName: 'a.key',
      configuredAt: null,
      updatedAt: null,
      message: '',
    }),
    false,
  );
  console.log('OK testMinimumConfigHelper');
}

async function main() {
  clearAllC6TokenCacheForTests();
  await testFormBodyAndGrantType();
  testEnvironmentUrls();
  await testMissingCertAndKey();
  await testMtlsRequiredAndSandboxPost();
  await testProductionBlockedAndUrlStillMapped();
  await testHttpErrorsAndTls();
  await testPublicPayloadNeverHasToken();
  testScopesSanitized();
  testTenantIsolationCache();
  testUiRouteAndBadge();
  testDoesNotFallIntoAsaasInterAndEmitBlocked();
  testMinimumConfigHelper();
  console.log('ALL mandatory-c6-fase3-auth-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
