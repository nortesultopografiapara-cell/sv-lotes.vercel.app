/**
 * Assistente SV — Fase 1C (contexto profundo da interface, tenant isolation, Markdown seguro).
 * npx tsx scripts/mandatory-assistant-sv-fase-1c-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { ASSISTANT_CONTINUE_OFFER, ASSISTANT_LOCAL_FALLBACK_NOTICE } from '../lib/assistant/constants';
import { buildSafeAssistantContext } from '../lib/assistant/context';
import { hydrateAssistantUiContext, type AssistantEntityLoaders } from '../lib/assistant/hydrateUiContext';
import { localGroundedProvider } from '../lib/assistant/model/localGroundedProvider';
import { assertPackedContextHasNoPii, packAssistantContext } from '../lib/assistant/model/packKnowledge';
import { ASSISTANT_SYSTEM_INSTRUCTION } from '../lib/assistant/model/systemInstruction';
import { runAssistantPipeline } from '../lib/assistant/pipeline';
import { parseAssistantMarkdown } from '../lib/assistant/safeMarkdown';
import { EMPTY_ASSISTANT_UI_STATE, type AssistantUiSafeState } from '../lib/assistant/uiSnapshot';
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
const PROJECT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LOT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONTRACT_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const localDeps = { primary: localGroundedProvider, fallback: localGroundedProvider };

function withUi(
  pathname: string,
  ui: Partial<AssistantUiSafeState>,
  extras?: { projectName?: string | null; contractModel?: string | null; tenantName?: string | null },
): AssistantSafeContext {
  return buildSafeAssistantContext({
    pathname,
    role: 'ADMIN',
    tenantName: extras?.tenantName ?? 'Empresa Homologada',
    projectName: extras?.projectName ?? ui.projectName ?? null,
    contractModel: extras?.contractModel ?? ui.contractModel ?? null,
    ui: { ...EMPTY_ASSISTANT_UI_STATE, ...ui },
  });
}

function mockLoaders(): AssistantEntityLoaders {
  return {
    async loadProject(id) {
      if (id === PROJECT_A) {
        return { id: PROJECT_A, tenantId: TENANT_A, name: 'Chacreamento Mundo Novo', contractModel: 'MUNDO_NOVO' };
      }
      if (id === PROJECT_B) {
        return { id: PROJECT_B, tenantId: TENANT_B, name: 'Empreendimento Alheio', contractModel: 'PADRAO' };
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
          contractNumber: 'MN-0042',
          status: 'ativo',
          signatureStatus: 'PENDING',
          needsRegenerar: false,
          projectName: 'Chacreamento Mundo Novo',
          contractModel: 'MUNDO_NOVO',
          partyTotal: 4,
          partySigned: 1,
        };
      }
      return null;
    },
  };
}

async function ask(input: AssistantAskInput) {
  return runAssistantPipeline(input, localDeps);
}

async function testTenantOwnProject() {
  const { ui, rejectedForeignTenant } = await hydrateAssistantUiContext({
    tenantId: TENANT_A,
    hints: { projectId: PROJECT_A, lotId: LOT_A, lotModalOpen: true, activeLotTab: 'resumo' },
    loaders: mockLoaders(),
  });
  assert(!rejectedForeignTenant, 'tenant próprio não pode ser rejeitado');
  assert(ui.projectId === PROJECT_A, 'projectId do tenant');
  assert(ui.projectName === 'Chacreamento Mundo Novo', 'nome hidratado do banco');
  assert(ui.lotId === LOT_A, 'lote hidratado');
  assert(ui.blockNumber === '03', 'quadra');
  assert(ui.lotNumber === '59', 'lote');
  assert(ui.lotModalOpen === true, 'modal aberto preservado');
  console.log('OK testTenantOwnProject');
}

async function testForeignProjectId() {
  const { ui, rejectedForeignTenant } = await hydrateAssistantUiContext({
    tenantId: TENANT_A,
    hints: {
      projectId: PROJECT_B,
      lotModalOpen: true,
      blockNumber: '99',
      lotNumber: '01',
    },
    loaders: mockLoaders(),
  });
  assert(rejectedForeignTenant, 'projectId estrangeiro deve ser rejeitado');
  assert(ui.projectId === null, 'não usar projectId de outro tenant');
  assert(ui.projectName === null, 'não vazar nome de outro tenant');
  console.log('OK testForeignProjectId');
}

async function testGisLotOpen() {
  const context = withUi(
    '/map',
    {
      projectName: 'Chacreamento Mundo Novo',
      contractModel: 'MUNDO_NOVO',
      blockNumber: '03',
      lotNumber: '59',
      lotStatus: 'DISPONÍVEL',
      lotModalOpen: true,
      activeLotTab: 'resumo',
    },
    { projectName: 'Chacreamento Mundo Novo', contractModel: 'MUNDO_NOVO' },
  );
  const result = await ask({ question: 'O que faço para vender este lote?', context });
  assert(result.kind === 'answer', result.text);
  assert(/Lote 59/.test(result.text), `identificar lote: ${result.text}`);
  assert(/Quadra 03/.test(result.text), `identificar quadra: ${result.text}`);
  assert(/Mundo Novo/.test(result.text), `identificar empreendimento: ${result.text}`);
  assert(/dispon[ií]vel/i.test(result.text), `identificar status: ${result.text}`);
  assert(/Comercial/.test(result.text) && /Vender/.test(result.text), `próxima ação Comercial/Vender: ${result.text}`);
  assert(!/Dashboard/.test(result.text), 'não reiniciar no Dashboard');
  assert(!/Mapa GIS →/.test(result.text), 'não mandar abrir o mapa de novo');
  console.log('OK testGisLotOpen');
}

async function testCommercialTabAlreadyOpen() {
  const context = withUi('/map', {
    projectName: 'Chacreamento Mundo Novo',
    blockNumber: '03',
    lotNumber: '59',
    lotStatus: 'DISPONÍVEL',
    lotModalOpen: true,
    activeLotTab: 'comercial',
  });
  const result = await ask({
    question: 'E agora?',
    context,
    history: [
      { role: 'user', text: 'O que faço para vender este lote?' },
      { role: 'assistant', text: 'Clique em Comercial e depois em Vender.' },
    ],
  });
  assert(/Vender/.test(result.text), `continuar em Vender: ${result.text}`);
  assert(!/abra a aba comercial/i.test(result.text), 'não mandar abrir Comercial de novo');
  assert(!/Clique em Comercial e depois/.test(result.text), `não repetir abrir Comercial: ${result.text}`);
  console.log('OK testCommercialTabAlreadyOpen');
}

async function testCustomerAlreadySelected() {
  const context = withUi('/map', {
    projectName: 'Chacreamento Mundo Novo',
    blockNumber: '03',
    lotNumber: '59',
    saleFormOpen: true,
    customerSelected: true,
    paymentMode: null,
  });
  const result = await ask({ question: 'O que faço agora?', context });
  assert(/Forma de Pagamento/i.test(result.text), `seguir para pagamento: ${result.text}`);
  assert(!/selecione o cliente/i.test(result.text), 'não mandar selecionar cliente de novo');
  console.log('OK testCustomerAlreadySelected');
}

async function testContractSelected() {
  const context = withUi(
    '/contracts',
    {
      contractId: CONTRACT_A,
      contractNumber: 'MN-0042',
      contractStatus: 'ativo',
      signatureStatus: 'PENDING',
      eSignStarted: true,
      partyTotal: 4,
      partySigned: 1,
      nextAction: 'Acompanhar assinaturas',
      projectName: 'Chacreamento Mundo Novo',
      contractModel: 'MUNDO_NOVO',
    },
    { projectName: 'Chacreamento Mundo Novo', contractModel: 'MUNDO_NOVO' },
  );
  const result = await ask({ question: 'O que falta neste contrato?', context });
  assert(result.kind === 'answer', result.text);
  assert(/Acompanhar assinaturas/.test(result.text), `próxima ação do fluxo: ${result.text}`);
  assert(/1\/4/.test(result.text) || /Partes/.test(result.text), `parties sem PII: ${result.text}`);
  assert(!/529\.982/.test(result.text), 'sem CPF na resposta');
  console.log('OK testContractSelected');
}

async function testConversationContinuity() {
  const openLot = withUi('/map', {
    projectName: 'Chacreamento Mundo Novo',
    blockNumber: '03',
    lotNumber: '59',
    lotModalOpen: true,
    activeLotTab: 'resumo',
  });
  const first = await ask({ question: 'O que faço para vender este lote?', context: openLot });
  const comercial = withUi('/map', {
    projectName: 'Chacreamento Mundo Novo',
    blockNumber: '03',
    lotNumber: '59',
    lotModalOpen: true,
    activeLotTab: 'comercial',
  });
  const second = await ask({
    question: 'E agora?',
    context: comercial,
    history: [
      { role: 'user', text: 'O que faço para vender este lote?' },
      { role: 'assistant', text: first.text },
    ],
  });
  assert(first.kind === 'answer' && second.kind === 'answer', 'continuidade deve responder');
  assert(/Comercial/.test(first.text), 'primeiro passo comercial');
  assert(/Vender/.test(second.text), 'segundo passo vender');
  console.log('OK testConversationContinuity');
}

async function testNoPiiInProviderPayload() {
  const context = withUi('/map', {
    projectId: PROJECT_A,
    lotId: LOT_A,
    contractId: CONTRACT_A,
    projectName: 'Chacreamento Mundo Novo',
    blockNumber: '03',
    lotNumber: '59',
    lotStatus: 'DISPONÍVEL',
    lotModalOpen: true,
    activeLotTab: 'resumo',
    customerSelected: true,
  });
  const packed = packAssistantContext(context);
  assert(assertPackedContextHasNoPii(packed), 'contexto packed sem PII');
  assert(!packed.includes(PROJECT_A), 'não enviar UUID de projeto ao modelo');
  assert(!packed.includes(LOT_A), 'não enviar UUID de lote ao modelo');
  assert(!packed.includes(CONTRACT_A), 'não enviar UUID de contrato ao modelo');
  assert(!/\bcpf\b/i.test(packed), 'sem CPF');
  assert(!/jwt/i.test(packed), 'sem JWT');
  assert(!/wallet/i.test(packed), 'sem wallet');
  assert(!/<html/i.test(packed), 'sem HTML de contrato');
  const payload = read('lib/assistant/clientAsk.ts');
  assert(!payload.includes('cpf'), 'clientAsk sem CPF');
  assert(!payload.includes('password'), 'clientAsk sem senha');
  console.log('OK testNoPiiInProviderPayload');
}

function testSafeMarkdown() {
  const nodes = parseAssistantMarkdown(
    'Clique em **Comercial** e depois em *Vender*.\n\n- Conferir valores\n- Confirmar Venda\n\nUse `À vista` se preferir.\n\n<script>alert(1)</script> ![x](https://evil.test/x.png) [phishing](https://evil.test)',
  );
  const serialized = JSON.stringify(nodes);
  assert(serialized.includes('"type":"strong"') && serialized.includes('Comercial'), 'negrito');
  assert(serialized.includes('"type":"em"') && serialized.includes('Vender'), 'itálico');
  assert(serialized.includes('"type":"ul"'), 'lista');
  assert(serialized.includes('"type":"code"'), 'código inline');
  assert(!serialized.includes('<script'), 'sem HTML/script');
  assert(!serialized.includes('evil.test'), 'sem link/imagem externa');
  const panel = read('components/assistant/AssistantPanel.tsx');
  assert(panel.includes('AssistantSafeMarkdown'), 'painel renderiza Markdown seguro');
  const md = read('lib/assistant/safeMarkdown.ts');
  assert(md.includes('stripUnsafe') || md.includes('strip'), 'sanitização');
  console.log('OK testSafeMarkdown');
}

async function testProgressiveReply() {
  const context = withUi('/map', {
    projectName: 'Chacreamento Mundo Novo',
    blockNumber: '03',
    lotNumber: '59',
    lotModalOpen: true,
    activeLotTab: 'resumo',
  });
  const result = await ask({ question: 'O que faço para vender este lote?', context });
  assert(result.text.includes(ASSISTANT_CONTINUE_OFFER), 'oferecer continuidade');
  assert(!/Pré-requisitos/.test(result.text), 'não despejar pré-requisitos');
  assert(!/Erros comuns/.test(result.text), 'não despejar erros comuns');
  assert(!/Observações/.test(result.text), 'não despejar observações');
  assert(!/PADRAO, MUNDO_NOVO, ESTRELA/.test(result.text), 'não listar todos os modelos');
  const instruction = ASSISTANT_SYSTEM_INSTRUCTION;
  assert(instruction.includes('2 a 4 passos') || instruction.includes('2–4'), 'policy 2–4 passos');
  assert(instruction.includes('Não peça para repetir'), 'policy não repetir passo');
  console.log('OK testProgressiveReply');
}

async function testLocalFallbackPreserved() {
  const throwing = {
    id: 'down',
    available: () => true,
    async generate() {
      throw new Error('provider_unavailable');
    },
  };
  const context = withUi('/map', {
    projectName: 'Chacreamento Mundo Novo',
    blockNumber: '03',
    lotNumber: '59',
    lotModalOpen: true,
    activeLotTab: 'resumo',
  });
  const result = await runAssistantPipeline(
    { question: 'O que faço para vender este lote?', context },
    { primary: throwing, fallback: localGroundedProvider },
  );
  assert(result.kind === 'answer', 'fallback local deve responder');
  assert(result.source === 'local-fallback', `source=${result.source}`);
  assert(result.notice === ASSISTANT_LOCAL_FALLBACK_NOTICE, 'aviso local');
  assert(/Comercial/.test(result.text), result.text);
  const resolve = read('lib/assistant/model/resolveProvider.ts');
  assert(resolve.includes('localGroundedProvider'), 'fallback local no resolve');
  console.log('OK testLocalFallbackPreserved');
}

function testWiringAndGuidanceOnly() {
  const gis = read('components/map/GISMap.tsx');
  assert(gis.includes('AssistantLotUiBridge'), 'GIS publica lote/aba');
  const sale = read('components/map/CustomerLotFormModal.tsx');
  assert(sale.includes('AssistantSaleUiBridge'), 'formulário de venda publica estágio');
  const contracts = read('app/contracts/page.tsx');
  assert(contracts.includes('AssistantContractUiBridge'), 'contratos publicam contrato selecionado');
  const chrome = read('components/assistant/AssistantChrome.tsx');
  assert(chrome.includes('AssistantUiStateProvider'), 'provider de UI no chrome');
  const route = read('app/api/assistant/ask/route.ts');
  assert(route.includes('hydrateAssistantUiContext'), 'hydrate server-side');
  assert(route.includes('auth.tenantId'), 'tenant da sessão');
  assert(!route.includes('body.tenantId'), 'não confiar tenant do browser');
  const haystack = [
    read('lib/assistant/pipeline.ts'),
    read('lib/assistant/clientAsk.ts'),
    read('components/assistant/AssistantPanel.tsx'),
    read('app/api/assistant/ask/route.ts'),
  ].join('\n');
  assert(!haystack.includes('createSale'), 'assistente não cria venda');
  assert(!haystack.includes("from('sales')"), 'assistente não grava sales');
  console.log('OK testWiringAndGuidanceOnly');
}

async function main() {
  await testTenantOwnProject();
  await testForeignProjectId();
  await testGisLotOpen();
  await testCommercialTabAlreadyOpen();
  await testCustomerAlreadySelected();
  await testContractSelected();
  await testConversationContinuity();
  await testNoPiiInProviderPayload();
  testSafeMarkdown();
  await testProgressiveReply();
  await testLocalFallbackPreserved();
  testWiringAndGuidanceOnly();
  console.log('ASSISTANT_SV_FASE_1C_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
