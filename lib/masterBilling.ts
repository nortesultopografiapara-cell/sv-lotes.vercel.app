/**
 * Utilitários de billing/MRR do painel Master.
 * Preços efetivos: lib/companyPricing.ts
 */

import { getCompanySaasPlan } from '@/lib/saasPlans';
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

export function augmentCompanyBilling<T extends CompanyLike>(company: T) {
  const resolved = resolveCompanyPricing(company);
  const uiPlan =
    resolved.planKey === 'profissional'
      ? 'PROFISSIONAL'
      : resolved.planKey === 'business'
        ? 'BUSINESS'
        : 'BÁSICO';

  const active = isActiveSubscriptionCompany(company);
  const rawDue =
    (company as { vencimento_plano?: string | null }).vencimento_plano ||
    (company as { due_date?: string | null }).due_date;

  return {
    ...company,
    ui_plan: uiPlan,
    pricing: resolved,
    price: resolved.appliedPrice,
    standard_price: resolved.standardPrice,
    custom_price_enabled: resolved.customEnabled,
    has_custom_price: resolved.hasCustomPrice,
    payment_status: active ? ('Aguardando cobrança' as const) : ('Inativo' as const),
    subscription_status:
      (company.status_operacional || '').toLowerCase() === 'inadimplente'
        ? ('Inadimplente' as const)
        : active
          ? ('Ativa' as const)
          : ('Inativa' as const),
    next_billing: rawDue || null,
    last_billing: null as string | null,
  };
}
