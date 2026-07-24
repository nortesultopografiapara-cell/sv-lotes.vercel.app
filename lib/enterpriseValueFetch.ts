/**
 * Fetch paginado de lotes para indicadores de Valor do Empreendimento.
 * Evita truncamento silencioso do PostgREST (limite padrão ~1000).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { applyTenantFilter, type RlsContext } from '@/lib/rls';
import {
  calculateEnterpriseValueSummary,
  type EnterpriseLotRow,
  type EnterpriseValueSummary,
} from '@/lib/enterpriseValueSummary';

/** Página interna abaixo do teto PostgREST. */
export const ENTERPRISE_BLOCKS_FETCH_PAGE_SIZE = 1000;

/** Limite padrão silencioso do PostgREST sem .range(). */
export const POSTGREST_DEFAULT_ROW_CAP = 1000;

export const ENTERPRISE_LOT_VALUE_SELECT =
  'id, project_id, status, price, block_name, number';

export type FetchEnterpriseLotsResult = {
  rows: EnterpriseLotRow[];
  exactCount: number | null;
  pagesFetched: number;
  rowsFetched: number;
  wouldTruncateWithoutPagination: boolean;
};

type RangeQuery = {
  order: (column: string, options?: { ascending?: boolean }) => RangeQuery;
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: unknown[] | null;
    error: { message?: string; code?: string } | null;
    count?: number | null;
  }>;
};

/**
 * Simula o truncamento silencioso do PostgREST (primeira página sem paginação).
 * Útil para diagnóstico e testes — não usar em produção de UI.
 */
export function takePostgrestDefaultCap<T>(
  rows: T[],
  cap: number = POSTGREST_DEFAULT_ROW_CAP,
): T[] {
  return rows.slice(0, Math.max(0, cap));
}

/**
 * Busca TODOS os lotes (project_id, status, price) com paginação por range.
 * Ordenação estável por id para páginas determinísticas.
 */
export async function fetchAllEnterpriseLotRows(
  supabase: SupabaseClient,
  rlsCtx: RlsContext,
  options?: {
    projectId?: string | null;
    pageSize?: number;
    select?: string;
  },
): Promise<FetchEnterpriseLotsResult> {
  const pageSize = Math.min(
    1000,
    Math.max(100, options?.pageSize ?? ENTERPRISE_BLOCKS_FETCH_PAGE_SIZE),
  );
  const select = options?.select ?? ENTERPRISE_LOT_VALUE_SELECT;

  let headQuery = supabase
    .from('blocks')
    .select(select, { count: 'exact', head: true });
  headQuery = applyTenantFilter(headQuery, rlsCtx, 'blocks');
  if (options?.projectId) {
    headQuery = headQuery.eq('project_id', options.projectId);
  }
  const { count: exactCount, error: countError } = await headQuery;
  if (countError) {
    console.warn('ENTERPRISE_LOTS_COUNT_WARN', countError.message);
  }

  const all: EnterpriseLotRow[] = [];
  let pagesFetched = 0;
  let from = 0;

  for (;;) {
    let pageQuery = supabase.from('blocks').select(select);
    pageQuery = applyTenantFilter(pageQuery, rlsCtx, 'blocks');
    if (options?.projectId) {
      pageQuery = pageQuery.eq('project_id', options.projectId);
    }
    const ordered = (pageQuery as unknown as RangeQuery).order('id', {
      ascending: true,
    });
    const { data, error } = await ordered.range(from, from + pageSize - 1);
    if (error) throw error;
    pagesFetched += 1;
    const chunk = (data || []) as EnterpriseLotRow[];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
    // Segurança: evita loop infinito em ambientes mal configurados.
    if (pagesFetched > 200) {
      console.warn('ENTERPRISE_LOTS_PAGE_CAP', { pagesFetched, rows: all.length });
      break;
    }
  }

  const rowsFetched = all.length;
  const wouldTruncateWithoutPagination =
    rowsFetched > POSTGREST_DEFAULT_ROW_CAP ||
    (typeof exactCount === 'number' && exactCount > POSTGREST_DEFAULT_ROW_CAP);

  return {
    rows: all,
    exactCount: typeof exactCount === 'number' ? exactCount : null,
    pagesFetched,
    rowsFetched,
    wouldTruncateWithoutPagination,
  };
}

/**
 * Fetch service-role (sem RLS client) com o mesmo padrão de paginação.
 * Usado apenas por diagnósticos Preview.
 */
export async function fetchAllEnterpriseLotRowsService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  options: {
    companyId?: string | null;
    tenantId?: string | null;
    projectId?: string | null;
    pageSize?: number;
    select?: string;
  },
): Promise<FetchEnterpriseLotsResult> {
  const pageSize = Math.min(
    1000,
    Math.max(100, options.pageSize ?? ENTERPRISE_BLOCKS_FETCH_PAGE_SIZE),
  );
  const select = options.select ?? ENTERPRISE_LOT_VALUE_SELECT;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyScope = (q: any) => {
    let query = q;
    if (options.projectId) {
      query = query.eq('project_id', options.projectId);
    }
    if (options.companyId) {
      query = query.eq('company_id', options.companyId);
    } else if (options.tenantId) {
      query = query.eq('tenant_id', options.tenantId);
    }
    return query;
  };

  const { count: exactCount, error: countError } = await applyScope(
    sb.from('blocks').select(select, { count: 'exact', head: true }),
  );
  if (countError) {
    console.warn('ENTERPRISE_LOTS_SERVICE_COUNT_WARN', countError.message);
  }

  const all: EnterpriseLotRow[] = [];
  let pagesFetched = 0;
  let from = 0;

  for (;;) {
    const { data, error } = await applyScope(sb.from('blocks').select(select))
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    pagesFetched += 1;
    const chunk = (data || []) as EnterpriseLotRow[];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
    if (pagesFetched > 200) break;
  }

  const rowsFetched = all.length;
  return {
    rows: all,
    exactCount: typeof exactCount === 'number' ? exactCount : null,
    pagesFetched,
    rowsFetched,
    wouldTruncateWithoutPagination:
      rowsFetched > POSTGREST_DEFAULT_ROW_CAP ||
      (typeof exactCount === 'number' && exactCount > POSTGREST_DEFAULT_ROW_CAP),
  };
}

export type EnterpriseProjectBreakdownRow = {
  projectId: string;
  projectName: string;
  totalLots: number;
  availableLots: number;
  reservedLots: number;
  soldLots: number;
  globalValue: number;
  availableValue: number;
  reservedValue: number;
  soldValue: number;
  rowsFetched: number;
  pagesFetched: number;
};

export function buildEnterpriseBreakdownByProject(
  lots: EnterpriseLotRow[],
  projectNameById: Record<string, string>,
  meta?: { pagesFetched?: number },
): EnterpriseProjectBreakdownRow[] {
  const byProject = new Map<string, EnterpriseLotRow[]>();
  for (const lot of lots) {
    const pid = String(lot.project_id || '');
    if (!pid) continue;
    const list = byProject.get(pid) || [];
    list.push(lot);
    byProject.set(pid, list);
  }

  const pagesFetched = meta?.pagesFetched ?? 1;
  const rows: EnterpriseProjectBreakdownRow[] = [];
  for (const [projectId, projectLots] of byProject) {
    const summary = calculateEnterpriseValueSummary(projectLots);
    rows.push({
      projectId,
      projectName: projectNameById[projectId] || projectId.slice(0, 8),
      totalLots: summary.lotCount,
      availableLots: summary.availableCount,
      reservedLots: summary.reservedCount,
      soldLots: summary.soldCount + summary.paidCount,
      globalValue: summary.totalValue,
      availableValue: summary.availableValue,
      reservedValue: summary.reservedValue,
      soldValue: summary.soldValue,
      rowsFetched: projectLots.length,
      pagesFetched,
    });
  }

  return rows.sort((a, b) =>
    a.projectName.localeCompare(b.projectName, 'pt-BR'),
  );
}

export function summarizeEnterpriseFetch(
  summary: EnterpriseValueSummary,
  meta: FetchEnterpriseLotsResult,
  extras?: {
    companyId?: string | null;
    projectCount?: number;
  },
): Record<string, unknown> {
  return {
    companyId: extras?.companyId ?? null,
    projectCount: extras?.projectCount ?? null,
    totalRows: meta.rowsFetched,
    exactCount: meta.exactCount,
    totalPages: meta.pagesFetched,
    wouldTruncateWithoutPagination: meta.wouldTruncateWithoutPagination,
    globalValue: summary.totalValue,
    availableValue: summary.availableValue,
    reservedValue: summary.reservedValue,
    soldValue: summary.soldValue,
    availableLots: summary.availableCount,
    reservedLots: summary.reservedCount,
    soldLots: summary.soldCount + summary.paidCount,
  };
}
