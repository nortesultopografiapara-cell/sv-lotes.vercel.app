/**
 * Workspace desktop — Nova reserva (somente UI).
 * npx tsx scripts/mandatory-gis-reservation-workspace-desktop-tests.ts
 *
 * Cenários: sem/com cônjuge, sem/com sinal, cliente novo/existente,
 * cancelar, confirmar. Homologação 1920x1080 e 1366x768.
 */
import fs from 'node:fs';
import path from 'node:path';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function testReservationDesktopFlagAndShell() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const css = read('app/mobile-layout.css');

  assert(modal.includes('isReservationWorkspaceDesktop'), 'flag desktop + create + Reservado');
  assert(
    modal.includes("isWideDesktop && !isEditMode && actionName === 'Reservado'"),
    'reserva workspace só em create Reservado',
  );
  assert(
    modal.includes('isSaleFormWorkspaceDesktop || isReservationWorkspaceDesktop'),
    'chrome compartilhado com a venda',
  );
  assert(modal.includes("? 'Nova reserva'"), 'título Nova reserva no desktop');
  assert(modal.includes('sv-modal-shell--reservation-workspace'), 'shell da reserva');
  assert(css.includes('sv-modal-shell--reservation-workspace'), 'CSS do shell reserva');
  assert(css.includes('1380px'), 'largura até ~1380px');
  assert(css.includes('minmax(0, 1.7fr) minmax(360px, 1fr)'), '2 colunas ~64/36');
  assert(css.includes('1920x1080'), 'homologação 1920x1080');
  assert(css.includes('1366x768'), 'homologação 1366x768');
  assert(css.includes('88vh'), 'altura limitada ao viewport');
  assert(css.includes('900px'), 'teto de altura 900px');
  assert(modal.includes('VALOR DO LOTE'), 'valor do lote no header');
  assert(modal.includes('sv-sale-workspace-header'), 'header compacto reutilizado');
  console.log('OK testReservationDesktopFlagAndShell');
}

function testTwoColumnReservationLayout() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const css = read('app/mobile-layout.css');

  assert(modal.includes('sv-reservation-workspace-grid'), 'grid próprio da reserva');
  assert(modal.includes('sv-sale-workspace-col-client'), 'Cliente à esquerda');
  assert(modal.includes('sv-reservation-workspace-col-data'), 'Dados da reserva à direita');
  assert(
    modal.includes('? "Dados da reserva" : "SINAL DA RESERVA"'),
    'título desktop vs mobile do card',
  );
  assert(
    /grid-column:\s*1;\s*grid-row:\s*1/.test(css),
    'Cliente pinado na coluna 1 / row 1',
  );
  assert(
    css.includes('.sv-reservation-workspace-col-data'),
    'coluna de dados da reserva explícita',
  );
  const dataRule = css.slice(
    css.indexOf('.sv-reservation-workspace-col-data'),
    css.indexOf('.sv-reservation-workspace-col-data') + 180,
  );
  assert(/grid-column:\s*2/.test(dataRule), 'reserva pinada na coluna 2');
  assert(/grid-row:\s*1/.test(dataRule), 'reserva pinada na row 1');
  assert(modal.includes('sv-sale-ws-row--docs'), 'CPF/RG/órgão/UF em linha');
  assert(modal.includes('sv-sale-ws-row--contact'), 'Telefone/E-mail');
  assert(modal.includes('sv-sale-ws-row--city'), 'Bairro/Cidade/UF/CEP');
  console.log('OK testTwoColumnReservationLayout');
}

function testReservationGridNotOverriddenToBlock() {
  const css = read('app/mobile-layout.css');
  const mediaIdx = css.indexOf('@media (min-width: 1024px)');
  const cols = 'minmax(0, 1.7fr) minmax(360px, 1fr)';
  const colsInMedia = css.indexOf(cols, mediaIdx);
  assert(mediaIdx >= 0, 'media 1024px existe');
  assert(colsInMedia > mediaIdx, '2 colunas da reserva estão DENTRO do 1024px');

  const firstRule = css.indexOf('.sv-reservation-workspace-grid {');
  const firstBlock = css.slice(firstRule, firstRule + 80);
  assert(/display:\s*block/.test(firstBlock), 'display:block só como default antes do 1024px');
  assert(firstRule < mediaIdx, 'default block da reserva precede o media 1024px');

  const gridInMedia = css.indexOf('.sv-reservation-workspace-grid {', mediaIdx);
  const gridSnippet = css.slice(gridInMedia, gridInMedia + 220);
  assert(/display:\s*grid/.test(gridSnippet), 'display:grid da reserva no 1024px');
  console.log('OK testReservationGridNotOverriddenToBlock');
}

function testSpouseStaysInLeftColumn() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes('Possui Cônjuge'), 'checkbox cônjuge');
  assert(modal.includes('sv-sale-workspace-spouse-compact'), 'linha compacta sem cônjuge');
  assert(modal.includes('isReservationWorkspaceDesktop'), 'cônjuge disponível no desktop da reserva');
  assert(
    modal.includes("actionName === 'Vendido' || isEditMode || isReservationWorkspaceDesktop"),
    'cônjuge na reserva só no workspace desktop; mobile reserva intacto',
  );
  assert(modal.includes('? "Dados do cônjuge" : "DADOS DO CÔNJUGE"'), 'cônjuge expande na esquerda');
  assert(!modal.includes('sv-reservation-workspace-col-spouse'), 'sem coluna própria de cônjuge');
  console.log('OK testSpouseStaysInLeftColumn');
}

function testExistingReservationFieldsOnly() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes('signal_amount'), 'valor do sinal existente');
  assert(modal.includes('signal_date'), 'data do sinal existente');
  assert(modal.includes('signal_payment_method'), 'forma de pagamento existente');
  assert(modal.includes('signal_notes'), 'observações existentes');
  assert(modal.includes('Valor do sinal (R$)'), 'label valor do sinal');
  assert(modal.includes('Data do sinal'), 'label data do sinal');
  assert(modal.includes('Forma de pagamento'), 'label forma de pagamento');
  assert(modal.includes('Observações'), 'label observações');
  assert(!modal.includes('Validade da reserva'), 'não cria validade da reserva');
  assert(!modal.includes('reservation_expires_at'), 'expiração permanece no persist GIS, não no form');
  console.log('OK testExistingReservationFieldsOnly');
}

function testLotValuePresentationOnly() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const cardIdx = modal.indexOf('sv-reservation-workspace-col-data');
  const snippet = modal.slice(cardIdx, cardIdx + 1200);
  assert(snippet.includes('Valor do lote'), 'resumo visual no card direito');
  assert(snippet.includes('formatCurrencyBRL(price)'), 'usa o price já existente');
  assert(!snippet.includes('setField({ lot_value'), 'não persiste valor paralelo');
  console.log('OK testLotValuePresentationOnly');
}

function testCustomerSearchAndCreate() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes('CustomerSearchPicker'), 'busca de cliente existente');
  assert(modal.includes('showCreateNewButton={false}'), 'sem Cadastrar novo cliente redundante');
  assert(modal.includes('compact={isWorkspaceDesktop}'), 'picker compacto no desktop');
  console.log('OK testCustomerSearchAndCreate');
}

function testFooterCancelConfirm() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes('sv-modal-footer sticky'), 'rodapé sticky');
  assert(modal.includes('Confirmar Reserva'), 'Confirmar Reserva visível');
  assert(modal.includes("actionName === 'Reservado' ? 'bg-yellow-500"), 'botão amarelo/dourado');
  assert(modal.includes("onClick={onClose}"), 'Cancelar usa onClose original');
  assert(modal.includes('form="customer-lot-form"'), 'Confirmar usa submit original');
  assert(modal.includes('handleSubmit'), 'callback de submit intacto');
  console.log('OK testFooterCancelConfirm');
}

function testSidebarChromeReused() {
  const layout = read('components/Layout.tsx');
  const chrome = read('lib/saleWorkspaceChrome.ts');
  const modal = read('components/map/CustomerLotFormModal.tsx');

  assert(chrome.includes('SALE_WORKSPACE_CHROME_EVENT'), 'reutiliza evento da venda');
  assert(!chrome.includes('localStorage'), 'não persiste preferência');
  assert(modal.includes('setSaleWorkspaceChromeOpen(isWorkspaceDesktop)'), 'abre rail na reserva desktop');
  assert(modal.includes('setSaleWorkspaceChromeOpen(false)'), 'restaura ao cancelar/fechar/concluir');
  assert(layout.includes('SALE_WORKSPACE_CHROME_EVENT'), 'Layout inalterado — mesmo listener');
  assert(layout.includes("w-[72px]"), 'rail ~72px');
  console.log('OK testSidebarChromeReused');
}

function testMobileReservationUnchanged() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(modal.includes('sv-modal-shell--full-mobile'), 'full-mobile preservado');
  assert(
    modal.includes('isReservationWorkspaceDesktop ? "sv-reservation-workspace-grid" : "space-y-6"'),
    'mobile reserva permanece empilhado',
  );
  assert(
    modal.includes('isWorkspaceDesktop ? "sv-sale-workspace-col-client" : "contents"'),
    'mobile não ganha coluna extra',
  );
  assert(
    modal.includes(': "space-y-4 bg-amber-50 p-4 rounded-lg border border-amber-100"'),
    'card âmbar empilhado no mobile',
  );
  assert(modal.includes('SINAL DA RESERVA'), 'título mobile SINAL DA RESERVA permanece');
  console.log('OK testMobileReservationUnchanged');
}

function testSaleWorkspaceUntouched() {
  const css = read('app/mobile-layout.css');
  const modal = read('components/map/CustomerLotFormModal.tsx');
  assert(css.includes('minmax(0, 1.65fr) minmax(360px, 1fr)'), 'grid da venda homologada intacto');
  assert(css.includes('1480px'), 'largura da venda homologada intacta');
  assert(
    modal.includes("isWideDesktop && !isEditMode && actionName === 'Vendido'"),
    'flag da venda intacta',
  );
  assert(modal.includes("? 'Nova venda'"), 'título Nova venda intacto');
  assert(modal.includes('Confirmar Venda'), 'Confirmar Venda intacto');
  console.log('OK testSaleWorkspaceUntouched');
}

function testBusinessRulesUntouched() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const gis = read('components/map/GISMap.tsx');
  assert(modal.includes('handleSubmit'), 'submit original');
  assert(gis.includes('queueOfflineReservation'), 'reserva offline intacta');
  assert(gis.includes('reservation_expires_at'), 'validade 48h permanece no GIS');
  assert(gis.includes('signal_amount: signalAmount'), 'sinal persiste como antes');
  assert(gis.includes('reservation_logs'), 'reservation_logs intacto');
  assert(modal.includes("await onConfirm("), 'persistência continua via onConfirm');
  assert(gis.includes("from(\"blocks\")"), 'update do lote permanece no GISMap');
  const modalPersist = modal.slice(modal.indexOf('const handleSubmit'));
  assert(!modalPersist.includes(".insert("), 'submit do modal não insere no banco');
  assert(!modalPersist.includes(".update("), 'submit do modal não atualiza o banco');
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
  testReservationDesktopFlagAndShell();
  testTwoColumnReservationLayout();
  testReservationGridNotOverriddenToBlock();
  testSpouseStaysInLeftColumn();
  testExistingReservationFieldsOnly();
  testLotValuePresentationOnly();
  testCustomerSearchAndCreate();
  testFooterCancelConfirm();
  testSidebarChromeReused();
  testMobileReservationUnchanged();
  testSaleWorkspaceUntouched();
  testBusinessRulesUntouched();
  testNoMigrationOrProduction();
  console.log('OK — mandatory-gis-reservation-workspace-desktop-tests passed');
}

run();
