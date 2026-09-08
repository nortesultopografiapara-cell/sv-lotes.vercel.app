/**
 * Dashboard V2 — regressão visual/analítica sem mudar regras financeiras.
 * npx tsx scripts/mandatory-dashboard-v2-layout-tests.ts
 */

import fs from 'fs';
import path from 'path';
import { buildDashboardLotDistribution } from '../lib/dashboardLotDistribution';
import {
  buildDashboardParcelPieData,
  summarizeDashboardParcelStatus,
} from '../lib/dashboardParcelStatus';
import {
  DASHBOARD_ACTIVITY_ACTIONS,
  DASHBOARD_ACTIVITY_LIMIT,
  mapLotAuditRowsToDashboardActivities,
} from '../lib/dashboardRecentActivities';
import type { LotAuditLogRow } from '../lib/lotAudit';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string) {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function testLotDonutUsesSameKpiSource() {
  const dist = buildDashboardLotDistribution({
    available: 10,
    reserved: 3,
    sold: 5,
    paid: 2,
  });
  assert(dist.totalLotes === 20, `total=${dist.totalLotes}`);
  assert(dist.pieData.length === 3, 'três categorias');
  assert(dist.pieData[0].name === 'Disponíveis' && dist.pieData[0].value === 10, 'disponíveis');
  assert(dist.pieData[1].name === 'Reservados' && dist.pieData[1].value === 3, 'reservados');
  assert(
    dist.pieData[2].name === 'Vendidos/quitados' && dist.pieData[2].value === 7,
    'vendidos+quitados',
  );
  const sum = dist.pieData.reduce((acc, s) => acc + s.value, 0);
  assert(sum === dist.totalLotes, 'total = soma das categorias');
  console.log('OK testLotDonutUsesSameKpiSource');
}

function testParcelStatusUsesPersistedAtrasadoOnly() {
  const counts = summarizeDashboardParcelStatus([
    { status: 'pago' },
    { status: 'paid' },
    { status: 'pendente' },
    { status: 'pending' },
    { status: 'atrasado' },
    { status: 'overdue' },
    { status: 'cancelado' },
    {
      status: 'pendente',
      due_date: '2000-01-01',
    } as { status: string; due_date: string },
  ]);
  assert(counts.pago === 2, `pago=${counts.pago}`);
  assert(counts.pendente === 3, `pendente inclui vencido persistido como pendente: ${counts.pendente}`);
  assert(counts.atrasado === 2, `atrasado persistido=${counts.atrasado}`);
  assert(counts.total === 7, 'cancelado fora do total');

  const pie = buildDashboardParcelPieData(counts);
  assert(pie.map((s) => s.name).join('|') === 'Pago|Pendente|Atrasado', pie.map((s) => s.name).join('|'));
  assert(!pie.some((s) => /outros|não recebido/i.test(s.name)), 'sem categorias fictícias');
  console.log('OK testParcelStatusUsesPersistedAtrasadoOnly');
}

function testActivitiesMapRealLotAuditOnly() {
  assert(DASHBOARD_ACTIVITY_LIMIT >= 5 && DASHBOARD_ACTIVITY_LIMIT <= 8, 'limite 5-8');
  assert(DASHBOARD_ACTIVITY_ACTIONS.includes('sold'), 'venda');
  assert(DASHBOARD_ACTIVITY_ACTIONS.includes('reserved'), 'reserva');
  assert(DASHBOARD_ACTIVITY_ACTIONS.includes('contract_generated'), 'contrato');
  assert(DASHBOARD_ACTIVITY_ACTIONS.includes('payment_received'), 'pagamento');

  const rows: LotAuditLogRow[] = [
    {
      id: '1',
      company_id: 'c1',
      project_id: 'p1',
      block_id: 'b1',
      lot_id: 'b1',
      sale_id: null,
      contract_id: null,
      user_id: null,
      action: 'sold',
      title: 'Lote vendido',
      description: 'Quadra 01 lote 02',
      old_data: null,
      new_data: null,
      created_at: '2026-09-08T12:00:00.000Z',
      source: 'sale_flow',
    },
    {
      id: '2',
      company_id: 'c1',
      project_id: 'p1',
      block_id: 'b1',
      lot_id: 'b1',
      sale_id: null,
      contract_id: null,
      user_id: null,
      action: 'confrontation_auto',
      title: 'Confrontação',
      description: null,
      old_data: null,
      new_data: null,
      created_at: '2026-09-08T11:00:00.000Z',
      source: 'gis_map',
    },
  ];
  const mapped = mapLotAuditRowsToDashboardActivities(rows, 8);
  assert(mapped.length === 1, 'não inventa nem inclui confronto');
  assert(mapped[0].title === 'Lote vendido', mapped[0].title);
  assert(mapped[0].subtitle === 'Quadra 01 lote 02', mapped[0].subtitle);
  console.log('OK testActivitiesMapRealLotAuditOnly');
}

function testDashboardPageWiring() {
  const page = read('app/dashboard/page.tsx');
  const css = read('app/dashboard/dashboard-premium.css');
  const finance = read('lib/financeCashFlow.ts');

  assert(page.includes('title="Recebido no mês"'), 'KPI recebido');
  assert(page.includes('title="Valor global"'), 'KPI valor global');
  assert(page.includes('title="Valor disponível"'), 'KPI disponível');
  assert(page.includes('title="Valor reservado"'), 'KPI reservado');
  assert(page.includes('title="Valor vendido"'), 'KPI vendido');
  assert(page.includes('title="Valor do empreendimento"'), '5º card no filtro');
  assert(page.includes('title="Lotes disponíveis"'), 'lotes disponíveis');
  assert(page.includes('title="Inadimplência"'), 'inadimplência');
  assert(
    /title="Recebido no mês"[\s\S]*?isCurrency/.test(page),
    'Recebido no mês com isCurrency',
  );
  assert(
    /title="Lotes disponíveis"[\s\S]*?formatEnterpriseCurrency\(stats\.availableValue\)/.test(
      page,
    ),
    'subtitle monetário dos lotes',
  );

  assert(page.includes('calculateFinancialTotals'), 'mesma fórmula financeira');
  assert(page.includes('fetchAllFinanceReceiptsPaged'), 'receipts paginados');
  assert(page.includes("from('lot_audit_logs')"), 'timeline lot_audit_logs');
  assert(page.includes("applyTenantIdEq"), 'filtro company_id');
  assert(!page.includes("from('logs')"), 'não usa public.logs');
  assert(page.includes('LotsDonutChart'), 'donut de lotes');
  assert(page.includes('buildDashboardLotDistribution'), 'mesma fonte dos KPIs');
  assert(page.includes('summarizeDashboardParcelStatus'), 'parcelas dos receipts');
  assert(page.includes('FinancialIntegrationDashboardCard'), 'card Asaas');
  assert(page.includes('DashboardActivitiesError'), 'erro explícito da timeline');
  assert(!page.includes('CashFlowBarChartPanel'), 'gráfico 6 meses adiado');
  assert(!page.includes('1247'), 'sem número mockado');
  assert(!page.includes('Não recebido'), 'sem categoria fictícia');
  assert(!page.includes('.insert('), 'dashboard sem insert');
  assert(!page.includes('.update('), 'dashboard sem update');
  assert(!page.includes('.delete('), 'dashboard sem delete');

  assert(!css.includes('min-height: 620px'), 'sem reserva do dash-map-panel');
  assert(!css.includes('dash-map-panel'), 'CSS do mapa obsoleto removido');

  assert(finance.includes('export function calculateFinancialTotals'), 'função intacta');
  console.log('OK testDashboardPageWiring');
}

function testNoNewFinancialRuleInCashFlow() {
  const source = read('lib/financeCashFlow.ts');
  assert(
    source.includes('Mesma lógica dos cards Entradas/Saídas do módulo Financeiro'),
    'comentário da fórmula original',
  );
  assert(source.includes('totalEntradas'), 'entradas');
  assert(source.includes('totalSaidas'), 'saídas');
  assert(source.includes('saldoFinal'), 'saldo');
  console.log('OK testNoNewFinancialRuleInCashFlow');
}

function main() {
  testLotDonutUsesSameKpiSource();
  testParcelStatusUsesPersistedAtrasadoOnly();
  testActivitiesMapRealLotAuditOnly();
  testDashboardPageWiring();
  testNoNewFinancialRuleInCashFlow();
  console.log('OK — mandatory-dashboard-v2-layout-tests passed');
}

main();
