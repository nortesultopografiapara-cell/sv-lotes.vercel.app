/**
 * Utilitários de billing/MRR do painel Master.
 * Sem filtro de empresas — listagem em app/companies/page.tsx
 */

import { getCompanySaasPlan } from '@/lib/saasPlans';

export type CompanyLike = {
  id?: string;
  status_operacional?: string | null;
  plan?: string | null;
  active?: boolean | null;
};

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
      c.active !== false;
    if (!active) return sum;
    return sum + planMrrForCompany(c.plan);
  }, 0);
}

export function isActiveSubscriptionCompany(company: CompanyLike): boolean {
  const status = (company.status_operacional || '').toLowerCase().trim();
  if (['inativo', 'inativa', 'bloqueada', 'suspensa'].includes(status)) return false;
  return company.active !== false;
}

export function augmentCompanyBilling<
  T extends CompanyLike & {
    plan?: string | null;
    vencimento_plano?: string | null;
    due_date?: string | null;
  },
>(company: T) {
  const planKey = getCompanySaasPlan(company).planKey;
  const uiPlan =
    planKey === 'profissional'
      ? 'PROFISSIONAL'
      : planKey === 'business'
        ? 'BUSINESS'
        : 'BÁSICO';

  const price = planMrrForCompany(company.plan);
  const active = isActiveSubscriptionCompany(company);
  const rawDue = company.vencimento_plano || company.due_date;

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
