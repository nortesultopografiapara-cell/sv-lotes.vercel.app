/**
 * Regressão de roles após múltiplos administradores por empresa.
 * npx tsx scripts/mandatory-role-regression-admin-users-tests.ts
 */

import { flattenSuperAdminNav } from '../lib/superAdminNav';
import {
  isMasterConsoleRole,
  isTenantEnterpriseAdminRole,
  normalizeUserRole,
  resolveRoleDisplayLabel,
  shouldShowFullTenantAdminMenu,
  shouldUseMasterConsoleLayout,
  canViewEnterpriseValues,
  isBrokerRole,
  isBrokerBlockedRoute,
} from '../lib/rolePermissions';
import { isPlatformAdmin } from '../lib/rls';
import { isSuperAdminRole } from '../lib/masterCompanyUsers';

const FULL_TENANT_MENU = [
  'Dashboard',
  'Mapa GIS',
  'Clientes',
  'Corretores',
  'Financeiro',
  'Contratos',
  'Sócios / Proprietários',
  'Sincronização Offline',
  'Configurações',
];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function expectedTenantMenuCount(role: string): number {
  if (shouldUseMasterConsoleLayout(role)) return 0;
  if (shouldShowFullTenantAdminMenu(role)) return FULL_TENANT_MENU.length;
  if (isBrokerRole(role)) return 1;
  if (normalizeUserRole(role) === 'OWNER') return 4;
  return 5;
}

function testSuperAdminMasterMenu() {
  for (const role of ['SUPER_ADMIN', 'MASTER-ADMIN', 'MASTER_ADMIN']) {
    assert(isMasterConsoleRole(role), `${role} é master console`);
    assert(shouldUseMasterConsoleLayout(role), `${role} usa layout master`);
    assert(expectedTenantMenuCount(role) === 0, `${role} sem menu tenant`);
    assert(
      resolveRoleDisplayLabel(role) === 'Painel Master · SaaS',
      `${role} label master`,
    );
    assert(!resolveRoleDisplayLabel(role).includes('Admin Empresa'), `${role} não é admin empresa`);
  }
  const masterNav = flattenSuperAdminNav();
  assert(masterNav.some((item) => item.href === '/companies'), 'nav master empresas');
  assert(masterNav.some((item) => item.href === '/saas-finance'), 'nav master finance');
  console.log('OK testSuperAdminMasterMenu');
}

function testTenantAdminFullMenu() {
  for (const role of ['ADMIN', 'ADMIN_EMPRESA', 'COMPANY_ADMIN']) {
    assert(isTenantEnterpriseAdminRole(role), `${role} é tenant admin`);
    assert(shouldShowFullTenantAdminMenu(role), `${role} menu completo`);
    assert(!shouldUseMasterConsoleLayout(role), `${role} não usa master layout`);
    assert(expectedTenantMenuCount(role) === FULL_TENANT_MENU.length, `${role} 9 itens`);
    assert(
      FULL_TENANT_MENU.includes('Sócios / Proprietários'),
      'menu inclui sócios',
    );
    assert(
      FULL_TENANT_MENU.includes('Sincronização Offline'),
      'menu inclui offline sync',
    );
  }
  assert(
    resolveRoleDisplayLabel('ADMIN') === 'Administrador da Empresa',
    'ADMIN label principal',
  );
  assert(
    resolveRoleDisplayLabel('ADMIN_EMPRESA') === 'Admin Empresa',
    'ADMIN_EMPRESA label secundário',
  );
  console.log('OK testTenantAdminFullMenu');
}

function testBrokerLimitedMenu() {
  assert(expectedTenantMenuCount('BROKER') === 1, 'broker 1 item');
  assert(isBrokerBlockedRoute('/owners'), 'broker bloqueado owners');
  assert(isBrokerBlockedRoute('/offline-sync'), 'broker bloqueado offline');
  assert(isBrokerBlockedRoute('/settings'), 'broker bloqueado settings');
  assert(resolveRoleDisplayLabel('BROKER') === 'Corretor / Vendedor', 'label broker');
  console.log('OK testBrokerLimitedMenu');
}

function testPlatformAdminHelpers() {
  assert(isPlatformAdmin('SUPER_ADMIN'), 'isPlatformAdmin SUPER_ADMIN');
  assert(isSuperAdminRole('MASTER-ADMIN'), 'isSuperAdminRole MASTER-ADMIN');
  assert(!isTenantEnterpriseAdminRole('SUPER_ADMIN'), 'SUPER_ADMIN não é tenant admin');
  console.log('OK testPlatformAdminHelpers');
}

function testLegacyAdminNotDowngraded() {
  assert(shouldShowFullTenantAdminMenu('ADMIN'), 'ADMIN legado mantém menu');
  assert(canViewEnterpriseValues('ADMIN'), 'ADMIN vê valores enterprise');
  console.log('OK testLegacyAdminNotDowngraded');
}

function main() {
  testSuperAdminMasterMenu();
  testTenantAdminFullMenu();
  testBrokerLimitedMenu();
  testPlatformAdminHelpers();
  testLegacyAdminNotDowngraded();
  console.log('\nTodos os testes mandatory-role-regression-admin-users passaram.');
}

main();
