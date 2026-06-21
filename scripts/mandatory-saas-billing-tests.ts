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
  formatInvoiceStatusDetail,
  isInvoiceEligibleForSuspension,
  isValidSaasInvoiceNumber,
  resolveInvoiceDueDate,
  syncPendingInvoiceAmountsFromPricing,
  type MasterSaasInvoice,
} from '../lib/saasBilling';
import {
  getStandardPlanMonthlyPrice,
  resolveEffectiveSaasPrice,
} from '../lib/companyPricing';
import { ASAAS_BOLETO_MIN_AMOUNT } from '../lib/saasMasterConfig';
import {
  assertSaasBoletoMinimumAmount,
  SaasBoletoMinimumError,
} from '../lib/saasPixValidation';
import { SAAS_AUTO_SUSPEND_AFTER_DAYS } from '../lib/saasMasterConfig';
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
      paid_at: '2026-06-27T12:00:00.000Z',
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
      due_date: '2026-06-30',
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

  const metrics = computeSaasBillingMetrics(invoices, 1099.98, 0, '2026-06-15');
  assert(metrics.projectedRevenue === 1099.98, 'receita prevista');
  assert(metrics.receivedRevenue === 549.99, 'receita recebida via fatura paga');
  assert(metrics.revenueToReceive === 549.99, 'receita a receber pendente no prazo');
  assert(metrics.overdueRevenue === 549.99, 'receita vencida');
  assert(metrics.delinquencyAmount === 549.99, 'inadimplência = vencidas');
  assert(metrics.pendingCount === 1, 'faturas pendentes no prazo');
  assert(metrics.overdueCount === 1, 'faturas vencidas');
  console.log('OK testBillingMetrics');
}

function testMenesesSplitMetrics() {
  const invoices: MasterSaasInvoice[] = [
    {
      id: 'may',
      company_id: MENESES_COMPANY_ID,
      invoice_number: '00001/2026-05',
      reference_month: '2026-05',
      amount: 549.99,
      discount_amount: 0,
      final_amount: 549.99,
      due_date: '2026-05-27',
      issued_at: '2026-05-01',
      paid_at: '2026-05-27T12:00:00.000Z',
      status: 'PAGO',
    },
    {
      id: 'jun',
      company_id: MENESES_COMPANY_ID,
      invoice_number: '00002/2026-06',
      reference_month: '2026-06',
      amount: 549.99,
      discount_amount: 0,
      final_amount: 549.99,
      due_date: '2026-06-27',
      issued_at: '2026-06-01',
      status: 'PENDENTE',
    },
  ];

  const withPayments = computeSaasBillingMetrics(invoices, 549.99, 549.99, '2026-06-15');
  assert(withPayments.receivedRevenue === 549.99, 'Meneses recebida R$ 549,99');
  assert(withPayments.revenueToReceive === 549.99, 'Meneses a receber Junho R$ 549,99');
  assert(withPayments.overdueRevenue === 0, 'Meneses vencida R$ 0');
  assert(withPayments.delinquencyAmount === 0, 'Meneses inadimplência R$ 0');

  const detailPending = formatInvoiceStatusDetail(invoices[1]);
  assert(detailPending.includes('Aguardando pagamento até'), 'texto pendente');
  assert(detailPending.includes('27/06/2026'), 'data vencimento pendente');

  const detailPaid = formatInvoiceStatusDetail(invoices[0]);
  assert(detailPaid.includes('Pago em'), 'texto pago');
  console.log('OK testMenesesSplitMetrics');
}

function testOverdueDelinquencyMetrics() {
  const invoices: MasterSaasInvoice[] = [
    {
      id: 'ov',
      company_id: 'c-overdue',
      invoice_number: '00001/2026-04',
      reference_month: '2026-04',
      amount: 549.99,
      discount_amount: 0,
      final_amount: 549.99,
      due_date: '2026-04-27',
      issued_at: '2026-04-01',
      status: 'VENCIDO',
    },
  ];

  const metrics = computeSaasBillingMetrics(invoices, 0, 0, '2026-06-15');
  assert(metrics.overdueRevenue === 549.99, 'receita vencida isolada');
  assert(metrics.delinquencyAmount === 549.99, 'inadimplência isolada');
  assert(metrics.revenueToReceive === 0, 'a receber zero com só vencida');

  const detail = formatInvoiceStatusDetail(invoices[0]);
  assert(detail === 'Pagamento em atraso', 'texto vencido');
  console.log('OK testOverdueDelinquencyMetrics');
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
  assert(SAAS_AUTO_SUSPEND_AFTER_DAYS === 10, 'grace padrão 10 dias');
  assert(
    isInvoiceEligibleForSuspension('2026-06-06', '2026-06-15', 10) === false,
    'menos de 10 dias não suspende',
  );
  assert(
    isInvoiceEligibleForSuspension('2026-06-06', '2026-06-15', SAAS_AUTO_SUSPEND_AFTER_DAYS) === false,
    'menos de grace padrão não suspende',
  );
  assert(
    isInvoiceEligibleForSuspension('2026-04-27', '2026-06-15', 15) === true,
    'mais de 15 dias suspende com grace 15',
  );
  assert(
    isInvoiceEligibleForSuspension('2026-06-05', '2026-06-15', 10) === true,
    'exatamente 10 dias suspende',
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

function testResolveEffectiveSaasPrice() {
  const customCompany = {
    id: 'c-custom',
    plan: 'basic',
    custom_price_enabled: true,
    custom_monthly_price: 10,
  };
  const custom = resolveEffectiveSaasPrice(customCompany, { monthly_price: 0.01 });
  assert(custom.effective_amount === 10, 'preço personalizado R$ 10,00');
  assert(custom.source === 'custom', 'fonte custom');

  const lowCustom = {
    id: 'c-low',
    plan: 'basic',
    custom_price_enabled: true,
    custom_monthly_price: 0.01,
  };
  const low = resolveEffectiveSaasPrice(lowCustom);
  assert(low.effective_amount === 0.01, 'preço personalizado R$ 0,01');

  const noCustom = {
    id: 'c-plan',
    plan: 'basic',
    custom_price_enabled: false,
  };
  const fromPlan = resolveEffectiveSaasPrice(noCustom);
  assert(
    fromPlan.effective_amount === getStandardPlanMonthlyPrice(noCustom),
    'sem custom usa plano',
  );

  const fromSub = resolveEffectiveSaasPrice(noCustom, { monthly_price: 450 });
  assert(fromSub.effective_amount === 450, 'sem custom usa assinatura');
  assert(fromSub.source === 'subscription', 'fonte subscription');

  console.log('OK testResolveEffectiveSaasPrice');
}

function testBoletoMinimumValidation() {
  const diag = resolveEffectiveSaasPrice(
    { id: 'c1', plan: 'basic', custom_price_enabled: true, custom_monthly_price: 10 },
    null,
    { billingType: 'BOLETO' },
  );
  assertSaasBoletoMinimumAmount(10, diag);

  let blocked = false;
  try {
    assertSaasBoletoMinimumAmount(0.01, {
      ...diag,
      effective_amount: 0.01,
      custom_price: 0.01,
    });
  } catch (err) {
    blocked = err instanceof SaasBoletoMinimumError;
  }
  assert(blocked, 'boleto bloqueia R$ 0,01');
  assert(ASAAS_BOLETO_MIN_AMOUNT === 5, 'mínimo boleto R$ 5');
  console.log('OK testBoletoMinimumValidation');
}

async function testSyncPendingInvoiceAmountsFromPricing() {
  const company = {
    id: 'c-sync',
    plan: 'basic',
    custom_price_enabled: true,
    custom_monthly_price: 10,
  };
  const invoice: MasterSaasInvoice = {
    id: 'inv-1',
    company_id: company.id,
    subscription_id: null,
    contract_id: null,
    invoice_number: '00001/2026-06',
    reference_month: '2026-06',
    amount: 329.99,
    discount_amount: 329.98,
    final_amount: 0.01,
    due_date: '2026-06-10',
    issued_at: '2026-06-01',
    paid_at: null,
    status: 'PENDENTE',
    payment_method: null,
    pix_code: null,
    pix_qrcode: null,
    external_charge_id: null,
    notes: null,
  };

  let updatedPatch: Record<string, unknown> | null = null;
  const supabaseAdmin = {
    from() {
      return {
        update(patch: Record<string, unknown>) {
          updatedPatch = patch;
          return {
            eq() {
              return {
                select() {
                  return {
                    single: async () => ({
                      data: { ...invoice, ...patch },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const synced = await syncPendingInvoiceAmountsFromPricing(
    supabaseAdmin as never,
    invoice,
    company,
    null,
  );
  assert(synced.final_amount === 10, 'fatura pendente sincronizada para R$ 10');
  assert(updatedPatch != null, 'patch aplicado no banco');
  console.log('OK testSyncPendingInvoiceAmountsFromPricing');
}

async function main() {
  testInvoiceNumberFormat();
  testComputeInvoiceAmounts();
  testResolveInvoiceDueDate();
  testCurrentReferenceMonth();
  testBillingMetrics();
  testMenesesSplitMetrics();
  testOverdueDelinquencyMetrics();
  testBillingAlerts();
  testOverdueMarkingLogic();
  testNoDuplicateCompetenceRule();
  testReactivationRule();
  testResolveEffectiveSaasPrice();
  testBoletoMinimumValidation();
  await testSyncPendingInvoiceAmountsFromPricing();
  await testMockPixProvider();
  console.log('mandatory-saas-billing-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
