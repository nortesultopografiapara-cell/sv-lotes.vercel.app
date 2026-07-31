/**
 * Testes obrigatórios — Bridge valor_recebido + Dashboard 6.4.
 * npx tsx scripts/mandatory-master-corporate-finance-bridge-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  receivedSourceLabel,
  semanticToneForCashType,
  semanticToneForReceivableStatus,
  semanticToneForResult,
} from '../lib/master/corporateFinance/semantic';
import { computeUnprovisionedBalance } from '../lib/master/corporateFinance/projectContextService';
import { computeProjectFinancials } from '../lib/master/topography/projectFinancials';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

function testFiles() {
  assert(exists('lib/master/corporateFinance/projectReceivedBridge.ts'), 'bridge service');
  assert(exists('lib/master/corporateFinance/semantic.ts'), 'semantic');
  assert(
    exists('components/master/corporateFinance/CorporateFinanceSemantic.tsx'),
    'semantic UI',
  );
  assert(
    exists('components/master/corporateFinance/corporateFinanceSemantic.module.css'),
    'semantic css',
  );

  const bridge = read('lib/master/corporateFinance/projectReceivedBridge.ts');
  assert(bridge.includes("source: 'LEGACY'"), 'origem LEGACY');
  assert(bridge.includes("source: 'CORPORATE_FINANCE'"), 'origem CORPORATE_FINANCE');
  assert(bridge.includes('RECEIVABLE_PAYMENT'), 'usa entradas recebimento');
  assert(!bridge.includes('valor_recebido ='), 'não grava/migra coluna');
  assert(bridge.includes('computeProjectCorporateFinancialSummary'), 'resumo projeto');

  const ctx = read('lib/master/corporateFinance/projectContextService.ts');
  assert(ctx.includes('resolveProjectReceivedBridge'), 'contexto usa bridge');

  const projSvc = read('lib/master/topography/projectsService.ts');
  assert(projSvc.includes('batchResolveProjectReceived'), 'listagem com bridge');
  assert(projSvc.includes('resolveProjectReceivedBridge'), 'detalhe com bridge');

  const detail = read('components/master/topography/projects/TopographyProjectDetailPage.tsx');
  assert(detail.includes('financialSummary'), 'UI resumo financeiro');
  assert(detail.includes('CorporateFinanceSemanticKpi'), 'KPIs semânticos projeto');
  assert(detail.includes('Nova conta a receber'), 'atalho AR');
  assert(detail.includes('Nova conta a pagar'), 'atalho AP');
  assert(detail.includes('Abrir fluxo'), 'atalho fluxo');

  const hub = read('components/master/corporateFinance/CorporateFinanceHubPage.tsx');
  assert(hub.includes('CorporateFinanceSemanticKpi'), 'hub semântico');
  assert(hub.includes('receivableDueThisMonth'), 'hub vence mês');
  assert(!hub.includes('bridge de valor_recebido (Fase 6.4)'), 'hub sem gap 6.4');

  const dash = read('components/master/dashboard/MasterExecutiveDashboard.tsx');
  assert(dash.includes('corporateFinanceKpis'), 'dashboard KPIs corporativos');
  assert(dash.includes('Receita do mês'), 'KPI receita mês');
  assert(!dash.includes('forceEmpty'), 'gráfico topografia sem forceEmpty');
  assert(dash.includes('saasMonthlyFinancials'), 'gráfico SaaS intacto');

  const dashData = read('lib/masterDashboardData.ts');
  assert(dashData.includes('corporateFinanceKpis'), 'data layer KPIs');
  assert(
    dashData.includes('aggregateSvLotesMonthlyRevenueExpense') ||
      dashData.includes('aggregateSaasCashMonthlyRevenueExpense'),
    'SaaS intacto',
  );
  assert(dashData.includes('aggregateCorporateCashMonthlyRevenueExpense'), 'corp chart');

  // Isolamento
  assert(!exists('app/api/finance/corporate-bridge/route.ts'), 'sem API tenant');
  assert(!bridge.includes('saas_cash_movements'), 'bridge sem saas');
  assert(!bridge.includes('company_cash_movements'), 'bridge sem company cash');
  assert(!exists('app/api/master/corporate-finance/asaas/route.ts'), 'Asaas não');
}

function testBridgeRulesPure() {
  // Nunca somar legado + corporativo: se corporativo existe, usa só ele
  const legacyOnly = computeProjectFinancials(10000, 1500);
  assert(legacyOnly.valor_recebido === 1500, 'legado 1500');
  assert(legacyOnly.saldo_receber === 8500, 'saldo legado');

  const corporateEffective = computeProjectFinancials(10000, 4000);
  assert(corporateEffective.valor_recebido === 4000, 'corp 4000 (não 1500+4000)');
  assert(corporateEffective.saldo_receber === 6000, 'saldo corp');

  const unprov = computeUnprovisionedBalance({
    contractValue: 10000,
    valorRecebido: 4000,
    provisionedTotal: 4000,
  });
  assert(unprov === 2000, 'não provisionado 2000');

  assert(receivedSourceLabel('LEGACY') === 'Legado', 'label legado');
  assert(
    receivedSourceLabel('CORPORATE_FINANCE') === 'Financeiro corporativo',
    'label corp',
  );
}

function testSemantic() {
  assert(semanticToneForReceivableStatus('OVERDUE') === 'overdue', 'AR vencido');
  assert(semanticToneForReceivableStatus('PARTIAL') === 'partial', 'AR parcial');
  assert(semanticToneForReceivableStatus('RECEIVED') === 'received', 'AR recebido');
  assert(semanticToneForReceivableStatus('OPEN') === 'open', 'AR aberto');
  assert(semanticToneForCashType('INCOME') === 'income', 'cash income');
  assert(semanticToneForCashType('TRANSFER_IN') === 'transfer', 'cash transfer');
  assert(semanticToneForResult(100) === 'resultPositive', 'resultado +');
  assert(semanticToneForResult(-10) === 'resultNegative', 'resultado -');
}

function main() {
  console.log('=== Fase 6.4 bridge/dashboard tests ===');
  testFiles();
  console.log('OK files');
  testBridgeRulesPure();
  console.log('OK bridge rules');
  testSemantic();
  console.log('OK semantic');
  console.log('ALL PASS');
}

main();
