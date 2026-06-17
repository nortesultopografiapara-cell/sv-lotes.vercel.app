/**
 * Testes obrigatórios — persistência do save no modal Gerenciar Instituição.
 * npx tsx scripts/mandatory-company-edit-save-persistence-tests.ts
 */

import {
  buildCompanySubscriptionDatePayload,
  companyBillingFromResolved,
  computeNextPaymentDate,
  explicitBillingToSubscriptionDates,
} from '../lib/companySubscriptionDates';
import { mapCompanyForEditForm } from '../lib/loadCompanyForEdit';
import {
  menesesSaasContractFixture,
  resolveSaasContractContext,
} from '../lib/saasContractContent';
import { resolveCompanyPricing } from '../lib/companyPricing';
import { resolveSaasSubscriptionBilling } from '../lib/saasSubscriptionService';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertEq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}: esperado ${String(expected)}, recebido ${String(actual)}`);
  }
}

function ivanildeBeforeSave() {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'IVANILDE DE MOURA SILVA',
    cnpj: '32641281104',
    subscription_start_date: '2026-06-17',
    subscription_due_day: 17,
    next_payment_date: '2026-07-17',
    vencimento_plano: '2026-07-17',
    created_at: '2026-06-17T12:00:00Z',
    custom_price_enabled: true,
    custom_monthly_price: 300,
    plan: 'basic',
    plan_type: 'basic',
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
    monthly_price: 300,
    custom_monthly_price: 300,
    custom_price_enabled: true,
    plan_type: 'basic',
    billing_cycle: 'monthly',
    payment_status: 'pending',
    contract_status: 'pending',
  };
}

function testSavePayloadFromModal() {
  const payload = {
    subscription_start_date: '2026-06-15',
    subscription_due_day: 15,
    next_payment_date: computeNextPaymentDate('2026-06-15', 15),
  };

  assertEq(payload.subscription_start_date, '2026-06-15', 'payload start');
  assertEq(payload.subscription_due_day, 15, 'payload due day');
  assertEq(payload.next_payment_date, '2026-07-15', 'payload next payment');
}

function testEnsureUsesExplicitBillingNotCreatedAt() {
  const company = ivanildeBeforeSave();
  const existing = ivanildeSubscriptionBeforeSave();
  const explicit = buildCompanySubscriptionDatePayload({
    subscription_start_date: '2026-06-15',
    subscription_due_day: 15,
    next_payment_date: '2026-07-15',
  });

  const withoutExplicit = resolveSaasSubscriptionBilling(company, existing as never);
  assertEq(withoutExplicit.start_date, '2026-06-17', 'sem explicit usa subscription antiga');

  const withExplicit = resolveSaasSubscriptionBilling(company, existing as never, explicit);
  assertEq(withExplicit.start_date, '2026-06-15', 'explicit start');
  assertEq(withExplicit.next_due_date, '2026-07-15', 'explicit next due');

  const companyPatch = companyBillingFromResolved(explicit);
  assertEq(companyPatch.subscription_due_day, 15, 'company patch due day');
  assertEq(companyPatch.vencimento_plano, '2026-07-15', 'company patch vencimento');
}

function testApiResponseShapeAfterSave() {
  const explicit = buildCompanySubscriptionDatePayload({
    subscription_start_date: '2026-06-15',
    subscription_due_day: 15,
    next_payment_date: '2026-07-15',
  });

  const billing = explicitBillingToSubscriptionDates(explicit);
  const companyAfterSave = {
    ...ivanildeBeforeSave(),
    ...companyBillingFromResolved(explicit),
  };
  const subscriptionAfterSave = {
    ...ivanildeSubscriptionBeforeSave(),
    start_date: billing.start_date,
    first_payment_date: billing.first_payment_date,
    next_due_date: billing.next_due_date,
  };

  const apiBilling = {
    subscription_start_date: companyAfterSave.subscription_start_date,
    subscription_due_day: companyAfterSave.subscription_due_day,
    next_payment_date: companyAfterSave.next_payment_date,
    vencimento_plano: companyAfterSave.vencimento_plano,
    subscription_next_due_date: subscriptionAfterSave.next_due_date,
  };

  assertEq(apiBilling.subscription_due_day, 15, 'api billing due day');
  assertEq(apiBilling.subscription_start_date, '2026-06-15', 'api billing start');
  assertEq(apiBilling.next_payment_date, '2026-07-15', 'api billing next');
  assertEq(apiBilling.subscription_next_due_date, '2026-07-15', 'api subscription next');
}

function testFormReloadAfterSaveUsesApiResponse() {
  const explicit = buildCompanySubscriptionDatePayload({
    subscription_start_date: '2026-06-15',
    subscription_due_day: 15,
    next_payment_date: '2026-07-15',
  });

  const companyAfterSave = {
    ...ivanildeBeforeSave(),
    ...companyBillingFromResolved(explicit),
  };
  const subscriptionAfterSave = {
    ...ivanildeSubscriptionBeforeSave(),
    ...explicitBillingToSubscriptionDates(explicit),
  };

  const merged = mapCompanyForEditForm(companyAfterSave, subscriptionAfterSave as never);
  assertEq(merged.subscription_due_day, '15', 'form due day');
  assertEq(merged.subscription_start_date, '2026-06-15', 'form start');
  assertEq(merged.next_payment_date, '2026-07-15', 'form next payment');
}

function testIvanildeCustomPriceUnchanged() {
  const company = {
    ...ivanildeBeforeSave(),
    subscription_start_date: '2026-06-15',
    subscription_due_day: 15,
    custom_monthly_price: 300,
  };
  const pricing = resolveCompanyPricing(company);
  assertEq(pricing.appliedPrice, 300, 'Ivanilde preço R$ 300');
  assert(pricing.hasCustomPrice, 'Ivanilde custom price ativo');
}

function testIvanildeContractUsesDay15() {
  const company = {
    ...ivanildeBeforeSave(),
    subscription_start_date: '2026-06-15',
    subscription_due_day: 15,
    email: 'ivanilde@example.com',
    phone: '94999999999',
    address: 'Rua Teste, 1',
    city: 'Parauapebas',
    state: 'PA',
    cep: '68515000',
  };
  const subscription = {
    ...ivanildeSubscriptionBeforeSave(),
    start_date: '2026-06-15',
    first_payment_date: '2026-06-15',
    next_due_date: '2026-07-15',
    contract_number: '00099/2026',
  };

  const ctx = resolveSaasContractContext({ company, subscription: subscription as never });
  assertEq(ctx.plan.dueDay, 15, 'contrato due day');
  assertEq(ctx.plan.nextDueDate, '15/07/2026', 'contrato next due');
}

function testMenesesUnchanged() {
  const fixture = menesesSaasContractFixture();
  const merged = mapCompanyForEditForm(
    {
      ...fixture.company,
      subscription_start_date: fixture.subscription.start_date,
      next_payment_date: fixture.subscription.next_due_date,
    },
    fixture.subscription as never,
  );
  assertEq(merged.subscription_due_day, '27', 'Meneses due day');
  assertEq(merged.next_payment_date, '2026-06-27', 'Meneses next payment');
}

function main() {
  testSavePayloadFromModal();
  testEnsureUsesExplicitBillingNotCreatedAt();
  testApiResponseShapeAfterSave();
  testFormReloadAfterSaveUsesApiResponse();
  testIvanildeCustomPriceUnchanged();
  testIvanildeContractUsesDay15();
  testMenesesUnchanged();
  console.log('OK — mandatory-company-edit-save-persistence-tests passed');
}

main();
