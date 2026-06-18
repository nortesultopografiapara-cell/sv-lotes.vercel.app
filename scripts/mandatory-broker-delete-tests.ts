/**
 * Testes obrigatórios — exclusão/desativação de corretores.
 * npx tsx scripts/mandatory-broker-delete-tests.ts
 */

import {
  BrokerDeleteError,
  buildBrokerSoftDeletePatch,
  canManageBrokerInTenant,
  computeBrokerDashboardStats,
  filterBrokersForActiveList,
  isBrokerActiveForList,
  rankBrokersByMonthlySales,
  removeBrokerFromList,
  resolveBrokerDeleteMode,
  resolveBrokerRowTenantId,
  resolveBrokerTenantColumn,
  resolveEffectiveBrokerTenant,
} from '../lib/brokerDelete';
import { MENESES_COMPANY_ID } from '../lib/saasContractContent';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const brokerA = {
  id: 'broker-a',
  name: 'Ana',
  active: true,
  status: 'ativo',
  deleted_at: null,
  vendas_mes_qtd: 2,
  vendas_mes_valor: 100000,
  comissao_pendente: 5000,
  comissao_paga: 2000,
};

const brokerB = {
  id: 'broker-b',
  name: 'Bruno',
  active: true,
  status: 'ativo',
  deleted_at: null,
  vendas_mes_qtd: 1,
  vendas_mes_valor: 50000,
  comissao_pendente: 0,
  comissao_paga: 1000,
};

const brokerInactive = {
  id: 'broker-c',
  name: 'Carlos',
  active: false,
  status: 'inativo',
  deleted_at: null,
  vendas_mes_qtd: 0,
  vendas_mes_valor: 0,
  comissao_pendente: 0,
  comissao_paga: 0,
};

const brokerSoftDeleted = {
  id: 'broker-d',
  name: 'Diana',
  active: false,
  status: 'inativo',
  deleted_at: '2026-06-18T12:00:00.000Z',
  vendas_mes_qtd: 3,
  vendas_mes_valor: 80000,
  comissao_pendente: 3000,
  comissao_paga: 4000,
};

function testResolveDeleteMode() {
  assert(resolveBrokerDeleteMode(0, 0) === 'hard', 'sem vínculo = hard delete');
  assert(resolveBrokerDeleteMode(1, 0) === 'soft', 'com venda = soft delete');
  assert(resolveBrokerDeleteMode(0, 2) === 'soft', 'com comissão = soft delete');
  assert(resolveBrokerDeleteMode(1, 1) === 'soft', 'com ambos = soft delete');
  console.log('OK testResolveDeleteMode');
}

function testSoftDeletePatch() {
  const patch = buildBrokerSoftDeletePatch(new Date('2026-06-18T15:30:00.000Z'));
  assert(patch.active === false, 'active false');
  assert(patch.status === 'inativo', 'status inativo');
  assert(patch.deleted_at === '2026-06-18T15:30:00.000Z', 'deleted_at preenchido');
  assert(typeof patch.updated_at === 'string', 'updated_at preenchido');
  console.log('OK testSoftDeletePatch');
}

function testActiveListFiltersDeletedAndInactive() {
  assert(isBrokerActiveForList(brokerA), 'ativo na lista');
  assert(!isBrokerActiveForList(brokerInactive), 'inativo fora da lista');
  assert(!isBrokerActiveForList(brokerSoftDeleted), 'soft deleted fora da lista');

  const list = filterBrokersForActiveList([brokerA, brokerB, brokerInactive, brokerSoftDeleted]);
  assert(list.length === 2, 'somente ativos na lista padrão');
  assert(list.every((b) => b.id === 'broker-a' || b.id === 'broker-b'), 'ids corretos');
  console.log('OK testActiveListFiltersDeletedAndInactive');
}

function testRemoveBrokerUpdatesListAndCards() {
  const all = [brokerA, brokerB, brokerInactive];
  const afterDelete = removeBrokerFromList(all, brokerA.id);
  assert(afterDelete.length === 2, 'remove da lista local');
  assert(!afterDelete.some((b) => b.id === brokerA.id), 'corretor removido não aparece');

  const beforeStats = computeBrokerDashboardStats(all);
  const afterStats = computeBrokerDashboardStats(afterDelete);

  assert(beforeStats.activeCount === 2, '2 ativos antes');
  assert(afterStats.activeCount === 1, '1 ativo depois');
  assert(beforeStats.totalVendasMes === 3, 'vendas mês antes');
  assert(afterStats.totalVendasMes === 1, 'vendas mês depois');
  assert(beforeStats.totalComissoesPendentes === 5000, 'pendente antes');
  assert(afterStats.totalComissoesPendentes === 0, 'pendente depois');
  console.log('OK testRemoveBrokerUpdatesListAndCards');
}

function testRankingUsesOnlyActiveBrokers() {
  const ranking = rankBrokersByMonthlySales([brokerA, brokerB, brokerInactive, brokerSoftDeleted], 3);
  assert(ranking.length === 2, 'ranking só com ativos que venderam');
  assert(ranking[0].id === 'broker-a', 'primeiro por valor');
  assert(ranking[1].id === 'broker-b', 'segundo por valor');

  const afterRemoval = rankBrokersByMonthlySales(removeBrokerFromList([brokerA, brokerB], brokerA.id), 3);
  assert(afterRemoval.length === 1, 'ranking atualiza após remoção');
  assert(afterRemoval[0].id === 'broker-b', 'ranking correto após remoção');
  console.log('OK testRankingUsesOnlyActiveBrokers');
}

function testSalesHistoryPreservedOnSoftDelete() {
  // Soft delete mantém registro com deleted_at — vendas continuam referenciando broker_id
  const patch = buildBrokerSoftDeletePatch();
  assert(patch.deleted_at != null, 'marca exclusão lógica');
  assert(patch.active === false, 'desativa sem apagar linha');
  assert(!isBrokerActiveForList({ ...brokerA, ...patch }), 'some da lista ativa');
  console.log('OK testSalesHistoryPreservedOnSoftDelete');
}

function testResolveBrokerRowTenant() {
  assert(resolveBrokerRowTenantId({ tenant_id: MENESES_COMPANY_ID, company_id: null }) === MENESES_COMPANY_ID, 'tenant_id');
  assert(
    resolveBrokerRowTenantId({ tenant_id: null, company_id: MENESES_COMPANY_ID }) === MENESES_COMPANY_ID,
    'fallback company_id',
  );
  assert(resolveBrokerTenantColumn({ tenant_id: MENESES_COMPANY_ID, company_id: 'other' }) === 'tenant_id', 'coluna tenant');
  assert(resolveBrokerTenantColumn({ tenant_id: null, company_id: MENESES_COMPANY_ID }) === 'company_id', 'coluna company');
  console.log('OK testResolveBrokerRowTenant');
}

function testTenantFromBrokerWhenActiveTenantFails() {
  const broker = {
    tenant_id: MENESES_COMPANY_ID,
    company_id: MENESES_COMPANY_ID,
  };

  const scope = resolveEffectiveBrokerTenant({
    broker,
    activeTenantId: null,
    userRole: 'ADMIN_EMPRESA',
    userTenantId: MENESES_COMPANY_ID,
    isSuperAdmin: false,
  });

  assert(scope.effectiveTenantId === MENESES_COMPANY_ID, 'usa tenant do broker');
  assert(scope.source === 'user_tenant', 'origem user_tenant');
  assert(canManageBrokerInTenant({
    isSuperAdmin: false,
    userRole: 'ADMIN_EMPRESA',
    userTenantId: MENESES_COMPANY_ID,
    brokerTenantId: MENESES_COMPANY_ID,
  }), 'admin Meneses pode');

  let blocked = false;
  try {
    resolveEffectiveBrokerTenant({
      broker,
      activeTenantId: 'aaaaaaaa-bbbb-cccc-dddd-000000000001',
      userRole: 'ADMIN_EMPRESA',
      userTenantId: 'aaaaaaaa-bbbb-cccc-dddd-000000000002',
      isSuperAdmin: false,
    });
  } catch (e) {
    blocked = e instanceof BrokerDeleteError;
  }
  assert(blocked, 'bloqueia cross-tenant');

  const superScope = resolveEffectiveBrokerTenant({
    broker,
    activeTenantId: null,
    userRole: 'SUPER_ADMIN',
    userTenantId: null,
    isSuperAdmin: true,
  });
  assert(superScope.effectiveTenantId === MENESES_COMPANY_ID, 'super admin usa tenant do broker');
  console.log('OK testTenantFromBrokerWhenActiveTenantFails');
}

function main() {
  testResolveDeleteMode();
  testSoftDeletePatch();
  testActiveListFiltersDeletedAndInactive();
  testRemoveBrokerUpdatesListAndCards();
  testRankingUsesOnlyActiveBrokers();
  testSalesHistoryPreservedOnSoftDelete();
  testResolveBrokerRowTenant();
  testTenantFromBrokerWhenActiveTenantFails();
  console.log('\nTodos os testes obrigatórios de exclusão de corretores passaram.');
}

main();
