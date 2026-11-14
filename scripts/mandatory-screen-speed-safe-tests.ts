/**
 * Otimização segura das telas: conjunto completo igual ao anterior,
 * falha e troca de empreendimento não publicam total, alertas acima de 1000.
 * npx tsx scripts/mandatory-screen-speed-safe-tests.ts
 */

import fs from 'node:fs';
import { calculateFinancialTotals } from '../lib/financeCashFlow';
import {
  FINANCE_RECEIPTS_FETCH_PAGE_SIZE,
  buildFinanceReceiptLoadState,
  financeDatasetReadyForTotals,
  loadFinanceReceiptPagesProgressive,
  paginateFinanceReceiptRows,
  simulatePostgrestTruncation,
} from '../lib/finance/fetchFinanceReceiptsPaged';
import { filterFinanceReceiptRows } from '../lib/finance/financeReceiptClientFilter';
import {
  applyFinanceReceiptRelations,
  FINANCE_RECEIPTS_ESSENTIAL_SELECT,
  FINANCE_RECEIPTS_SALE_CONTRACT_EMBED,
  type FinanceReceiptRelationMaps,
} from '../lib/finance/financeReceiptRelations';
import { FINANCE_RECEIPTS_LIST_SELECT } from '../lib/finance/financeReceiptsEmbed';
import {
  buildCustomerReadSelect,
  buildReceiptReadSelect,
  catalogFromOpenApi,
  financeOmittedColumns,
} from '../lib/finance/financeColumnCatalog';
import {
  publishFinanceNotificationSource,
  resetPublishedFinanceNotificationSource,
  summarizeFinanceNotificationAlerts,
  waitForPublishedFinanceNotificationSource,
} from '../lib/finance/financeNotificationAlerts';
import {
  resetContractsListSelectMemory,
  runContractsSelectWithFallback,
} from '../lib/contractsListService';
import {
  loadSaleSplitView,
  resetSaleSplitViewClient,
} from '../lib/finance/revenueSplit/saleSplitViewClient';

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
    const status =
      i % 17 === 0 ? null : i % 11 === 0 ? 'cancelado' : i % 5 === 0 ? 'pago' : 'pendente';
    return {
      id: `r-${String(i + 1).padStart(5, '0')}`,
      amount: i === 0 ? 10.01 : i === 1 ? 20.02 : 100,
      paid_amount: status === 'pago' ? (i === 0 ? 10.01 : i === 1 ? 20.02 : 100) : null,
      status,
      due_date: `2026-01-${day}`,
      installment_number: i % 12,
      schedule_group: groups[i % 3],
      sale_id: `sale-${i % 50}`,
      created_at: '2026-01-01T00:00:00.000Z',
      customers: { name: i % 2 === 0 ? 'Ana Silva' : 'Bruno Costa' },
      sales: {
        id: `sale-${i % 50}`,
        contracts: [{ contract_number: `CT-${1000 + (i % 40)}` }],
        projects: { name: i % 3 === 0 ? 'Recanto' : 'Outro' },
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

async function testCompleteEqualsSequential(count: number) {
  const all = buildDataset(count);
  const pageSize = FINANCE_RECEIPTS_FETCH_PAGE_SIZE;
  const loaded = await loadFinanceReceiptPagesProgressive<Row>({
    exactCount: all.length,
    pageSize,
    concurrency: 2,
    loadPage: async (index) => pageOf(all, pageSize, index),
  });
  const seq = await sequential(all, pageSize);
  assert(loaded.complete, `${count} completo`);
  assert(financeDatasetReadyForTotals(loaded), `${count} pronto para totais`);
  assert(loaded.rows.length === seq.length, `${count} quantidade`);
  assert(
    loaded.rows.every((row, index) => row.id === seq[index].id),
    `${count} mesma ordem`,
  );
  const before = calculateFinancialTotals(seq, [], []);
  const after = calculateFinancialTotals(loaded.rows, [], []);
  assert(cents(before.totalEntradas) === cents(after.totalEntradas), `${count} entradas`);
  assert(cents(before.totalSaidas) === cents(after.totalSaidas), `${count} saidas`);
  assert(cents(before.saldoFinal) === cents(after.saldoFinal), `${count} saldo`);
  const filtered = filterFinanceReceiptRows(loaded.rows, {
    search: 'Ana',
    statusFilter: 'Pago',
    projectFilter: 'Recanto',
    financialAccountFilter: 'Todas as contas',
    startDate: '',
    endDate: '',
    todayIso: '2026-11-13',
  });
  const page = paginateFinanceReceiptRows(filtered, 2, 20);
  assert(page.totalCount === filtered.length, `${count} paginação no conjunto filtrado`);
  console.log('OK conjunto', count, 'saldo centavos', cents(after.saldoFinal));
}

async function testPartialDoesNotPublishTotals() {
  const all = buildDataset(8000);
  const pageSize = 500;
  const partial = buildFinanceReceiptLoadState<Row>({
    slots: [pageOf(all, pageSize, 0)],
    pageSize,
    exactCount: all.length,
  });
  assert(!financeDatasetReadyForTotals(partial), 'página única não fecha o total');
  const full = calculateFinancialTotals(all, [], []);
  const early = calculateFinancialTotals(partial.rows, [], []);
  assert(cents(full.saldoFinal) !== cents(early.saldoFinal), 'parcial difere do saldo final');
  console.log('OK total parcial não é definitivo');
}

async function testIntermediateFailureKeepsValidatedPrefix() {
  const all = buildDataset(5000);
  const pageSize = 500;
  const loaded = await loadFinanceReceiptPagesProgressive<Row>({
    exactCount: all.length,
    pageSize,
    concurrency: 2,
    loadPage: async (index) => {
      if (index === 3) throw new Error('falha simulada');
      return pageOf(all, pageSize, index);
    },
  });
  assert(!loaded.complete, 'falha intermediária não completa');
  assert(!financeDatasetReadyForTotals(loaded), 'falha não autoriza total');
  assert(loaded.rows.length === 1500, 'prefixo validado de 1500');
  assert(loaded.rows[0].id === all[0].id, 'prefixo começa no início');
  console.log('OK falha intermediária');
}

async function testProjectChangeDiscardsLateResult() {
  const all = buildDataset(1500);
  const pageSize = 500;
  let gen = 1;
  let sawPartial = false;
  let publishedComplete = false;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = loadFinanceReceiptPagesProgressive<Row>({
    exactCount: all.length,
    pageSize,
    concurrency: 1,
    loadPage: async (index) => {
      if (index > 0) await gate;
      return pageOf(all, pageSize, index);
    },
    onProgress: (state) => {
      if (!state.complete) sawPartial = true;
      if (gen === 1 && state.complete) publishedComplete = true;
    },
  });
  for (let i = 0; i < 50 && !sawPartial; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert(sawPartial, 'primeira página apareceu antes da troca');
  gen = 2;
  release();
  const finished = await pending;
  assert(finished.complete, 'a carga antiga termina');
  assert(!publishedComplete, 'o empreendimento anterior não publica o total');
  console.log('OK troca de empreendimento descarta o resultado antigo');
}

function testNotificationsBeyondDefaultCap() {
  const now = new Date('2026-11-13T12:00:00.000Z');
  const rows = Array.from({ length: 8001 }, (_, i) => ({
    amount: 10,
    due_date: i === 1000 || i === 8000 ? '2026-11-01' : '2026-12-01',
    status: 'pendente',
    sale_id: `sale-${i}`,
  }));
  const full = summarizeFinanceNotificationAlerts(rows, now);
  const truncated = summarizeFinanceNotificationAlerts(rows.slice(0, 1000), now);
  assert(full.qtyLate === 2, 'as duas parcelas além da primeira página entram no atraso');
  assert(truncated.qtyLate === 0, 'o corte em 1000 esconde os atrasos');
  const cap = simulatePostgrestTruncation({ allRows: rows, maxRows: 1000 });
  assert(cap.truncated, 'consulta sem página corta');
  assert(cap.pagedAll.length === 8001, 'leitura paginada devolve o conjunto');
  console.log('OK notificações acima de 1000');
}

function fakeContractsClient(missing: string[]) {
  const calls: string[] = [];
  const supabase = {
    from() {
      return {
        select(select: string) {
          const chain = {
            or() {
              return chain;
            },
            eq() {
              return chain;
            },
            order() {
              calls.push(select);
              const absent = missing.find((column) =>
                select.split(',').map((part) => part.trim()).includes(column),
              );
              if (absent) {
                return Promise.resolve({
                  data: null,
                  error: { message: `column contracts.${absent} does not exist` },
                });
              }
              return Promise.resolve({
                data: [
                  {
                    id: 'old-1',
                    contract_number: '000000001/2024',
                    status: 'assinado',
                  },
                  {
                    id: 'new-2',
                    contract_number: '000000013/2026',
                    status: 'ativo',
                    customer_name: 'Cliente Novo',
                  },
                ],
                error: null,
              });
            },
          };
          return chain;
        },
      };
    },
  };
  return { supabase: supabase as never, calls };
}

async function testContractSelectIsRemembered() {
  resetContractsListSelectMemory();
  const missing = ['sale_value', 'down_payment'];
  const first = fakeContractsClient(missing);
  const loaded = await runContractsSelectWithFallback(first.supabase, 'tenant-1');
  assert(loaded.error == null, 'primeira lista sem erro');
  assert(loaded.rows.length === 2, 'contrato antigo e novo');
  assert(first.calls.length === 3, 'descobre as colunas ausentes uma vez');
  const second = fakeContractsClient(missing);
  const again = await runContractsSelectWithFallback(second.supabase, 'tenant-1');
  assert(again.rows.length === 2, 'segunda abertura mantém os contratos');
  assert(second.calls.length === 1, 'não repete os selects incompatíveis');
  assert(!second.calls[0].includes('sale_value'), 'select lembrado sem sale_value');
  assert(!second.calls[0].includes('down_payment'), 'select lembrado sem down_payment');
  resetContractsListSelectMemory();
  console.log('OK select de contratos lembrado');
}

async function testSplit404StopsTheBurst() {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return {
      status: 404,
      json: async () => ({ error: 'Not found' }),
    };
  }) as typeof fetch;
  try {
    resetSaleSplitViewClient();
    const views = await Promise.all(
      ['s1', 's2', 's3', 's4', 's5'].map((id) => loadSaleSplitView(id)),
    );
    assert(views.every((view) => view == null), '404 não inventa rateio');
    assert(calls === 1, 'um 404 basta para a sessão');
    await loadSaleSplitView('s6');
    assert(calls === 1, 'nova linha não repete o 404');
  } finally {
    globalThis.fetch = original;
    resetSaleSplitViewClient();
  }
  console.log('OK rateio 404 não se repete');
}

async function testSplit200StillLoadsEachSale() {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const saleId = url.split('/').pop() || '';
    return {
      status: 200,
      ok: true,
      json: async () => ({
        saleId,
        operational: true,
        snapshot: { id: `snap-${saleId}` },
        participants: [],
        legs: [],
      }),
    };
  }) as typeof fetch;
  try {
    resetSaleSplitViewClient();
    const views = await Promise.all(
      ['a', 'b', 'c'].map((id) => loadSaleSplitView(id)),
    );
    assert(views.filter(Boolean).length === 3, 'rateio válido continua');
    assert(calls.length === 3, 'cada venda válida é lida uma vez');
  } finally {
    globalThis.fetch = original;
    resetSaleSplitViewClient();
  }
  console.log('OK rateio válido preservado');
}

async function testNotificationReusesPublishedRows() {
  resetPublishedFinanceNotificationSource();
  const pending = waitForPublishedFinanceNotificationSource(200);
  const rows = [{ amount: 10, due_date: '2026-11-01', status: 'pendente', sale_id: 's1' }];
  publishFinanceNotificationSource(rows);
  const received = await pending;
  assert(received?.length === 1, 'o sino recebe o conjunto já lido');
  const again = await waitForPublishedFinanceNotificationSource(50);
  assert(again?.length === 1, 'a segunda leitura não precisa de outra consulta');
  resetPublishedFinanceNotificationSource();
  const missed = await waitForPublishedFinanceNotificationSource(30);
  assert(missed == null, 'sem publicação o sino segue para a própria consulta');
  console.log('OK sino reutiliza a leitura da tela');
}

function testCatalogDropsOnlyMissingColumns() {
  const develop = catalogFromOpenApi({
    definitions: {
      finance_receipts: { properties: { id: {}, status: {}, amount: {}, schedule_group: {} } },
      customers: { properties: { id: {}, name: {}, phone: {}, document: {}, cpf_cnpj: {} } },
      blocks: { properties: { id: {}, name: {}, number: {}, project_id: {} } },
    },
  });
  assert(develop !== null, 'catálogo mínimo');
  const receipt = buildReceiptReadSelect(develop!.finance_receipts);
  assert(!receipt.select.includes('description'), 'description ausente não entra na parcela');
  assert(receipt.select.includes(FINANCE_RECEIPTS_SALE_CONTRACT_EMBED), 'embed permanece');
  assert(receipt.select === receipt.fallback, 'sem segunda consulta da parcela');
  const customer = buildCustomerReadSelect(develop!.customers);
  assert(!customer.select.includes('full_name'), 'full_name ausente não entra no cliente');
  assert(customer.select.includes('cpf_cnpj'), 'cpf_cnpj existente permanece');
  assert(customer.select === customer.fallback, 'sem segunda consulta do cliente');
  const withDescription = buildReceiptReadSelect([...develop!.finance_receipts, 'description']);
  assert(withDescription.select.includes('description'), 'description existente permanece');
  const omitted = financeOmittedColumns(develop);
  assert(omitted.includes('finance_receipts.description'), 'omissão da parcela identificada');
  assert(omitted.includes('customers.full_name'), 'omissão do cliente identificada');
  assert(!omitted.includes('customers.cpf_cnpj'), 'cpf_cnpj não é tratado como ausente');
}

function testEssentialRowsKeepIdentityAndCents() {
  assert(FINANCE_RECEIPTS_LIST_SELECT.includes(FINANCE_RECEIPTS_SALE_CONTRACT_EMBED), 'embed igual ao publicado');
  assert(FINANCE_RECEIPTS_ESSENTIAL_SELECT.includes(FINANCE_RECEIPTS_SALE_CONTRACT_EMBED), 'contrato permanece na parcela');
  assert(!FINANCE_RECEIPTS_ESSENTIAL_SELECT.includes('customers!'), 'cliente fora da parcela');
  assert(!FINANCE_RECEIPTS_ESSENTIAL_SELECT.includes('projects:project_id'), 'projeto da parcela fora do embed');
  assert(!FINANCE_RECEIPTS_ESSENTIAL_SELECT.includes('blocks:'), 'quadra fora da parcela');
  assert(!FINANCE_RECEIPTS_ESSENTIAL_SELECT.includes('is_current'), 'sem filtro de contrato vigente');

  const maps: FinanceReceiptRelationMaps = {
    customers: new Map([
      ['cust-1', { id: 'cust-1', name: 'Ana Silva', full_name: 'Ana Silva Costa', phone: '11999999999', document: '123', cpf_cnpj: null }],
    ]),
    projects: new Map([
      ['proj-1', { id: 'proj-1', name: 'CHACARAS DOIS IRMÃOS' }],
    ]),
    blocks: new Map([
      ['block-1', { id: 'block-1', block_name: '01', name: 'Quadra 01', number: '7', lot_number: '7', project_id: 'proj-1' }],
    ]),
  };
  const embeddedSale = {
    id: 'sale-1',
    installments_count: 59,
    projects: { name: 'CHACARAS E LOTES RR' },
    contracts: [{ contract_number: '000000200/2026' }, { contract_number: '000000107/2026' }],
  };

  const total = 9242;
  const rows = Array.from({ length: total }, (_, i) => ({
    id: `rec-${i}`,
    status: i % 17 === 0 ? 'pago' : 'pendente',
    amount: 100 + (i % 50),
    paid_amount: i % 17 === 0 ? 100 + (i % 50) : null,
    paid_at: i % 17 === 0 ? '2026-11-07T12:00:00Z' : null,
    due_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
    installment_number: i % 60,
    schedule_group: i % 3 === 0 ? 'SIGNAL' : i % 3 === 1 ? 'LOT' : null,
    sale_id: 'sale-1',
    customer_id: 'cust-1',
    project_id: i % 5 === 0 ? null : 'proj-1',
    block_id: 'block-1',
    financial_account_id: i % 4 === 0 ? null : 'acc-row',
    sales: embeddedSale,
  }));
  const beforeCents = rows.reduce((sum, row) => sum + cents(row.amount), 0);
  const started = Date.now();
  const enriched = applyFinanceReceiptRelations(rows, maps);
  const elapsed = Date.now() - started;
  assert(elapsed < 500, `junção de 9242 linhas em ${elapsed}ms`);
  assert(enriched.length === total, 'quantidade preservada');
  assert(enriched.every((row, i) => row.id === `rec-${i}`), 'ordem e identidade');
  assert(enriched.reduce((sum, row) => sum + cents(Number(row.amount)), 0) === beforeCents, 'centavos preservados');
  assert(enriched[0].schedule_group === 'SIGNAL', 'SIGNAL preservado');
  assert(enriched[1].schedule_group === 'LOT', 'LOT preservado');
  assert(enriched[2].schedule_group == null, 'LEGACY preservado');
  assert(enriched[0].customers?.name === 'Ana Silva', 'cliente da etapa B');
  assert(enriched[0].customers?.phone === '11999999999', 'telefone do WhatsApp');
  assert(enriched[0].sales?.contracts?.[0]?.contract_number === '000000200/2026', 'primeiro contrato do embed preservado');
  assert(enriched[0].sales?.contracts?.[1]?.contract_number === '000000107/2026', 'demais contratos do embed preservados');
  assert(enriched[0].sales?.installments_count === 59, 'contagem do carnê');
  assert(enriched[1].projects?.name === 'CHACARAS DOIS IRMÃOS', 'projeto da parcela');
  assert(enriched[0].projects == null, 'parcela sem projeto não ganha nome');
  assert(enriched[0].sales?.projects?.name === 'CHACARAS E LOTES RR', 'projeto da venda permanece no embed');
  assert(!('projects' in (enriched[0].blocks || {})), 'quadra não recebe projeto que o select antigo não trazia');
  assert(enriched[0].sales === embeddedSale, 'a junção não troca o objeto da venda');
  const found = filterFinanceReceiptRows(enriched, {
    search: 'Ana Silva',
    statusFilter: 'Todas as Situações',
    projectFilter: 'Todos os projetos',
    financialAccountFilter: 'Todas as contas',
    startDate: '',
    endDate: '',
  });
  assert(found.length === total, 'pesquisa só depois da etapa B');
  const byAccount = filterFinanceReceiptRows(enriched, {
    search: '',
    statusFilter: 'Todas as Situações',
    projectFilter: 'Todos os projetos',
    financialAccountFilter: 'acc-1',
    startDate: '',
    endDate: '',
  });
  assert(byAccount.length === 0, 'conta da venda não é inventada fora do embed');
  console.log(`OK etapa A/B em 9242 linhas (${elapsed}ms)`);
}

function testSourcesStayInScope() {
  const dashboard = fs.readFileSync('app/dashboard/page.tsx', 'utf8');
  const finance = fs.readFileSync('app/finance/page.tsx', 'utf8');
  const charges = fs.readFileSync('components/charges/ChargesPageClient.tsx', 'utf8');
  const customers = fs.readFileSync('app/customers/page.tsx', 'utf8');
  const layout = fs.readFileSync('components/Layout.tsx', 'utf8');
  assert(dashboard.includes('fetchFinanceReceiptsProgressive'), 'dashboard paralelo');
  assert(dashboard.includes('setLotsReady(true)'), 'lotes independentes');
  assert(dashboard.includes('financeDatasetReadyForTotals'), 'total só com conjunto completo');
  assert(!dashboard.includes('fetchAllFinanceReceiptsPaged'), 'dashboard não varre em série');
  assert(finance.includes("select('*')"), 'caixa no select compatível');
  assert(finance.includes('FINANCE_PAID_COMMISSION_STATUSES'), 'comissões no filtro compatível');
  assert(!finance.includes('brokers(*)'), 'join inexistente de comissão removido');
  assert(finance.includes('financeAbortRef'), 'carga cancelável');
  assert(finance.includes('lotsReady={enterpriseLotsReady}'), 'lotes sem zero provisório');
  assert(charges.includes('fetchAllFinanceReceiptsPaged'), 'cobranças fora desta etapa');
  assert(customers.includes('blocks (id, block_name, name, number, status, projects(name))'), 'clientes preservados');
  assert(layout.includes('fetchFinanceNotificationReceipts'), 'sino paginado');
  assert(layout.includes('waitForPublishedFinanceNotificationSource'), 'sino não duplica a leitura da tela');
  assert(dashboard.includes('publishFinanceNotificationSource'), 'dashboard entrega os alertas');
  assert(finance.includes('publishFinanceNotificationSource'), 'financeiro entrega os alertas');
  const paged = fs.readFileSync('lib/finance/fetchFinanceReceiptsPaged.ts', 'utf8');
  assert(paged.includes('FINANCE_RECEIPTS_ESSENTIAL_SELECT'), 'financeiro separa a etapa A');
  assert(paged.includes('loadFinanceReceiptRelations'), 'cadastros em lote, não por parcela');
  assert(paged.includes('FINANCE_RECEIPTS_PROGRESS_CONCURRENCY = 2'), 'paralelismo segue em duas páginas');
  assert(charges.includes('fetchAllFinanceReceiptsPaged'), 'cobranças fora desta etapa');
  assert(!layout.includes(".select('amount, due_date, status, sale_id')"), 'sino sem leitura única');
  console.log('OK fontes');
}

async function main() {
  await testCompleteEqualsSequential(64);
  await testCompleteEqualsSequential(5000);
  await testCompleteEqualsSequential(8426);
  await testPartialDoesNotPublishTotals();
  await testIntermediateFailureKeepsValidatedPrefix();
  await testProjectChangeDiscardsLateResult();
  testNotificationsBeyondDefaultCap();
  await testNotificationReusesPublishedRows();
  await testContractSelectIsRemembered();
  await testSplit404StopsTheBurst();
  await testSplit200StillLoadsEachSale();
  testEssentialRowsKeepIdentityAndCents();
  testCatalogDropsOnlyMissingColumns();
  testSourcesStayInScope();
  console.log('SCREEN_SPEED_SAFE_TESTS_OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
