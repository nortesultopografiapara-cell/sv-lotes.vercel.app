/**
 * Testes obrigatórios — cobrança SaaS PIX real (Fase 1).
 * npm run test:saas-payment
 */

import fs from 'node:fs';
import path from 'node:path';
import { MockPaymentProvider } from '../lib/payments/providers/mock';
import { mapProviderStatusToChargeStatus } from '../lib/payments/providers/types';
import { resolvePaymentProviderName } from '../lib/payments/providers';
import {
  assertSaasPaymentGatewayConfigured,
  getSaasPaymentGatewayStatus,
  isProductionPaymentEnvironment,
  isSaasPaymentGatewayConfigured,
  SAAS_PAYMENT_GATEWAY_NOT_CONFIGURED_MESSAGE,
} from '../lib/saasPaymentGateway';
import { saasChargeStatusLabel } from '../lib/saasCharges';
import { resolveSaasFinancialSituation } from '../lib/masterSaasFinancialStatus';
import { shouldShowFullTenantAdminMenu, isBrokerRole, isOwnerRole } from '../lib/rolePermissions';
import {
  handleAsaasPaymentWebhook,
  type AsaasWebhookDeps,
} from '../lib/saasAsaasWebhook';

const ROOT = process.cwd();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(relPath: string): string {
  const full = path.join(ROOT, relPath);
  assert(fs.existsSync(full), `arquivo ausente: ${relPath}`);
  return fs.readFileSync(full, 'utf8');
}

async function testPixChargeGeneration() {
  const provider = new MockPaymentProvider();
  const result = await provider.createPixCharge({
    companyId: 'company-1',
    chargeId: 'charge-1',
    amount: 549.99,
    dueDate: '2026-07-27',
    description: 'SV LOTES — Assinatura 2026-07',
    payerName: 'MENESES IMOBILIARIA',
  });

  assert(!!result.paymentId, 'paymentId gerado');
  assert(result.pixCopyPaste.includes('BR.GOV.BCB.PIX'), 'PIX copia e cola');
  assert(result.pixQrCode.includes('svg') || result.pixQrCode.includes('png'), 'QR code');
  assert(result.status === 'PENDING', 'status pendente');
}

function testBillingMenuVisibility() {
  const layout = read('components/Layout.tsx');
  assert(layout.includes("name: 'Minha Assinatura'"), 'item Minha Assinatura');
  assert(layout.includes("href: '/billing'"), 'rota /billing no menu');
  assert(layout.includes('CreditCard'), 'ícone cartão');
  assert(layout.includes('shouldShowFullTenantAdminMenu(role)'), 'menu admin tenant');

  assert(shouldShowFullTenantAdminMenu('ADMIN_EMPRESA'), 'ADMIN_EMPRESA vê menu tenant');
  assert(shouldShowFullTenantAdminMenu('ADMIN'), 'ADMIN vê menu tenant');
  assert(!shouldShowFullTenantAdminMenu('BROKER'), 'BROKER não usa menu admin');
  assert(!shouldShowFullTenantAdminMenu('OWNER'), 'OWNER não usa menu admin');

  assert(isBrokerRole('BROKER'), 'broker role');
  assert(isOwnerRole('OWNER'), 'owner role');

  const brokerSection = layout.split('if (isBrokerRole(role))')[1]?.split('if (isOwnerRole(role))')[0] || '';
  assert(!brokerSection.includes('/billing'), '/billing ausente para BROKER');

  const ownerSection = layout.split('if (isOwnerRole(role))')[1]?.split('return [')[0] || '';
  assert(!ownerSection.includes('/billing'), '/billing ausente para OWNER');
}

function testProductionGatewayRules() {
  const gateway = read('lib/saasPaymentGateway.ts');
  assert(gateway.includes('isProductionPaymentEnvironment'), 'detecta produção');
  assert(gateway.includes('assertSaasPaymentGatewayConfigured'), 'assert gateway');
  assert(
    gateway.includes(SAAS_PAYMENT_GATEWAY_NOT_CONFIGURED_MESSAGE),
    'mensagem amigável',
  );

  const providers = read('lib/payments/providers/index.ts');
  assert(providers.includes('assertSaasPaymentGatewayConfigured'), 'provider usa assert');

  const api = read('app/api/master/saas-charges/route.ts');
  assert(api.includes('assertSaasPaymentGatewayConfigured'), 'API valida gateway');
  assert(api.includes('503'), 'API retorna 503 sem gateway');

  const origNode = process.env.NODE_ENV;
  const origKey = process.env.ASAAS_API_KEY;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ASAAS_API_KEY;
    assert(isProductionPaymentEnvironment(), 'NODE_ENV production simulado');
    assert(!isSaasPaymentGatewayConfigured(), 'produção sem key não configurada');
    let threw = false;
    try {
      assertSaasPaymentGatewayConfigured();
    } catch (e) {
      threw = true;
      assert(
        (e as Error).message.includes('ASAAS_API_KEY'),
        'erro claro em produção sem key',
      );
    }
    assert(threw, 'assert lança em produção sem key');

    process.env.NODE_ENV = 'development';
    assert(isSaasPaymentGatewayConfigured(), 'development permite mock');
    assert(resolvePaymentProviderName() === 'mock', 'dev usa mock');
  } finally {
    process.env.NODE_ENV = origNode;
    if (origKey !== undefined) process.env.ASAAS_API_KEY = origKey;
    else delete process.env.ASAAS_API_KEY;
  }
}

function testSaasFinanceGatewayUi() {
  const saasFinance = read('app/saas-finance/page.tsx');
  assert(saasFinance.includes('paymentGateway'), 'estado gateway');
  assert(saasFinance.includes('Gateway PIX não configurado'), 'banner gateway');
  assert(saasFinance.includes('!gatewayReady'), 'botão desabilitado sem gateway');
  assert(saasFinance.includes('/api/master/saas-charges'), 'consulta status gateway');
}

function testProviderArchitecture() {
  const index = read('lib/payments/providers/index.ts');
  assert(index.includes('AsaasPaymentProvider'), 'provider Asaas');
  assert(index.includes('MockPaymentProvider'), 'provider mock');
  assert(fs.existsSync(path.join(ROOT, 'lib/payments/providers/efi.ts')), 'stub efi');
}

function testWebhookRouteStructure() {
  const webhook = read('app/api/payments/webhook/route.ts');
  assert(webhook.includes('handleAsaasPaymentWebhook'), 'webhook delega ao handler');
  const handler = read('lib/saasAsaasWebhook.ts');
  assert(handler.includes('ignored: true'), 'handler retorna ignored');
  assert(!handler.includes('status: 500'), 'handler não retorna 500 ao Asaas');
}

function makeWebhookRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request('http://localhost/api/payments/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function mockWebhookDeps(processPaidImpl: AsaasWebhookDeps['processPaid']): AsaasWebhookDeps {
  return {
    createSupabase: () => ({
      client: {} as never,
    }),
    processPaid: processPaidImpl,
  };
}

async function testWebhookResponses() {
  const origToken = process.env.ASAAS_WEBHOOK_TOKEN;
  process.env.ASAAS_WEBHOOK_TOKEN = 'webhook-test-token';

  try {
    const deps = mockWebhookDeps(async () => {
      throw new Error('Cobrança não encontrada.');
    });

    const paidRes = await handleAsaasPaymentWebhook(
      makeWebhookRequest(
        {
          event: 'PAYMENT_RECEIVED',
          payment: { id: 'pay_unknown', status: 'RECEIVED' },
        },
        { 'asaas-access-token': 'webhook-test-token' },
      ),
      deps,
    );
    assert(paidRes.status === 200, 'PAYMENT_RECEIVED sem cobrança → HTTP 200');
    const paidBody = await paidRes.json();
    assert(paidBody.ok === true && paidBody.ignored === true, 'PAYMENT_RECEIVED ignored=true');
    assert(
      String(paidBody.reason).includes('Cobrança não encontrada'),
      'motivo cobrança ausente',
    );

    const unknownRes = await handleAsaasPaymentWebhook(
      makeWebhookRequest(
        {
          event: 'PAYMENT_DELETED',
          payment: { id: 'pay_1', status: 'DELETED' },
        },
        { 'asaas-access-token': 'webhook-test-token' },
      ),
      deps,
    );
    assert(unknownRes.status === 200, 'evento desconhecido → HTTP 200');
    const unknownBody = await unknownRes.json();
    assert(unknownBody.ignored === true, 'evento desconhecido ignored=true');
    assert(String(unknownBody.reason).includes('Evento não tratado'), 'motivo evento desconhecido');

    const noIdRes = await handleAsaasPaymentWebhook(
      makeWebhookRequest(
        { event: 'PAYMENT_RECEIVED', payment: { status: 'RECEIVED' } },
        { 'asaas-access-token': 'webhook-test-token' },
      ),
      deps,
    );
    assert(noIdRes.status === 200, 'sem payment.id → HTTP 200');
    const noIdBody = await noIdRes.json();
    assert(noIdBody.ignored === true, 'sem payment.id ignored=true');
    assert(String(noIdBody.reason).includes('payment.id ausente'), 'motivo payment.id ausente');

    const invalidTokenRes = await handleAsaasPaymentWebhook(
      makeWebhookRequest(
        { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } },
        { 'asaas-access-token': 'token-errado' },
      ),
      deps,
    );
    assert(invalidTokenRes.status === 401, 'token inválido → HTTP 401');

    const invalidJsonRes = await handleAsaasPaymentWebhook(
      makeWebhookRequest('{ invalid json', { 'asaas-access-token': 'webhook-test-token' }),
      deps,
    );
    assert(invalidJsonRes.status === 400, 'JSON inválido → HTTP 400');
  } finally {
    if (origToken === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN;
    else process.env.ASAAS_WEBHOOK_TOKEN = origToken;
  }
}

function testFinancialStatusRules() {
  const emDia = resolveSaasFinancialSituation({
    company: { id: 'c1', active: true, status_operacional: 'Ativa' },
    subscription: {
      id: 's1',
      company_id: 'c1',
      next_due_date: '2026-12-27',
      payment_status: 'paid',
      contract_status: 'active',
    } as never,
    nextDueDate: '2026-12-27',
    today: new Date('2026-06-01T12:00:00'),
  });
  assert(emDia.situation === 'EM DIA', 'EM DIA');
}

function testReactivationAndHistory() {
  const saasCharges = read('lib/saasCharges.ts');
  assert(saasCharges.includes('reactivateCompanyOnPayment'), 'reativação automática');
  assert(saasCharges.includes("from('master_saas_payments')"), 'histórico');
}

function testDatabaseMigration() {
  const migration = read('supabase/migrations/20260720130000_saas_charges.sql');
  assert(migration.includes('saas_charges'), 'tabela saas_charges');
}

function testBillingPage() {
  assert(fs.existsSync(path.join(ROOT, 'app/billing/page.tsx')), 'página /billing');
}

function testChargeStatusMapping() {
  assert(mapProviderStatusToChargeStatus('RECEIVED') === 'PAID', 'RECEIVED → PAID');
  assert(saasChargeStatusLabel('PAID') === 'Pago', 'label pago');
  const status = getSaasPaymentGatewayStatus();
  assert(typeof status.configured === 'boolean', 'status gateway objeto');
}

async function run() {
  const tests: Array<[string, () => void | Promise<void>]> = [
    ['geração cobrança PIX', testPixChargeGeneration],
    ['menu /billing ADMIN', testBillingMenuVisibility],
    ['produção sem mock', testProductionGatewayRules],
    ['UI gateway saas-finance', testSaasFinanceGatewayUi],
    ['arquitetura providers', testProviderArchitecture],
    ['webhook estrutura', testWebhookRouteStructure],
    ['webhook respostas Asaas', testWebhookResponses],
    ['status financeiro', testFinancialStatusRules],
    ['reativação e histórico', testReactivationAndHistory],
    ['migration saas_charges', testDatabaseMigration],
    ['página /billing', testBillingPage],
    ['mapeamento status charge', testChargeStatusMapping],
  ];

  for (const [name, fn] of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }

  console.log(`\n${tests.length} grupos de testes SaaS payment OK.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
