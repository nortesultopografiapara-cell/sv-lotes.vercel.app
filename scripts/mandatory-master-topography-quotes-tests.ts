/**
 * Testes obrigatórios — Orçamentos Master Topografia (Fase 5 + 5.1).
 * npx tsx scripts/mandatory-master-topography-quotes-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  validateTopographyQuoteInput,
  validateQuoteStructurePayload,
} from '../lib/master/topography/quoteValidation';
import { TOPOGRAPHY_QUOTE_STATUSES } from '../lib/master/topography/quoteStatuses';
import { computeQuoteFinancials, itemUnitWithBdi } from '../lib/master/topography/quoteFinancials';
import { DEFAULT_QUOTE_STAGE_NAMES } from '../lib/master/topography/defaultQuoteStages';
import { TOPOGRAPHY_PRICE_BANKS } from '../lib/master/topography/priceBanks';

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
  assert(exists('supabase/migrations/20260722140000_master_topography_quotes.sql'), 'migration base');
  assert(
    exists('supabase/migrations/20260722150000_master_topography_quotes_structure.sql'),
    'migration estrutura',
  );
  assert(exists('lib/master/topography/quotesService.ts'), 'service');
  assert(exists('lib/master/topography/quoteStructureService.ts'), 'structure service');
  assert(exists('lib/master/topography/quoteValidation.ts'), 'validation');
  assert(exists('lib/master/topography/quoteFinancials.ts'), 'financials');
  assert(exists('lib/master/topography/priceBanks.ts'), 'price banks');
  assert(exists('app/api/master/topography/quotes/route.ts'), 'list API');
  assert(exists('app/api/master/topography/quotes/[id]/route.ts'), 'id API');
  assert(exists('app/api/master/topography/quotes/[id]/convert/route.ts'), 'convert API');
  assert(exists('components/master/topography/quotes/TopographyQuotesPage.tsx'), 'list UI');
  assert(exists('components/master/topography/quotes/TopographyQuoteEditPage.tsx'), 'edit UI');
  assert(exists('app/master/topography/budgets/[id]/edit/page.tsx'), 'edit route');
  assert(!exists('components/master/topography/quotes/TopographyQuoteFormModal.tsx'), 'modal removido');

  const mig = read('supabase/migrations/20260722150000_master_topography_quotes_structure.sql');
  assert(mig.includes('master_topography_quote_stages'), 'tabela etapas');
  assert(mig.includes('master_topography_quote_items'), 'tabela itens');
  assert(mig.includes('bdi_percent'), 'coluna BDI');
  assert(mig.includes('is_super_admin()'), 'RLS estrutura');
  assert(mig.includes('SINAPI'), 'banco preços preparado');
  assert(!mig.includes('REFERENCES public.customers'), 'sem FK customers');

  const nav = read('lib/master/executiveNav.ts');
  const budgetsBlock = nav.slice(
    nav.indexOf("name: 'Orçamentos'"),
    nav.indexOf("name: 'Financeiro'"),
  );
  assert(!budgetsBlock.includes('comingSoon: true'), 'Orçamentos sem Em breve');
}

function testValidationAndFinancials() {
  const ok = validateTopographyQuoteInput({
    client_name: 'Cliente X',
    category: 'TOPOGRAFIA',
    service_type: 'LEVANTAMENTO_TOPOGRAFICO',
    status: 'RASCUNHO',
    estimated_value: 10000,
    discount_value: 1000,
    bdi_percent: 25,
    discount_percent: 10,
  });
  assert(ok.final_value === 9000, 'final calculado');
  assert(ok.bdi_percent === 25, 'bdi validado');
  assert(ok.discount_percent === 10, 'desconto % validado');

  let threw = false;
  try {
    validateTopographyQuoteInput({
      client_name: 'X',
      category: 'TOPOGRAFIA',
      service_type: 'LEVANTAMENTO_TOPOGRAFICO',
      status: 'CONVERTIDO',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'CONVERTIDO manual rejeitado');

  const fin = computeQuoteFinancials(
    [
      { quantity: 10, unit_value: 100 },
      { quantity: 2, unit_value: 50 },
    ],
    25,
    10,
  );
  // sem BDI = 1000 + 100 = 1100; BDI 25% = 275; com BDI = 1375; desc 10% = 137.5; geral = 1237.5
  assert(fin.totalWithoutBdi === 1100, 'total sem BDI');
  assert(fin.bdiAmount === 275, 'valor BDI');
  assert(fin.totalWithBdi === 1375, 'total com BDI');
  assert(fin.discountValue === 137.5, 'desconto absoluto');
  assert(fin.totalGeral === 1237.5, 'total geral');
  assert(itemUnitWithBdi(100, 25) === 125, 'unitário com BDI');
  assert(fin.marginPercent === null, 'margem placeholder');

  const structure = validateQuoteStructurePayload({
    quote: {
      client_name: 'Obra X',
      category: 'OBRAS',
      service_type: 'LOCACAO_OBRAS',
      status: 'RASCUNHO',
      bdi_percent: 20,
      discount_percent: 0,
    },
    stages: [
      {
        name: 'Terraplanagem',
        sort_order: 0,
        items: [
          {
            description: 'Escavação',
            unit: 'm³',
            quantity: 100,
            unit_value: 15,
            sort_order: 0,
            price_bank: 'PROPRIO',
          },
        ],
      },
    ],
  });
  assert(structure.stages.length === 1, 'estrutura com etapa');
  assert(structure.stages[0].items.length === 1, 'estrutura com item');
}

function testDefaultsAndBanks() {
  assert(DEFAULT_QUOTE_STAGE_NAMES.includes('Serviços Preliminares'), 'etapa preliminares');
  assert(DEFAULT_QUOTE_STAGE_NAMES.includes('Terraplanagem'), 'etapa terraplanagem');
  assert(DEFAULT_QUOTE_STAGE_NAMES.length >= 7, 'etapas padrão');
  assert(TOPOGRAPHY_PRICE_BANKS.some((b) => b.code === 'SINAPI'), 'SINAPI preparado');
  assert(TOPOGRAPHY_PRICE_BANKS.every((b) => b.integrated === false), 'integração futura');
}

function testConversionAndGuards() {
  const svc = read('lib/master/topography/quotesService.ts');
  assert(svc.includes('convertQuoteToProject'), 'conversão');
  assert(svc.includes("status: 'RASCUNHO'"), 'projeto inicia rascunho');
  assert(svc.includes('já foi convertido'), 'bloqueio dupla conversão');
  assert(svc.includes('is(\'converted_project_id\', null)'), 'update atômico');
  assert(svc.includes('master_topography_quote_stages'), 'seed etapas no create');

  const structureSvc = read('lib/master/topography/quoteStructureService.ts');
  assert(structureSvc.includes('saveTopographyQuoteStructure'), 'save structure');
  assert(structureSvc.includes('duplicateQuoteStructure'), 'duplicate structure');

  const idApi = read('app/api/master/topography/quotes/[id]/route.ts');
  assert(idApi.includes('assertSuperAdmin'), 'PUT/GET guard');
  assert(idApi.includes('saveTopographyQuoteStructure'), 'PUT structure');
  assert(idApi.includes("include') === 'structure'"), 'GET structure');
}

function testUiAndDashboard() {
  assert(TOPOGRAPHY_QUOTE_STATUSES.length >= 7, 'status centralizados');

  const edit = read('components/master/topography/quotes/TopographyQuoteEditPage.tsx');
  assert(edit.includes('Converter em Projeto'), 'botão converter');
  assert(edit.includes('Em desenvolvimento'), 'export placeholder');
  assert(edit.includes('Dados Gerais'), 'painel dados gerais');
  assert(edit.includes('Adicionar Item'), 'adicionar item');
  assert(edit.includes('VirtualItemsBody'), 'virtualização');
  assert(edit.includes('type="date"'), 'date picker');
  assert(edit.includes('PDF Sintético'), 'menu export PDF');
  assert(edit.includes('Memorial de Cálculo'), 'memorial placeholder');

  const list = read('components/master/topography/quotes/TopographyQuotesPage.tsx');
  assert(!list.includes('TopographyQuoteFormModal'), 'lista sem modal');
  assert(list.includes('/edit'), 'lista aponta editor');

  const detail = read('components/master/topography/quotes/TopographyQuoteDetailPage.tsx');
  assert(detail.includes('/edit'), 'detalhe redireciona editor');
  assert(!detail.includes('detailGrid'), 'cards detalhe removidos');

  const dash = read('components/master/dashboard/MasterExecutiveDashboard.tsx');
  assert(dash.includes('topographyQuoteKpis'), 'KPIs orçamento no dashboard');
  assert(dash.includes('Novo Orçamento'), 'ação rápida');
  assert(dash.includes('/master/topography/budgets?new=1'), 'link new');
}

function testTenantIsolation() {
  assert(!exists('app/api/topography/quotes/route.ts'), 'sem API fora master');
  const tenantProjects = read('app/api/projects/route.ts');
  assert(!tenantProjects.includes('master_topography_quotes'), 'tenant projects intacto');
  assert(!tenantProjects.includes('master_topography_quote_items'), 'tenant sem itens quote');
}

function main() {
  testFiles();
  testValidationAndFinancials();
  testDefaultsAndBanks();
  testConversionAndGuards();
  testUiAndDashboard();
  testTenantIsolation();
  console.log('OK mandatory-master-topography-quotes-tests');
}

main();
