/**
 * Limites centralizados dos planos SaaS.
 * Toda validação deve usar company.plan + este módulo (sem mocks/hardcode).
 */

export const SAAS_PLANS = {
  basico: {
    maxProjects: 3,
    maxBrokers: 5,
  },
  business: {
    maxProjects: 6,
    maxBrokers: 10,
  },
  profissional: {
    maxProjects: 25,
    maxBrokers: 50,
  },
} as const;

export type SaasPlanKey = keyof typeof SAAS_PLANS;

const PLAN_ALIAS: Record<string, SaasPlanKey> = {
  basic: 'basico',
  basico: 'basico',
  starter: 'basico',

  standard: 'business',
  business: 'business',

  professional: 'profissional',
  profissional: 'profissional',
  enterprise: 'profissional',
  premium: 'profissional',
};

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Normaliza qualquer variação de nome de plano para basico | business | profissional */
export function normalizeSaasPlanKey(plan?: string | null): SaasPlanKey {
  const raw = stripAccents(String(plan || '').trim().toLowerCase());
  return PLAN_ALIAS[raw] ?? 'basico';
}

export function getSaasPlanDisplayName(planKey: SaasPlanKey): string {
  const labels: Record<SaasPlanKey, string> = {
    basico: 'Básico',
    business: 'Business',
    profissional: 'Profissional',
  };
  return labels[planKey];
}

/** Chave legada usada no cadastro (basic | standard | professional) */
export function saasPlanToLegacyDbKey(planKey: SaasPlanKey): string {
  const map: Record<SaasPlanKey, string> = {
    basico: 'basic',
    business: 'standard',
    profissional: 'professional',
  };
  return map[planKey];
}

export function getSaasPlanLimits(plan?: string | null) {
  const planKey = normalizeSaasPlanKey(plan);
  const config = SAAS_PLANS[planKey];
  return {
    planKey,
    maxProjects: config.maxProjects,
    maxBrokers: config.maxBrokers,
    displayName: getSaasPlanDisplayName(planKey),
    legacyDbPlan: saasPlanToLegacyDbKey(planKey),
  };
}

export type CompanyPlanSource = {
  plan?: string | null;
  plan_type?: string | null;
};

export function resolveCompanySaasLimits(company: CompanyPlanSource) {
  const planRaw = company.plan ?? company.plan_type ?? '';
  return getSaasPlanLimits(planRaw);
}

export function saasLimitsDbPayload(plan?: string | null) {
  const { planKey, maxProjects, maxBrokers, legacyDbPlan } = getSaasPlanLimits(plan);
  return {
    plan: legacyDbPlan,
    project_limit: maxProjects,
    broker_limit: maxBrokers,
    max_projects: maxProjects,
    max_brokers: maxBrokers,
    planKey,
  };
}

export function getSaasPlanAvailabilityMessage(plan?: string | null): string {
  const { displayName, maxProjects } = getSaasPlanLimits(plan);
  return `Plano ${displayName}: ${maxProjects} loteamentos disponíveis`;
}

export function logSaasPlanUsage(
  plan?: string | null,
  usedProjects?: number,
  usedBrokers?: number
) {
  const { planKey, maxProjects, maxBrokers } = getSaasPlanLimits(plan);
  console.log(`[SAAS] plano detectado: ${planKey}`);
  console.log(`[SAAS] limite projetos: ${maxProjects}`);
  if (usedProjects !== undefined) {
    console.log(`[SAAS] projetos utilizados: ${usedProjects}`);
  }
  if (usedBrokers !== undefined) {
    console.log(`[SAAS] limite corretores: ${maxBrokers}`);
    console.log(`[SAAS] corretores utilizados: ${usedBrokers}`);
  }
}
