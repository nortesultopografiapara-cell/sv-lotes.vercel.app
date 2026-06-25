/**
 * Testes obrigatórios — enforcement de limites SaaS.
 * npx tsx scripts/mandatory-saas-plan-enforcement-tests.ts
 */

import {
  evaluateCanCreateAdmin,
  evaluateCanCreateBroker,
  evaluateCanCreateProject,
  evaluateCanImportLots,
  getTenantLimits,
} from '../lib/saasPlanEnforcement';
import {
  formatAdminsLimitMessage,
  formatBrokersLimitMessage,
  formatLotsLimitMessage,
  formatProjectLimitMessage,
} from '../lib/saasPlanEnforcementMessages';
import { SAAS_PLAN_CATALOG } from '../lib/saasPlans';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function limitsForPlanKey(planKey: keyof typeof SAAS_PLAN_CATALOG) {
  const catalog = SAAS_PLAN_CATALOG[planKey];
  return {
    maxProjects: catalog.maxProjects,
    maxLots: catalog.maxLots,
    maxBrokers: catalog.maxBrokers,
    maxAdmins: catalog.maxAdmins,
    planDisplayName: catalog.label,
  };
}

function personalizadoLimits(overrides: Partial<ReturnType<typeof limitsForPlanKey>>) {
  return {
    maxProjects: null,
    maxLots: null,
    maxBrokers: null,
    maxAdmins: null,
    planDisplayName: 'Personalizado',
    ...overrides,
  };
}

function testBasicoBlocksSecondProject() {
  const limits = limitsForPlanKey('basico');
  const r = evaluateCanCreateProject({ projects: 1, lots: 0, activeBrokers: 0, activeAdmins: 0 }, limits);
  assert(!r.allowed, 'bloqueia 2º loteamento Básico');
  assert(r.code === 'SAAS_PROJECT_LIMIT', 'código projeto');
  console.log('OK testBasicoBlocksSecondProject');
}

function testBusinessBlocksThirdProject() {
  const limits = limitsForPlanKey('business');
  const r = evaluateCanCreateProject({ projects: 2, lots: 0, activeBrokers: 0, activeAdmins: 0 }, limits);
  assert(!r.allowed, 'bloqueia 3º loteamento Business');
  console.log('OK testBusinessBlocksThirdProject');
}

function testProfissionalBlocksSixthProject() {
  const limits = limitsForPlanKey('profissional');
  const r = evaluateCanCreateProject({ projects: 5, lots: 0, activeBrokers: 0, activeAdmins: 0 }, limits);
  assert(!r.allowed, 'bloqueia 6º loteamento Profissional');
  console.log('OK testProfissionalBlocksSixthProject');
}

function testPersonalizadoBlocks16thProject() {
  const limits = personalizadoLimits({ maxProjects: 15 });
  const r = evaluateCanCreateProject({ projects: 15, lots: 0, activeBrokers: 0, activeAdmins: 0 }, limits);
  assert(!r.allowed, 'bloqueia 16º loteamento Personalizado');
  console.log('OK testPersonalizadoBlocks16thProject');
}

function testPersonalizadoBlocksLotImportOver20000() {
  const limits = personalizadoLimits({ maxLots: 20000 });
  const r = evaluateCanImportLots(
    { projects: 1, lots: 19999, activeBrokers: 0, activeAdmins: 0 },
    limits,
    2,
  );
  assert(!r.allowed, 'bloqueia importação acima de 20.000 lotes');
  assert(r.message?.includes('19.999'), 'mensagem mostra lotes atuais');
  console.log('OK testPersonalizadoBlocksLotImportOver20000');
}

function testPersonalizadoBlocks71stBroker() {
  const limits = personalizadoLimits({ maxBrokers: 70 });
  const r = evaluateCanCreateBroker(
    { projects: 1, lots: 0, activeBrokers: 70, activeAdmins: 0 },
    limits,
  );
  assert(!r.allowed, 'bloqueia 71º corretor');
  console.log('OK testPersonalizadoBlocks71stBroker');
}

function testInactiveBrokerDoesNotConsumeLimit() {
  const limits = personalizadoLimits({ maxBrokers: 70 });
  const r = evaluateCanCreateBroker(
    { projects: 1, lots: 0, activeBrokers: 69, activeAdmins: 0 },
    limits,
  );
  assert(r.allowed, '69 ativos permite novo');
  console.log('OK testInactiveBrokerDoesNotConsumeLimit');
}

function testReactivateBrokerBlockedAtLimit() {
  const limits = personalizadoLimits({ maxBrokers: 70 });
  const r = evaluateCanCreateBroker(
    { projects: 1, lots: 0, activeBrokers: 70, activeAdmins: 0 },
    limits,
  );
  assert(!r.allowed, 'reativar bloqueia no limite');
  console.log('OK testReactivateBrokerBlockedAtLimit');
}

function testPersonalizadoBlocks9thAdmin() {
  const limits = personalizadoLimits({ maxAdmins: 8 });
  const r = evaluateCanCreateAdmin(
    { projects: 1, lots: 0, activeBrokers: 0, activeAdmins: 8 },
    limits,
  );
  assert(!r.allowed, 'bloqueia 9º admin');
  console.log('OK testPersonalizadoBlocks9thAdmin');
}

function testInactiveAdminDoesNotConsumeLimit() {
  const limits = personalizadoLimits({ maxAdmins: 8 });
  const r = evaluateCanCreateAdmin(
    { projects: 1, lots: 0, activeBrokers: 0, activeAdmins: 7 },
    limits,
  );
  assert(r.allowed, '7 ativos permite novo admin');
  console.log('OK testInactiveAdminDoesNotConsumeLimit');
}

function testReactivateAdminBlockedAtLimit() {
  const limits = personalizadoLimits({ maxAdmins: 8 });
  const r = evaluateCanCreateAdmin(
    { projects: 1, lots: 0, activeBrokers: 0, activeAdmins: 8 },
    limits,
  );
  assert(!r.allowed, 'reativar admin bloqueia no limite');
  console.log('OK testReactivateAdminBlockedAtLimit');
}

function testUndefinedLimitDoesNotBlock() {
  const limits = personalizadoLimits({});
  const project = evaluateCanCreateProject(
    { projects: 999, lots: 99999, activeBrokers: 999, activeAdmins: 999 },
    limits,
  );
  const lots = evaluateCanImportLots(
    { projects: 1, lots: 99999, activeBrokers: 0, activeAdmins: 0 },
    limits,
    1000,
  );
  assert(project.allowed && lots.allowed, 'sem limite definido não bloqueia');
  console.log('OK testUndefinedLimitDoesNotBlock');
}

function testMasterSkipsEnforcement() {
  const limits = limitsForPlanKey('basico');
  const r = evaluateCanCreateProject(
    { projects: 99, lots: 0, activeBrokers: 0, activeAdmins: 0 },
    limits,
    { isPlatformAdmin: true },
  );
  assert(r.allowed, 'Master não é bloqueado');
  console.log('OK testMasterSkipsEnforcement');
}

function testFriendlyMessages() {
  assert(
    formatProjectLimitMessage(1).includes('1 loteamento'),
    'mensagem projeto singular',
  );
  assert(
    formatLotsLimitMessage(20000, 19990, 20).includes('20.000'),
    'mensagem lotes formatada',
  );
  assert(
    formatBrokersLimitMessage(70).includes('70 corretores ativos'),
    'mensagem corretores',
  );
  assert(
    formatAdminsLimitMessage(8).includes('8 administradores'),
    'mensagem admins',
  );
  console.log('OK testFriendlyMessages');
}

function testGetTenantLimitsFromDbRow() {
  const company = {
    plan_type: 'custom',
    project_limit: 15,
    broker_limit: 70,
    max_lots: 20000,
    admin_users_limit: 8,
  };
  const limits = getTenantLimits(company);
  assert(limits.maxProjects === 15, 'lê project_limit');
  assert(limits.maxLots === 20000, 'lê max_lots');
  assert(limits.maxBrokers === 70, 'lê broker_limit');
  assert(limits.maxAdmins === 8, 'lê admin_users_limit');
  console.log('OK testGetTenantLimitsFromDbRow');
}

function run() {
  testBasicoBlocksSecondProject();
  testBusinessBlocksThirdProject();
  testProfissionalBlocksSixthProject();
  testPersonalizadoBlocks16thProject();
  testPersonalizadoBlocksLotImportOver20000();
  testPersonalizadoBlocks71stBroker();
  testInactiveBrokerDoesNotConsumeLimit();
  testReactivateBrokerBlockedAtLimit();
  testPersonalizadoBlocks9thAdmin();
  testInactiveAdminDoesNotConsumeLimit();
  testReactivateAdminBlockedAtLimit();
  testUndefinedLimitDoesNotBlock();
  testMasterSkipsEnforcement();
  testFriendlyMessages();
  testGetTenantLimitsFromDbRow();
  console.log('OK — mandatory-saas-plan-enforcement-tests passed');
}

run();
