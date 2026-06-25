/**
 * Testes obrigatórios — planos SaaS padronizados (landing + Master).
 * npx tsx scripts/mandatory-saas-plan-limits-tests.ts
 */

import {
  buildSaasPlanSummary,
  getCompanySaasPlan,
  getSaasPlanDisplayNameFromRaw,
  isPersonalizadoPlan,
  MASTER_SAAS_PLAN_OPTIONS,
  normalizeSaasPlanKey,
  resolveSaasLimitUsageLevel,
  SAAS_PLAN_CATALOG,
  saasLimitsDbPayload,
} from '../lib/saasPlans';
import {
  buildSaasContractSections,
  resolveSaasContractContext,
  SAAS_CONTRACT_CONTENT_VERSION,
} from '../lib/saasContractContent';
import { formatSaasCurrency, getStandardPlanMonthlyPrice } from '../lib/companyPricing';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testDropdownOptions() {
  const labels = MASTER_SAAS_PLAN_OPTIONS.map((o) => o.label);
  assert(labels.join('|') === 'Básico|Business|Profissional|Personalizado', 'dropdown labels');
  assert(MASTER_SAAS_PLAN_OPTIONS.length === 4, 'dropdown count = 4');
  console.log('OK testDropdownOptions');
}

function testLegacyStandardAsBusiness() {
  assert(getSaasPlanDisplayNameFromRaw('standard') === 'Business', 'Standard → Business');
  assert(getSaasPlanDisplayNameFromRaw('STANDARD') === 'Business', 'STANDARD → Business');
  assert(normalizeSaasPlanKey('standard') === 'business', 'normalize standard');
  console.log('OK testLegacyStandardAsBusiness');
}

function testLegacyPremiumAsPersonalizado() {
  assert(getSaasPlanDisplayNameFromRaw('premium') === 'Personalizado', 'Premium → Personalizado');
  assert(getSaasPlanDisplayNameFromRaw('PREMIUM') === 'Personalizado', 'PREMIUM → Personalizado');
  assert(normalizeSaasPlanKey('premium') === 'personalizado', 'normalize premium');
  console.log('OK testLegacyPremiumAsPersonalizado');
}

function testBasicoSummary() {
  const summary = buildSaasPlanSummary('basic');
  assert(summary.title === 'Plano Básico', 'título Básico');
  assert(summary.monthlyPriceLine.includes('499,90'), 'preço Básico');
  assert(summary.limitLines.some((l) => l.includes('1 loteamento')), '1 loteamento');
  assert(summary.limitLines.some((l) => l.includes('500')), '500 lotes');
  assert(summary.limitLines.some((l) => l.includes('3 corretor')), '3 corretores');
  assert(summary.limitLines.some((l) => l.includes('1 administrador')), '1 admin');
  console.log('OK testBasicoSummary');
}

function testBusinessSummary() {
  const summary = buildSaasPlanSummary('standard');
  assert(summary.title === 'Plano Business', 'título Business');
  assert(summary.monthlyPriceLine.includes('799,90'), 'preço Business');
  assert(summary.limitLines.some((l) => l.includes('2 loteamentos')), '2 loteamentos');
  assert(summary.limitLines.some((l) => l.includes('1.000')), '1.000 lotes');
  assert(summary.limitLines.some((l) => l.includes('5 corretor')), '5 corretores');
  assert(summary.limitLines.some((l) => l.includes('2 administrador')), '2 admins');
  console.log('OK testBusinessSummary');
}

function testProfissionalSummary() {
  const summary = buildSaasPlanSummary('professional');
  assert(summary.title === 'Plano Profissional', 'título Profissional');
  assert(summary.monthlyPriceLine.includes('1.199,90'), 'preço Profissional');
  assert(summary.limitLines.some((l) => l.includes('5 loteamentos')), '5 loteamentos');
  assert(summary.limitLines.some((l) => l.includes('2.500')), '2.500 lotes');
  assert(summary.limitLines.some((l) => l.includes('10 corretor')), '10 corretores');
  assert(summary.limitLines.some((l) => l.includes('3 administrador')), '3 admins');
  console.log('OK testProfissionalSummary');
}

function testPersonalizadoSummaryAndManualFields() {
  const summary = buildSaasPlanSummary('custom');
  assert(summary.title === 'Plano Personalizado', 'título Personalizado');
  assert(
    summary.monthlyPriceLine.includes('manualmente'),
    'Personalizado sem preço fixo no resumo',
  );
  assert(isPersonalizadoPlan('custom'), 'isPersonalizadoPlan custom');
  assert(isPersonalizadoPlan('premium'), 'isPersonalizadoPlan premium');

  const payload = saasLimitsDbPayload('custom', {
    max_projects: 7,
    max_lots: 3200,
    max_brokers: 12,
    admin_users_limit: 4,
    saas_commercial_note: 'Cliente fundador',
  });
  assert(payload.planKey === 'personalizado', 'payload planKey personalizado');
  assert(payload.max_projects === 7, 'max_projects manual');
  assert(payload.max_lots === 3200, 'max_lots manual');
  assert(payload.saas_commercial_note === 'Cliente fundador', 'nota comercial');
  console.log('OK testPersonalizadoSummaryAndManualFields');
}

function testExistingCompanyKeepsStoredLimits() {
  const legacy = getCompanySaasPlan({
    plan: 'basic',
    plan_type: 'basic',
    max_projects: 25,
    max_brokers: 50,
  });
  assert(legacy.planKey === 'basico', 'plano continua Básico');
  assert(legacy.maxProjects === 25, 'mantém max_projects legado');
  assert(legacy.maxBrokers === 50, 'mantém max_brokers legado');
  console.log('OK testExistingCompanyKeepsStoredLimits');
}

function testSaasContractUsesPlanLimits() {
  const company = {
    plan: 'standard',
    plan_type: 'standard',
    custom_price_enabled: true,
    custom_monthly_price: 649.9,
    max_projects: 2,
    max_lots: 1000,
    max_brokers: 5,
    admin_users_limit: 2,
  };
  const ctx = resolveSaasContractContext({
    company,
    subscription: {
      contract_number: '00001/2026',
      plan_type: 'standard',
      monthly_price: 649.9,
      start_date: '2026-06-01',
      first_payment_date: '2026-06-01',
      next_due_date: '2026-07-01',
    },
  });
  assert(ctx.plan.name === 'BUSINESS', 'contrato plano Business');
  assert(ctx.plan.maxProjects === 2, 'contrato loteamentos');
  assert(ctx.plan.maxLots === 1000, 'contrato lotes');
  assert(ctx.plan.maxBrokers === 5, 'contrato corretores');
  assert(ctx.plan.maxAdmins === 2, 'contrato admins');

  const sections = buildSaasContractSections(ctx, SAAS_CONTRACT_CONTENT_VERSION);
  const clause4 = sections.find((s) => s.number === 4);
  const text = clause4?.paragraphs.join(' ') || '';
  assert(text.includes('2 loteamento'), 'cláusula 4 loteamentos');
  assert(text.includes('1.000 lote'), 'cláusula 4 lotes');
  console.log('OK testSaasContractUsesPlanLimits');
}

function testUsageAlerts() {
  assert(resolveSaasLimitUsageLevel(8, 10) === 'warning', '80% warning');
  assert(resolveSaasLimitUsageLevel(10, 10) === 'danger', '100% danger');
  assert(resolveSaasLimitUsageLevel(3, null) === 'unlimited', 'sem limite');
  console.log('OK testUsageAlerts');
}

function testCatalogMatchesLandingPrices() {
  assert(SAAS_PLAN_CATALOG.basico.monthlyPrice === 499.9, 'catálogo Básico');
  assert(SAAS_PLAN_CATALOG.business.monthlyPrice === 799.9, 'catálogo Business');
  assert(SAAS_PLAN_CATALOG.profissional.monthlyPrice === 1199.9, 'catálogo Profissional');
  assert(getStandardPlanMonthlyPrice({ plan: 'basic', plan_type: 'basic' }) === 499.9, 'MRR Básico');
  console.log('OK testCatalogMatchesLandingPrices');
}

function run() {
  testDropdownOptions();
  testLegacyStandardAsBusiness();
  testLegacyPremiumAsPersonalizado();
  testBasicoSummary();
  testBusinessSummary();
  testProfissionalSummary();
  testPersonalizadoSummaryAndManualFields();
  testExistingCompanyKeepsStoredLimits();
  testSaasContractUsesPlanLimits();
  testUsageAlerts();
  testCatalogMatchesLandingPrices();
  console.log('OK — mandatory-saas-plan-limits-tests passed');
}

run();
