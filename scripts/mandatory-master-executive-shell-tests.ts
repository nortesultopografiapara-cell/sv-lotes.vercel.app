/**
 * Painel Master Executivo V2 — isolamento da casca visual (Fase 2).
 * npx tsx scripts/mandatory-master-executive-shell-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  MASTER_DASHBOARD_V2_FLAG,
  MASTER_DASHBOARD_V2_UI_FLAG,
  MASTER_TOPOGRAFIA_LOGO_PATH,
  parseMasterDashboardV2EnvFlag,
  shouldUseMasterExecutiveShell,
} from '../lib/master/config';
import {
  MASTER_EXECUTIVE_NAV,
  MASTER_EXECUTIVE_PLACEHOLDER_HREFS,
  flattenMasterExecutiveNav,
  isMasterExecutiveNavActive,
} from '../lib/master/executiveNav';
import { flattenSuperAdminNav } from '../lib/superAdminNav';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(process.cwd(), rel));
}

function testFeatureFlagDefaults() {
  assert(MASTER_DASHBOARD_V2_FLAG === 'MASTER_DASHBOARD_V2_ENABLED', 'server flag name');
  assert(
    MASTER_DASHBOARD_V2_UI_FLAG === 'NEXT_PUBLIC_MASTER_DASHBOARD_V2_ENABLED',
    'ui flag name',
  );
  assert(parseMasterDashboardV2EnvFlag(undefined) === false, 'undefined => false');
  assert(parseMasterDashboardV2EnvFlag('false') === false, 'false => false');
  assert(parseMasterDashboardV2EnvFlag('true') === true, 'true => true');
  assert(parseMasterDashboardV2EnvFlag(' TRUE ') === true, 'trim/case');

  const example = read('.env.example');
  assert(example.includes('MASTER_DASHBOARD_V2_ENABLED=false'), '.env.example server flag');
  assert(
    example.includes('NEXT_PUBLIC_MASTER_DASHBOARD_V2_ENABLED=false'),
    '.env.example ui flag',
  );

  const nextConfig = read('next.config.ts');
  assert(
    nextConfig.includes('NEXT_PUBLIC_MASTER_DASHBOARD_V2_ENABLED'),
    'next.config expose ui flag',
  );
}

function testShellGateIsolation() {
  assert(
    shouldUseMasterExecutiveShell({
      role: 'SUPER_ADMIN',
      flagEnabled: false,
      impersonatingTenant: false,
    }) === false,
    'flag off => shell off',
  );
  assert(
    shouldUseMasterExecutiveShell({
      role: 'SUPER_ADMIN',
      flagEnabled: true,
      impersonatingTenant: false,
    }) === true,
    'SUPER_ADMIN + flag => shell on',
  );
  assert(
    shouldUseMasterExecutiveShell({
      role: 'MASTER_ADMIN',
      flagEnabled: true,
      impersonatingTenant: false,
    }) === true,
    'MASTER_ADMIN + flag => shell on',
  );
  assert(
    shouldUseMasterExecutiveShell({
      role: 'ADMIN',
      flagEnabled: true,
      impersonatingTenant: false,
    }) === false,
    'ADMIN empresa não recebe shell',
  );
  assert(
    shouldUseMasterExecutiveShell({
      role: 'OWNER',
      flagEnabled: true,
      impersonatingTenant: false,
    }) === false,
    'OWNER não recebe shell',
  );
  assert(
    shouldUseMasterExecutiveShell({
      role: 'BROKER',
      flagEnabled: true,
      impersonatingTenant: false,
    }) === false,
    'BROKER não recebe shell',
  );
  assert(
    shouldUseMasterExecutiveShell({
      role: 'CUSTOMER',
      flagEnabled: true,
      impersonatingTenant: false,
    }) === false,
    'CUSTOMER não recebe shell',
  );
  assert(
    shouldUseMasterExecutiveShell({
      role: 'SUPER_ADMIN',
      flagEnabled: true,
      impersonatingTenant: true,
    }) === false,
    'impersonation não recebe chrome Master V2',
  );
}

function testNavAndPlaceholders() {
  const flat = flattenMasterExecutiveNav();
  assert(flat.some((i) => i.name === 'Orçamentos'), 'Orçamentos no menu');
  assert(
    flat.some((i) => i.href === '/master/topography/budgets'),
    'rota Orçamentos',
  );
  assert(flat.some((i) => i.href === '/dashboard'), 'dashboard legado');
  assert(flat.some((i) => i.href === '/companies'), 'companies legado');
  assert(flat.some((i) => i.href === '/plans'), 'plans legado');
  assert(flat.some((i) => i.href === '/saas-finance'), 'cobranças/saas-finance');
  assert(flat.some((i) => i.href === '/saas-finance/cash'), 'caixa saas');
  assert(flat.some((i) => i.href === '/master/reports'), 'reports visível no V2');
  assert(flat.some((i) => i.href === '/master/audit'), 'auditoria acessível');
  assert(flat.some((i) => i.href === '/users'), 'users');
  assert(flat.some((i) => i.href === '/master/settings'), 'settings');

  assert(
    !flat.some((i) => i.href === '/finance'),
    'financeiro corporativo não usa /finance tenant',
  );
  assert(
    !flat.some((i) => i.href === '/charges'),
    'não usa cobranças tenant',
  );

  assert(isMasterExecutiveNavActive('/dashboard', '/dashboard'), 'dashboard active exact');
  assert(!isMasterExecutiveNavActive('/companies', '/dashboard'), 'dashboard not fuzzy');
  assert(
    isMasterExecutiveNavActive('/saas-finance/cash', '/saas-finance/cash'),
    'cash active',
  );
  assert(
    !isMasterExecutiveNavActive('/saas-finance/cash', '/saas-finance'),
    'cash não marca cobranças',
  );

  for (const href of MASTER_EXECUTIVE_PLACEHOLDER_HREFS) {
    const rel = path.join('app', ...href.split('/').filter(Boolean), 'page.tsx');
    assert(exists(rel), `placeholder page exists: ${href} -> ${rel}`);
  }

  assert(MASTER_EXECUTIVE_NAV.length >= 6, 'seções do menu');
}

function testLegacyNavUntouched() {
  const legacy = flattenSuperAdminNav();
  assert(legacy.some((i) => i.href === '/dashboard'), 'nav legado dashboard');
  assert(!legacy.some((i) => i.href === '/master/reports'), 'reports ainda oculto no nav legado');
}

function testLayoutBranchIsolation() {
  const layout = read('components/Layout.tsx');
  assert(layout.includes('MasterExecutiveLayout'), 'Layout importa shell V2');
  assert(layout.includes('shouldUseMasterExecutiveShell'), 'Layout usa gate V2');
  assert(layout.includes('SuperAdminSidebar'), 'Layout preserva sidebar legado');
  assert(!layout.includes('globals.css'), 'Layout não injeta globals por V2');

  assert(exists('components/master/layout/MasterExecutiveLayout.tsx'), 'shell');
  assert(exists('components/master/layout/MasterExecutiveSidebar.tsx'), 'sidebar');
  assert(exists('components/master/layout/MasterExecutiveHeader.tsx'), 'header');
  assert(exists('components/master/layout/masterExecutiveLayout.module.css'), 'css module');
  assert(exists('components/master/MasterModulePlaceholder.tsx'), 'placeholder');
  assert(exists('components/admin/MasterSuperAdminGuard.tsx'), 'guard reutilizado');

  const css = read('components/master/layout/masterExecutiveLayout.module.css');
  assert(css.includes('.shell'), 'css module shell');
  assert(!css.includes('body {'), 'css module sem regra body global');

  const globals = read('app/globals.css');
  assert(
    !globals.includes('masterExecutive') && !globals.includes('MasterExecutive'),
    'globals.css sem estilos Master V2',
  );
}

function testLogoAsset() {
  assert(
    MASTER_TOPOGRAFIA_LOGO_PATH === '/brand/sv-topografia-projetos-logo.png',
    'logo path',
  );
  assert(
    exists('public/brand/sv-topografia-projetos-logo.png'),
    'arquivo logo oficial presente',
  );
  const brand = read('components/master/layout/MasterBrandLogo.tsx');
  assert(brand.includes('MASTER_TOPOGRAFIA_LOGO_PATH'), 'BrandLogo usa path oficial');
  assert(!brand.includes('logo-sv-lotes.png'), 'não usa logo SV LOTES produto');
  assert(brand.includes('Painel Executivo'), 'bloco institucional');
}

function testExecutiveDashboardV2() {
  assert(exists('components/master/dashboard/MasterExecutiveDashboard.tsx'), 'dashboard V2');
  assert(
    exists('components/master/dashboard/masterExecutiveDashboard.module.css'),
    'css dashboard V2',
  );
  const dash = read('components/master/dashboard/MasterExecutiveDashboard.tsx');
  assert(dash.includes('loadMasterDashboardData'), 'reutiliza dados existentes');
  assert(dash.includes('Empresas Ativas'), 'kpi empresas');
  assert(dash.includes('Orçamentos'), 'atalho orçamentos');
  assert(dash.includes('Em breve'), 'módulos em breve (exceto Projetos)');
  assert(dash.includes('Novo Projeto'), 'ação rápida Novo Projeto');
  assert(dash.includes('topographyProjectKpis'), 'KPIs topografia');
  assert(!dash.includes('MasterModulePlaceholder'), 'sem placeholder no dash');
  assert(!dash.includes('/finance"'), 'não usa /finance tenant');
  assert(
    (dash.match(/MasterAnnualRevenueExpenseChart/g) || []).length >= 2,
    'dois gráficos anuais renderizados',
  );
  assert(dash.includes('saasMonthlyFinancials'), 'SV LOTES usa dados reais Caixa SaaS');
  assert(dash.includes('forceEmpty'), 'Topografia com estado vazio forçado');
  assert(dash.includes('topographyMonthlyFinancials'), 'Topografia usa contrato vazio');

  assert(
    exists('components/master/dashboard/MasterAnnualRevenueExpenseChart.tsx'),
    'componente gráfico anual',
  );
  assert(exists('components/master/dashboard/MasterCompactAlerts.tsx'), 'componente alertas');

  const annual = read('components/master/dashboard/MasterAnnualRevenueExpenseChart.tsx');
  assert(annual.includes('BarChart'), 'usa barras');
  assert(annual.includes('forceEmpty'), 'suporta estado vazio forçado');

  const compact = read('components/master/dashboard/MasterCompactAlerts.tsx');
  assert(
    compact.includes('Nenhum alerta crítico no momento.'),
    'empty state de alertas',
  );

  const page = read('app/dashboard/page.tsx');
  assert(page.includes('MasterExecutiveDashboard'), 'page wire V2');
  assert(page.includes('isMasterDashboardV2EnabledForUi'), 'page gated by flag');
  assert(page.includes('SuperAdminDashboard'), 'legado preservado');

  const data = read('lib/masterDashboardData.ts');
  assert(data.includes('trialCompanies'), 'empresas em teste');
  assert(data.includes('newCompaniesThisMonth'), 'novos clientes');
  assert(data.includes('saasMonthlyFinancials'), 'série anual Caixa SaaS');
  assert(data.includes('topographyMonthlyFinancials'), 'contrato Topografia');
  assert(data.includes('aggregateSaasCashMonthlyRevenueExpense'), 'agrega Caixa SaaS');

  const cash = read('lib/saasCashMovements.ts');
  assert(cash.includes('aggregateSaasCashMonthlyRevenueExpense'), 'helper anual');
  assert(cash.includes('buildEmptyMonthlyRevenueExpense'), '12 meses zeros');
  assert(cash.includes("type: 'all'"), 'income + expense na agregação');

  const layout = read('components/Layout.tsx');
  assert(!layout.includes('master-dashboard-v2-diag'), 'diagnóstico temporário removido');
}

function main() {
  testFeatureFlagDefaults();
  testShellGateIsolation();
  testNavAndPlaceholders();
  testLegacyNavUntouched();
  testLayoutBranchIsolation();
  testLogoAsset();
  testExecutiveDashboardV2();
  console.log('OK mandatory-master-executive-shell-tests');
}

main();
