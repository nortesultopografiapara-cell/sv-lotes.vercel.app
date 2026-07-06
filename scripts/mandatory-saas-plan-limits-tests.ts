/**
 * Testes obrigatórios — planos SaaS padronizados (landing + Master).
 * npx tsx scripts/mandatory-saas-plan-limits-tests.ts
 */

import {
  buildCompanyLimitsDbWritePayload,
  buildManualLimitsFromForm,
  buildSaasPlanSummary,
  enrichCompanySaasLimitsFromDb,
  extractMissingCompanyColumnFromError,
  formatSaasUsageLabel,
  getCompanySaasPlan,
  getSaasPlanDisplayNameFromRaw,
  isPersonalizadoPlan,
  MASTER_SAAS_PLAN_OPTIONS,
  normalizeSaasPlanKey,
  parseManualPlanLimit,
  readCompanyLimitFromDb,
  resolveAuthoritativePlanKey,
  resolveSaasLimitUsageLevel,
  SAAS_PLAN_CATALOG,
  saasLimitsDbPayload,
  saasPlanModuleSyncPayload,
  safeCompanyUpdateWithSchemaFallback,
} from '../lib/saasPlans';
import { COMPANY_EDIT_SELECT_FIELDS } from '../lib/loadCompanyForEdit';
import { parseCustomMonthlyPrice } from '../lib/companyPricing';
import { isPlatformAdmin } from '../lib/rls';
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
    project_limit: 20,
    broker_limit: 30,
    max_lots: 10000,
    admin_users_limit: 15,
    custom_price_enabled: true,
    custom_monthly_price: 800,
    saas_commercial_note: 'Negociação especial SV Topografia',
  };
}

function testPersonalizadoUpdatePayloadPersistsLimits() {
  const body = {
    plan: 'custom',
    plan_type: 'custom',
    max_projects: 15,
    max_lots: 20000,
    max_brokers: 70,
    admin_users_limit: 8,
    custom_monthly_price: 800,
    saas_commercial_note: 'a',
  };
  const manual = buildManualLimitsFromForm(body);
  const payload = saasLimitsDbPayload('custom', manual);
  const dbWrite = buildCompanyLimitsDbWritePayload(payload);

  assert(payload.planKey === 'personalizado', 'planKey personalizado');
  assert(payload.max_projects === 15, 'persiste max_projects lógico');
  assert(payload.max_lots === 20000, 'persiste max_lots');
  assert(payload.max_brokers === 70, 'persiste max_brokers lógico');
  assert(payload.admin_users_limit === 8, 'persiste admin_users_limit');
  assert(payload.saas_commercial_note === 'a', 'persiste nota');
  assert(dbWrite.project_limit === 15, 'dbWrite project_limit');
  assert(dbWrite.broker_limit === 70, 'dbWrite broker_limit');
  assert(dbWrite.admin_users_limit === 8, 'dbWrite admin_users_limit');
  assert(dbWrite.max_lots === 20000, 'dbWrite max_lots');
  assert(!('monthly_price' in dbWrite), 'não usa monthly_price inexistente');
  console.log('OK testPersonalizadoUpdatePayloadPersistsLimits');
}

function testDbColumnsProjectLimitBrokerLimitRead() {
  const row = {
    plan_type: 'custom',
    project_limit: 15,
    broker_limit: 70,
    max_lots: 20000,
    admin_users_limit: 8,
    custom_monthly_price: 800,
  };
  assert(readCompanyLimitFromDb(row, 'projects') === 15, 'lê project_limit');
  assert(readCompanyLimitFromDb(row, 'brokers') === 70, 'lê broker_limit');
  assert(readCompanyLimitFromDb(row, 'lots') === 20000, 'lê max_lots');
  assert(readCompanyLimitFromDb(row, 'admins') === 8, 'lê admin_users_limit');

  const enriched = enrichCompanySaasLimitsFromDb(row);
  const saas = getCompanySaasPlan(enriched);
  assert(saas.planKey === 'personalizado', 'plano personalizado via project_limit row');
  assert(saas.maxProjects === 15, 'card loteamentos 15');
  assert(saas.maxLots === 20000, 'card lotes 20000');
  assert(saas.maxBrokers === 70, 'card corretores 70');
  assert(saas.maxAdmins === 8, 'card admins 8');
  console.log('OK testDbColumnsProjectLimitBrokerLimitRead');
}

function testSvTopografiaCardDisplay() {
  const company = {
    plan_type: 'custom',
    plan: 'custom',
    project_limit: 15,
    broker_limit: 70,
    max_lots: 20000,
    admin_users_limit: 8,
    custom_price_enabled: true,
    custom_monthly_price: 800,
    project_count: 1,
    lot_count: 0,
    broker_count: 2,
    admin_count: 1,
  };
  const saas = getCompanySaasPlan(company);
  assert(
    formatSaasUsageLabel(company.project_count, saas.maxProjects) === '1 / 15',
    'loteamentos 1/15',
  );
  assert(
    formatSaasUsageLabel(company.lot_count, saas.maxLots) === '0 / 20.000',
    'lotes 0/20000',
  );
  assert(
    formatSaasUsageLabel(company.broker_count, saas.maxBrokers) === '2 / 70',
    'corretores 2/70',
  );
  assert(
    formatSaasUsageLabel(company.admin_count, saas.maxAdmins) === '1 / 8',
    'admins 1/8',
  );
  assert(getCompanyMonthlyPrice(company) === 800, 'preço R$ 800');
  console.log('OK testSvTopografiaCardDisplay');
}

function testModalReloadFromProjectLimitColumns() {
  const company = {
    plan_type: 'custom',
    project_limit: 15,
    broker_limit: 70,
    max_lots: 20000,
    admin_users_limit: 8,
    custom_monthly_price: 800,
    saas_commercial_note: 'a',
  };
  assert(readCompanyLimitFromDb(company, 'projects') === 15, 'modal max_projects');
  assert(readCompanyLimitFromDb(company, 'brokers') === 70, 'modal max_brokers');
  assert(readCompanyLimitFromDb(company, 'admins') === 8, 'modal admin_users_limit');
  console.log('OK testModalReloadFromProjectLimitColumns');
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
  assert(getCompanyMonthlyPrice(company) === 800, 'valor mensal personalizado R$ 800,00');
  assert(
    formatSaasCurrency(getCompanyMonthlyPrice(company)) === formatSaasCurrency(800),
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

function testExtractMissingColumnFromError() {
  assert(
    extractMissingCompanyColumnFromError('column companies.module_plan does not exist') ===
      'module_plan',
    'module_plan',
  );
  assert(
    extractMissingCompanyColumnFromError(
      'column "module_type" of relation "companies" does not exist',
    ) === 'module_type',
    'module_type',
  );
  assert(
    extractMissingCompanyColumnFromError('column companies.project_limit does not exist') ===
      'project_limit',
    'project_limit',
  );
  console.log('OK testExtractMissingColumnFromError');
}

function testSaasPlanModuleSyncPayloadOptional() {
  const sync = saasPlanModuleSyncPayload('personalizado');
  assert(Object.keys(sync).length === 0, 'não inclui module_plan por padrão');
  const legacy = saasPlanModuleSyncPayload('personalizado', { includeLegacyModuleColumns: true });
  assert(legacy.module_plan === 'Personalizado', 'legado opcional module_plan');
  console.log('OK testSaasPlanModuleSyncPayloadOptional');
}

function buildSvTopografiaUpdatePayload() {
  const body = {
    name: 'SV TOPOGRAFIA E PROJETOS LTDA',
    plan: 'custom',
    plan_type: 'custom',
    max_projects: 15,
    max_lots: 20000,
    max_brokers: 70,
    admin_users_limit: 8,
    custom_monthly_price: 800,
    saas_commercial_note: 'a',
  };
  const manual = buildManualLimitsFromForm(body);
  const limits = saasLimitsDbPayload('custom', manual);
  const dbWrite = buildCompanyLimitsDbWritePayload(limits);
  return {
    name: body.name,
    plan: limits.plan,
    plan_type: limits.plan,
    custom_monthly_price: 800,
    custom_price_enabled: true,
    ...dbWrite,
  };
}

function testUpdatePayloadKeepsLimitsWithoutModulePlan() {
  const payload = buildSvTopografiaUpdatePayload();
  assert(payload.name === 'SV TOPOGRAFIA E PROJETOS LTDA', 'nome empresa');
  assert(payload.project_limit === 15, 'project_limit');
  assert(payload.max_lots === 20000, 'max_lots');
  assert(payload.broker_limit === 70, 'broker_limit');
  assert(payload.admin_users_limit === 8, 'admin_users_limit');
  assert(payload.custom_monthly_price === 800, 'custom_monthly_price');
  assert(payload.saas_commercial_note === 'a', 'saas_commercial_note');
  assert(!('module_plan' in payload), 'sem module_plan no payload');
  console.log('OK testUpdatePayloadKeepsLimitsWithoutModulePlan');
}

async function testSafeUpdateIgnoresMissingModulePlan() {
  let attempts = 0;
  const mockAdmin = {
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => {
              attempts++;
              if ('module_plan' in payload) {
                return {
                  data: null,
                  error: { message: 'column companies.module_plan does not exist' },
                };
              }
              return { data: { ...payload, id: 'test-id' }, error: null };
            },
          }),
        }),
      }),
    }),
  };

  const result = await safeCompanyUpdateWithSchemaFallback(mockAdmin, 'test-id', {
    name: 'SV TOPOGRAFIA E PROJETOS LTDA',
    module_plan: 'Personalizado',
    ...buildSvTopografiaUpdatePayload(),
  });

  assert(result.error == null, 'update ok após remover module_plan');
  assert(result.data?.name === 'SV TOPOGRAFIA E PROJETOS LTDA', 'salva nome');
  assert(result.data?.project_limit === 15, 'mantém project_limit');
  assert(result.data?.custom_monthly_price === 800, 'mantém preço');
  assert(result.removedColumns.includes('module_plan'), 'remove só module_plan');
  assert(attempts >= 2, 'retentou após erro de coluna');
  console.log('OK testSafeUpdateIgnoresMissingModulePlan');
}

async function testSafeUpdateIgnoresMissingModuleType() {
  const mockAdmin = {
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => {
              if ('module_type' in payload) {
                return {
                  data: null,
                  error: { message: 'column companies.module_type does not exist' },
                };
              }
              return { data: { ...payload, id: 'x' }, error: null };
            },
          }),
        }),
      }),
    }),
  };

  const result = await safeCompanyUpdateWithSchemaFallback(mockAdmin, 'x', {
    module_type: 'custom',
    ...buildSvTopografiaUpdatePayload(),
  });

  assert(result.error == null, 'update ok sem module_type');
  assert(result.data?.max_lots === 20000, 'mantém max_lots');
  assert(result.removedColumns.includes('module_type'), 'remove module_type');
  console.log('OK testSafeUpdateIgnoresMissingModuleType');
}

function testPlanAndCardWithoutModulePlan() {
  const company = {
    plan_type: 'custom',
    plan: 'custom',
    project_limit: 15,
    broker_limit: 70,
    max_lots: 20000,
    admin_users_limit: 8,
    custom_monthly_price: 800,
  };
  assert(resolveAuthoritativePlanKey(company) === 'personalizado', 'plano via plan_type');
  const saas = getCompanySaasPlan(company);
  assert(saas.planKey === 'personalizado', 'CompanyCard personalizado');
  assert(saas.maxProjects === 15, 'loteamentos 15');
  assert(saas.maxBrokers === 70, 'corretores 70');
  assert(saas.maxBrokers !== SAAS_PLAN_CATALOG.profissional.maxBrokers, 'sem catálogo');
  assert(
    formatSaasUsageLabel(1, saas.maxProjects) === '1 / 15',
    'card 1/15',
  );
  console.log('OK testPlanAndCardWithoutModulePlan');
}

function testLoadCompanySelectWithoutModulePlan() {
  assert(!COMPANY_EDIT_SELECT_FIELDS.includes('module_plan' as never), 'select sem module_plan');
  assert(!COMPANY_EDIT_SELECT_FIELDS.includes('module_type' as never), 'select sem module_type');
  assert(COMPANY_EDIT_SELECT_FIELDS.includes('project_limit'), 'select com project_limit');
  assert(COMPANY_EDIT_SELECT_FIELDS.includes('max_lots'), 'select com max_lots');
  console.log('OK testLoadCompanySelectWithoutModulePlan');
}

function testCustomMonthlyPriceAcceptsBrlOneCent() {
  assert(parseCustomMonthlyPrice('R$ 0,01') === 0.01, 'R$ 0,01');
  assert(parseCustomMonthlyPrice(0.01) === 0.01, 'número 0.01');
  assert(parseCustomMonthlyPrice('0,01') === 0.01, '0,01 sem símbolo');
  assert(parseCustomMonthlyPrice('R$ 800,00') === 800, 'R$ 800,00');
  console.log('OK testCustomMonthlyPriceAcceptsBrlOneCent');
}

function testMasterAdminCanEditCompanies() {
  assert(isPlatformAdmin('SUPER_ADMIN'), 'SUPER_ADMIN');
  assert(isPlatformAdmin('MASTER_ADMIN'), 'MASTER_ADMIN');
  assert(isPlatformAdmin('MASTER-ADMIN'), 'MASTER-ADMIN');
  assert(!isPlatformAdmin('ADMIN'), 'ADMIN empresa não é master');
  assert(!isPlatformAdmin('BROKER'), 'corretor não é master');
  console.log('OK testMasterAdminCanEditCompanies');
}

function testPersonalizadoClearsCommercialNoteInDbPayload() {
  const manual = buildManualLimitsFromForm({
    max_projects: 5,
    max_lots: 100,
    max_brokers: 10,
    admin_users_limit: 2,
    saas_commercial_note: '',
  });
  const limits = saasLimitsDbPayload('personalizado', manual);
  const dbWrite = buildCompanyLimitsDbWritePayload(limits);
  assert(dbWrite.saas_commercial_note === null, 'nota vazia persiste null');
  console.log('OK testPersonalizadoClearsCommercialNoteInDbPayload');
}

async function runAsyncTests() {
  await testSafeUpdateIgnoresMissingModulePlan();
  await testSafeUpdateIgnoresMissingModuleType();
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
  testDbColumnsProjectLimitBrokerLimitRead();
  testPersonalizadoIgnoresLegacyModulePlan();
  testPersonalizadoMonthlyPriceFromCompany();
  testCompanyCardUsageLabelsForPersonalizado();
  testSvTopografiaCardDisplay();
  testModalReloadFromProjectLimitColumns();
  testNullLimitsShowSemLimiteDefinido();
  testBuildManualLimitsEmptyStringsBecomeNull();
  testExtractMissingColumnFromError();
  testSaasPlanModuleSyncPayloadOptional();
  testUpdatePayloadKeepsLimitsWithoutModulePlan();
  testPlanAndCardWithoutModulePlan();
  testLoadCompanySelectWithoutModulePlan();
  testCustomMonthlyPriceAcceptsBrlOneCent();
  testMasterAdminCanEditCompanies();
  testPersonalizadoClearsCommercialNoteInDbPayload();
}

async function main() {
  run();
  await runAsyncTests();
  console.log('OK — mandatory-saas-plan-limits-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
