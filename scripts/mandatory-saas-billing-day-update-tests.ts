/**
 * Testes obrigatórios — persistência do dia de vencimento SaaS.
 * npx tsx scripts/mandatory-saas-billing-day-update-tests.ts
 */

import {
  buildCompanySubscriptionDatePayload,
  computeNextPaymentDate,
  normalizeSubscriptionDates,
  resolveCompanySubscriptionDates,
} from '../lib/companySubscriptionDates';
import { mapCompanyForEditForm } from '../lib/loadCompanyForEdit';
import {
  menesesSaasContractFixture,
  resolveSaasContractContext,
} from '../lib/saasContractContent';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertEq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}: esperado ${String(expected)}, recebido ${String(actual)}`);
  }
}

function ivanildeCompanyBeforeSave() {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'IVANILDE DE MOURA SILVA',
    cnpj: '32641281104',
    subscription_start_date: '2026-06-17',
    subscription_due_day: 17,
    next_payment_date: '2026-07-17',
    vencimento_plano: '2026-07-17',
    created_at: '2026-06-01T12:00:00Z',
    is_test_company: false,
  };
}

function ivanildeSubscriptionBeforeSave() {
  return {
    id: 'sub-ivanilde',
    company_id: '00000000-0000-4000-8000-000000000001',
    start_date: '2026-06-17',
    first_payment_date: '2026-06-17',
    next_due_date: '2026-07-17',
    payment_status: 'pending',
    contract_status: 'pending',
    plan_type: 'basic',
    monthly_price: 300,
    billing_cycle: 'monthly',
  };
}

function testIvanildeDueDayChangePersists() {
  const savePayload = buildCompanySubscriptionDatePayload({
    subscription_start_date: '2026-06-17',
    subscription_due_day: 15,
    next_payment_date: computeNextPaymentDate('2026-06-17', 15),
  });

  assertEq(savePayload.subscription_due_day, 15, 'payload due day');
  assertEq(savePayload.next_payment_date, '2026-07-15', 'payload next payment');

  const companyAfterSave = {
    ...ivanildeCompanyBeforeSave(),
    subscription_due_day: savePayload.subscription_due_day,
    next_payment_date: savePayload.next_payment_date,
  };

  const billing = normalizeSubscriptionDates(companyAfterSave, ivanildeSubscriptionBeforeSave());
  assertEq(billing.next_due_date, '2026-07-15', 'normalize next_due_date');

  const synced = resolveCompanySubscriptionDates(companyAfterSave);
  assertEq(synced.subscription_due_day, 15, 'synced due day');
  assertEq(synced.next_payment_date, '2026-07-15', 'synced next payment');

  const merged = mapCompanyForEditForm(
    companyAfterSave,
    {
      ...ivanildeSubscriptionBeforeSave(),
      next_due_date: billing.next_due_date,
    } as never,
  );
  assertEq(merged.subscription_due_day, '15', 'form reload due day');
  assertEq(merged.next_payment_date, '2026-07-15', 'form reload next payment');
  assertEq(merged.subscription_start_date, '2026-06-17', 'form reload start date');
}

function testEnsureSubscriptionDatesAfterSave() {
  const company = {
    ...ivanildeCompanyBeforeSave(),
    subscription_due_day: 15,
    next_payment_date: '2026-07-15',
  };

  const billing = normalizeSubscriptionDates(company, ivanildeSubscriptionBeforeSave());
  assertEq(billing.next_due_date, '2026-07-15', 'ensure billing next_due_date');
  assertEq(billing.start_date, '2026-06-17', 'ensure billing start_date');
}

function testIvanildeContractUsesDueDay15() {
  const company = {
    ...ivanildeCompanyBeforeSave(),
    subscription_due_day: 15,
    custom_price_enabled: true,
    custom_monthly_price: 300,
    email: 'ivanilde@example.com',
    phone: '94999999999',
    address: 'Rua Teste, 1',
    city: 'Parauapebas',
    state: 'PA',
    cep: '68515000',
    plan: 'basic',
    plan_type: 'basic',
  };

  const subscription = {
    ...ivanildeSubscriptionBeforeSave(),
    next_due_date: '2026-07-15',
    contract_number: '00099/2026',
    custom_price_enabled: true,
    custom_monthly_price: 300,
  };

  const ctx = resolveSaasContractContext({ company, subscription: subscription as never });
  assertEq(ctx.plan.dueDay, 15, 'contrato due day');
  assertEq(ctx.plan.nextDueDate, '15/07/2026', 'contrato next due date');
}

function testMenesesKeepsDueDay27() {
  const fixture = menesesSaasContractFixture();
  const company = {
    ...fixture.company,
    subscription_start_date: fixture.subscription.start_date,
    next_payment_date: fixture.subscription.next_due_date,
  };

  const savePayload = buildCompanySubscriptionDatePayload({
    subscription_start_date: company.subscription_start_date,
    subscription_due_day: company.subscription_due_day,
    next_payment_date: company.next_payment_date,
  });

  assertEq(savePayload.subscription_due_day, 27, 'Meneses due day');
  assertEq(savePayload.next_payment_date, '2026-06-27', 'Meneses next payment');

  const merged = mapCompanyForEditForm(company, fixture.subscription as never);
  assertEq(merged.subscription_due_day, '27', 'Meneses form due day');
  assertEq(merged.next_payment_date, '2026-06-27', 'Meneses form next payment');

  const ctx = resolveSaasContractContext(fixture);
  assertEq(ctx.plan.dueDay, 27, 'Meneses contrato due day');
}

function main() {
  testIvanildeDueDayChangePersists();
  testEnsureSubscriptionDatesAfterSave();
  testIvanildeContractUsesDueDay15();
  testMenesesKeepsDueDay27();
  console.log('OK — mandatory-saas-billing-day-update-tests passed');
}

main();
