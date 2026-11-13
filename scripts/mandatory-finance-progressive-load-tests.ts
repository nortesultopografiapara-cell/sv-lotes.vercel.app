/**
 * Carregamento progressivo do Financeiro.
 * O conjunto completo precisa ser igual à leitura sequencial publicada.
 * npx tsx scripts/mandatory-finance-progressive-load-tests.ts
 */

import fs from 'node:fs';
import {
  buildFinanceReceiptLoadState,
  financeDatasetReadyForTotals,
  loadFinanceReceiptPagesProgressive,
  paginateFinanceReceiptRows,
} from '../lib/finance/fetchFinanceReceiptsPaged';
import {
  filterFinanceReceiptRows,
  type FinanceReceiptClientFilterInput,
} from '../lib/finance/financeReceiptClientFilter';
import { calculateFinancialTotals } from '../lib/financeCashFlow';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function cents(value: number) {
  return Math.round(value * 100);
}

type Row = Record<string, any>;

function buildDataset(count: number): Row[] {
  const groups = ['SIGNAL', 'LOT', 'LEGACY'];
  return Array.from({ length: count }, (_, i) => {
    const day = String((i % 27) + 1).padStart(2, '0');
    const status = i % 17 === 0 ? null : i % 11 === 0 ? 'cancelado' : i % 5 === 0 ? 'pago' : 'pendente';
    return {
      id: `r-${String(i + 1).padStart(5, '0')}`,
      amount: i === 0 ? 10.01 : i === 1 ? 20.02 : 100,
      paid_amount: status === 'pago' ? (i === 0 ? 10.01 : 20.02) : null,
      status,
      due_date: `2026-01-${day}`,
      installment_number: i % 12,
      schedule_group: groups[i % 3],
      sale_id: `sale-${i % 50}`,
      created_at: '2026-01-01T00:00:00.000Z',
      financial_account_id: i % 2 === 0 ? 'acc-1' : 'acc-2',
      customers: { name: i % 2 === 0 ? 'Ana Silva' : 'Bruno Costa' },
      sales: {
        id: `sale-${i % 50}`,
        financial_account_id: i % 2 === 0 ? 'acc-1' : 'acc-2',
        contracts: [{ contract_number: `CT-${1000 + (i % 40)}` }],
        projects: { name: i % 3 === 0 ? 'Recanto' : 'Outro' },
        installments_count: 12,
      },
      projects: { name: i % 3 === 0 ? 'Recanto' : 'Outro' },
      blocks: { name: 'QD 02A', block_name: 'QD 02A', number: String((i % 80) + 1) },
    };
  });
}

function pageOf(all: Row[], pageSize: number, index: number) {
  return all.slice(index * pageSize, (index + 1) * pageSize);
}

async function sequential(all: Row[], pageSize: number) {
  const rows: Row[] = [];
  const pages = Math.ceil(all.length / pageSize);
  for (let i = 0; i < pages; i += 1) {
    const chunk = pageOf(all, pageSize, i);
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

function publishedFinanceFilter(rows: Row[], filters: FinanceReceiptClientFilterInput) {
  const todayIso = filters.todayIso || '2026-11-13';
  return rows.filter((p) => {
    const computedContract =
      p.sales?.contracts?.[0]?.contract_number ||
      (p.sales?.id
        ? 'CT-' +
          new Date(p.created_at || new Date()).getFullYear() +
          '-' +
          p.sales.id.substring(0, 6).toUpperCase()
        : 'CT-S/N');
    const computedProjName =
      p.projects?.name ||
      p.sales?.projects?.name ||
      p.blocks?.projects?.name ||
      'Projeto Desconhecido';
    const search = filters.search || '';
    const matchSearch = search
      ? computedContract.toLowerCase().includes(search.toLowerCase()) ||
        p.sales?.id?.toLowerCase().includes(search.toLowerCase()) ||
        p.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.blocks?.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.blocks?.block_name?.toLowerCase().includes(search.toLowerCase()) ||
        String(p.blocks?.number).includes(search)
      : true;
    const matchStatus =
      filters.statusFilter !== 'Todas as Situações'
        ? (filters.statusFilter.toLowerCase() === 'pago' &&
            (p.status === 'pago' || p.status === 'PAID')) ||
          (filters.statusFilter.toLowerCase() === 'pendente' &&
            (p.status === 'pendente' || p.status === 'PENDING') &&
            p.due_date >= todayIso) ||
          (filters.statusFilter.toLowerCase() === 'atrasado' &&
            (p.status === 'atrasado' ||
              p.status === 'OVERDUE' ||
              ((p.status === 'pendente' || p.status === 'PENDING') &&
                p.due_date < todayIso))) ||
          (filters.statusFilter.toLowerCase() === 'cancelado' &&
            (p.status === 'cancelado' ||
              p.status === 'CANCELED' ||
              p.status === 'cancelled' ||
              p.status === 'CANCELLED'))
        : String(p.status || '').toLowerCase() !== 'cancelado' &&
          String(p.status || '').toLowerCase() !== 'canceled' &&
          String(p.status || '').toLowerCase() !== 'cancelled';
    const matchProject =
      filters.projectFilter !== 'Todos os projetos'
        ? computedProjName === filters.projectFilter
        : true;
    const receiptAccountId = String(
      p.financial_account_id || p.sales?.financial_account_id || '',
    ).trim();
    const matchFinancialAccount =
      filters.financialAccountFilter === 'Todas as contas'
        ? true
        : receiptAccountId === filters.financialAccountFilter;
    const matchStartDate = filters.startDate ? p.due_date >= filters.startDate : true;
    const matchEndDate = filters.endDate ? p.due_date <= filters.endDate : true;
    return (
      matchSearch &&
      matchStatus &&
      matchProject &&
      matchFinancialAccount &&
      matchStartDate &&
      matchEndDate
    );
  });
}

async function testEightThousandMatchesSequential() {
  const all = buildDataset(8426);
  const pageSize = 500;
  const expected = await sequential(all, pageSize);
  let firstPageSeen = false;
  let page2Done = false;
  let releasePage2: () => void = () => {};
  const page2Gate = new Promise<void>((resolve) => {
    releasePage2 = resolve;
  });
  const loaded = await loadFinanceReceiptPagesProgressive({
    exactCount: all.length,
    pageSize,
    concurrency: 2,
    loadPage: async (index) => {
      if (index === 2) {
        await page2Gate;
        page2Done = true;
      }
      return pageOf(all, pageSize, index);
    },
    onProgress: (state) => {
      if (!firstPageSeen && state.pagesCompleted >= 1) {
        firstPageSeen = true;
        assert(page2Done === false, 'a primeira página chegou antes da página lenta');
        assert(state.complete === false, 'a primeira página não fecha o conjunto');
        assert(state.rows.length === pageSize, 'a primeira página tem 500 linhas');
        assert(financeDatasetReadyForTotals(state) === false, 'totais bloqueados na prévia');
        releasePage2();
      }
    },
  });
  assert(firstPageSeen, 'houve prévia da primeira página');
  assert(loaded.complete === true, 'conjunto completo');
  assert(loaded.rows.length === 8426, '8426 linhas');
  assert(
    loaded.rows.map((row) => row.id).join(',') === expected.map((row) => row.id).join(','),
    'ordem igual à leitura sequencial',
  );
  for (const group of ['SIGNAL', 'LOT', 'LEGACY']) {
    const got = loaded.rows.filter((row) => row.schedule_group === group).length;
    const want = expected.filter((row) => row.schedule_group === group).length;
    assert(got === want, `${group} preservado`);
  }
  console.log('OK testEightThousandMatchesSequential');
}

async function testFirstPageFailure() {
  let calls = 0;
  const loaded = await loadFinanceReceiptPagesProgressive({
    exactCount: 8000,
    pageSize: 500,
    loadPage: async (index) => {
      calls += 1;
      if (index === 0) throw new Error('timeout simulado');
      return [{ id: `later-${index}` }];
    },
  });
  assert(calls === 1, 'falha na primeira página não dispara as seguintes');
  assert(loaded.rows.length === 0, 'sem linhas na falha inicial');
  assert(loaded.complete === false, 'falha inicial não é conjunto completo');
  assert(loaded.error?.includes('página 1') === true, 'erro identifica a página 1');
  assert(financeDatasetReadyForTotals(loaded) === false, 'falha inicial não publica totais');
  console.log('OK testFirstPageFailure');
}

async function testMiddlePageKeepsPrefixAndRetry() {
  const all = buildDataset(1600);
  const pageSize = 500;
  const loaded = await loadFinanceReceiptPagesProgressive({
    exactCount: all.length,
    pageSize,
    concurrency: 2,
    loadPage: async (index) => {
      if (index === 2) throw new Error('falha intermediaria');
      return pageOf(all, pageSize, index);
    },
  });
  assert(loaded.complete === false, 'página intermediária não completa');
  assert(loaded.failedPageIndex === 2, 'falha na página 2');
  assert(loaded.rows.length === 1000, 'prefixo validado de duas páginas');
  assert(loaded.rows[0].id === 'r-00001', 'prefixo começa no primeiro registro');
  assert(loaded.rows[999].id === 'r-01000', 'prefixo termina na linha 1000');
  assert(!loaded.rows.some((row) => row.id === 'r-01001'), 'não pula o buraco');
  const partialTotals = calculateFinancialTotals(loaded.rows, [], []);
  const resumed = await loadFinanceReceiptPagesProgressive({
    exactCount: all.length,
    pageSize,
    concurrency: 2,
    seedPages: loaded.pages,
    loadPage: async (index) => pageOf(all, pageSize, index),
  });
  assert(resumed.complete === true, 'nova tentativa completa');
  assert(resumed.rows.length === 1600, 'nova tentativa recupera o total');
  const fullTotals = calculateFinancialTotals(resumed.rows, [], []);
  assert(cents(partialTotals.saldoFinal) !== cents(fullTotals.saldoFinal), 'prévia não é o saldo final');
  assert(financeDatasetReadyForTotals(loaded) === false, 'prévia não autoriza saldo');
  assert(financeDatasetReadyForTotals(resumed) === true, 'conjunto completo autoriza saldo');
  console.log('OK testMiddlePageKeepsPrefixAndRetry');
}

function testNullStatusAndCombinedFilters() {
  const all = buildDataset(8426);
  const nullRow = all.find((row) => row.status == null);
  assert(Boolean(nullRow), 'existe status nulo');
  const filters: FinanceReceiptClientFilterInput = {
    search: 'Ana',
    statusFilter: 'Todas as Situações',
    projectFilter: 'Recanto',
    financialAccountFilter: 'acc-1',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    todayIso: '2026-11-13',
  };
  const published = publishedFinanceFilter(all, filters);
  const current = filterFinanceReceiptRows(all, filters);
  assert(
    published.map((row) => row.id).join(',') === current.map((row) => row.id).join(','),
    'filtro combinado igual ao da tela publicada',
  );
  assert(current.some((row) => row.status == null), 'status nulo permanece em Todas');
  assert(current.every((row) => String(row.status || '').toLowerCase() !== 'cancelado'), 'Todas oculta canceladas');
  assert(current.every((row) => row.customers.name === 'Ana Silva'), 'busca de cliente no conjunto inteiro');
  assert(current.every((row) => row.projects.name === 'Recanto'), 'filtro de projeto');
  const prefix = filterFinanceReceiptRows(all.slice(0, 500), filters);
  assert(prefix.length < current.length, 'busca na prévia não cobre o conjunto');
  for (const size of [20, 50, 100] as const) {
    const paged = paginateFinanceReceiptRows(current, 2, size);
    assert(paged.pageSize === size, `página ${size}`);
    assert(paged.totalCount === current.length, `total verdadeiro em ${size}`);
    assert(
      paged.pageRows.map((row) => row.id).join(',') ===
        current.slice(size, size * 2).map((row) => row.id).join(','),
      `fatia ${size}`,
    );
  }
  console.log('OK testNullStatusAndCombinedFilters');
}

function testExportsAndCents() {
  const all = buildDataset(8426);
  const filters: FinanceReceiptClientFilterInput = {
    search: 'CT-1001',
    statusFilter: 'Todas as Situações',
    projectFilter: 'Todos os projetos',
    financialAccountFilter: 'Todas as contas',
    startDate: '',
    endDate: '',
    todayIso: '2026-11-13',
  };
  const completeRows = filterFinanceReceiptRows(all, filters);
  const exportFrom = (rows: Row[], complete: boolean) => {
    if (!complete) {
      throw new Error('FINANCE_DATASET_INCOMPLETE');
    }
    return filterFinanceReceiptRows(rows, filters).map((row) => row.id);
  };
  let blocked = false;
  try {
    exportFrom(all.slice(0, 500), false);
  } catch (err) {
    blocked = err instanceof Error && err.message === 'FINANCE_DATASET_INCOMPLETE';
  }
  assert(blocked, 'exportação recusa lista parcial');
  const exported = exportFrom(all, true);
  assert(exported.join(',') === completeRows.map((row) => row.id).join(','), 'exportação usa o filtro completo');
  assert(exported.length > filterFinanceReceiptRows(all.slice(0, 500), filters).length, 'exportação não corta na primeira página');

  const receipts = [
    { id: 'paid-a', status: 'pago', amount: 10.01, paid_amount: 10.01 },
    { id: 'paid-b', status: 'pago', amount: 20.02, paid_amount: 20.02 },
    { id: 'pending', status: 'pendente', amount: 80, paid_amount: null },
    { id: 'cancelled', status: 'cancelado', amount: 999, paid_amount: null },
  ];
  const cash = [{ id: 'out', type: 'saida', status: 'ativo', amount: 1.5 }];
  const totals = calculateFinancialTotals(receipts, cash, []);
  assert(cents(totals.totalEntradas) === 3003, 'entradas em centavos');
  assert(cents(totals.totalSaidas) === 150, 'saídas em centavos');
  assert(cents(totals.saldoFinal) === 2853, 'saldo em centavos');
  const partial = buildFinanceReceiptLoadState({
    slots: [[receipts[2], receipts[3]]],
    pageSize: 2,
    exactCount: receipts.length,
  });
  assert(partial.complete === false, 'uma página de quatro registros não fecha');
  assert(
    cents(calculateFinancialTotals(partial.rows, cash, []).saldoFinal) !== cents(totals.saldoFinal),
    'saldo da prévia é diferente do saldo definitivo',
  );
  console.log('OK testExportsAndCents');
}

function testEmptyCountIsCompleteAndFailureIsNot() {
  const empty = buildFinanceReceiptLoadState<Row>({
    slots: [],
    pageSize: 500,
    exactCount: 0,
  });
  assert(empty.complete === true, 'contagem zero bem sucedida é conjunto vazio válido');
  assert(financeDatasetReadyForTotals(empty) === true, 'zero verdadeiro pode publicar');
  const failed = buildFinanceReceiptLoadState<Row>({
    slots: [],
    pageSize: 500,
    exactCount: 0,
    error: 'Não foi possível contar as parcelas. Os totais financeiros não foram atualizados.',
    failedPageIndex: 0,
  });
  assert(failed.complete === false, 'falha de contagem não é zero válido');
  assert(financeDatasetReadyForTotals(failed) === false, 'falha de contagem não publica totais');
  console.log('OK testEmptyCountIsCompleteAndFailureIsNot');
}

function testSourcesStaySeparated() {
  const finance = fs.readFileSync(new URL('../app/finance/page.tsx', import.meta.url), 'utf8');
  const charges = fs.readFileSync(
    new URL('../components/charges/ChargesPageClient.tsx', import.meta.url),
    'utf8',
  );
  assert(finance.includes('fetchFinanceReceiptsProgressive'), 'financeiro usa a carga progressiva');
  assert(!finance.includes('fetchAllFinanceReceiptsPaged'), 'financeiro não espera mais o bloco inteiro');
  assert(charges.includes('fetchAllFinanceReceiptsPaged'), 'cobranças permanece na leitura publicada');
  assert(!charges.includes('fetchFinanceReceiptsProgressive'), 'cobranças não mudou de estratégia');
  assert(finance.includes('calculateFinancialTotals(data || [], cashData, commsData)'), 'fórmula dos totais preservada');
  console.log('OK testSourcesStaySeparated');
}

async function main() {
  await testEightThousandMatchesSequential();
  await testFirstPageFailure();
  await testMiddlePageKeepsPrefixAndRetry();
  testNullStatusAndCombinedFilters();
  testExportsAndCents();
  testEmptyCountIsCompleteAndFailureIsNot();
  testSourcesStaySeparated();
  console.log('FINANCE_PROGRESSIVE_TESTS_OK');
}

void main();
