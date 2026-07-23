/**
 * Layout/rolagem global do Painel Executivo /master/**
 * Estratégia: scroll no documento (body) — sem scroll vertical concorrente no shell.
 *
 * npx tsx scripts/mandatory-master-global-scroll-layout-tests.ts
 * npm run test:master-global-scroll-layout
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function cssBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`);
  const m = css.match(re);
  assert(m, `bloco CSS ${selector}`);
  return m![1];
}

function testDocumentScrollStrategy() {
  const layout = read('components/master/layout/MasterExecutiveLayout.tsx');
  assert(layout.includes('data-master-scroll-strategy="document"'), 'strategy document');
  assert(layout.includes('<main className={styles.content}>'), 'main semantico');

  const css = read('components/master/layout/masterExecutiveLayout.module.css');
  const shell = cssBlock(css, '.shell');
  assert(shell.includes('min-height: 100dvh'), 'shell min-height');
  assert(shell.includes('align-items: flex-start'), 'shell flex-start (não estica na sidebar)');
  assert(!shell.includes('overflow: hidden'), 'shell sem overflow hidden');
  assert(!/(?:^|[;\s])height:\s*100(?:dvh|vh)\b/.test(shell.replace(/\n/g, ' ')), 'shell sem height fixa');

  const content = cssBlock(css, '.content');
  assert(!content.includes('overflow-y: auto'), 'content sem scroll vertical concorrente');
  assert(!content.includes('overflow-y: hidden'), 'content sem overflow-y hidden');
  assert(!content.includes('min-height: 0'), 'content sem min-height 0 de scrollport');

  const mainCol = cssBlock(css, '.mainColumn');
  assert(!mainCol.includes('overflow: hidden'), 'mainColumn sem overflow hidden');

  const sidebar = cssBlock(css, '.sidebar');
  assert(sidebar.includes('position: sticky'), 'sidebar sticky');
  assert(sidebar.includes('overflow-y: auto') || css.includes('.navScroll'), 'sidebar/nav scroll interno ok');

  const header = cssBlock(css, '.header');
  assert(header.includes('position: sticky'), 'header sticky');
}

function testNoPageLevelVerticalScrollCompetitors() {
  const dash = read('components/master/dashboard/masterExecutiveDashboard.module.css');
  const dashPage = cssBlock(dash, '.page');
  assert(!dashPage.includes('overflow-y: auto'), 'dashboard.page sem overflow-y auto');

  const projects = read('components/master/topography/projects/topographyProjects.module.css');
  const projectsPage = cssBlock(projects, '.page');
  assert(!projectsPage.includes('overflow-y: auto'), 'projects.page sem overflow-y auto');

  const quotes = read('components/master/topography/quotes/topographyQuotesEditor.module.css');
  const editor = cssBlock(quotes, '.editorPage');
  assert(!editor.includes('overflow-y: auto'), 'quotes.editorPage sem overflow-y auto');

  for (const page of ['app/master/audit/page.tsx', 'app/master/reports/page.tsx', 'app/master/settings/page.tsx']) {
    const src = read(page);
    assert(!src.includes('sv-page--scroll-y'), `${page} sem sv-page--scroll-y`);
  }
}

function testTableHorizontalWrappers() {
  const files = [
    'components/master/corporateFinance/corporateFinance.module.css',
    'components/master/dashboard/masterExecutiveDashboard.module.css',
    'components/master/topography/projects/topographyProjects.module.css',
  ];
  for (const file of files) {
    const css = read(file);
    assert(css.includes('overflow-x: auto'), `${file} overflow-x auto`);
    assert(css.includes('.tableWrap'), `${file} tableWrap`);
  }
  assert(read('app/master/audit/page.tsx').includes('overflow-x-auto'), 'audit table x');
  assert(read('app/master/reports/page.tsx').includes('overflow-x-auto'), 'reports table x');
}

function testModalsScroll() {
  const css = read('components/master/corporateFinance/corporateFinance.module.css');
  const modal = cssBlock(css, '.modal');
  assert(modal.includes('max-height'), 'modal max-height');
  const body = cssBlock(css, '.modalBody');
  assert(body.includes('overflow-y: auto'), 'modalBody scroll');
}

function testChartHorizontal() {
  const css = read('components/master/dashboard/masterExecutiveDashboard.module.css');
  assert(css.includes('.chartBoxInner'), 'chart inner min-width');
  const chart = read('components/master/dashboard/MasterAnnualRevenueExpenseChart.tsx');
  assert(chart.includes('chartBoxInner'), 'chart usa wrapper horizontal');
}

function testLayoutDoesNotWrapMasterInTenantChrome() {
  const layout = read('components/Layout.tsx');
  assert(layout.includes('shouldUseMasterExecutiveShell'), 'gate master shell');
  assert(layout.includes('<MasterExecutiveLayout'), 'early return Master');
  // O chrome tenant (h-dvh + overflow-hidden) só aparece DEPOIS do early return Master
  const afterMaster = layout.slice(layout.indexOf('const menuRoleForTenantChrome'));
  assert(afterMaster.includes('h-dvh'), 'tenant chrome mantém h-dvh');
  assert(afterMaster.includes('overflow-hidden'), 'tenant chrome mantém overflow-hidden');
  const beforeTenant = layout.slice(0, layout.indexOf('const menuRoleForTenantChrome'));
  const masterBlock = beforeTenant.slice(beforeTenant.lastIndexOf('shouldUseMasterExecutiveShell'));
  assert(masterBlock.includes('<MasterExecutiveLayout'), 'Master no early return');
  assert(!masterBlock.includes('h-dvh'), 'early return Master sem h-dvh');
}

function main() {
  console.log('=== Master global scroll layout tests ===');
  testDocumentScrollStrategy();
  console.log('OK document strategy');
  testNoPageLevelVerticalScrollCompetitors();
  console.log('OK pages');
  testTableHorizontalWrappers();
  console.log('OK tables');
  testModalsScroll();
  console.log('OK modals');
  testChartHorizontal();
  console.log('OK charts');
  testLayoutDoesNotWrapMasterInTenantChrome();
  console.log('OK Layout isolation');
  console.log('ALL PASS');
}

main();
