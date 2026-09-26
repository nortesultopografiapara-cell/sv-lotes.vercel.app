/**
 * Assistente SV — Fase 2B (Capability Registry / conhecimento vivo).
 * npx tsx scripts/mandatory-assistant-sv-fase-2b-tests.ts
 */
import { resolveAssistantActiveGoal } from '../lib/assistant/activeGoal';
import {
  ASSISTANT_CAPABILITY_LIMIT,
  ASSISTANT_FORBIDDEN_BROKER,
  ASSISTANT_UNKNOWN_ANSWER,
} from '../lib/assistant/constants';
import { auditAssistantCapabilityDrift } from '../lib/assistant/capabilities/drift';
import { packAssistantCapabilities } from '../lib/assistant/capabilities/pack';
import {
  countAssistantCapabilities,
  listAssistantCapabilities,
  listDerivedAssistantCapabilities,
  listExplicitAssistantCapabilities,
} from '../lib/assistant/capabilities/registry';
import { retrieveAssistantCapabilities } from '../lib/assistant/capabilities/retrieve';
import { buildSafeAssistantContext } from '../lib/assistant/context';
import { localGroundedProvider } from '../lib/assistant/model/localGroundedProvider';
import { assertPackedContextHasNoPii, packAssistantContext } from '../lib/assistant/model/packKnowledge';
import { runAssistantPipeline } from '../lib/assistant/pipeline';
import { EMPTY_ASSISTANT_UI_STATE, type AssistantUiSafeState } from '../lib/assistant/uiSnapshot';
import type { AssistantAskInput, AssistantSafeContext } from '../lib/assistant/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const localDeps = { primary: localGroundedProvider, fallback: localGroundedProvider };

function withUi(
  pathname: string,
  ui: Partial<AssistantUiSafeState> = {},
  extras?: { role?: string },
): AssistantSafeContext {
  return buildSafeAssistantContext({
    pathname,
    role: extras?.role ?? 'ADMIN',
    tenantName: 'Empresa Homologada',
    ui: { ...EMPTY_ASSISTANT_UI_STATE, ...ui },
  });
}

async function ask(input: AssistantAskInput) {
  return runAssistantPipeline(input, localDeps);
}

function testRegistryShape() {
  const counts = countAssistantCapabilities();
  assert(counts.explicit === 6, `explícitas: ${counts.explicit}`);
  assert(counts.derived >= 30, `derivadas: ${counts.derived}`);
  assert(counts.total === counts.explicit + counts.derived, 'soma');
  assert(listExplicitAssistantCapabilities().every((item) => item.origin === 'explicit'), 'origin explicit');
  assert(listDerivedAssistantCapabilities().every((item) => item.origin === 'derived'), 'origin derived');
  const ids = listAssistantCapabilities().map((item) => item.id);
  assert(new Set(ids).size === ids.length, 'ids duplicados');
  console.log(`OK testRegistryShape total=${counts.total} explicit=${counts.explicit} derived=${counts.derived}`);
}

async function testReceivingAccountsSameCapability() {
  const questions = [
    'Como cadastrar as contas recebedoras?',
    'Onde adiciono outra conta para receber?',
    'Quero cadastrar uma conta financeira nova.',
  ];
  const ids: string[] = [];
  for (const question of questions) {
    const result = await ask({ question, context: withUi('/settings') });
    assert(result.kind === 'answer', `${question} -> ${result.kind} ${result.text}`);
    assert((result.capabilityIds || []).includes('finance.accounts.upsert'), `${question} caps=${(result.capabilityIds || []).join(',')}`);
    assert(/Integração Financeira|Contas Financeiras|Nova conta Asaas|Nova conta Inter/.test(result.text), result.text);
    assert(/Criar conta|Salvar alterações/.test(result.text), result.text);
    assert(!/Não encontrei/.test(result.text), result.text);
    assert(!/api[_-]?key|token|secret/i.test(result.text), result.text);
    ids.push((result.capabilityIds || [])[0] || '');
  }
  assert(ids.every((id) => id === 'finance.accounts.upsert'), ids.join(','));
  console.log('OK testReceivingAccountsSameCapability');
}

async function testBrokerPhotoSynonyms() {
  const questions = [
    'Como ponho uma foto no corretor?',
    'Onde altero o avatar do corretor?',
    'Essa foto do corretor muda onde?',
  ];
  for (const question of questions) {
    const result = await ask({ question, context: withUi('/dashboard/brokers') });
    assert(result.kind === 'answer', `${question} ${result.text}`);
    assert((result.capabilityIds || []).includes('broker.photo.update'), `${question} ${(result.capabilityIds || []).join(',')}`);
    assert(/Corretores|Foto do corretor|Adicionar foto|Alterar foto|Salvar foto/.test(result.text), result.text);
  }
  console.log('OK testBrokerPhotoSynonyms');
}

async function testGisCapabilitiesDoNotCollapse() {
  const cases: Array<{ q: string; cap: string; needle: RegExp }> = [
    { q: 'Como gero a Prancha Geral?', cap: 'gis.project.general_plan', needle: /Prancha Geral/ },
    { q: 'Como gero a prancha do lote?', cap: 'gis.lot.sheet', needle: /Prancha do Lote|Gerar prancha/ },
    { q: 'Como gero o memorial de um lote?', cap: 'gis.lot.memorial', needle: /memorial/i },
    { q: 'Como faço as confrontações no mapa?', cap: 'gis.lot.confrontations', needle: /Confrontação|Confrontações/ },
  ];
  const firstIds: string[] = [];
  for (const item of cases) {
    const result = await ask({ question: item.q, context: withUi('/map') });
    assert(result.kind === 'answer', `${item.q} ${result.text}`);
    assert((result.capabilityIds || [])[0] === item.cap || (result.capabilityIds || []).includes(item.cap), `${item.q} ${(result.capabilityIds || []).join(',')}`);
    assert(item.needle.test(result.text), result.text);
    firstIds.push((result.capabilityIds || [])[0]);
  }
  assert(new Set(firstIds).size === 4, `GIS colapsou: ${firstIds.join(',')}`);
  console.log('OK testGisCapabilitiesDoNotCollapse');
}

async function testCapabilityPlusSpecializedKb() {
  const result = await ask({
    question: 'Como gero o memorial de um lote?',
    context: withUi('/map'),
  });
  assert((result.capabilityIds || []).includes('gis.lot.memorial'), String(result.capabilityIds));
  assert(result.procedureIds.includes('gis-lot-memorial'), result.procedureIds.join(','));
  console.log('OK testCapabilityPlusSpecializedKb');
}

async function testActiveGoalSwitchKeepsCapability() {
  const first = await ask({
    question: 'Como cadastrar as contas recebedoras?',
    context: withUi('/settings'),
  });
  const follow = await ask({
    question: 'Quero pôr a foto do corretor. Como faço?',
    context: withUi('/dashboard/brokers'),
    history: [
      { role: 'user', text: 'Como cadastrar as contas recebedoras?' },
      { role: 'assistant', text: first.text },
    ],
  });
  assert(resolveAssistantActiveGoal({ question: 'Quero pôr a foto do corretor. Como faço?' })?.id === 'broker.photo.update', 'goal');
  assert((follow.capabilityIds || []).includes('broker.photo.update'), String(follow.capabilityIds));
  assert(!/Nova conta Asaas/.test(follow.text), follow.text);
  console.log('OK testActiveGoalSwitchKeepsCapability');
}

async function testKnowledgeGapLoggedNotLearned() {
  const before = countAssistantCapabilities().total;
  const logs: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    logs.push(args.map((item) => String(item)).join(' '));
  };
  let result;
  try {
    result = await ask({
      question: 'Como lanço um foguete espacial no SV Lotes?',
      context: withUi('/dashboard'),
    });
  } finally {
    console.info = original;
  }
  assert(result.kind === 'unknown', result.text);
  assert(result.text === ASSISTANT_UNKNOWN_ANSWER, result.text);
  assert(logs.some((line) => line.includes('[assistant_knowledge_gap]')), logs.join('\n'));
  assert(countAssistantCapabilities().total === before, 'não aprender com o usuário');
  const again = await ask({
    question: 'Como lanço um foguete espacial no SV Lotes?',
    context: withUi('/dashboard'),
  });
  assert(again.kind === 'unknown', again.text);
  assert(countAssistantCapabilities().total === before, 'segunda pergunta também não grava KB');
  console.log('OK testKnowledgeGapLoggedNotLearned');
}

function testPackedFactsHaveNoSourceOrSecrets() {
  const packed = packAssistantCapabilities(listExplicitAssistantCapabilities());
  assert(!/\.tsx|\.ts\b|sourceOfTruth|password|service_role|jwt/i.test(packed), packed.slice(0, 400));
  assert(!/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(packed), packed);
  const contextPacked = packAssistantContext(withUi('/settings', { contractId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }));
  assert(assertPackedContextHasNoPii(contextPacked), contextPacked);
  assert(!contextPacked.includes('dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 'sem UUID');
  console.log('OK testPackedFactsHaveNoSourceOrSecrets');
}

async function testCostAndRbac() {
  const result = await ask({
    question: 'Como cadastrar as contas recebedoras?',
    context: withUi('/settings'),
  });
  assert((result.capabilityIds || []).length > 0, 'caps');
  assert((result.capabilityIds || []).length <= ASSISTANT_CAPABILITY_LIMIT, String(result.capabilityIds));
  assert((result.packedChars || 0) > 80, String(result.packedChars));
  assert((result.packedChars || 0) < 4000, `payload grande: ${result.packedChars}`);

  const broker = await ask({
    question: 'Como cadastrar as contas recebedoras?',
    context: withUi('/map', {}, { role: 'BROKER' }),
  });
  assert(
    broker.kind === 'forbidden' || broker.text === ASSISTANT_FORBIDDEN_BROKER || /não tem acesso/.test(broker.text),
    broker.text,
  );

  const retrieved = retrieveAssistantCapabilities({
    question: 'Como cadastrar as contas recebedoras?',
    context: withUi('/settings'),
  });
  assert(retrieved.kind === 'answer', 'retrieve contas');
  assert(retrieved.capabilities[0]?.id === 'finance.accounts.upsert', retrieved.capabilities.map((item) => item.id).join(','));
  console.log('OK testCostAndRbac');
}

function testDriftAudit() {
  const drift = auditAssistantCapabilityDrift();
  assert(drift.missingSources.length === 0, drift.missingSources.join(','));
  assert(drift.missingRoutes.length === 0, drift.missingRoutes.join(','));
  assert(drift.proceduresWithoutCapability.length === 0, drift.proceduresWithoutCapability.join(','));
  assert(drift.uncoveredNav.includes('/my-sales'), 'my-sales deve aparecer como aviso de menu');
  console.log('OK testDriftAudit', drift.summary);
}

async function testNoLiveDatabaseClaim() {
  const result = await ask({
    question: 'Tem parcela vencida hoje?',
    context: withUi('/finance'),
  });
  assert(!/consultei o banco|saldo real|lotes disponíveis atuais/i.test(result.text), result.text);
  console.log('OK testNoLiveDatabaseClaim');
}

async function main() {
  testRegistryShape();
  await testReceivingAccountsSameCapability();
  await testBrokerPhotoSynonyms();
  await testGisCapabilitiesDoNotCollapse();
  await testCapabilityPlusSpecializedKb();
  await testActiveGoalSwitchKeepsCapability();
  await testKnowledgeGapLoggedNotLearned();
  testPackedFactsHaveNoSourceOrSecrets();
  await testCostAndRbac();
  testDriftAudit();
  await testNoLiveDatabaseClaim();
  console.log('ASSISTANT_SV_FASE_2B_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
