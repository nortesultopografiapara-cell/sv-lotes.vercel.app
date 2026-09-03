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
    UnknownChargesProviderError,
    C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  } = require('../lib/charges/chargeProviderRouting') as typeof import('../lib/charges/chargeProviderRouting');

  assert.equal(normalizeChargesEmitProvider('INTER'), 'INTER');
  assert.equal(normalizeChargesEmitProvider('inter'), 'INTER');
  assert.equal(normalizeChargesEmitProvider('ASAAS'), 'ASAAS_COMPANY');
  assert.equal(normalizeChargesEmitProvider(null), 'ASAAS_COMPANY');
  assert.equal(normalizeChargesEmitProvider('C6'), 'C6');

  assert.throws(
    () => normalizeChargesEmitProvider('SICOOB'),
    (err: unknown) => err instanceof UnknownChargesProviderError,
  );
  assert.equal(
    C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
    'Integração C6 Bank ainda não homologada para emissão.',
  );

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
  assert.match(service, /throwIfC6EmissionAttempt/);

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
