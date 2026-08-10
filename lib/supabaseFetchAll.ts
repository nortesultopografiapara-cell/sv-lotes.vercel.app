/**
 * Paginação genérica PostgREST/Supabase.
 *
 * O PostgREST limita silenciosamente respostas sem `.range()` a ~1000 linhas.
 * Use este helper sempre que a consulta puder ultrapassar esse teto.
 */

export const POSTGREST_DEFAULT_PAGE_SIZE = 1000;
export const POSTGREST_DEFAULT_ROW_CAP = 1000;
export const POSTGREST_MAX_PAGES_GUARD = 500;

export type FetchAllPaginatedPageResult<T> = {
  data: T[] | null;
  error: { message?: string; code?: string } | null;
  count?: number | null;
};

export type FetchAllPaginatedResult<T> = {
  rows: T[];
  pagesFetched: number;
  rowsFetched: number;
  duplicatesSkipped: number;
  exactCount: number | null;
  wouldTruncateWithoutPagination: boolean;
};

export type FetchAllPaginatedOptions<T> = {
  pageSize?: number;
  maxPages?: number;
  /** Extrai id estável para dedupe (padrão: row.id). */
  getId?: (row: T) => string | null;
  /** Count exato opcional (já obtido via head:true). */
  exactCount?: number | null;
  onPage?: (info: {
    pageIndex: number;
    from: number;
    to: number;
    pageRows: number;
    totalSoFar: number;
  }) => void;
};

type RangeCapableQuery<T> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<FetchAllPaginatedPageResult<T>>;
};

/**
 * Factory: recebe (from, to) inclusivos e devolve a Promise da página.
 * Preferível quando a query precisa ser recriada a cada página (Supabase builder).
 */
export type PageQueryFactory<T> = (
  from: number,
  to: number,
) => PromiseLike<FetchAllPaginatedPageResult<T>>;

function defaultGetId<T>(row: T): string | null {
  if (row == null || typeof row !== 'object') return null;
  const id = (row as { id?: unknown }).id;
  if (id == null) return null;
  const s = String(id).trim();
  return s || null;
}

/**
 * Busca todas as páginas até receber menos que pageSize linhas.
 * Deduplica por id, ordenação deve ser estável no factory (ex.: order id).
 */
export async function fetchAllPaginated<T>(
  queryFactory: PageQueryFactory<T>,
  options?: FetchAllPaginatedOptions<T>,
): Promise<FetchAllPaginatedResult<T>> {
  const pageSize = Math.min(
    POSTGREST_DEFAULT_PAGE_SIZE,
    Math.max(1, Math.floor(options?.pageSize ?? POSTGREST_DEFAULT_PAGE_SIZE)),
  );
  const maxPages = Math.max(
    1,
    Math.floor(options?.maxPages ?? POSTGREST_MAX_PAGES_GUARD),
  );
  const getId = options?.getId ?? defaultGetId;

  const seen = new Set<string>();
  const rows: T[] = [];
  let duplicatesSkipped = 0;
  let pagesFetched = 0;
  let from = 0;

  for (;;) {
    if (pagesFetched >= maxPages) {
      throw new Error(
        `fetchAllPaginated: excedeu maxPages=${maxPages} (rows=${rows.length}).`,
      );
    }
    const to = from + pageSize - 1;
    const { data, error } = await queryFactory(from, to);
    if (error) {
      throw new Error(
        `fetchAllPaginated: falha na página ${pagesFetched + 1} [${from}..${to}]: ${
          error.message || error.code || 'erro desconhecido'
        }`,
      );
    }
    pagesFetched += 1;
    const chunk = (data || []) as T[];
    for (const row of chunk) {
      const id = getId(row);
      if (id) {
        if (seen.has(id)) {
          duplicatesSkipped += 1;
          continue;
        }
        seen.add(id);
      }
      rows.push(row);
    }
    options?.onPage?.({
      pageIndex: pagesFetched,
      from,
      to,
      pageRows: chunk.length,
      totalSoFar: rows.length,
    });
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const exactCount =
    typeof options?.exactCount === 'number' ? options.exactCount : null;
  const rowsFetched = rows.length;
  const wouldTruncateWithoutPagination =
    rowsFetched > POSTGREST_DEFAULT_ROW_CAP ||
    (exactCount != null && exactCount > POSTGREST_DEFAULT_ROW_CAP);

  if (typeof console !== 'undefined' && console.info) {
    console.info('[fetchAllPaginated]', {
      pagesFetched,
      rowsFetched,
      duplicatesSkipped,
      exactCount,
      wouldTruncateWithoutPagination,
    });
  }

  return {
    rows,
    pagesFetched,
    rowsFetched,
    duplicatesSkipped,
    exactCount,
    wouldTruncateWithoutPagination,
  };
}

/**
 * Variante para builders Supabase que já têm `.order()` e aceitam `.range()`.
 * O factory deve recriar a query a cada chamada (não reutilizar o mesmo builder).
 */
export async function fetchAllFromRangeQuery<T>(
  buildOrderedQuery: () => RangeCapableQuery<T>,
  options?: FetchAllPaginatedOptions<T>,
): Promise<FetchAllPaginatedResult<T>> {
  return fetchAllPaginated<T>((from, to) => buildOrderedQuery().range(from, to), options);
}

/** Utilitário de teste: simula o teto silencioso do PostgREST. */
export function takePostgrestDefaultCap<T>(
  rows: T[],
  cap: number = POSTGREST_DEFAULT_ROW_CAP,
): T[] {
  return rows.slice(0, Math.max(0, cap));
}
