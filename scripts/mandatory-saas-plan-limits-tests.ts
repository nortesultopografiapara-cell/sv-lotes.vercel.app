/**
 * Testes obrigatórios — planos SaaS padronizados (landing + Master).
 * npx tsx scripts/mandatory-saas-plan-limits-tests.ts
 */

import {
  buildManualLimitsFromForm,
  buildSaasPlanSummary,
  formatSaasUsageLabel,
  getCompanySaasPlan,
  getSaasPlanDisplayNameFromRaw,
  isPersonalizadoPlan,
  MASTER_SAAS_PLAN_OPTIONS,
  normalizeSaasPlanKey,
  parseManualPlanLimit,
  resolveAuthoritativePlanKey,
  resolveSaasLimitUsageLevel,
  SAAS_PLAN_CATALOG,
  saasLimitsDbPayload,
} from '../lib/saasPlans';
import {
  buildSaasContractSections,
  resolveSaasContractContext,
  SAAS_CONTRACT_CONTENT_VERSION,
} from '../lib/saasContractContent';
import {
  formatSaasCurrency,
  getCompanyMonthlyPrice,
  getStandardPlanMonthlyPrice,
} from '../lib/companyPricing';

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

function personalizadoCompanyFixture() {
  return {
    plan: 'custom',
    plan_type: 'custom',
    module_plan: 'Profissional',
    module_type: 'professional',
    max_projects: 20,
    max_lots: 10000,
    max_brokers: 30,
    admin_users_limit: 15,
    custom_price_enabled: true,
    custom_monthly_price: 0.01,
    saas_commercial_note: 'Negociação especial SV Topografia',
  };
}

function testPersonalizadoUpdatePayloadPersistsLimits() {
  const body = {
    plan: 'custom',
    plan_type: 'custom',
    max_projects: 20,
    max_lots: 10000,
    max_brokers: 30,
    admin_users_limit: 15,
    custom_monthly_price: 0.01,
    saas_commercial_note: 'Negociação especial SV Topografia',
  };
  const manual = buildManualLimitsFromForm(body);
  const payload = saasLimitsDbPayload('custom', manual);

  assert(payload.planKey === 'personalizado', 'planKey personalizado');
  assert(payload.max_projects === 20, 'persiste max_projects');
  assert(payload.max_lots === 10000, 'persiste max_lots');
  assert(payload.max_brokers === 30, 'persiste max_brokers');
  assert(payload.admin_users_limit === 15, 'persiste max_admins');
  assert(payload.saas_commercial_note === 'Negociação especial SV Topografia', 'persiste nota');
  assert(parseManualPlanLimit('0.01') === 0, 'parse 0.01 trunc — use number');
  assert(parseManualPlanLimit(0.01) === 0, 'parse number 0.01');
  console.log('OK testPersonalizadoUpdatePayloadPersistsLimits');
}

function testPersonalizadoIgnoresLegacyModulePlan() {
  const company = personalizadoCompanyFixture();
  assert(resolveAuthoritativePlanKey(company) === 'personalizado', 'plan_type custom vence module_plan');
  const resolved = getCompanySaasPlan(company);
  assert(resolved.planKey === 'personalizado', 'getCompanySaasPlan personalizado');
  assert(resolved.maxProjects === 20, 'limites manuais loteamentos');
  assert(resolved.maxLots === 10000, 'limites manuais lotes');
  assert(resolved.maxBrokers === 30, 'limites manuais corretores');
  assert(resolved.maxAdmins === 15, 'limites manuais admins');
  assert(resolved.maxBrokers !== SAAS_PLAN_CATALOG.profissional.maxBrokers, 'não usa catálogo profissional');
  console.log('OK testPersonalizadoIgnoresLegacyModulePlan');
}

function testPersonalizadoMonthlyPriceFromCompany() {
  const company = personalizadoCompanyFixture();
  assert(getCompanyMonthlyPrice(company) === 0.01, 'valor mensal personalizado R$ 0,01');
  assert(
    formatSaasCurrency(getCompanyMonthlyPrice(company)) === formatSaasCurrency(0.01),
    'formata valor mensal',
  );
  console.log('OK testPersonalizadoMonthlyPriceFromCompany');
}

function testCompanyCardUsageLabelsForPersonalizado() {
  const company = personalizadoCompanyFixture();
  const saas = getCompanySaasPlan(company);
  assert(
    formatSaasUsageLabel(1, saas.maxProjects) === '1 / 20',
    'CompanyCard loteamentos 1/20',
  );
  assert(
    formatSaasUsageLabel(0, saas.maxLots) === '0 / 10.000',
    'CompanyCard lotes 0/10000',
  );
  assert(
    formatSaasUsageLabel(2, saas.maxBrokers) === '2 / 30',
    'CompanyCard corretores 2/30',
  );
  assert(
    formatSaasUsageLabel(1, saas.maxAdmins) === '1 / 15',
    'CompanyCard admins 1/15',
  );
  console.log('OK testCompanyCardUsageLabelsForPersonalizado');
}

function testNullLimitsShowSemLimiteDefinido() {
  const company = {
    plan_type: 'custom',
    plan: 'custom',
    max_projects: null,
    max_lots: null,
    max_brokers: null,
    admin_users_limit: null,
  };
  const saas = getCompanySaasPlan(company);
  assert(saas.maxProjects == null, 'maxProjects null');
  assert(formatSaasUsageLabel(1, saas.maxProjects) === '1 / Sem limite definido', 'null exibe sem limite');
  assert(resolveSaasLimitUsageLevel(1, null) === 'unlimited', 'null = unlimited level');
  console.log('OK testNullLimitsShowSemLimiteDefinido');
}

function testBuildManualLimitsEmptyStringsBecomeNull() {
  const manual = buildManualLimitsFromForm({
    max_projects: '',
    max_lots: '',
    max_brokers: '',
    admin_users_limit: '',
    saas_commercial_note: '',
  });
  assert(manual.max_projects == null, 'vazio max_projects → null');
  assert(manual.max_lots == null, 'vazio max_lots → null');
  assert(manual.max_brokers == null, 'vazio max_brokers → null');
  assert(manual.admin_users_limit == null, 'vazio admin → null');
  assert(manual.saas_commercial_note == null, 'vazio nota → null');
  console.log('OK testBuildManualLimitsEmptyStringsBecomeNull');
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
  testPersonalizadoUpdatePayloadPersistsLimits();
  testPersonalizadoIgnoresLegacyModulePlan();
  testPersonalizadoMonthlyPriceFromCompany();
  testCompanyCardUsageLabelsForPersonalizado();
  testNullLimitsShowSemLimiteDefinido();
  testBuildManualLimitsEmptyStringsBecomeNull();
  console.log('OK — mandatory-saas-plan-limits-tests passed');
}

run();
