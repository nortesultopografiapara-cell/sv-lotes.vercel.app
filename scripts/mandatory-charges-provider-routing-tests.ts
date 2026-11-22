/**
 * Central de Cobranças: roteamento por provider da conta financeira.
 * Garante INTER ≠ Asaas, guard WRONG_PROVIDER e labels neutras.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testRoutingHelpers() {
  const {
    normalizeChargesEmitProvider,
    resolveChargesEmitProviderForAccount,
    resolveChargesEmitProviderByAccountId,
    isConfirmedPersistedProviderCharge,
    INTER_PROVIDER_BLOCKED_ON_ASAAS_MESSAGE,
  } = require('../lib/charges/chargeProviderRouting') as typeof import('../lib/charges/chargeProviderRouting');

  assert.equal(normalizeChargesEmitProvider('INTER'), 'INTER');
  assert.equal(normalizeChargesEmitProvider('inter'), 'INTER');
  assert.equal(normalizeChargesEmitProvider('C6'), 'C6');
  assert.equal(normalizeChargesEmitProvider('ASAAS'), 'ASAAS_COMPANY');
  assert.equal(normalizeChargesEmitProvider(null), 'ASAAS_COMPANY');

  assert.equal(
    resolveChargesEmitProviderForAccount({ provider: 'INTER' }),
    'INTER',
  );
  assert.equal(
    resolveChargesEmitProviderForAccount({ provider: 'ASAAS_COMPANY' }),
    'ASAAS_COMPANY',
  );

  const accounts = {
    inter: { id: 'inter', provider: 'INTER' },
    asaas: { id: 'asaas', provider: 'ASAAS_COMPANY' },
  } as const;
  assert.equal(
    resolveChargesEmitProviderByAccountId('inter', accounts as never),
    'INTER',
  );
  assert.equal(
    resolveChargesEmitProviderByAccountId('asaas', accounts as never),
    'ASAAS_COMPANY',
  );
  assert.equal(
    resolveChargesEmitProviderByAccountId('', accounts as never),
    'ASAAS_COMPANY',
  );

  assert.equal(
    isConfirmedPersistedProviderCharge({
      id: 'c1',
      asaasPaymentId: 'ext-1',
      status: 'PENDING',
    }),
    true,
  );
  assert.equal(
    isConfirmedPersistedProviderCharge({
      id: 'c1',
      asaasPaymentId: '',
      status: 'PENDING',
    }),
    false,
  );
  assert.equal(
    isConfirmedPersistedProviderCharge({
      id: 'c1',
      asaasPaymentId: 'ext-1',
      status: 'CANCELLED',
    }),
    false,
  );

  assert.match(INTER_PROVIDER_BLOCKED_ON_ASAAS_MESSAGE, /Banco Inter/i);
  console.log('OK testRoutingHelpers');
}

function testAsaasGuard() {
  const service = read('lib/finance/asaasCompanyChargeService.ts');
  assert.match(service, /CompanyAsaasWrongProviderError/);
  assert.match(service, /provider === 'INTER'/);
  assert.match(service, /INTER_PROVIDER_BLOCKED_ON_ASAAS_MESSAGE/);

  const route = read('app/api/finance/asaas/create-charge/route.ts');
  assert.match(route, /CompanyAsaasWrongProviderError/);
  assert.match(route, /WRONG_PROVIDER/);
  console.log('OK testAsaasGuard');
}

function testCentralRoutesByProvider() {
  const page = read('components/charges/ChargesPageClient.tsx');
  assert.match(page, /\/api\/finance\/inter\/refresh-charge/);
  assert.match(page, /handleRefreshInter/);
  assert.match(page, /\/api\/finance\/inter\/pdf/);
  assert.match(page, /\/api\/finance\/asaas\/create-charge/);
  assert.match(page, /\/api\/finance\/inter\/charges/);
  const c6LoadAt = page.indexOf('await loadC6ChargeMap(installmentIds)');
  const syncReturnAt = page.indexOf('if (!shouldSyncAsaas) return;');
  assert.ok(c6LoadAt > 0 && syncReturnAt > c6LoadAt, 'Cobranças lê o C6 antes de decidir se consulta o Asaas');
  assert.match(page, /c6ChargesLoaded/);
  assert.match(page, /\/api\/finance\/c6\/charges/);
  assert.match(page, /\/api\/banking\/c6\/charges/);
  assert.match(page, /resolveRowProvider/);
  assert.match(page, /createInterChargeRequest/);
  assert.match(page, /handleCreateCharge/);
  assert.match(page, /provider === 'INTER'/);
  assert.match(page, /Aguardando geração/);
  assert.doesNotMatch(page, /Aguardando geração Asaas/);
  assert.match(page, /Cobranças emitidas/);
  assert.doesNotMatch(page, /Cobranças Asaas emitidas/);
  assert.match(page, /<th>Status cobrança<\/th>/);
  assert.doesNotMatch(page, /<th>Status Asaas<\/th>/);

  const actions = read('components/charges/ChargeInstallmentActions.tsx');
  assert.match(actions, /Banco Inter \(Cobrança V3/);
  assert.match(actions, /chargeProvider/);
  assert.match(actions, /Gerar boleto C6/);
  assert.match(actions, /Consultando cobrança C6/);
  assert.match(actions, /não confirma que o boleto já pode ser pago na rede bancária/);
  assert.doesNotMatch(actions, /href=\{`\/api\/banking\/c6\/charges\/pdf/);
  assert.match(actions, /WhatsApp/);
  const whatsappStart = page.indexOf('const handleWhatsApp =');
  const whatsappBody = page.slice(whatsappStart, page.indexOf('const runBulkGenerate', whatsappStart));
  assert.doesNotMatch(whatsappBody, /\/api\/banking\/c6\/charges/);
  assert.match(whatsappBody, /executeChargeWhatsAppShare/);
  const consultAt = actions.indexOf('Consultando cobrança C6');
  const generateAt = actions.indexOf('Gerar boleto C6');
  assert.ok(consultAt > 0 && consultAt < generateAt, 'Gerar C6 só aparece depois da leitura local');

  const interCreate = read('app/api/finance/inter/create-charge/route.ts');
  assert.match(interCreate, /createInterInstallmentCharge/);
  assert.match(interCreate, /findActiveInterBankChargeForReceipt/);
  assert.match(interCreate, /bankChargeToSummaryLike/);
  assert.match(interCreate, /external_id/);
  console.log('OK testCentralRoutesByProvider');
}

function testKpiRequiresExternalId() {
  const ops = read('lib/charges/chargeOperationsHelpers.ts');
  assert.match(ops, /asaasPaymentId/);
  assert.match(ops, /Só conta como emitida/);
  console.log('OK testKpiRequiresExternalId');
}

function main() {
  testRoutingHelpers();
  testAsaasGuard();
  testCentralRoutesByProvider();
  testKpiRequiresExternalId();
  console.log('ALL mandatory-charges-provider-routing-tests passed');
}

main();
