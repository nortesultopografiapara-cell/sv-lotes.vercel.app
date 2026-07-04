/**
 * Estatísticas de corretores — contagem de vendas, ranking e PDF.
 * npx tsx scripts/mandatory-broker-dashboard-stats-tests.ts
 */

import {
  buildBrokerReportDetailRows,
  buildBrokerReportSummaryRows,
  buildBrokerStatsFromData,
  isCanceledSale,
  rankBrokersBySalesValue,
  resolveSaleBrokerIdForStats,
} from '../lib/brokerDashboardStats';
import { rankBrokersByMonthlySales } from '../lib/brokerDelete';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const brokers = [
  { id: 'cassio', name: 'Cassio VS10', email: 'cassio@test.com' },
  { id: 'klesio', name: 'Klesio Meneses', email: 'klesio@test.com' },
];

function testCassioMultipleSales() {
  const sales = [
    {
      id: 's1',
      broker_id: 'cassio',
      status: 'ativo',
      total_value: 95000,
      sale_date: '2026-06-01T00:00:00Z',
      project_id: 'p1',
    },
    {
      id: 's2',
      broker_id: 'cassio',
      status: 'ativo',
      total_value: 55000,
      sale_date: '2026-05-15T00:00:00Z',
      project_id: 'p1',
    },
    {
      id: 's3',
      broker_id: 'cassio',
      status: 'ativo',
      total_value: 50000,
      sale_date: '2026-04-10T00:00:00Z',
      project_id: 'p1',
    },
  ];
  const { byBrokerId } = buildBrokerStatsFromData({
    brokers,
    sales,
    commissions: [],
    blocks: [
      { id: 'b1', sale_id: 's1', block_name: '10', number: '5', project_id: 'p1' },
      { id: 'b2', sale_id: 's2', block_name: '11', number: '2', project_id: 'p1' },
      { id: 'b3', sale_id: 's3', block_name: '12', number: '8', project_id: 'p1' },
    ],
    projects: [{ id: 'p1', name: 'CHACARAS RR' }],
    contracts: [
      { sale_id: 's1', contract_number: '000000001/2026' },
      { sale_id: 's2', contract_number: '000000002/2026' },
      { sale_id: 's3', contract_number: '000000003/2026' },
    ],
    customers: [],
  });
  const cassio = byBrokerId.get('cassio')!;
  assert(cassio.vendas_qtd === 3, `Cassio qtd ${cassio.vendas_qtd}`);
  assert(cassio.vendas_valor === 200000, `Cassio valor ${cassio.vendas_valor}`);
  assert(cassio.sale_details.length === 3, '3 linhas detalhe');
  console.log('OK testCassioMultipleSales');
}

function testKlesioMultipleSales() {
  const sales = [
    { id: 'k1', broker_id: 'klesio', status: 'ativo', total_value: 120000, sale_date: '2026-01-01' },
    { id: 'k2', broker_id: 'klesio', status: 'ativo', total_value: 80000, sale_date: '2026-02-01' },
  ];
  const { byBrokerId } = buildBrokerStatsFromData({
    brokers,
    sales,
    commissions: [],
    blocks: [],
    projects: [],
    contracts: [],
    customers: [],
  });
  const klesio = byBrokerId.get('klesio')!;
  assert(klesio.vendas_qtd === 2, 'Klesio 2 vendas');
  assert(klesio.vendas_valor === 200000, 'Klesio valor');
  console.log('OK testKlesioMultipleSales');
}

function testCanceledSaleExcluded() {
  const sales = [
    { id: 's1', broker_id: 'cassio', status: 'ativo', total_value: 100000 },
    { id: 's2', broker_id: 'cassio', status: 'cancelado', total_value: 999999 },
  ];
  const { byBrokerId } = buildBrokerStatsFromData({
    brokers,
    sales,
    commissions: [],
    blocks: [],
    projects: [],
    contracts: [],
    customers: [],
  });
  assert(byBrokerId.get('cassio')!.vendas_qtd === 1, 'cancelada não conta');
  assert(!isCanceledSale({ status: 'ativo' }), 'ativa ok');
  console.log('OK testCanceledSaleExcluded');
}

function testLegacyBrokerNameFallback() {
  const sales = [
    {
      id: 's1',
      broker_name: 'Cassio VS10',
      status: 'ativo',
      total_value: 75000,
    },
  ];
  const brokerId = resolveSaleBrokerIdForStats(sales[0], [], [], brokers);
  assert(brokerId === 'cassio', 'nome legado resolve id');
  const { byBrokerId } = buildBrokerStatsFromData({
    brokers,
    sales,
    commissions: [],
    blocks: [],
    projects: [],
    contracts: [],
    customers: [],
  });
  assert(byBrokerId.get('cassio')!.vendas_qtd === 1, 'conta via nome');
  console.log('OK testLegacyBrokerNameFallback');
}

function testRankingMatchesReport() {
  const sales = [
    { id: 's1', broker_id: 'cassio', status: 'ativo', total_value: 200000 },
    { id: 's2', broker_id: 'klesio', status: 'ativo', total_value: 150000 },
  ];
  const { byBrokerId } = buildBrokerStatsFromData({
    brokers,
    sales,
    commissions: [],
    blocks: [],
    projects: [],
    contracts: [],
    customers: [],
  });
  const enhanced = brokers.map((b) => ({
    ...b,
    vendas_mes_qtd: byBrokerId.get(b.id)!.vendas_qtd,
    vendas_mes_valor: byBrokerId.get(b.id)!.vendas_valor,
    stats: byBrokerId.get(b.id)!,
  }));
  const summary = buildBrokerReportSummaryRows(
    enhanced.map((b) => ({ id: b.id, name: b.name, stats: b.stats })),
  );
  const top = rankBrokersBySalesValue(enhanced, 2);
  const topLegacy = rankBrokersByMonthlySales(enhanced, 2);
  assert(summary[0].corretor === 'Cassio VS10', 'resumo cassio');
  assert(summary[0].vendas_qtd === 1, 'resumo qtd');
  assert(top[0].id === 'cassio', 'ranking cassio');
  assert(topLegacy[0].id === 'cassio', 'ranking legado');
  assert(
    summary.find((r) => r.corretor === 'Cassio VS10')!.vendas_valor ===
      top[0].vendas_mes_valor,
    'ranking bate resumo',
  );
  console.log('OK testRankingMatchesReport');
}

function testPdfDetailDoesNotRepeatSummaryTotals() {
  const sales = [
    { id: 's1', broker_id: 'cassio', status: 'ativo', total_value: 100000, sale_date: '2026-06-01' },
    { id: 's2', broker_id: 'cassio', status: 'ativo', total_value: 100000, sale_date: '2026-06-02' },
  ];
  const { byBrokerId } = buildBrokerStatsFromData({
    brokers,
    sales,
    commissions: [],
    blocks: [],
    projects: [],
    contracts: [],
    customers: [],
  });
  const enhanced = [
    {
      id: 'cassio',
      name: 'Cassio VS10',
      stats: byBrokerId.get('cassio')!,
    },
  ];
  const summary = buildBrokerReportSummaryRows(enhanced);
  const detail = buildBrokerReportDetailRows(enhanced);
  assert(summary.length === 1, '1 linha resumo');
  assert(summary[0].vendas_qtd === 2, 'resumo 2 vendas');
  assert(detail.length === 2, '2 linhas detalhe');
  assert(
    detail.every((d) => d.valor_venda === 100000),
    'detalhe valor por venda',
  );
  assert(
    detail.every((d) => d.broker_name === 'Cassio VS10'),
    'detalhe corretor',
  );
  console.log('OK testPdfDetailDoesNotRepeatSummaryTotals');
}

function testUnassignedSale() {
  const sales = [{ id: 's0', status: 'ativo', total_value: 10000 }];
  const { unassignedSales } = buildBrokerStatsFromData({
    brokers,
    sales,
    commissions: [],
    blocks: [],
    projects: [],
    contracts: [],
    customers: [],
  });
  assert(unassignedSales.length === 1, 'sem corretor');
  assert(unassignedSales[0].broker_name === 'Sem corretor', 'label sem corretor');
  console.log('OK testUnassignedSale');
}

function main() {
  testCassioMultipleSales();
  testKlesioMultipleSales();
  testCanceledSaleExcluded();
  testLegacyBrokerNameFallback();
  testRankingMatchesReport();
  testPdfDetailDoesNotRepeatSummaryTotals();
  testUnassignedSale();
  console.log('mandatory-broker-dashboard-stats-tests: all passed');
}

main();
