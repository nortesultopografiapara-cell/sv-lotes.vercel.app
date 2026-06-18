/**
 * Testes obrigatórios — conflito e-mail corretor x administrador.
 * npx tsx scripts/mandatory-broker-admin-email-conflict-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  brokerAdminEmailConflictMessage,
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
  assert(brokerAdminEmailConflictMessage(promotable) === null, 'sem erro promotable');
}

function testLoginAdminPriority() {
  assert(resolveEffectiveLoginRole('ADMIN_EMPRESA') === 'ADMIN_EMPRESA', 'role admin');
  assert(shouldLoginAsAdmin('ADMIN_EMPRESA'), 'login como admin');
  assert(!shouldLoginAsBroker('ADMIN_EMPRESA'), 'admin não entra como broker');
  assert(resolveLoginRedirectPath('ADMIN_EMPRESA') === '/dashboard', 'admin → dashboard');
  assert(resolveLoginRedirectPath('BROKER') === '/map', 'broker → map');
}

function testDeleteOnlyBrokersTable() {
  const brokerDelete = read('lib/brokerDelete.ts');
  assert(brokerDelete.includes("from('brokers')"), 'delete usa brokers');
  assert(!brokerDelete.includes('auth.admin.deleteUser'), 'não apaga auth user');
  assert(!brokerDelete.includes("from('users').delete"), 'não apaga users');
  assert(brokerDelete.includes('deleteBrokerViaAdmin'), 'delete server-side');

  const apiRoute = read('app/api/brokers/[id]/route.ts');
  assert(apiRoute.includes('deleteBrokerViaAdmin'), 'API usa deleteBrokerViaAdmin');

  const brokersPage = read('app/dashboard/brokers/page.tsx');
  assert(brokersPage.includes('/api/brokers/'), 'UI chama API delete');
  assert(!brokersPage.includes('deactivateOrDeleteBroker'), 'UI não deleta direto no client');
}

function testCompanyAdminPromotion() {
  const source = read('lib/companyAdminUsers.ts');
  assert(source.includes('resolveBrokerAdminEmailConflict'), 'admin usa resolução conflito');
  assert(source.includes('same_tenant_inactive_broker_promotable'), 'permite promoção broker inativo');
}

function testBrokersListActiveFilter() {
  const brokersPage = read('app/dashboard/brokers/page.tsx');
  assert(brokersPage.includes('isBrokerActiveForList'), 'listagem usa isBrokerActiveForList');
  assert(brokersPage.includes('setCorretores(enhancedData)'), 'lista inclui inativos para filtro');
  assert(brokersPage.includes("filterActive === 'ativo' && !c.active"), 'filtro somente ativos');
  assert(brokersPage.includes('computeBrokerDashboardStats'), 'contador via stats ativos');
  assert(brokersPage.includes('await loadBrokers()'), 'refetch após exclusão');
}

function run() {
  const tests: Array<[string, () => void]> = [
    ['broker ativo/inativo', testBrokerActiveInactive],
    ['conflito e-mail admin', testEmailConflictStates],
    ['login ADMIN > BROKER', testLoginAdminPriority],
    ['delete só brokers', testDeleteOnlyBrokersTable],
    ['promoção admin', testCompanyAdminPromotion],
    ['listagem corretores', testBrokersListActiveFilter],
  ];

  for (const [name, fn] of tests) {
    fn();
    console.log(`✓ ${name}`);
  }

  console.log(`\n${tests.length} grupos de testes broker/admin e-mail OK.`);
}

run();
