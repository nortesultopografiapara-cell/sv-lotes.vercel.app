/**
 * Testes obrigatórios — múltiplos administradores por empresa.
 * npx tsx scripts/mandatory-company-admin-users-tests.ts
 */

import {
  assertCallerCanManageCompanyAdmins,
  assertTenantAccess,
  canCreateCompanyAdmin,
  countActiveCompanyAdmins,
  formatCompanyAdminAuditDescription,
  isCompanyAdminUserRole,
  MENESES_COMPANY_ADMIN_USERS_LIMIT,
  resolveCompanyAdminUsersLimit,
  secondaryAdminCannotAccessMaster,
  normalizeAdminStatus,
  DEFAULT_COMPANY_ADMIN_USERS_LIMIT,
} from '../lib/companyAdminUsers';
import { MENESES_COMPANY_ID } from '../lib/saasContractContent';
import { isTenantAdminRole } from '../lib/ownerProjectAccess';
import { canViewEnterpriseValues, canManageGisProject } from '../lib/rolePermissions';
import { isPlatformAdmin } from '../lib/rls';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const TENANT_A = 'aaaaaaaa-bbbb-cccc-dddd-111111111111';
const TENANT_B = 'aaaaaaaa-bbbb-cccc-dddd-222222222222';

function testCompanyAdminRoles() {
  assert(isCompanyAdminUserRole('ADMIN'), 'ADMIN é admin empresa');
  assert(isCompanyAdminUserRole('ADMIN_EMPRESA'), 'ADMIN_EMPRESA é admin empresa');
  assert(isCompanyAdminUserRole('COMPANY_ADMIN'), 'COMPANY_ADMIN é admin empresa');
  assert(!isCompanyAdminUserRole('BROKER'), 'BROKER não é admin empresa');
  assert(!isCompanyAdminUserRole('OWNER'), 'OWNER não é admin empresa');
  console.log('OK testCompanyAdminRoles');
}

function testAdminLimit() {
  assert(
    resolveCompanyAdminUsersLimit({ admin_users_limit: null }) === DEFAULT_COMPANY_ADMIN_USERS_LIMIT,
    'default limit 1',
  );
  assert(resolveCompanyAdminUsersLimit({ admin_users_limit: 5 }) === 5, 'custom limit 5');
  assert(
    resolveCompanyAdminUsersLimit({ admin_users_limit: 0 }) === DEFAULT_COMPANY_ADMIN_USERS_LIMIT,
    'limit 0 vira 1',
  );

  const activeRows = [
    { status: 'ACTIVE' },
    { status: 'ACTIVE' },
    { status: 'INACTIVE' },
  ];
  assert(countActiveCompanyAdmins(activeRows) === 2, 'conta ativos');

  const blocked = canCreateCompanyAdmin(5, 5);
  assert(!blocked.ok, 'bloqueia acima do limite');
  assert(Boolean(blocked.error?.includes('Limite')), 'mensagem de limite');

  const allowed = canCreateCompanyAdmin(2, 5);
  assert(allowed.ok, 'permite abaixo do limite');
  console.log('OK testAdminLimit');
}

function testMenesesLimitConstant() {
  assert(MENESES_COMPANY_ADMIN_USERS_LIMIT === 5, 'Meneses limit 5');
  assert(MENESES_COMPANY_ID.length === 36, 'Meneses id uuid');
  console.log('OK testMenesesLimitConstant');
}

function testTenantIsolation() {
  const ok = assertTenantAccess(TENANT_A, TENANT_A, 'ADMIN_EMPRESA');
  assert(ok.ok, 'mesmo tenant ok');

  const cross = assertTenantAccess(TENANT_A, TENANT_B, 'ADMIN_EMPRESA');
  assert(!cross.ok, 'tenant diferente bloqueado');

  const superCross = assertTenantAccess(null, TENANT_B, 'SUPER_ADMIN');
  assert(superCross.ok, 'super admin cross tenant');
  console.log('OK testTenantIsolation');
}

function testSecondaryAdminPermissions() {
  assert(isTenantAdminRole('ADMIN_EMPRESA'), 'ADMIN_EMPRESA is tenant admin');
  assert(canViewEnterpriseValues('ADMIN_EMPRESA'), 'vê valores enterprise');
  assert(canManageGisProject('ADMIN_EMPRESA'), 'gerencia GIS');
  assert(secondaryAdminCannotAccessMaster('ADMIN_EMPRESA'), 'não acessa master');
  assert(!isPlatformAdmin('ADMIN_EMPRESA'), 'não é platform admin');
  assert(isPlatformAdmin('SUPER_ADMIN'), 'SUPER_ADMIN é platform');
  console.log('OK testSecondaryAdminPermissions');
}

function testInactiveAdminAccess() {
  assert(normalizeAdminStatus('INACTIVE') === 'INACTIVE', 'status inativo');
  assert(normalizeAdminStatus('active') === 'ACTIVE', 'status ativo');
  console.log('OK testInactiveAdminAccess');
}

function testAuditDescription() {
  const text = formatCompanyAdminAuditDescription(
    'Maria Silva',
    'COMPANY_ADMIN_CREATED',
    'João Pereira',
    'cadastrou novo administrador',
  );
  assert(text.includes('Maria Silva'), 'ator no texto');
  assert(text.includes('João Pereira'), 'alvo no texto');
  assert(text.includes('cadastrou'), 'detalhe extra');

  const manage = assertCallerCanManageCompanyAdmins('ADMIN');
  assert(manage.ok, 'ADMIN gerencia');
  const deny = assertCallerCanManageCompanyAdmins('BROKER');
  assert(!deny.ok, 'BROKER não gerencia');
  console.log('OK testAuditDescription');
}

function testReactivateRespectsLimit() {
  const atLimit = canCreateCompanyAdmin(5, 5);
  assert(!atLimit.ok, 'reativar bloqueado no limite cheio simulado');
  console.log('OK testReactivateRespectsLimit');
}

function main() {
  testCompanyAdminRoles();
  testAdminLimit();
  testMenesesLimitConstant();
  testTenantIsolation();
  testSecondaryAdminPermissions();
  testInactiveAdminAccess();
  testAuditDescription();
  testReactivateRespectsLimit();
  console.log('\nTodos os testes mandatory-company-admin-users passaram.');
}

main();
