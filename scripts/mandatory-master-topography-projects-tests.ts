/**
 * Testes obrigatórios — Projetos e Serviços (Master Topografia).
 * npx tsx scripts/mandatory-master-topography-projects-tests.ts
 */
import fs from 'fs';
import path from 'path';
import { validateTopographyProjectInput } from '../lib/master/topography/validation';
import { computeProjectFinancials } from '../lib/master/topography/projectFinancials';
import { TOPOGRAPHY_STATUSES } from '../lib/master/topography/statuses';
import { TOPOGRAPHY_SERVICE_TYPES } from '../lib/master/topography/serviceTypes';
import { TOPOGRAPHY_CATEGORIES } from '../lib/master/topography/categories';

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

function testFilesAndIsolation() {
  assert(exists('supabase/migrations/20260722120000_master_topography_projects.sql'), 'migration');
  assert(exists('lib/master/topography/projectsService.ts'), 'service');
  assert(exists('lib/master/topography/validation.ts'), 'validation');
  assert(exists('app/api/master/topography/projects/route.ts'), 'list/create API');
  assert(exists('app/api/master/topography/projects/[id]/route.ts'), 'get/patch API');
  assert(exists('app/api/master/topography/projects/[id]/archive/route.ts'), 'archive API');
  assert(exists('app/api/master/topography/projects/[id]/restore/route.ts'), 'restore API');
  assert(exists('components/master/topography/projects/TopographyProjectsPage.tsx'), 'list UI');
  assert(
    exists('components/master/topography/projects/TopographyProjectDetailPage.tsx'),
    'detail UI',
  );

  const migration = read('supabase/migrations/20260722120000_master_topography_projects.sql');
  assert(migration.includes('master_topography_projects'), 'tabela');
  assert(migration.includes('generate_next_topography_project_code'), 'RPC código');
  assert(migration.includes('is_super_admin()'), 'RLS SUPER_ADMIN');
  assert(migration.includes('UNIQUE (code)') || migration.includes('code_unique'), 'unique code');
  assert(migration.includes('is_archived'), 'soft delete');
  assert(migration.includes('physical_progress_percent'), 'progresso físico');
  assert(migration.includes('financial_situation'), 'situação financeira');
  assert(!migration.includes('REFERENCES public.customers'), 'sem FK customers');
  assert(!migration.includes('REFERENCES public.projects'), 'sem FK projects tenant');

  const page = read('app/master/topography/projects/page.tsx');
  assert(!page.includes('MasterModulePlaceholder'), 'placeholder removido');
  assert(page.includes('TopographyProjectsPage'), 'página funcional');

  const nav = read('lib/master/executiveNav.ts');
  assert(nav.includes("href: '/master/topography/projects'"), 'nav projects');
  // comingSoon deve estar ausente apenas no item de projects — checagem por bloco
  const projectsBlock = nav.slice(
    nav.indexOf("name: 'Projetos e Serviços'"),
    nav.indexOf("name: 'Orçamentos'"),
  );
  assert(!projectsBlock.includes('comingSoon: true'), 'Projetos sem Em breve');
  assert(nav.includes("name: 'Orçamentos'") && nav.includes('comingSoon: true'), 'Orçamentos Em breve');

  // Isolamento: APIs só no namespace master
  assert(exists('app/api/master/topography/projects/route.ts'), 'API master namespace');
  assert(!exists('app/api/topography/projects/route.ts'), 'sem API fora do master');
}

function testValidation() {
  const ok = validateTopographyProjectInput({
    title: 'Levantamento Fazenda X',
    client_name: 'Cliente Corp',
    category: 'TOPOGRAFIA',
    service_type: 'LEVANTAMENTO_TOPOGRAFICO',
    status: 'RASCUNHO',
  });
  assert(ok.title === 'Levantamento Fazenda X', 'title ok');
  assert(ok.progress_percent === 0, 'progress default');
  assert(ok.valor_recebido === 0, 'valor_recebido default');

  const withFinance = validateTopographyProjectInput({
    title: 'X',
    client_name: 'Y',
    category: 'TOPOGRAFIA',
    service_type: 'LEVANTAMENTO_TOPOGRAFICO',
    status: 'RASCUNHO',
    contract_value: 16000,
    valor_recebido: 8000,
  });
  assert(withFinance.contract_value === 16000, 'contratado');
  assert(withFinance.valor_recebido === 8000, 'recebido');

  let threw = false;
  try {
    validateTopographyProjectInput({
      title: 'X',
      client_name: 'Y',
      category: 'TOPOGRAFIA',
      service_type: 'LEVANTAMENTO_TOPOGRAFICO',
      status: 'RASCUNHO',
      progress_percent: 150,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'progresso > 100 rejeitado');

  threw = false;
  try {
    validateTopographyProjectInput({
      title: 'X',
      client_name: 'Y',
      category: 'TOPOGRAFIA',
      service_type: 'LEVANTAMENTO_TOPOGRAFICO',
      status: 'RASCUNHO',
      contract_value: -10,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'valor negativo rejeitado');

  threw = false;
  try {
    validateTopographyProjectInput({
      title: 'X',
      client_name: 'Y',
      category: 'TOPOGRAFIA',
      service_type: 'LEVANTAMENTO_TOPOGRAFICO',
      status: 'RASCUNHO',
      contract_value: 1000,
      valor_recebido: 1500,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'recebido > contratado rejeitado');

  threw = false;
  try {
    validateTopographyProjectInput({
      title: '',
      client_name: 'Y',
      category: 'TOPOGRAFIA',
      service_type: 'LEVANTAMENTO_TOPOGRAFICO',
      status: 'RASCUNHO',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'título obrigatório');
}

function testFinancialHelpers() {
  const f = computeProjectFinancials(16000, 8000);
  assert(f.saldo_receber === 8000, 'saldo 8000');
  assert(f.percentual_recebido === 50, '50%');
  assert(f.valorRecebido === 8000, 'alias camel');
  const z = computeProjectFinancials(0, 0);
  assert(z.percentual_recebido === 0, 'percentual zero sem contrato');
  assert(exists('supabase/migrations/20260722130000_master_topography_projects_valor_recebido.sql'), 'migration 4.1.1');
  const mig = read('supabase/migrations/20260722130000_master_topography_projects_valor_recebido.sql');
  assert(mig.includes('valor_recebido'), 'coluna valor_recebido');
  assert(!mig.includes('REFERENCES public.customers'), 'sem FK tenant');
}

function testConstantsCentralized() {
  assert(TOPOGRAPHY_STATUSES.length >= 10, 'status centralizados');
  assert(TOPOGRAPHY_SERVICE_TYPES.length >= 10, 'tipos centralizados');
  assert(TOPOGRAPHY_CATEGORIES.length >= 5, 'categorias centralizadas');

  const listUi = read('components/master/topography/projects/TopographyProjectsPage.tsx');
  assert(listUi.includes('TOPOGRAPHY_STATUSES'), 'UI usa constantes status');
  assert(listUi.includes('TOPOGRAPHY_CATEGORIES'), 'UI usa constantes categoria');
}

function testApisGuard() {
  const list = read('app/api/master/topography/projects/route.ts');
  const byId = read('app/api/master/topography/projects/[id]/route.ts');
  const archive = read('app/api/master/topography/projects/[id]/archive/route.ts');
  const restore = read('app/api/master/topography/projects/[id]/restore/route.ts');
  for (const [name, src] of [
    ['list', list],
    ['byId', byId],
    ['archive', archive],
    ['restore', restore],
  ] as const) {
    assert(src.includes('assertSuperAdmin'), `${name} exige SUPER_ADMIN`);
    assert(!src.includes('DELETE'), `${name} sem exclusão física`);
  }
  assert(archive.includes('archiveTopographyProject'), 'archive soft');
  assert(restore.includes('restoreTopographyProject'), 'restore');
  assert(list.includes('validateTopographyProjectInput'), 'POST valida');
}

function testDashboardIntegration() {
  const dash = read('components/master/dashboard/MasterExecutiveDashboard.tsx');
  assert(dash.includes('topographyProjectKpis'), 'KPIs topografia no dashboard');
  assert(dash.includes('Novo Projeto'), 'ação rápida Novo Projeto');
  assert(dash.includes('/master/topography/projects?new=1'), 'link formulário real');
  assert(dash.includes('topographyMonthlyFinancials'), 'série financeira topografia');
  assert(!dash.includes('forceEmpty'), 'gráfico topografia conectado (sem forceEmpty)');

  const data = read('lib/masterDashboardData.ts');
  assert(data.includes('computeTopographyProjectKpis'), 'KPIs reais no loader');
  assert(data.includes('aggregateCorporateCashMonthlyRevenueExpense'), 'agrega caixa corporativo');
}

function testTenantUntouched() {
  // Smoke: arquivos críticos tenant não devem estar no diff desta feature — checagem estrutural
  const tenantProjectsApi = read('app/api/projects/route.ts');
  assert(tenantProjectsApi.length > 0, 'API projects tenant intacta (existe)');
  assert(!tenantProjectsApi.includes('master_topography'), 'tenant API sem master_topo');

  assert(exists('app/dashboard/SuperAdminDashboard.tsx'), 'legado master presente');
  const legacy = read('app/dashboard/SuperAdminDashboard.tsx');
  assert(!legacy.includes('master_topography_projects'), 'legado não acoplado à nova tabela');
}

function main() {
  testFilesAndIsolation();
  testValidation();
  testFinancialHelpers();
  testConstantsCentralized();
  testApisGuard();
  testDashboardIntegration();
  testTenantUntouched();
  console.log('OK mandatory-master-topography-projects-tests');
}

main();
