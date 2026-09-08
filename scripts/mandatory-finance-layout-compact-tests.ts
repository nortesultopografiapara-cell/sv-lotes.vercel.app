/**
 * Layout compacto do Módulo Financeiro (somente estrutura visual).
 * npx tsx scripts/mandatory-finance-layout-compact-tests.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testFinanceLayoutWiring() {
  const page = read('app/finance/page.tsx');
  const css = read('app/finance/finance-premium.css');
  const summary = read('components/enterprise/EnterpriseFinanceSummary.tsx');
  const totals = read('lib/financeCashFlow.ts');

  assert(page.includes('finance-module-header'), 'cabeçalho limpo');
  assert(page.includes('finance-toolbar-actions'), 'ações abaixo dos filtros');
  assert(page.includes('finance-filters-bar'), 'filtros preservados');
  assert(page.includes('finance-kpi-grid--summary'), 'grade de 6 KPIs');
  assert(page.includes('handleExportResumidoPDF'), 'PDF resumido');
  assert(page.includes('handleExportResumidoExcel'), 'Excel resumido');
  assert(page.includes('handleExportPDF'), 'PDF completo');
  assert(page.includes('handleExportExcel'), 'Excel completo');
  assert(page.includes('handleBulkDelete'), 'Limpar');
  assert(page.includes('setShowProjectReportModal(true)'), 'Fluxo por Empreendimento');
  assert(page.includes('setShowSaidaModal(true)'), 'Registrar Saída');
  assert(page.includes('calculateFinancialTotals'), 'totais inalterados');
  assert(page.includes('handleMarkPaid'), 'marcar pago');
  assert(page.includes('clearFilters'), 'limpar filtros');
  assert(
    page.indexOf('finance-toolbar-actions') > page.indexOf('finance-filters-bar'),
    'ações depois dos filtros',
  );
  assert(
    page.indexOf('finance-module-header') < page.indexOf('finance-toolbar-actions'),
    'título antes das ações',
  );
  assert(!page.includes('1247'), 'sem número mockado');

  assert(css.includes('repeat(6, minmax(0, 1fr))'), 'resumo financeiro em 1 linha no desktop');
  assert(css.includes('.finance-toolbar-actions'), 'CSS da barra de ações');
  assert(css.includes('.finance-module-header'), 'CSS do cabeçalho limpo');

  assert(summary.includes('totalRecebido'), 'valor recebido preservado');
  assert(summary.includes('saldoAReceber'), 'saldo a receber preservado');
  assert(summary.includes('summary.availableValue'), 'valor disponível real');
  assert(summary.includes('summary.soldValue'), 'valor vendido real');
  assert(summary.includes('summary.totalValue'), 'valor global real');
  assert(!summary.includes('392.945'), 'sem valor fixo do mockup');

  assert(totals.includes('export function calculateFinancialTotals'), 'fórmula intacta');
  console.log('OK testFinanceLayoutWiring');
}

function main() {
  testFinanceLayoutWiring();
  console.log('OK — mandatory-finance-layout-compact-tests passed');
}

main();
