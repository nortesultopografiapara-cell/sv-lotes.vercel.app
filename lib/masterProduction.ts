/**
 * Filtros e utilitários do painel Master — produção sem mocks/dados de teste.
 */

import { getCompanySaasPlan, normalizeSaasPlanKey } from '@/lib/saasPlans';

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

const REAL_COMPANY_HINTS = [
  's.v topografia',
  'sv topografia',
  'norte e sul topografia',
  'nortesul',
  'norte sul topografia',
];

/** Usado apenas em rotinas de limpeza (cleanup), não na listagem Master. */
const TEST_HINTS = [
  'teste',
  'test',
  'demo',
  'mock',
  'fake',
  'sandbox',
  'empresa teste',
  'loteadora paraiso',
  'vale verde empreendimentos',
  'paraiso loteadora',
  'saas.com.br',
  'preview.local',
  'tenant-test',
];

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function masterLog(
  message: 'dados reais carregados' | 'nenhum dado real encontrado' | 'mocks removidos',
  detail?: Record<string, unknown>
) {
  const payload = detail ? ` ${JSON.stringify(detail)}` : '';
  console.log(`[MASTER] ${message}${payload}`);
}

function normalize(value?: string | null): string {
  return (value || '').toLowerCase().trim();
}

/** Empresas operacionais reais da SV (sempre mantidas na listagem). */
export function isKnownRealCompany(company: CompanyLike): boolean {
  const blob = [company.name, company.fantasy_name, company.slug, company.email]
    .map(normalize)
    .join(' ');
  return REAL_COMPANY_HINTS.some((hint) => blob.includes(hint));
}

export function isTestCompany(company: CompanyLike): boolean {
  if (!company) return true;
  if (company.is_test === true) return true;

  if (isKnownRealCompany(company)) return false;

  const status = normalize(company.status_operacional);
  if (status === 'teste') return true;

  const blob = [company.name, company.fantasy_name, company.slug, company.email]
    .map(normalize)
    .join(' ');

  if (TEST_HINTS.some((hint) => blob.includes(hint))) return true;
  if (/\bteste\b/.test(blob) && !blob.includes('topografia')) return true;

  return false;
}

/** Listagem Master: oculta só empresas com flag explícita de teste (salvo toggle). */
export function filterRealCompanies<T extends CompanyLike>(
  companies: T[],
  options?: { showTestCompanies?: boolean },
): T[] {
  const show = options?.showTestCompanies ?? false;
  const list = companies || [];
  const real = show
    ? list
    : list.filter((c) => c.is_test_company !== true && c.is_test !== true);

  const removed = list.length - real.length;
  if (removed > 0) {
    masterLog('mocks removidos', { removidos: removed, exibidos: real.length });
  }
  if (real.length > 0) {
    masterLog('dados reais carregados', { total: real.length });
  } else if (list.length > 0) {
    masterLog('nenhum dado real encontrado', { totalBruto: list.length, somenteTeste: true });
  } else {
    masterLog('nenhum dado real encontrado');
  }
  return real;
}

export function masterCompaniesLog(
  message:
    | 'usuario'
    | 'isSuperAdmin'
    | 'query sem tenant'
    | 'empresas retornadas'
    | 'erro Supabase',
  detail?: Record<string, unknown> | string | boolean,
) {
  const extra =
    detail === undefined
      ? ''
      : typeof detail === 'string' || typeof detail === 'boolean'
        ? ` ${detail}`
        : ` ${JSON.stringify(detail)}`;
  console.log(`[MASTER_COMPANIES] ${message}${extra}`);
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
  const key = normalize(plan);
  return PLAN_MRR[key] ?? 0;
}

export function calculateMrrFromCompanies(companies: CompanyLike[]): number {
  return companies.reduce((sum, c) => {
    const active =
      normalize(c.status_operacional) !== 'inativo' &&
      normalize(c.status_operacional) !== 'inativa' &&
      (c as { active?: boolean }).active !== false;
    if (!active) return sum;
    return sum + planMrrForCompany((c as { plan?: string }).plan);
  }, 0);
}

export function isActiveSubscriptionCompany(company: CompanyLike): boolean {
  const status = normalize(company.status_operacional);
  if (['inativo', 'inativa', 'bloqueada', 'suspensa'].includes(status)) return false;
  return (company as { active?: boolean }).active !== false;
}

/** Dados de cobrança derivados apenas do cadastro real (sem simulação). */
export function augmentCompanyBilling<T extends CompanyLike & { plan?: string | null }>(
  company: T
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
  const rawDue = (company as { vencimento_plano?: string; due_date?: string }).vencimento_plano
    || (company as { due_date?: string }).due_date;

  return {
    ...company,
    ui_plan: uiPlan,
    price,
    payment_status: active ? ('Aguardando cobrança' as const) : ('Inativo' as const),
    subscription_status:
      normalize(company.status_operacional) === 'inadimplente'
        ? ('Inadimplente' as const)
        : active
          ? ('Ativa' as const)
          : ('Inativa' as const),
    next_billing: rawDue || null,
    last_billing: null as string | null,
  };
}
