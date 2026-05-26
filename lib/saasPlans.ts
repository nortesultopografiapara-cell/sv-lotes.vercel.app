/**
 * Limites centralizados dos planos SaaS.
 * Toda validação deve usar getCompanySaasPlan(company) — sem mocks/hardcode.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

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

const PLAN_FIELD_PRIORITY = [
  'saas_plan',
  'subscription_plan',
  'plan_type',
  'plan',
  'module_plan',
  'module_type',
] as const;

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Normaliza qualquer variação de nome de plano para basico | business | profissional */
export function normalizeSaasPlanKey(plan?: string | null): SaasPlanKey {
  const raw = stripAccents(String(plan || '').trim().toLowerCase());
  if (!raw) return 'basico';
  return PLAN_ALIAS[raw] ?? 'basico';
}

export type CompanySaasSource = {
  id?: string;
  name?: string | null;
  plan?: string | null;
  plan_type?: string | null;
  saas_plan?: string | null;
  subscription_plan?: string | null;
  module_plan?: string | null;
  module_type?: string | null;
  project_limit?: number | null;
  broker_limit?: number | null;
  max_projects?: number | null;
  max_brokers?: number | null;
  metadata?: Record<string, unknown> | null;
};

function readMetadataPlan(company: CompanySaasSource, key: 'plan' | 'saas_plan'): string | null {
  const md = company.metadata;
  if (!md || typeof md !== 'object') return null;
  const value = (md as Record<string, unknown>)[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

/** Coleta valores de plano na ordem de prioridade do produto. */
export function collectCompanyPlanValues(company?: CompanySaasSource | null): string[] {
  if (!company) return [];

  const values: string[] = [];
  const push = (raw: unknown) => {
    if (raw == null) return;
    const text = String(raw).trim();
    if (text) values.push(text);
  };

  for (const field of PLAN_FIELD_PRIORITY) {
    push(company[field]);
  }

  push(readMetadataPlan(company, 'plan'));
  push(readMetadataPlan(company, 'saas_plan'));

  return values;
}

function pickHighestPlanKey(keys: SaasPlanKey[]): SaasPlanKey {
  if (keys.includes('profissional')) return 'profissional';
  if (keys.includes('business')) return 'business';
  if (keys.length > 0) return keys[0];
  return 'basico';
}

function inferPlanKeyFromLimits(company: CompanySaasSource): SaasPlanKey | null {
  const maxProjects = company.max_projects ?? company.project_limit;
  if (maxProjects == null || maxProjects < 0) return null;
  if (maxProjects >= 25) return 'profissional';
  if (maxProjects >= 6) return 'business';
  if (maxProjects >= 3) return 'basico';
  return null;
}

export type CompanySaasPlanResolved = {
  planKey: SaasPlanKey;
  rawPlan: string | null;
  allRawPlans: string[];
  maxProjects: number;
  maxBrokers: number;
  displayName: string;
  legacyDbPlan: string;
};

/**
 * Plano SaaS efetivo da empresa.
 * Não cai em Básico se qualquer campo indicar Profissional ou Business.
 */
export function getCompanySaasPlan(company?: CompanySaasSource | null): CompanySaasPlanResolved {
  const allRawPlans = collectCompanyPlanValues(company);
  const normalizedKeys = allRawPlans.map((v) => normalizeSaasPlanKey(v));
  const limitHint = company ? inferPlanKeyFromLimits(company) : null;
  const mergedKeys = limitHint ? [...normalizedKeys, limitHint] : normalizedKeys;

  let planKey = pickHighestPlanKey(mergedKeys);
  if (mergedKeys.length === 0) planKey = 'basico';

  const config = SAAS_PLANS[planKey];
  const rawPlan =
    allRawPlans.find((v) => normalizeSaasPlanKey(v) === planKey) ??
    allRawPlans[0] ??
    null;

  return {
    planKey,
    rawPlan,
    allRawPlans,
    maxProjects: config.maxProjects,
    maxBrokers: config.maxBrokers,
    displayName: getSaasPlanDisplayName(planKey),
    legacyDbPlan: saasPlanToLegacyDbKey(planKey),
  };
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

/** @deprecated Prefer getCompanySaasPlan(company) */
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

export function resolveCompanySaasLimits(company?: CompanySaasSource | null) {
  return getCompanySaasPlan(company);
}

export function saasLimitsDbPayload(plan?: string | null) {
  const resolved = getCompanySaasPlan({ plan, plan_type: plan });
  return {
    plan: resolved.legacyDbPlan,
    project_limit: resolved.maxProjects,
    broker_limit: resolved.maxBrokers,
    max_projects: resolved.maxProjects,
    max_brokers: resolved.maxBrokers,
    planKey: resolved.planKey,
  };
}

export function getSaasPlanAvailabilityMessage(company?: CompanySaasSource | null): string {
  const { displayName, maxProjects } = getCompanySaasPlan(company);
  return `Plano ${displayName}: ${maxProjects} loteamentos disponíveis`;
}

export function logSaasCompanyContext(
  tenantId: string | null | undefined,
  company: CompanySaasSource | null | undefined,
  usedProjects?: number,
  usedBrokers?: number
) {
  const resolved = getCompanySaasPlan(company);
  console.log('[SAAS] empresa atual', {
    tenantId: tenantId ?? null,
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
  });
  console.log('[SAAS] plano bruto', resolved.rawPlan ?? resolved.allRawPlans.join(' | ') || '(vazio)');
  console.log('[SAAS] plano normalizado', resolved.planKey);
  console.log('[SAAS] limite aplicado', resolved.maxProjects);
  if (usedProjects !== undefined) {
    console.log('[SAAS] projetos usados', usedProjects);
  }
  if (usedBrokers !== undefined) {
    console.log('[SAAS] corretores usados', usedBrokers);
  }
}

/** @deprecated Use logSaasCompanyContext */
export function logSaasPlanUsage(
  plan?: string | null,
  usedProjects?: number,
  usedBrokers?: number
) {
  logSaasCompanyContext(null, { plan, plan_type: plan }, usedProjects, usedBrokers);
}

export async function fetchCompanySaasByTenantId(
  client: SupabaseClient,
  tenantId: string
): Promise<CompanySaasSource | null> {
  const { data, error } = await client
    .from('companies')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    console.warn('[SAAS] erro ao carregar empresa', { tenantId, message: error.message });
    return null;
  }

  return (data as CompanySaasSource) || null;
}
