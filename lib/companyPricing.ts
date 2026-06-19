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

/** Valor efetivo de cobrança/MRR */
export function getCompanyMonthlyPrice(company: CompanyPricingSource): number {
  if (isCustomPriceEnabled(company)) {
    const custom = parseCustomMonthlyPrice(company.custom_monthly_price);
    if (custom != null) return custom;
  }
  return getStandardPlanMonthlyPrice(company);
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

export function resolveCompanyPricing(company: CompanyPricingSource) {
  const saas = getCompanySaasPlan(company);
  const planLabel =
    saas.planKey === 'profissional'
      ? 'PROFESSIONAL'
      : saas.planKey === 'business'
        ? 'ENTERPRISE'
        : 'STARTER';

  const standardPrice = getStandardPlanMonthlyPrice(company);
  const appliedPrice = getCompanyMonthlyPrice(company);
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
