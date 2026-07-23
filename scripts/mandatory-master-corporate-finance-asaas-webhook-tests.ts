/**
 * Testes — Asaas Corporativo MASTER webhook/liquidação (Fase 7.3).
 * npx tsx scripts/mandatory-master-corporate-finance-asaas-webhook-tests.ts
 */
import fs from 'fs';
import path from 'path';
import { assertCorporateFinanceAccess } from '../lib/master/corporateFinance/service';
import {
  requireCorporateAsaasWebhookToken,
  parseCorporateAsaasExternalReference,
  isCorporateAsaasDomain,
  MASTER_CORPORATE_ASAAS_DOMAIN,
} from '../lib/master/corporateFinance/asaas/domain';
import {
  canDowngradeCorporateAsaasStatus,
  isCorporateAsaasPaidStatus,
} from '../lib/master/corporateFinance/asaas/types';
import { sanitizeCorporateAsaasPayload } from '../lib/master/corporateFinance/asaas/validation';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testFiles() {
  assert(exists('lib/master/corporateFinance/asaas/webhookSettlement.ts'), 'settlement');
  assert(exists('app/api/master/corporate-finance/asaas/webhook/route.ts'), 'webhook route');
  assert(
    exists('app/api/master/corporate-finance/asaas/charges/[id]/reprocess/route.ts'),
    'reprocess',
  );
  const mw = read('middleware.ts');
  assert(
    mw.includes('/api/master/corporate-finance/asaas/webhook'),
    'middleware public webhook',
  );
}

function testTokenFailClosed() {
  const prev = process.env.ASAAS_CORPORATE_WEBHOOK_TOKEN;
  delete process.env.ASAAS_CORPORATE_WEBHOOK_TOKEN;
  let threw = false;
  try {
    requireCorporateAsaasWebhookToken();
  } catch {
    threw = true;
  }
  assert(threw, 'token ausente deve falhar');
  process.env.ASAAS_CORPORATE_WEBHOOK_TOKEN = 'corp-test-token';
  assert(requireCorporateAsaasWebhookToken() === 'corp-test-token', 'token ok');
  if (prev === undefined) delete process.env.ASAAS_CORPORATE_WEBHOOK_TOKEN;
  else process.env.ASAAS_CORPORATE_WEBHOOK_TOKEN = prev;
}

function testIsolation() {
  const wh = read('app/api/master/corporate-finance/asaas/webhook/route.ts');
  assert(wh.includes('requireCorporateAsaasWebhookToken'), 'token dedicado');
  assert(!wh.includes('ASAAS_WEBHOOK_TOKEN'), 'não usa token SaaS como principal');
  assert(!wh.includes('company-webhook'), 'sem company webhook');

  const settle = read('lib/master/corporateFinance/asaas/webhookSettlement.ts');
  assert(settle.includes('master_corporate_asaas_charges'), 'só tabela corporativa');
  assert(settle.includes('MASTER_CORPORATE_FINANCE'), 'domínio');
  assert(settle.includes('receiveReceivable'), 'liquida AR');
  assert(settle.includes("origin: 'ASAAS'"), 'origem ASAAS');
  assert(settle.includes('ASAAS_CORP:'), 'idempotency payment');
  assert(settle.includes('payment.value'), 'usa value do cliente');
  assert(!settle.includes('finance_receipts'), 'sem finance_receipts');
  assert(!settle.includes("from('saas_charges')"), 'sem query saas_charges');
  assert(!settle.includes("from('company_asaas"), 'sem company_asaas');

  // Webhooks legados intactos
  assert(exists('app/api/payments/webhook/route.ts'), 'SaaS webhook intacto');
  assert(exists('app/api/finance/asaas/company-webhook/route.ts'), 'company webhook intacto');
  const saasWh = read('app/api/payments/webhook/route.ts');
  assert(!saasWh.includes('master_corporate_asaas'), 'SaaS não toca corporativo');
}

function testDomainGate() {
  assert(isCorporateAsaasDomain(MASTER_CORPORATE_ASAAS_DOMAIN), 'domain ok');
  assert(!isCorporateAsaasDomain('SAAS'), 'domain saas rejeitado');
  const parsed = parseCorporateAsaasExternalReference('MCF:abc-123');
  assert(parsed?.receivableId === 'abc-123', 'MCF parse');
  assert(parseCorporateAsaasExternalReference('SAAS:xyz') === null, 'SAAS ref rejeitado');
}

function testNoDowngrade() {
  assert(isCorporateAsaasPaidStatus('RECEIVED'), 'received paid');
  assert(!canDowngradeCorporateAsaasStatus('CONFIRMED', 'OVERDUE'), 'no downgrade');
  assert(canDowngradeCorporateAsaasStatus('CONFIRMED', 'REFUNDED'), 'refund ok');
}

function testSanitize() {
  const sanitized = sanitizeCorporateAsaasPayload({
    event: 'PAYMENT_RECEIVED',
    payment: {
      id: 'pay_1',
      status: 'RECEIVED',
      value: 10,
      cpfCnpj: '12345678901',
      creditCard: { number: '4111' },
    },
    accessToken: 'secret',
  });
  assert(sanitized.event === 'PAYMENT_RECEIVED', 'event kept');
  const p = sanitized.payment as Record<string, unknown>;
  assert(p.id === 'pay_1', 'payment id');
  assert(!('cpfCnpj' in p), 'sem cpf');
  assert(!('creditCard' in p), 'sem card');
  assert(!('accessToken' in sanitized), 'sem token');
}

function testAccess() {
  assert(assertCorporateFinanceAccess({ userId: 'u1' }).ok, 'ok');
  assert(
    !assertCorporateFinanceAccess({ userId: 'u1', impersonatingTenantId: 't' }).ok,
    'impersonation',
  );
}

function testSyncSettles() {
  const svc = read('lib/master/corporateFinance/asaas/chargesService.ts');
  assert(svc.includes('settleCorporateAsaasChargeFromRemote'), 'sync liquida se pago');
}

function main() {
  console.log('=== Fase 7.3 corporate Asaas webhook tests ===');
  testFiles();
  console.log('OK files');
  testTokenFailClosed();
  console.log('OK token');
  testIsolation();
  console.log('OK isolation');
  testDomainGate();
  console.log('OK domain');
  testNoDowngrade();
  console.log('OK status');
  testSanitize();
  console.log('OK sanitize');
  testAccess();
  console.log('OK access');
  testSyncSettles();
  console.log('OK sync settle');
  console.log('ALL PASS');
}

main();
