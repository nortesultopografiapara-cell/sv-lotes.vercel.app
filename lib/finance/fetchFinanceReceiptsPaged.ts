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
import {
  applyFinanceReceiptRelations,
  FINANCE_RECEIPTS_ESSENTIAL_SELECT,
  FINANCE_RECEIPTS_ESSENTIAL_SELECT_FALLBACK,
  loadFinanceReceiptRelations,
  type FinanceReceiptRelationMaps,
} from '@/lib/finance/financeReceiptRelations';
import {
  buildBlockReadSelect,
  buildCustomerReadSelect,
  buildReceiptReadSelect,
  loadFinanceColumnCatalog,
} from '@/lib/finance/financeColumnCatalog';

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
  abortSignal?: (signal: AbortSignal) => QueryBuilder;
  range: (from: number, to: number) => PromiseLike<{
    data: unknown[] | null;
    error: { message?: string; name?: string } | null;
  }>;
};

export function isFinanceLoadAbort(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const name = 'name' in value ? String((value as { name?: string }).name || '') : '';
  const message = 'message' in value ? String((value as { message?: string }).message || '') : '';
  return name === 'AbortError' || message === 'AbortError' || /operation was aborted/i.test(message);
}

function attachAbort<T>(query: T, signal?: AbortSignal): T {
  if (!signal) return query;
  const builder = query as T & { abortSignal?: (next: AbortSignal) => T };
  if (typeof builder.abortSignal !== 'function') return query;
  return builder.abortSignal(signal);
}

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

/** Páginas seguintes da primeira, no máximo duas ao mesmo tempo. */
export const FINANCE_RECEIPTS_PROGRESS_CONCURRENCY = 2;

export type FinanceReceiptPageSlots<T> = Array<T[] | undefined>;

export type FinanceReceiptLoadState<T> = {
  rows: T[];
  pages: FinanceReceiptPageSlots<T>;
  exactCount: number;
  pagesCompleted: number;
  pagesExpected: number;
  complete: boolean;
  error: string | null;
  failedPageIndex: number | null;
};

export function financeReceiptPagesExpected(exactCount: number, pageSize: number): number {
  if (!Number.isFinite(exactCount) || exactCount <= 0) return 0;
  const size = Math.max(1, pageSize);
  return Math.ceil(exactCount / size);
}

export function financeReceiptPageErrorMessage(
  pageIndex: number,
  pagesExpected: number,
): string {
  const shown = Math.max(1, pageIndex + 1);
  const total = pagesExpected > 0 ? String(pagesExpected) : '?';
  return `Não foi possível carregar a página ${shown} de ${total} das parcelas. Os totais financeiros não foram atualizados.`;
}

export function sanitizeFinanceLoadLog(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? '');
  return raw
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 180);
}

export function financeDatasetReadyForTotals(state: {
  complete: boolean;
  error?: string | null;
}): boolean {
  return state.complete === true && !state.error;
}

/**
 * Junta só o prefixo contínuo. Uma página válida depois de um buraco
 * permanece em `pages` para a nova tentativa, mas não entra nas linhas exibidas.
 */
export function buildFinanceReceiptLoadState<T>(params: {
  slots: FinanceReceiptPageSlots<T>;
  pageSize: number;
  exactCount: number;
  error?: string | null;
  failedPageIndex?: number | null;
}): FinanceReceiptLoadState<T> {
  const pageSize = Math.max(1, params.pageSize);
  const pagesExpected = financeReceiptPagesExpected(params.exactCount, pageSize);
  const pages = params.slots.slice(0, pagesExpected);
  const rows: T[] = [];
  let pagesCompleted = 0;
  let endedEarly = false;
  for (let i = 0; i < pagesExpected; i += 1) {
    const chunk = pages[i];
    if (!chunk) break;
    rows.push(...chunk);
    pagesCompleted += 1;
    if (chunk.length < pageSize) {
      endedEarly = true;
      break;
    }
  }
  const error = params.error ?? null;
  const complete =
    !error &&
    (pagesExpected === 0 || endedEarly || pagesCompleted === pagesExpected);
  return {
    rows,
    pages,
    exactCount: params.exactCount,
    pagesCompleted,
    pagesExpected,
    complete,
    error,
    failedPageIndex: error ? (params.failedPageIndex ?? null) : null,
  };
}

export async function loadFinanceReceiptPagesProgressive<T>(params: {
  exactCount: number;
  pageSize: number;
  concurrency?: number;
  loadPage: (pageIndex: number) => Promise<T[]>;
  seedPages?: FinanceReceiptPageSlots<T>;
  onProgress?: (state: FinanceReceiptLoadState<T>) => void;
}): Promise<FinanceReceiptLoadState<T>> {
  const pageSize = Math.max(1, params.pageSize);
  const pagesExpected = financeReceiptPagesExpected(params.exactCount, pageSize);
  const slots: FinanceReceiptPageSlots<T> = new Array(pagesExpected);
  if (params.seedPages) {
    for (let i = 0; i < pagesExpected; i += 1) {
      const seeded = params.seedPages[i];
      if (seeded) slots[i] = seeded;
    }
  }
  const concurrency = Math.max(
    1,
    Math.min(4, params.concurrency ?? FINANCE_RECEIPTS_PROGRESS_CONCURRENCY),
  );
  let failedIndex: number | null = null;

  const emit = (error: string | null = null) => {
    const state = buildFinanceReceiptLoadState({
      slots,
      pageSize,
      exactCount: params.exactCount,
      error,
      failedPageIndex: failedIndex,
    });
    params.onProgress?.(state);
    return state;
  };

  if (pagesExpected === 0) return emit(null);

  const ensure = async (index: number) => {
    if (slots[index] || failedIndex !== null) return;
    try {
      slots[index] = await params.loadPage(index);
    } catch (err) {
      if (isFinanceLoadAbort(err)) throw err;
      if (failedIndex === null) {
        failedIndex = index;
        console.error('[financeiro] pagina de parcelas', {
          page: index + 1,
          message: sanitizeFinanceLoadLog(err),
        });
      }
    }
  };

  if (!slots[0]) {
    await ensure(0);
    if (failedIndex !== null) {
      return emit(financeReceiptPageErrorMessage(failedIndex, pagesExpected));
    }
  }
  const firstPage = slots[0];
  if (!firstPage || firstPage.length < pageSize) {
    return emit(null);
  }
  emit(null);

  const pending: number[] = [];
  for (let i = 1; i < pagesExpected; i += 1) {
    if (!slots[i]) pending.push(i);
  }
  let cursor = 0;
  const worker = async () => {
    while (failedIndex === null) {
      const index = pending[cursor];
      cursor += 1;
      if (index === undefined) return;
      await ensure(index);
      if (failedIndex !== null) return;
      emit(null);
    }
  };
  const workers = Math.min(concurrency, pending.length);
  if (workers > 0) {
    await Promise.all(Array.from({ length: workers }, () => worker()));
  }
  if (failedIndex !== null) {
    return emit(financeReceiptPageErrorMessage(failedIndex, pagesExpected));
  }
  return emit(null);
}

function financeAbortError(): Error {
  return Object.assign(new Error('AbortError'), { name: 'AbortError' });
}

let cachedReceiptSelect: { source: string; resolved: string } | null = null;

function missingReceiptColumn(message: string): string | null {
  const text = String(message || '');
  const named = text.match(/Could not find the '([a-z_][a-z0-9_]*)' column/i);
  if (named) return named[1];
  const column = text.match(/column (?:[a-z0-9_]+\.)?([a-z_][a-z0-9_]*) does not exist/i);
  return column ? column[1] : null;
}

function selectWithoutBareColumn(select: string, column: string): string {
  return select
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && (part.includes('(') || part !== column))
    .join(', ');
}

async function queryReceiptRange<T>(params: {
  supabase: SupabaseClient;
  rlsCtx: RlsContext;
  select: string;
  from: number;
  to: number;
  signal?: AbortSignal;
}): Promise<{ data: T[] | null; error: { message?: string } | null }> {
  let pageQuery = params.supabase.from('finance_receipts').select(params.select);
  pageQuery = applyTenantFilter(pageQuery, params.rlsCtx, 'finance_receipts');
  pageQuery = applyListOrdering(pageQuery);
  pageQuery = attachAbort(pageQuery, params.signal);
  const result = await pageQuery.range(params.from, params.to);
  return { data: (result.data || null) as T[] | null, error: result.error };
}

async function fetchFinanceReceiptRange<T>(params: {
  supabase: SupabaseClient;
  rlsCtx: RlsContext;
  select: string;
  selectFallback: string;
  from: number;
  to: number;
  signal?: AbortSignal;
}): Promise<{ rows: T[]; usedFallback: boolean }> {
  if (params.signal?.aborted) throw financeAbortError();
  let select =
    cachedReceiptSelect?.source === params.select
      ? cachedReceiptSelect.resolved
      : params.select;
  let data: T[] | null = null;
  let error: { message?: string } | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await queryReceiptRange<T>({
      supabase: params.supabase,
      rlsCtx: params.rlsCtx,
      select,
      from: params.from,
      to: params.to,
      signal: params.signal,
    });
    if (isFinanceLoadAbort(result.error)) throw financeAbortError();
    data = result.data;
    error = result.error;
    if (!error) break;
    const column = missingReceiptColumn(error.message || '');
    if (!column) break;
    const next = selectWithoutBareColumn(select, column);
    if (!next || next === select) break;
    select = next;
  }
  if (error) {
    const fallback = await queryReceiptRange<T>({
      supabase: params.supabase,
      rlsCtx: params.rlsCtx,
      select: params.selectFallback,
      from: params.from,
      to: params.to,
      signal: params.signal,
    });
    if (isFinanceLoadAbort(fallback.error)) throw financeAbortError();
    data = fallback.data;
    error = fallback.error;
    if (!error) select = params.selectFallback;
  }
  if (error) {
    throw new Error(error.message || 'Falha ao paginar finance_receipts');
  }
  cachedReceiptSelect = { source: params.select, resolved: select };
  return { rows: data || [], usedFallback: select !== params.select };
}

/**
 * Primeira página primeiro. As demais seguem com concorrência limitada.
 * Cobranças continua em `fetchAllFinanceReceiptsPaged`.
 */
export async function fetchFinanceReceiptsProgressive<T = Record<string, unknown>>(params: {
  supabase: SupabaseClient;
  rlsCtx: RlsContext;
  select?: string;
  selectFallback?: string;
  fetchPageSize?: number;
  concurrency?: number;
  seedPages?: FinanceReceiptPageSlots<T>;
  onProgress?: (state: FinanceReceiptLoadState<T>) => void;
  signal?: AbortSignal;
}): Promise<FinanceReceiptLoadState<T>> {
  if (params.signal?.aborted) throw financeAbortError();
  const requestedSelect = params.select ?? FINANCE_RECEIPTS_LIST_SELECT;
  const splitRelations = requestedSelect === FINANCE_RECEIPTS_LIST_SELECT;
  const catalogPromise = splitRelations
    ? loadFinanceColumnCatalog(params.supabase, params.rlsCtx, params.signal).catch((error) => {
        if (isFinanceLoadAbort(error)) throw error;
        return null;
      })
    : null;
  const fetchPageSize = Math.max(
    1,
    Math.min(1000, params.fetchPageSize ?? FINANCE_RECEIPTS_FETCH_PAGE_SIZE),
  );
  let countQuery = params.supabase
    .from('finance_receipts')
    .select('id', { count: 'exact', head: true });
  countQuery = applyTenantFilter(countQuery, params.rlsCtx, 'finance_receipts');
  countQuery = attachAbort(countQuery, params.signal);
  const { count, error: countError } = await countQuery;
  if (isFinanceLoadAbort(countError)) throw financeAbortError();
  if (countError) {
    console.error('[financeiro] contagem de parcelas', {
      message: sanitizeFinanceLoadLog(countError.message),
    });
    const failed = buildFinanceReceiptLoadState<T>({
      slots: [],
      pageSize: fetchPageSize,
      exactCount: 0,
      error:
        'Não foi possível contar as parcelas. Os totais financeiros não foram atualizados.',
      failedPageIndex: 0,
    });
    params.onProgress?.(failed);
    return failed;
  }
  const exactCount = Number(count ?? 0);
  const catalog = catalogPromise ? await catalogPromise : null;
  if (params.signal?.aborted) throw financeAbortError();
  const receiptRead = !splitRelations
    ? null
    : catalog?.finance_receipts
      ? buildReceiptReadSelect(catalog.finance_receipts)
      : {
          select: FINANCE_RECEIPTS_ESSENTIAL_SELECT,
          fallback: FINANCE_RECEIPTS_ESSENTIAL_SELECT_FALLBACK,
          omitted: [] as string[],
        };
  const customerRead = splitRelations
    ? buildCustomerReadSelect(catalog?.customers ?? null)
    : null;
  const blockRead = splitRelations ? buildBlockReadSelect(catalog?.blocks ?? null) : null;
  const select = receiptRead?.select ?? requestedSelect;
  const selectFallback =
    receiptRead?.fallback ??
    (params.selectFallback ?? FINANCE_RECEIPTS_LIST_SELECT_FALLBACK);
  let relationMaps: FinanceReceiptRelationMaps | null = null;
  let latestState: FinanceReceiptLoadState<T> | null = null;
  let relationsSettled = false;
  let relationFailure: unknown = null;
  const relationsPromise = splitRelations
    ? loadFinanceReceiptRelations({
        supabase: params.supabase,
        rlsCtx: params.rlsCtx,
        signal: params.signal,
        customerSelect: customerRead?.select,
        customerSelectFallback: customerRead?.fallback,
        blockSelect: blockRead?.select,
        blockSelectFallback: blockRead?.fallback,
      })
        .then((maps) => {
          relationMaps = maps;
          if (
            !relationsSettled &&
            latestState &&
            !latestState.complete &&
            !latestState.error &&
            !params.signal?.aborted &&
            params.onProgress
          ) {
            params.onProgress({
              ...latestState,
              rows: applyFinanceReceiptRelations(
                latestState.rows as Record<string, unknown>[],
                maps,
              ) as T[],
            });
          }
          return maps;
        })
        .catch((err) => {
          relationFailure = err;
          return null;
        })
    : null;
  const emit = (state: FinanceReceiptLoadState<T>) => {
    latestState = state;
    if (!params.onProgress) return;
    if (!relationMaps) {
      params.onProgress(state);
      return;
    }
    params.onProgress({
      ...state,
      rows: applyFinanceReceiptRelations(
        state.rows as Record<string, unknown>[],
        relationMaps,
      ) as T[],
    });
  };
  const loaded = await loadFinanceReceiptPagesProgressive<T>({
    exactCount,
    pageSize: fetchPageSize,
    concurrency: params.concurrency,
    seedPages: params.seedPages,
    onProgress: params.onProgress ? emit : undefined,
    loadPage: async (pageIndex) => {
      const from = pageIndex * fetchPageSize;
      const loaded = await fetchFinanceReceiptRange<T>({
        supabase: params.supabase,
        rlsCtx: params.rlsCtx,
        select,
        selectFallback,
        from,
        to: from + fetchPageSize - 1,
        signal: params.signal,
      });
      return loaded.rows;
    },
  });
  if (!splitRelations || !relationsPromise || !financeDatasetReadyForTotals(loaded)) {
    relationsSettled = true;
    return loaded;
  }
  const maps = await relationsPromise;
  relationsSettled = true;
  if (isFinanceLoadAbort(relationFailure)) throw financeAbortError();
  if (!maps) {
    console.error('[financeiro] cadastros da parcela', {
      message: sanitizeFinanceLoadLog(relationFailure),
    });
    return buildFinanceReceiptLoadState<T>({
      slots: loaded.pages,
      pageSize: fetchPageSize,
      exactCount,
      error:
        'Não foi possível carregar clientes, projetos e quadras. Os totais financeiros não foram atualizados.',
      failedPageIndex: loaded.pagesExpected,
    });
  }
  return {
    ...loaded,
    rows: applyFinanceReceiptRelations(
      loaded.rows as Record<string, unknown>[],
      maps,
    ) as T[],
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
