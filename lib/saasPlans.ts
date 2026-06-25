/**
 * Configuração centralizada dos planos SaaS (landing + Master + contratos).
 * Toda validação deve usar getCompanySaasPlan(company) — sem mocks/hardcode.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type SaasPlanKey = 'basico' | 'business' | 'profissional' | 'personalizado';

export type SaasPlanConfig = {
  key: SaasPlanKey;
  label: string;
  /** Chave legada gravada em plan / plan_type */
  legacyDbKey: string;
  monthlyPrice: number | null;
  maxProjects: number | null;
  maxLots: number | null;
  maxBrokers: number | null;
  maxAdmins: number | null;
  /** Ordem no dropdown Master */
  sortOrder: number;
};

export const SAAS_PLAN_CATALOG: Record<SaasPlanKey, SaasPlanConfig> = {
  basico: {
    key: 'basico',
    label: 'Básico',
    legacyDbKey: 'basic',
    monthlyPrice: 499.9,
    maxProjects: 1,
    maxLots: 500,
    maxBrokers: 3,
    maxAdmins: 1,
    sortOrder: 1,
  },
  business: {
    key: 'business',
    label: 'Business',
    legacyDbKey: 'standard',
    monthlyPrice: 799.9,
    maxProjects: 2,
    maxLots: 1000,
    maxBrokers: 5,
    maxAdmins: 2,
    sortOrder: 2,
  },
  profissional: {
    key: 'profissional',
    label: 'Profissional',
    legacyDbKey: 'professional',
    monthlyPrice: 1199.9,
    maxProjects: 5,
    maxLots: 2500,
    maxBrokers: 10,
    maxAdmins: 3,
    sortOrder: 3,
  },
  personalizado: {
    key: 'personalizado',
    label: 'Personalizado',
    legacyDbKey: 'custom',
    monthlyPrice: null,
    maxProjects: null,
    maxLots: null,
    maxBrokers: null,
    maxAdmins: null,
    sortOrder: 4,
  },
};

/** @deprecated use SAAS_PLAN_CATALOG */
export const SAAS_PLANS = {
  basico: {
    maxProjects: SAAS_PLAN_CATALOG.basico.maxProjects!,
    maxBrokers: SAAS_PLAN_CATALOG.basico.maxBrokers!,
  },
  business: {
    maxProjects: SAAS_PLAN_CATALOG.business.maxProjects!,
    maxBrokers: SAAS_PLAN_CATALOG.business.maxBrokers!,
  },
  profissional: {
    maxProjects: SAAS_PLAN_CATALOG.profissional.maxProjects!,
    maxBrokers: SAAS_PLAN_CATALOG.profissional.maxBrokers!,
  },
} as const;

export const MASTER_SAAS_PLAN_OPTIONS = (
  Object.values(SAAS_PLAN_CATALOG) as SaasPlanConfig[]
)
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((plan) => ({
    value: plan.legacyDbKey,
    label: plan.label,
    planKey: plan.key,
  }));

const PLAN_ALIAS: Record<string, SaasPlanKey> = {
  basic: 'basico',
  basico: 'basico',
  'básico': 'basico',
  starter: 'basico',

  standard: 'business',
  business: 'business',

  professional: 'profissional',
  profissional: 'profissional',
  enterprise: 'profissional',

  premium: 'personalizado',
  personalizado: 'personalizado',
  custom: 'personalizado',
};

const PLAN_FIELD_PRIORITY = [
  'saas_plan',
  'subscription_plan',
  'plan_type',
  'plan',
  'module_plan',
  'module_type',
] as const;

const PLAN_TIER_RANK: Record<SaasPlanKey, number> = {
  basico: 1,
  business: 2,
  profissional: 3,
  personalizado: 0,
};

export type SaasLimitUsageLevel = 'ok' | 'warning' | 'danger' | 'unlimited';

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
  max_lots?: number | null;
  admin_users_limit?: number | null;
  admin_limit?: number | null;
  saas_commercial_note?: string | null;
  custom_monthly_price?: number | string | null;
  custom_price_enabled?: boolean | null;
  metadata?: Record<string, unknown> | null;
};

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Normaliza qualquer variação de nome de plano para a chave canônica. */
export function normalizeSaasPlanKey(plan?: string | null): SaasPlanKey {
  const raw = stripAccents(String(plan || '').trim().toLowerCase());
  if (!raw) return 'basico';
  return PLAN_ALIAS[raw] ?? 'basico';
}

/** Exibe o nome comercial do plano (Standard → Business, Premium → Personalizado). */
export function getSaasPlanDisplayName(planKey: SaasPlanKey): string {
  return SAAS_PLAN_CATALOG[planKey].label;
}

export function getSaasPlanDisplayNameFromRaw(plan?: string | null): string {
  return getSaasPlanDisplayName(normalizeSaasPlanKey(plan));
}

/** Valor legado do dropdown / banco a partir da chave canônica. */
export function saasPlanToLegacyDbKey(planKey: SaasPlanKey): string {
  return SAAS_PLAN_CATALOG[planKey].legacyDbKey;
}

/** Valor do dropdown Master ao carregar empresa existente. */
export function legacyDbKeyForForm(plan?: string | null): string {
  const key = normalizeSaasPlanKey(plan);
  return SAAS_PLAN_CATALOG[key].legacyDbKey;
}

export function isPersonalizadoPlanKey(planKey: SaasPlanKey): boolean {
  return planKey === 'personalizado';
}

export function isPersonalizadoPlan(plan?: string | null): boolean {
  return normalizeSaasPlanKey(plan) === 'personalizado';
}

function readMetadataPlan(company: CompanySaasSource, key: 'plan' | 'saas_plan'): string | null {
  const md = company.metadata;
  if (!md || typeof md !== 'object') return null;
  const value = (md as Record<string, unknown>)[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

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
  let best: SaasPlanKey = 'basico';
  let bestRank = 0;
  for (const key of keys) {
    const rank = PLAN_TIER_RANK[key];
    if (rank > bestRank) {
      bestRank = rank;
      best = key;
    }
  }
  if (keys.includes('personalizado') && bestRank === 0) {
    return 'personalizado';
  }
  return best;
}

function readStoredLimit(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (value == null) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) continue;
    return Math.trunc(n);
  }
  return null;
}

function resolveEffectiveLimits(
  planKey: SaasPlanKey,
  company?: CompanySaasSource | null,
): {
  maxProjects: number | null;
  maxLots: number | null;
  maxBrokers: number | null;
  maxAdmins: number | null;
} {
  const catalog = SAAS_PLAN_CATALOG[planKey];

  if (planKey === 'personalizado') {
    return {
      maxProjects: readStoredLimit(company?.max_projects, company?.project_limit),
      maxLots: readStoredLimit(company?.max_lots),
      maxBrokers: readStoredLimit(company?.max_brokers, company?.broker_limit),
      maxAdmins: readStoredLimit(company?.admin_users_limit, company?.admin_limit),
    };
  }

  return {
    maxProjects:
      readStoredLimit(company?.max_projects, company?.project_limit) ?? catalog.maxProjects,
    maxLots: readStoredLimit(company?.max_lots) ?? catalog.maxLots,
    maxBrokers:
      readStoredLimit(company?.max_brokers, company?.broker_limit) ?? catalog.maxBrokers,
    maxAdmins:
      readStoredLimit(company?.admin_users_limit, company?.admin_limit) ?? catalog.maxAdmins,
  };
}

export type CompanySaasPlanResolved = {
  planKey: SaasPlanKey;
  rawPlan: string | null;
  allRawPlans: string[];
  maxProjects: number | null;
  maxLots: number | null;
  maxBrokers: number | null;
  maxAdmins: number | null;
  displayName: string;
  legacyDbPlan: string;
  monthlyPrice: number | null;
  isPersonalizado: boolean;
  commercialNote: string | null;
};

export function getCompanySaasPlan(company?: CompanySaasSource | null): CompanySaasPlanResolved {
  const allRawPlans = collectCompanyPlanValues(company);
  const normalizedKeys = allRawPlans.map((v) => normalizeSaasPlanKey(v));
  let planKey = pickHighestPlanKey(normalizedKeys.length > 0 ? normalizedKeys : ['basico']);

  const config = SAAS_PLAN_CATALOG[planKey];
  const limits = resolveEffectiveLimits(planKey, company);
  const rawPlan =
    allRawPlans.find((v) => normalizeSaasPlanKey(v) === planKey) ??
    allRawPlans[0] ??
    null;

  const legacyDbPlan =
    planKey === 'personalizado' && rawPlan
      ? String(rawPlan).trim().toLowerCase() === 'premium'
        ? 'premium'
        : config.legacyDbKey
      : config.legacyDbKey;

  return {
    planKey,
    rawPlan,
    allRawPlans,
    maxProjects: limits.maxProjects,
    maxLots: limits.maxLots,
    maxBrokers: limits.maxBrokers,
    maxAdmins: limits.maxAdmins,
    displayName: config.label,
    legacyDbPlan,
    monthlyPrice: config.monthlyPrice,
    isPersonalizado: planKey === 'personalizado',
    commercialNote: String(company?.saas_commercial_note ?? '').trim() || null,
  };
}

export type SaasPlanManualOverrides = {
  max_projects?: number | null;
  max_lots?: number | null;
  max_brokers?: number | null;
  admin_users_limit?: number | null;
  saas_commercial_note?: string | null;
};

export function saasLimitsDbPayload(
  plan?: string | null,
  overrides?: SaasPlanManualOverrides,
) {
  const planKey = normalizeSaasPlanKey(plan);
  const config = SAAS_PLAN_CATALOG[planKey];
  const isCustom = planKey === 'personalizado';

  const maxProjects = isCustom
    ? readStoredLimit(overrides?.max_projects)
    : config.maxProjects;
  const maxLots = isCustom ? readStoredLimit(overrides?.max_lots) : config.maxLots;
  const maxBrokers = isCustom
    ? readStoredLimit(overrides?.max_brokers)
    : config.maxBrokers;
  const maxAdmins = isCustom
    ? readStoredLimit(overrides?.admin_users_limit)
    : config.maxAdmins;

  const legacyPlan =
    String(plan || '').trim().toLowerCase() === 'premium' && isCustom
      ? 'premium'
      : config.legacyDbKey;

  return {
    plan: legacyPlan,
    project_limit: maxProjects ?? -1,
    broker_limit: maxBrokers ?? -1,
    max_projects: maxProjects,
    max_brokers: maxBrokers,
    max_lots: maxLots,
    admin_users_limit: maxAdmins,
    saas_commercial_note: isCustom
      ? String(overrides?.saas_commercial_note ?? '').trim() || null
      : null,
    planKey,
  };
}

export function formatSaasPlanLimitValue(value: number | null | undefined): string {
  if (value == null || value < 0) return 'Sem limite definido';
  return value.toLocaleString('pt-BR');
}

export function formatSaasPlanMonthlyPrice(price: number | null | undefined): string {
  if (price == null) return 'definido manualmente';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
}

export type SaasPlanSummaryLines = {
  title: string;
  monthlyPriceLine: string;
  limitLines: string[];
};

export function buildSaasPlanSummary(plan?: string | null): SaasPlanSummaryLines {
  const planKey = normalizeSaasPlanKey(plan);
  const config = SAAS_PLAN_CATALOG[planKey];

  if (planKey === 'personalizado') {
    return {
      title: `Plano ${config.label}`,
      monthlyPriceLine: 'Valor mensal e limites definidos manualmente pelo Master.',
      limitLines: [],
    };
  }

  return {
    title: `Plano ${config.label}`,
    monthlyPriceLine: `Valor mensal: ${formatSaasPlanMonthlyPrice(config.monthlyPrice)}`,
    limitLines: [
      `${config.maxProjects} loteamento${config.maxProjects === 1 ? '' : 's'}`,
      `até ${formatSaasPlanLimitValue(config.maxLots)} lotes no total`,
      `até ${config.maxBrokers} corretor${config.maxBrokers === 1 ? '' : 'es'}`,
      `${config.maxAdmins} administrador${config.maxAdmins === 1 ? '' : 'es'}`,
    ],
  };
}

export function resolveSaasLimitUsageLevel(
  used: number,
  limit: number | null | undefined,
): SaasLimitUsageLevel {
  if (limit == null || limit < 0) return 'unlimited';
  if (limit === 0) return used > 0 ? 'danger' : 'ok';
  const ratio = used / limit;
  if (ratio >= 1) return 'danger';
  if (ratio >= 0.8) return 'warning';
  return 'ok';
}

export function formatSaasUsageLabel(
  used: number,
  limit: number | null | undefined,
): string {
  if (limit == null || limit < 0) return `${used} / Sem limite definido`;
  return `${used} / ${limit.toLocaleString('pt-BR')}`;
}

/** @deprecated Prefer getCompanySaasPlan(company) */
export function getSaasPlanLimits(plan?: string | null) {
  const resolved = getCompanySaasPlan({ plan, plan_type: plan });
  return {
    planKey: resolved.planKey,
    maxProjects: resolved.maxProjects ?? 0,
    maxBrokers: resolved.maxBrokers ?? 0,
    displayName: resolved.displayName,
    legacyDbPlan: resolved.legacyDbPlan,
  };
}

export function resolveCompanySaasLimits(company?: CompanySaasSource | null) {
  return getCompanySaasPlan(company);
}

export function getSaasPlanAvailabilityMessage(company?: CompanySaasSource | null): string {
  const { displayName, maxProjects } = getCompanySaasPlan(company);
  if (maxProjects == null) {
    return `Plano ${displayName}: loteamentos conforme contrato`;
  }
  return `Plano ${displayName}: ${maxProjects} loteamento(s) disponível(is)`;
}

export function logSaasCompanyContext(
  tenantId: string | null | undefined,
  company: CompanySaasSource | null | undefined,
  usedProjects?: number,
  usedBrokers?: number,
) {
  const resolved = getCompanySaasPlan(company);
  console.log('[SAAS] empresa atual', {
    tenantId: tenantId ?? null,
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
  });
  console.log('[SAAS] plano bruto', (resolved.rawPlan ?? resolved.allRawPlans.join(' | ')) || '(vazio)');
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
  usedBrokers?: number,
) {
  logSaasCompanyContext(null, { plan, plan_type: plan }, usedProjects, usedBrokers);
}

export async function fetchCompanySaasByTenantId(
  client: SupabaseClient,
  tenantId: string,
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
