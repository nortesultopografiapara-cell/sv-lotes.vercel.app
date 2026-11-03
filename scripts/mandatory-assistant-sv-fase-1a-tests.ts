/**
 * Assistente SV — Fase 1A (painel + KB oficial + retrieval local).
 * npx tsx scripts/mandatory-assistant-sv-fase-1a-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ASSISTANT_BUTTON_LABEL,
  ASSISTANT_FORBIDDEN_BROKER,
  ASSISTANT_FORBIDDEN_WRITE_OWNER,
  ASSISTANT_GREETING,
  ASSISTANT_INPUT_PLACEHOLDER,
  ASSISTANT_MANUAL_FALLBACK_LABEL,
  ASSISTANT_PANEL_SUBTITLE,
  ASSISTANT_PANEL_TITLE,
  ASSISTANT_TOOLTIP_TITLE,
  ASSISTANT_UNKNOWN_ANSWER,
} from '../lib/assistant/constants';
import { askAssistant } from '../lib/assistant/ask';
import { buildSafeAssistantContext } from '../lib/assistant/context';
import { listAssistantProcedures, getAssistantKbIndex } from '../lib/assistant/knowledgeBase';
import { listVisibleAssistantShortcuts } from '../lib/assistant/shortcuts';
import { ASSISTANT_ASK_ROUTE } from '../lib/assistant/apiContract';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function adminContext(pathname = '/dashboard', extras?: { contractModel?: string | null; projectName?: string | null }) {
  return buildSafeAssistantContext({
    pathname,
    role: 'ADMIN',
    tenantName: 'LF IMOVEIS LTDA',
    projectName: extras?.projectName ?? null,
    contractModel: extras?.contractModel ?? null,
  });
}

function testButtonAndPanel() {
  assert(ASSISTANT_BUTTON_LABEL === 'Assistente IA', 'rótulo oficial do botão');
  assert(ASSISTANT_TOOLTIP_TITLE === 'Pergunte ao Assistente SV', 'tooltip oficial');
  const button = read('components/ui/HelpCenterHeaderButton.tsx');
  assert(button.includes('ASSISTANT_BUTTON_LABEL'), 'botão sem rótulo Assistente IA');
  assert(button.includes('ASSISTANT_TOOLTIP_TITLE'), 'botão sem tooltip Pergunte ao Assistente SV');
  assert(button.includes('data-testid="assistant-sv-header-button"'), 'botão sem testid');
  assert(!button.includes('href="/manual"'), 'botão global ainda navega para /manual');

  const layout = read('components/Layout.tsx');
  assert(layout.includes('HelpCenterHeaderButton'), 'Layout sem botão global');
  assert(layout.includes('AssistantChrome'), 'Layout sem AssistantChrome');

  const panel = read('components/assistant/AssistantPanel.tsx');
  assert(panel.includes('ASSISTANT_PANEL_TITLE'), 'painel sem título Assistente SV');
  assert(panel.includes('ASSISTANT_PANEL_SUBTITLE'), 'painel sem subtítulo');
  assert(panel.includes('ASSISTANT_GREETING'), 'painel sem saudação');
  assert(panel.includes('ASSISTANT_INPUT_PLACEHOLDER'), 'painel sem placeholder');
  assert(panel.includes('ASSISTANT_MANUAL_FALLBACK_LABEL'), 'painel sem fallback do manual');
  assert(panel.includes('Fechar'), 'painel sem botão fechar');
  assert(panel.includes('data-testid="assistant-sv-panel"'), 'painel sem testid');
  assert(ASSISTANT_GREETING.includes('Assistente SV'), 'saudação oficial');
  assert(ASSISTANT_PANEL_TITLE === 'Assistente SV', 'título oficial');
  assert(ASSISTANT_PANEL_SUBTITLE === 'Especialista no SV Lotes', 'subtítulo oficial');

  const css = read('app/theme-tokens.css');
  assert(css.includes('min(480px, 100%)'), 'largura desktop do painel');
  assert(css.includes('92dvh'), 'mobile quase tela cheia');

  const manualPage = read('app/manual/page.tsx');
  assert(manualPage.length > 100, '/manual precisa permanecer');
  console.log('OK testButtonAndPanel');
}

function testKnowledgeBaseShape() {
  const index = getAssistantKbIndex();
  const procedures = listAssistantProcedures();
  assert(index.procedures.length === procedures.length, 'index dessincronizado da KB');
  assert(procedures.length >= 16, 'KB inicial incompleta');
  const required = [
    'gis-venda-avista',
    'gis-venda-parcelada',
    'gis-reserva',
    'customers-cadastro',
    'brokers-corretores',
    'contracts-gerar',
    'contracts-regenerar',
    'contracts-enviar-assinatura',
    'contracts-assinatura-lf-imoveis',
    'contracts-assinatura-mundo-novo',
    'finance-visao-geral',
    'finance-recibos',
    'charges-cobrancas',
    'charges-whatsapp',
    'gis-split-recebimentos',
    'gis-config-empreendimento',
  ];
  for (const id of required) {
    assert(procedures.some((item) => item.id === id), `faltou procedimento ${id}`);
  }
  for (const procedure of procedures) {
    assert(Boolean(procedure.title), `${procedure.id} sem título`);
    assert(procedure.steps.length > 0, `${procedure.id} sem passos`);
    assert(procedure.navigationPath.length > 0, `${procedure.id} sem caminho`);
    assert(procedure.sourceOfTruth.length > 0, `${procedure.id} sem sourceOfTruth`);
    assert(procedure.uiLabels.length > 0, `${procedure.id} sem uiLabels`);
    assert(fs.existsSync(path.join(root, 'docs/assistant-kb', `${procedure.id}.json`)), `arquivo KB ausente ${procedure.id}`);
  }
  console.log('OK testKnowledgeBaseShape');
}

function testVendaParcelada() {
  const result = askAssistant({
    question: 'Como faço uma venda parcelada?',
    context: adminContext('/dashboard'),
  });
  assert(result.kind === 'answer', 'venda parcelada deveria recuperar procedimento');
  assert(result.procedureIds.includes('gis-venda-parcelada'), `ids=${result.procedureIds.join(',')}`);
  assert(result.text.includes('Comercial'), 'resposta sem aba Comercial');
  assert(result.text.includes('Vender'), 'resposta sem Vender');
  assert(result.text.includes('Qtd de Parcelas'), 'resposta sem Qtd de Parcelas');
  assert(result.text.includes('Confirmar Venda'), 'resposta sem Confirmar Venda');
  assert(result.text.includes('Mapa GIS'), 'resposta sem Mapa GIS');
  console.log('OK testVendaParcelada');
}

function testAssinaturaLf() {
  const result = askAssistant({
    question: 'Como assino o contrato LF Imóveis?',
    context: adminContext('/contracts', { contractModel: 'ESTRELA_DO_SUL', projectName: 'Estrela do Sul' }),
  });
  assert(result.kind === 'answer', 'LF deveria recuperar procedimento');
  assert(result.procedureIds.includes('contracts-assinatura-lf-imoveis'), `ids=${result.procedureIds.join(',')}`);
  assert(result.text.includes('Enviar para assinatura'), 'LF sem Enviar para assinatura');
  assert(result.text.includes('vendedor 1'), 'LF sem vendedor 1 interno');
  assert(result.text.includes('LF Imóveis'), 'LF sem rótulo de UI');
  assert(!result.text.includes('cadastre os dois vendedores nas Configurações'), 'não inventar cadastro LF em Configurações');
  console.log('OK testAssinaturaLf');
}

function testMundoNovo() {
  const result = askAssistant({
    question: 'Como funciona a assinatura do Mundo Novo?',
    context: adminContext('/contracts', { contractModel: 'MUNDO_NOVO' }),
  });
  assert(result.kind === 'answer', 'Mundo Novo deveria recuperar procedimento');
  assert(result.procedureIds.includes('contracts-assinatura-mundo-novo'), `ids=${result.procedureIds.join(',')}`);
  assert(result.text.includes('PROMITENTES VENDEDORES'), 'Mundo Novo sem bloco e-sign');
  assert(result.text.includes('seller_parties_json') || result.text.includes('JSON do empreendimento'), 'Mundo Novo sem origem dos vendedores');
  assert(result.text.includes('Representante Legal'), 'precisa avisar que não há fallback de Representante Legal');
  console.log('OK testMundoNovo');
}

function testUnknownQuestion() {
  const result = askAssistant({
    question: 'Como configuro um foguete espacial no SV Lotes?',
    context: adminContext('/dashboard'),
  });
  assert(result.kind === 'unknown', 'pergunta fora da KB deveria ser unknown');
  assert(result.text === ASSISTANT_UNKNOWN_ANSWER, `texto inesperado: ${result.text}`);
  assert(result.procedureIds.length === 0, 'unknown não pode devolver procedimentos');
  console.log('OK testUnknownQuestion');
}

function testBrokerRbac() {
  const context = buildSafeAssistantContext({
    pathname: '/map',
    role: 'BROKER',
    tenantName: 'Empresa Teste',
  });
  const finance = askAssistant({
    question: 'Como uso o Financeiro e emito cobrança?',
    context,
  });
  assert(finance.kind === 'forbidden', `broker financeiro kind=${finance.kind}`);
  assert(finance.text === ASSISTANT_FORBIDDEN_BROKER, finance.text);

  const shortcuts = listVisibleAssistantShortcuts(context);
  assert(
    shortcuts.global.every((item) => item.procedureId !== 'finance-visao-geral' && item.procedureId !== 'charges-cobrancas'),
    'broker não pode ver atalhos de Financeiro/Cobranças',
  );
  assert(
    shortcuts.global.some((item) => item.procedureId === 'gis-venda-parcelada'),
    'broker deve ver atalho de venda',
  );

  const sale = askAssistant({
    question: 'Como faço uma venda parcelada?',
    context,
  });
  assert(sale.kind === 'answer', 'broker pode receber venda');
  assert(sale.procedureIds.includes('gis-venda-parcelada'), 'broker venda parcelada');
  console.log('OK testBrokerRbac');
}

function testOwnerRbac() {
  const context = buildSafeAssistantContext({
    pathname: '/contracts',
    role: 'OWNER',
    tenantName: 'Empresa Teste',
  });
  const write = askAssistant({
    question: 'Como faço uma venda parcelada?',
    context,
  });
  assert(write.kind === 'forbidden', `owner write kind=${write.kind}`);
  assert(write.text === ASSISTANT_FORBIDDEN_WRITE_OWNER, write.text);

  const finance = askAssistant({
    question: 'Como consulto o Financeiro?',
    context: { ...context, pathname: '/finance', moduleId: 'finance' },
  });
  assert(finance.kind === 'answer', 'owner pode consultar financeiro');
  assert(finance.procedureIds.includes('finance-visao-geral'), 'owner financeiro leitura');

  const shortcuts = listVisibleAssistantShortcuts(context);
  assert(
    shortcuts.global.every((item) => item.access === 'read'),
    'owner só vê atalhos de leitura',
  );
  console.log('OK testOwnerRbac');
}

function testContextualShortcuts() {
  const map = listVisibleAssistantShortcuts(adminContext('/map'));
  const mapLabels = map.contextual.map((item) => item.label);
  for (const label of ['Vender lote', 'Reservar lote', 'Confrontações', 'Memorial/Prancha']) {
    assert(mapLabels.includes(label), `atalho /map ausente: ${label}`);
  }
  const contracts = listVisibleAssistantShortcuts(adminContext('/contracts'));
  const contractLabels = contracts.contextual.map((item) => item.label);
  for (const label of ['Enviar para assinatura', 'Acompanhar assinaturas', 'Baixar PDF', 'Regenerar contrato']) {
    assert(contractLabels.includes(label), `atalho /contracts ausente: ${label}`);
  }
  const charges = listVisibleAssistantShortcuts(adminContext('/charges'));
  const chargeLabels = charges.contextual.map((item) => item.label);
  for (const label of ['Emitir cobrança', 'Enviar WhatsApp', 'Sincronizar cobrança']) {
    assert(chargeLabels.includes(label), `atalho /charges ausente: ${label}`);
  }
  console.log('OK testContextualShortcuts');
}

function testRetrievalDoesNotDumpKb() {
  const result = askAssistant({
    question: 'Como faço uma venda parcelada?',
    context: adminContext('/map'),
  });
  assert(result.procedureIds.length > 0 && result.procedureIds.length <= 2, 'não despejar a KB inteira');
  const all = listAssistantProcedures();
  assert(result.procedureIds.length < all.length, 'resposta não pode incluir todos os procedimentos');
  console.log('OK testRetrievalDoesNotDumpKb');
}

function testNoSensitivePayload() {
  const context = adminContext('/contracts', { contractModel: 'ESTRELA_DO_SUL' });
  const serialized = JSON.stringify(context);
  assert(!serialized.toLowerCase().includes('password'), 'contexto com password');
  assert(!serialized.toLowerCase().includes('jwt'), 'contexto com jwt');
  assert(!serialized.includes('service_role'), 'contexto com service_role');
  assert(!/cpf/i.test(serialized), 'contexto não deve carregar CPF');
  const ask = read('lib/assistant/ask.ts');
  assert(ask.includes('POST /api/assistant/ask'), 'ask.ts deve documentar a Fase 1B');
  assert(ASSISTANT_ASK_ROUTE === '/api/assistant/ask', 'contrato da rota');
  assert(fs.existsSync(path.join(root, 'app/api/assistant/ask/route.ts')), 'Fase 1B precisa do endpoint autenticado');
  const serializedPayload = JSON.stringify({ question: 'teste', pathname: '/dashboard' });
  assert(!serializedPayload.includes('role'), 'payload mínimo não carrega role');
  console.log('OK testNoSensitivePayload');
}

function testLabelRouteDrift() {
  const procedures = listAssistantProcedures();
  for (const procedure of procedures) {
    const sources = procedure.sourceOfTruth.map((rel) => read(rel));
    const haystack = sources.join('\n');
    for (const label of procedure.uiLabels) {
      assert(
        haystack.includes(label),
        `deriva de rótulo: "${label}" não encontrado em ${procedure.id} (${procedure.sourceOfTruth.join(', ')})`,
      );
    }
    for (const route of procedure.routes) {
      const appPath = route === '/dashboard/brokers' ? 'app/dashboard/brokers/page.tsx' : `app${route}/page.tsx`;
      assert(fs.existsSync(path.join(root, appPath)), `rota ${route} sem page.tsx (${procedure.id})`);
    }
  }
  console.log('OK testLabelRouteDrift');
}

function testGuidanceOnly() {
  const haystack = [
    read('lib/assistant/ask.ts'),
    read('lib/assistant/compose.ts'),
    read('components/assistant/AssistantPanel.tsx'),
  ].join('\n');
  assert(!haystack.includes('createSale'), 'painel não pode criar venda');
  assert(!haystack.includes('from(\'sales\')'), 'painel não grava sales');
  console.log('OK testGuidanceOnly');
}

function main() {
  testButtonAndPanel();
  testKnowledgeBaseShape();
  testVendaParcelada();
  testAssinaturaLf();
  testMundoNovo();
  testUnknownQuestion();
  testBrokerRbac();
  testOwnerRbac();
  testContextualShortcuts();
  testRetrievalDoesNotDumpKb();
  testNoSensitivePayload();
  testLabelRouteDrift();
  testGuidanceOnly();
  console.log('ASSISTANT_SV_FASE_1A_OK');
}

main();
