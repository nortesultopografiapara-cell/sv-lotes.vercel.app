/**
 * Testes obrigatórios — Fundação Asaas Corporativo MASTER (Fase 7.1).
 * npx tsx scripts/mandatory-master-corporate-finance-asaas-foundation-tests.ts
 */
import fs from 'fs';
import path from 'path';
import { assertCorporateFinanceAccess } from '../lib/master/corporateFinance/service';
import {
  MASTER_CORPORATE_ASAAS_DOMAIN,
  buildCorporateAsaasExternalReference,
  isCorporateAsaasDomain,
  maskCpfCnpj,
  parseCorporateAsaasExternalReference,
  requireCorporateAsaasWebhookToken,
} from '../lib/master/corporateFinance/asaas/domain';
import {
  canDowngradeCorporateAsaasStatus,
  isCorporateAsaasActiveStatus,
} from '../lib/master/corporateFinance/asaas/types';
import {
  normalizeCpfCnpj,
  sanitizeCorporateAsaasErrorMessage,
  sanitizeCorporateAsaasPayload,
  validateCorporateAsaasCreateChargeInput,
} from '../lib/master/corporateFinance/asaas/validation';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

function testMigrationIsolation() {
  assert(
    exists('supabase/migrations/20260723100000_master_corporate_asaas_foundation.sql'),
    'migration 7.1',
  );
  const mig = read(
    'supabase/migrations/20260723100000_master_corporate_asaas_foundation.sql',
  );
  assert(mig.includes('master_corporate_asaas_customers'), 'customers');
  assert(mig.includes('master_corporate_asaas_charges'), 'charges');
  assert(mig.includes('master_corporate_asaas_webhook_events'), 'webhook events');
  assert(mig.includes('MASTER_CORPORATE_FINANCE'), 'domain');
  assert(mig.includes("LIKE 'MCF:%'"), 'ext ref prefix');
  assert(mig.includes('is_super_admin()'), 'RLS');
  assert(mig.includes('uq_master_corp_asaas_charges_active_receivable'), 'active unique');
  assert(mig.includes('asaas_integration_status'), 'receivable light field');
  assert(mig.includes('idempotency_key'), 'idempotency');

  // Isolamento: sem tabelas/FKs tenant/SaaS (comentários podem citar o que NÃO usar)
  assert(!/\bREFERENCES public\.saas_charges\b/i.test(mig), 'sem FK saas_charges');
  assert(!/\bREFERENCES public\.company_asaas/i.test(mig), 'sem FK company_asaas');
  assert(!/\bREFERENCES public\.finance_receipts\b/i.test(mig), 'sem FK finance_receipts');
  assert(!/\bREFERENCES public\.cash_movements\b/i.test(mig), 'sem FK cash_movements tenant');
  assert(mig.includes('REFERENCES public.master_corporate_receivables'), 'FK receivables ok');
  assert(mig.includes('REFERENCES public.master_corporate_cash_movements'), 'FK cash corp ok');
}

function testFiles() {
  assert(exists('lib/master/corporateFinance/asaas/domain.ts'), 'domain');
  assert(exists('lib/master/corporateFinance/asaas/types.ts'), 'types');
  assert(exists('lib/master/corporateFinance/asaas/validation.ts'), 'validation');
  assert(exists('lib/master/corporateFinance/asaas/mappers.ts'), 'mappers');
  assert(!exists('app/api/master/corporate-finance/asaas/charges/route.ts'), '7.2 APIs ainda não');
}

function testAccess() {
  assert(assertCorporateFinanceAccess({ userId: 'u1' }).ok, 'super ok');
  assert(
    !assertCorporateFinanceAccess({
      userId: 'u1',
      impersonatingTenantId: 't1',
    }).ok,
    'impersonation bloqueada',
  );
}

function testDomainHelpers() {
  assert(MASTER_CORPORATE_ASAAS_DOMAIN === 'MASTER_CORPORATE_FINANCE', 'domain const');
  const ref = buildCorporateAsaasExternalReference('rec-123');
  assert(ref === 'MCF:rec-123', `ref ${ref}`);
  const parsed = parseCorporateAsaasExternalReference(ref);
  assert(parsed?.receivableId === 'rec-123', 'parse receivable');
  assert(isCorporateAsaasDomain('MASTER_CORPORATE_FINANCE'), 'domain check');
  assert(!isCorporateAsaasDomain('ASAAS_COMPANY'), 'tenant domain rejected');
  assert(maskCpfCnpj('52998224725').includes('***'), 'mask cpf');

  const prev = process.env.ASAAS_CORPORATE_WEBHOOK_TOKEN;
  delete process.env.ASAAS_CORPORATE_WEBHOOK_TOKEN;
  let threw = false;
  try {
    requireCorporateAsaasWebhookToken();
  } catch (err) {
    threw = true;
    assert(
      err instanceof Error && err.message.includes('ASAAS_CORPORATE_WEBHOOK_TOKEN'),
      'mensagem clara sem token',
    );
  }
  assert(threw, 'sem token falha seguro');
  if (prev !== undefined) process.env.ASAAS_CORPORATE_WEBHOOK_TOKEN = prev;
}

function testValidationPartialRequiresJustification() {
  let threw = false;
  try {
    validateCorporateAsaasCreateChargeInput(
      {
        receivable_id: 'r1',
        billing_type: 'BOLETO',
        financial_account_id: 'acc1',
        value: 100,
      },
      { remainingAmount: 4000, receivableDueDate: '2026-07-30' },
    );
  } catch {
    threw = true;
  }
  assert(threw, 'parcial sem justificativa bloqueada');

  const ok = validateCorporateAsaasCreateChargeInput(
    {
      receivable_id: 'r1',
      billing_type: 'BOLETO',
      financial_account_id: 'acc1',
      value: 100,
      partial_justification: 'Entrada parcial',
      cpf_cnpj: '11222333000181',
    },
    { remainingAmount: 4000, receivableDueDate: '2026-07-30' },
  );
  assert(ok.partial_justification === 'Entrada parcial', 'parcial ok');
  assert(normalizeCpfCnpj('11.222.333/0001-81') === '11222333000181', 'cnpj normalize');
}

function testStatusRules() {
  assert(isCorporateAsaasActiveStatus('AWAITING_PAYMENT'), 'active');
  assert(!canDowngradeCorporateAsaasStatus('CONFIRMED', 'PENDING'), 'no downgrade paid');
  assert(canDowngradeCorporateAsaasStatus('CONFIRMED', 'REFUNDED'), 'refund ok');
}

function testSanitize() {
  const sanitized = sanitizeCorporateAsaasPayload({
    event: 'PAYMENT_RECEIVED',
    payment: { id: 'pay_1', status: 'RECEIVED', value: 100, creditCard: { number: 'x' } },
    access_token: 'secret',
  });
  assert(sanitized.event === 'PAYMENT_RECEIVED', 'event kept');
  assert(!(sanitized as { access_token?: string }).access_token, 'token stripped');
  const msg = sanitizeCorporateAsaasErrorMessage('fail Bearer abc123 $aact_xxx');
  assert(!msg.includes('abc123'), 'bearer redacted');
}

function main() {
  console.log('=== Fase 7.1 corporate Asaas foundation tests ===');
  testMigrationIsolation();
  console.log('OK migration');
  testFiles();
  console.log('OK files');
  testAccess();
  console.log('OK access');
  testDomainHelpers();
  console.log('OK domain');
  testValidationPartialRequiresJustification();
  console.log('OK validation');
  testStatusRules();
  console.log('OK status');
  testSanitize();
  console.log('OK sanitize');
  console.log('ALL PASS');
}

main();
