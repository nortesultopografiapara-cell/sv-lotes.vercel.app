/**
 * Workspace desktop — Nova venda (somente UI).
 * npx tsx scripts/mandatory-gis-sale-workspace-desktop-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function testResumoRemovedEditConfrontationsButton() {
  const gis = read('components/map/GISMap.tsx');
  assert(!gis.includes('Editar confrontações'), 'Resumo sem botão Editar confrontações');
  assert(gis.includes('onEditOfficialSides'), 'callback do editor oficial permanece');
  assert(gis.includes('Corrigir frente'), 'Corrigir frente permanece no Resumo');
  console.log('OK testResumoRemovedEditConfrontationsButton');
}

function testSaleWorkspaceShellAndHeader() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const css = read('app/mobile-layout.css');

  assert(modal.includes("? 'Nova venda'"), 'título Nova venda no desktop');
  assert(modal.includes('isSaleWorkspaceDesktop'), 'flag só desktop + create + Vendido');
  assert(modal.includes('useIsWideDesktop'), 'breakpoint desktop largo');
  assert(modal.includes('sv-modal-shell--sale-workspace'), 'shell amplo');
  assert(css.includes('sv-modal-shell--sale-workspace'), 'CSS do workspace');
  assert(css.includes('1480px'), 'largura até ~1480px em 1920');
  assert(css.includes('88vh'), 'altura limitada ao viewport');
  assert(css.includes('900px'), 'teto de altura 900px');
  assert(css.includes('--sv-sale-workspace-rail'), 'rail da sidebar no cálculo de largura');
  assert(css.includes('calc(100vw - var(--sv-sale-workspace-rail) - 32px)'), '1366 usa quase toda a largura útil');
  assert(css.includes('1920x1080'), 'homologação 1920x1080');
  assert(css.includes('1366x768'), 'homologação 1366x768');
  assert(modal.includes('VALOR DO LOTE'), 'valor do lote no header');
  assert(modal.includes('projectName') || modal.includes('projectLabel'), 'empreendimento no lote');
  assert(modal.includes('sv-sale-workspace-header'), 'header compacto');
  console.log('OK testSaleWorkspaceShellAndHeader');
}

function testTwoColumnCreateLayout() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const css = read('app/mobile-layout.css');
  assert(modal.includes('sv-sale-workspace-grid'), 'grid do workspace');
  assert(css.includes('minmax(0, 1.65fr) minmax(360px, 1fr)'), '2 colunas ~62/38');
  assert(!css.includes('minmax(0, 1.12fr) minmax(0, 0.96fr) minmax(0, 1.12fr)'), 'sem grid de 3 colunas');
  assert(modal.includes('sv-sale-workspace-col-client'), 'coluna Cliente+Cônjuge');
  assert(modal.includes('sv-sale-workspace-col-sale'), 'coluna Dados da venda explícita');
  assert(modal.includes('? "Cliente" : "DADOS DO CLIENTE"'), 'bloco Cliente');
  assert(modal.includes('Possui Cônjuge'), 'cônjuge condicional');
  assert(modal.includes('sv-sale-workspace-spouse-compact'), 'cônjuge fechado compacto');
  assert(modal.includes('? "Dados da venda" : "DADOS DA VENDA"'), 'coluna Dados da venda');
  assert(modal.includes('sv-sale-workspace-card--sale'), 'card da venda à direita');
  assert(modal.includes('sv-sale-workspace-fields'), 'campos do cliente');
  assert(modal.includes('sv-sale-ws-row--docs'), 'CPF/RG/órgão/UF em linha');
  assert(modal.includes('sv-sale-ws-row--contact'), 'Telefone/E-mail com proporção');
  assert(modal.includes('sv-sale-ws-row--city'), 'Cidade/UF/CEP com espaço de máscara');
  assert(css.includes('minmax(10rem, 0.38fr) minmax(14rem, 0.62fr)'), 'telefone não corta; e-mail maior');
  assert(css.includes('minmax(8.5rem, 0.9fr)'), 'CEP com largura de máscara');
  assert(/grid-column:\s*1;\s*grid-row:\s*1/.test(css), 'Cliente pinado na coluna 1 / row 1');
  assert(/grid-column:\s*2;\s*grid-row:\s*1/.test(css), 'Venda pinada na coluna 2 / row 1');
  assert(modal.includes('sv-modal-footer sticky'), 'rodapé sticky');
  assert(modal.includes('Confirmar Venda'), 'Confirmar Venda visível no rodapé');
  console.log('OK testTwoColumnCreateLayout');
}

function testDesktopGridNotOverriddenToBlock() {
  const css = read('app/mobile-layout.css');
  const mediaIdx = css.indexOf('@media (min-width: 1024px)');
  const gridInMedia = css.indexOf('display: grid', mediaIdx);
  const colsInMedia = css.indexOf('minmax(0, 1.65fr) minmax(360px, 1fr)', mediaIdx);
  assert(mediaIdx >= 0, 'media 1024px existe');
  assert(gridInMedia > mediaIdx, 'display:grid está DENTRO do 1024px');
  assert(colsInMedia > mediaIdx, '2 colunas explícitas no 1024px');
  const titleAfter = css.indexOf('.sv-sale-workspace-card-title', gridInMedia);
  const blockAfterGrid = css.indexOf('.sv-sale-workspace-grid {', gridInMedia + 1);
  if (blockAfterGrid >= 0 && titleAfter >= 0 && blockAfterGrid < titleAfter) {
    const snippet = css.slice(blockAfterGrid, blockAfterGrid + 80);
    assert(!/display:\s*block/.test(snippet), 'display:block NÃO vem depois do grid 1024px');
  }
  const firstGridRule = css.indexOf('.sv-sale-workspace-grid {');
  const firstBlock = css.slice(firstGridRule, firstGridRule + 80);
  assert(/display:\s*block/.test(firstBlock), 'display:block só como default antes do 1024px');
  assert(firstGridRule < mediaIdx, 'default block precede o media 1024px');
  console.log('OK testDesktopGridNotOverriddenToBlock');
}

function testSidebarChromeUsesExistingRail() {
  const layout = read('components/Layout.tsx');
  const chrome = read('lib/saleWorkspaceChrome.ts');
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const css = read('app/mobile-layout.css');

  assert(chrome.includes('SALE_WORKSPACE_CHROME_EVENT'), 'evento único de chrome');
  assert(!chrome.includes('localStorage'), 'chrome não persiste preferência');
  assert(modal.includes('setSaleWorkspaceChromeOpen(isWorkspaceDesktop)'), 'abre chrome ao montar workspace venda/reserva');
  assert(modal.includes('setSaleWorkspaceChromeOpen(false)'), 'restaura ao fechar/cancelar/concluir');
  assert(layout.includes('SALE_WORKSPACE_CHROME_EVENT'), 'Layout escuta o chrome existente');
  assert(layout.includes('tenantSidebarRail'), 'tenant usa rail compacta já no menu');
  assert(layout.includes("w-[72px]"), 'rail ~72px');
  assert(layout.includes('superAdminSidebarCollapsed'), 'Super Admin reutiliza collapsed');
  assert(layout.includes("localStorage.setItem('saas_sidebar_collapsed'"), 'preferência do usuário permanece no toggle');
  assert(css.includes('sv-modal-overlay--sale-workspace'), 'overlay não cobre a rail');
  assert(css.includes('left: var(--sv-sale-workspace-rail)'), 'workspace começa após a rail');
  console.log('OK testSidebarChromeUsesExistingRail');
}

function testCreateHidesRedundantControls() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const picker = read('components/customers/CustomerSearchPicker.tsx');

  assert(modal.includes('showCreateNewButton={false}'), 'esconde Cadastrar novo cliente na venda');
  assert(picker.includes('showCreateNewButton'), 'picker ainda pode exibir o atalho em outros fluxos');
  assert(modal.includes("{isEditMode ? ("), 'abas só na edição');
  assert(modal.includes('isEditMode && saleId'), 'Documentos só com venda existente');
  assert(modal.includes('Documentos da Venda'), 'aba Documentos permanece no Editar Venda');
  assert(modal.includes('SaleDocumentsPanel'), 'painel de documentos intacto');
  console.log('OK testCreateHidesRedundantControls');
}

function testPaymentAndSaleLogicUntouched() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes('PAYMENT_TYPE_INSTALLMENT'), 'parcelado intacto');
  assert(modal.includes('use_balloon_installments'), 'balão intacto');
  assert(modal.includes('handleSubmit'), 'submit original');
  assert(modal.includes('broker_id'), 'corretor intacto');
  assert(modal.includes('financial_account_id'), 'conta recebedora intacta');
  assert(modal.includes('has_spouse'), 'cônjuge intacto');
  assert(modal.includes('CustomerSearchPicker'), 'busca de cliente existente intacta');
  assert(!modal.includes("from('sales')") || modal.includes('handleSubmit'), 'sem reescrita de persistência no modal');
  console.log('OK testPaymentAndSaleLogicUntouched');
}

function testMobileShellPreserved() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes('sv-modal-shell--full-mobile'), 'full-mobile preservado');
  assert(modal.includes('isSaleWorkspaceDesktop ? "sv-sale-workspace-grid"'), 'venda desktop usa grid da venda');
  assert(modal.includes('"space-y-6"'), 'mobile permanece empilhado');
  assert(modal.includes('isWorkspaceDesktop ? "sv-sale-workspace-col-client" : "contents"'), 'mobile não ganha coluna extra');
  console.log('OK testMobileShellPreserved');
}

function testNoMigrationOrProduction() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const css = read('app/mobile-layout.css');
  const picker = read('components/customers/CustomerSearchPicker.tsx');
  const layout = read('components/Layout.tsx');
  const chrome = read('lib/saleWorkspaceChrome.ts');
  const joined = modal + css + picker + layout + chrome;
  assert(!joined.includes('aezktedncttwpqeunjej'), 'não aponta Production');
  assert(!joined.includes('create table'), 'sem SQL de schema');
  console.log('OK testNoMigrationOrProduction');
}

function run() {
  testResumoRemovedEditConfrontationsButton();
  testSaleWorkspaceShellAndHeader();
  testTwoColumnCreateLayout();
  testDesktopGridNotOverriddenToBlock();
  testSidebarChromeUsesExistingRail();
  testCreateHidesRedundantControls();
  testPaymentAndSaleLogicUntouched();
  testMobileShellPreserved();
  testNoMigrationOrProduction();
  console.log('OK — mandatory-gis-sale-workspace-desktop-tests passed');
}

run();
