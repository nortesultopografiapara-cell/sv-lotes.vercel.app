/**
 * Utilitários de billing/MRR do painel Master.
 * Preços efetivos: lib/companyPricing.ts
 */

import {
  normalizeSubscriptionDates,
  resolveCompanySubscriptionDates,
} from '@/lib/companySubscriptionDates';
import type { CompanySubscription } from '@/lib/saasSubscription';
import type { MasterSaasPayment } from '@/lib/masterSaasPayments';
import { resolveSaasFinancialSituation } from '@/lib/masterSaasFinancialStatus';
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

export type AugmentCompanyBillingOptions = {
  paidReferenceMonths?: Map<string, Set<string>>;
  referenceMonth?: string;
  payments?: MasterSaasPayment[];
  /** Referência fixa para testes e relatórios determinísticos. */
  today?: Date;
};

export function augmentCompanyBilling<T extends CompanyLike>(
  company: T,
  subscription?: CompanySubscription | null,
  options?: AugmentCompanyBillingOptions,
) {
  const resolved = resolveCompanyPricing(company, subscription);
  const uiPlan =
    resolved.planKey === 'profissional'
      ? 'PROFISSIONAL'
      : resolved.planKey === 'business'
        ? 'BUSINESS'
        : 'BÁSICO';

  const active = isActiveSubscriptionCompany(company);
  const companyDates = resolveCompanySubscriptionDates(company);
  const billing = normalizeSubscriptionDates(company, subscription);
  const companyId = String((company as { id?: string }).id || '');
  const paidMonths = options?.paidReferenceMonths ?? new Map<string, Set<string>>();

  const financial = resolveSaasFinancialSituation({
    company: { ...company, id: companyId },
    subscription,
    nextDueDate: subscription?.next_due_date ?? billing.next_due_date,
    paidReferenceMonths: paidMonths,
    payments: options?.payments,
    today: options?.today,
  });

  const subscription_status =
    financial.situation === 'VENCIDO' || (company.status_operacional || '').toLowerCase() === 'inadimplente'
      ? ('Inadimplente' as const)
      : subscription?.contract_status === 'canceled' || financial.situation === 'INATIVO'
        ? ('Inativa' as const)
        : financial.situation === 'SUSPENSO'
          ? ('Suspensa' as const)
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
    financial_situation: financial.situation,
    /** @deprecated Use financial_situation — não representa pagamento individual */
    payment_status: financial.situation,
    company_operational_status: financial.companyOperationalStatus,
    last_payment_date: financial.lastPaymentDate,
    last_payment_reference: financial.lastPaymentReference,
    last_payment_reference_label: financial.lastPaymentReferenceLabel,
    days_late: financial.daysLate,
    subscription_status,
    subscription_start_date: billing.start_date,
    first_payment_date: billing.first_payment_date,
    subscription_due_day: companyDates.subscription_due_day,
    next_payment_date: subscription?.next_due_date ?? billing.next_due_date,
    next_billing: subscription?.next_due_date ?? billing.next_due_date,
    next_charge: subscription?.next_due_date ?? billing.next_due_date,
    contract_number: subscription?.contract_number || null,
    contract_pdf_url: subscription?.contract_pdf_url || null,
    contract_status: subscription?.contract_status || null,
    last_billing: financial.lastPaymentDate,
  };
}
