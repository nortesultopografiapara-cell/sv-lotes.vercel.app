/**
 * Split de Recebimentos — descoberta automática da Wallet ID Asaas.
 * npx tsx scripts/mandatory-payment-split-wallet-resolve-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import type { BankEnvironment } from '../lib/banking/types';
import {
  ASAAS_OWN_WALLETS_PATH,
  ASAAS_PRODUCTION_API_HOST,
  ASAAS_SANDBOX_API_HOST,
  ASAAS_WALLET_INVALID_KEY_MESSAGE,
  ASAAS_WALLET_MISSING_API_KEY_MESSAGE,
  ASAAS_WALLET_PRODUCTION_KEY_ON_SANDBOX_MESSAGE,
  ASAAS_WALLET_SANDBOX_KEY_ON_PRODUCTION_MESSAGE,
  assertAsaasApiKeyMatchesEnvironment,
  assertAsaasCompanyRequestHost,
  extractAsaasOwnWalletId,
  maskAsaasWalletId,
  rejectAsaasSecretInRequestBody,
  sanitizeAsaasPublicError,
} from '../lib/finance/asaasWalletId';
import { buildAsaasCompanyRequestUrl } from '../lib/finance/asaasCompanyClient';
import {
  MemoryRevenueSplitStore,
  RevenueSplitError,
  canResolveAsaasWallet,
  createRevenueSplitService,
  resolveAsaasWalletForFinancialAccount,
  type RevenueSplitActor,
} from '../lib/finance/revenueSplit/server';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const COMPANY_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
const FA_A = '44444444-4444-4444-4444-444444444402';
const FA_OTHER = '55555555-5555-5555-5555-555555555501';

const adminA: RevenueSplitActor = { role: 'ADMIN', companyId: COMPANY_A, userId: 'admin-a' };
const ownerA: RevenueSplitActor = { role: 'OWNER', companyId: COMPANY_A, userId: 'owner-a' };
const brokerA: RevenueSplitActor = { role: 'BROKER', companyId: COMPANY_A, userId: 'broker-a' };

function seedStore(): MemoryRevenueSplitStore {
  const store = new MemoryRevenueSplitStore();
  store.seedAccount({ id: FA_A, companyId: COMPANY_A, active: true });
  store.seedAccount({ id: FA_OTHER, companyId: COMPANY_B, active: true });
  return store;
}

async function expectCode(fn: () => Promise<unknown>, code: string, label: string) {
  try {
    await fn();
    throw new Error(`${label}: deveria falhar com ${code}`);
  } catch (err) {
    if (!(err instanceof RevenueSplitError)) {
      throw new Error(`${label}: deveria ser RevenueSplitError (${String(err)})`);
    }
    assert(err.code === code, `${label}: esperado ${code}, obtido ${err.code}`);
  }
}

function testHelpers() {
  assert(ASAAS_OWN_WALLETS_PATH === '/wallets/', 'path oficial');
  assert(
    buildAsaasCompanyRequestUrl('SANDBOX', ASAAS_OWN_WALLETS_PATH) ===
      `https://${ASAAS_SANDBOX_API_HOST}/v3/wallets/`,
    'Sandbox usa api-sandbox',
  );
  assert(
    buildAsaasCompanyRequestUrl('PRODUCTION', ASAAS_OWN_WALLETS_PATH) ===
      `https://${ASAAS_PRODUCTION_API_HOST}/v3/wallets/`,
    'Production usa api.asaas.com',
  );

  let sandboxCalledProd = false;
  try {
    assertAsaasCompanyRequestHost('SANDBOX', 'https://api.asaas.com/v3/wallets/');
    sandboxCalledProd = true;
  } catch {
    /* esperado */
  }
  assert(!sandboxCalledProd, 'Sandbox nunca chama host Production');

  let prodCalledSandbox = false;
  try {
    assertAsaasCompanyRequestHost('PRODUCTION', 'https://api-sandbox.asaas.com/v3/wallets/');
    prodCalledSandbox = true;
  } catch {
    /* esperado */
  }
  assert(!prodCalledSandbox, 'Production nunca chama host Sandbox');

  const walletId = extractAsaasOwnWalletId({
    object: 'list',
    data: [{ object: 'wallet', id: '0000c712-0a0b-a0b0-0000-031e7ac51a2' }],
  });
  assert(walletId === '0000c712-0a0b-a0b0-0000-031e7ac51a2', 'extrai id da lista oficial');
  assert(maskAsaasWalletId('wal_abcdef1234') === 'wal_••••••••1234', 'máscara wal_');
  assert(maskAsaasWalletId(walletId) === '••••••••51a2', 'máscara uuid');

  assert(
    sanitizeAsaasPublicError(new Error('A chave de API fornecida é inválida $aact_hmlg_SECRET')) ===
      ASAAS_WALLET_INVALID_KEY_MESSAGE,
    'erro sanitizado',
  );
  assert(!sanitizeAsaasPublicError(new Error('$aact_hmlg_SECRET')).includes('SECRET'), 'não vaza chave');

  assert(
    rejectAsaasSecretInRequestBody({ apiKey: 'x' }) ===
      'Não envie API key, token ou senha. Use a credencial já salva na conta.',
    'recusa apiKey no body',
  );
  assert(rejectAsaasSecretInRequestBody({}) === null, 'body vazio ok');

  try {
    assertAsaasApiKeyMatchesEnvironment('$aact_hmlg_xxx', 'PRODUCTION');
    throw new Error('devia bloquear sandbox em production');
  } catch (err) {
    assert(
      err instanceof Error && err.message === ASAAS_WALLET_SANDBOX_KEY_ON_PRODUCTION_MESSAGE,
      'sandbox key ≠ production',
    );
  }
  try {
    assertAsaasApiKeyMatchesEnvironment('$aact_prod_xxx', 'SANDBOX');
    throw new Error('devia bloquear production em sandbox');
  } catch (err) {
    assert(
      err instanceof Error && err.message === ASAAS_WALLET_PRODUCTION_KEY_ON_SANDBOX_MESSAGE,
      'production key ≠ sandbox',
    );
  }
  console.log('OK testHelpers');
}

function testRoles() {
  assert(canResolveAsaasWallet('ADMIN'), 'admin executa');
  assert(canResolveAsaasWallet('SUPER_ADMIN'), 'super admin executa');
  assert(!canResolveAsaasWallet('OWNER'), 'OWNER não executa');
  assert(!canResolveAsaasWallet('BROKER'), 'BROKER não executa');
  console.log('OK testRoles');
}

function testUiSource() {
  const panel = read('components/projects/ProjectRevenueSplitPanel.tsx');
  const accountsPanel = read('components/finance/FinancialAccountsPanel.tsx');
  const mapPage = read('app/map/page.tsx');
  const formModal = read('components/projects/GisProjectFormModal.tsx');
  const ownersModal = read('components/owners/OwnerRevenueSplitModal.tsx');
  const route = read('app/api/finance/asaas/accounts/[id]/resolve-wallet/route.ts');
  const client = read('lib/finance/asaasCompanyClient.ts');
  const resolve = read('lib/finance/revenueSplit/resolveAsaasWallet.ts');
  const barrel = read('lib/finance/revenueSplit/index.ts');
  const clientBarrel = read('lib/finance/revenueSplit/client.ts');
  const serverBarrel = read('lib/finance/revenueSplit/server.ts');

  assert(accountsPanel.includes('Carteira para Split'), 'UI configurações');
  assert(accountsPanel.includes('Não vinculada'), 'UI sem wallet');
  assert(accountsPanel.includes('Carteira Asaas vinculada ✓'), 'UI com wallet');
  assert(accountsPanel.includes('Validar conexão e buscar Wallet ID'), 'botão buscar');
  assert(accountsPanel.includes('Atualizar Wallet ID'), 'botão atualizar');
  assert(panel.includes('REVENUE_SPLIT_WALLET_LINKED_LABEL'), 'split usa status vinculada');
  assert(panel.includes('REVENUE_SPLIT_MISSING_WALLET_MESSAGE'), 'split sem wallet');
  assert(panel.includes('não precisa de Wallet ID no Split'), 'emissor sem wallet');
  assert(panel.includes('showManualWalletFallback'), 'manual só avançado');
  assert(route.includes("method: 'POST'") || route.includes('export async function POST'), 'POST resolve-wallet');
  assert(client.includes(ASAAS_OWN_WALLETS_PATH) || client.includes('/wallets/'), 'GET /wallets/');
  assert(!resolve.includes('console.log') || !resolve.includes('apiKey'), 'resolve sem log de key');
  assert(!route.includes('webhookUrl') && !route.includes('createWebhook'), 'rota não cria webhook');
  assert(barrel.includes("./client"), 'barrel aponta para client');
  assert(!barrel.includes('resolveAsaasWallet'), 'barrel client não exporta resolve');
  assert(!clientBarrel.includes('companyFinancialAccountRepository'), 'client barrel sem repo');
  assert(!clientBarrel.includes('credentialsCrypto'), 'client barrel sem crypto');
  assert(serverBarrel.includes("./resolveAsaasWallet"), 'server exporta resolve');
  for (const [name, src] of [
    ['ProjectRevenueSplitPanel', panel],
    ['FinancialAccountsPanel', accountsPanel],
    ['map/page', mapPage],
    ['GisProjectFormModal', formModal],
    ['OwnerRevenueSplitModal', ownersModal],
  ] as const) {
    assert(!src.includes('credentialsCrypto'), `${name} não importa credentialsCrypto`);
    assert(!src.includes('companyFinancialAccountRepository'), `${name} não importa repository`);
    assert(!src.includes('node:crypto'), `${name} não importa node:crypto`);
    assert(!src.includes('revenueSplit/server'), `${name} não importa barrel server`);
    assert(!src.includes('resolveAsaasWallet'), `${name} não importa resolve direto`);
  }
  console.log('OK testUiSource');
}

async function resolveWith(input: {
  actor: RevenueSplitActor;
  companyId: string;
  financialAccountId: string;
  store: MemoryRevenueSplitStore;
  environment?: BankEnvironment;
  apiKey?: string;
  walletId?: string;
  loadError?: Error;
  fetchError?: Error;
  seen?: { environment?: BankEnvironment; hosts?: string[] };
}) {
  const service = createRevenueSplitService(input.store);
  return resolveAsaasWalletForFinancialAccount({
    admin: {} as never,
    actor: input.actor,
    companyId: input.companyId,
    financialAccountId: input.financialAccountId,
    upsertDestination: (params) => service.upsertAsaasWalletDestination(params),
    loadApiKey: async () => {
      if (input.loadError) throw input.loadError;
      return {
        apiKey: input.apiKey || 'asaas_test_key',
        environment: input.environment || 'SANDBOX',
        integrationId: 'int-1',
        financialAccountId: input.financialAccountId,
      };
    },
    fetchWalletId: async (_apiKey, environment) => {
      input.seen = input.seen || {};
      input.seen.environment = environment;
      input.seen.hosts = [
        ...(input.seen.hosts || []),
        buildAsaasCompanyRequestUrl(environment, ASAAS_OWN_WALLETS_PATH),
      ];
      if (input.fetchError) throw input.fetchError;
      return input.walletId || 'wal_sandbox_ana1234';
    },
  });
}

async function testSandboxSavesWallet() {
  const store = seedStore();
  const seen: { environment?: BankEnvironment; hosts?: string[] } = {};
  const result = await resolveWith({
    actor: adminA,
    companyId: COMPANY_A,
    financialAccountId: FA_A,
    store,
    environment: 'SANDBOX',
    walletId: 'wal_sandbox_ana1234',
    seen,
  });
  assert(result.ok === true, 'HTTP lógico 200');
  assert(result.environment === 'SANDBOX', 'ambiente Sandbox');
  assert(result.walletLinked === true, 'vinculada');
  assert(result.walletMasked === 'wal_••••••••1234', 'máscara');
  assert(!JSON.stringify(result).includes('asaas_test_key'), 'response sem apiKey');
  assert(!JSON.stringify(result).includes('wal_sandbox_ana1234'), 'response sem wallet completa');
  assert(seen.environment === 'SANDBOX', 'consulta Sandbox');
  assert(seen.hosts?.[0]?.includes(ASAAS_SANDBOX_API_HOST), 'host sandbox');
  assert(!seen.hosts?.some((host) => host.includes(ASAAS_PRODUCTION_API_HOST)), 'não chamou production');
  const dests = await store.listDestinations(COMPANY_A, [FA_A]);
  assert(dests.length === 1, 'um destino');
  assert(dests[0].destinationIdentifier === 'wal_sandbox_ana1234', 'wallet persistida');
  assert(dests[0].provider === 'ASAAS_COMPANY', 'provider');
  assert(dests[0].destinationType === 'WALLET_ID', 'tipo');
  assert(dests[0].status === 'ACTIVE', 'status ACTIVE');
  console.log('OK testSandboxSavesWallet');
}

async function testProductionUsesProductionHost() {
  const store = seedStore();
  const seen: { environment?: BankEnvironment; hosts?: string[] } = {};
  const result = await resolveWith({
    actor: adminA,
    companyId: COMPANY_A,
    financialAccountId: FA_A,
    store,
    environment: 'PRODUCTION',
    walletId: 'wal_prod_xxxx9999',
    seen,
  });
  assert(result.environment === 'PRODUCTION', 'ambiente Production');
  assert(seen.hosts?.[0]?.includes(ASAAS_PRODUCTION_API_HOST), 'host production');
  assert(!seen.hosts?.some((host) => host.includes(ASAAS_SANDBOX_API_HOST)), 'não chamou sandbox');
  console.log('OK testProductionUsesProductionHost');
}

async function testKeyEnvironmentMismatchBlocked() {
  const store = seedStore();
  await expectCode(
    () =>
      resolveWith({
        actor: adminA,
        companyId: COMPANY_A,
        financialAccountId: FA_A,
        store,
        environment: 'PRODUCTION',
        apiKey: '$aact_hmlg_sandbox',
      }),
    'ASAAS_ENVIRONMENT_MISMATCH',
    'Production + chave Sandbox',
  );
  const store2 = seedStore();
  await expectCode(
    () =>
      resolveWith({
        actor: adminA,
        companyId: COMPANY_A,
        financialAccountId: FA_A,
        store: store2,
        environment: 'SANDBOX',
        apiKey: '$aact_prod_live',
      }),
    'ASAAS_ENVIRONMENT_MISMATCH',
    'Sandbox + chave Production',
  );
  const store3 = seedStore();
  const seen: { environment?: BankEnvironment; hosts?: string[] } = {};
  const result = await resolveWith({
    actor: adminA,
    companyId: COMPANY_A,
    financialAccountId: FA_A,
    store: store3,
    environment: 'PRODUCTION',
    apiKey: '$aact_prod_live',
    walletId: '0000c712-0a0b-a0b0-0000-031e7ac51a2',
    seen,
  });
  assert(result.environment === 'PRODUCTION', 'Production com chave Production resolve');
  assert(seen.hosts?.[0]?.includes(ASAAS_PRODUCTION_API_HOST), 'wallet Production no host Production');
  console.log('OK testKeyEnvironmentMismatchBlocked');
}

async function testMissingAndInvalidKey() {
  const store = seedStore();
  await expectCode(
    () =>
      resolveWith({
        actor: adminA,
        companyId: COMPANY_A,
        financialAccountId: FA_A,
        store,
        loadError: new Error(ASAAS_WALLET_MISSING_API_KEY_MESSAGE),
      }),
    'ASAAS_API_KEY_MISSING',
    'API key ausente',
  );
  await expectCode(
    () =>
      resolveWith({
        actor: adminA,
        companyId: COMPANY_A,
        financialAccountId: FA_A,
        store,
        fetchError: new Error('A chave de API fornecida é inválida'),
      }),
    'ASAAS_WALLET_LOOKUP_FAILED',
    'API key inválida',
  );
  const store2 = seedStore();
  try {
    await resolveWith({
      actor: adminA,
      companyId: COMPANY_A,
      financialAccountId: FA_A,
      store: store2,
      fetchError: new Error('A chave de API fornecida é inválida $aact_hmlg_LEAK'),
    });
    throw new Error('devia falhar');
  } catch (err) {
    assert(err instanceof RevenueSplitError, 'erro tipado');
    assert(!err.message.includes('aact_'), 'mensagem sem chave');
    assert(err.message === ASAAS_WALLET_INVALID_KEY_MESSAGE, 'mensagem sanitizada');
  }
  console.log('OK testMissingAndInvalidKey');
}

async function testUpsertDoesNotDuplicate() {
  const store = seedStore();
  await resolveWith({
    actor: adminA,
    companyId: COMPANY_A,
    financialAccountId: FA_A,
    store,
    walletId: 'wal_one_aaaa1111',
  });
  await resolveWith({
    actor: adminA,
    companyId: COMPANY_A,
    financialAccountId: FA_A,
    store,
    walletId: 'wal_two_bbbb2222',
  });
  const dests = await store.listDestinations(COMPANY_A, [FA_A]);
  assert(dests.length === 1, 'não duplica');
  assert(dests[0].destinationIdentifier === 'wal_two_bbbb2222', 'atualiza wallet');
  console.log('OK testUpsertDoesNotDuplicate');
}

async function testPermissionsAndTenant() {
  const store = seedStore();
  await expectCode(
    () =>
      resolveWith({
        actor: ownerA,
        companyId: COMPANY_A,
        financialAccountId: FA_A,
        store,
      }),
    'PERMISSION_DENIED',
    'OWNER bloqueado',
  );
  await expectCode(
    () =>
      resolveWith({
        actor: brokerA,
        companyId: COMPANY_A,
        financialAccountId: FA_A,
        store,
      }),
    'PERMISSION_DENIED',
    'BROKER bloqueado',
  );
  await expectCode(
    () =>
      resolveWith({
        actor: adminA,
        companyId: COMPANY_A,
        financialAccountId: FA_OTHER,
        store,
      }),
    'FINANCIAL_ACCOUNT_TENANT_MISMATCH',
    'cross-tenant bloqueado',
  );
  console.log('OK testPermissionsAndTenant');
}

async function main() {
  testHelpers();
  testRoles();
  testUiSource();
  await testSandboxSavesWallet();
  await testProductionUsesProductionHost();
  await testKeyEnvironmentMismatchBlocked();
  await testMissingAndInvalidKey();
  await testUpsertDoesNotDuplicate();
  await testPermissionsAndTenant();
  console.log('\nALL mandatory-payment-split-wallet-resolve-tests PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
