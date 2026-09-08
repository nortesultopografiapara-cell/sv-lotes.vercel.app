/**
 * Evolução financeira 6 meses — Dashboard V2.
 * npx tsx scripts/mandatory-dashboard-financial-evolution-tests.ts
 */

import fs from 'fs';
import path from 'path';
import { calculateFinancialTotals } from '../lib/financeCashFlow';
import {
  buildDashboardFinancialEvolution,
  buildRollingMonthWindow,
  formatDashboardMonthLabel,
  monthKeyFromFinanceDate,
  sumEvolutionSeries,
} from '../lib/dashboardFinancialEvolution';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string) {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function testAlwaysSixMonthsNoFuture() {
  const sep = new Date(2026, 8, 15);
  const keys = buildRollingMonthWindow(sep);
  assert(keys.length === 6, `len=${keys.length}`);
  assert(keys.join('|') === '2026-04|2026-05|2026-06|2026-07|2026-08|2026-09', keys.join('|'));
  assert(keys.every((k) => k <= '2026-09'), 'sem meses futuros');

  const empty = buildDashboardFinancialEvolution([], [], [], sep);
  assert(empty.length === 6, 'série vazia ainda tem 6 meses');
  assert(empty.every((p) => p.entradas === 0 && p.saidas === 0), 'meses sem movimento = 0');
  assert(empty[0].name === 'Abr/2026', empty[0].name);
  assert(empty[5].name === 'Set/2026', empty[5].name);
  console.log('OK testAlwaysSixMonthsNoFuture');
}

function testYearRolloverOctoberToMarch() {
  const mar = new Date(2026, 2, 10);
  const keys = buildRollingMonthWindow(mar);
  assert(keys.join('|') === '2025-10|2025-11|2025-12|2026-01|2026-02|2026-03', keys.join('|'));
  assert(formatDashboardMonthLabel('2025-10') === 'Out/2025', 'Out/2025');
  assert(formatDashboardMonthLabel('2026-03') === 'Mar/2026', 'Mar/2026');
  console.log('OK testYearRolloverOctoberToMarch');
}

function testWindowAdvancesAutomatically() {
  const oct = buildRollingMonthWindow(new Date(2026, 9, 1));
  assert(oct.join('|') === '2026-05|2026-06|2026-07|2026-08|2026-09|2026-10', oct.join('|'));
  const nov = buildRollingMonthWindow(new Date(2026, 10, 1));
  assert(nov.join('|') === '2026-06|2026-07|2026-08|2026-09|2026-10|2026-11', nov.join('|'));
  console.log('OK testWindowAdvancesAutomatically');
}

function testGroupingMatchesCalculateFinancialTotals() {
  const receipts = [
    { id: 'r-apr', status: 'pago', paid_amount: 100, paid_at: '2026-04-10', amount: 100 },
    { id: 'r-aug', status: 'pago', paid_amount: 80, paid_at: '2026-08-02', amount: 80 },
    { id: 'r-old', status: 'pago', paid_amount: 999, paid_at: '2025-01-01', amount: 999 },
    { id: 'r-pending', status: 'pendente', amount: 50, due_date: '2026-06-01' },
  ];
  const cash = [
    { id: 'c-may', status: 'ativo', type: 'saida', amount: 20, movement_date: '2026-05-12' },
    { id: 'c-jun', status: 'ativo', type: 'entrada', amount: 50, movement_date: '2026-06-03' },
    {
      id: 'c-aug',
      status: 'ativo',
      type: 'entrada',
      amount: 80,
      movement_date: '2026-08-02',
      finance_receipt_id: 'r-aug',
    },
    { id: 'c-est', status: 'estornado', type: 'saida', amount: 40, movement_date: '2026-07-01' },
  ];
  const comms = [
    { id: 'cm-jul', status: 'pago', amount: 10, paid_at: '2026-07-20', sale_id: 's1', broker_id: 'b1' },
  ];

  const ref = new Date(2026, 8, 8);
  const series = buildDashboardFinancialEvolution(receipts, cash, comms, ref);
  assert(series.length === 6, '6 meses');
  assert(series[0].entradas === 100 && series[0].saidas === 0, `abr=${JSON.stringify(series[0])}`);
  assert(series[1].entradas === 0 && series[1].saidas === 20, `mai=${JSON.stringify(series[1])}`);
  assert(series[2].entradas === 50 && series[2].saidas === 0, `jun=${JSON.stringify(series[2])}`);
  assert(series[3].entradas === 0 && series[3].saidas === 10, `jul=${JSON.stringify(series[3])}`);
  assert(series[4].entradas === 80 && series[4].saidas === 0, `ago=${JSON.stringify(series[4])}`);
  assert(series[5].entradas === 0 && series[5].saidas === 0, `set=${JSON.stringify(series[5])}`);

  const windowReceipts = receipts.filter((r) => {
    const key = monthKeyFromFinanceDate(r.paid_at || r.due_date);
    return key && key >= '2026-04' && key <= '2026-09';
  });
  const windowCash = cash.filter((c) => {
    const key = monthKeyFromFinanceDate(c.movement_date);
    return key && key >= '2026-04' && key <= '2026-09';
  });
  const windowComms = comms.filter((c) => {
    const key = monthKeyFromFinanceDate(c.paid_at);
    return key && key >= '2026-04' && key <= '2026-09';
  });
  const totals = calculateFinancialTotals(windowReceipts, windowCash, windowComms);
  const summed = sumEvolutionSeries(series);
  assert(summed.entradas === totals.totalEntradas, `entradas ${summed.entradas} vs ${totals.totalEntradas}`);
  assert(summed.saidas === totals.totalSaidas, `saidas ${summed.saidas} vs ${totals.totalSaidas}`);
  console.log('OK testGroupingMatchesCalculateFinancialTotals', summed);
}

function testDashboardWiresPagedSourcesAndChart() {
  const page = read('app/dashboard/page.tsx');
  const helper = read('lib/finance/fetchFinanceCompanionPaged.ts');
  const paged = read('lib/finance/fetchTenantRowsPaged.ts');
  const evo = read('lib/dashboardFinancialEvolution.ts');

  assert(page.includes('fetchAllCashMovementsPaged'), 'caixa paginado');
  assert(page.includes('fetchAllBrokerCommissionsPaged'), 'comissões paginadas');
  assert(page.includes('fetchAllFinanceReceiptsPaged'), 'receipts paginados');
  assert(page.includes('buildDashboardFinancialEvolution'), 'agrupa em memória');
  assert(page.includes('CashFlowBarChartPanel'), 'gráfico de barras');
  assert(page.includes('Evolução financeira (últimos 6 meses)'), 'título');
  assert(!page.includes("from('cash_movements').select('*')"), 'sem select * sem range');
  assert(!page.includes("from('broker_commissions').select('*')"), 'sem select * sem range');
  assert(helper.includes('fetchAllTenantRowsPaged'), 'reutiliza helper paginado');
  assert(paged.includes('.range(') || paged.includes('range('), 'usa range PostgREST');
  assert(!evo.includes('export function calculateFinancialTotals'), 'não redefine a fórmula');
  assert(evo.includes('collectInstallmentIdsWithCashEntrada'), 'mesma exclusão de parcela+caixa');
  assert(evo.includes('shouldCountPaidReceiptInCashFlow'), 'mesmo critério de entrada de parcela');
  assert(!page.includes('1247'), 'sem mock');
  assert(!page.includes('.insert('), 'sem escrita');
  console.log('OK testDashboardWiresPagedSourcesAndChart');
}

function main() {
  testAlwaysSixMonthsNoFuture();
  testYearRolloverOctoberToMarch();
  testWindowAdvancesAutomatically();
  testGroupingMatchesCalculateFinancialTotals();
  testDashboardWiresPagedSourcesAndChart();
  console.log('OK — mandatory-dashboard-financial-evolution-tests passed');
}

main();
