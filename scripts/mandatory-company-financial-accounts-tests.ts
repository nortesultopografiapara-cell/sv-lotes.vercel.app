/**
 * Contas financeiras por empresa — múltiplos recebedores Asaas.
 * npx tsx scripts/mandatory-company-financial-accounts-tests.ts
 */

import {
  assertCompanyFinancialAccountResponseSafe,
  formatFinancialAccountLabel,
  mapCompanyFinancialAccountRow,
} from '../lib/finance/companyFinancialAccountTypes';
import { buildSaleEditFinancePayloads } from '../lib/saleEditFinanceRecalc';
import { buildOfficialSalesUpdatePatch } from '../lib/salesWriteSchema';
import { filterChargeInstallments, buildChargeInstallmentView } from '../lib/charges/chargeInstallmentHelpers';
import { resolveFinancialAccountForSaleOptional } from '../lib/finance/companyFinancialAccountResolver';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const accountA = mapCompanyFinancialAccountRow(
  {
    id: 'fa-a',
    company_id: 'co-1',
    name: 'Conta Irineu',
    account_type: 'PROPRIETARIO',
    beneficiary_name: 'Irineu Martini',
    document: null,
    email: null,
    phone: null,
    environment: 'PRODUCTION',
    bank_integration_id: 'bi-a',
    is_default: false,
    active: true,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  { hasProductionApiKey: true, connectionStatus: 'CONNECTED' },
);

const accountDefault = mapCompanyFinancialAccountRow(
  {
    id: 'fa-default',
    company_id: 'co-1',
    name: 'Conta Padrão',
    account_type: 'IMOBILIARIA',
    beneficiary_name: 'Menezes',
    document: null,
    email: null,
    phone: null,
    environment: 'PRODUCTION',
    bank_integration_id: 'bi-default',
    is_default: true,
    active: true,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  { hasProductionApiKey: true, connectionStatus: 'CONNECTED' },
);

function testResponseSafe() {
  assertCompanyFinancialAccountResponseSafe(accountA);
  assertCompanyFinancialAccountResponseSafe([accountA, accountDefault]);
  const json = JSON.stringify(accountA);
  assert(!json.includes('apiKey'), 'resposta não deve expor apiKey');
  assert(!json.includes('sandboxApiKey'), 'resposta não deve expor sandboxApiKey');
}

function testFormatLabel() {
  const label = formatFinancialAccountLabel(accountA);
  assert(label.includes('Conta Irineu'), label);
  assert(label.includes('Sem provider') || label.includes('Asaas') || label.includes('Irineu'), label);

  const withProvider = formatFinancialAccountLabel({
    ...accountA,
    provider: 'ASAAS_COMPANY',
  });
  assert(withProvider === 'Conta Irineu — Asaas', withProvider);

  const interLabel = formatFinancialAccountLabel({
    name: 'S V TOPOGRAFIA E PROJETOS',
    accountType: 'IMOBILIARIA',
    beneficiaryName: null,
    provider: 'INTER',
  });
  assert(interLabel === 'S V TOPOGRAFIA E PROJETOS — Banco Inter', interLabel);
}

function testSaleFinancePayloadOmitsAccountWhenUnset() {
  const payloads = buildSaleEditFinancePayloads(
    'co-1',
    'sale-1',
    'cust-1',
    null,
    { id: 'lot-1', project_id: 'proj-1' },
    {
      payment_type: 'À vista',
      discount_value: '',
      down_payment: '',
      down_payment_due_date: '2026-08-01',
      installments_count: '',
      first_installment_due_date: '',
      broker_id: '',
      financial_account_id: '',
      notes: '',
      final_value: 1000,
      lot_value: 1000,
      installment_value: 1000,
    },
  );
  assert(payloads.length === 1, 'uma parcela à vista');
  assert(!('financial_account_id' in payloads[0]), 'sem conta financeira não grava coluna');
}

async function testOptionalSaleResolverReturnsNullWithoutAccounts() {
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: 'relation does not exist' } }),
          order: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null, error: { message: 'relation does not exist' } }),
              }),
            }),
          }),
        }),
      }),
    }),
  } as never;

  const resolved = await resolveFinancialAccountForSaleOptional(admin, 'co-1', {
    financialAccountId: null,
    projectId: 'proj-1',
  });
  assert(resolved === null, 'venda sem conta financeira deve continuar');
}

function testSaleFinancePayloadIncludesAccount() {
  const payloads = buildSaleEditFinancePayloads(
    'co-1',
    'sale-1',
    'cust-1',
    null,
    { id: 'lot-1', project_id: 'proj-1' },
    {
      payment_type: 'À vista',
      discount_value: '',
      down_payment: '',
      down_payment_due_date: '2026-08-01',
      installments_count: '',
      first_installment_due_date: '',
      broker_id: '',
      financial_account_id: 'fa-a',
      notes: '',
      final_value: 1000,
      lot_value: 1000,
      installment_value: 1000,
    },
    { financialAccountId: 'fa-a' },
  );
  assert(payloads.length === 1, 'uma parcela à vista');
  assert(payloads[0].financial_account_id === 'fa-a', 'parcela deve herdar conta');
}

function testInstallmentFieldPriorityInChargeView() {
  const view = buildChargeInstallmentView(
    {
      id: 'r1',
      financial_account_id: 'fa-a',
      sales: { financial_account_id: 'fa-default' },
      amount: 100,
      due_date: '2026-08-01',
      status: 'pendente',
      installment_number: 1,
      customers: { name: 'Cliente' },
      projects: { name: 'Projeto' },
      blocks: { block_name: '1', number: '1' },
    },
    { financialAccountId: 'fa-charge' } as never,
    undefined,
    { 'fa-a': 'Conta Irineu', 'fa-charge': 'Conta Cobrança' },
  );
  assert(view.financialAccountId === 'fa-a', 'parcela tem prioridade sobre venda/cobrança');
  assert(view.financialAccountLabel === 'Conta Irineu', view.financialAccountLabel);
}

function testSalesPatchIncludesFinancialAccount() {
  const patch = buildOfficialSalesUpdatePatch({
    customerId: 'cust-1',
    agreedPrice: 1000,
    lotPrice: 1000,
    discount: 0,
    totalValue: 1000,
    paymentType: 'À vista',
    downPayment: 0,
    installmentsCount: 1,
    brokerId: null,
    financialAccountId: 'fa-a',
  });
  assert(patch.financial_account_id === 'fa-a', 'patch de venda deve incluir conta');
}

function testChargeFilterByFinancialAccount() {
  const rows = [
    {
      id: 'r1',
      amount: 100,
      due_date: '2026-08-01',
      status: 'pendente',
      installment_number: 1,
      financial_account_id: 'fa-a',
      customers: { name: 'Cliente A' },
      projects: { name: 'Martini II' },
      blocks: { block_name: '1', number: '10' },
    },
    {
      id: 'r2',
      amount: 200,
      due_date: '2026-08-02',
      status: 'pendente',
      installment_number: 1,
      financial_account_id: 'fa-default',
      customers: { name: 'Cliente B' },
      projects: { name: 'Recanto' },
      blocks: { block_name: '2', number: '5' },
    },
  ];

  const filtered = filterChargeInstallments(
    rows,
    {
      search: '',
      statusFilter: 'Todas',
      projectFilter: 'Todos os projetos',
      financialAccountFilter: 'fa-a',
      startDate: '',
      endDate: '',
    },
    undefined,
    { 'fa-a': 'Conta Irineu', 'fa-default': 'Conta Padrão' },
  );
  assert(filtered.length === 1, 'filtro por conta');
  assert(filtered[0].id === 'r1', 'conta correta');

  const view = buildChargeInstallmentView(rows[0], null, undefined, {
    'fa-a': 'Conta Irineu',
  });
  assert(view.financialAccountLabel === 'Conta Irineu', view.financialAccountLabel);
}

async function main() {
  testResponseSafe();
  testFormatLabel();
  testSaleFinancePayloadOmitsAccountWhenUnset();
  await testOptionalSaleResolverReturnsNullWithoutAccounts();
  testSaleFinancePayloadIncludesAccount();
  testInstallmentFieldPriorityInChargeView();
  testSalesPatchIncludesFinancialAccount();
  testChargeFilterByFinancialAccount();
  console.log('mandatory-company-financial-accounts-tests: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
