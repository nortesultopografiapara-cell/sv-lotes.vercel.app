/**
 * Testes obrigatórios — separação corretor x administrador.
 * npm run test:broker-admin-email-conflict
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  BROKER_ACCESS_LEVEL_OPTIONS,
  BROKER_USER_ROLE,
  isCompanyAdminAccessLevel,
  sanitizeBrokerAccessLevel,
  shouldAppearInBrokerList,
} from '../lib/brokerAccessLevels';
import {
  brokerAdminEmailConflictMessage,
  buildBrokerActivatePatch,
  buildBrokerSoftDeletePatch,
  isBrokerActiveForList,
  isBrokerRecordActive,
  resolveBrokerAdminEmailConflict,
} from '../lib/brokerDelete';
import { isCompanyAdminUserRole } from '../lib/companyAdminUsers';
import {
  resolveEffectiveLoginRole,
  resolveLoginRedirectPath,
  shouldLoginAsAdmin,
  shouldLoginAsBroker,
} from '../lib/loginRoleResolution';

const ROOT = process.cwd();
const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-meneses00001';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(relPath: string): string {
  const full = path.join(ROOT, relPath);
  assert(fs.existsSync(full), `arquivo ausente: ${relPath}`);
  return fs.readFileSync(full, 'utf8');
}

function testBrokerModalNoAdminOption() {
  const brokersPage = read('app/dashboard/brokers/page.tsx');
  assert(!brokersPage.includes('Administrador (Total)'), 'modal sem Administrador (Total)');
  assert(!brokersPage.includes('value="ADMIN_EMPRESA"'), 'modal sem ADMIN_EMPRESA');
  assert(brokersPage.includes('BROKER_ACCESS_LEVEL_OPTIONS'), 'modal usa opções de corretor');

  const accessLevels = read('lib/brokerAccessLevels.ts');
  assert(accessLevels.includes('Corretor / Vendedor'), 'opção corretor presente');
  assert(accessLevels.includes('Gerente de Vendas'), 'opção gerente presente');
  assert(accessLevels.includes('Assistente Comercial'), 'opção assistente presente');
  assert(!accessLevels.includes('Administrador (Total)'), 'sem opção administrador no modal');
  assert(!accessLevels.includes("value: 'ADMIN_EMPRESA'"), 'sem ADMIN_EMPRESA nas opções');
}

function testBrokerCreateNeverPromotesAdmin() {
  const brokersPage = read('app/dashboard/brokers/page.tsx');
  assert(brokersPage.includes('role: BROKER_USER_ROLE'), 'create envia BROKER para users');
  assert(brokersPage.includes('sanitizeBrokerAccessLevel'), 'nível sanitizado no brokers');

  const usersCreate = read('app/api/users/create/route.ts');
  assert(usersCreate.includes('isCompanyAdminAccessLevel(role)'), 'API bloqueia admin');
  assert(usersCreate.includes('brokerUserRole = BROKER_USER_ROLE'), 'users.role sempre BROKER');
}

function testAdminNotInBrokerList() {
  assert(
    !shouldAppearInBrokerList({ brokerRole: 'ADMIN_EMPRESA', userRole: 'BROKER' }),
    'admin em brokers.role excluído',
  );
  assert(
    !shouldAppearInBrokerList({ brokerRole: 'BROKER', userRole: 'ADMIN_EMPRESA' }),
    'admin em users.role excluído',
  );
  assert(
    shouldAppearInBrokerList({ brokerRole: 'GERENTE', userRole: 'BROKER' }),
    'gerente permanece na lista',
  );

  const brokersPage = read('app/dashboard/brokers/page.tsx');
  assert(brokersPage.includes('shouldAppearInBrokerList'), 'lista filtra administradores');
}

function testBrokerLimitCountsActiveOnly() {
  const active = [
    { active: true, status: 'ativo', deleted_at: null },
    { active: false, status: 'inativo', deleted_at: '2026-01-01' },
    { active: true, status: 'ativo', deleted_at: null },
  ];
  const count = active.filter(isBrokerActiveForList).length;
  assert(count === 2, 'limite conta só active=true');

  const brokersPage = read('app/dashboard/brokers/page.tsx');
  assert(brokersPage.includes('computeBrokerDashboardStats'), 'cards usam stats ativos');
  assert(brokersPage.includes('filterBrokersForActiveList(corretores)'), 'quota usa ativos');
}

function testBrokerActiveInactive() {
  assert(isBrokerActiveForList({ active: true, status: 'ativo', deleted_at: null }), 'ativo na lista');
  assert(!isBrokerActiveForList({ active: false, status: 'ativo', deleted_at: null }), 'active false');
  assert(!isBrokerActiveForList({ active: true, status: 'inativo', deleted_at: null }), 'status inativo');
  assert(
    !isBrokerActiveForList({ active: true, status: 'ativo', deleted_at: '2026-01-01T00:00:00Z' }),
    'deleted_at',
  );
  assert(!isBrokerRecordActive(null), 'sem registro broker');
}

function testEmailConflictStates() {
  const activeBroker = resolveBrokerAdminEmailConflict({
    existingUser: { id: 'u1', role: 'BROKER', tenant_id: TENANT },
    brokerRecord: { id: 'u1', active: true, status: 'ativo', deleted_at: null },
    tenantId: TENANT,
    isAdminRole: isCompanyAdminUserRole,
  });
  assert(activeBroker === 'same_tenant_active_broker', 'broker ativo bloqueia admin');

  const promotable = resolveBrokerAdminEmailConflict({
    existingUser: { id: 'u1', role: 'BROKER', tenant_id: TENANT },
    brokerRecord: { id: 'u1', active: false, status: 'inativo', deleted_at: '2026-06-01' },
    tenantId: TENANT,
    isAdminRole: isCompanyAdminUserRole,
  });
  assert(promotable === 'same_tenant_inactive_broker_promotable', 'broker inativo permite admin');

  const existingAdmin = resolveBrokerAdminEmailConflict({
    existingUser: { id: 'u2', role: 'ADMIN_EMPRESA', tenant_id: TENANT },
    brokerRecord: null,
    tenantId: TENANT,
    isAdminRole: isCompanyAdminUserRole,
  });
  assert(existingAdmin === 'same_tenant_admin', 'admin existente detectado');
  assert(
    brokerAdminEmailConflictMessage(existingAdmin) ===
      'Este e-mail já é administrador desta empresa.',
    'mensagem admin clara',
  );
}

function testLoginAdminPriority() {
  assert(resolveEffectiveLoginRole('SUPER_ADMIN') === 'SUPER_ADMIN', 'SUPER_ADMIN primeiro');
  assert(shouldLoginAsAdmin('ADMIN_EMPRESA'), 'login como admin empresa');
  assert(shouldLoginAsAdmin('ADMIN'), 'login como ADMIN');
  assert(!shouldLoginAsBroker('ADMIN_EMPRESA'), 'admin não entra como broker');
  assert(resolveLoginRedirectPath('ADMIN_EMPRESA') === '/dashboard', 'admin → dashboard');
  assert(resolveLoginRedirectPath('BROKER') === '/map', 'broker → map');
  assert(resolveLoginRedirectPath('SUPER_ADMIN') === '/master', 'super admin → painel executivo');
  assert(resolveLoginRedirectPath('OWNER') === '/dashboard', 'owner → dashboard');
  assert(resolveLoginRedirectPath('ADMIN') === '/dashboard', 'admin tenant → dashboard');
}

function testDeleteOnlyBrokersTable() {
  const brokerDelete = read('lib/brokerDelete.ts');
  assert(brokerDelete.includes("from('brokers')"), 'delete usa brokers');
  assert(!brokerDelete.includes('auth.admin.deleteUser'), 'não apaga auth user no toggle/delete broker');
  assert(!brokerDelete.includes("from('users').delete"), 'não apaga users');
  assert(brokerDelete.includes('deleteBrokerViaAdmin'), 'delete server-side');
  assert(brokerDelete.includes('setBrokerActiveViaAdmin'), 'toggle server-side');

  const apiRoute = read('app/api/brokers/[id]/route.ts');
  assert(apiRoute.includes('deleteBrokerViaAdmin'), 'API DELETE');
  assert(apiRoute.includes('setBrokerActiveViaAdmin'), 'API PATCH toggle');

  const brokersPage = read('app/dashboard/brokers/page.tsx');
  assert(brokersPage.includes('/api/brokers/'), 'UI chama API brokers');
}

function testCompanyAdminSettingsOnly() {
  const settings = read('components/settings/TenantCompanyAdminsPanel.tsx');
  assert(settings.includes('callCompanyAdminsApi'), 'admins via Configurações');

  const companyAdmin = read('lib/companyAdminUsers.ts');
  assert(companyAdmin.includes("from('users')"), 'admin salvo em users');
  assert(!companyAdmin.includes("from('brokers').insert"), 'admin não insere em brokers');
}

function testBrokerActivateDeactivatePatches() {
  const deactivate = buildBrokerSoftDeletePatch(new Date('2026-06-08T12:00:00.000Z'));
  assert(deactivate.active === false, 'desativar active=false');
  assert(deactivate.status === 'inativo', 'desativar status=inativo');
  assert(deactivate.deleted_at === '2026-06-08T12:00:00.000Z', 'desativar deleted_at=now');

  const activate = buildBrokerActivatePatch(new Date('2026-06-08T12:00:00.000Z'));
  assert(activate.active === true, 'reativar active=true');
  assert(activate.status === 'ativo', 'reativar status=ativo');
  assert(activate.deleted_at === null, 'reativar deleted_at=null');
}

function testBrokerToggleApiAndUi() {
  const brokersPage = read('app/dashboard/brokers/page.tsx');
  assert(brokersPage.includes("method: 'PATCH'"), 'UI chama PATCH');
  assert(brokersPage.includes('Desativar corretor'), 'botão desativar');
  assert(brokersPage.includes('Reativar corretor'), 'botão reativar');
  assert(brokersPage.includes('handleToggleBrokerActive'), 'handler toggle');
  assert(brokersPage.includes('dbActive'), 'botão usa broker.active do registro');
  assert(brokersPage.includes("filterActive === 'ativo' && !c.active"), 'filtro somente ativos');
  assert(brokersPage.includes('await loadBrokers()'), 'refetch após ações');
}

function testBrokerAccessLevels() {
  assert(BROKER_ACCESS_LEVEL_OPTIONS.length === 3, '3 níveis de corretor');
  assert(sanitizeBrokerAccessLevel('ADMIN_EMPRESA') === 'BROKER', 'admin sanitizado para BROKER');
  assert(sanitizeBrokerAccessLevel('GERENTE') === 'GERENTE', 'gerente preservado');
  assert(isCompanyAdminAccessLevel('ADMIN_EMPRESA'), 'detecta admin empresa');
  assert(!isCompanyAdminAccessLevel('GERENTE'), 'gerente não é admin');
  assert(BROKER_USER_ROLE === 'BROKER', 'perfil users para corretor');
}

function run() {
  const tests: Array<[string, () => void]> = [
    ['modal sem Administrador', testBrokerModalNoAdminOption],
    ['create nunca promove admin', testBrokerCreateNeverPromotesAdmin],
    ['admin fora da lista corretores', testAdminNotInBrokerList],
    ['limite conta só ativos', testBrokerLimitCountsActiveOnly],
    ['broker ativo/inativo', testBrokerActiveInactive],
    ['conflito e-mail admin', testEmailConflictStates],
    ['login SUPER_ADMIN > ADMIN > BROKER', testLoginAdminPriority],
    ['delete/toggle só brokers', testDeleteOnlyBrokersTable],
    ['admin só em Configurações', testCompanyAdminSettingsOnly],
    ['patches ativar/desativar', testBrokerActivateDeactivatePatches],
    ['toggle corretor API/UI', testBrokerToggleApiAndUi],
    ['níveis de acesso corretor', testBrokerAccessLevels],
  ];

  for (const [name, fn] of tests) {
    fn();
    console.log(`✓ ${name}`);
  }

  console.log(`\n${tests.length} grupos de testes corretor/admin OK.`);
}

run();
