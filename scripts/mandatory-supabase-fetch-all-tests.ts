/**
 * Testes obrigatórios — paginação PostgREST / fetchAllPaginated / blocks.
 * npx tsx scripts/mandatory-supabase-fetch-all-tests.ts
 */

import {
  fetchAllPaginated,
  POSTGREST_DEFAULT_ROW_CAP,
  takePostgrestDefaultCap,
} from '../lib/supabaseFetchAll';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FALHOU —', msg);
    process.exitCode = 1;
    return;
  }
  console.log('PASSOU —', msg);
}

function makeRows(n: number): Array<{ id: string; number: string; block_name: string }> {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${String(i + 1).padStart(5, '0')}`,
    number: String((i % 50) + 1),
    block_name: `QNC ${Math.floor(i / 50) + 1}${i % 7 === 0 ? ' - A' : ''}`,
  }));
}

async function fakeFactory(
  all: Array<{ id: string; number: string; block_name: string }>,
  _pageSize: number,
  failAtPage?: number,
) {
  let page = 0;
  return async (from: number, to: number) => {
    page += 1;
    if (failAtPage && page === failAtPage) {
      return { data: null, error: { message: `falha página ${page}` } };
    }
    return { data: all.slice(from, to + 1), error: null };
  };
}

async function main() {
  const sizes = [999, 1000, 1001, 1607, 2500];
  for (const n of sizes) {
    const all = makeRows(n);
    const factory = await fakeFactory(all, 1000);
    const result = await fetchAllPaginated(factory, { pageSize: 1000 });
    assert(result.rowsFetched === n, `${n} lotes: rowsFetched=${result.rowsFetched}`);
    assert(
      result.pagesFetched >= Math.max(1, Math.ceil(n / 1000)),
      `${n} lotes: pagesFetched=${result.pagesFetched}`,
    );
    const capped = takePostgrestDefaultCap(all);
    assert(
      capped.length === Math.min(n, POSTGREST_DEFAULT_ROW_CAP),
      `${n}: cap silencioso = ${capped.length}`,
    );
    assert(
      result.wouldTruncateWithoutPagination === n > POSTGREST_DEFAULT_ROW_CAP,
      `${n}: wouldTruncate=${result.wouldTruncateWithoutPagination}`,
    );
  }

  // Última página parcial
  {
    const all = makeRows(1005);
    const factory = await fakeFactory(all, 1000);
    const result = await fetchAllPaginated(factory, { pageSize: 1000 });
    assert(result.pagesFetched === 2, 'última página parcial → 2 páginas');
    assert(result.rowsFetched === 1005, '1005 consolidado');
  }

  // Erro em página intermediária
  {
    const all = makeRows(2500);
    const factory = await fakeFactory(all, 1000, 2);
    let threw = false;
    try {
      await fetchAllPaginated(factory, { pageSize: 1000 });
    } catch (e) {
      threw = /página 2/i.test(String(e instanceof Error ? e.message : e));
    }
    assert(threw, 'erro em página intermediária propaga');
  }

  // Deduplicação por id
  {
    const base = makeRows(10);
    const duped = [...base, ...base.slice(0, 3)];
    let fromCursor = 0;
    const result = await fetchAllPaginated(
      async () => {
        // Uma única “página” com duplicatas
        if (fromCursor > 0) return { data: [], error: null };
        fromCursor = duped.length;
        return { data: duped, error: null };
      },
      { pageSize: 1000 },
    );
    assert(result.rowsFetched === 10, 'dedupe por id → 10');
    assert(result.duplicatesSkipped === 3, '3 duplicatas ignoradas');
  }

  // Quadras com números repetidos entre si (ids distintos)
  {
    const rows = [
      { id: 'a', number: '1', block_name: 'QNC 557 - A' },
      { id: 'b', number: '1', block_name: 'QNC 557 - B' },
      { id: 'c', number: '1', block_name: 'QNC 558' },
    ];
    const result = await fetchAllPaginated(async (from, to) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));
    assert(result.rowsFetched === 3, 'mesmo número em quadras distintas preservado');
  }

  // Polygon / MultiPolygon markers (estrutura)
  {
    const geos = [
      { id: 'p1', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
      {
        id: 'm1',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
        },
      },
    ];
    const result = await fetchAllPaginated(async (from, to) => ({
      data: geos.slice(from, to + 1),
      error: null,
    }));
    assert(result.rowsFetched === 2, 'Polygon + MultiPolygon consolidam');
  }

  if (process.exitCode) {
    console.error('\nmandatory-supabase-fetch-all-tests FAILED');
    process.exit(1);
  }
  console.log('\nOK — mandatory-supabase-fetch-all-tests passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
