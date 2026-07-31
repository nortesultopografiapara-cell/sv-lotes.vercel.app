/**
 * Etapa 2 — Contas a Receber com unidade de negócio (estrutura + validação).
 * npm run test:master-finance-etapa2-receivables
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  validateReceivableInput,
  validateSettlementInput,
} from '../lib/master/corporateFinance/arApValidation';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testValidationBusinessUnitRequired() {
  let threw = false;
  try {
    validateReceivableInput({
      description: 'X',
      customer_name: 'Y',
      category_id: '11111111-1111-1111-1111-111111111111',
      issue_date: '2026-07-01',
      competence_date: '2026-07-01',
      due_date: '2026-07-15',
      original_amount: 100,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'business_unit obrigatório');

  const lots = validateReceivableInput({
    description: 'Consultoria',
    customer_name: 'Meneses',
    category_id: '11111111-1111-1111-1111-111111111111',
    business_unit: 'SV_LOTES',
    financial_account_id: '22222222-2222-2222-2222-222222222222',
    issue_date: '2026-07-01',
    competence_date: '2026-07-01',
    due_date: '2026-07-15',
    original_amount: 200,
  });
  assert(lots.business_unit === 'SV_LOTES', 'SV_LOTES');

  const topo = validateReceivableInput({
    description: 'Topo',
    customer_name: 'Cliente',
    category_id: '11111111-1111-1111-1111-111111111111',
    business_unit: 'SV_TOPOGRAFIA',
    issue_date: '2026-07-01',
    competence_date: '2026-07-01',
    due_date: '2026-07-15',
    original_amount: 300,
  });
  assert(topo.business_unit === 'SV_TOPOGRAFIA', 'SV_TOPOGRAFIA');
  console.log('OK testValidationBusinessUnitRequired');
}

function testAlreadyReceivedSettlement() {
  const input = validateReceivableInput({
    description: 'Já pago',
    customer_name: 'Cliente',
    category_id: '11111111-1111-1111-1111-111111111111',
    business_unit: 'SV_LOTES',
    financial_account_id: '22222222-2222-2222-2222-222222222222',
    issue_date: '2026-07-01',
    competence_date: '2026-07-01',
    due_date: '2026-07-15',
    original_amount: 500,
    already_received: true,
    payment_method: 'PIX',
    payment_date: '2026-07-10',
    asaas_payment_id: 'pay_test_abc',
  });
  assert(input.already_received === true, 'already_received');
  assert(Boolean(input.settlement), 'settlement presente');
  assert(input.settlement?.asaas_payment_id === 'pay_test_abc', 'asaas id');
  assert(input.settlement?.idempotency_key === 'ASAAS_PAY:pay_test_abc', 'idempotency');
  console.log('OK testAlreadyReceivedSettlement');
}

function testSettlementAsaasIdempotency() {
  const s = validateSettlementInput({
    financial_account_id: '22222222-2222-2222-2222-222222222222',
    payment_date: '2026-07-10',
    amount: 100,
    payment_method: 'PIX',
    asaas_payment_id: 'pay_dup',
  });
  assert(s.idempotency_key === 'ASAAS_PAY:pay_dup', 'key');
  assert(s.reference === 'pay_dup', 'reference fallback');
  console.log('OK testSettlementAsaasIdempotency');
}

function testUiAndServiceContracts() {
  const page = read('components/master/corporateFinance/CorporateReceivablesPage.tsx');
  assert(!page.includes('businessUnit=SV_TOPOGRAFIA'), 'sem hardcode Topografia no load');
  assert(!page.includes('unitGateOpen'), 'sem gate que bloqueia SV LOTES');
  assert(page.includes('businessUnitFilter'), 'filtro unidade listagem');
  assert(page.includes('accountsForUnit'), 'settle filtra contas por unidade');
  assert(page.includes('asaas_payment_id'), 'settle aceita Asaas id');

  const form = read('components/master/corporateFinance/ReceivableFormModal.tsx');
  assert(form.includes('Unidade de negócio'), 'campo unidade');
  assert(form.includes('loadUnitAccounts'), 'contas dinâmicas');
  assert(form.includes('already_received'), 'já recebido');
  assert(form.includes('Selecione a unidade primeiro'), 'conta desabilitada sem unidade');

  const svc = read('lib/master/corporateFinance/receivablesService.ts');
  assert(svc.includes('business_unit: input.business_unit'), 'salva business_unit');
  assert(svc.includes('assertAccountMatchesUnit'), 'valida conta x unidade');
  assert(svc.includes('RECEIVABLE_PAYMENT'), 'origem caixa');
  assert(svc.includes('saas_cash_movements'), 'documenta anti-duplicidade SaaS');
  assert(svc.includes('existing.business_unit'), 'preserva unidade no update');

  const mig = read(
    'supabase/migrations/20260731122000_corporate_receivables_payables_business_unit.sql',
  );
  assert(mig.includes("SET business_unit = 'SV_TOPOGRAFIA'"), 'backfill históricos Topografia');
  console.log('OK testUiAndServiceContracts');
}

function testTenantFinanceUntouched() {
  const page = read('app/finance/page.tsx');
  assert(page.length > 1000, 'financeiro tenant presente');
  assert(!page.includes('master_corporate_receivables'), 'tenant sem AR corporativo');
  console.log('OK testTenantFinanceUntouched');
}

function main() {
  testValidationBusinessUnitRequired();
  testAlreadyReceivedSettlement();
  testSettlementAsaasIdempotency();
  testUiAndServiceContracts();
  testTenantFinanceUntouched();
  console.log('\nTodos os testes da Etapa 2 (AR unidade) passaram.');
}

main();
