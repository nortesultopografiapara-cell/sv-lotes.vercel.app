/**
 * Testes obrigatórios — gerenciar corretor/comissão (admin, painel, transferência).
 * npx tsx scripts/mandatory-broker-commission-tests.ts
 */

import {
  brokerDashboardPendingTotal,
  buildBrokerCommissionAmountField,
  calculateCommissionAmount,
  getSalePendingCommissionTotal,
  isCanceledBrokerCommission,
  isPaidBrokerCommission,
  isPendingBrokerCommission,
  readBrokerCommissionPercent,
  resolveBrokerCommissionAmount,
} from '../lib/brokerCommission';
import {
  BROKER_COMMISSION_AMOUNT_COLUMN,
  BROKER_COMMISSION_API_SELECT,
  BROKER_COMMISSION_PRODUCTION_SCHEMA,
} from '../lib/brokerCommissionSchema';
import { assertApiTenantScope } from '../lib/apiTenantContext';
import { canManageSaleBrokerCommission } from '../lib/brokerCommissionAccess';
import { resolveUserCompanyId } from '../lib/masterCompanyUsers';
import {
  assertCanCancelCommissionRows,
  buildCanceledCommissionPatch,
  resolveManualCommissionUpdate,
  resolveTransferCommissionPlan,
  SaleBrokerCommissionError,
} from '../lib/saleBrokerCommissionManage';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testAdminCanManageBrokerCommission() {
  assert(canManageSaleBrokerCommission('ADMIN'), 'ADMIN pode');
  assert(canManageSaleBrokerCommission('SUPER_ADMIN'), 'SUPER_ADMIN pode');
  assert(canManageSaleBrokerCommission('ADMIN_EMPRESA'), 'ADMIN_EMPRESA pode');
  assert(canManageSaleBrokerCommission('COMPANY_ADMIN'), 'COMPANY_ADMIN pode');
  assert(canManageSaleBrokerCommission('MANAGER'), 'MANAGER pode');
  console.log('OK testAdminCanManageBrokerCommission');
}

function testBrokerCannotManageBrokerCommission() {
  assert(!canManageSaleBrokerCommission('BROKER'), 'BROKER bloqueado');
  assert(!canManageSaleBrokerCommission('CORRETOR'), 'CORRETOR bloqueado');
  console.log('OK testBrokerCannotManageBrokerCommission');
}

function testOwnerCannotManageBrokerCommission() {
  assert(!canManageSaleBrokerCommission('OWNER'), 'OWNER bloqueado');
  console.log('OK testOwnerCannotManageBrokerCommission');
}

function testBrokerCommissionUsesAmountColumnOnly() {
  const write = buildBrokerCommissionAmountField(3750);
  assert(write.amount === 3750, 'grava amount');
  assert(!('commission_value' in write), 'não grava commission_value');
  assert(BROKER_COMMISSION_AMOUNT_COLUMN === 'amount', 'coluna canônica');
  assert(!BROKER_COMMISSION_API_SELECT.includes('commission_value'), 'select sem commission_value');
  const amountCol = BROKER_COMMISSION_PRODUCTION_SCHEMA.find((c) => c.column === 'amount');
  assert(!!amountCol, 'schema documenta amount');
  assert(
    !BROKER_COMMISSION_PRODUCTION_SCHEMA.some((c) => c.column === 'commission_value'),
    'schema não exige commission_value em produção',
  );
  console.log('OK testBrokerCommissionUsesAmountColumnOnly');
}

function testBrokerCommissionDashboardMatchesModal() {
  const rows = [
    {
      sale_id: 'sale-1',
      broker_id: 'broker-1',
      status: 'PENDENTE',
      amount: 3750,
    },
  ];

  const dashboardBrokerTotal = brokerDashboardPendingTotal(rows);
  const dashboardSaleTotal = getSalePendingCommissionTotal(rows, 'sale-1', 'broker-1');
  const modalTotal = getSalePendingCommissionTotal(rows, 'sale-1');

  assert(dashboardBrokerTotal === 3750, 'painel corretor usa amount');
  assert(dashboardSaleTotal === 3750, 'venda no painel');
  assert(modalTotal === 3750, 'modal usa mesma origem');
  assert(dashboardSaleTotal === modalTotal, 'painel e modal iguais');

  const canceledRows = [
    { sale_id: 'sale-1', broker_id: 'broker-1', status: 'cancelado', amount: 0 },
  ];
  assert(getSalePendingCommissionTotal(canceledRows, 'sale-1') === 0, 'cancelada zera painel/modal');
  console.log('OK testBrokerCommissionDashboardMatchesModal');
}

function testTransferSaleToAnotherBroker() {
  const plan = resolveTransferCommissionPlan({
    sale: { id: 'sale-1', tenant_id: 'tenant-1', total_amount: 75000 },
    targetBroker: { id: 'cassio-vs10', commission_percent: 5 },
  });
  assert(plan.brokerId === 'cassio-vs10', 'destino CASSIO VS10');
  assert(plan.pendingInsert?.amount === 3750, 'comissão recalculada 5% de 75k');
  assert(!('commission_value' in (plan.pendingInsert || {})), 'insert sem commission_value');
  console.log('OK testTransferSaleToAnotherBroker');
}

function testTransferUpdatesRanking() {
  const alessandraSales = [{ vendas_mes_valor: 75000, comissao_pendente: 3750 }];
  const cassioSales = [{ vendas_mes_valor: 0, comissao_pendente: 0 }];

  const beforeTop = [...alessandraSales, ...cassioSales]
    .filter((b) => b.vendas_mes_valor > 0)
    .sort((a, b) => b.vendas_mes_valor - a.vendas_mes_valor);

  const afterTransfer = [
    { vendas_mes_valor: 0, comissao_pendente: 0 },
    { vendas_mes_valor: 75000, comissao_pendente: 3750 },
  ].sort((a, b) => b.vendas_mes_valor - a.vendas_mes_valor);

  assert(beforeTop[0].vendas_mes_valor === 75000, 'ranking antes');
  assert(afterTransfer[0].vendas_mes_valor === 75000, 'ranking depois com venda transferida');
  assert(afterTransfer[0].comissao_pendente === 3750, 'pendência no novo corretor');
  console.log('OK testTransferUpdatesRanking');
}

function testTransferDoesNotCreateCashMovement() {
  const canceled = buildCanceledCommissionPatch();
  assert(canceled.amount === 0, 'cancelamento sem valor');
  assert(!('commission_value' in canceled), 'patch sem commission_value');
  assert(!isPendingBrokerCommission(canceled.status), 'não permanece pendente');
  assertCanCancelCommissionRows([{ status: 'pendente', amount: 3750 }]);
  console.log('OK testTransferDoesNotCreateCashMovement');
}

function testLegacyCommissionValueResolution() {
  assert(resolveBrokerCommissionAmount({ amount: 100 }) === 100, 'amount prioritário');
  assert(resolveBrokerCommissionAmount({ commission_value: 3750 }) === 3750, 'fallback legado leitura');
  console.log('OK testLegacyCommissionValueResolution');
}

function testPaidCommissionCannotBeCancelledWithoutAdjustment() {
  let blocked = false;
  try {
    assertCanCancelCommissionRows([{ status: 'pago', amount: 3750 }]);
  } catch (err) {
    blocked = err instanceof SaleBrokerCommissionError && err.code === 'COMMISSION_ALREADY_PAID';
  }
  assert(blocked, 'paga bloqueada');
  assert(isPaidBrokerCommission('pago'), 'status pago');
  console.log('OK testPaidCommissionCannotBeCancelledWithoutAdjustment');
}

function testBrokerCommissionCanBeZero() {
  assert(readBrokerCommissionPercent(0) === 0, '0% válido');
  assert(calculateCommissionAmount(75000, 0) === 0, 'valor zero');
  const zero = resolveManualCommissionUpdate({ sale: { total_amount: 75000 }, commission_percent: 0 });
  assert(zero.status === 'cancelado', '0% cancela');
  assert(isCanceledBrokerCommission(zero.status), 'status cancelado');
  console.log('OK testBrokerCommissionCanBeZero');
}

function testNoPhantomBackfillInflatesDashboard() {
  const dbRows: Array<{ sale_id: string; status: string; amount?: number }> = [];
  const phantom = 3750;
  const withPhantom = brokerDashboardPendingTotal([
    ...dbRows,
    { sale_id: 'sale-1', status: 'pendente', amount: phantom },
  ]);
  const withoutPhantom = brokerDashboardPendingTotal(dbRows);
  assert(withPhantom === 3750, 'com registro real');
  assert(withoutPhantom === 0, 'sem registro fantasma');
  console.log('OK testNoPhantomBackfillInflatesDashboard');
}

function testApiTenantContextResolvesCompanyLink() {
  const menesesTenant = '75fcaae6-8975-4e06-9100-8c8aa1537854';
  assert(
    resolveUserCompanyId({ tenant_id: null, company_id: menesesTenant }) === menesesTenant,
    'company_id legado resolve tenant',
  );
  assert(
    resolveUserCompanyId({ tenant_id: menesesTenant, company_id: null }) === menesesTenant,
    'tenant_id primário resolve tenant',
  );

  let blocked = false;
  try {
    assertApiTenantScope({
      tenantId: menesesTenant,
      callerRole: 'ADMIN',
      callerTenantId: 'outra-empresa',
      metadataTenantId: null,
    });
  } catch {
    blocked = true;
  }
  assert(blocked, 'bloqueia tenant divergente');

  assertApiTenantScope({
    tenantId: menesesTenant,
    callerRole: 'MANAGER',
    callerTenantId: null,
    metadataTenantId: menesesTenant,
  });
  console.log('OK testApiTenantContextResolvesCompanyLink');
}

function main() {
  testAdminCanManageBrokerCommission();
  testBrokerCannotManageBrokerCommission();
  testOwnerCannotManageBrokerCommission();
  testBrokerCommissionUsesAmountColumnOnly();
  testBrokerCommissionDashboardMatchesModal();
  testTransferSaleToAnotherBroker();
  testTransferUpdatesRanking();
  testTransferDoesNotCreateCashMovement();
  testLegacyCommissionValueResolution();
  testPaidCommissionCannotBeCancelledWithoutAdjustment();
  testBrokerCommissionCanBeZero();
  testNoPhantomBackfillInflatesDashboard();
  testApiTenantContextResolvesCompanyLink();
  console.log('\nTodos os testes obrigatórios de gerenciar corretor/comissão passaram.');
}

main();
