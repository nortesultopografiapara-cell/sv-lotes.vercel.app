/**
 * Testes obrigatórios — Fluxo de Caixa Corporativo Master (Fase 6.3).
 * npx tsx scripts/mandatory-master-corporate-finance-cash-tests.ts
 */
import fs from 'fs';
import path from 'path';
import { assertCorporateFinanceAccess } from '../lib/master/corporateFinance/service';
import {
  pnlCashEffect,
  signedCashEffect,
} from '../lib/master/corporateFinance/cashMath';
import {
  validateManualCashMovementInput,
  validateTransferInput,
} from '../lib/master/corporateFinance/cashValidation';
import { roundMoney } from '../lib/master/corporateFinance/arApMath';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

function testIsolationAndFiles() {
  assert(
    exists('supabase/migrations/20260722190000_master_corporate_cash_movements.sql'),
    'migration cash',
  );
  assert(exists('lib/master/corporateFinance/cashTypes.ts'), 'cashTypes');
  assert(exists('lib/master/corporateFinance/cashMath.ts'), 'cashMath');
  assert(exists('lib/master/corporateFinance/cashMovementsService.ts'), 'cash service');
  assert(exists('lib/master/corporateFinance/cashValidation.ts'), 'cash validation');
  assert(exists('app/api/master/corporate-finance/cash-movements/route.ts'), 'cash API');
  assert(
    exists('app/api/master/corporate-finance/cash-movements/backfill/route.ts'),
    'backfill API',
  );
  assert(
    exists('app/api/master/corporate-finance/cash-movements/transfer/route.ts'),
    'transfer API',
  );
  assert(
    exists('app/api/master/corporate-finance/cash-movements/monthly/route.ts'),
    'monthly API',
  );
  assert(exists('components/master/corporateFinance/CorporateCashFlowPage.tsx'), 'cash UI');
  assert(!exists('app/api/finance/corporate-cash/route.ts'), 'sem API tenant cash');

  const migration = read(
    'supabase/migrations/20260722190000_master_corporate_cash_movements.sql',
  );
  assert(migration.includes('master_corporate_cash_movements'), 'tabela movimentos');
  assert(migration.includes('generate_next_corporate_cash_movement_code'), 'RPC MOV');
  assert(migration.includes('MOV-'), 'código MOV');
  assert(migration.includes('is_super_admin()'), 'RLS');
  assert(migration.includes('idempotency_key'), 'idempotency');
  assert(migration.includes('LEGACY_PROJECT_RECEIVED'), 'origem legado preparada');
  assert(migration.includes("'ASAAS'"), 'origem ASAAS preparada');
  const noComments = migration.replace(/--[^\n]*/g, '');
  assert(!noComments.includes('saas_cash_movements'), 'sem saas_cash');
  assert(!/\bcash_movements\b/.test(noComments.replace(/master_corporate_cash_movements/g, '')), 'sem cash_movements tenant');

  const recv = read('lib/master/corporateFinance/receivablesService.ts');
  assert(recv.includes('createMovementFromReceivablePayment'), 'receive cria movimento');
  assert(recv.includes('reverseCashMovementForPayment'), 'estorno AR reverte caixa');

  const pay = read('lib/master/corporateFinance/payablesService.ts');
  assert(pay.includes('createMovementFromPayablePayment'), 'pay cria movimento');
  assert(pay.includes('reverseCashMovementForPayment'), 'estorno AP reverte caixa');

  const nav = read('lib/master/executiveNav.ts');
  const cashBlock = nav.slice(
    nav.indexOf("name: 'Fluxo de Caixa'"),
    nav.indexOf("name: 'Contas a Pagar'"),
  );
  assert(!cashBlock.includes('comingSoon: true'), 'Fluxo sem Em breve');

  const recon = nav.slice(
    nav.indexOf("name: 'Extratos e Conciliação'"),
    nav.indexOf("label: 'CONFIGURAÇÕES'"),
  );
  assert(recon.includes('comingSoon: true'), 'Conciliação Em breve');

  const hub = read('components/master/corporateFinance/CorporateFinanceHubPage.tsx');
  assert(!hub.includes('virá nas próximas fases'), 'hub sem texto antigo fluxo');
  assert(hub.includes('cashMonthIncome'), 'hub entradas mês');
  assert(hub.includes('/master/corporate-finance/cash-flow'), 'hub link fluxo');

  const cashPage = read('app/master/corporate-finance/cash-flow/page.tsx');
  assert(!cashPage.includes('MasterModulePlaceholder'), 'fluxo sem placeholder');

  const dash = read('components/master/dashboard/MasterExecutiveDashboard.tsx');
  const topoChart = dash.slice(
    dash.indexOf('SV Topografia e Projetos'),
    dash.indexOf('Empresas recentes'),
  );
  assert(!topoChart.includes('forceEmpty'), 'gráfico topografia conectado');

  const saasChart = dash.slice(
    dash.indexOf('SV LOTES'),
    dash.indexOf('SV Topografia e Projetos'),
  );
  assert(saasChart.includes('saasMonthlyFinancials'), 'gráfico SV LOTES intacto');

  const dashData = read('lib/masterDashboardData.ts');
  assert(
    dashData.includes('aggregateCorporateCashMonthlyRevenueExpense'),
    'agregação mensal no dashboard',
  );
  assert(dashData.includes('aggregateSaasCashMonthlyRevenueExpense'), 'saas intacto');

  // Isolamento tenant
  assert(!recv.includes('company_cash_movements'), 'AR sem company_cash');
  assert(!pay.includes('saas_cash_movements'), 'AP sem saas_cash');
  assert(!exists('app/api/master/corporate-finance/asaas/route.ts'), 'Asaas 6.3 não');

  const projectDetail = read(
    'components/master/topography/projects/TopographyProjectDetailPage.tsx',
  );
  assert(projectDetail.includes('valor_recebido'), 'valor_recebido preservado');

  const cashSvc = read('lib/master/corporateFinance/cashMovementsService.ts');
  assert(!cashSvc.includes('valor_recebido'), 'cash sem bridge valor_recebido');
  assert(cashSvc.includes('BACKFILL_RECEIVABLE'), 'backfill AR');
  assert(cashSvc.includes('dryRun'), 'dry-run backfill');
}

function testAccessRoles() {
  assert(assertCorporateFinanceAccess({ userId: 'u1' }).ok, '1 SUPER path ok');
  assert(!assertCorporateFinanceAccess({ userId: null }).ok, 'sem userId');
  assert(
    !assertCorporateFinanceAccess({
      userId: 'u1',
      impersonatingTenantId: 'tenant-1',
    }).ok,
    '6 impersonation bloqueada',
  );
}

function testMathEffects() {
  assert(
    signedCashEffect({ type: 'INCOME', amount: 4000, is_reversed: false }) === 4000,
    'entrada +',
  );
  assert(
    signedCashEffect({ type: 'EXPENSE', amount: 800, is_reversed: false }) === -800,
    'saída -',
  );
  assert(
    signedCashEffect({ type: 'TRANSFER_IN', amount: 100, is_reversed: false }) === 100,
    'transf in',
  );
  assert(
    signedCashEffect({ type: 'TRANSFER_OUT', amount: 100, is_reversed: false }) === -100,
    'transf out',
  );
  assert(
    signedCashEffect({
      type: 'REVERSAL',
      amount: 4000,
      is_reversed: false,
      notes: '[REV:INCOME] motivo',
    }) === -4000,
    'estorno entrada',
  );
  assert(
    signedCashEffect({ type: 'INCOME', amount: 10, is_reversed: true }) === 0,
    'estornado ignora',
  );

  const pnlIn = pnlCashEffect({ type: 'INCOME', amount: 4000, is_reversed: false });
  const pnlOut = pnlCashEffect({ type: 'EXPENSE', amount: 800, is_reversed: false });
  const pnlT = pnlCashEffect({ type: 'TRANSFER_IN', amount: 100, is_reversed: false });
  assert(pnlIn.income === 4000 && pnlIn.expense === 0, 'pnl income');
  assert(pnlOut.income === 0 && pnlOut.expense === 800, 'pnl expense');
  assert(pnlT.income === 0 && pnlT.expense === 0, '25 transferência fora de R×D');

  const previewNet = roundMoney(4000 - 800);
  assert(previewNet === 3200, '31 preview 4000-800=3200');
}

function testValidation() {
  const income = validateManualCashMovementInput({
    type: 'INCOME',
    movement_date: '2026-07-20',
    competence_date: '2026-07-20',
    description: 'Entrada teste',
    amount: 100,
    financial_account_id: 'acc-1',
    category_id: 'cat-1',
    payment_method: 'PIX',
  });
  assert(income.type === 'INCOME', '13 entrada manual valida');

  const expense = validateManualCashMovementInput({
    type: 'EXPENSE',
    movement_date: '2026-07-20',
    competence_date: '2026-07-20',
    description: 'Despesa teste',
    amount: 50,
    financial_account_id: 'acc-1',
    category_id: 'cat-2',
  });
  assert(expense.type === 'EXPENSE', '14 despesa manual valida');

  let threw = false;
  try {
    validateManualCashMovementInput({
      type: 'INCOME',
      movement_date: '2026-07-20',
      description: 'X',
      amount: 0,
      financial_account_id: 'a',
      category_id: 'c',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'valor zero bloqueado');

  const tr = validateTransferInput({
    from_account_id: 'a1',
    to_account_id: 'a2',
    movement_date: '2026-07-20',
    amount: 200,
  });
  assert(tr.from_account_id !== tr.to_account_id, '17 contas distintas');

  threw = false;
  try {
    validateTransferInput({
      from_account_id: 'a1',
      to_account_id: 'a1',
      movement_date: '2026-07-20',
      amount: 10,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'mesma conta bloqueada');
}

function testIdempotencyKeys() {
  const svc = read('lib/master/corporateFinance/cashMovementsService.ts');
  assert(svc.includes('RECEIVABLE_PAYMENT:'), '7/9 key recebimento');
  assert(svc.includes('PAYABLE_PAYMENT:'), '8/9 key pagamento');
  assert(svc.includes('REVERSAL:'), '21 key estorno');
  assert(svc.includes('TRANSFER_OUT:'), '17 transfer pair');
  assert(svc.includes('TRANSFER_IN:'), '17 transfer pair in');
}

function main() {
  console.log('=== Fase 6.3 cash tests ===');
  testIsolationAndFiles();
  console.log('OK isolation/files');
  testAccessRoles();
  console.log('OK access');
  testMathEffects();
  console.log('OK math');
  testValidation();
  console.log('OK validation');
  testIdempotencyKeys();
  console.log('OK idempotency keys');
  console.log('ALL PASS');
}

main();
