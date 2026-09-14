/**
 * Hotfix — cobranças Asaas com múltiplas contas financeiras.
 * npm run test:asaas-multi-account-charges
 */

import fs from 'fs';
import path from 'path';
import { resolveAsaasSyncInstallmentIds } from '../lib/charges/chargeIntegrationHelpers';
import { FINANCIAL_ACCOUNT_REQUIRED } from '../lib/finance/financialAccountRequired';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function testSyncInstallmentIdsByAccount() {
  const rows = [
    { id: 'inst-a', financial_account_id: 'fa-1' },
    { id: 'inst-b', financial_account_id: 'fa-2' },
    { id: 'inst-legacy', financial_account_id: 'fa-1' },
  ];
  const chargesByInstallment = {
    'inst-a': { asaasPaymentId: 'pay-a', financialAccountId: 'fa-1' },
    'inst-b': { asaasPaymentId: 'pay-b', financialAccountId: 'fa-2' },
    'inst-legacy': { asaasPaymentId: 'pay-legacy', financialAccountId: null },
  };

  const all = resolveAsaasSyncInstallmentIds({
    rows,
    chargesByInstallment,
    financialAccountFilter: 'Todas as contas',
  });
  assert(all.join(',') === 'inst-a,inst-b,inst-legacy', 'Todas as contas sincroniza cada cobrança Asaas');

  const fa2 = resolveAsaasSyncInstallmentIds({
    rows,
    chargesByInstallment,
    financialAccountFilter: 'fa-2',
  });
  assert(fa2.join(',') === 'inst-b', 'filtro de conta usa financialAccountId da cobrança');

  const fa1 = resolveAsaasSyncInstallmentIds({
    rows,
    chargesByInstallment,
    financialAccountFilter: 'fa-1',
  });
  assert(fa1.join(',') === 'inst-a,inst-legacy', 'cobrança antiga sem FA cai na conta da parcela');
}

function testIntegrationOverviewDoesNotRequireUniqueAccount() {
  const route = read('app/api/finance/asaas/integration/route.ts');
  const repo = read('lib/finance/asaasIntegrationRepository.ts');
  assert(route.includes('getCompanyAsaasIntegrationOverview'), 'GET integração usa overview multi-conta');
  assert(!route.includes('getCompanyAsaasIntegrationConfig(auth.admin, auth.tenantId)'), 'GET não resolve conta única sem FA');
  assert(repo.includes('export async function getCompanyAsaasIntegrationOverview'), 'overview exportado');
  assert(repo.includes('accounts.some((account) => account.ready)'), 'ready se qualquer conta Asaas estiver operacional');
  assert(repo.includes('multiAccount: accounts.length > 1'), 'sinaliza multi-conta');
}

function testSettingsPanelSendsFinancialAccountId() {
  const panel = read('components/finance/AsaasIntegrationPanel.tsx');
  assert(panel.includes('financialAccountId: selectedFinancialAccountId'), 'painel envia financialAccountId nas ações');
  assert(panel.includes('asaas-account-select'), 'seletor de conta Asaas quando há contas');
  assert(panel.includes('Nenhuma conta Asaas conectada'), 'estado vazio preservado para zero contas');
  assert(panel.includes('accounts.length > 0'), 'não mostra vazio só porque há 2+ contas');

  for (const rel of [
    'app/api/finance/asaas/test-connection/route.ts',
    'app/api/finance/asaas/validate-webhook/route.ts',
    'app/api/finance/asaas/sync-charges/route.ts',
    'app/api/finance/asaas/reprocess-payments/route.ts',
    'app/api/finance/asaas/integration/route.ts',
  ]) {
    const source = read(rel);
    assert(
      source.includes('parseFinancialAccountIdFromRecord') || source.includes('parseFinancialAccountIdFromRequestUrl'),
      `${rel} aceita financial_account_id`,
    );
  }

  const wallet = read('app/api/finance/asaas/accounts/[id]/resolve-wallet/route.ts');
  assert(wallet.includes('financialAccountId: id.trim()'), 'resolve Wallet continua por conta');
}

function testChargesUsesChargeAccountNotDefault() {
  const page = read('components/charges/ChargesPageClient.tsx');
  const service = read('lib/finance/asaasCompanyChargeService.ts');
  const required = read('lib/finance/financialAccountRequired.ts');
  assert(page.includes('json.ready ?? json.canOperate'), 'charges lê ready da API');
  assert(page.includes('integrationApiReady'), 'charges guarda ready multi-conta');
  assert(page.includes('resolveAsaasSyncInstallmentIds'), 'sync da lista usa conta da cobrança/filtro');
  assert(page.includes('financialAccountFilter'), 'Atualizar lista respeita filtro de conta');
  assert(
    !page.includes("loadInstallments({ syncAsaasStatuses: integrationReady && !ownerReadOnly })"),
    'Atualizar lista não depende de conta padrão ambígua',
  );
  assert(service.includes('resolveExistingChargeFinancialAccountId'), 'status individual resolve FA da cobrança');
  assert(service.includes('resolveUniqueProviderAccount'), 'cobrança antiga usa fallback só se conta for única');
  assert(required.includes(FINANCIAL_ACCOUNT_REQUIRED), '2+ contas sem FA continuam com erro explícito');
}

function testWebhookReconcilesWithoutDefaultAccount() {
  const webhook = read('lib/finance/companyAsaasWebhookHandler.ts');
  assert(webhook.includes('getCompanyAsaasChargeByPaymentId'), 'webhook acha cobrança pelo payment id');
  assert(webhook.includes('loadAllCompanyAsaasWebhookTokens'), 'webhook tenta tokens de todas as contas Asaas');
  assert(webhook.includes('isFinancialAccountRequiredError'), 'unique resolve não derruba o webhook');
  assert(webhook.includes('executeCompanyAsaasPaymentReconciliation'), 'PAYMENT_RECEIVED reconcilia parcela');
  assert(webhook.includes('loadAsaasWebhookTokenForAccount'), 'token da conta da cobrança após localizar charge');
  assert(webhook.includes("listActiveFinancialAccountsForProvider(admin, companyId, 'ASAAS_COMPANY')"), 'tokens só de contas Asaas');
}

function testSyncAndDedupeAndSplitStayIntact() {
  const sync = read('lib/finance/asaasIntegrationService.ts');
  const reconcile = read('lib/finance/companyAsaasPaymentReconciliation.ts');
  const splitAdapter = read('lib/finance/revenueSplit/asaasCompanySplitAdapter.ts');
  const wallet = read('lib/finance/revenueSplit/resolveAsaasWallet.ts');
  assert(sync.includes('listActiveFinancialAccountsForProvider'), 'sync sem FA itera todas as contas Asaas');
  assert(sync.includes('bulkUpdateCompanyChargeStatuses'), 'sync recupera pagamentos consultando Asaas por cobrança');
  assert(reconcile.includes('findExistingCompanyAsaasCashMovement'), 'reprocessamento preserva dedupe de caixa');
  assert(reconcile.includes("eventType: 'REPROCESS'"), 'reprocess usa reconciliação idempotente');
  assert(splitAdapter.includes('WALLET_ENVIRONMENT_MISMATCH'), 'Payment Split recusa wallet de ambiente errado');
  assert(wallet.includes('assertAsaasApiKeyMatchesEnvironment'), 'Sandbox/Production continuam isolados no Wallet');
}

function testUniqueResolverStillThrowsForMutatingOps() {
  const repo = read('lib/finance/asaasIntegrationRepository.ts');
  assert(repo.includes('resolveUniqueProviderAccount(admin, companyId, \'ASAAS_COMPANY\')'), 'get config sem FA ainda exige conta única');
  const required = read('lib/finance/financialAccountRequired.ts');
  assert(required.includes('accounts.length >= 2'), '2+ contas ativas não escolhem credencial arbitrariamente');
}

function main() {
  testSyncInstallmentIdsByAccount();
  testIntegrationOverviewDoesNotRequireUniqueAccount();
  testSettingsPanelSendsFinancialAccountId();
  testChargesUsesChargeAccountNotDefault();
  testWebhookReconcilesWithoutDefaultAccount();
  testSyncAndDedupeAndSplitStayIntact();
  testUniqueResolverStillThrowsForMutatingOps();
  console.log('OK mandatory-asaas-multi-account-charges');
}

main();
