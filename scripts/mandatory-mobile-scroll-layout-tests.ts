/**
 * Testes obrigatórios — layout mobile (rolagem vertical + bottom nav + modais).
 * npx tsx scripts/mandatory-mobile-scroll-layout-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  MOBILE_BOTTOM_NAV_HEIGHT_PX,
  MOBILE_CONTENT_PAD_BOTTOM_CLASS,
  MOBILE_LAYOUT_CSS_VAR_BOTTOM_NAV,
  MOBILE_LAYOUT_CSS_VAR_CONTENT_PAD,
  MOBILE_MODAL_SOURCE_FILES,
  MOBILE_PAGE_SOURCE_FILES,
  MOBILE_SCROLL_AREA_CLASS,
  SV_SCROLLBAR_DARK_CLASS,
  SV_SCROLLBAR_LIGHT_CLASS,
  SV_MODAL_BODY_CLASS,
  SV_MODAL_FOOTER_CLASS,
  SV_MODAL_OVERLAY_CLASS,
  SV_MODAL_SHELL_CLASS,
} from '../lib/mobileLayout';

const ROOT = process.cwd();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(relPath: string): string {
  const full = path.join(ROOT, relPath);
  assert(fs.existsSync(full), `arquivo ausente: ${relPath}`);
  return fs.readFileSync(full, 'utf8');
}

function testMobileLayoutLib() {
  assert(MOBILE_BOTTOM_NAV_HEIGHT_PX === 72, 'altura bottom nav = 72px');
  assert(
    MOBILE_LAYOUT_CSS_VAR_BOTTOM_NAV === '--sv-mobile-bottom-nav-height',
    'CSS var bottom nav',
  );
  assert(
    MOBILE_LAYOUT_CSS_VAR_CONTENT_PAD === '--sv-mobile-content-pad-bottom',
    'CSS var content pad',
  );
  assert(
    MOBILE_CONTENT_PAD_BOTTOM_CLASS.includes('--sv-mobile-content-pad-bottom'),
    'classe padding inferior',
  );
  assert(
    MOBILE_SCROLL_AREA_CLASS.includes('overflow-y-auto'),
    'área scroll mobile',
  );
  assert(
    MOBILE_SCROLL_AREA_CLASS.includes('sv-scrollbar-dark'),
    'área scroll mobile com scrollbar visível',
  );
  assert(SV_SCROLLBAR_DARK_CLASS.includes('sv-scrollbar'), 'classe scrollbar dark');
  assert(SV_SCROLLBAR_LIGHT_CLASS.includes('sv-scrollbar-light'), 'classe scrollbar light');
}

function testMobileLayoutCss() {
  const css = read('app/mobile-layout.css');
  assert(css.includes('--sv-mobile-bottom-nav-height: 72px'), 'CSS define altura nav');
  assert(css.includes('--sv-mobile-content-pad-bottom'), 'CSS define padding conteúdo');
  assert(css.includes('--sv-mobile-modal-max-height'), 'CSS define max-height modal');
  assert(css.includes('100dvh'), 'CSS usa dvh');
  assert(css.includes('.sv-modal-overlay'), 'classe overlay modal');
  assert(css.includes('.sv-modal-shell'), 'classe shell modal');
  assert(css.includes('.sv-modal-body'), 'classe body modal');
  assert(css.includes('.sv-modal-footer'), 'classe footer modal');
  assert(css.includes('.sv-scrollbar-dark'), 'classe scrollbar dark');
  assert(css.includes('.sv-scrollbar-light'), 'classe scrollbar light');
  assert(css.includes('scrollbar-color'), 'Firefox scrollbar-color');
  assert(css.includes('rgba(249, 115, 22'), 'thumb laranja visível');
  assert(css.includes('.sv-modal-shell.bg-white .sv-modal-body'), 'modal claro com scrollbar');
  assert(css.includes('safe-area-inset-bottom'), 'safe area no footer');
  assert(
    css.includes('z-index: 400') || css.includes('z-index:400'),
    'overlay modal z-index acima bottom nav',
  );
}

function testGlobalsImport() {
  const globals = read('app/globals.css');
  assert(globals.includes('@import "./mobile-layout.css"'), 'globals importa mobile-layout');
  assert(globals.includes('.sv-page--scroll-y'), 'globals mantém sv-page--scroll-y');
}

function testLayoutMainScroll() {
  const layout = read('components/Layout.tsx');
  assert(layout.includes('h-dvh'), 'root usa h-dvh');
  assert(layout.includes('sv-mobile-scroll-area'), 'wrapper scroll mobile');
  assert(!layout.includes('pb-20'), 'remove pb-20 fixo insuficiente');
  assert(!layout.match(/isMobile[^]*pb-20/), 'sem pb-20 condicional mobile');
  assert(layout.includes('h-[72px]'), 'bottom nav 72px');
  assert(layout.includes('fixed bottom-0'), 'bottom nav fixa');
}

function testPageScrollPatterns() {
  const dashboard = read('app/dashboard/page.tsx');
  assert(
    dashboard.includes('sv-page--scroll-y'),
    'dashboard permite scroll vertical',
  );
  assert(
    !dashboard.includes('overflow-hidden'),
    'dashboard sem overflow-hidden bloqueando scroll',
  );

  for (const file of MOBILE_PAGE_SOURCE_FILES) {
    const source = read(file);
    if (file === 'app/contracts/page.tsx') {
      assert(
        source.includes('contracts-mobile.css') || source.includes('contracts-mobile'),
        'contratos usa CSS mobile dedicado',
      );
      continue;
    }
    if (file === 'app/finance/page.tsx') {
      assert(
        source.includes('sv-page--mobile-pad') || source.includes('overflow-y-auto'),
        'financeiro com scroll/padding mobile',
      );
      continue;
    }
    if (file === 'components/billing/CompanyBillingPortal.tsx') {
      assert(source.includes('overflow-y-auto'), 'billing overflow-y-auto');
      assert(source.includes('min-h-0'), 'billing min-h-0');
      assert(
        source.includes('SV_SCROLLBAR_DARK_CLASS') || source.includes('sv-scrollbar-dark'),
        'billing scrollbar visível',
      );
      assert(source.includes('sv-page--mobile-pad'), 'billing padding mobile');
      continue;
    }
    assert(
      source.includes('sv-page--scroll-y') ||
        source.includes('sv-mobile-scroll-area') ||
        source.includes('sv-page--mobile-pad'),
      `${file} com padrão scroll mobile`,
    );
  }
}

function testModalPatterns() {
  for (const file of MOBILE_MODAL_SOURCE_FILES) {
    const source = read(file);
    assert(source.includes(SV_MODAL_OVERLAY_CLASS), `${file} usa ${SV_MODAL_OVERLAY_CLASS}`);
    assert(source.includes(SV_MODAL_SHELL_CLASS), `${file} usa ${SV_MODAL_SHELL_CLASS}`);
    assert(source.includes(SV_MODAL_BODY_CLASS), `${file} usa ${SV_MODAL_BODY_CLASS}`);
  }

  const brokers = read('app/dashboard/brokers/page.tsx');
  assert(brokers.includes(SV_MODAL_FOOTER_CLASS), 'modal corretor com footer fixo');
  assert(
    brokers.includes('Salvar Corretor') || brokers.includes('Salvar Alterações'),
    'botão salvar corretor presente',
  );

  const customers = read('app/customers/page.tsx');
  assert(customers.includes(SV_MODAL_FOOTER_CLASS), 'modal cliente com footer fixo');
  assert(customers.includes('Confirmar'), 'botão confirmar cliente presente');

  const lotForm = read('components/map/CustomerLotFormModal.tsx');
  assert(lotForm.includes('Confirmar Venda'), 'botão confirmar venda GIS');
  assert(lotForm.includes(SV_MODAL_FOOTER_CLASS), 'venda lote com footer fixo');
  assert(lotForm.includes('sv-modal-shell--full-mobile bg-white'), 'modal venda fundo claro');
}

function testBrokersBrokerFormMobile() {
  const brokers = read('app/dashboard/brokers/page.tsx');
  const css = read('app/mobile-layout.css');

  assert(
    brokers.includes('sv-page--scroll-y') || brokers.includes('sv-mobile-scroll-area'),
    'corretores: página com scroll mobile',
  );
  assert(!brokers.includes('h-screen'), 'corretores: sem h-screen');
  assert(
    !brokers.match(/sv-page[^`"']*overflow-hidden/) &&
      !brokers.includes('flex flex-col h-full bg-[var(--bg-main)]'),
    'corretores: container principal sem h-full/overflow bloqueante',
  );

  assert(brokers.includes('sv-modal-overlay'), 'corretores: modal overlay global');
  assert(
    brokers.includes('sv-modal-overlay--immersive'),
    'corretores: modal immersive full-screen mobile',
  );
  assert(
    brokers.includes('sv-modal-shell--full-mobile'),
    'corretores: shell full-mobile com h-dvh',
  );
  assert(brokers.includes(SV_MODAL_BODY_CLASS), 'corretores: sv-modal-body no formulário');
  assert(brokers.includes(SV_MODAL_FOOTER_CLASS), 'corretores: sv-modal-footer com Salvar');
  assert(brokers.includes('Salvar Corretor'), 'corretores: botão Salvar Corretor');
  assert(
    brokers.includes('Senha de Acesso') && brokers.includes('Confirmar Senha'),
    'corretores: campos de senha no formulário',
  );

  assert(
    css.includes('z-index: 400') || css.includes('z-index:400'),
    'modal overlay acima da bottom nav (z-400)',
  );
  assert(
    css.includes('--sv-mobile-content-pad-bottom') &&
      css.includes('--sv-mobile-modal-body-pad-bottom'),
    'CSS com padding inferior mobile (nav + safe-area + 24px)',
  );
  assert(css.includes('100dvh'), 'CSS modal usa dvh');
}

function testNoProblematicMainOverflowHidden() {
  const layout = read('components/Layout.tsx');
  const mainMatch = layout.match(/<main[\s\S]*?className=\{`([^`]+)`\}/);
  assert(!!mainMatch, 'main encontrado');
  const mainClasses = mainMatch![1];
  assert(mainClasses.includes('min-h-0'), 'main com min-h-0 para flex scroll');
}

function testContractsScrollbars() {
  const contracts = read('app/contracts/page.tsx');
  assert(contracts.includes('sv-scrollbar-dark'), 'contratos usa scrollbar dark');
  assert(contracts.includes('contracts-list-scroll'), 'lista lateral de contratos');
  assert(contracts.includes('contracts-detail-mobile-pad'), 'área de detalhe rolável');
}

function run() {
  const tests: Array<[string, () => void]> = [
    ['mobileLayout lib', testMobileLayoutLib],
    ['mobile-layout.css', testMobileLayoutCss],
    ['globals import', testGlobalsImport],
    ['Layout scroll', testLayoutMainScroll],
    ['páginas scroll', testPageScrollPatterns],
    ['modais mobile', testModalPatterns],
    ['corretor cadastro mobile', testBrokersBrokerFormMobile],
    ['main overflow', testNoProblematicMainOverflowHidden],
    ['contratos scrollbar', testContractsScrollbars],
  ];

  for (const [name, fn] of tests) {
    fn();
    console.log(`✓ ${name}`);
  }

  console.log(`\n${tests.length} grupos de testes mobile scroll/layout OK.`);
}

run();
