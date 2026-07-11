/**
 * Consulta paginada de finance_receipts sem truncamento silencioso do PostgREST.
 * Financeiro e Cobranças devem usar este helper.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { applyTenantFilter, type RlsContext } from '@/lib/rls';
import {
  FINANCE_RECEIPTS_LIST_SELECT,
  FINANCE_RECEIPTS_LIST_SELECT_FALLBACK,
} from '@/lib/finance/financeReceiptsEmbed';

export const FINANCE_RECEIPTS_UI_PAGE_SIZES = [20, 50, 100] as const;
export type FinanceReceiptsUiPageSize = (typeof FINANCE_RECEIPTS_UI_PAGE_SIZES)[number];
export const DEFAULT_FINANCE_RECEIPTS_UI_PAGE_SIZE: FinanceReceiptsUiPageSize = 20;

/** Tamanho interno de cada página PostgREST (abaixo do limite padrão). */
export const FINANCE_RECEIPTS_FETCH_PAGE_SIZE = 500;

export type FetchAllFinanceReceiptsResult<T = Record<string, unknown>> = {
  rows: T[];
  /** Count exato da consulta tenant-scoped (head: true). */
  exactCount: number;
  pagesFetched: number;
  /** true quando uma única query sem range teria cortado linhas. */
  wouldTruncateWithoutPagination: boolean;
  usedFallbackSelect: boolean;
};

export type PaginateRowsResult<T> = {
  pageRows: T[];
  page: number;
  pageSize: FinanceReceiptsUiPageSize;
  totalCount: number;
  totalPages: number;
  from: number;
  to: number;
};

export function normalizeFinanceReceiptsUiPageSize(
  value: unknown,
): FinanceReceiptsUiPageSize {
  const n = Number(value);
  if (n === 50 || n === 100 || n === 20) return n;
  return DEFAULT_FINANCE_RECEIPTS_UI_PAGE_SIZE;
}

/** Paginação visual sobre o conjunto já filtrado (total verdadeiro). */
export function paginateFinanceReceiptRows<T>(
  rows: T[],
  page: number,
  pageSize: FinanceReceiptsUiPageSize,
): PaginateRowsResult<T> {
  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const from = totalCount === 0 ? 0 : start + 1;
  const to = start + pageRows.length;
  return {
    pageRows,
    page: safePage,
    pageSize,
    totalCount,
    totalPages,
    from,
    to,
  };
}

type QueryBuilder = {
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  range: (from: number, to: number) => PromiseLike<{
    data: unknown[] | null;
    error: { message?: string } | null;
  }>;
};

function applyListOrdering<T extends QueryBuilder>(query: T): T {
  return query
    .order('due_date', { ascending: true })
    .order('installment_number', { ascending: true }) as T;
}

/**
 * Carrega todos os finance_receipts do tenant via páginas reais (.range),
 * com count exact — nunca depende de uma única query tenant-wide sem paginação.
 */
export async function fetchAllFinanceReceiptsPaged<T = Record<string, unknown>>(params: {
  supabase: SupabaseClient;
  rlsCtx: RlsContext;
  select?: string;
  selectFallback?: string;
  fetchPageSize?: number;
  /** Limite artificial do PostgREST para detectar truncamento (testes). */
  postgrestMaxRows?: number;
}): Promise<FetchAllFinanceReceiptsResult<T>> {
  const select = params.select ?? FINANCE_RECEIPTS_LIST_SELECT;
  const selectFallback =
    params.selectFallback ?? FINANCE_RECEIPTS_LIST_SELECT_FALLBACK;
  const fetchPageSize = Math.max(
    1,
    Math.min(1000, params.fetchPageSize ?? FINANCE_RECEIPTS_FETCH_PAGE_SIZE),
  );
  const postgrestMaxRows = params.postgrestMaxRows ?? 1000;

  let countQuery = params.supabase
    .from('finance_receipts')
    .select('id', { count: 'exact', head: true });
  countQuery = applyTenantFilter(countQuery, params.rlsCtx, 'finance_receipts');
  const { count, error: countError } = await countQuery;
  if (countError) {
    throw new Error(countError.message || 'Falha ao obter count de finance_receipts');
  }
  const exactCount = Number(count ?? 0);

  const rows: T[] = [];
  let pagesFetched = 0;
  let usedFallbackSelect = false;
  let from = 0;

  while (from < exactCount || (exactCount === 0 && pagesFetched === 0)) {
    if (exactCount === 0) break;

    let pageQuery = params.supabase.from('finance_receipts').select(select);
    pageQuery = applyTenantFilter(pageQuery, params.rlsCtx, 'finance_receipts');
    pageQuery = applyListOrdering(pageQuery);

    let { data, error } = await pageQuery.range(from, from + fetchPageSize - 1);

    if (error) {
      let fallbackQuery = params.supabase
        .from('finance_receipts')
        .select(selectFallback);
      fallbackQuery = applyTenantFilter(
        fallbackQuery,
        params.rlsCtx,
        'finance_receipts',
      );
      fallbackQuery = applyListOrdering(fallbackQuery);
      const fallbackRes = await fallbackQuery.range(
        from,
        from + fetchPageSize - 1,
      );
      data = fallbackRes.data;
      error = fallbackRes.error;
      usedFallbackSelect = true;
    }

    if (error) {
      throw new Error(error.message || 'Falha ao paginar finance_receipts');
    }

    const chunk = (data || []) as T[];
    pagesFetched += 1;
    rows.push(...chunk);

    if (chunk.length < fetchPageSize) break;
    from += fetchPageSize;

    // Segurança: evita loop infinito se count estiver inconsistente.
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

/**
 * Helper puro para testes: simula o corte do PostgREST vs fetch paginado.
 */
export function simulatePostgrestTruncation<T>(params: {
  allRows: T[];
  maxRows?: number;
}): {
  unpagedReturned: T[];
  truncated: boolean;
  pagedAll: T[];
  exactCount: number;
} {
  const maxRows = params.maxRows ?? 1000;
  const exactCount = params.allRows.length;
  const unpagedReturned = params.allRows.slice(0, maxRows);
  const pageSize = FINANCE_RECEIPTS_FETCH_PAGE_SIZE;
  const pagedAll: T[] = [];
  for (let i = 0; i < exactCount; i += pageSize) {
    pagedAll.push(...params.allRows.slice(i, i + pageSize));
  }
  return {
    unpagedReturned,
    truncated: unpagedReturned.length < exactCount,
    pagedAll,
    exactCount,
  };
}
