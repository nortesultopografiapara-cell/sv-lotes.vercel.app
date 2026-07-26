/**
 * Testes obrigatórios — ajuste em massa de broker_commissions.
 * npx tsx scripts/mandatory-broker-commission-bulk-adjust-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  assertBulkAdjustConfirm,
  buildBulkAdjustPreview,
  buildBulkCommissionPatch,
  buildCashOverlapKeySet,
  BULK_ADJUST_AUDIT_ACTION,
  BULK_ADJUST_CONFIRM_APPLY,
  BULK_ADJUST_CONFIRM_ZERO,
  classifyBulkCommissionRow,
  eligibleIdsFromPreview,
  groupEligiblePatches,
  requiredConfirmText,
  type BulkCommissionCandidate,
} from '../lib/brokerCommissionBulkAdjust';
import { canManageSaleBrokerCommission } from '../lib/brokerCommissionAccess';
import { isPendingBrokerCommission } from '../lib/brokerCommission';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function candidate(
  partial: Partial<BulkCommissionCandidate> & { id: string },
): BulkCommissionCandidate {
  return {
    sale_id: 'sale-1',
    broker_id: 'broker-1',
    amount: 3750,
    commission_percent: 5,
    status: 'pendente',
    sale: {
      id: 'sale-1',
      project_id: 'proj-1',
      total_amount: 75000,
      sale_date: '2026-06-01',
      broker_id: 'broker-1',
    },
    broker_name: 'Ivanilde',
    customer_name: 'Cliente',
    project_name: 'Recanto',
    lot_label: 'QD 1 - LT 2',
    sale_date: '2026-06-01',
    ...partial,
  };
}

function testConfirmTexts() {
  assert(requiredConfirmText(0) === BULK_ADJUST_CONFIRM_ZERO, 'confirm zero');
  assert(requiredConfirmText(5) === BULK_ADJUST_CONFIRM_APPLY, 'confirm apply');
  console.log('OK testConfirmTexts');
}

function testConfirmGate() {
  let threw = false;
  try {
    assertBulkAdjustConfirm({ newPercent: 0, confirmed: false, confirmText: BULK_ADJUST_CONFIRM_ZERO });
  } catch {
    threw = true;
  }
  assert(threw, 'exige confirmed');

  threw = false;
  try {
    assertBulkAdjustConfirm({
      newPercent: 0,
      confirmed: true,
      confirmText: 'errado',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'exige texto ZERAR');

  assertBulkAdjustConfirm({
    newPercent: 0,
    confirmed: true,
    confirmText: BULK_ADJUST_CONFIRM_ZERO,
  });
  assertBulkAdjustConfirm({
    newPercent: 3,
    confirmed: true,
    confirmText: BULK_ADJUST_CONFIRM_APPLY,
  });
  console.log('OK testConfirmGate');
}

function testPatchZeroCancels() {
  const patch = buildBulkCommissionPatch({
    sale: { total_amount: 75000 },
    newPercent: 0,
  });
  assert(patch.amount === 0, 'amount 0');
  assert(patch.commission_percent === 0, 'percent 0');
  assert(patch.status === 'cancelado', 'status cancelado');
  console.log('OK testPatchZeroCancels');
}

function testPatchRecalculatesPercent() {
  const patch = buildBulkCommissionPatch({
    sale: { total_amount: 100000 },
    newPercent: 2,
  });
  assert(patch.amount === 2000, '2% de 100k');
  assert(patch.commission_percent === 2, 'percent 2');
  assert(patch.status === 'pendente', 'status pendente');
  console.log('OK testPatchRecalculatesPercent');
}

function testPreviewDoesNotMutateInput() {
  const rows = [candidate({ id: 'c1' })];
  const before = JSON.stringify(rows);
  buildBulkAdjustPreview({
    rows,
    filters: { pendingOnly: true },
    newPercent: 0,
    cashOverlapKeys: new Set(),
  });
  assert(JSON.stringify(rows) === before, 'preview sem mutação');
  console.log('OK testPreviewDoesNotMutateInput');
}

function testEligiblePendingPositive() {
  const row = classifyBulkCommissionRow({
    row: candidate({ id: 'c1' }),
    filters: { pendingOnly: true },
    newPercent: 0,
    cashOverlapKeys: new Set(),
  });
  assert(row.eligible, 'pendente com valor elegível');
  assert(row.new_amount === 0, 'novo amount 0');
  console.log('OK testEligiblePendingPositive');
}

function testPreservePaid() {
  const row = classifyBulkCommissionRow({
    row: candidate({ id: 'c1', status: 'pago', amount: 3750 }),
    filters: { pendingOnly: true },
    newPercent: 0,
    cashOverlapKeys: new Set(),
  });
  assert(!row.eligible && row.ignore_reason === 'paid', 'paga ignorada');
  console.log('OK testPreservePaid');
}

function testPreserveCanceled() {
  const row = classifyBulkCommissionRow({
    row: candidate({ id: 'c1', status: 'cancelado', amount: 0, commission_percent: 0 }),
    filters: { pendingOnly: true },
    newPercent: 0,
    cashOverlapKeys: new Set(),
  });
  assert(!row.eligible, 'cancelada ignorada');
  assert(
    row.ignore_reason === 'canceled' || row.ignore_reason === 'already_zero',
    'motivo cancel/zero',
  );
  console.log('OK testPreserveCanceled');
}

function testPreserveCashOverlap() {
  const keys = buildCashOverlapKeySet([
    {
      sale_id: 'sale-1',
      broker_id: 'broker-1',
      type: 'saida',
      status: 'ativo',
      category: 'Comissão',
      description: 'Pagamento de comissão',
    },
  ]);
  assert(keys.has('sale-1::broker-1'), 'chave cash');
  const row = classifyBulkCommissionRow({
    row: candidate({ id: 'c1' }),
    filters: { pendingOnly: true },
    newPercent: 0,
    cashOverlapKeys: keys,
  });
  assert(!row.eligible && row.ignore_reason === 'cash_overlap', 'cash overlap');
  console.log('OK testPreserveCashOverlap');
}

function testIgnoreEstornadoCash() {
  const keys = buildCashOverlapKeySet([
    {
      sale_id: 'sale-1',
      broker_id: 'broker-1',
      type: 'saida',
      status: 'estornado',
      category: 'Comissão',
    },
  ]);
  assert(keys.size === 0, 'estorno não bloqueia');
  console.log('OK testIgnoreEstornadoCash');
}

function testFilterBroker() {
  const row = classifyBulkCommissionRow({
    row: candidate({ id: 'c1', broker_id: 'broker-2' }),
    filters: { brokerIds: ['broker-1'], pendingOnly: true },
    newPercent: 0,
    cashOverlapKeys: new Set(),
  });
  assert(!row.eligible && row.ignore_reason === 'filter_broker', 'filtro corretor');
  console.log('OK testFilterBroker');
}

function testFilterProject() {
  const row = classifyBulkCommissionRow({
    row: candidate({
      id: 'c1',
      sale: { id: 'sale-1', project_id: 'proj-other', total_amount: 75000, sale_date: '2026-06-01' },
    }),
    filters: { projectId: 'proj-1', pendingOnly: true },
    newPercent: 0,
    cashOverlapKeys: new Set(),
  });
  assert(!row.eligible && row.ignore_reason === 'filter_project', 'filtro projeto');
  console.log('OK testFilterProject');
}

function testFilterDate() {
  const row = classifyBulkCommissionRow({
    row: candidate({ id: 'c1', sale_date: '2025-01-01' }),
    filters: { dateFrom: '2026-01-01', dateTo: '2026-12-31', pendingOnly: true },
    newPercent: 0,
    cashOverlapKeys: new Set(),
  });
  assert(!row.eligible && row.ignore_reason === 'filter_date', 'filtro data');
  console.log('OK testFilterDate');
}

function testAlreadyZeroIdempotent() {
  const row = classifyBulkCommissionRow({
    row: candidate({
      id: 'c1',
      amount: 0,
      commission_percent: 0,
      status: 'pendente',
    }),
    filters: { pendingOnly: true },
    newPercent: 0,
    cashOverlapKeys: new Set(),
  });
  assert(!row.eligible && row.ignore_reason === 'already_zero', 'idempotente 0→0');
  console.log('OK testAlreadyZeroIdempotent');
}

function testPreviewSummaryCounts() {
  const preview = buildBulkAdjustPreview({
    rows: [
      candidate({ id: 'e1' }),
      candidate({ id: 'p1', status: 'pago' }),
      candidate({ id: 'z1', amount: 0, commission_percent: 0 }),
    ],
    filters: { pendingOnly: true },
    newPercent: 0,
    cashOverlapKeys: new Set(),
  });
  assert(preview.eligible_count === 1, '1 elegível');
  assert(preview.ignored_count === 2, '2 ignoradas');
  assert(preview.current_total === 3750, 'total atual');
  assert(preview.new_total === 0, 'total novo 0');
  assert(preview.warnings.length >= 1, 'aviso de pagas');
  assert(eligibleIdsFromPreview(preview).includes('e1'), 'ids elegíveis');
  console.log('OK testPreviewSummaryCounts');
}

function testGroupPatchesAtomicZero() {
  const preview = buildBulkAdjustPreview({
    rows: [
      candidate({ id: 'a', sale_id: 's1', sale: { id: 's1', total_amount: 10000, sale_date: '2026-06-01', project_id: 'proj-1' } }),
      candidate({ id: 'b', sale_id: 's2', sale: { id: 's2', total_amount: 20000, sale_date: '2026-06-01', project_id: 'proj-1' } }),
    ],
    filters: { pendingOnly: true },
    newPercent: 0,
    cashOverlapKeys: new Set(),
  });
  const groups = groupEligiblePatches(preview);
  assert(groups.length === 1, 'um grupo para 0%');
  assert(groups[0].ids.length === 2, 'dois ids');
  assert(groups[0].patch.amount === 0 && groups[0].patch.status === 'cancelado', 'patch zero');
  console.log('OK testGroupPatchesAtomicZero');
}

function testPermissionAdminOnly() {
  assert(canManageSaleBrokerCommission('ADMIN'), 'admin');
  assert(canManageSaleBrokerCommission('SUPER_ADMIN'), 'super');
  assert(canManageSaleBrokerCommission('ADMIN_EMPRESA'), 'admin empresa');
  assert(!canManageSaleBrokerCommission('BROKER'), 'broker bloqueado');
  assert(!canManageSaleBrokerCommission('CORRETOR'), 'corretor bloqueado');
  assert(!canManageSaleBrokerCommission('OWNER'), 'owner bloqueado');
  console.log('OK testPermissionAdminOnly');
}

function testCompanyIsolationFiltersInServiceSource() {
  const service = fs.readFileSync(
    path.join(process.cwd(), 'lib/brokerCommissionBulkService.ts'),
    'utf8',
  );
  assert(service.includes('company_id.eq.'), 'filtra company_id');
  assert(service.includes('tenant_id.eq.'), 'filtra tenant_id');
  assert(
    service.includes('BULK_ADJUST_AUDIT_ACTION') ||
      service.includes('BROKER_COMMISSIONS_BULK_UPDATED'),
    'audit action',
  );
  assert(service.includes("mode === 'preview'"), 'preview mode');
  console.log('OK testCompanyIsolationFiltersInServiceSource');
}

function testApiRouteGates() {
  const route = fs.readFileSync(
    path.join(process.cwd(), 'app/api/brokers/commissions/bulk-adjust/route.ts'),
    'utf8',
  );
  assert(route.includes('canManageSaleBrokerCommission'), 'gate permissão');
  assert(route.includes('assertApiTenantScope'), 'gate tenant');
  assert(route.includes("mode === 'apply'"), 'mode apply');
  console.log('OK testApiRouteGates');
}

function testUiDoesNotAutoApply() {
  const modal = fs.readFileSync(
    path.join(process.cwd(), 'components/brokers/BulkAdjustBrokerCommissionsModal.tsx'),
    'utf8',
  );
  const page = fs.readFileSync(
    path.join(process.cwd(), 'app/dashboard/brokers/page.tsx'),
    'utf8',
  );
  assert(modal.includes("mode: 'preview'"), 'modal gera prévia');
  assert(modal.includes("mode: 'apply'"), 'modal aplica só após confirm');
  assert(
    modal.includes('BULK_ADJUST_CONFIRM_ZERO') ||
      modal.includes('ZERAR COMISSÕES'),
    'texto zerar',
  );
  assert(page.includes('Zerar comissões pendentes'), 'atalho UI');
  assert(page.includes('Ações administrativas'), 'seção admin');
  assert(!page.includes("mode: 'apply'"), 'página não aplica sozinha');
  console.log('OK testUiDoesNotAutoApply');
}

function testDoesNotTouchSalesFinanceContract() {
  const service = fs.readFileSync(
    path.join(process.cwd(), 'lib/brokerCommissionBulkService.ts'),
    'utf8',
  );
  assert(!service.includes(".from('sales').update"), 'não atualiza sales');
  assert(!service.includes(".from('finance_receipts')"), 'não toca parcelas');
  assert(!service.includes(".from('contracts').update"), 'não atualiza contratos');
  assert(service.includes(".from('broker_commissions')"), 'atualiza comissões');
  console.log('OK testDoesNotTouchSalesFinanceContract');
}

function testPendingHelperStillTrueForAliases() {
  assert(isPendingBrokerCommission('pendente'), 'pendente');
  assert(isPendingBrokerCommission('PENDING'), 'PENDING');
  assert(!isPendingBrokerCommission('pago'), 'pago não pendente');
  console.log('OK testPendingHelperStillTrueForAliases');
}

function main() {
  testConfirmTexts();
  testConfirmGate();
  testPatchZeroCancels();
  testPatchRecalculatesPercent();
  testPreviewDoesNotMutateInput();
  testEligiblePendingPositive();
  testPreservePaid();
  testPreserveCanceled();
  testPreserveCashOverlap();
  testIgnoreEstornadoCash();
  testFilterBroker();
  testFilterProject();
  testFilterDate();
  testAlreadyZeroIdempotent();
  testPreviewSummaryCounts();
  testGroupPatchesAtomicZero();
  testPermissionAdminOnly();
  testCompanyIsolationFiltersInServiceSource();
  testApiRouteGates();
  testUiDoesNotAutoApply();
  testDoesNotTouchSalesFinanceContract();
  testPendingHelperStillTrueForAliases();
  console.log('\nALL mandatory-broker-commission-bulk-adjust-tests PASSED');
}

main();
