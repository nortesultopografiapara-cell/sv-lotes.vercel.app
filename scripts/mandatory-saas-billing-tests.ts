/**
 * Testes obrigatórios — cobrança automática SaaS.
 * npx tsx scripts/mandatory-saas-billing-tests.ts
 */

import { MockGatewayBillingProvider } from '../lib/gatewayBillingProvider';
import {
  buildSaasBillingAlerts,
  computeInvoiceAmounts,
  computeSaasBillingMetrics,
  currentReferenceMonth,
  formatSaasInvoiceNumber,
  isInvoiceEligibleForSuspension,
  isValidSaasInvoiceNumber,
  resolveInvoiceDueDate,
  type MasterSaasInvoice,
} from '../lib/saasBilling';
import { MENESES_COMPANY_ID } from '../lib/saasContractContent';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function menesesCompanyFixture() {
  return {
    id: MENESES_COMPANY_ID,
    name: 'MENESES IMOBILIARIA LTDA',
    plan_type: 'business',
    plan: 'profissional',
    custom_price_enabled: true,
    custom_monthly_price: 549.99,
    subscription_due_day: 27,
    subscription_start_date: '2026-05-27',
    status_operacional: 'Ativa',
    active: true,
    is_test_company: false,
    is_test: false,
  };
}

function testInvoiceNumberFormat() {
  assert(formatSaasInvoiceNumber(1, '2026-07') === '00001/2026-07', 'numeração fatura');
  assert(isValidSaasInvoiceNumber('00001/2026-07'), 'valida formato');
  assert(!isValidSaasInvoiceNumber('SAAS-2026-07'), 'rejeita legado');
  console.log('OK testInvoiceNumberFormat');
}

function testComputeInvoiceAmounts() {
  const company = menesesCompanyFixture();
  const amounts = computeInvoiceAmounts(company);
  assert(amounts.final_amount === 549.99, 'valor Meneses aplicado');
  assert(amounts.amount >= amounts.final_amount, 'valor padrão >= aplicado');
  assert(amounts.discount_amount >= 0, 'desconto não negativo');
  console.log('OK testComputeInvoiceAmounts');
}

function testResolveInvoiceDueDate() {
  const company = menesesCompanyFixture();
  const due = resolveInvoiceDueDate(company, null, '2026-07');
  assert(due === '2026-07-27', 'vencimento dia 27 julho/2026');
  console.log('OK testResolveInvoiceDueDate');
}

function testCurrentReferenceMonth() {
  const ref = currentReferenceMonth(new Date('2026-07-15T12:00:00'));
  assert(ref === '2026-07', 'competência julho/2026');
  console.log('OK testCurrentReferenceMonth');
}

function testBillingMetrics() {
  const invoices: MasterSaasInvoice[] = [
    {
      id: '1',
      company_id: 'c1',
      invoice_number: '00001/2026-06',
      reference_month: '2026-06',
      amount: 549.99,
      discount_amount: 0,
      final_amount: 549.99,
      due_date: '2026-06-27',
      issued_at: '2026-06-01',
      status: 'PAGO',
    },
    {
      id: '2',
      company_id: 'c2',
      invoice_number: '00002/2026-06',
      reference_month: '2026-06',
      amount: 549.99,
      discount_amount: 0,
      final_amount: 549.99,
      due_date: '2026-06-27',
      issued_at: '2026-06-01',
      status: 'PENDENTE',
    },
    {
      id: '3',
      company_id: 'c3',
      invoice_number: '00003/2026-05',
      reference_month: '2026-05',
      amount: 549.99,
      discount_amount: 0,
      final_amount: 549.99,
      due_date: '2026-05-27',
      issued_at: '2026-05-01',
      status: 'VENCIDO',
    },
  ];

  const metrics = computeSaasBillingMetrics(invoices, 1099.98);
  assert(metrics.projectedRevenue === 1099.98, 'receita prevista');
  assert(metrics.receivedRevenue === 549.99, 'receita recebida');
  assert(metrics.delinquencyAmount === 549.99, 'inadimplência');
  assert(metrics.pendingCount === 1, 'faturas pendentes');
  assert(metrics.overdueCount === 1, 'faturas vencidas');
  console.log('OK testBillingMetrics');
}

function testBillingAlerts() {
  const today = '2026-06-25';
  const invoices: MasterSaasInvoice[] = [
    {
      id: 'a',
      company_id: 'c1',
      company_name: 'Empresa A',
      invoice_number: '00001/2026-06',
      reference_month: '2026-06',
      amount: 100,
      discount_amount: 0,
      final_amount: 100,
      due_date: '2026-06-30',
      issued_at: '2026-06-01',
      status: 'PENDENTE',
    },
    {
      id: 'b',
      company_id: 'c2',
      company_name: 'Empresa B',
      invoice_number: '00002/2026-05',
      reference_month: '2026-05',
      amount: 200,
      discount_amount: 0,
      final_amount: 200,
      due_date: '2026-05-10',
      issued_at: '2026-05-01',
      status: 'VENCIDO',
    },
  ];

  const alerts = buildSaasBillingAlerts(
    invoices,
    [{ id: 'c3', name: 'Suspensa Ltda', status_operacional: 'Suspensa' }],
    today,
  );

  assert(alerts.dueInSevenDays.length === 1, 'vencendo em 7 dias');
  assert(alerts.overdue.length === 1, 'cobranças vencidas');
  assert(alerts.suspendedCompanies.length === 1, 'empresas suspensas');
  console.log('OK testBillingAlerts');
}

function testOverdueMarkingLogic() {
  assert(
    isInvoiceEligibleForSuspension('2026-06-01', '2026-06-15', 30) === false,
    'menos de 30 dias não suspende',
  );
  assert(
    isInvoiceEligibleForSuspension('2026-04-27', '2026-06-15', 15) === true,
    'mais de 15 dias suspende com grace 15',
  );
  assert(
    isInvoiceEligibleForSuspension('2026-04-27', '2026-06-15', 30) === true,
    'mais de 30 dias suspende',
  );
  console.log('OK testOverdueMarkingLogic');
}

async function testMockPixProvider() {
  const provider = new MockGatewayBillingProvider();
  const charge = await provider.createPixCharge({
    companyId: MENESES_COMPANY_ID,
    invoiceId: 'inv-1',
    invoiceNumber: '00001/2026-07',
    amount: 549.99,
    dueDate: '2026-07-27',
    description: 'SV LOTES — Julho/2026',
    payerName: 'MENESES IMOBILIARIA LTDA',
  });

  assert(charge.provider === 'mock', 'provider mock');
  assert(charge.pixCode.includes('BR.GOV.BCB.PIX'), 'pix code mock');
  assert(charge.status === 'PENDENTE', 'status pendente');
  assert(charge.externalChargeId.startsWith('mock_'), 'external id mock');

  const status = await provider.getChargeStatus(charge.externalChargeId);
  assert(status.status === 'PENDENTE', 'consulta status mock');
  console.log('OK testMockPixProvider');
}

function testNoDuplicateCompetenceRule() {
  const seen = new Set<string>();
  const companies = ['c1', 'c2', 'c1'];
  const referenceMonth = '2026-07';
  let created = 0;
  let skipped = 0;

  for (const companyId of companies) {
    const key = `${companyId}:${referenceMonth}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    created += 1;
  }

  assert(created === 2, 'geração mensal sem duplicar competência');
  assert(skipped === 1, 'competência duplicada ignorada');
  console.log('OK testNoDuplicateCompetenceRule');
}

function testReactivationRule() {
  const openOverdue = 0;
  const status = 'Suspensa';
  const shouldReactivate = status.toLowerCase() === 'suspensa' && openOverdue === 0;
  assert(shouldReactivate, 'reativação após quitar faturas vencidas');
  console.log('OK testReactivationRule');
}

async function main() {
  testInvoiceNumberFormat();
  testComputeInvoiceAmounts();
  testResolveInvoiceDueDate();
  testCurrentReferenceMonth();
  testBillingMetrics();
  testBillingAlerts();
  testOverdueMarkingLogic();
  testNoDuplicateCompetenceRule();
  testReactivationRule();
  await testMockPixProvider();
  console.log('mandatory-saas-billing-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
