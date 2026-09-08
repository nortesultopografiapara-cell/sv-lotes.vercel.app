/**
 * Leitura paginada tenant-scoped (READ-ONLY) para tabelas sem helper próprio.
 * Espelha fetchAllFinanceReceiptsPaged: count exact + .range, sem truncar no PostgREST.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { applyTenantFilter, type RlsContext } from '@/lib/rls';

export const TENANT_ROWS_FETCH_PAGE_SIZE = 500;

export type FetchAllTenantRowsResult<T = Record<string, unknown>> = {
  rows: T[];
  exactCount: number;
  pagesFetched: number;
  wouldTruncateWithoutPagination: boolean;
  usedFallbackSelect: boolean;
};

type QueryBuilder = {
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  range: (from: number, to: number) => PromiseLike<{
    data: unknown[] | null;
    error: { message?: string } | null;
  }>;
};

export async function fetchAllTenantRowsPaged<T = Record<string, unknown>>(params: {
  supabase: SupabaseClient;
  rlsCtx: RlsContext;
  table: string;
  select: string;
  selectFallback?: string;
  orderColumn: string;
  orderSecondary?: string;
  fetchPageSize?: number;
  postgrestMaxRows?: number;
}): Promise<FetchAllTenantRowsResult<T>> {
  const select = params.select;
  const selectFallback = params.selectFallback ?? params.select;
  const fetchPageSize = Math.max(
    1,
    Math.min(1000, params.fetchPageSize ?? TENANT_ROWS_FETCH_PAGE_SIZE),
  );
  const postgrestMaxRows = params.postgrestMaxRows ?? 1000;

  let countQuery = params.supabase
    .from(params.table)
    .select('id', { count: 'exact', head: true });
  countQuery = applyTenantFilter(countQuery, params.rlsCtx, params.table);
  const { count, error: countError } = await countQuery;
  if (countError) {
    throw new Error(countError.message || `Falha ao obter count de ${params.table}`);
  }
  const exactCount = Number(count ?? 0);

  const rows: T[] = [];
  let pagesFetched = 0;
  let usedFallbackSelect = false;
  let from = 0;

  while (from < exactCount || (exactCount === 0 && pagesFetched === 0)) {
    if (exactCount === 0) break;

    let pageQuery = params.supabase.from(params.table).select(select);
    pageQuery = applyTenantFilter(pageQuery, params.rlsCtx, params.table);
    pageQuery = pageQuery.order(params.orderColumn, { ascending: true });
    if (params.orderSecondary) {
      pageQuery = pageQuery.order(params.orderSecondary, { ascending: true });
    }

    let { data, error } = await (pageQuery as QueryBuilder).range(
      from,
      from + fetchPageSize - 1,
    );

    if (error) {
      let fallbackQuery = params.supabase.from(params.table).select(selectFallback);
      fallbackQuery = applyTenantFilter(
        fallbackQuery,
        params.rlsCtx,
        params.table,
      );
      fallbackQuery = fallbackQuery.order(params.orderColumn, { ascending: true });
      if (params.orderSecondary) {
        fallbackQuery = fallbackQuery.order(params.orderSecondary, {
          ascending: true,
        });
      }
      const fallbackRes = await (fallbackQuery as QueryBuilder).range(
        from,
        from + fetchPageSize - 1,
      );
      data = fallbackRes.data;
      error = fallbackRes.error;
      usedFallbackSelect = true;
    }

    if (error) {
      throw new Error(error.message || `Falha ao paginar ${params.table}`);
    }

    const chunk = (data || []) as T[];
    pagesFetched += 1;
    rows.push(...chunk);

    if (chunk.length < fetchPageSize) break;
    from += fetchPageSize;

    if (pagesFetched > Math.ceil(Math.max(exactCount, 1) / fetchPageSize) + 2) {
      break;
    }
  }

  return {
    rows,
    exactCount,
    pagesFetched,
    wouldTruncateWithoutPagination: exactCount > postgrestMaxRows,
    usedFallbackSelect,
  };
}
