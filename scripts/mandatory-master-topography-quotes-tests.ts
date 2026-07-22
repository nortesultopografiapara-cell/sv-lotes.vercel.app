/**
 * Testes obrigatórios — Orçamentos Master Topografia (Fase 5 + 5.1 + 5.2).
 * npx tsx scripts/mandatory-master-topography-quotes-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  validateTopographyQuoteInput,
  validateQuoteStructurePayload,
} from '../lib/master/topography/quoteValidation';
import { TOPOGRAPHY_QUOTE_STATUSES } from '../lib/master/topography/quoteStatuses';
import {
  computeQuoteFinancials,
  itemUnitWithBdi,
  priceDifferencePercent,
  stagePercentOfBudget,
} from '../lib/master/topography/quoteFinancials';
import { DEFAULT_QUOTE_STAGE_NAMES } from '../lib/master/topography/defaultQuoteStages';
import { TOPOGRAPHY_PRICE_BANK_SEED } from '../lib/master/topography/priceBanks';

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
  assert(
    exists('supabase/migrations/20260722160000_master_topography_price_catalog.sql'),
    'migration catálogo',
  );
  assert(exists('lib/master/topography/priceCatalogService.ts'), 'catalog service');
  assert(exists('lib/master/topography/quoteExports.ts'), 'exports');
  assert(exists('app/api/master/topography/price-catalog/route.ts'), 'catalog API');
  assert(exists('app/api/master/topography/price-catalog/custom/route.ts'), 'custom API');
  assert(exists('app/api/master/topography/price-catalog/import/route.ts'), 'import API');
  assert(exists('components/master/topography/quotes/QuoteCatalogPicker.tsx'), 'picker UI');
  assert(exists('components/master/topography/quotes/TopographyQuoteEditPage.tsx'), 'edit UI');
  assert(!exists('components/master/topography/quotes/TopographyQuoteFormModal.tsx'), 'modal removido');

  const mig = read('supabase/migrations/20260722160000_master_topography_price_catalog.sql');
  assert(mig.includes('master_topography_price_databases'), 'tabela bancos');
  assert(mig.includes('master_topography_price_items'), 'tabela itens preço');
  assert(mig.includes('master_topography_price_imports'), 'tabela imports');
  assert(mig.includes('master_topography_custom_items'), 'itens próprios');
  assert(mig.includes('master_topography_budget_item_history'), 'histórico');
  assert(mig.includes('master_topography_budget_item_prices'), 'snapshot preços');
  assert(mig.includes('is_super_admin()'), 'RLS catálogo');
  assert(mig.includes('gin_trgm_ops'), 'índice trigram');
  assert(mig.includes('SINAPI') && mig.includes('AGETOP_CIVIL'), 'bancos seed');
  assert(!mig.includes('REFERENCES public.customers'), 'sem FK customers');
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
    margin_percent: 15,
  });
  assert(ok.final_value === 9000, 'final calculado');
  assert(ok.margin_percent === 15, 'margem validada');

  const fin = computeQuoteFinancials(
    [
      { quantity: 10, unit_value: 100, reference_price: 90 },
      { quantity: 2, unit_value: 50, reference_price: 50 },
    ],
    25,
    10,
    15,
  );
  assert(fin.totalWithoutBdi === 1100, 'total sem BDI');
  assert(fin.totalGeral === 1237.5, 'total geral');
  assert(fin.marginPercent === 15, 'margem %');
  assert(fin.marginValue === 185.63, 'margem valor');
  assert(itemUnitWithBdi(100, 25) === 125, 'unitário com BDI');
  assert(priceDifferencePercent(100, 110) === 10, 'diff %');
  assert(stagePercentOfBudget(250, 1000) === 25, '% etapa');

  const structure = validateQuoteStructurePayload({
    quote: {
      client_name: 'Obra X',
      category: 'OBRAS',
      service_type: 'LOCACAO_OBRAS',
      status: 'RASCUNHO',
      bdi_percent: 20,
      discount_percent: 0,
      margin_percent: 5,
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
            adopted_price: 15,
            reference_price: 14,
            sort_order: 0,
            price_bank: 'PROPRIO',
          },
        ],
      },
    ],
  });
  assert(structure.stages[0].items[0].adopted_price === 15, 'preço adotado');
  assert(structure.stages[0].items[0].reference_price === 14, 'preço referência');
}

function testBanksAndDefaults() {
  assert(DEFAULT_QUOTE_STAGE_NAMES.length >= 7, 'etapas padrão');
  assert(TOPOGRAPHY_PRICE_BANK_SEED.some((b) => b.code === 'SINAPI'), 'SINAPI');
  assert(TOPOGRAPHY_PRICE_BANK_SEED.some((b) => b.code === 'SIURB_INFRA'), 'SIURB INFRA');
  assert(TOPOGRAPHY_PRICE_BANK_SEED.some((b) => b.code === 'PROPRIO'), 'PRÓPRIO');
  assert(TOPOGRAPHY_PRICE_BANK_SEED.length >= 20, 'bancos extensíveis');
}

function testConversionAndGuards() {
  const svc = read('lib/master/topography/quotesService.ts');
  assert(svc.includes('convertQuoteToProject'), 'conversão');
  assert(svc.includes('is(\'converted_project_id\', null)'), 'update atômico');

  const catalog = read('lib/master/topography/priceCatalogService.ts');
  assert(catalog.includes('searchPriceCatalog'), 'pesquisa');
  assert(catalog.includes('registerPriceImport'), 'import mechanism');
  assert(catalog.includes('CACHE_TTL_MS'), 'cache pesquisa');

  for (const rel of [
    'app/api/master/topography/price-catalog/route.ts',
    'app/api/master/topography/price-catalog/custom/route.ts',
    'app/api/master/topography/price-catalog/import/route.ts',
  ]) {
    assert(read(rel).includes('assertSuperAdmin'), `${rel} guard`);
  }
}

function testUiExports() {
  assert(TOPOGRAPHY_QUOTE_STATUSES.length >= 7, 'status');

  const edit = read('components/master/topography/quotes/TopographyQuoteEditPage.tsx');
  assert(edit.includes('QuoteCatalogPicker'), 'picker');
  assert(edit.includes('exportQuotePdfSynthetic'), 'PDF sintético');
  assert(edit.includes('exportQuoteExcel'), 'Excel');
  assert(edit.includes('exportQuoteCsv'), 'CSV');
  assert(edit.includes('exportQuoteMemorial'), 'Memorial');
  assert(edit.includes('exportQuotePdfAnalyticalPrepared'), 'PDF analítico preparado');
  assert(!edit.includes('Em desenvolvimento'), 'sem placeholder export');
  assert(edit.includes('reference_price'), 'preço referência');
  assert(edit.includes('adopted_price'), 'preço adotado');
  assert(edit.includes('Criar Item Próprio') || edit.includes('QuoteCustomItemModal'), 'item próprio');
  assert(edit.includes('financeBarToggle') || edit.includes('financeOpen'), 'resumo recolhível mobile');

  const css = read('components/master/topography/quotes/topographyQuotesEditor.module.css');
  assert(css.includes('--budget-summary-height'), 'espaço inferior do editor');
  assert(css.includes('catalogPickerOpen'), 'stacking autocomplete');
  assert(css.includes('max-height: 360px'), 'altura resultados');
  assert(css.includes('overflow: visible'), 'etapa não corta dropdown');
  assert(/\.financeBar\s*\{[^}]*z-index:\s*5/s.test(css), 'resumo abaixo do catálogo');

  const picker = read('components/master/topography/quotes/QuoteCatalogPicker.tsx');
  assert(picker.includes('Escape'), 'fecha com Escape');

  const exportsLib = read('lib/master/topography/quoteExports.ts');
  assert(exportsLib.includes('orientation: \'landscape\''), 'PDF paisagem');
  assert(exportsLib.includes('SV Topografia'), 'marca SV');
  assert(exportsLib.includes('Fase 5.3'), 'analítico 5.3');

  const dash = read('components/master/dashboard/MasterExecutiveDashboard.tsx');
  assert(dash.includes('topographyQuoteKpis'), 'KPIs dashboard');
}

function testTenantIsolation() {
  assert(!exists('app/api/topography/price-catalog/route.ts'), 'sem API fora master');
  const tenantProjects = read('app/api/projects/route.ts');
  assert(!tenantProjects.includes('master_topography_price_items'), 'tenant intacto');
  assert(!tenantProjects.includes('master_topography_quotes'), 'tenant quotes intacto');
}

function main() {
  testFiles();
  testValidationAndFinancials();
  testBanksAndDefaults();
  testConversionAndGuards();
  testUiExports();
  testTenantIsolation();
  console.log('OK mandatory-master-topography-quotes-tests');
}

main();
