/**
 * Layout compacto da tela Cobranças (somente estrutura visual / export front).
 * npx tsx scripts/mandatory-charges-layout-compact-tests.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildChargeListExportFilename,
  buildChargeListExportRows,
  CHARGE_LIST_EXPORT_SCOPE,
} from '../lib/charges/chargeListExport';
import type { ChargeInstallmentView } from '../lib/charges/chargeInstallmentHelpers';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function testChargesLayoutWiring() {
  const page = read('components/charges/ChargesPageClient.tsx');
  const css = read('app/finance/finance-premium.css');
  const layout = read('components/Layout.tsx');
  const exportHelper = read('lib/charges/chargeListExport.ts');
  const kpiHelpers = read('lib/charges/chargeInstallmentHelpers.ts');

  assert(page.includes('charges-page-header'), 'cabeçalho da página com classe compacta');
  assert(page.includes('charges-kpi-grid'), 'grade de KPIs de cobrança');
  assert(page.includes('charges-ops-row'), 'terceira linha operacional');
  assert(page.includes('charges-ops-actions'), 'ações ao lado de Cobranças emitidas');
  assert(page.includes('finance-filters-bar'), 'filtros preservados');
  assert(page.includes('handleRefreshList'), 'Atualizar lista preservado');
  assert(page.includes('runRefreshAllCharges'), 'Atualizar todas as cobranças preservado');
  assert(page.includes('refreshAllBlockMessage'), 'mensagem de bloqueio preservada');
  assert(page.includes('Nenhuma cobrança ativa para atualizar.') === false || page.includes('refreshAllBlockMessage'), 'mensagem vinculada ao helper existente');
  assert(page.includes('handleExportFilteredPdf'), 'Relatório PDF');
  assert(page.includes('handleExportFilteredExcel'), 'Relatório Excel');
  assert(page.includes('downloadChargeListPdf(filteredViews'), 'PDF usa listagem filtrada completa');
  assert(page.includes('downloadChargeListExcel(filteredViews'), 'Excel usa listagem filtrada completa');
  assert(!page.includes('downloadChargeListPdf(pageRows'), 'PDF não usa só a página visível');
  assert(!page.includes('downloadChargeListExcel(pageRows'), 'Excel não usa só a página visível');
  assert(page.includes('CHARGE_LIST_EXPORT_SCOPE'), 'escopo de exportação explícito na UI');
  assert(page.includes('computeChargeKpiSummary(payments)'), 'KPIs reais inalterados');
  assert(page.includes('computeAsaasOperationalKpis(payments'), 'KPI operacional real inalterado');
  assert(page.includes('filterChargeInstallments'), 'filtros reais inalterados');
  assert(page.includes('paginateFinanceReceiptRows'), 'paginação real inalterada');
  assert(page.includes('ChargeInstallmentActions'), 'ações da tabela preservadas');
  assert(page.includes('<th>Cliente</th>'), 'coluna cliente');
  assert(page.includes('<th>Empreendimento</th>'), 'coluna empreendimento');
  assert(page.includes('<th>Quadra/Lote</th>'), 'coluna quadra/lote');
  assert(page.includes('<th>Parcela</th>'), 'coluna parcela');
  assert(page.includes('<th>Vencimento</th>'), 'coluna vencimento');
  assert(page.includes('<th>Valor</th>'), 'coluna valor');
  assert(page.includes('<th>Conta recebedora</th>'), 'coluna conta');
  assert(page.includes('Ações'), 'coluna ações');

  assert(
    page.indexOf('charges-ops-row') > page.indexOf('charges-kpi-grid'),
    'linha operacional depois dos 6 KPIs',
  );
  assert(
    page.indexOf('finance-filters-bar') > page.indexOf('charges-ops-row'),
    'filtros imediatamente abaixo da linha operacional',
  );
  const ops = page.slice(page.indexOf('charges-ops-row'));
  assert(ops.includes('Cobranças emitidas'), 'Cobranças emitidas na terceira linha');
  assert(
    ops.indexOf('Relatório PDF') > ops.indexOf('Cobranças emitidas'),
    'PDF depois de Cobranças emitidas',
  );
  assert(
    ops.indexOf('Relatório Excel') > ops.indexOf('Relatório PDF'),
    'Excel depois de PDF',
  );
  assert(
    ops.indexOf('Atualizar lista') > ops.indexOf('Relatório Excel'),
    'Atualizar lista depois dos relatórios',
  );
  assert(
    ops.indexOf('Atualizar todas as cobranças') > ops.indexOf('Atualizar lista'),
    'Atualizar todas depois de Atualizar lista',
  );

  assert(count(page, 'const handleRefreshList') === 1, 'um único handler Atualizar lista');
  assert(count(page, 'const runRefreshAllCharges') === 1, 'um único handler Atualizar todas');
  assert(count(page, 'onClick={() => void handleRefreshList()}') === 1, 'botão Atualizar lista não duplicado');
  assert(count(page, 'onClick={() => void runRefreshAllCharges()}') === 1, 'botão Atualizar todas não duplicado');
  assert(page.includes('Atualizar lista'), 'rótulo Atualizar lista presente');

  assert(css.includes('.charges-page-header'), 'CSS do cabeçalho de cobranças');
  assert(css.includes('.charges-ops-row'), 'CSS da linha operacional');
  assert(
    css.includes('.finance-premium .charges-page-header') && css.includes('@media (min-width: 1280px)'),
    'título da página some no desktop largo',
  );

  assert(layout.includes("pathname === '/charges'"), 'título integrado no header global em /charges');
  assert(
    layout.includes("pathname === '/finance' || pathname === '/charges'"),
    'faixa única compartilhada com Financeiro',
  );
  assert(layout.includes('sv-layout-finance-title'), 'faixa única no header global');
  assert(layout.includes('Central operacional de parcelas e cobranças da empresa.'), 'subtítulo de Cobranças no header');
  assert(layout.includes("pathname === '/finance'"), 'título do Financeiro preservado');

  assert(exportHelper.includes("CHARGE_LIST_EXPORT_SCOPE = 'filtered_loaded_list'"), 'escopo filtrado completo');
  assert(exportHelper.includes('listagem filtrada completa já carregada'), 'PDF/Excel declaram origem completa');
  assert(!exportHelper.includes("from('finance_receipts')"), 'export não consulta finance_receipts');
  assert(!exportHelper.includes('.insert('), 'export sem escrita');
  assert(!exportHelper.includes('fetch('), 'export sem API nova');

  assert(kpiHelpers.includes('export function computeChargeKpiSummary'), 'cálculo de KPI intacto');
  assert(page.includes("title=\"Em aberto\""), 'KPI Em aberto');
  assert(page.includes("title=\"Vencidas\""), 'KPI Vencidas');
  assert(page.includes("title=\"Vencem hoje\""), 'KPI Vencem hoje');
  assert(page.includes("title=\"Pagas no mês\""), 'KPI Pagas no mês');
  assert(page.includes("title=\"Total a receber\""), 'KPI Total a receber');
  assert(page.includes("title=\"Aguardando geração\""), 'KPI Aguardando geração');

  console.log('OK testChargesLayoutWiring');
}

function testChargeListExportHelper() {
  assert(CHARGE_LIST_EXPORT_SCOPE === 'filtered_loaded_list', 'constante de escopo');
  const view: ChargeInstallmentView = {
    id: 'r1',
    clientName: 'Cliente Teste',
    projectName: 'Empreendimento X',
    lotLabel: 'Q1 / L2',
    parcelLabel: 'Entrada',
    dueDateIso: '2026-09-08',
    dueDateLabel: '08/09/2026',
    amount: 1500.5,
    installmentStatus: 'pendente',
    installmentStatusLabel: 'Pendente',
    asaasStatusLabel: '—',
    chargeStatusLabel: 'Aguardando',
    financialAccountId: 'acc-1',
    financialAccountLabel: 'Conta Asaas',
    chargeProvider: 'ASAAS_COMPANY',
  };
  const rows = buildChargeListExportRows([view]);
  assert(rows.length === 1, 'uma linha exportada');
  assert(rows[0].clientName === 'Cliente Teste', 'cliente real');
  assert(rows[0].amount === 1500.5, 'valor real');
  assert(buildChargeListExportFilename('pdf', new Date('2026-09-08T12:00:00Z')).startsWith('cobrancas-filtradas-'), 'nome pdf');
  console.log('OK testChargeListExportHelper');
}

function main() {
  testChargesLayoutWiring();
  testChargeListExportHelper();
  console.log('OK — mandatory-charges-layout-compact-tests passed');
}

main();
