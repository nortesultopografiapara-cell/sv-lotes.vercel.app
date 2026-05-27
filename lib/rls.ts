import { resolveActiveTenantId, type TenantUser } from '@/lib/activeTenant';

export const PLATFORM_ADMIN_ROLES = ['SUPER_ADMIN', 'MASTER-ADMIN', 'MASTER_ADMIN'] as const;

export function isPlatformAdmin(role?: string | null): boolean {
  const r = (role || '').toUpperCase();
  return PLATFORM_ADMIN_ROLES.includes(r as (typeof PLATFORM_ADMIN_ROLES)[number]);
}

export function tenantOrClause(tenantId: string): string {
  return `tenant_id.eq.${tenantId},company_id.eq.${tenantId}`;
}

export type RlsContext = {
  tenantId: string | null;
  isSuperAdmin: boolean;
};

export function logRlsCompany(companyId: string | null): void {
  console.log('[RLS] empresa atual', companyId);
}

export function logRlsTenant(tenantId: string | null): void {
  console.log('[RLS] tenant atual', tenantId);
}

export function logRlsInsert(table: string, tenantId: string | null): void {
  console.log('[RLS] insert permitido', { table, tenantId });
}

export function logRlsQueryFiltered(table: string, tenantId: string | null, scoped: boolean): void {
  console.log('[RLS] query filtrada', { table, tenantId, scoped });
}

/** Resolve tenant ativo + logs padrão para depuração RLS. */
export async function resolveRlsContext(user: TenantUser | null): Promise<RlsContext> {
  const tenantId = await resolveActiveTenantId(user);
  const isSuperAdmin = isPlatformAdmin(user?.role);
  logRlsCompany(tenantId);
  logRlsTenant(tenantId);
  return { tenantId, isSuperAdmin };
}

type OrCapableQuery = { or: (filter: string) => OrCapableQuery };

/**
 * Aplica filtro tenant_id OR company_id em queries PostgREST.
 * Super admin: sem filtro no app (RLS no banco permite tudo).
 */
export function applyTenantFilter<T extends OrCapableQuery>(
  query: T,
  ctx: RlsContext,
  table: string,
): T {
  if (ctx.isSuperAdmin) {
    logRlsQueryFiltered(table, ctx.tenantId, false);
    return query;
  }
  if (!ctx.tenantId) {
    logRlsQueryFiltered(table, null, false);
    return query;
  }
  logRlsQueryFiltered(table, ctx.tenantId, true);
  return query.or(tenantOrClause(ctx.tenantId));
}

/** Filtro por tenant_id apenas (tabelas sem company_id). */
export function applyTenantIdEq<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  ctx: RlsContext,
  table: string,
  column: 'tenant_id' | 'company_id' = 'tenant_id',
): T {
  if (ctx.isSuperAdmin) {
    logRlsQueryFiltered(table, ctx.tenantId, false);
    return query;
  }
  if (!ctx.tenantId) {
    logRlsQueryFiltered(table, null, false);
    return query;
  }
  logRlsQueryFiltered(table, ctx.tenantId, true);
  return query.eq(column, ctx.tenantId);
}

/** Garante tenant_id e company_id em payloads de insert/update. */
export function withTenantFields(
  payload: Record<string, unknown>,
  tenantId: string | null,
  table?: string,
): Record<string, unknown> {
  if (!tenantId) return payload;
  logRlsInsert(table ?? 'unknown', tenantId);
  return {
    ...payload,
    tenant_id: payload.tenant_id ?? tenantId,
    company_id: payload.company_id ?? tenantId,
  };
}
