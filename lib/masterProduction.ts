/**
 * Utilitários do painel Master (MRR, billing, cleanup).
 * Listagem de empresas: SEM filtro — ver app/companies/page.tsx
 */

import { getCompanySaasPlan } from '@/lib/saasPlans';

export type CompanyLike = {
  id?: string;
  name?: string | null;
  fantasy_name?: string | null;
  slug?: string | null;
  email?: string | null;
  status_operacional?: string | null;
  is_test?: boolean | null;
  is_test_company?: boolean | null;
  is_master?: boolean | null;
  tenant_id?: string | null;
};

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isCompanyMarkedAsTest(company: CompanyLike): boolean {
  return company?.is_test_company === true || company?.is_test === true;
}

export function isTestCompany(company: CompanyLike): boolean {
  return isCompanyMarkedAsTest(company);
}

/** Heurística apenas para API /api/companies/cleanup */
export function isTestCompanyForCleanup(company: CompanyLike): boolean {
  if (isCompanyMarkedAsTest(company)) return true;

  const status = (company.status_operacional || '').toLowerCase().trim();
  if (status === 'teste') return true;

  const blob = [company.name, company.fantasy_name, company.slug, company.email]
    .map((v) => (v || '').toLowerCase().trim())
    .join(' ');

  const cleanupHints = ['demo', 'mock', 'fake', 'sandbox', 'preview.local', 'tenant-test'];
  if (cleanupHints.some((hint) => blob.includes(hint))) return true;
  if (/\bteste\b/.test(blob) && !blob.includes('topografia')) return true;

  return false;
}

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

export function calculateMrrFromCompanies(companies: CompanyLike[]): number {
  return companies.reduce((sum, c) => {
    const active =
      (c.status_operacional || '').toLowerCase() !== 'inativo' &&
      (c.status_operacional || '').toLowerCase() !== 'inativa' &&
      (c as { active?: boolean }).active !== false;
    if (!active) return sum;
    return sum + planMrrForCompany((c as { plan?: string }).plan);
  }, 0);
}

export function isActiveSubscriptionCompany(company: CompanyLike): boolean {
  const status = (company.status_operacional || '').toLowerCase().trim();
  if (['inativo', 'inativa', 'bloqueada', 'suspensa'].includes(status)) return false;
  return (company as { active?: boolean }).active !== false;
}

export function augmentCompanyBilling<T extends CompanyLike & { plan?: string | null }>(
  company: T,
) {
  const planKey = getCompanySaasPlan(company).planKey;
  const uiPlan =
    planKey === 'profissional'
      ? 'PROFISSIONAL'
      : planKey === 'business'
        ? 'BUSINESS'
        : 'BÁSICO';

  const price = planMrrForCompany(company.plan);
  const active = isActiveSubscriptionCompany(company);
  const rawDue =
    (company as { vencimento_plano?: string }).vencimento_plano ||
    (company as { due_date?: string }).due_date;

  return {
    ...company,
    ui_plan: uiPlan,
    price,
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
