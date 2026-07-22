/**
 * Testes obrigatórios — Orçamentos Master Topografia (Fase 5).
 * npx tsx scripts/mandatory-master-topography-quotes-tests.ts
 */
import fs from 'fs';
import path from 'path';
import { validateTopographyQuoteInput } from '../lib/master/topography/quoteValidation';
import { TOPOGRAPHY_QUOTE_STATUSES } from '../lib/master/topography/quoteStatuses';

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
  assert(exists('supabase/migrations/20260722140000_master_topography_quotes.sql'), 'migration');
  assert(exists('lib/master/topography/quotesService.ts'), 'service');
  assert(exists('lib/master/topography/quoteValidation.ts'), 'validation');
  assert(exists('app/api/master/topography/quotes/route.ts'), 'list API');
  assert(exists('app/api/master/topography/quotes/[id]/route.ts'), 'id API');
  assert(exists('app/api/master/topography/quotes/[id]/convert/route.ts'), 'convert API');
  assert(exists('app/api/master/topography/quotes/[id]/archive/route.ts'), 'archive API');
  assert(exists('app/api/master/topography/quotes/[id]/restore/route.ts'), 'restore API');
  assert(exists('app/api/master/topography/quotes/[id]/duplicate/route.ts'), 'duplicate API');
  assert(exists('components/master/topography/quotes/TopographyQuotesPage.tsx'), 'list UI');
  assert(exists('components/master/topography/quotes/TopographyQuoteDetailPage.tsx'), 'detail UI');

  const mig = read('supabase/migrations/20260722140000_master_topography_quotes.sql');
  assert(mig.includes('master_topography_quotes'), 'tabela');
  assert(mig.includes('generate_next_topography_quote_code'), 'RPC ORC');
  assert(mig.includes('is_super_admin()'), 'RLS');
  assert(mig.includes('ORC-'), 'prefixo ORC');
  assert(!mig.includes('REFERENCES public.customers'), 'sem FK customers');
  assert(mig.includes('converted_project_id'), 'vínculo projeto');

  const page = read('app/master/topography/budgets/page.tsx');
  assert(!page.includes('MasterModulePlaceholder'), 'placeholder removido');
  assert(page.includes('TopographyQuotesPage'), 'página funcional');

  const nav = read('lib/master/executiveNav.ts');
  const budgetsBlock = nav.slice(
    nav.indexOf("name: 'Orçamentos'"),
    nav.indexOf("name: 'Financeiro'"),
  );
  assert(!budgetsBlock.includes('comingSoon: true'), 'Orçamentos sem Em breve');
  assert(nav.includes("name: 'Financeiro'") && nav.includes('comingSoon: true'), 'Financeiro Em breve');
}

function testValidation() {
  const ok = validateTopographyQuoteInput({
    client_name: 'Cliente X',
    category: 'TOPOGRAFIA',
    service_type: 'LEVANTAMENTO_TOPOGRAFICO',
    status: 'RASCUNHO',
    estimated_value: 10000,
    discount_value: 1000,
  });
  assert(ok.final_value === 9000, 'final calculado');

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

  threw = false;
  try {
    validateTopographyQuoteInput({
      client_name: 'X',
      category: 'TOPOGRAFIA',
      service_type: 'LEVANTAMENTO_TOPOGRAFICO',
      status: 'RASCUNHO',
      estimated_value: 100,
      discount_value: 200,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'desconto > estimado rejeitado');
}

function testConversionAndGuards() {
  const svc = read('lib/master/topography/quotesService.ts');
  assert(svc.includes('convertQuoteToProject'), 'conversão');
  assert(svc.includes("status: 'RASCUNHO'"), 'projeto inicia rascunho');
  assert(svc.includes('já foi convertido'), 'bloqueio dupla conversão');
  assert(svc.includes('createTopographyProject'), 'cria projeto');
  assert(svc.includes('is(\'converted_project_id\', null)'), 'update atômico');

  const convertApi = read('app/api/master/topography/quotes/[id]/convert/route.ts');
  assert(convertApi.includes('assertSuperAdmin'), 'convert exige SUPER_ADMIN');

  for (const rel of [
    'app/api/master/topography/quotes/route.ts',
    'app/api/master/topography/quotes/[id]/route.ts',
    'app/api/master/topography/quotes/[id]/archive/route.ts',
  ]) {
    assert(read(rel).includes('assertSuperAdmin'), `${rel} guard`);
  }
}

function testUiAndDashboard() {
  assert(TOPOGRAPHY_QUOTE_STATUSES.length >= 7, 'status centralizados');
  const detail = read('components/master/topography/quotes/TopographyQuoteDetailPage.tsx');
  assert(detail.includes('Converter em Projeto'), 'botão converter');
  assert(detail.includes('Em desenvolvimento'), 'PDF placeholder');
  assert(detail.includes('Duplicar'), 'duplicar');

  const dash = read('components/master/dashboard/MasterExecutiveDashboard.tsx');
  assert(dash.includes('topographyQuoteKpis'), 'KPIs orçamento no dashboard');
  assert(dash.includes('Novo Orçamento'), 'ação rápida');
  assert(dash.includes('/master/topography/budgets?new=1'), 'link new');

  const data = read('lib/masterDashboardData.ts');
  assert(data.includes('computeTopographyQuoteKpis'), 'loader KPIs quotes');
}

function testTenantIsolation() {
  assert(!exists('app/api/topography/quotes/route.ts'), 'sem API fora master');
  const tenantProjects = read('app/api/projects/route.ts');
  assert(!tenantProjects.includes('master_topography_quotes'), 'tenant projects intacto');
}

function main() {
  testFiles();
  testValidation();
  testConversionAndGuards();
  testUiAndDashboard();
  testTenantIsolation();
  console.log('OK mandatory-master-topography-quotes-tests');
}

main();
