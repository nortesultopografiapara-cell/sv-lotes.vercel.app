/**
 * Assistente SV — Fase 1D (FAB nos modais + contexto real do contrato).
 * npx tsx scripts/mandatory-assistant-sv-fase-1d-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { ASSISTANT_CONTINUE_OFFER } from '../lib/assistant/constants';
import { composeFromValidatedUi } from '../lib/assistant/composeFromUi';
import { buildSafeAssistantContext } from '../lib/assistant/context';
import { hydrateAssistantUiContext, type AssistantEntityLoaders } from '../lib/assistant/hydrateUiContext';
import { localGroundedProvider } from '../lib/assistant/model/localGroundedProvider';
import { assertPackedContextHasNoPii, packAssistantContext } from '../lib/assistant/model/packKnowledge';
import { runAssistantPipeline } from '../lib/assistant/pipeline';
import {
  EMPTY_ASSISTANT_UI_STATE,
  sanitizeUuidHint,
  scopeAssistantHintsToRoute,
  type AssistantUiSafeState,
} from '../lib/assistant/uiSnapshot';
import type { AssistantAskInput, AssistantSafeContext } from '../lib/assistant/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const PROJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LOT_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONTRACT_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CONTRACT_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CONTRACT_COMPANY = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const localDeps = { primary: localGroundedProvider, fallback: localGroundedProvider };

function withUi(
  pathname: string,
  ui: Partial<AssistantUiSafeState>,
  extras?: { projectName?: string | null; contractModel?: string | null },
): AssistantSafeContext {
  return buildSafeAssistantContext({
    pathname,
    role: 'ADMIN',
    tenantName: 'Empresa Homologada',
    projectName: extras?.projectName ?? ui.projectName ?? null,
    contractModel: extras?.contractModel ?? ui.contractModel ?? null,
    ui: { ...EMPTY_ASSISTANT_UI_STATE, ...ui },
  });
}

async function ask(input: AssistantAskInput) {
  return runAssistantPipeline(input, localDeps);
}

function mockLoaders(): AssistantEntityLoaders {
  return {
    async loadProject(id) {
      if (id === PROJECT_A) {
        return { id: PROJECT_A, tenantId: TENANT_A, name: 'Chacreamento Mundo Novo', contractModel: 'MUNDO_NOVO' };
      }
      if (id === PROJECT_C) {
        return { id: PROJECT_C, tenantId: TENANT_A, name: 'Empreendimento B', contractModel: 'PADRAO' };
      }
      return null;
    },
    async loadLot(id) {
      if (id === LOT_A) {
        return {
          id: LOT_A,
          tenantId: TENANT_A,
          projectId: PROJECT_A,
          blockNumber: '03',
          lotNumber: '59',
          status: 'Disponível',
        };
      }
      return null;
    },
    async loadContract(id) {
      if (id === CONTRACT_A) {
        return {
          id: CONTRACT_A,
          tenantId: TENANT_A,
          companyId: TENANT_A,
          contractNumber: 'MN-0042',
          status: 'ativo',
          signatureStatus: null,
          needsRegenerar: false,
          projectName: 'Chacreamento Mundo Novo',
          contractModel: 'MUNDO_NOVO',
          partyTotal: 0,
          partySigned: 0,
          pendingExternal: 0,
          pendingInternalVendor: false,
          pendingPartyRoles: [],
          eSignStarted: false,
        };
      }
      if (id === CONTRACT_B) {
        return {
          id: CONTRACT_B,
          tenantId: TENANT_B,
          companyId: TENANT_B,
          contractNumber: 'XX-9999',
          status: 'ativo',
          signatureStatus: 'PENDING',
          needsRegenerar: false,
          projectName: 'Outro Tenant',
          contractModel: 'PADRAO',
          partyTotal: 2,
          partySigned: 0,
          pendingExternal: 2,
          pendingInternalVendor: false,
          pendingPartyRoles: ['BUYER'],
          eSignStarted: true,
        };
      }
      if (id === CONTRACT_COMPANY) {
        return {
          id: CONTRACT_COMPANY,
          tenantId: TENANT_B,
          companyId: TENANT_A,
          contractNumber: '000000019/2026',
          status: 'ativo',
          signatureStatus: null,
          needsRegenerar: false,
          projectName: 'Chacreamento Mundo Novo',
          contractModel: 'MUNDO_NOVO',
          partyTotal: 0,
          partySigned: 0,
          pendingExternal: 0,
          pendingInternalVendor: false,
          pendingPartyRoles: [],
          eSignStarted: false,
        };
      }
      return null;
    },
  };
}

function testFabAccessibleOverModal() {
  const chrome = read('components/assistant/AssistantChrome.tsx');
  const fab = read('components/assistant/AssistantOverlayFab.tsx');
  const css = read('app/theme-tokens.css');
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const panel = read('components/assistant/AssistantPanel.tsx');
  assert(chrome.includes('AssistantOverlayFab'), 'chrome sem FAB');
  assert(fab.includes('data-testid="assistant-sv-overlay-fab"'), 'FAB sem testid');
  assert(fab.includes('saleFormOpen') && fab.includes('saleEditOpen'), 'FAB só com modal operacional');
  assert(css.includes('z-index: 1100'), 'FAB acima do modal 1000');
  assert(css.includes('sv-assistant-root--over-modal'), 'painel sobre o modal');
  assert(css.includes('z-index: 1200'), 'painel acima do FAB');
  assert(modal.includes('z-[1000]'), 'modal operacional permanece 1000');
  assert(panel.includes('sv-assistant-root--over-modal'), 'painel sobe o z-index só quando o modal está aberto');
  assert(!panel.includes('onClose()') && !panel.includes('onConfirm('), 'painel não fecha/confirma a venda');
  console.log('OK testFabAccessibleOverModal');
}

function testOpeningAssistantDoesNotResetForm() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const fab = read('components/assistant/AssistantOverlayFab.tsx');
  assert(modal.includes('AssistantSaleUiBridge'), 'bridge no formulário');
  assert(!modal.includes('setOpen(false)'), 'modal não fecha o assistente resetando o form');
  assert(fab.includes('setOpen(true)'), 'FAB só abre o painel');
  assert(!fab.includes('onClose'), 'FAB não fecha Nova venda');
  assert(modal.includes('useState<LotFormState>'), 'estado do form permanece no modal');
  console.log('OK testOpeningAssistantDoesNotResetForm');
}

async function testNoCustomerOrientsClient() {
  const context = withUi('/map', {
    saleFormOpen: true,
    customerSelected: false,
    projectName: 'Chacreamento Mundo Novo',
    blockNumber: '03',
    lotNumber: '59',
  });
  const result = await ask({ question: 'O que faço agora?', context });
  assert(/cliente/i.test(result.text), result.text);
  assert(!/Abra Contratos/i.test(result.text), result.text);
  assert(!/Mapa GIS →/.test(result.text), result.text);
  console.log('OK testNoCustomerOrientsClient');
}

async function testCustomerSelectedAdvances() {
  const context = withUi('/map', {
    saleFormOpen: true,
    customerSelected: true,
    projectName: 'Chacreamento Mundo Novo',
    blockNumber: '03',
    lotNumber: '59',
  });
  const result = await ask({ question: 'O que faço agora?', context });
  assert(/Forma de Pagamento/i.test(result.text), result.text);
  assert(!/busque ou cadastre o cliente/i.test(result.text), result.text);
  console.log('OK testCustomerSelectedAdvances');
}

async function testParceladoPendingFields() {
  const context = withUi('/map', {
    saleFormOpen: true,
    customerSelected: true,
    paymentMode: 'parcelado',
    installmentsFilled: false,
    firstDueFilled: false,
  });
  const result = await ask({ question: 'O que faço agora?', context });
  assert(/quantidade de parcelas/i.test(result.text), result.text);
  assert(!/selecione o cliente/i.test(result.text), result.text);

  const withCount = withUi('/map', {
    saleFormOpen: true,
    customerSelected: true,
    paymentMode: 'parcelado',
    installmentsFilled: true,
    firstDueFilled: false,
  });
  const next = await ask({ question: 'O que faço agora?', context: withCount });
  assert(/primeiro vencimento/i.test(next.text), next.text);
  console.log('OK testParceladoPendingFields');
}

async function testGeneratedContractWithoutSignature() {
  const context = withUi(
    '/contracts',
    {
      contractId: CONTRACT_A,
      contractNumber: 'MN-0042',
      contractStatus: 'ativo',
      eSignStarted: false,
      partyTotal: 0,
      partySigned: 0,
      pendingExternal: 0,
      nextAction: 'Enviar para assinatura',
      projectName: 'Chacreamento Mundo Novo',
    },
    { projectName: 'Chacreamento Mundo Novo', contractModel: 'MUNDO_NOVO' },
  );
  const result = await ask({ question: 'O que falta neste contrato?', context });
  assert(/já está gerado/i.test(result.text) || /não foi enviado para assinatura/i.test(result.text), result.text);
  assert(/Enviar para assinatura/.test(result.text), result.text);
  assert(!/Abra Contratos/.test(result.text), `não deve navegar: ${result.text}`);
  assert(!/localize o contrato/.test(result.text), result.text);
  assert(!/menu lateral/.test(result.text), result.text);
  console.log('OK testGeneratedContractWithoutSignature');
}

async function testPartiallySignedContract() {
  const context = withUi('/contracts', {
    contractId: CONTRACT_A,
    contractStatus: 'ativo',
    eSignStarted: true,
    signatureStatus: 'PENDING',
    partyTotal: 4,
    partySigned: 2,
    pendingExternal: 2,
    pendingPartyRoles: ['BUYER', 'SPOUSE'],
    nextAction: 'Acompanhar assinaturas',
  });
  const result = await ask({ question: 'O que falta neste contrato?', context });
  assert(/2 assinatura/.test(result.text), result.text);
  assert(/Acompanhar assinaturas/.test(result.text), result.text);
  assert(!/Abra Contratos/.test(result.text), result.text);
  console.log('OK testPartiallySignedContract');
}

async function testLfWaitingInternalVendor() {
  const context = withUi(
    '/contracts',
    {
      contractId: CONTRACT_A,
      contractStatus: 'ativo',
      eSignStarted: true,
      signatureStatus: 'CLIENT_SIGNED',
      partyTotal: 3,
      partySigned: 2,
      pendingExternal: 0,
      pendingInternalVendor: true,
      pendingPartyRoles: ['VENDOR_INTERNAL'],
      nextAction: 'Assinar promitente vendedor',
    },
    { contractModel: 'ESTRELA_DO_SUL' },
  );
  const result = await ask({ question: 'O que falta neste contrato?', context });
  assert(/LF Imóveis/i.test(result.text), result.text);
  assert(/Assinar promitente vendedor/.test(result.text), result.text);
  assert(/Administrador Principal/.test(result.text), result.text);
  assert(!/Abra Contratos/.test(result.text), result.text);
  console.log('OK testLfWaitingInternalVendor');
}

async function testForeignContractDiscarded() {
  const { ui, rejectedForeignTenant } = await hydrateAssistantUiContext({
    tenantId: TENANT_A,
    hints: { contractId: CONTRACT_B },
    loaders: mockLoaders(),
  });
  assert(rejectedForeignTenant, 'contrato de outro tenant deve ser rejeitado');
  assert(ui.contractId === null, 'não hidratar contrato estrangeiro');
  assert(ui.contractNumber === null, 'não vazar número');
  const packed = packAssistantContext(withUi('/contracts', ui));
  assert(!packed.includes('Outro Tenant'), 'sem nome de outro tenant');
  assert(!packed.includes('XX-9999'), packed);
  console.log('OK testForeignContractDiscarded');
}

async function testNoPiiInProvider() {
  const context = withUi('/contracts', {
    contractId: CONTRACT_A,
    contractNumber: 'MN-0042',
    contractStatus: 'ativo',
    eSignStarted: true,
    pendingPartyRoles: ['BUYER', 'VENDOR_INTERNAL'],
    partyTotal: 3,
    partySigned: 1,
    customerSelected: true,
  });
  const packed = packAssistantContext(context);
  assert(assertPackedContextHasNoPii(packed), packed);
  assert(!packed.includes(CONTRACT_A), 'sem UUID de contrato');
  assert(!/\bcpf\b/i.test(packed), packed);
  const composed = composeFromValidatedUi({
    question: 'O que falta neste contrato?',
    context,
  });
  assert(composed != null, 'deve responder pelo estado');
  assert(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(composed || ''), composed || '');
  console.log('OK testNoPiiInProvider');
}

async function testStaleSaleContextDoesNotContaminateContracts() {
  const context = withUi(
    '/contracts',
    {
      saleFormOpen: true,
      customerSelected: true,
      paymentMode: 'parcelado',
      installmentsFilled: true,
      lotModalOpen: true,
      blockNumber: '03',
      lotNumber: '59',
      lotStatus: 'Disponível',
      contractId: CONTRACT_A,
      contractNumber: '000000013/2026',
      contractStatus: 'ativo',
      eSignStarted: false,
      partyTotal: 0,
      partySigned: 0,
      pendingExternal: 0,
      nextAction: 'Enviar para assinatura',
      projectName: 'Chacreamento Mundo Novo',
    },
    { projectName: 'Chacreamento Mundo Novo', contractModel: 'MUNDO_NOVO' },
  );
  assert(context.ui.saleFormOpen === false, 'saleFormOpen residual não sobrevive em /contracts');
  assert(context.ui.customerSelected === false, 'cliente da venda não é estado atual em Contratos');
  assert(context.ui.lotNumber === null, 'lote da venda não é estado atual em Contratos');
  assert(context.ui.contractId === CONTRACT_A, 'contrato da rota atual permanece');

  const result = await ask({
    question: 'O que falta neste contrato?',
    context,
    history: [
      { role: 'user', text: 'O que faço agora?' },
      {
        role: 'assistant',
        text: 'Busque ou cadastre o cliente nesta operação. Depois escolha a forma de pagamento.',
      },
      { role: 'user', text: 'O que faço agora?' },
      {
        role: 'assistant',
        text: 'Em Forma de Pagamento, escolha À vista ou Parcelado e confira os valores antes de Confirmar Venda.',
      },
    ],
  });
  assert(/já está gerado/i.test(result.text) || /não foi enviado para assinatura/i.test(result.text), result.text);
  assert(/Enviar para assinatura/.test(result.text), result.text);
  assert(!/fechamento da venda/i.test(result.text), result.text);
  assert(!/Forma de Pagamento/i.test(result.text), result.text);
  assert(!/Confirmar Venda/i.test(result.text), result.text);
  assert(!/busque ou cadastre o cliente/i.test(result.text), result.text);
  console.log('OK testStaleSaleContextDoesNotContaminateContracts');
}

async function testStaleContractDoesNotContaminateMap() {
  const context = withUi('/map', {
    contractId: CONTRACT_A,
    contractStatus: 'ativo',
    eSignStarted: false,
    nextAction: 'Enviar para assinatura',
    lotModalOpen: true,
    activeLotTab: 'comercial',
    blockNumber: '03',
    lotNumber: '59',
    projectName: 'Chacreamento Mundo Novo',
  });
  assert(context.ui.contractId === null, 'contrato da tela anterior não permanece no GIS');
  const result = await ask({
    question: 'O que faço para vender este lote?',
    context,
    history: [
      { role: 'user', text: 'O que falta neste contrato?' },
      { role: 'assistant', text: 'O próximo passo é clicar em Enviar para assinatura.' },
    ],
  });
  assert(/Vender/i.test(result.text), result.text);
  assert(!/Enviar para assinatura/.test(result.text), result.text);
  console.log('OK testStaleContractDoesNotContaminateMap');
}

async function testClosedLotModalDropsOperationalFlags() {
  const context = withUi('/map', {
    lotModalOpen: false,
    saleFormOpen: false,
    customerSelected: true,
    paymentMode: 'parcelado',
    blockNumber: '03',
    lotNumber: '59',
    activeLotTab: 'comercial',
  });
  assert(context.ui.lotNumber === null, 'lote fechado não é estado atual');
  assert(context.ui.customerSelected === false, 'flags de formulário caem com o modal');
  assert(context.ui.saleFormOpen === false, 'formulário fechado');
  console.log('OK testClosedLotModalDropsOperationalFlags');
}

async function testStaleLotFromOtherProjectDiscarded() {
  const { ui, rejectedForeignTenant } = await hydrateAssistantUiContext({
    tenantId: TENANT_A,
    pathname: '/map',
    hints: {
      projectId: PROJECT_C,
      lotId: LOT_A,
      lotModalOpen: true,
      saleFormOpen: true,
      customerSelected: true,
      blockNumber: '03',
      lotNumber: '59',
    },
    loaders: mockLoaders(),
  });
  assert(!rejectedForeignTenant, 'mesmo tenant, projeto diferente');
  assert(ui.lotId === null, 'lote do projeto A não permanece no B');
  assert(ui.saleFormOpen === false, 'formulário do lote A não permanece no B');
  assert(ui.lotNumber === null, 'número do lote A descartado');
  console.log('OK testStaleLotFromOtherProjectDiscarded');
}

async function testHydrateContractsDropsSaleHints() {
  const { ui } = await hydrateAssistantUiContext({
    tenantId: TENANT_A,
    pathname: '/contracts',
    hints: {
      saleFormOpen: true,
      customerSelected: true,
      lotId: LOT_A,
      lotNumber: '59',
      contractId: CONTRACT_A,
    },
    loaders: mockLoaders(),
  });
  assert(ui.saleFormOpen === false, 'hydrate em /contracts descarta venda');
  assert(ui.lotNumber === null, 'hydrate em /contracts descarta lote');
  assert(ui.contractId === CONTRACT_A, 'contrato hidratado');
  assert(ui.eSignStarted === false, 'e-sign ainda não iniciada');
  console.log('OK testHydrateContractsDropsSaleHints');
}

async function testSelectedContractQuestionUsesHydratedState() {
  const context = withUi(
    '/contracts',
    {
      contractId: CONTRACT_A,
      contractStatus: 'ativo',
      eSignStarted: false,
      nextAction: 'Enviar para assinatura',
    },
    { projectName: 'Chacreamento Mundo Novo', contractModel: 'MUNDO_NOVO' },
  );
  const result = await ask({
    question: 'O que está faltando para finalizar esse contrato?',
    context,
  });
  assert(/já está gerado/i.test(result.text) || /não foi enviado para assinatura/i.test(result.text), result.text);
  assert(/Enviar para assinatura/.test(result.text), result.text);
  assert(!/nenhum contrato/i.test(result.text), result.text);
  assert(!/Selecione o contrato/i.test(result.text), result.text);
  assert(!/cliente/i.test(result.text), result.text);
  console.log('OK testSelectedContractQuestionUsesHydratedState');
}

async function testContractSelectionSwitchesImmediately() {
  const first = withUi('/contracts', {
    contractId: CONTRACT_A,
    contractStatus: 'ativo',
    eSignStarted: false,
    nextAction: 'Enviar para assinatura',
  });
  const second = withUi('/contracts', {
    contractId: CONTRACT_COMPANY,
    contractStatus: 'ativo',
    eSignStarted: true,
    pendingExternal: 2,
    partyTotal: 4,
    partySigned: 2,
    nextAction: 'Acompanhar assinaturas',
  });
  assert(first.ui.contractId === CONTRACT_A, 'contrato A na primeira seleção');
  assert(second.ui.contractId === CONTRACT_COMPANY, 'contrato B substitui A');
  const later = await ask({ question: 'O que falta neste contrato?', context: second });
  assert(/2 assinatura/.test(later.text), later.text);
  assert(!/Enviar para assinatura/.test(later.text), later.text);
  console.log('OK testContractSelectionSwitchesImmediately');
}

async function testDeselectContractClearsContext() {
  const selected = withUi('/contracts', {
    contractId: CONTRACT_A,
    eSignStarted: false,
    contractStatus: 'ativo',
  });
  assert(selected.ui.contractId === CONTRACT_A, 'selecionado');
  const cleared = withUi('/contracts', {
    contractId: null,
    eSignStarted: false,
  });
  assert(cleared.ui.contractId === null, 'deselecionar remove o contrato atual');
  const result = await ask({
    question: 'O que está faltando para finalizar esse contrato?',
    context: cleared,
  });
  assert(/Selecione o contrato/i.test(result.text), result.text);
  console.log('OK testDeselectContractClearsContext');
}

async function testCompanyIdMatchKeepsContract() {
  const { ui, rejectedForeignTenant } = await hydrateAssistantUiContext({
    tenantId: TENANT_A,
    pathname: '/contracts',
    hints: { contractId: CONTRACT_COMPANY },
    loaders: mockLoaders(),
  });
  assert(!rejectedForeignTenant, 'company_id da sessão deve autenticar o contrato');
  assert(ui.contractId === CONTRACT_COMPANY, 'contrato visível na lista não pode ser descartado');
  assert(ui.eSignStarted === false, 'e-sign não iniciada');
  console.log('OK testCompanyIdMatchKeepsContract');
}

function testBridgeFollowsSelectedContract() {
  const bridge = read('components/assistant/AssistantContractUiBridge.tsx');
  const page = read('app/contracts/page.tsx');
  const loaders = read('lib/assistant/entityLoaders.ts');
  const hydrate = read('lib/assistant/hydrateUiContext.ts');
  const client = read('lib/assistant/clientAsk.ts');
  assert(page.includes('AssistantContractUiBridge contractId={selectedContract?.id'), 'bridge usa o mesmo selectedContract da tela');
  assert(bridge.includes('useLayoutEffect'), 'publicar seleção no mesmo ciclo da UI');
  assert(!/return \(\) => clearContract/.test(bridge), 'cleanup não pode apagar a seleção atual');
  assert(!/projects\(/.test(loaders), 'loadContract não usa embed PostgREST de projects');
  assert(hydrate.includes('recordBelongsToTenant'), 'hydrate autentica tenant_id ou company_id');
  assert(client.includes('contractId: input.context.ui?.contractId'), 'cliente envia só o UUID');
  assert(!client.includes('contractNumber'), 'número do contrato não vai no request');
  const uuid = read('lib/assistant/uiSnapshot.ts');
  assert(uuid.includes('[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}'), 'não rejeitar UUID interno válido');
  assert(sanitizeUuidHint('aaaaaaaa-aaaa-0aaa-0aaa-aaaaaaaaaaaa') === 'aaaaaaaa-aaaa-0aaa-0aaa-aaaaaaaaaaaa', 'UUID interno sem nibble RFC');
  console.log('OK testBridgeFollowsSelectedContract');
}

function testMapNavigationDropsContractHint() {
  const afterMap = scopeAssistantHintsToRoute('/map', { contractId: CONTRACT_A });
  assert(!afterMap.contractId, 'sair de Contratos descarta o id');
  const back = scopeAssistantHintsToRoute('/contracts', afterMap);
  assert(!back.contractId, '/contracts não restaura seleção obsoleta');
  console.log('OK testMapNavigationDropsContractHint');
}

async function testHomologationQuestionAfterCompanyIdHydrate() {
  const { ui, rejectedForeignTenant } = await hydrateAssistantUiContext({
    tenantId: TENANT_A,
    pathname: '/contracts',
    hints: { contractId: CONTRACT_COMPANY },
    loaders: mockLoaders(),
  });
  assert(!rejectedForeignTenant, 'visível na lista via company_id');
  assert(ui.contractId === CONTRACT_COMPANY, 'id hidratado');
  const result = await ask({
    question: 'O que está faltando para finalizar esse contrato?',
    context: withUi('/contracts', ui),
  });
  assert(/já está gerado/i.test(result.text), result.text);
  assert(/Enviar para assinatura/.test(result.text), result.text);
  assert(!/nenhum contrato/i.test(result.text), result.text);
  assert(!/000000019/.test(result.text), 'não precisa citar o número');
  const packed = packAssistantContext(withUi('/contracts', { ...ui, contractId: CONTRACT_COMPANY }));
  assert(assertPackedContextHasNoPii(packed), packed);
  assert(!packed.includes(CONTRACT_COMPANY), 'UUID não vai ao provider');
  console.log('OK testHomologationQuestionAfterCompanyIdHydrate');
}

function testPriorityAndContinue() {
  const instruction = read('lib/assistant/model/systemInstruction.ts');
  assert(instruction.includes('estado real validado da interface'), 'policy de prioridade');
  assert(instruction.includes('entidade selecionada da rota atual'), 'prioridade rota/entidade');
  assert(instruction.includes('histórico conversacional'), 'histórico abaixo do estado atual');
  assert(instruction.includes('Nunca mande o usuário abrir uma tela'), 'não navegar para a tela atual');
  const pipeline = read('lib/assistant/pipeline.ts');
  assert(pipeline.includes('composeFromValidatedUi'), 'pipeline prioriza UI');
  const provider = read('contexts/AssistantUiStateContext.tsx');
  assert(provider.includes('scopeAssistantHintsToRoute'), 'client descarta contexto ao mudar de rota');
  const sample = composeFromValidatedUi({
    question: 'O que falta neste contrato?',
    context: withUi('/contracts', {
      contractId: CONTRACT_A,
      contractStatus: 'ativo',
      eSignStarted: false,
    }),
  });
  assert(sample != null && sample.includes(ASSISTANT_CONTINUE_OFFER), sample || '');
  console.log('OK testPriorityAndContinue');
}

async function main() {
  testFabAccessibleOverModal();
  testOpeningAssistantDoesNotResetForm();
  await testNoCustomerOrientsClient();
  await testCustomerSelectedAdvances();
  await testParceladoPendingFields();
  await testGeneratedContractWithoutSignature();
  await testPartiallySignedContract();
  await testLfWaitingInternalVendor();
  await testForeignContractDiscarded();
  await testNoPiiInProvider();
  await testStaleSaleContextDoesNotContaminateContracts();
  await testStaleContractDoesNotContaminateMap();
  await testClosedLotModalDropsOperationalFlags();
  await testStaleLotFromOtherProjectDiscarded();
  await testHydrateContractsDropsSaleHints();
  await testSelectedContractQuestionUsesHydratedState();
  await testContractSelectionSwitchesImmediately();
  await testDeselectContractClearsContext();
  await testCompanyIdMatchKeepsContract();
  await testHomologationQuestionAfterCompanyIdHydrate();
  testBridgeFollowsSelectedContract();
  testMapNavigationDropsContractHint();
  testPriorityAndContinue();
  console.log('ASSISTANT_SV_FASE_1D_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
