/**
 * Utilitários de billing/MRR do painel Master.
 * Preços efetivos: lib/companyPricing.ts
 */

import {
  normalizeSubscriptionDates,
  resolveCompanySubscriptionDates,
} from '@/lib/companySubscriptionDates';
import {
  formatSaasPaymentStatus,
  type CompanySubscription,
} from '@/lib/saasSubscription';
import {
  calculateMrrFromCompanies,
  getCompanyMonthlyPrice,
  getStandardPlanMonthlyPrice,
  PLAN_MRR,
  planMrrForCompany,
  resolveCompanyPricing,
  type CompanyPricingSource,
} from '@/lib/companyPricing';

export type CompanyLike = CompanyPricingSource;

export { calculateMrrFromCompanies, getCompanyMonthlyPrice, getStandardPlanMonthlyPrice, PLAN_MRR, planMrrForCompany };

export function isActiveSubscriptionCompany(company: CompanyLike): boolean {
  const status = (company.status_operacional || '').toLowerCase().trim();
  if (['inativo', 'inativa', 'bloqueada', 'suspensa'].includes(status)) return false;
  return company.active !== false;
}

export function augmentCompanyBilling<T extends CompanyLike>(
  company: T,
  subscription?: CompanySubscription | null,
) {
  const resolved = resolveCompanyPricing(company);
  const uiPlan =
    resolved.planKey === 'profissional'
      ? 'PROFISSIONAL'
      : resolved.planKey === 'business'
        ? 'BUSINESS'
        : 'BÁSICO';

  const active = isActiveSubscriptionCompany(company);
  const companyDates = resolveCompanySubscriptionDates(company);
  const billing = normalizeSubscriptionDates(company, subscription);

  const paymentRaw = subscription?.payment_status;
  const payment_status = subscription
    ? formatSaasPaymentStatus(paymentRaw)
    : active
      ? ('Aguardando cobrança' as const)
      : ('Inativo' as const);

  const opStatus = (company.status_operacional || '').toLowerCase();
  const subscription_status =
    paymentRaw === 'overdue' || opStatus === 'inadimplente'
      ? ('Inadimplente' as const)
      : subscription?.contract_status === 'canceled'
        ? ('Cancelada' as const)
        : active
          ? ('Ativa' as const)
          : ('Inativa' as const);

  return {
    ...company,
    ui_plan: uiPlan,
    pricing: resolved,
    price: resolved.appliedPrice,
    standard_price: resolved.standardPrice,
    custom_price_enabled: resolved.customEnabled,
    has_custom_price: resolved.hasCustomPrice,
    saas_subscription: subscription ?? null,
    payment_status,
    payment_status_raw: paymentRaw || null,
    subscription_status,
    subscription_start_date: billing.start_date,
    first_payment_date: billing.first_payment_date,
    subscription_due_day: companyDates.subscription_due_day,
    next_payment_date: billing.next_due_date,
    next_billing: billing.next_due_date,
    next_charge: billing.next_due_date,
    contract_number: subscription?.contract_number || null,
    contract_pdf_url: subscription?.contract_pdf_url || null,
    contract_status: subscription?.contract_status || null,
    last_billing: null as string | null,
  };
}
