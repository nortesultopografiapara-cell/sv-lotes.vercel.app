/**
 * Testes obrigatórios — paginação de finance_receipts (sem truncamento PostgREST).
 * npx tsx scripts/mandatory-finance-receipts-pagination-tests.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  DEFAULT_FINANCE_RECEIPTS_UI_PAGE_SIZE,
  FINANCE_RECEIPTS_UI_PAGE_SIZES,
  loadFinanceReceiptPagesProgressive,
  normalizeFinanceReceiptsUiPageSize,
  paginateFinanceReceiptRows,
  simulatePostgrestTruncation,
} from '../lib/finance/fetchFinanceReceiptsPaged';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function buildRows(count: number, companyId: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: `r-${i + 1}`,
    company_id: companyId,
    installment_number: i + 1,
    due_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-10`,
    amount: 2500,
  }));
}

function testPageSizes() {
  assert(
    FINANCE_RECEIPTS_UI_PAGE_SIZES.join(',') === '20,50,100',
    'opções 20/50/100',
  );
  assert(DEFAULT_FINANCE_RECEIPTS_UI_PAGE_SIZE === 20, 'default 20');
  assert(normalizeFinanceReceiptsUiPageSize(50) === 50, 'normalize 50');
  assert(normalizeFinanceReceiptsUiPageSize(10) === 20, '10 vira 20');
  console.log('OK testPageSizes');
}

function testFortyEightInstallmentsPagination() {
  const rows = buildRows(48, 'company-a');
  const page1 = paginateFinanceReceiptRows(rows, 1, 20);
  assert(page1.totalCount === 48, 'total exato 48');
  assert(page1.pageRows.length === 20, 'página 1 tem 20');
  assert(page1.from === 1 && page1.to === 20, 'faixa 1-20');
  assert(page1.totalPages === 3, '3 páginas com size 20');

  const page2 = paginateFinanceReceiptRows(rows, 2, 20);
  assert(page2.pageRows.length === 20, 'página 2 tem 20');
  assert(page2.from === 21 && page2.to === 40, 'faixa 21-40');
  assert(
    page2.pageRows[0].installment_number === 21,
    'navegação página 2 inicia em 21',
  );

  const page3 = paginateFinanceReceiptRows(rows, 3, 20);
  assert(page3.pageRows.length === 8, 'página 3 tem 8');
  assert(page3.to === 48, 'última = 48');
  assert(
    page3.pageRows[page3.pageRows.length - 1].installment_number === 48,
    'última parcela 48/48',
  );

  const page50 = paginateFinanceReceiptRows(rows, 1, 50);
  assert(page50.pageRows.length === 48, 'size 50 carrega todas as 48');
  assert(page50.totalPages === 1, '1 página com size 50');

  console.log('OK testFortyEightInstallmentsPagination');
}

function testFiltersAndOrderingPreservedInSlice() {
  const rows = buildRows(48, 'company-a').sort((a, b) =>
    a.due_date === b.due_date
      ? a.installment_number - b.installment_number
      : a.due_date.localeCompare(b.due_date),
  );
  const filtered = rows.filter((r) => r.installment_number <= 25);
  const page = paginateFinanceReceiptRows(filtered, 2, 20);
  assert(page.totalCount === 25, 'total filtrado 25');
  assert(page.pageRows.length === 5, 'resto filtrado na pág 2');
  assert(
    page.pageRows.every((r) => r.installment_number <= 25),
    'filtro preservado',
  );
  for (let i = 1; i < page.pageRows.length; i++) {
    const prev = page.pageRows[i - 1];
    const cur = page.pageRows[i];
    const ordered =
      prev.due_date < cur.due_date ||
      (prev.due_date === cur.due_date &&
        prev.installment_number <= cur.installment_number);
    assert(ordered, 'ordenação due_date + installment_number');
  }
  console.log('OK testFiltersAndOrderingPreservedInSlice');
}

function testMultiTenantIsolation() {
  const a = buildRows(48, 'company-a');
  const b = buildRows(10, 'company-b');
  const mixed = [...a, ...b];
  const onlyA = mixed.filter((r) => r.company_id === 'company-a');
  const page = paginateFinanceReceiptRows(onlyA, 1, 100);
  assert(page.totalCount === 48, 'tenant A = 48');
  assert(
    page.pageRows.every((r) => r.company_id === 'company-a'),
    'sem cruzamento de empresa',
  );
  console.log('OK testMultiTenantIsolation');
}

function testNoSilentPostgrestCut() {
  const rows = buildRows(1200, 'company-a');
  const sim = simulatePostgrestTruncation({ allRows: rows, maxRows: 1000 });
  assert(sim.exactCount === 1200, 'count exato 1200');
  assert(sim.truncated, 'unpaged truncaria');
  assert(sim.unpagedReturned.length === 1000, 'unpaged = 1000');
  assert(sim.pagedAll.length === 1200, 'fetch paginado recupera tudo');
  assert(
    sim.pagedAll[sim.pagedAll.length - 1].installment_number === 1200,
    'sem corte na última',
  );
  console.log('OK testNoSilentPostgrestCut');
}

function testNoDuplicatesInFortyEight() {
  const rows = buildRows(48, 'company-a');
  const nums = rows.map((r) => r.installment_number);
  assert(new Set(nums).size === 48, 'sem duplicidade 1..48');
  console.log('OK testNoDuplicatesInFortyEight');
}

type TiedReceipt = {
  id: string;
  due_date: string;
  installment_number: number;
  amount: number;
};

function tieHash(id: string, salt: number): number {
  let hash = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function sortTied(rows: TiedReceipt[], salt: number | null): TiedReceipt[] {
  return [...rows].sort((a, b) => {
    const byDate = a.due_date.localeCompare(b.due_date);
    if (byDate !== 0) return byDate;
    const byNumber = a.installment_number - b.installment_number;
    if (byNumber !== 0) return byNumber;
    if (salt === null) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    const left = tieHash(a.id, salt);
    const right = tieHash(b.id, salt);
    if (left === right) return a.id < b.id ? -1 : 1;
    return left < right ? -1 : 1;
  });
}

function centsOf(rows: TiedReceipt[]): number {
  return rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
}

async function testTiedDueDatesNeedIdOrder() {
  const total = 6000;
  const pageSize = 500;
  const rows: TiedReceipt[] = Array.from({ length: total }, (_, index) => ({
    id: `id-${String(total - index).padStart(5, '0')}`,
    due_date: '2026-06-15',
    installment_number: 12,
    amount: 100 + (index % 50),
  }));
  const windowOf = (sorted: TiedReceipt[], pageIndex: number) => {
    const from = pageIndex * pageSize;
    return sorted.slice(from, from + pageSize);
  };

  const probeA = windowOf(sortTied(rows, 1000), 0).map((row) => row.id);
  const probeB = windowOf(sortTied(rows, 1001), 1).map((row) => row.id);
  const probeOverlap = probeA.filter((id) => probeB.includes(id)).length;
  assert(probeOverlap > 0, `janelas com empates instáveis se cruzam (${probeOverlap})`);

  const unstable = await loadFinanceReceiptPagesProgressive({
    exactCount: total,
    pageSize,
    concurrency: 2,
    loadPage: async (pageIndex) => windowOf(sortTied(rows, 1000 + pageIndex), pageIndex),
  });
  const unstableIds = unstable.rows.map((row) => row.id);
  assert(unstable.complete, 'leitura instável completa a contagem pedida');
  assert(unstable.rows.length === total, 'offset instável ainda devolve o tamanho das janelas');
  const unstableUnique = new Set(unstableIds).size;
  assert(
    unstableUnique < total,
    `sem o id, páginas paralelas repetem e omitem (únicos ${unstableUnique} de ${total})`,
  );

  const sequential = await loadFinanceReceiptPagesProgressive({
    exactCount: total,
    pageSize,
    concurrency: 1,
    loadPage: async (pageIndex) => windowOf(sortTied(rows, 2000 + pageIndex), pageIndex),
  });
  assert(
    new Set(sequential.rows.map((row) => row.id)).size < total,
    'a repetição também ocorre com páginas em série',
  );

  const stable = sortTied(rows, null);
  const expectedIds = stable.map((row) => row.id).join('|');
  const expectedCents = centsOf(stable);
  for (let run = 0; run < 5; run += 1) {
    const loaded = await loadFinanceReceiptPagesProgressive({
      exactCount: total,
      pageSize,
      concurrency: 2,
      loadPage: async (pageIndex) => windowOf(stable, pageIndex),
    });
    const ids = loaded.rows.map((row) => row.id);
    assert(loaded.complete && loaded.rows.length === total, `leitura ${run + 1} completa`);
    assert(new Set(ids).size === total, `leitura ${run + 1} sem id repetido ou omitido`);
    assert(ids.join('|') === expectedIds, `leitura ${run + 1} conserva a ordem`);
    assert(centsOf(loaded.rows) === expectedCents, `leitura ${run + 1} conserva os centavos`);
    const ui = paginateFinanceReceiptRows(loaded.rows, 2, 20);
    assert(ui.totalCount === total && ui.from === 21 && ui.pageRows[0]?.id === ids[20], 'página da tela segue a ordem estável');
  }

  const source = readFileSync(resolve('lib/finance/fetchFinanceReceiptsPaged.ts'), 'utf8');
  const orderBlock = source.slice(source.indexOf('function applyListOrdering'), source.indexOf('/**', source.indexOf('function applyListOrdering')));
  assert(orderBlock.includes(".order('due_date', { ascending: true })"), 'vencimento permanece primeiro');
  assert(orderBlock.includes(".order('installment_number', { ascending: true })"), 'número da parcela permanece');
  assert(orderBlock.includes(".order('id', { ascending: true })"), 'id é o último desempate');
  const dueAt = orderBlock.indexOf(".order('due_date'");
  const numberAt = orderBlock.indexOf(".order('installment_number'");
  const idAt = orderBlock.indexOf(".order('id'");
  assert(dueAt < numberAt && numberAt < idAt, 'a ordem é vencimento, número e id');
  console.log('OK testTiedDueDatesNeedIdOrder');
}

async function main() {
  testPageSizes();
  testFortyEightInstallmentsPagination();
  testFiltersAndOrderingPreservedInSlice();
  testMultiTenantIsolation();
  testNoSilentPostgrestCut();
  testNoDuplicatesInFortyEight();
  await testTiedDueDatesNeedIdOrder();
  console.log('ALL mandatory-finance-receipts-pagination-tests PASSED');
}

main();
