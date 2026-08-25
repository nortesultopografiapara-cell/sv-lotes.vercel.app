/**
 * Workspace desktop — Editar venda (somente UI).
 * npx tsx scripts/mandatory-gis-sale-edit-workspace-desktop-tests.ts
 *
 * Cenários: à vista, parcelado, cliente completo, com/sem cônjuge,
 * corretor, comissão, conta financeira, desconto, balões,
 * Cancelar, Salvar, abas Dados/Cobranças/Capa do Carnê/Documentos,
 * sidebar recolhe e restaura. Homologação 1920x1080 e 1366x768.
 * Mobile empilhado intacto.
 */
import fs from 'node:fs';
import path from 'node:path';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function testEditDesktopFlagAndTitle() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const css = read('app/mobile-layout.css');

  assert(modal.includes('isSaleEditWorkspaceDesktop = isWideDesktop && isEditMode'), 'flag edit só em desktop largo');
  assert(modal.includes('isSaleFormWorkspaceDesktop'), 'create e edit compartilham o mesmo form workspace');
  assert(
    modal.includes('isSaleWorkspaceDesktop || isSaleEditWorkspaceDesktop'),
    'edit reutiliza o workspace da Nova Venda',
  );
  assert(modal.includes("? 'Editar venda'"), 'título desktop Editar venda');
  assert(modal.includes("'Editar Venda do Lote'"), 'título mobile antigo preservado');
  assert(modal.includes('sv-modal-shell--sale-workspace'), 'mesmo shell da Nova Venda');
  assert(css.includes('1480px'), 'largura até ~1480px em 1920');
  assert(css.includes('88vh'), 'altura limitada ao viewport');
  assert(css.includes('900px'), 'teto de altura 900px');
  assert(css.includes('1920x1080'), 'homologação 1920x1080');
  assert(css.includes('1366x768'), 'homologação 1366x768');
  assert(css.includes('minmax(0, 1.65fr) minmax(360px, 1fr)'), '2 colunas ~62/38 da Nova Venda');
  console.log('OK testEditDesktopFlagAndTitle');
}

function testSameFormNotDuplicated() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const gis = read('components/map/GISMap.tsx');
  const formCount = (modal.match(/id="customer-lot-form"/g) || []).length;
  assert(formCount === 1, 'um único formulário customer-lot-form');
  assert(modal.includes("mode = 'create'"), 'mode create/edit no mesmo modal');
  assert(gis.includes('mode={customerForm.mode}'), 'GIS continua passando mode existente');
  assert(!modal.includes('EditSaleForm'), 'sem segundo formulário de edição');
  assert(!modal.includes('SaleEditWorkspaceModal'), 'sem modal paralelo de edição');
  console.log('OK testSameFormNotDuplicated');
}

function testTwoColumnEditLayout() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes('isSaleFormWorkspaceDesktop ? "sv-sale-workspace-grid"'), 'edit desktop usa grid da venda');
  assert(modal.includes('sv-sale-workspace-col-client'), 'coluna Cliente à esquerda');
  assert(modal.includes('sv-sale-workspace-col-sale'), 'coluna Dados da venda à direita');
  assert(modal.includes('? "Cliente" : "DADOS DO CLIENTE"'), 'bloco Cliente');
  assert(modal.includes('Possui Cônjuge'), 'checkbox cônjuge');
  assert(modal.includes('sv-sale-workspace-spouse-compact'), 'cônjuge desmarcado compacto');
  assert(modal.includes('? "Dados do cônjuge" : "DADOS DO CÔNJUGE"'), 'cônjuge expande abaixo do cliente');
  assert(modal.includes('? "Dados da venda" : "DADOS DA VENDA"'), 'coluna Dados da venda');
  assert(modal.includes('sv-sale-workspace-card--sale'), 'card da venda à direita');
  assert(!modal.includes('sv-sale-workspace-col-spouse'), 'sem terceira coluna de cônjuge');
  console.log('OK testTwoColumnEditLayout');
}

function testHeaderStatusAndValue() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes('isSaleEditWorkspaceDesktop'), 'header específico de edição desktop');
  assert(modal.includes('lot.status || actionName'), 'status da venda no header');
  assert(modal.includes('formatCurrencyBRL(finalValue)'), 'valor atual no header da edição');
  assert(modal.includes('VALOR DO LOTE'), 'Nova venda continua com VALOR DO LOTE');
  assert(modal.includes('<X className="w-5 h-5" />'), 'X no canto superior');
  console.log('OK testHeaderStatusAndValue');
}

function testEditTabsPreservedAndPinned() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes("setActiveTab('dados')"), 'aba Dados');
  assert(modal.includes("setActiveTab('cobrancas')"), 'aba Cobranças');
  assert(modal.includes("setActiveTab('capa_carne')"), 'aba Capa do Carnê');
  assert(modal.includes("setActiveTab('documentos')"), 'aba Documentos da Venda');
  assert(modal.includes('Documentos da Venda'), 'rótulo Documentos da Venda');
  assert(modal.includes('SaleDocumentsPanel'), 'painel documentos intacto');
  assert(modal.includes('SaleChargesPanel'), 'painel cobranças intacto');
  assert(modal.includes('SaleCarneCoverPanel'), 'painel capa do carnê intacto');
  assert(modal.includes("renderEditTabs('shell')"), 'abas fixas fora do body no desktop');
  assert(modal.includes("renderEditTabs('body')"), 'abas no body no mobile');
  assert(modal.includes('isEditMode && saleId'), 'Documentos/Cobranças/Capa só com venda existente');
  console.log('OK testEditTabsPreservedAndPinned');
}

function testExistingSaleFieldsPreserved() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const labels = [
    'Nome Completo',
    'CPF / CNPJ',
    'RG',
    'Órgão emissor',
    'UF emissor',
    'Telefone',
    'E-mail',
    'Profissão',
    'Estado Civil',
    'Endereço',
    'Bairro',
    'Cidade',
    'CEP',
    'Valor do Lote',
    'Valor do Desconto',
    'Valor Final',
    'Forma de Pagamento',
    'Valor da Entrada',
    'Valor da Parcela',
    'Correção das Parcelas',
    'Conta recebedora / Conta financeira',
    'Corretor',
    'Observações',
  ];
  for (const label of labels) {
    assert(modal.includes(label), `campo/label preservado: ${label}`);
  }
  assert(modal.includes('InstallmentsCountCombobox'), 'quantidade de parcelas intacta');
  assert(modal.includes("payment_type: 'À vista'"), 'venda à vista intacta');
  assert(modal.includes('PAYMENT_TYPE_INSTALLMENT'), 'venda parcelada intacta');
  assert(modal.includes('use_balloon_installments'), 'balões intactos');
  assert(modal.includes('broker_id'), 'corretor intacto');
  assert(modal.includes('sale_commission_mode'), 'comissão intacta');
  assert(modal.includes('financial_account_id'), 'conta financeira intacta');
  assert(modal.includes('discount_value'), 'desconto intacto');
  assert(modal.includes('has_spouse'), 'cônjuge intacto');
  assert(modal.includes('down_payment'), 'entrada intacta');
  console.log('OK testExistingSaleFieldsPreserved');
}

function testBannerRemovedAndFooterSticky() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(
    !modal.includes('Dados da venda carregados para edição.'),
    'caixa verde de edição removida',
  );
  assert(modal.includes('sv-modal-footer sticky'), 'rodapé sticky');
  assert(modal.includes("'Salvar alterações'"), 'Salvar alterações no desktop');
  assert(modal.includes("'Salvar'"), 'Salvar no mobile');
  assert(modal.includes('Cancelar'), 'Cancelar visível');
  assert(modal.includes('onClick={onClose}'), 'Cancelar/X restauram via onClose');
  console.log('OK testBannerRemovedAndFooterSticky');
}

function testSidebarChromeReusedWithoutPreference() {
  const layout = read('components/Layout.tsx');
  const chrome = read('lib/saleWorkspaceChrome.ts');
  const modal = read('components/map/CustomerLotFormModal.tsx');

  assert(chrome.includes('SALE_WORKSPACE_CHROME_EVENT'), 'mesmo evento de chrome');
  assert(!chrome.includes('localStorage'), 'chrome não grava preferência');
  assert(modal.includes('setSaleWorkspaceChromeOpen(isWorkspaceDesktop)'), 'recolhe sidebar no edit desktop');
  assert(modal.includes('setSaleWorkspaceChromeOpen(false)'), 'restaura ao fechar/cancelar/salvar');
  assert(!modal.includes('localStorage'), 'modal não grava preferência de sidebar');
  assert(layout.includes("w-[72px]"), 'rail compacta ~72px');
  console.log('OK testSidebarChromeReusedWithoutPreference');
}

function testMobileEditUnchanged() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes('sv-modal-shell--full-mobile'), 'full-mobile preservado');
  assert(
    modal.includes('isSaleFormWorkspaceDesktop ? "sv-sale-workspace-grid" : isReservationWorkspaceDesktop ? "sv-reservation-workspace-grid" : "space-y-6"'),
    'mobile permanece empilhado',
  );
  assert(
    modal.includes('isWorkspaceDesktop ? "sv-sale-workspace-col-client" : "contents"'),
    'mobile não ganha coluna extra',
  );
  assert(modal.includes("'Editar Venda do Lote'"), 'título mobile antigo intacto');
  assert(modal.includes("isWideDesktop && isEditMode"), 'workspace edit não aplica abaixo de 1024px');
  console.log('OK testMobileEditUnchanged');
}

function testBusinessRulesUntouched() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const gis = read('components/map/GISMap.tsx');
  assert(modal.includes('handleSubmit'), 'submit original');
  assert(modal.includes("await onConfirm("), 'persistência continua via onConfirm');
  const modalPersist = modal.slice(modal.indexOf('const handleSubmit'));
  assert(!modalPersist.includes('.insert('), 'submit do modal não insere no banco');
  assert(!modalPersist.includes('.update('), 'submit do modal não atualiza o banco');
  assert(gis.includes('mode={customerForm.mode}'), 'GISMap não ganhou formulário novo');
  assert(gis.includes('LotHistoryPanel'), 'Histórico do lote intacto no GIS');
  assert(!modal.includes('LotHistoryPanel'), 'editar venda não toca Histórico');
  assert(!modal.includes('finance_receipts'), 'sem reescrita de finance_receipts no modal');
  console.log('OK testBusinessRulesUntouched');
}

function testNoMigrationOrProduction() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const css = read('app/mobile-layout.css');
  const layout = read('components/Layout.tsx');
  const chrome = read('lib/saleWorkspaceChrome.ts');
  const joined = modal + css + layout + chrome;
  assert(!joined.includes('aezktedncttwpqeunjej'), 'não aponta Production');
  assert(!joined.includes('create table'), 'sem SQL de schema');
  console.log('OK testNoMigrationOrProduction');
}

function run() {
  testEditDesktopFlagAndTitle();
  testSameFormNotDuplicated();
  testTwoColumnEditLayout();
  testHeaderStatusAndValue();
  testEditTabsPreservedAndPinned();
  testExistingSaleFieldsPreserved();
  testBannerRemovedAndFooterSticky();
  testSidebarChromeReusedWithoutPreference();
  testMobileEditUnchanged();
  testBusinessRulesUntouched();
  testNoMigrationOrProduction();
  console.log('OK — mandatory-gis-sale-edit-workspace-desktop-tests passed');
}

run();
