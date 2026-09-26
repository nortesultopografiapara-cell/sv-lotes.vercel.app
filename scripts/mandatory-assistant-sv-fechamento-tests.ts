/**
 * Assistente SV — fechamento candidato a Production (1A–1D + 2A).
 * npx tsx scripts/mandatory-assistant-sv-fechamento-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveAssistantActiveGoal } from '../lib/assistant/activeGoal';
import { ASSISTANT_FORBIDDEN_BROKER, ASSISTANT_UNKNOWN_ANSWER } from '../lib/assistant/constants';
import { buildSafeAssistantContext } from '../lib/assistant/context';
import { listAssistantProcedures } from '../lib/assistant/knowledgeBase';
import { ASSISTANT_AI_DEFAULT_MODEL } from '../lib/assistant/model/googleGenAiProvider';
import { localGroundedProvider } from '../lib/assistant/model/localGroundedProvider';
import { assertPackedContextHasNoPii, packAssistantContext } from '../lib/assistant/model/packKnowledge';
import { resolveAssistantModelProvider } from '../lib/assistant/model/resolveProvider';
import { runAssistantPipeline } from '../lib/assistant/pipeline';
import { retrieveAssistantProcedures } from '../lib/assistant/retrieve';
import { EMPTY_ASSISTANT_UI_STATE } from '../lib/assistant/uiSnapshot';
import type { AssistantAskInput } from '../lib/assistant/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const root = process.cwd();
const localDeps = { primary: localGroundedProvider, fallback: localGroundedProvider };

function ctx(pathname: string, extras?: { role?: string }) {
  return buildSafeAssistantContext({
    pathname,
    role: extras?.role ?? 'ADMIN',
    tenantName: 'Empresa Homologada',
    ui: EMPTY_ASSISTANT_UI_STATE,
  });
}

async function ask(input: AssistantAskInput) {
  return runAssistantPipeline(input, localDeps);
}

function testKbHas37() {
  const procedures = listAssistantProcedures();
  assert(procedures.length === 38, `esperado 38 procedimentos, veio ${procedures.length}`);
  console.log('OK testKbHas37');
}

function testSpecificRetrievalWins() {
  const cases: Array<{ q: string; path: string; expect: string }> = [
    { q: 'Quero pôr a foto do corretor. Como faço?', path: '/dashboard/brokers', expect: 'brokers-foto' },
    { q: 'Como gero a Prancha Geral?', path: '/map', expect: 'gis-prancha-geral' },
    { q: 'Como gero a prancha do lote?', path: '/map', expect: 'gis-prancha-lote' },
    { q: 'Como gero o memorial de um lote?', path: '/map', expect: 'gis-lot-memorial' },
    { q: 'Como faço as confrontações no mapa?', path: '/map', expect: 'gis-confrontacoes' },
    { q: 'Como corrijo a frente do lote?', path: '/map', expect: 'gis-corrigir-frente' },
    { q: 'Como faço uma venda parcelada?', path: '/map', expect: 'gis-venda-parcelada' },
    { q: 'Como reservo um lote?', path: '/map', expect: 'gis-reserva' },
    { q: 'Como cadastro um cliente?', path: '/customers', expect: 'customers-cadastro' },
    { q: 'Como edito um cliente já cadastrado?', path: '/customers', expect: 'customers-editar' },
    { q: 'Como uso o Financeiro?', path: '/finance', expect: 'finance-visao-geral' },
    { q: 'Tem parcela vencida hoje?', path: '/dashboard', expect: 'finance-visao-geral' },
    { q: 'Como faço a baixa manual da parcela?', path: '/finance', expect: 'finance-baixa-manual' },
    { q: 'Como vejo o fluxo de caixa?', path: '/finance', expect: 'finance-fluxo-caixa' },
    { q: 'Como emito uma cobrança?', path: '/charges', expect: 'charges-cobrancas' },
    { q: 'Como configuro os lembretes de cobrança?', path: '/charges', expect: 'charges-lembretes' },
    { q: 'Como baixo o PDF e vejo as versões do contrato?', path: '/contracts', expect: 'contracts-pdf-versoes' },
    { q: 'Como envio o contrato para assinatura?', path: '/contracts', expect: 'contracts-enviar-assinatura' },
    { q: 'Como altero as configurações da empresa?', path: '/settings', expect: 'settings-empresa' },
    { q: 'Como configuro o empreendimento no mapa?', path: '/map', expect: 'gis-config-empreendimento' },
    { q: 'Como configuro o Split de Recebimentos?', path: '/map', expect: 'gis-split-recebimentos' },
    { q: 'Como cadastro um sócio ou proprietário?', path: '/owners', expect: 'owners-socios' },
    { q: 'Como vejo Minha Assinatura?', path: '/billing', expect: 'billing-assinatura' },
    { q: 'Como sincronizo as operações offline?', path: '/offline-sync', expect: 'offline-sync' },
    { q: 'Como uso a Migração de Dados?', path: '/data-migration', expect: 'data-migration' },
    { q: 'Como exporto o relatório de lotes do Dashboard?', path: '/dashboard', expect: 'dashboard-exportar' },
    { q: 'Como desativo um corretor?', path: '/dashboard/brokers', expect: 'brokers-editar' },
  ];
  for (const item of cases) {
    const goal = resolveAssistantActiveGoal({ question: item.q });
    const retrieved = retrieveAssistantProcedures({
      question: item.q,
      context: ctx(item.path),
      activeGoal: goal,
    });
    assert(
      retrieved.procedures[0]?.id === item.expect,
      `retrieval "${item.q}" → ${retrieved.procedures.map((p) => p.id).join(',') || retrieved.kind} (esperado ${item.expect})`,
    );
  }
  console.log('OK testSpecificRetrievalWins');
}

async function testMemorialFollowUpAndGoalSwitch() {
  const memorialCtx = buildSafeAssistantContext({
    pathname: '/map',
    role: 'ADMIN',
    tenantName: 'Empresa Homologada',
    ui: { ...EMPTY_ASSISTANT_UI_STATE, lotModalOpen: true, lotNumber: '59', blockNumber: '03', activeLotTab: 'resumo' },
  });
  const first = await ask({ question: 'Como gero o memorial deste lote?', context: memorialCtx });
  assert(/memorial/i.test(first.text), first.text);
  assert(!/Confirmar Venda/.test(first.text), first.text);

  const follow = await ask({
    question: 'Já selecionei. E agora?',
    context: memorialCtx,
    history: [
      { role: 'user', text: 'Como gero o memorial deste lote?' },
      { role: 'assistant', text: first.text },
    ],
  });
  assert(/Gerar memorial|Gerar PDF/.test(follow.text), follow.text);
  assert(!/Vender/.test(follow.text), follow.text);

  const switched = resolveAssistantActiveGoal({
    question: 'Como coloco foto no corretor?',
    history: [{ role: 'user', text: 'Como gero o memorial deste lote?' }],
  });
  assert(switched?.id === 'broker.photo.update', JSON.stringify(switched));
  console.log('OK testMemorialFollowUpAndGoalSwitch');
}

async function testConsultHowToIsOrientation() {
  const result = await ask({
    question: 'Como vejo parcelas vencidas?',
    context: ctx('/dashboard'),
  });
  assert(result.kind === 'answer', result.text);
  assert(result.procedureIds.includes('finance-visao-geral') || (result.capabilityIds || []).length > 0, result.procedureIds.join(','));
  assert(/Financeiro/.test(result.text), result.text);
  assert(!/Existem \d+ parcela/.test(result.text), result.text);
  console.log('OK testConsultHowToIsOrientation');
}

async function testUnknownStillUnknown() {
  const result = await ask({
    question: 'Como configuro um foguete espacial no SV Lotes?',
    context: ctx('/dashboard'),
  });
  assert(result.kind === 'unknown', result.kind);
  assert(result.text === ASSISTANT_UNKNOWN_ANSWER, result.text);
  console.log('OK testUnknownStillUnknown');
}

async function testBrokerRbac() {
  const result = await ask({
    question: 'Como uso o Financeiro?',
    context: ctx('/map', { role: 'BROKER' }),
  });
  assert(result.kind === 'forbidden' || result.text === ASSISTANT_FORBIDDEN_BROKER, result.text);
  console.log('OK testBrokerRbac');
}

function testProviderAndSecrets() {
  assert(ASSISTANT_AI_DEFAULT_MODEL === 'gemini-3.5-flash-lite', ASSISTANT_AI_DEFAULT_MODEL);
  const resolved = resolveAssistantModelProvider();
  assert(resolved.fallback.id === 'local-grounded', resolved.fallback.id);
  assert(resolved.primary.id === 'google-generative' || resolved.primary.id === 'local-grounded', resolved.primary.id);

  const google = fs.readFileSync(path.join(root, 'lib/assistant/model/googleGenAiProvider.ts'), 'utf8');
  assert(google.includes("process.env[ASSISTANT_AI_API_KEY_ENV]"), 'chave só no adapter');
  const button = fs.readFileSync(path.join(root, 'components/ui/HelpCenterHeaderButton.tsx'), 'utf8');
  assert(!button.includes('ASSISTANT_AI_API_KEY'), 'botão não carrega a chave');
  assert(!button.includes('href="/manual"'), 'header não volta à Central de Ajuda como navegação principal');

  const packed = packAssistantContext(ctx('/contracts'));
  assert(assertPackedContextHasNoPii(packed), packed);
  assert(!/password|jwt|api[_-]?key|service_role/i.test(packed), packed);
  console.log('OK testProviderAndSecrets');
}

function testGuidanceOnly() {
  const haystack = [
    fs.readFileSync(path.join(root, 'lib/assistant/pipeline.ts'), 'utf8'),
    fs.readFileSync(path.join(root, 'app/api/assistant/ask/route.ts'), 'utf8'),
    fs.readFileSync(path.join(root, 'components/assistant/AssistantPanel.tsx'), 'utf8'),
  ].join('\n');
  assert(!haystack.includes('createSale'), 'pipeline não cria venda');
  assert(!haystack.includes("from('sales')"), 'API do assistente não grava sales');
  console.log('OK testGuidanceOnly');
}

async function main() {
  testKbHas37();
  testSpecificRetrievalWins();
  await testMemorialFollowUpAndGoalSwitch();
  await testConsultHowToIsOrientation();
  await testUnknownStillUnknown();
  await testBrokerRbac();
  testProviderAndSecrets();
  testGuidanceOnly();
  console.log('ASSISTANT_SV_FECHAMENTO_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
