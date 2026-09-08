/**
 * Testes obrigatórios — split-brain SaaS (Ativa + active=false).
 * npm run test:saas-billable-status
 */

import fs from 'node:fs';
import path from 'node:path';
import { isBillableCompany } from '../lib/companyPricing';
import {
  augmentCompanyBilling,
  isActiveSubscriptionCompany,
} from '../lib/masterBilling';
import {
  buildCompanyStatusUpdatePatch,
  diagnoseBillableCompany,
  shouldPreserveValidSubscription,
  shouldReactivateCompanyOnPayment,
} from '../lib/saasBillableStatus';
import { resolveSaasFinancialSituation } from '../lib/masterSaasFinancialStatus';
import { planCompanyFinancialStatusPersist } from '../lib/saasCompanyFinancialStatus';
import { MENESES_COMPANY_ID } from '../lib/saasContractContent';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function menesesSplitBrain() {
  return {
    id: MENESES_COMPANY_ID,
    name: 'MENESES IMOBILIARIA LTDA',
    active: false as const,
    status_operacional: 'Ativa',
  };
}

function testBillableGate() {
  const okCompany = {
    id: MENESES_COMPANY_ID,
    active: true as const,
    status_operacional: 'Ativa',
  };
  const ok = diagnoseBillableCompany(okCompany);
  assert(ok.billable === true, 'Ativa + active=true é faturável');
  assert(ok.code === 'ok', 'código ok');
  assert(isBillableCompany(okCompany) === true, 'isBillableCompany true');

  const split = diagnoseBillableCompany(menesesSplitBrain());
  assert(split.billable === false, 'Ativa + active=false NÃO é faturável');
  assert(split.splitBrain === true, 'inconsistência detectada');
  assert(split.code === 'split_brain_active_false', 'código split-brain');
  assert(split.reason.includes('active=false'), 'motivo inclui active=false');
  assert(split.reason.includes('Ativa'), 'motivo inclui operacional');
  assert(isBillableCompany(menesesSplitBrain()) === false, 'gate local bloqueia split-brain');

  const inactive = diagnoseBillableCompany({
    id: 'c-inativa',
    active: false,
    status_operacional: 'Inativa',
  });
  assert(inactive.billable === false, 'Inativa não faturável');
  assert(inactive.splitBrain === false, 'Inativa + active=false não é split-brain');
  assert(inactive.code === 'inactive_flag', 'código inactive_flag');
}

function testReactivateCompanyStatusPatch() {
  const ativa = buildCompanyStatusUpdatePatch('Ativa');
  assert(ativa.active === true, 'reativar empresa → active=true');
  assert(ativa.status_operacional === 'Ativa', 'status Ativa');

  const inadimplente = buildCompanyStatusUpdatePatch('Inadimplente');
  assert(inadimplente.active === true, 'Inadimplente permanece active=true');

  const inativa = buildCompanyStatusUpdatePatch('Inativa');
  assert(inativa.active === false, 'Inativa → active=false');

  const suspensa = buildCompanyStatusUpdatePatch('Suspensa');
  assert(suspensa.active === false, 'Suspensa → active=false');

  const route = read('app/api/companies/status/route.ts');
  assert(route.includes('buildCompanyStatusUpdatePatch'), 'rota usa patch consistente');
  assert(route.includes('.eq(\'id\', companyId)'), 'UPDATE só da empresa alvo');
  assert(!route.includes('.update({ status_operacional })'), 'não atualiza só status_operacional');
}

function testReactivateOnPayment() {
  assert(
    shouldReactivateCompanyOnPayment({ status_operacional: 'Suspensa', active: false }) === true,
    'pagamento em Suspensa reativa',
  );
  assert(
    shouldReactivateCompanyOnPayment({ status_operacional: 'Inadimplente', active: true }) === true,
    'pagamento em Inadimplente reativa',
  );
  assert(
    shouldReactivateCompanyOnPayment({ status_operacional: 'Inativa', active: false }) === true,
    'pagamento em Inativa reativa',
  );
  assert(
    shouldReactivateCompanyOnPayment({ status_operacional: 'Inativo', active: false }) === true,
    'pagamento em Inativo reativa',
  );
  assert(
    shouldReactivateCompanyOnPayment({ status_operacional: 'Ativa', active: false }) === true,
    'pagamento em split-brain reativa',
  );
  assert(
    shouldReactivateCompanyOnPayment({ status_operacional: 'Ativa', active: true }) === false,
    'Ativa + active=true não precisa reativar',
  );

  const billing = read('lib/saasBilling.ts');
  assert(billing.includes('shouldReactivateCompanyOnPayment'), 'reactivateCompanyOnPayment usa helper');
  assert(billing.includes("status_operacional: 'Ativa'"), 'grava Ativa');
  assert(billing.includes('active: true'), 'grava active true');
}

function testFinancialStatusDoesNotRecancel() {
  const today = new Date('2026-09-08T12:00:00');
  const payments = [
    {
      id: 'p1',
      company_id: MENESES_COMPANY_ID,
      amount: 549.99,
      paid_at: '2026-09-08',
      payment_method: 'manual',
      reference_month: '2026-08',
      status: 'paid',
    },
  ];
  const sub = {
    id: 'sub1',
    company_id: MENESES_COMPANY_ID,
    contract_status: 'canceled',
    payment_status: 'canceled',
    next_due_date: '2026-09-27',
  };

  assert(
    shouldPreserveValidSubscription({
      company: menesesSplitBrain(),
      subscription: sub,
      payments,
      nextDueDate: '2026-09-27',
      today,
    }) === true,
    'preserva assinatura válida no split-brain',
  );

  const situation = resolveSaasFinancialSituation({
    company: { id: MENESES_COMPANY_ID, active: false, status_operacional: 'Ativa' },
    subscription: sub as never,
    nextDueDate: '2026-09-27',
    payments: payments as never,
    today,
  });
  assert(situation.situation !== 'INATIVO', 'não marca INATIVO com vencimento futuro e pagamento');
  assert(situation.situation === 'EM DIA', 'situação EM DIA em 08/09 com vencimento 27/09');

  const planned = planCompanyFinancialStatusPersist({
    company: { id: MENESES_COMPANY_ID, active: false, status_operacional: 'Ativa' },
    subscription: sub as never,
    nextDueDate: '2026-09-27',
    payments: payments as never,
    today,
  });
  assert(planned.subscriptionContractStatus !== 'canceled', 'não grava contract_status=canceled');
  assert(planned.companyActive === true, 'persistência alinha active=true');
  assert(planned.statusOperacional === 'Ativa', 'persistência mantém Ativa');
  assert(planned.subscriptionContractStatus === 'active', 'assinatura permanece active');

  const trulyInactive = planCompanyFinancialStatusPersist({
    company: { id: 'other', active: false, status_operacional: 'Inativa' },
    subscription: {
      id: 's-inativa',
      company_id: 'other',
      contract_status: 'canceled',
      payment_status: 'canceled',
      next_due_date: null,
    } as never,
    payments: [],
    today,
  });
  assert(trulyInactive.subscriptionContractStatus === 'canceled', 'Inativa verdadeira pode cancelar');
  assert(trulyInactive.companyActive === false, 'Inativa verdadeira permanece inactive');
}

function testMonthlyGenerationNotSilent() {
  const charges = read('lib/saasCharges.ts');
  assert(!charges.includes('if (!isBillableCompany(company)) continue;'), 'mensal não ignora em silêncio');
  assert(charges.includes('skippedDetails'), 'resultado mensal expõe skips');
  assert(charges.includes('logBillableSkip'), 'geração mensal registra skip faturável');
  assert(charges.includes("stage: 'generateMonthlySaasCharges'"), 'log identifica geração mensal');
  assert(charges.includes('company_not_billable'), 'skip code empresa não faturável');

  const helpers = read('lib/saasBillableStatus.ts');
  assert(helpers.includes('[saas-billable-skip]'), 'log estruturado de skip');

  const billing = read('lib/saasBilling.ts');
  assert(!billing.includes('if (!isBillableCompany(company)) continue;'), 'invoices mensal não silencia');
  assert(billing.includes('skippedDetails'), 'invoices mensal expõe skips');
  assert(billing.includes('COMPANY_NOT_BILLABLE_SKIP_CODE'), 'fatura devolve skip preciso');

  const page = read('app/saas-finance/page.tsx');
  assert(page.includes('Empresas ignoradas:'), 'UI mensal mostra empresas ignoradas');
}

function testAsaasOnlyAfterLocalGate() {
  const charges = read('lib/saasCharges.ts');
  const fnStart = charges.indexOf('export async function createSaasPixCharge');
  assert(fnStart >= 0, 'createSaasPixCharge existe');
  const slice = charges.slice(fnStart);
  const invoiceGate = slice.indexOf('generateInvoiceForCompany');
  const asaasCall = slice.indexOf('provider.createPixCharge');
  assert(invoiceGate >= 0, 'gate local generateInvoiceForCompany');
  assert(asaasCall > invoiceGate, 'Asaas só depois que o gate local passa');
  assert(slice.includes('company_not_billable'), 'não chama Asaas quando não faturável');
  assert(slice.indexOf('returnSaasPixChargeSkipped') < asaasCall, 'skip retorna antes do Asaas');
}

function testNoDuplicateAndScopedUpdate() {
  const charges = read('lib/saasCharges.ts');
  assert(charges.includes('active_local_charge'), 'skip cobrança local ativa');
  assert(charges.includes('asaas_external_charge'), 'skip cobrança Asaas existente');
  assert(charges.includes('confirmed_manual_payment'), 'skip pagamento confirmado');
  assert(charges.includes('findConfirmedSaasPaymentForReference'), 'anti-duplicidade pagamento');

  const financial = read('lib/saasCompanyFinancialStatus.ts');
  assert(financial.includes(".eq('id', companyId)"), 'financial status UPDATE só da empresa');
  assert(financial.includes(".eq('id', subscription.id)"), 'subscription UPDATE só da assinatura');

  const statusRoute = read('app/api/companies/status/route.ts');
  assert(statusRoute.includes(".eq('id', companyId)"), 'status UPDATE só da empresa');

  const billing = read('lib/saasBilling.ts');
  const reactivate = billing.slice(billing.indexOf('export async function reactivateCompanyOnPayment'));
  assert(reactivate.includes(".eq('id', companyId)"), 'reativação UPDATE só da empresa');
}

function testUiStatusFollowsOperationalNotSplitBrain() {
  assert(
    isActiveSubscriptionCompany(menesesSplitBrain()) === true,
    'UI trata split-brain Ativa como assinatura ativa',
  );
  assert(
    isBillableCompany(menesesSplitBrain()) === false,
    'faturamento continua bloqueado no split-brain',
  );

  const enriched = augmentCompanyBilling(
    { id: MENESES_COMPANY_ID, active: false, status_operacional: 'Ativa' },
    {
      id: 'sub1',
      company_id: MENESES_COMPANY_ID,
      contract_status: 'canceled',
      payment_status: 'canceled',
      next_due_date: '2026-09-27',
    } as never,
    {
      payments: [
        {
          id: 'p1',
          company_id: MENESES_COMPANY_ID,
          amount: 549.99,
          paid_at: '2026-09-08',
          payment_method: 'manual',
          reference_month: '2026-08',
          status: 'paid',
        },
      ] as never,
      today: new Date('2026-09-08T12:00:00'),
    },
  );
  assert(enriched.financial_situation !== 'INATIVO', 'situação financeira não fica INATIVO');
  assert(enriched.subscription_status !== 'Inativa', 'assinatura não fica INATIVA indevidamente');

  const billing = read('lib/masterBilling.ts');
  assert(billing.includes('isSplitBrainActiveFalse'), 'UI não trata split-brain como Inativa');
  assert(
    !billing.includes("subscription?.contract_status === 'canceled' || financial.situation === 'INATIVO'"),
    'assinatura UI não recancela por leftover canceled',
  );

  const statusRoute = read('app/api/companies/status/route.ts');
  assert(statusRoute.includes('updateCompanyFinancialStatus'), 'reativar também alinha assinatura');
}

function testSkipCodeCompatibility() {
  const charges = read('lib/saasCharges.ts');
  assert(charges.includes("'invoice_missing'"), 'invoice_missing preservado');
  assert(charges.includes("'company_not_billable'"), 'novo código não faturável');

  const page = read('app/saas-finance/page.tsx');
  assert(page.includes('formatChargeSkipAlert'), 'UI continua prefixando skipCode');
  assert(page.includes('json.skipCode'), 'UI lê skipCode');
}

async function main() {
  const tests: Array<[string, () => void]> = [
    ['Ativa + active=true faturável / split-brain detectado', testBillableGate],
    ['reativar empresa → active=true', testReactivateCompanyStatusPatch],
    ['pagamento confirmado reativa Inativa/Suspensa/Inadimplente', testReactivateOnPayment],
    ['vencimento futuro não grava contract_status=canceled', testFinancialStatusDoesNotRecancel],
    ['geração mensal não ignora silenciosamente', testMonthlyGenerationNotSilent],
    ['Asaas só depois do gate local', testAsaasOnlyAfterLocalGate],
    ['sem cobrança duplicada e UPDATE só da empresa alvo', testNoDuplicateAndScopedUpdate],
    ['UI Assinatura não fica INATIVA por leftover canceled', testUiStatusFollowsOperationalNotSplitBrain],
    ['skipCode compatível com a UI', testSkipCodeCompatibility],
  ];
  for (const [name, fn] of tests) {
    fn();
    console.log(`✓ ${name}`);
  }
  console.log('mandatory-saas-billable-status-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
