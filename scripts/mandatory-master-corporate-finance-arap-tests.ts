/**
 * Testes obrigatórios — Contas a Receber/Pagar Master (Fase 6.2).
 * npx tsx scripts/mandatory-master-corporate-finance-arap-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  computeNetAmount,
  computePayableStatus,
  computeReceivableStatus,
  isLinkableQuoteStatus,
  roundMoney,
} from '../lib/master/corporateFinance/arApMath';
import {
  validatePayableInput,
  validateReceivableInput,
  validateSettlementInput,
} from '../lib/master/corporateFinance/arApValidation';
import { assertCorporateFinanceAccess } from '../lib/master/corporateFinance/service';

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

function testFilesIsolation() {
  assert(
    exists('supabase/migrations/20260722180000_master_corporate_receivables_payables.sql'),
    'migration 6.2',
  );
  assert(exists('lib/master/corporateFinance/receivablesService.ts'), 'receivables service');
  assert(exists('lib/master/corporateFinance/payablesService.ts'), 'payables service');
  assert(exists('app/api/master/corporate-finance/receivables/route.ts'), 'AR API');
  assert(exists('app/api/master/corporate-finance/payables/route.ts'), 'AP API');
  assert(exists('app/api/master/corporate-finance/receivables/[id]/receive/route.ts'), 'receive');
  assert(exists('app/api/master/corporate-finance/payables/[id]/pay/route.ts'), 'pay');
  assert(exists('components/master/corporateFinance/CorporateReceivablesPage.tsx'), 'AR UI');
  assert(exists('components/master/corporateFinance/CorporatePayablesPage.tsx'), 'AP UI');

  assert(!exists('app/api/finance/corporate-receivables/route.ts'), 'sem API tenant');
  assert(!exists('app/api/corporate-finance/receivables/route.ts'), 'sem API fora master');

  const mig = read('supabase/migrations/20260722180000_master_corporate_receivables_payables.sql');
  assert(mig.includes('master_corporate_receivables'), 'tabela AR');
  assert(mig.includes('master_corporate_receivable_payments'), 'pagamentos AR');
  assert(mig.includes('master_corporate_payables'), 'tabela AP');
  assert(mig.includes('master_corporate_payable_payments'), 'pagamentos AP');
  assert(mig.includes('generate_next_corporate_receivable_code'), 'RPC REC');
  assert(mig.includes('generate_next_corporate_payable_code'), 'RPC PAG');
  assert(mig.includes('is_super_admin()'), 'RLS');
  assert(mig.includes('idempotency_key'), 'idempotência');
  const migNoComments = mig.replace(/--[^\n]*/g, '');
  assert(!migNoComments.includes('cash_movements'), 'sem cash_movements');
  assert(!migNoComments.includes('finance_receipts'), 'sem finance_receipts');
  assert(!migNoComments.includes('valor_recebido'), 'sem bridge valor_recebido');
  assert(!migNoComments.includes('saas_cash'), 'sem saas cash');

  // 6.3/6.4 não iniciadas
  assert(!exists('app/api/master/corporate-finance/movements/route.ts'), '6.3 não');
  assert(!exists('lib/master/corporateFinance/cashMovementsService.ts'), '6.3 cash não');

  const nav = read('lib/master/executiveNav.ts');
  const arBlock = nav.slice(
    nav.indexOf("name: 'Contas a Receber'"),
    nav.indexOf("name: 'Extratos e Conciliação'"),
  );
  assert(!arBlock.includes('comingSoon: true'), 'AR sem Em breve');
  const apBlock = nav.slice(
    nav.indexOf("name: 'Contas a Pagar'"),
    nav.indexOf("name: 'Contas a Receber'"),
  );
  assert(!apBlock.includes('comingSoon: true'), 'AP sem Em breve');
  const cashBlock = nav.slice(
    nav.indexOf("name: 'Fluxo de Caixa'"),
    nav.indexOf("name: 'Contas a Pagar'"),
  );
  assert(cashBlock.includes('comingSoon: true'), 'Fluxo ainda Em breve');

  const projectDetail = read(
    'components/master/topography/projects/TopographyProjectDetailPage.tsx',
  );
  assert(projectDetail.includes('valor_recebido'), 'valor_recebido preservado');
  assert(
    projectDetail.includes('/master/corporate-finance/receivables?projectId='),
    'link AR projeto',
  );
  assert(
    projectDetail.includes('/master/corporate-finance/payables?projectId='),
    'link AP projeto',
  );

  const recvSvc = read('lib/master/corporateFinance/receivablesService.ts');
  assert(!recvSvc.includes('cash_movements'), 'AR service sem caixa');
  assert(!recvSvc.includes('valor_recebido'), 'AR service sem valor_recebido');
}

function testAccessRoles() {
  assert(assertCorporateFinanceAccess({ userId: 'u1' }).ok, 'SUPER path ok com userId');
  assert(!assertCorporateFinanceAccess({ userId: null }).ok, 'sem userId');
  assert(
    !assertCorporateFinanceAccess({ userId: 'u1', impersonatingTenantId: 't1' }).ok,
    'impersonation bloqueada',
  );

  const guard = read('components/master/corporateFinance/CorporateFinanceGuard.tsx');
  assert(guard.includes("role !== 'SUPER_ADMIN'"), 'UI bloqueia não SUPER_ADMIN');
  assert(guard.includes('impersonat'), 'UI bloqueia impersonation');

  // APIs usam assertSuperAdmin — ADMIN/OWNER/BROKER/CUSTOMER bloqueados no server
  const api = read('app/api/master/corporate-finance/receivables/route.ts');
  assert(api.includes('authorizeCorporateFinance'), 'API AR auth');
  const apiPay = read('app/api/master/corporate-finance/payables/route.ts');
  assert(apiPay.includes('authorizeCorporateFinance'), 'API AP auth');
}

function testMathAndStatus() {
  const net = computeNetAmount({
    original_amount: 1000,
    discount_amount: 100,
    interest_amount: 50,
    fine_amount: 10,
  });
  assert(net === 960, `net=${net}`);

  assert(
    computeReceivableStatus({
      net_amount: 100,
      received_amount: 40,
      due_date: '2099-01-01',
      is_archived: false,
      canceled_at: null,
    }) === 'PARTIAL',
    'parcial',
  );
  assert(
    computeReceivableStatus({
      net_amount: 100,
      received_amount: 100,
      due_date: '2020-01-01',
      is_archived: false,
      canceled_at: null,
    }) === 'RECEIVED',
    'recebido total',
  );
  assert(
    computeReceivableStatus({
      net_amount: 100,
      received_amount: 0,
      due_date: '2020-01-01',
      is_archived: false,
      canceled_at: null,
      today: '2026-07-22',
    }) === 'OVERDUE',
    'vencido',
  );
  assert(
    computeReceivableStatus({
      net_amount: 100,
      received_amount: 0,
      due_date: '2020-01-01',
      is_archived: false,
      canceled_at: '2026-01-01',
    }) === 'CANCELED',
    'cancelado não vencido',
  );

  assert(
    computePayableStatus({
      net_amount: 200,
      paid_amount: 200,
      due_date: '2020-01-01',
      is_archived: false,
      canceled_at: null,
    }) === 'PAID',
    'pago',
  );
  assert(
    computePayableStatus({
      net_amount: 200,
      paid_amount: 50,
      due_date: '2099-01-01',
      is_archived: false,
      canceled_at: null,
    }) === 'PARTIAL',
    'pagamento parcial',
  );

  assert(isLinkableQuoteStatus('APROVADO'), 'quote aprovado');
  assert(isLinkableQuoteStatus('CONVERTIDO'), 'quote convertido');
  assert(!isLinkableQuoteStatus('RASCUNHO'), 'quote rascunho não');
}

function testValidation() {
  const ar = validateReceivableInput({
    description: 'Serviço topográfico',
    customer_name: 'Cliente X',
    category_id: '11111111-1111-1111-1111-111111111111',
    issue_date: '2026-07-01',
    competence_date: '2026-07-01',
    due_date: '2026-07-15',
    original_amount: 1500,
    discount_amount: 0,
    interest_amount: 0,
    fine_amount: 0,
  });
  assert(ar.customer_name === 'Cliente X', 'AR customer');

  const ap = validatePayableInput({
    description: 'Combustível',
    supplier_name: 'Posto Y',
    category_id: '22222222-2222-2222-2222-222222222222',
    issue_date: '2026-07-01',
    competence_date: '2026-07-01',
    due_date: '2026-07-10',
    original_amount: 300,
  });
  assert(ap.supplier_name === 'Posto Y', 'AP supplier');

  let neg = false;
  try {
    validateSettlementInput({
      financial_account_id: '33333333-3333-3333-3333-333333333333',
      payment_date: '2026-07-05',
      amount: -10,
      payment_method: 'PIX',
    });
  } catch {
    neg = true;
  }
  assert(neg, 'valor negativo bloqueado');

  let zero = false;
  try {
    validateSettlementInput({
      financial_account_id: '33333333-3333-3333-3333-333333333333',
      payment_date: '2026-07-05',
      amount: 0,
      payment_method: 'PIX',
    });
  } catch {
    zero = true;
  }
  assert(zero, 'valor zero bloqueado');

  const ok = validateSettlementInput({
    financial_account_id: '33333333-3333-3333-3333-333333333333',
    payment_date: '2026-07-05',
    amount: 50.5,
    payment_method: 'PIX',
    idempotency_key: 'key-1',
  });
  assert(ok.amount === 50.5, 'settlement ok');
  assert(roundMoney(10.1 + 10.2) === 20.3, 'round money');
}

function testAuditActions() {
  const recv = read('lib/master/corporateFinance/receivablesService.ts');
  assert(recv.includes('CORPORATE_RECEIVABLE_RECEIVED_PARTIAL'), 'audit parcial AR');
  assert(recv.includes('CORPORATE_RECEIVABLE_RECEIVED_FULL'), 'audit total AR');
  assert(recv.includes('CORPORATE_RECEIVABLE_PAYMENT_REVERSED'), 'audit estorno AR');
  assert(recv.includes('CORPORATE_RECEIVABLE_CANCELED'), 'audit cancel AR');
  assert(recv.includes('CORPORATE_RECEIVABLE_ARCHIVED'), 'audit archive AR');
  assert(recv.includes('CORPORATE_RECEIVABLE_RESTORED'), 'audit restore AR');

  const pay = read('lib/master/corporateFinance/payablesService.ts');
  assert(pay.includes('CORPORATE_PAYABLE_PAID_PARTIAL'), 'audit parcial AP');
  assert(pay.includes('CORPORATE_PAYABLE_PAID_FULL'), 'audit total AP');
  assert(pay.includes('CORPORATE_PAYABLE_PAYMENT_REVERSED'), 'audit estorno AP');

  const createAr = read('app/api/master/corporate-finance/receivables/route.ts');
  assert(createAr.includes('CORPORATE_RECEIVABLE_CREATED'), 'audit create AR');
  const createAp = read('app/api/master/corporate-finance/payables/route.ts');
  assert(createAp.includes('CORPORATE_PAYABLE_CREATED'), 'audit create AP');
}

function testCodePatterns() {
  const mig = read('supabase/migrations/20260722180000_master_corporate_receivables_payables.sql');
  assert(mig.includes("'REC-'"), 'código REC');
  assert(mig.includes("'PAG-'"), 'código PAG');
  assert(mig.includes('lpad(next_num::text, 4, \'0\')'), 'padding');
}

function main() {
  testFilesIsolation();
  testAccessRoles();
  testMathAndStatus();
  testValidation();
  testAuditActions();
  testCodePatterns();
  console.log('OK — mandatory-master-corporate-finance-arap-tests');
}

main();
