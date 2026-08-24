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
  assert(css.includes('1240px'), 'largura ~1240px');
  assert(css.includes('86vh'), 'altura limitada ao viewport');
  assert(css.includes('calc(100vw - 48px)'), 'mapa visível ao redor (não 100vw)');
  assert(modal.includes('Valor do lote'), 'valor do lote no header');
  assert(modal.includes('projectName'), 'empreendimento no lote');
  console.log('OK testSaleWorkspaceShellAndHeader');
}

function testThreeColumnCreateLayout() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes('sv-sale-workspace-grid'), 'grid de 3 colunas');
  assert(modal.includes('? "Cliente" : "DADOS DO CLIENTE"'), 'coluna Cliente');
  assert(modal.includes('Cônjuge'), 'coluna Cônjuge');
  assert(modal.includes('? "Dados da venda" : "DADOS DA VENDA"'), 'coluna Dados da venda');
  assert(modal.includes('sv-sale-workspace-fields'), 'campos em grid interno');
  assert(modal.includes('sv-modal-footer sticky'), 'rodapé sticky');
  assert(modal.includes('Confirmar Venda'), 'Confirmar Venda visível no rodapé');
  console.log('OK testThreeColumnCreateLayout');
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
  assert(!modal.includes('from(\'sales\')') || modal.includes('handleSubmit'), 'sem reescrita de persistência no modal');
  console.log('OK testPaymentAndSaleLogicUntouched');
}

function testMobileShellPreserved() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes('sv-modal-shell--full-mobile'), 'full-mobile preservado');
  assert(modal.includes('isSaleWorkspaceDesktop ? "sv-sale-workspace-grid" : "space-y-6"'), 'mobile permanece empilhado');
  console.log('OK testMobileShellPreserved');
}

function testNoMigrationOrProduction() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const css = read('app/mobile-layout.css');
  const picker = read('components/customers/CustomerSearchPicker.tsx');
  const joined = modal + css + picker;
  assert(!joined.includes('aezktedncttwpqeunjej'), 'não aponta Production');
  assert(!joined.includes('create table'), 'sem SQL de schema');
  console.log('OK testNoMigrationOrProduction');
}

function run() {
  testResumoRemovedEditConfrontationsButton();
  testSaleWorkspaceShellAndHeader();
  testThreeColumnCreateLayout();
  testCreateHidesRedundantControls();
  testPaymentAndSaleLogicUntouched();
  testMobileShellPreserved();
  testNoMigrationOrProduction();
  console.log('OK — mandatory-gis-sale-workspace-desktop-tests passed');
}

run();
