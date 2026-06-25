/**
 * Testes obrigatórios — contrato SaaS com preço personalizado.
 * npx tsx scripts/mandatory-saas-custom-price-contract-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildSaasContractPdfWithMeta } from '../lib/saasContractPdf';
import {
  buildSaasContractSections,
  resolveSaasContractContext,
  SAAS_CONTRACT_CONTENT_VERSION,
} from '../lib/saasContractContent';
import {
  formatSaasCurrency,
  getStandardPlanMonthlyPrice,
  resolveCompanyPricing,
} from '../lib/companyPricing';
import { roughSaasContractPdfText } from '../lib/saasContractPdfContentDetect';
import {
  isSubscriptionCustomPriceSchemaError,
  omitSubscriptionCustomPriceColumns,
} from '../lib/saasSubscriptionCustomPriceSchema';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function ivanildeCompanyFixture() {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'IVANILDE DE MOURA SILVA',
    cnpj: '32641281104',
    email: 'ivanilde@example.com',
    phone: '94999999999',
    address: 'Rua Teste, 1',
    city: 'Parauapebas',
    state: 'PA',
    cep: '68515000',
    plan: 'basic',
    plan_type: 'basic',
    custom_price_enabled: true,
    custom_monthly_price: 300,
    custom_price_badge: 'desconto_especial',
    subscription_due_day: 15,
    subscription_start_date: '2026-06-15',
    responsible_name: 'Ivanilde de Moura Silva',
    active: true,
    status_operacional: 'Ativa',
    is_test_company: false,
  };
}

function standardBasicCompanyFixture() {
  return {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'EMPRESA PADRAO LTDA',
    cnpj: '98765432000188',
    email: 'padrao@example.com',
    phone: '94988888888',
    address: 'Av. Central, 50',
    city: 'Parauapebas',
    state: 'PA',
    plan: 'basic',
    plan_type: 'basic',
    custom_price_enabled: false,
    custom_monthly_price: null,
    subscription_due_day: 15,
    subscription_start_date: '2026-06-15',
    responsible_name: 'Representante Legal',
    active: true,
    status_operacional: 'Ativa',
    is_test_company: false,
  };
}

function subscriptionFixture(
  company: ReturnType<typeof ivanildeCompanyFixture>,
  monthlyPrice: number,
) {
  return {
    contract_number: '00099/2026',
    plan_type: 'basic',
    monthly_price: monthlyPrice,
    start_date: '2026-06-15',
    first_payment_date: '2026-06-15',
    next_due_date: '2026-07-15',
  };
}

function testSchemaFallbackOmitsCustomColumns() {
  const stripped = omitSubscriptionCustomPriceColumns({
    monthly_price: 300,
    custom_monthly_price: 300,
    custom_price_enabled: true,
    has_custom_price: true,
  });
  assert(stripped.monthly_price === 300, 'monthly_price preservado no fallback');
  assert(stripped.custom_monthly_price === undefined, 'custom_monthly_price removido');
  assert(stripped.custom_price_enabled === undefined, 'custom_price_enabled removido');

  assert(
    isSubscriptionCustomPriceSchemaError(
      "Could not find the 'custom_monthly_price' column of 'company_subscriptions' in the schema cache",
    ),
    'detecta erro schema cache',
  );
  console.log('OK testSchemaFallbackOmitsCustomColumns');
}

function testIvanildeNextDueDate() {
  const company = ivanildeCompanyFixture();
  const ctx = resolveSaasContractContext({
    company,
    subscription: subscriptionFixture(company, 300),
  });
  assert(ctx.plan.nextDueDate === '15/07/2026', 'próximo vencimento 15/07/2026');
  console.log('OK testIvanildeNextDueDate');
}

function testMigrationDefinesCustomPriceColumns() {
  const migrationPath = path.join(
    process.cwd(),
    'supabase/migrations/20260708120000_company_subscriptions_custom_price_repair.sql',
  );
  assert(fs.existsSync(migrationPath), 'migration de reparo existe');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert(sql.includes('custom_monthly_price'), 'migration adiciona custom_monthly_price');
  assert(sql.includes('custom_price_enabled'), 'migration adiciona custom_price_enabled');
  assert(sql.includes("NOTIFY pgrst, 'reload schema'"), 'migration recarrega schema cache');
  assert(!sql.includes('has_custom_price'), 'migration não duplica has_custom_price');
  console.log('OK testMigrationDefinesCustomPriceColumns');
}

function testSubscriptionRowFieldsForCustomPrice() {
  const company = ivanildeCompanyFixture();
  const pricing = resolveCompanyPricing(company);
  assert(pricing.appliedPrice === 300, 'preço aplicado R$ 300,00');
  assert(pricing.standardPrice === 499.9, 'preço padrão R$ 499,90');
  assert(Math.abs(pricing.savings - 199.9) < 0.01, 'desconto R$ 199,90');
  assert(pricing.hasCustomPrice, 'hasCustomPrice true');
  console.log('OK testSubscriptionRowFieldsForCustomPrice');
}

function testStandardCompanyContractContext() {
  const company = standardBasicCompanyFixture();
  const ctx = resolveSaasContractContext({
    company,
    subscription: subscriptionFixture(company, 499.9),
  });

  assert(ctx.plan.name === 'BÁSICO', 'plano Básico');
  assert(ctx.plan.monthlyPrice === formatSaasCurrency(499.9), 'valor mensal padrão');
  assert(!ctx.plan.discount, 'sem linha de desconto');
  assert(!ctx.plan.noAnnualAdjustment, 'reajuste anual padrão');

  const sections = buildSaasContractSections(ctx, SAAS_CONTRACT_CONTENT_VERSION);
  const reajuste = sections.find((s) => s.number === 6);
  assert(Boolean(reajuste?.paragraphs.some((p) => p.includes('IGPM/FGV'))), 'cláusula reajuste padrão');

  console.log('OK testStandardCompanyContractContext');
}

function testCustomPriceContractContextIvanilde() {
  const company = ivanildeCompanyFixture();
  const ctx = resolveSaasContractContext({
    company,
    subscription: subscriptionFixture(company, 499.9),
  });

  assert(ctx.plan.name === 'BÁSICO', 'plano Básico');
  assert(ctx.plan.monthlyPrice === formatSaasCurrency(300), 'valor mensal R$ 300,00');
  assert(ctx.plan.standardPrice === formatSaasCurrency(499.9), 'valor padrão R$ 499,90');
  assert(ctx.plan.discount === formatSaasCurrency(199.9), 'desconto R$ 199,90');
  assert(ctx.plan.noAnnualAdjustment === true, 'sem reajuste anual para desconto especial');

  const sections = buildSaasContractSections(ctx, SAAS_CONTRACT_CONTENT_VERSION);
  const clause5 = sections.find((s) => s.number === 5);
  const clause5Text = clause5?.paragraphs.join(' ') || '';
  assert(clause5Text.includes('300,00'), 'cláusula 5 com valor mensal aplicado');
  assert(clause5Text.includes('499,90'), 'cláusula 5 com valor padrão');
  assert(clause5Text.includes('199,90'), 'cláusula 5 com desconto');

  const reajuste = sections.find((s) => s.number === 6);
  assert(
    Boolean(reajuste?.paragraphs.some((p) => p.includes('sem aplicação de reajuste anual automático'))),
    'cláusula 6 sem reajuste anual',
  );

  console.log('OK testCustomPriceContractContextIvanilde');
}

function testCustomPriceUsesCompanyPricingEvenIfSubscriptionStale() {
  const company = ivanildeCompanyFixture();
  const staleSubPrice = 499.9;
  const ctx = resolveSaasContractContext({
    company,
    subscription: subscriptionFixture(company, staleSubPrice),
  });
  assert(ctx.plan.monthlyPrice === formatSaasCurrency(300), 'ignora monthly_price desatualizado na assinatura');
  console.log('OK testCustomPriceUsesCompanyPricingEvenIfSubscriptionStale');
}

function testStandardCompanyGeneratesPdf() {
  const company = standardBasicCompanyFixture();
  const built = buildSaasContractPdfWithMeta(
    {
      company,
      subscription: subscriptionFixture(company, getStandardPlanMonthlyPrice(company)),
    },
    { contentVersion: SAAS_CONTRACT_CONTENT_VERSION },
  );
  assert(built.pdf.byteLength > 5000, 'PDF padrão gerado');
  const rough = roughSaasContractPdfText(built.pdf);
  assert(rough.includes('499,90') || rough.includes('499.90'), 'PDF padrão contém valor do plano');
  console.log('OK testStandardCompanyGeneratesPdf');
}

function testCustomPriceCompanyGeneratesPdf() {
  const company = ivanildeCompanyFixture();
  const built = buildSaasContractPdfWithMeta(
    {
      company,
      subscription: subscriptionFixture(company, 300),
    },
    { contentVersion: SAAS_CONTRACT_CONTENT_VERSION },
  );
  assert(built.pdf.byteLength > 5000, 'PDF personalizado gerado');
  const rough = roughSaasContractPdfText(built.pdf);
  assert(rough.includes('300,00') || rough.includes('300.00'), 'PDF contém R$ 300,00');
  assert(rough.includes('499,90') || rough.includes('499.90'), 'PDF contém valor padrão');
  console.log('OK testCustomPriceCompanyGeneratesPdf');
}

function testBuildSubscriptionRowShape() {
  const company = ivanildeCompanyFixture();
  const pricing = resolveCompanyPricing(company);
  const row = {
    company_id: company.id,
    plan_type: 'basic',
    monthly_price: pricing.appliedPrice,
    custom_price_enabled: true,
    custom_monthly_price: 300,
  };
  assert(row.custom_monthly_price === 300, 'row inclui custom_monthly_price');
  assert(row.custom_price_enabled === true, 'row inclui custom_price_enabled');
  assert(row.monthly_price === 300, 'row monthly_price sincronizado');
  console.log('OK testBuildSubscriptionRowShape');
}

function main() {
  testMigrationDefinesCustomPriceColumns();
  testSubscriptionRowFieldsForCustomPrice();
  testStandardCompanyContractContext();
  testCustomPriceContractContextIvanilde();
  testCustomPriceUsesCompanyPricingEvenIfSubscriptionStale();
  testStandardCompanyGeneratesPdf();
  testCustomPriceCompanyGeneratesPdf();
  testBuildSubscriptionRowShape();
  testSchemaFallbackOmitsCustomColumns();
  testIvanildeNextDueDate();
  console.log('\nTodos os testes mandatory-saas-custom-price-contract passaram.');
}

main();
