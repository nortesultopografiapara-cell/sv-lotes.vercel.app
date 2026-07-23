/**
 * Layout/rolagem do Painel Executivo /master/**
 * Estratégia: scrollport interno no <main> (não no body).
 *
 * npx tsx scripts/mandatory-master-global-scroll-layout-tests.ts
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

function testMainScrollStrategy() {
  const layout = read('components/master/layout/MasterExecutiveLayout.tsx');
  assert(layout.includes('data-master-scroll-strategy="main"'), 'strategy main');
  assert(layout.includes('master-executive-scroll-container'), 'scroll container id');
  assert(layout.includes('MASTER_EXECUTIVE_BUILD_MARKER'), 'build marker');
  assert(layout.includes('data-master-build='), 'data-master-build attr');

  const css = read('components/master/layout/masterExecutiveLayout.module.css');
  const shell = cssBlock(css, '.shell');
  assert(/height:\s*100dvh/.test(shell), 'shell height 100dvh');
  assert(shell.includes('overflow: hidden'), 'shell overflow hidden');

  const mainCol = cssBlock(css, '.mainColumn');
  assert(mainCol.includes('min-height: 0'), 'mainColumn min-height 0');
  assert(mainCol.includes('overflow: hidden'), 'mainColumn overflow hidden');

  const content = cssBlock(css, '.content');
  assert(content.includes('min-height: 0'), 'content min-height 0');
  assert(
    content.includes('overflow-y: scroll') || content.includes('overflow-y: auto'),
    'content overflow-y scroll|auto',
  );
  assert(content.includes('flex: 1'), 'content flex 1');

  const config = read('lib/master/config.ts');
  assert(config.includes("path.startsWith('/master/')"), 'pathname /master força shell');
  assert(config.includes('MASTER_EXECUTIVE_BUILD_MARKER'), 'marker export');
}

function testNoPageLevelVerticalScrollCompetitors() {
  const dash = cssBlock(
    read('components/master/dashboard/masterExecutiveDashboard.module.css'),
    '.page',
  );
  assert(!dash.includes('overflow-y: auto'), 'dashboard.page sem overflow-y auto');
  assert(!dash.includes('height: 100'), 'dashboard.page sem height travada');

  const projects = cssBlock(
    read('components/master/topography/projects/topographyProjects.module.css'),
    '.page',
  );
  assert(!projects.includes('overflow-y: auto'), 'projects.page sem overflow-y auto');

  const quotes = cssBlock(
    read('components/master/topography/quotes/topographyQuotesEditor.module.css'),
    '.editorPage',
  );
  assert(!quotes.includes('overflow-y: auto'), 'quotes.editorPage sem overflow-y auto');

  for (const page of [
    'app/master/audit/page.tsx',
    'app/master/reports/page.tsx',
    'app/master/settings/page.tsx',
  ]) {
    assert(!read(page).includes('sv-page--scroll-y'), `${page} sem sv-page--scroll-y`);
  }
}

function testTableHorizontalWrappers() {
  for (const file of [
    'components/master/corporateFinance/corporateFinance.module.css',
    'components/master/dashboard/masterExecutiveDashboard.module.css',
    'components/master/topography/projects/topographyProjects.module.css',
  ]) {
    const css = read(file);
    assert(css.includes('overflow-x: auto'), `${file} overflow-x`);
    assert(css.includes('.tableWrap'), `${file} tableWrap`);
  }
}

function testModalsScroll() {
  const css = read('components/master/corporateFinance/corporateFinance.module.css');
  assert(cssBlock(css, '.modal').includes('max-height'), 'modal max-height');
  assert(cssBlock(css, '.modalBody').includes('overflow-y: auto'), 'modalBody scroll');
}

function testLegacySaasLayoutUntouched() {
  const layout = read('components/Layout.tsx');
  assert(layout.includes('flex h-dvh w-full overflow-hidden'), 'tenant chrome preservado');
  const dash = read('app/dashboard/SuperAdminDashboard.tsx');
  assert(dash.includes('overflow-y-auto'), 'SaaS dashboard interno preservado');
}

function testBrowserSuiteExists() {
  assert(
    fs.existsSync(path.join(root, 'scripts/mandatory-master-executive-scroll-browser-tests.ts')),
    'browser scroll suite',
  );
}

function main() {
  console.log('=== Master global scroll layout tests (main strategy) ===');
  testMainScrollStrategy();
  console.log('OK main strategy');
  testNoPageLevelVerticalScrollCompetitors();
  console.log('OK pages');
  testTableHorizontalWrappers();
  console.log('OK tables');
  testModalsScroll();
  console.log('OK modals');
  testLegacySaasLayoutUntouched();
  console.log('OK saas untouched');
  testBrowserSuiteExists();
  console.log('OK browser suite file');
  console.log('ALL PASS');
}

main();
