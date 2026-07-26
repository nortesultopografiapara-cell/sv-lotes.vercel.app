/**
 * Testes obrigatórios — modelos de comissão PERCENT | FIXED | NONE.
 * npx tsx scripts/mandatory-broker-commission-modes-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  buildBrokerDefaultCommissionFields,
  buildCommissionSnapshotFields,
  calculateBrokerCommissionPlan,
  commissionModeLabel,
  formatBrokerCommissionPreview,
  inferModeFromCommissionRow,
  normalizeBrokerCommissionMode,
  resolveBrokerDefaultCommissionPlan,
  resolveSaleCommissionPlan,
  shouldCreatePendingCommissionFromPlan,
} from '../lib/brokerCommissionMode';
import {
  buildBulkAdjustPreview,
  buildBulkCommissionPatch,
  requiredConfirmText,
  BULK_ADJUST_CONFIRM_APPLY,
  BULK_ADJUST_CONFIRM_ZERO,
} from '../lib/brokerCommissionBulkAdjust';
import {
  brokerDashboardPendingTotal,
  calculateCommissionAmount,
} from '../lib/brokerCommission';
import { canManageSaleBrokerCommission } from '../lib/brokerCommissionAccess';
import {
  buildPendingCommissionInsert,
  resolveManualCommissionUpdate,
  resolveTransferCommissionPlan,
} from '../lib/saleBrokerCommissionManage';
import { BROKER_COMMISSION_API_SELECT } from '../lib/brokerCommissionSchema';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testNormalizeModeCompat() {
  assert(normalizeBrokerCommissionMode(null) === 'PERCENT', 'null → PERCENT');
  assert(normalizeBrokerCommissionMode('') === 'PERCENT', 'vazio → PERCENT');
  assert(normalizeBrokerCommissionMode('FIXED') === 'FIXED', 'FIXED');
  assert(normalizeBrokerCommissionMode('NONE') === 'NONE', 'NONE');
  console.log('OK testNormalizeModeCompat');
}

function testBrokerCadastroPercent() {
  const fields = buildBrokerDefaultCommissionFields({
    mode: 'PERCENT',
    percent: 5,
  });
  assert(fields.commission_mode === 'PERCENT', 'mode');
  assert(fields.commission_percent === 5, 'percent');
  assert(fields.commission_fixed_amount === null, 'sem fixo');
  console.log('OK testBrokerCadastroPercent');
}

function testBrokerCadastroFixed() {
  const fields = buildBrokerDefaultCommissionFields({
    mode: 'FIXED',
    fixedAmount: 1000,
  });
  assert(fields.commission_mode === 'FIXED', 'mode');
  assert(fields.commission_percent === 0, 'percent 0');
  assert(fields.commission_fixed_amount === 1000, 'fixo 1000');
  console.log('OK testBrokerCadastroFixed');
}

function testBrokerCadastroNone() {
  const fields = buildBrokerDefaultCommissionFields({ mode: 'NONE' });
  assert(fields.commission_mode === 'NONE', 'mode');
  assert(fields.commission_percent === 0, 'percent 0');
  console.log('OK testBrokerCadastroNone');
}

function testEditBetweenModes() {
  const p = buildBrokerDefaultCommissionFields({ mode: 'PERCENT', percent: 3 });
  const f = buildBrokerDefaultCommissionFields({ mode: 'FIXED', fixedAmount: 500 });
  const n = buildBrokerDefaultCommissionFields({ mode: 'NONE' });
  assert(p.commission_mode === 'PERCENT' && f.commission_mode === 'FIXED', 'edit');
  assert(n.commission_mode === 'NONE', 'none');
  console.log('OK testEditBetweenModes');
}

function testNewSaleInheritsPercent() {
  const plan = resolveSaleCommissionPlan({
    broker: { commission_mode: 'PERCENT', commission_percent: 5 },
    useBrokerDefault: true,
    saleValue: 73296.99,
  });
  assert(plan.mode === 'PERCENT', 'mode');
  assert(plan.amount === calculateCommissionAmount(73296.99, 5), 'amount');
  console.log('OK testNewSaleInheritsPercent');
}

function testNewSaleInheritsFixed() {
  const plan = resolveSaleCommissionPlan({
    broker: {
      commission_mode: 'FIXED',
      commission_fixed_amount: 1000,
      commission_percent: 5,
    },
    useBrokerDefault: true,
    saleValue: 73296.99,
  });
  assert(plan.mode === 'FIXED', 'mode');
  assert(plan.amount === 1000, 'amount fixo independente da venda');
  console.log('OK testNewSaleInheritsFixed');
}

function testSaleManualOverride() {
  const plan = resolveSaleCommissionPlan({
    broker: { commission_mode: 'PERCENT', commission_percent: 5 },
    useBrokerDefault: false,
    saleCommissionMode: 'FIXED',
    saleCommissionFixedAmount: 2500,
    saleValue: 100000,
  });
  assert(plan.mode === 'FIXED' && plan.amount === 2500, 'override fixo');
  console.log('OK testSaleManualOverride');
}

function testOldSaleSnapshotIndependentOfBrokerEdit() {
  const snapshot = buildCommissionSnapshotFields(
    calculateBrokerCommissionPlan({
      mode: 'PERCENT',
      percent: 5,
      saleValue: 100000,
    }),
  );
  const brokerAfterEdit = buildBrokerDefaultCommissionFields({
    mode: 'FIXED',
    fixedAmount: 1,
  });
  assert(snapshot.amount === 5000, 'snapshot amount');
  assert(snapshot.commission_mode === 'PERCENT', 'snapshot mode');
  assert(brokerAfterEdit.commission_mode === 'FIXED', 'cadastro mudou');
  assert(snapshot.amount !== brokerAfterEdit.commission_fixed_amount, 'não herda edit');
  console.log('OK testOldSaleSnapshotIndependentOfBrokerEdit');
}

function testPercentCalculatesCorrectly() {
  const plan = calculateBrokerCommissionPlan({
    mode: 'PERCENT',
    percent: 5,
    saleValue: 73296.99,
  });
  assert(plan.amount === 3664.85, `got ${plan.amount}`);
  assert(plan.calculationBase === 73296.99, 'base');
  console.log('OK testPercentCalculatesCorrectly');
}

function testFixedKeepsExactValue() {
  const plan = calculateBrokerCommissionPlan({
    mode: 'FIXED',
    fixedAmount: 1000.5,
    saleValue: 999999,
  });
  assert(plan.amount === 1000.5, 'valor exato');
  console.log('OK testFixedKeepsExactValue');
}

function testNoneGeneratesZero() {
  const plan = calculateBrokerCommissionPlan({
    mode: 'NONE',
    saleValue: 100000,
  });
  assert(plan.amount === 0, 'zero');
  assert(!shouldCreatePendingCommissionFromPlan(plan), 'não cria pendente');
  console.log('OK testNoneGeneratesZero');
}

function testBrokerCommissionsAmountCorrect() {
  const insert = buildPendingCommissionInsert({
    tenantId: 't1',
    brokerId: 'b1',
    saleId: 's1',
    saleValue: 100000,
    commissionMode: 'FIXED',
    commissionFixedAmount: 1000,
  });
  assert(insert != null, 'insert');
  assert(insert!.amount === 1000, 'amount');
  assert(insert!.commission_mode === 'FIXED', 'mode');
  assert(insert!.commission_fixed_amount === 1000, 'fixed');
  console.log('OK testBrokerCommissionsAmountCorrect');
}

function testDashboardUsesAmount() {
  const total = brokerDashboardPendingTotal([
    { status: 'pendente', amount: 1000, commission_percent: 0 },
    { status: 'pendente', amount: 3664.85, commission_percent: 5 },
  ]);
  assert(total === 4664.85, `dashboard ${total}`);
  console.log('OK testDashboardUsesAmount');
}

function testRankingDoesNotAssumePercent() {
  const rows = [
    { status: 'pendente', amount: 1000, commission_percent: 0, commission_mode: 'FIXED' },
  ];
  assert(brokerDashboardPendingTotal(rows) === 1000, 'ranking base amount');
  assert(inferModeFromCommissionRow(rows[0]) === 'FIXED', 'identifica fixa');
  assert(commissionModeLabel('FIXED') === 'Valor fixo', 'label');
  console.log('OK testRankingDoesNotAssumePercent');
}

function testReportsIdentifyModes() {
  assert(formatBrokerCommissionPreview(
    calculateBrokerCommissionPlan({ mode: 'PERCENT', percent: 5, saleValue: 100 }),
  ).modelLabel.includes('5%'), 'relatório %');
  assert(
    formatBrokerCommissionPreview(
      calculateBrokerCommissionPlan({ mode: 'FIXED', fixedAmount: 10, saleValue: 100 }),
    ).modelLabel.includes('fixo'),
    'relatório fixo',
  );
  assert(
    formatBrokerCommissionPreview(
      calculateBrokerCommissionPlan({ mode: 'NONE', saleValue: 100 }),
    ).modelLabel.includes('Sem'),
    'relatório none',
  );
  console.log('OK testReportsIdentifyModes');
}

function testCashFlowUsesAmountSource() {
  const patch = resolveManualCommissionUpdate({
    sale: { agreed_price: 50000 },
    commission_mode: 'FIXED',
    fixed_amount: 800,
  });
  assert(patch.amount === 800 && patch.status === 'pendente', 'caixa pendente');
  console.log('OK testCashFlowUsesAmountSource');
}

function testPaidCommissionPreservedSemantics() {
  // Snapshot amount é a fonte; editar cadastro não recalcula histórico.
  const legacy = inferModeFromCommissionRow({
    commission_mode: null,
    commission_percent: 5,
    amount: 2500,
  });
  assert(legacy === 'PERCENT', 'legado = PERCENT');
  console.log('OK testPaidCommissionPreservedSemantics');
}

function testBulkAdjustAcceptsFixed() {
  const patch = buildBulkCommissionPatch({
    sale: { agreed_price: 75000 },
    target: { mode: 'FIXED', fixedAmount: 1000 },
  });
  assert(patch.commission_mode === 'FIXED', 'mode');
  assert(patch.amount === 1000, 'amount');
  assert(patch.status === 'pendente', 'pendente');
  assert(requiredConfirmText({ mode: 'FIXED', fixedAmount: 1000 }) === BULK_ADJUST_CONFIRM_APPLY);
  assert(requiredConfirmText({ mode: 'NONE' }) === BULK_ADJUST_CONFIRM_ZERO);

  const preview = buildBulkAdjustPreview({
    rows: [
      {
        id: 'c1',
        sale_id: 's1',
        broker_id: 'b1',
        amount: 3750,
        commission_percent: 5,
        status: 'pendente',
        sale: { id: 's1', agreed_price: 75000, sale_date: '2026-06-01', project_id: 'p1' },
      },
    ],
    filters: { pendingOnly: true },
    target: { mode: 'FIXED', fixedAmount: 1000 },
    cashOverlapKeys: new Set(),
  });
  assert(preview.eligible_count === 1, 'elegível');
  assert(preview.rows[0].new_mode === 'FIXED', 'novo mode');
  assert(preview.rows[0].new_amount === 1000, 'novo amount');
  assert(preview.difference_total === 1000 - 3750, 'diferença');
  console.log('OK testBulkAdjustAcceptsFixed');
}

function testMultiempresaIsolationInSources() {
  const service = fs.readFileSync(
    path.join(process.cwd(), 'lib/brokerCommissionBulkService.ts'),
    'utf8',
  );
  const gis = fs.readFileSync(
    path.join(process.cwd(), 'lib/gisSaleCreateService.ts'),
    'utf8',
  );
  assert(service.includes('company_id.eq.'), 'bulk tenant');
  assert(gis.includes('buildCommissionSnapshotFields'), 'gis snapshot');
  assert(gis.includes('resolveSaleCommissionPlan'), 'gis plan');
  console.log('OK testMultiempresaIsolationInSources');
}

function testPermissionGateUnchanged() {
  assert(canManageSaleBrokerCommission('ADMIN'), 'admin');
  assert(!canManageSaleBrokerCommission('BROKER'), 'broker bloqueado');
  console.log('OK testPermissionGateUnchanged');
}

function testLegacyWithoutModeIsPercent() {
  const defaults = resolveBrokerDefaultCommissionPlan({
    commission_percent: 4,
  });
  assert(defaults.mode === 'PERCENT' && defaults.percent === 4, 'legado corretor');
  const transfer = resolveTransferCommissionPlan({
    sale: { id: 's1', tenant_id: 't1', agreed_price: 10000 },
    targetBroker: { id: 'b1', commission_percent: 4 },
  });
  assert(transfer.pendingInsert?.commission_mode === 'PERCENT', 'transfer legado');
  assert(transfer.pendingInsert?.amount === 400, '4% de 10k');
  console.log('OK testLegacyWithoutModeIsPercent');
}

function testSchemaSelectIncludesModeColumns() {
  assert(BROKER_COMMISSION_API_SELECT.includes('commission_mode'), 'mode');
  assert(BROKER_COMMISSION_API_SELECT.includes('commission_fixed_amount'), 'fixed');
  assert(BROKER_COMMISSION_API_SELECT.includes('calculation_base'), 'base');
  assert(BROKER_COMMISSION_API_SELECT.includes('amount'), 'amount');
  console.log('OK testSchemaSelectIncludesModeColumns');
}

function testUiBrokerFormHasModeSelector() {
  const page = fs.readFileSync(
    path.join(process.cwd(), 'app/dashboard/brokers/page.tsx'),
    'utf8',
  );
  assert(page.includes('Tipo de Comissão Padrão'), 'label tipo');
  assert(page.includes('Valor fixo por venda'), 'campo fixo');
  assert(page.includes('Sem comissão'), 'opção none');
  const modal = fs.readFileSync(
    path.join(process.cwd(), 'components/map/CustomerLotFormModal.tsx'),
    'utf8',
  );
  assert(modal.includes('Usar comissão padrão do corretor'), 'checkbox venda');
  assert(modal.includes('Comissão desta venda'), 'prévia');
  console.log('OK testUiBrokerFormHasModeSelector');
}

function testMigrationExists() {
  const mig = path.join(
    process.cwd(),
    'supabase/migrations/20260726190000_broker_commission_modes.sql',
  );
  const apply = path.join(
    process.cwd(),
    'supabase/migrations/_APPLY_PROD_broker_commission_modes.sql',
  );
  assert(fs.existsSync(mig), 'migration');
  assert(fs.existsSync(apply), 'apply preview');
  const sql = fs.readFileSync(mig, 'utf8');
  assert(sql.includes('commission_mode'), 'coluna mode');
  assert(sql.includes("SET commission_mode = 'PERCENT'"), 'backfill');
  assert(!sql.includes('DROP TABLE'), 'não dropa');
  console.log('OK testMigrationExists');
}

function main() {
  testNormalizeModeCompat();
  testBrokerCadastroPercent();
  testBrokerCadastroFixed();
  testBrokerCadastroNone();
  testEditBetweenModes();
  testNewSaleInheritsPercent();
  testNewSaleInheritsFixed();
  testSaleManualOverride();
  testOldSaleSnapshotIndependentOfBrokerEdit();
  testPercentCalculatesCorrectly();
  testFixedKeepsExactValue();
  testNoneGeneratesZero();
  testBrokerCommissionsAmountCorrect();
  testDashboardUsesAmount();
  testRankingDoesNotAssumePercent();
  testReportsIdentifyModes();
  testCashFlowUsesAmountSource();
  testPaidCommissionPreservedSemantics();
  testBulkAdjustAcceptsFixed();
  testMultiempresaIsolationInSources();
  testPermissionGateUnchanged();
  testLegacyWithoutModeIsPercent();
  testSchemaSelectIncludesModeColumns();
  testUiBrokerFormHasModeSelector();
  testMigrationExists();
  console.log('\nALL mandatory-broker-commission-modes-tests PASSED');
}

main();
