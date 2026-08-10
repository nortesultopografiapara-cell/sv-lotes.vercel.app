/**
 * Busca paginada de lotes (blocks) — evita teto silencioso ~1000 do PostgREST.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchAllPaginated,
  POSTGREST_DEFAULT_PAGE_SIZE,
  type FetchAllPaginatedResult,
} from '@/lib/supabaseFetchAll';

export const BLOCKS_FETCH_PAGE_SIZE = POSTGREST_DEFAULT_PAGE_SIZE;

export const BLOCKS_GIS_SELECT =
  '*, projects(name), customers(name)';

export const BLOCKS_MAP_FULL_SELECT = '*';

export type ProjectLotStats = {
  total: number;
  sold: number;
  hasGis: boolean;
};

export type FetchProjectBlocksResult<T = Record<string, unknown>> =
  FetchAllPaginatedResult<T> & {
    projectId: string;
  };

type TenantFilterOpts = {
  /** Quando false, não aplica filtro de tenant (SUPER_ADMIN). */
  applyTenant?: boolean;
  tenantId?: string | null;
};

function applyProjectAndTenantFilter<Q extends { eq: Function; or: Function }>(
  query: Q,
  projectId: string,
  opts?: TenantFilterOpts,
): Q {
  let q = query.eq('project_id', projectId);
  if (opts?.applyTenant !== false && opts?.tenantId) {
    q = q.or(`tenant_id.eq.${opts.tenantId},company_id.eq.${opts.tenantId}`);
  }
  return q;
}

/**
 * Contagem exata de lotes do projeto (sem carregar geometrias).
 */
export async function fetchProjectLotCountExact(
  supabase: SupabaseClient,
  projectId: string,
  opts?: TenantFilterOpts,
): Promise<number> {
  let q = supabase
    .from('blocks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (opts?.applyTenant !== false && opts?.tenantId) {
    q = q.or(`tenant_id.eq.${opts.tenantId},company_id.eq.${opts.tenantId}`);
  }
  const { count, error } = await q;
  if (error) throw error;
  return typeof count === 'number' ? count : 0;
}

/**
 * Estatísticas leves por projeto (listagem GIS) via count exact.
 * Não embute blocks no select de projects (que truncava em 1000).
 */
export async function fetchProjectLotStatsMap(
  supabase: SupabaseClient,
  projectIds: string[],
  opts?: TenantFilterOpts,
): Promise<Record<string, ProjectLotStats>> {
  const unique = [...new Set(projectIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const out: Record<string, ProjectLotStats> = {};
  for (const id of unique) {
    out[id] = { total: 0, sold: 0, hasGis: false };
  }

  await Promise.all(
    unique.map(async (projectId) => {
      let totalQ = supabase
        .from('blocks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);
      let soldQ = supabase
        .from('blocks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('status', 'Vendido');
      let gisQ = supabase
        .from('blocks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .not('geometry', 'is', null);

      if (opts?.applyTenant !== false && opts?.tenantId) {
        const t = opts.tenantId;
        totalQ = totalQ.or(`tenant_id.eq.${t},company_id.eq.${t}`);
        soldQ = soldQ.or(`tenant_id.eq.${t},company_id.eq.${t}`);
        gisQ = gisQ.or(`tenant_id.eq.${t},company_id.eq.${t}`);
      }

      const [totalRes, soldRes, gisRes] = await Promise.all([totalQ, soldQ, gisQ]);
      if (totalRes.error) throw totalRes.error;
      if (soldRes.error) throw soldRes.error;
      if (gisRes.error) throw gisRes.error;

      out[projectId] = {
        total: totalRes.count ?? 0,
        sold: soldRes.count ?? 0,
        hasGis: (gisRes.count ?? 0) > 0,
      };
    }),
  );

  return out;
}

/**
 * Carrega TODOS os blocks de um projeto com paginação + order estável por id.
 */
export async function fetchAllBlocksForProject<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  projectId: string,
  options?: TenantFilterOpts & {
    select?: string;
    pageSize?: number;
  },
): Promise<FetchProjectBlocksResult<T>> {
  const select = options?.select ?? BLOCKS_MAP_FULL_SELECT;
  const pageSize = options?.pageSize ?? BLOCKS_FETCH_PAGE_SIZE;

  let head = supabase
    .from('blocks')
    .select(select, { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (options?.applyTenant !== false && options?.tenantId) {
    head = head.or(
      `tenant_id.eq.${options.tenantId},company_id.eq.${options.tenantId}`,
    );
  }
  const { count: exactCount, error: countError } = await head;
  if (countError) {
    console.warn('BLOCKS_COUNT_WARN', countError.message);
  }

  const result = await fetchAllPaginated<T>(
    (from, to) => {
      let page = supabase
        .from('blocks')
        .select(select)
        .eq('project_id', projectId)
        .order('id', { ascending: true });
      if (options?.applyTenant !== false && options?.tenantId) {
        page = page.or(
          `tenant_id.eq.${options.tenantId},company_id.eq.${options.tenantId}`,
        );
      }
      return page.range(from, to);
    },
    {
      pageSize,
      exactCount: typeof exactCount === 'number' ? exactCount : null,
    },
  );

  return { ...result, projectId };
}

/**
 * Insert em batches seguros (evita payload/timeout em importações grandes).
 */
export async function insertBlocksInBatches<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  rows: T[],
  options?: {
    batchSize?: number;
    select?: string;
  },
): Promise<{ inserted: Array<{ id: string; number?: string }>; total: number }> {
  const batchSize = Math.min(500, Math.max(50, options?.batchSize ?? 200));
  const select = options?.select ?? 'id, number';
  const inserted: Array<{ id: string; number?: string }> = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('blocks')
      .insert(chunk)
      .select(select);
    if (error) {
      throw new Error(
        `insertBlocksInBatches: falha no lote ${i / batchSize + 1} (${chunk.length} rows): ${error.message}`,
      );
    }
    for (const row of data || []) {
      inserted.push(row as { id: string; number?: string });
    }
  }

  return { inserted, total: inserted.length };
}
