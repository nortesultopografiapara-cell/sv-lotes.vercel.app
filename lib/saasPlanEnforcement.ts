/**
 * Enforcement central dos limites SaaS por tenant.
 * Planos padrão → catálogo. Personalizado → limites manuais do banco.
 * Limite null = sem limite definido → não bloqueia.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  filterBrokersForActiveList,
  type BrokerRow,
} from '@/lib/brokerDelete';
import { MENESES_COMPANY_ID } from '@/lib/saasContractContent';
import {
  type CompanySaasSource,
  fetchCompanySaasByTenantId,
  getCompanySaasPlan,
} from '@/lib/saasPlans';
import {
  formatAdminsLimitMessage,
  formatBrokersLimitMessage,
  formatLotsLimitMessage,
  formatProjectLimitMessage,
} from '@/lib/saasPlanEnforcementMessages';

export {
  formatAdminsLimitMessage,
  formatBrokersLimitMessage,
  formatLotsLimitMessage,
  formatProjectLimitMessage,
} from '@/lib/saasPlanEnforcementMessages';

const COMPANY_ADMIN_ROLE_VALUES = [
  'ADMIN',
  'ADMIN_EMPRESA',
  'COMPANY_ADMIN',
] as const;

const MENESES_COMPANY_ADMIN_USERS_LIMIT = 5;

function countActiveCompanyAdmins(rows: { status?: string | null }[]): number {
  return rows.filter(
    (row) => String(row.status || 'ACTIVE').trim().toUpperCase() !== 'INACTIVE',
  ).length;
}

export type TenantUsage = {
  projects: number;
  lots: number;
  activeBrokers: number;
  activeAdmins: number;
};

export type TenantLimits = {
  maxProjects: number | null;
  maxLots: number | null;
  maxBrokers: number | null;
  maxAdmins: number | null;
  planDisplayName: string;
};

export type SaasEnforcementResult = {
  allowed: boolean;
  code?: string;
  message?: string;
  usage?: TenantUsage;
  limits?: TenantLimits;
};

export type SaasEnforcementOptions = {
  isPlatformAdmin?: boolean;
  skipEnforcement?: boolean;
};

function isEnforcementSkipped(options?: SaasEnforcementOptions): boolean {
  return options?.isPlatformAdmin === true || options?.skipEnforcement === true;
}

function isLimitReached(used: number, limit: number | null): boolean {
  if (limit == null) return false;
  return used >= limit;
}

function wouldExceedLimit(current: number, adding: number, limit: number | null): boolean {
  if (limit == null) return false;
  return current + Math.max(0, Math.trunc(adding)) > limit;
}

export function getTenantLimits(company?: CompanySaasSource | null): TenantLimits {
  const saas = getCompanySaasPlan(company);
  return {
    maxProjects: saas.maxProjects,
    maxLots: saas.maxLots,
    maxBrokers: saas.maxBrokers,
    maxAdmins: saas.maxAdmins,
    planDisplayName: saas.displayName,
  };
}

export async function getTenantUsage(
  client: SupabaseClient,
  companyId: string,
): Promise<TenantUsage> {
  const tenantFilter = `tenant_id.eq.${companyId},company_id.eq.${companyId}`;

  const [projectsRes, blocksRes, brokersRes, adminsRes] = await Promise.all([
    client
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', companyId),
    client.from('blocks').select('id', { count: 'exact', head: true }).or(tenantFilter),
    client
      .from('brokers')
      .select('id, active, status, deleted_at, tenant_id, company_id')
      .or(tenantFilter),
    client
      .from('users')
      .select('id, status, role, tenant_id')
      .eq('tenant_id', companyId)
      .in('role', [...COMPANY_ADMIN_ROLE_VALUES]),
  ]);

  return {
    projects: projectsRes.count ?? 0,
    lots: blocksRes.count ?? 0,
    activeBrokers: filterBrokersForActiveList((brokersRes.data || []) as BrokerRow[]).length,
    activeAdmins: countActiveCompanyAdmins(
      (adminsRes.data || []).map((row) => ({
        status: String(row.status || 'ACTIVE'),
      })),
    ),
  };
}

export async function resolveTenantAdminLimit(
  client: SupabaseClient,
  companyId: string,
  company?: CompanySaasSource | null,
): Promise<number | null> {
  const row = company ?? (await fetchCompanySaasByTenantId(client, companyId));
  const limits = getTenantLimits(row);
  if (limits.maxAdmins != null) return limits.maxAdmins;
  if (!row && companyId === MENESES_COMPANY_ID) {
    return MENESES_COMPANY_ADMIN_USERS_LIMIT;
  }
  return null;
}

async function loadEnforcementContext(
  client: SupabaseClient,
  companyId: string,
): Promise<{ usage: TenantUsage; limits: TenantLimits }> {
  const company = await fetchCompanySaasByTenantId(client, companyId);
  const [usage, limits] = await Promise.all([
    getTenantUsage(client, companyId),
    Promise.resolve(getTenantLimits(company)),
  ]);
  return { usage, limits };
}

function allowed(usage: TenantUsage, limits: TenantLimits): SaasEnforcementResult {
  return { allowed: true, usage, limits };
}

function denied(
  code: string,
  message: string,
  usage: TenantUsage,
  limits: TenantLimits,
): SaasEnforcementResult {
  return { allowed: false, code, message, usage, limits };
}

export function evaluateCanCreateProject(
  usage: TenantUsage,
  limits: TenantLimits,
  options?: SaasEnforcementOptions,
): SaasEnforcementResult {
  if (isEnforcementSkipped(options)) return allowed(usage, limits);
  if (isLimitReached(usage.projects, limits.maxProjects)) {
    return denied(
      'SAAS_PROJECT_LIMIT',
      formatProjectLimitMessage(limits.maxProjects!),
      usage,
      limits,
    );
  }
  return allowed(usage, limits);
}

export function evaluateCanImportLots(
  usage: TenantUsage,
  limits: TenantLimits,
  quantityToAdd: number,
  options?: SaasEnforcementOptions,
): SaasEnforcementResult {
  const qty = Math.max(0, Math.trunc(quantityToAdd));
  if (qty === 0 || isEnforcementSkipped(options)) return allowed(usage, limits);
  const limit = limits.maxLots;
  if (limit == null) return allowed(usage, limits);
  if (wouldExceedLimit(usage.lots, qty, limit)) {
    return denied(
      'SAAS_LOTS_LIMIT',
      formatLotsLimitMessage(limit, usage.lots, qty),
      usage,
      limits,
    );
  }
  return allowed(usage, limits);
}

export function evaluateCanCreateBroker(
  usage: TenantUsage,
  limits: TenantLimits,
  options?: SaasEnforcementOptions,
): SaasEnforcementResult {
  if (isEnforcementSkipped(options)) return allowed(usage, limits);
  if (isLimitReached(usage.activeBrokers, limits.maxBrokers)) {
    return denied(
      'SAAS_BROKER_LIMIT',
      formatBrokersLimitMessage(limits.maxBrokers!),
      usage,
      limits,
    );
  }
  return allowed(usage, limits);
}

export function evaluateCanCreateAdmin(
  usage: TenantUsage,
  limits: TenantLimits,
  options?: SaasEnforcementOptions,
): SaasEnforcementResult {
  if (isEnforcementSkipped(options)) return allowed(usage, limits);
  if (isLimitReached(usage.activeAdmins, limits.maxAdmins)) {
    return denied(
      'SAAS_ADMIN_LIMIT',
      formatAdminsLimitMessage(limits.maxAdmins!),
      usage,
      limits,
    );
  }
  return allowed(usage, limits);
}

export async function canCreateProject(
  client: SupabaseClient,
  companyId: string,
  options?: SaasEnforcementOptions,
): Promise<SaasEnforcementResult> {
  const ctx = await loadEnforcementContext(client, companyId);
  return evaluateCanCreateProject(ctx.usage, ctx.limits, options);
}

export async function canImportLots(
  client: SupabaseClient,
  companyId: string,
  quantityToAdd: number,
  options?: SaasEnforcementOptions,
): Promise<SaasEnforcementResult> {
  const ctx = await loadEnforcementContext(client, companyId);
  return evaluateCanImportLots(ctx.usage, ctx.limits, quantityToAdd, options);
}

export async function canCreateBroker(
  client: SupabaseClient,
  companyId: string,
  options?: SaasEnforcementOptions,
): Promise<SaasEnforcementResult> {
  const ctx = await loadEnforcementContext(client, companyId);
  return evaluateCanCreateBroker(ctx.usage, ctx.limits, options);
}

export async function canReactivateBroker(
  client: SupabaseClient,
  companyId: string,
  options?: SaasEnforcementOptions,
): Promise<SaasEnforcementResult> {
  return canCreateBroker(client, companyId, options);
}

export async function canCreateAdmin(
  client: SupabaseClient,
  companyId: string,
  options?: SaasEnforcementOptions,
): Promise<SaasEnforcementResult> {
  const ctx = await loadEnforcementContext(client, companyId);
  return evaluateCanCreateAdmin(ctx.usage, ctx.limits, options);
}

export async function canReactivateAdmin(
  client: SupabaseClient,
  companyId: string,
  options?: SaasEnforcementOptions,
): Promise<SaasEnforcementResult> {
  return canCreateAdmin(client, companyId, options);
}
