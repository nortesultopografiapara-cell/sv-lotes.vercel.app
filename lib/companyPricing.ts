/**
 * Preço SaaS por empresa: padrão do plano ou valor personalizado negociado.
 * O plano define limites (projetos/corretores); o preço é independente.
 */

import { parseCurrencyBRL } from '@/lib/currencyBrl';
import { getCompanySaasPlan, type CompanySaasSource } from '@/lib/saasPlans';

export const PLAN_MRR: Record<string, number> = {
  starter: 329.99,
  basic: 329.99,
  basico: 329.99,
  business: 549.99,
  standard: 549.99,
  professional: 1099.99,
  profissional: 1099.99,
  enterprise: 1099.99,
  premium: 1099.99,
};

export function planMrrForCompany(plan?: string | null): number {
  const key = (plan || '').toLowerCase().trim();
  return PLAN_MRR[key] ?? 0;
}

export type CustomPriceBadge = 'desconto_especial' | 'founding_client' | null;

export type CompanyPricingSource = CompanySaasSource & {
  custom_monthly_price?: number | string | null;
  custom_price_enabled?: boolean | null;
  custom_price_badge?: string | null;
  active?: boolean | null;
  status_operacional?: string | null;
};

export function formatSaasCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function getStandardPlanMonthlyPrice(company: CompanySaasSource): number {
  const saas = getCompanySaasPlan(company);
  return planMrrForCompany(saas.legacyDbPlan);
}

export function parseCustomMonthlyPrice(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    return Math.round(raw * 100) / 100;
  }
  return parseCurrencyBRL(String(raw));
}

/** Aceita boolean Postgres, string ou número vindos do Supabase/API */
export function isCustomPriceEnabled(company: CompanyPricingSource): boolean {
  const v = company.custom_price_enabled as unknown;
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim();
    return s === 'true' || s === 't' || s === '1' || s === 'yes' || s === 'sim';
  }
  return false;
}

export type SaasSubscriptionPriceSource = {
  monthly_price?: number | string | null;
};

export type SaasEffectivePriceSource = 'custom' | 'subscription' | 'plan';

export type SaasEffectivePriceDiagnostic = {
  company_id?: string;
  plan: string | null;
  custom_price_enabled: boolean;
  custom_price: number | null;
  subscription_amount: number | null;
  plan_price: number;
  effective_amount: number;
  billing_type?: string;
  source: SaasEffectivePriceSource;
};

function parseSubscriptionMonthlyPrice(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Preço SaaS efetivo — prioridade:
 * 1. preço personalizado ativo da empresa;
 * 2. preço da assinatura, se existir;
 * 3. preço padrão do plano.
 */
export function resolveEffectiveSaasPrice(
  company: CompanyPricingSource,
  subscription?: SaasSubscriptionPriceSource | null,
  options?: { companyId?: string; billingType?: string },
): SaasEffectivePriceDiagnostic {
  const saas = getCompanySaasPlan(company);
  const planPrice = getStandardPlanMonthlyPrice(company);
  const customEnabled = isCustomPriceEnabled(company);
  const customPrice = customEnabled
    ? parseCustomMonthlyPrice(company.custom_monthly_price)
    : null;
  const subscriptionAmount = parseSubscriptionMonthlyPrice(subscription?.monthly_price);

  let effectiveAmount = planPrice;
  let source: SaasEffectivePriceSource = 'plan';

  if (customEnabled && customPrice != null) {
    effectiveAmount = customPrice;
    source = 'custom';
  } else if (subscriptionAmount != null) {
    effectiveAmount = subscriptionAmount;
    source = 'subscription';
  }

  return {
    company_id: options?.companyId,
    plan: saas.legacyDbPlan || company.plan || company.plan_type || null,
    custom_price_enabled: customEnabled,
    custom_price: customPrice,
    subscription_amount: subscriptionAmount,
    plan_price: planPrice,
    effective_amount: effectiveAmount,
    billing_type: options?.billingType,
    source,
  };
}

/** Valor efetivo de cobrança/MRR */
export function getCompanyMonthlyPrice(
  company: CompanyPricingSource,
  subscription?: SaasSubscriptionPriceSource | null,
): number {
  return resolveEffectiveSaasPrice(company, subscription).effective_amount;
}

export function normalizeCustomPriceBadge(raw?: string | null): CustomPriceBadge {
  const v = (raw || '').toLowerCase().trim();
  if (v === 'founding_client' || v === 'founding') return 'founding_client';
  if (v === 'desconto_especial' || v === 'desconto') return 'desconto_especial';
  return null;
}

export function customPriceBadgeLabel(badge: CustomPriceBadge): string | null {
  if (badge === 'founding_client') return 'FOUNDING CLIENT';
  if (badge === 'desconto_especial') return 'DESCONTO ESPECIAL';
  return null;
}

export function resolveCompanyPricing(
  company: CompanyPricingSource,
  subscription?: SaasSubscriptionPriceSource | null,
) {
  const saas = getCompanySaasPlan(company);
  const planLabel =
    saas.planKey === 'profissional'
      ? 'PROFESSIONAL'
      : saas.planKey === 'business'
        ? 'ENTERPRISE'
        : 'STARTER';

  const standardPrice = getStandardPlanMonthlyPrice(company);
  const appliedPrice = getCompanyMonthlyPrice(company, subscription);
  const customEnabled = isCustomPriceEnabled(company);
  const badge = normalizeCustomPriceBadge(company.custom_price_badge);

  return {
    planKey: saas.planKey,
    planDisplayName: saas.displayName,
    planLabel,
    standardPrice,
    appliedPrice,
    customEnabled,
    hasCustomPrice: customEnabled && Math.abs(appliedPrice - standardPrice) > 0.009,
    badge,
    badgeLabel: customPriceBadgeLabel(badge),
    savings: Math.max(0, standardPrice - appliedPrice),
  };
}

export function isBillableCompany(company: CompanyPricingSource): boolean {
  if (company.active === false) return false;
  const status = (company.status_operacional || '').toLowerCase();
  return !['suspensa', 'bloqueada', 'inativo', 'inativa'].includes(status);
}

export function calculateMrrFromCompanies(companies: CompanyPricingSource[]): number {
  return companies.reduce((sum, c) => {
    if (!isBillableCompany(c)) return sum;
    return sum + getCompanyMonthlyPrice(c);
  }, 0);
}
