/**
 * Assistente SV — Fase 2A (inventário operacional + activeGoal).
 * npx tsx scripts/mandatory-assistant-sv-fase-2a-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveAssistantActiveGoal } from '../lib/assistant/activeGoal';
import { ASSISTANT_CONTINUE_OFFER, ASSISTANT_FORBIDDEN_BROKER, ASSISTANT_UNKNOWN_ANSWER } from '../lib/assistant/constants';
import { composeFromValidatedUi } from '../lib/assistant/composeFromUi';
import { buildSafeAssistantContext } from '../lib/assistant/context';
import { listAssistantProcedures, getAssistantKbIndex } from '../lib/assistant/knowledgeBase';
import { localGroundedProvider } from '../lib/assistant/model/localGroundedProvider';
import { assertPackedContextHasNoPii, packAssistantContext } from '../lib/assistant/model/packKnowledge';
import { runAssistantPipeline } from '../lib/assistant/pipeline';
import { EMPTY_ASSISTANT_UI_STATE, type AssistantUiSafeState } from '../lib/assistant/uiSnapshot';
import type { AssistantAskInput, AssistantSafeContext } from '../lib/assistant/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const root = process.cwd();
const localDeps = { primary: localGroundedProvider, fallback: localGroundedProvider };

function withUi(
  pathname: string,
  ui: Partial<AssistantUiSafeState> = {},
  extras?: { role?: string; projectName?: string | null; contractModel?: string | null },
): AssistantSafeContext {
  return buildSafeAssistantContext({
    pathname,
    role: extras?.role ?? 'ADMIN',
    tenantName: 'Empresa Homologada',
    projectName: extras?.projectName ?? null,
    contractModel: extras?.contractModel ?? null,
    ui: { ...EMPTY_ASSISTANT_UI_STATE, ...ui },
  });
}

async function ask(input: AssistantAskInput) {
  return runAssistantPipeline(input, localDeps);
}

function testKbCoverageGrew() {
  const index = getAssistantKbIndex();
  const procedures = listAssistantProcedures();
  assert(index.procedures.length === procedures.length, 'index dessincronizado');
  assert(procedures.length >= 37, `KB 2A incompleta: ${procedures.length}`);
  const required = [
    'brokers-foto',
    'gis-prancha-geral',
    'gis-prancha-lote',
    'gis-lot-memorial',
    'gis-confrontacoes',
    'gis-venda-parcelada',
    'gis-reserva',
    'customers-cadastro',
    'finance-visao-geral',
    'charges-cobrancas',
    'contracts-enviar-assinatura',
    'gis-config-empreendimento',
    'gis-split-recebimentos',
  ];
  for (const id of required) {
    assert(procedures.some((item) => item.id === id), `faltou ${id}`);
  }
  const coverage = fs.readFileSync(path.join(root, 'docs/assistant-kb/COVERAGE-FASE-2A.md'), 'utf8');
  assert(coverage.includes('Módulo |'), 'relatório de cobertura ausente');
  console.log('OK testKbCoverageGrew');
}

async function testBrokerPhoto() {
  const result = await ask({
    question: 'Quero pôr a foto do corretor. Como faço?',
    context: withUi('/dashboard/brokers'),
  });
  assert(result.kind === 'answer', result.text);
  assert(result.procedureIds.includes('brokers-foto'), result.procedureIds.join(','));
  assert(/Corretores/.test(result.text), result.text);
  assert(/Foto do corretor|Adicionar foto|Alterar foto/.test(result.text), result.text);
  assert(/Salvar foto/.test(result.text), result.text);
  assert(!/Não encontrei/.test(result.text), result.text);
  console.log('OK testBrokerPhoto');
}

async function testGisDocuments() {
  const geral = await ask({ question: 'Como gero a Prancha Geral?', context: withUi('/map') });
  assert(geral.procedureIds.includes('gis-prancha-geral'), geral.procedureIds.join(','));
  assert(/Prancha Geral/.test(geral.text), geral.text);

  const lote = await ask({ question: 'Como gero a prancha do lote?', context: withUi('/map') });
  assert(lote.procedureIds.includes('gis-prancha-lote'), lote.procedureIds.join(','));
  assert(/Gerar prancha|Prancha do Lote/.test(lote.text), lote.text);

  const memorial = await ask({ question: 'Como gero o memorial de um lote?', context: withUi('/map') });
  assert(memorial.procedureIds.includes('gis-lot-memorial'), memorial.procedureIds.join(','));
  assert(/Gerar memorial|Memorial Descritivo/.test(memorial.text), memorial.text);

  const confront = await ask({ question: 'Como faço as confrontações no mapa?', context: withUi('/map') });
  assert(confront.procedureIds.includes('gis-confrontacoes'), confront.procedureIds.join(','));
  assert(/Confrontação Automática|Confrontações/.test(confront.text), confront.text);
  console.log('OK testGisDocuments');
}

async function testCoreModules() {
  const venda = await ask({ question: 'Como faço uma venda parcelada?', context: withUi('/map') });
  assert(venda.procedureIds.includes('gis-venda-parcelada'), venda.text);
  const reserva = await ask({ question: 'Como reservo um lote?', context: withUi('/map') });
  assert(reserva.procedureIds.includes('gis-reserva'), reserva.text);
  const cliente = await ask({ question: 'Como cadastro um cliente?', context: withUi('/customers') });
  assert(cliente.procedureIds.includes('customers-cadastro'), cliente.text);
  const fin = await ask({ question: 'Como uso o Financeiro?', context: withUi('/finance') });
  assert(fin.procedureIds.includes('finance-visao-geral'), fin.text);
  const cob = await ask({ question: 'Como emito uma cobrança?', context: withUi('/charges') });
  assert(cob.procedureIds.includes('charges-cobrancas'), cob.text);
  const contrato = await ask({ question: 'Como envio o contrato para assinatura?', context: withUi('/contracts') });
  assert(contrato.procedureIds.includes('contracts-enviar-assinatura'), contrato.text);
  const config = await ask({ question: 'Como configuro o empreendimento no mapa?', context: withUi('/map') });
  assert(config.procedureIds.includes('gis-config-empreendimento'), config.text);
  const split = await ask({ question: 'Como configuro o Split de Recebimentos?', context: withUi('/map') });
  assert(split.procedureIds.includes('gis-split-recebimentos'), split.text);
  console.log('OK testCoreModules');
}

async function testMemorialFollowUpDoesNotSwitchToSale() {
  const context = withUi('/map', { lotModalOpen: true, lotNumber: '59', blockNumber: '03', activeLotTab: 'resumo' });
  const first = await ask({ question: 'Como gero o memorial de um lote?', context });
  assert(/memorial/i.test(first.text), first.text);
  assert(!/Confirmar Venda/.test(first.text), first.text);

  const follow = await ask({
    question: 'Já selecionei. E agora?',
    context,
    history: [
      { role: 'user', text: 'Como gero o memorial de um lote?' },
      { role: 'assistant', text: first.text },
    ],
  });
  assert(/Gerar memorial|Gerar PDF/.test(follow.text), follow.text);
  assert(!/Vender/.test(follow.text), follow.text);
  assert(!/Confirmar Venda/.test(follow.text), follow.text);
  assert(!/Reservar/.test(follow.text), follow.text);
  console.log('OK testMemorialFollowUpDoesNotSwitchToSale');
}

function testGoalSwitch() {
  const memorial = resolveAssistantActiveGoal({
    question: 'Já selecionei. E agora?',
    history: [{ role: 'user', text: 'Como gero o memorial de um lote?' }],
  });
  assert(memorial?.id === 'gis.lot.memorial', JSON.stringify(memorial));

  const switched = resolveAssistantActiveGoal({
    question: 'Quero pôr a foto do corretor. Como faço?',
    history: [{ role: 'user', text: 'Como gero o memorial de um lote?' }],
  });
  assert(switched?.id === 'broker.photo.update', JSON.stringify(switched));
  console.log('OK testGoalSwitch');
}

async function testBrokerRbacAndTenantPack() {
  const broker = await ask({
    question: 'Como uso o Financeiro?',
    context: withUi('/map', {}, { role: 'BROKER' }),
  });
  assert(broker.kind === 'forbidden' || broker.text === ASSISTANT_FORBIDDEN_BROKER || /não tem acesso/.test(broker.text), broker.text);

  const packed = packAssistantContext(
    withUi('/dashboard/brokers', { contractId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }),
    { activeGoal: { id: 'broker.photo.update', label: 'foto do corretor' } },
  );
  assert(assertPackedContextHasNoPii(packed), packed);
  assert(!packed.includes('dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 'sem UUID');
  assert(!/\b(password|senha|service_role|jwt|api[_-]?key)\b/i.test(packed), packed);

  const { hydrateAssistantUiContext } = await import('../lib/assistant/hydrateUiContext');
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const PROJECT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const isolated = await hydrateAssistantUiContext({
    tenantId: TENANT_A,
    hints: { projectId: PROJECT_B, lotModalOpen: true },
    loaders: {
      async loadProject(id) {
        if (id === PROJECT_B) {
          return {
            id: PROJECT_B,
            tenantId: '22222222-2222-4222-8222-222222222222',
            name: 'Empreendimento Alheio',
            contractModel: 'PADRAO',
          };
        }
        return null;
      },
      async loadLot() {
        return null;
      },
      async loadContract() {
        return null;
      },
    },
  });
  assert(isolated.rejectedForeignTenant, 'projectId de outro tenant deve ser rejeitado');
  assert(isolated.ui.projectId === null, 'não usar projectId estrangeiro');
  assert(isolated.ui.projectName === null, 'não vazar nome de outro tenant');
  console.log('OK testBrokerRbacAndTenantPack');
}

function testSimplePhotoAnswerStaysShort() {
  const goal = resolveAssistantActiveGoal({ question: 'Como coloco a foto do corretor?' });
  const composed = composeFromValidatedUi({
    question: 'E agora?',
    context: withUi('/dashboard/brokers'),
    activeGoal: goal,
  });
  assert(composed != null && /Salvar foto/.test(composed), composed || '');
  assert(composed != null && composed.includes(ASSISTANT_CONTINUE_OFFER), composed || '');
  assert(!/erros comuns/i.test(composed || ''), composed || '');
  console.log('OK testSimplePhotoAnswerStaysShort');
}

function testUnknownStillUnknown() {
  const procedures = listAssistantProcedures();
  assert(!procedures.some((item) => /foguete/.test(item.tags.join(' '))), 'KB não pode inventar foguete');
  console.log('OK testUnknownStillUnknown');
}

async function main() {
  testKbCoverageGrew();
  await testBrokerPhoto();
  await testGisDocuments();
  await testCoreModules();
  await testMemorialFollowUpDoesNotSwitchToSale();
  testGoalSwitch();
  await testBrokerRbacAndTenantPack();
  testSimplePhotoAnswerStaysShort();
  testUnknownStillUnknown();
  assert(ASSISTANT_UNKNOWN_ANSWER.includes('Não encontrei'), 'unknown oficial');
  console.log('ASSISTANT_SV_FASE_2A_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
