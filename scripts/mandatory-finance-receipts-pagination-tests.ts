/**
 * Testes obrigatórios — paginação de finance_receipts (sem truncamento PostgREST).
 * npx tsx scripts/mandatory-finance-receipts-pagination-tests.ts
 */

import {
  DEFAULT_FINANCE_RECEIPTS_UI_PAGE_SIZE,
  FINANCE_RECEIPTS_UI_PAGE_SIZES,
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

function main() {
  testPageSizes();
  testFortyEightInstallmentsPagination();
  testFiltersAndOrderingPreservedInSlice();
  testMultiTenantIsolation();
  testNoSilentPostgrestCut();
  testNoDuplicatesInFortyEight();
  console.log('ALL mandatory-finance-receipts-pagination-tests PASSED');
}

main();
