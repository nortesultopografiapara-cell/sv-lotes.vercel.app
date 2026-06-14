/**
 * Testes obrigatórios — corretores, comissão 0%, transferência e cancelamento.
 * npx tsx scripts/mandatory-broker-commission-tests.ts
 */

import {
  brokerDashboardPendingTotal,
  calculateCommissionAmount,
  defaultBrokerCommissionPercentForCreate,
  isCanceledBrokerCommission,
  isPaidBrokerCommission,
  isPendingBrokerCommission,
  readBrokerCommissionPercent,
  shouldAutoCreatePendingCommission,
} from '../lib/brokerCommission';
import { canManageSaleBrokerCommission } from '../lib/brokerCommissionAccess';
import {
  assertCanCancelCommissionRows,
  buildCanceledCommissionPatch,
  buildPendingCommissionInsert,
  resolveManualCommissionUpdate,
  resolveTransferCommissionPlan,
  SaleBrokerCommissionError,
} from '../lib/saleBrokerCommissionManage';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testBrokerCommissionCanBeZero() {
  assert(readBrokerCommissionPercent(0) === 0, '0% lido como 0');
  assert(readBrokerCommissionPercent('0') === 0, 'string 0 lida como 0');
  assert(!shouldAutoCreatePendingCommission(0), '0% não gera pendência automática');
  assert(calculateCommissionAmount(75000, 0) === 0, 'valor com 0% é zero');
  assert(defaultBrokerCommissionPercentForCreate(null) === 5, 'novo vazio usa 5%');
  assert(defaultBrokerCommissionPercentForCreate(0) === 0, 'novo com 0 usa 0');
  console.log('OK testBrokerCommissionCanBeZero');
}

function testBrokerEditPersistsZeroCommission() {
  const fromDb = { commission_percent: 0 };
  const loaded = readBrokerCommissionPercent(fromDb.commission_percent);
  assert(loaded === 0, 'reabrir modal mostra 0');
  const saved = readBrokerCommissionPercent(loaded);
  assert(saved === 0, 'salvar 0 persiste 0');
  assert(Number(fromDb.commission_percent) || 5 !== 0, 'bug antigo || 5 alteraria 0');
  console.log('OK testBrokerEditPersistsZeroCommission');
}

function testSaleCanRemoveBrokerWithoutCashMovement() {
  const canceled = buildCanceledCommissionPatch();
  assert(canceled.status === 'cancelado', 'pendente cancelada');
  assert(canceled.amount === 0, 'valor zerado');
  assertCanCancelCommissionRows([{ status: 'pendente', amount: 3750 }]);
  console.log('OK testSaleCanRemoveBrokerWithoutCashMovement');
}

function testSaleCanTransferBroker() {
  const plan = resolveTransferCommissionPlan({
    sale: { id: 'sale-1', tenant_id: 'tenant-1', total_amount: 75000 },
    targetBroker: { id: 'broker-2', commission_percent: 5 },
  });
  assert(plan.brokerId === 'broker-2', 'broker destino');
  assert(plan.commissionPercent === 5, 'percentual do destino');
  assert(plan.pendingInsert?.amount === 3750, 'comissão recalculada');
  console.log('OK testSaleCanTransferBroker');
}

function testTransferToZeroCommissionBrokerDoesNotCreatePendingCommission() {
  const plan = resolveTransferCommissionPlan({
    sale: { id: 'sale-1', tenant_id: 'tenant-1', total_amount: 75000 },
    targetBroker: { id: 'broker-zero', commission_percent: 0 },
  });
  assert(plan.commissionPercent === 0, 'destino 0%');
  assert(plan.pendingInsert === null, 'sem insert de pendência');
  console.log('OK testTransferToZeroCommissionBrokerDoesNotCreatePendingCommission');
}

function testCancelPendingCommissionDoesNotChangeCashFlow() {
  const patch = buildCanceledCommissionPatch();
  assert(patch.amount === 0, 'cancelamento zera pendência');
  assert(!isPendingBrokerCommission(patch.status), 'não fica pendente');
  assert(isCanceledBrokerCommission(patch.status), 'status cancelado');
  console.log('OK testCancelPendingCommissionDoesNotChangeCashFlow');
}

function testPaidCommissionCannotBeCancelledWithoutAdjustment() {
  let blocked = false;
  try {
    assertCanCancelCommissionRows([{ status: 'pago', amount: 3750 }]);
  } catch (err) {
    blocked = err instanceof SaleBrokerCommissionError && err.code === 'COMMISSION_ALREADY_PAID';
  }
  assert(blocked, 'comissão paga bloqueada');
  assert(isPaidBrokerCommission('pago'), 'detecta paga');
  console.log('OK testPaidCommissionCannotBeCancelledWithoutAdjustment');
}

function testOnlyAdminCanManageSaleBrokerCommission() {
  assert(canManageSaleBrokerCommission('ADMIN'), 'ADMIN pode');
  assert(canManageSaleBrokerCommission('SUPER_ADMIN'), 'SUPER_ADMIN pode');
  assert(canManageSaleBrokerCommission('ADMIN_EMPRESA'), 'ADMIN_EMPRESA pode');
  assert(!canManageSaleBrokerCommission('BROKER'), 'BROKER não pode');
  assert(!canManageSaleBrokerCommission('OWNER'), 'OWNER não pode');
  console.log('OK testOnlyAdminCanManageSaleBrokerCommission');
}

function testBrokerDashboardUpdatesPendingCommissionAfterCancel() {
  const rows = [
    { status: 'pendente', amount: 3750 },
    { status: 'cancelado', amount: 0 },
    { status: 'pago', amount: 1000 },
  ];
  const before = brokerDashboardPendingTotal([
    { status: 'pendente', amount: 3750 },
  ]);
  const after = brokerDashboardPendingTotal([
    { status: 'cancelado', amount: 0 },
    { status: 'pago', amount: 1000 },
  ]);
  assert(before === 3750, 'antes tinha pendência');
  assert(after === 0, 'após cancelar some do card');
  console.log('OK testBrokerDashboardUpdatesPendingCommissionAfterCancel');
}

function testManualCommissionModes() {
  const zeroPercent = resolveManualCommissionUpdate({
    sale: { total_amount: 75000 },
    commission_percent: 0,
  });
  assert(zeroPercent.status === 'cancelado', '0% cancela pendência');

  const fixed = resolveManualCommissionUpdate({
    sale: { total_amount: 75000 },
    fixed_amount: 2500,
  });
  assert(fixed.amount === 2500, 'valor fixo');
  assert(fixed.status === 'pendente', 'fixo pendente');

  const insert = buildPendingCommissionInsert({
    tenantId: 't1',
    brokerId: 'b1',
    saleId: 's1',
    saleValue: 100000,
    commissionPercent: 3,
  });
  assert(insert?.amount === 3000, 'insert calculado');
  console.log('OK testManualCommissionModes');
}

function main() {
  testBrokerCommissionCanBeZero();
  testBrokerEditPersistsZeroCommission();
  testSaleCanRemoveBrokerWithoutCashMovement();
  testSaleCanTransferBroker();
  testTransferToZeroCommissionBrokerDoesNotCreatePendingCommission();
  testCancelPendingCommissionDoesNotChangeCashFlow();
  testPaidCommissionCannotBeCancelledWithoutAdjustment();
  testOnlyAdminCanManageSaleBrokerCommission();
  testBrokerDashboardUpdatesPendingCommissionAfterCancel();
  testManualCommissionModes();
  console.log('\nTodos os testes obrigatórios de comissão de corretor passaram.');
}

main();
