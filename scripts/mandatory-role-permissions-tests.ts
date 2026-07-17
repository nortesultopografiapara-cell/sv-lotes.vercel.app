/**
 * Permissões por perfil — valores do empreendimento.
 * npx tsx scripts/mandatory-role-permissions-tests.ts
 */

import {
  canAccessAdminDashboard,
  canAccessFinanceModule,
  canViewEnterpriseValues,
  canViewGlobalEnterpriseValues,
  isBrokerBlockedRoute,
  isBrokerRole,
} from '../lib/rolePermissions';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testBrokerRoles() {
  assert(isBrokerRole('BROKER'), 'BROKER');
  assert(isBrokerRole('CORRETOR'), 'CORRETOR');
  assert(!isBrokerRole('ADMIN'), 'not ADMIN');
  assert(!isBrokerRole('SUPER_ADMIN'), 'not SUPER_ADMIN');
  console.log('OK testBrokerRoles');
}

function testAdminCanViewValues() {
  assert(canViewEnterpriseValues('ADMIN'), 'ADMIN');
  assert(canViewEnterpriseValues('SUPER_ADMIN'), 'SUPER_ADMIN');
  assert(canViewGlobalEnterpriseValues('ADMIN'), 'global ADMIN');
  assert(canAccessFinanceModule('SUPER_ADMIN'), 'finance SUPER_ADMIN');
  console.log('OK testAdminCanViewValues');
}

function testBrokerCannotViewValues() {
  assert(!canViewEnterpriseValues('BROKER'), 'broker values');
  assert(!canViewGlobalEnterpriseValues('CORRETOR'), 'corretor global');
  assert(!canAccessAdminDashboard('BROKER'), 'broker dashboard');
  assert(!canAccessFinanceModule('BROKER'), 'broker finance');
  console.log('OK testBrokerCannotViewValues');
}

function testBrokerBlockedRoutes() {
  assert(isBrokerBlockedRoute('/dashboard'), 'dashboard');
  assert(isBrokerBlockedRoute('/finance'), 'finance');
  assert(isBrokerBlockedRoute('/contracts'), 'contracts');
  assert(!isBrokerBlockedRoute('/map'), 'map allowed');
  assert(!isBrokerBlockedRoute('/my-sales'), 'my-sales allowed');
  assert(!isBrokerBlockedRoute('/login'), 'login allowed');
  console.log('OK testBrokerBlockedRoutes');
}

function main() {
  testBrokerRoles();
  testAdminCanViewValues();
  testBrokerCannotViewValues();
  testBrokerBlockedRoutes();
  console.log('mandatory-role-permissions-tests: all passed');
}

main();
