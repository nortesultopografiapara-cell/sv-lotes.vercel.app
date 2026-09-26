/**
 * Assistente SV — Fase 2B.1 (fechar lacunas reais do Capability Registry).
 * npx tsx scripts/mandatory-assistant-sv-fase-2b.1-tests.ts
 */
import { resolveAssistantActiveGoal } from '../lib/assistant/activeGoal';
import { ASSISTANT_FORBIDDEN_BROKER, ASSISTANT_UNKNOWN_ANSWER } from '../lib/assistant/constants';
import { auditAssistantCapabilityDrift } from '../lib/assistant/capabilities/drift';
import {
  countAssistantCapabilities,
  listAssistantCapabilities,
  listExplicitAssistantCapabilities,
} from '../lib/assistant/capabilities/registry';
import { retrieveAssistantCapabilities } from '../lib/assistant/capabilities/retrieve';
import { buildSafeAssistantContext } from '../lib/assistant/context';
import { localGroundedProvider } from '../lib/assistant/model/localGroundedProvider';
import { runAssistantPipeline } from '../lib/assistant/pipeline';
import { EMPTY_ASSISTANT_UI_STATE } from '../lib/assistant/uiSnapshot';
import type { AssistantAskInput, AssistantSafeContext } from '../lib/assistant/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const localDeps = { primary: localGroundedProvider, fallback: localGroundedProvider };

function withUi(pathname: string, extras?: { role?: string }): AssistantSafeContext {
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

function firstCap(ids: string[] | undefined) {
  return (ids || [])[0] || '';
}

function testExplicitCount() {
  const counts = countAssistantCapabilities();
  assert(counts.explicit === 20, `explícitas 2B.1: ${counts.explicit}`);
  assert(counts.derived >= 30, `derivadas: ${counts.derived}`);
  const ids = listExplicitAssistantCapabilities().map((item) => item.id);
  for (const id of [
    'sale.release',
    'sale.termination.desistencia',
    'sale.termination.distrato',
    'sale.termination.inadimplencia',
    'sale.lot.swap',
    'sale.title.transfer',
    'sale.edit',
    'gis.sold.view_contract',
    'gis.sold.view_finance',
    'broker.my_sales',
    'settings.data_migration',
    'finance.asaas.installment',
    'client_portal.access',
    'contract.cancel',
  ]) {
    assert(ids.includes(id), `faltou explícita ${id}`);
  }
  assert(new Set(listAssistantCapabilities().map((item) => item.id)).size === listAssistantCapabilities().length, 'ids duplicados');
  console.log(`OK testExplicitCount total=${counts.total} explicit=${counts.explicit} derived=${counts.derived}`);
}

async function testHistoricalGapsWereMissingCoverage() {
  const cases: Array<{ q: string; cap: string; reason: 'capability_ausente' }> = [
    {
      q: 'Como libero um lote já vendido para disponível pois o cliente desistiu?',
      cap: 'sale.termination.desistencia',
      reason: 'capability_ausente',
    },
    {
      q: 'Como eu faço um distrato de um lote no sistema SV Lotes?',
      cap: 'sale.termination.distrato',
      reason: 'capability_ausente',
    },
  ];
  for (const item of cases) {
    const result = await ask({ question: item.q, context: withUi('/map') });
    assert(result.kind === 'answer', `${item.q} -> ${result.kind} ${result.text}`);
    assert(
      (result.capabilityIds || []).includes(item.cap),
      `${item.reason} agora resolvida: ${item.q} caps=${(result.capabilityIds || []).join(',')}`,
    );
    assert(!/Não encontrei/.test(result.text), result.text);
    assert(!/executei|consultei o banco|alterei o status/i.test(result.text), result.text);
  }
  console.log('OK testHistoricalGapsWereMissingCoverage');
}

async function testHomologationSynonymsWithoutExactPhrase() {
  const cases: Array<{ q: string; cap: string; needle: RegExp }> = [
    { q: 'O cliente desistiu da compra. O que faço?', cap: 'sale.termination.desistencia', needle: /Disponibilizar|Desistência do cliente/ },
    { q: 'Preciso fazer o distrato desse lote.', cap: 'sale.termination.distrato', needle: /Distrato|Disponibilizar/ },
    { q: 'Como cancelo uma venda e libero o lote?', cap: 'sale.release', needle: /Disponibilizar|Operações da venda|Encerrar venda/ },
    { q: 'Esse lote vendido precisa voltar para disponível.', cap: 'sale.release', needle: /Disponibilizar|Encerrar venda/ },
  ];
  for (const item of cases) {
    const goal = resolveAssistantActiveGoal({ question: item.q });
    assert(goal?.id === item.cap, `goal "${item.q}" -> ${goal?.id}`);
    const result = await ask({ question: item.q, context: withUi('/map') });
    assert(result.kind === 'answer', `${item.q} ${result.text}`);
    assert((result.capabilityIds || []).includes(item.cap), `${item.q} caps=${(result.capabilityIds || []).join(',')}`);
    assert(item.needle.test(result.text), result.text);
    assert(!/mude o status|altere o status para Disponível|só mudar o status/i.test(result.text), result.text);
  }
  console.log('OK testHomologationSynonymsWithoutExactPhrase');
}

async function testOperationsStayDistinct() {
  const desist = await ask({ question: 'O cliente desistiu da compra. O que faço?', context: withUi('/map') });
  const distrato = await ask({ question: 'Preciso fazer o distrato desse lote.', context: withUi('/map') });
  const release = await ask({ question: 'Como cancelo uma venda e libero o lote?', context: withUi('/map') });
  const swap = await ask({ question: 'Como faço a troca de lote da venda?', context: withUi('/map') });
  const cancelContract = await ask({ question: 'Como cancelo um contrato?', context: withUi('/contracts') });

  assert(firstCap(desist.capabilityIds) === 'sale.termination.desistencia', String(desist.capabilityIds));
  assert(firstCap(distrato.capabilityIds) === 'sale.termination.distrato', String(distrato.capabilityIds));
  assert(firstCap(release.capabilityIds) === 'sale.release', String(release.capabilityIds));
  assert((swap.capabilityIds || []).includes('sale.lot.swap'), String(swap.capabilityIds));
  assert((cancelContract.capabilityIds || []).includes('contract.cancel'), String(cancelContract.capabilityIds));
  assert(!/Confirmar liberação do lote/.test(cancelContract.text) || /não devolve o lote|não devolve/i.test(cancelContract.text), cancelContract.text);
  assert(/não devolve o lote|não volta a Disponível|não devolve/i.test(cancelContract.text), cancelContract.text);
  assert(firstCap(desist.capabilityIds) !== firstCap(distrato.capabilityIds), 'desistência colapsou em distrato');
  assert(firstCap(release.capabilityIds) !== 'contract.cancel', 'liberar lote colapsou em cancelar contrato');
  console.log('OK testOperationsStayDistinct');
}

async function testPhase2aInventoryGapsNowCovered() {
  const cases: Array<{ q: string; cap: string; needle: RegExp }> = [
    { q: 'Como edito a venda de um lote vendido?', cap: 'sale.edit', needle: /Editar Venda/ },
    { q: 'Como vejo o contrato deste lote vendido?', cap: 'gis.sold.view_contract', needle: /Ver Contrato/ },
    { q: 'Como vejo o financeiro deste lote vendido?', cap: 'gis.sold.view_finance', needle: /Ver Financeiro/ },
    { q: 'Onde o corretor consulta Minhas Vendas?', cap: 'broker.my_sales', needle: /Minhas Vendas/ },
    { q: 'Como uso o wizard de migração de dados?', cap: 'settings.data_migration', needle: /Iniciar Migração|Assistente/ },
    { q: 'Como sincronizo o Asaas no Financeiro?', cap: 'finance.asaas.installment', needle: /Sincronizar Asaas|Gerar Cobrança/ },
    { q: 'Como o comprador acessa o Portal do Cliente?', cap: 'client_portal.access', needle: /portal-cliente|Portal do Cliente/ },
  ];
  for (const item of cases) {
    const result = await ask({ question: item.q, context: withUi('/map') });
    assert(result.kind === 'answer', `${item.q} ${result.text}`);
    assert((result.capabilityIds || []).includes(item.cap), `${item.q} caps=${(result.capabilityIds || []).join(',')}`);
    assert(item.needle.test(result.text), result.text);
  }
  console.log('OK testPhase2aInventoryGapsNowCovered');
}

async function testDoesNotCollapseWithExistingGis() {
  const reserve = await ask({ question: 'Como reservo um lote?', context: withUi('/map') });
  const sell = await ask({ question: 'Como faço uma venda parcelada?', context: withUi('/map') });
  assert((reserve.capabilityIds || [])[0] === 'gis.lot.reserve', String(reserve.capabilityIds));
  assert((sell.capabilityIds || []).includes('gis.lot.sell.installments'), String(sell.capabilityIds));
  assert((reserve.capabilityIds || [])[0] !== 'sale.release', String(reserve.capabilityIds));
  console.log('OK testDoesNotCollapseWithExistingGis');
}

async function testBrokerCannotReleaseLot() {
  const result = await ask({
    question: 'Como eu faço um distrato de um lote no sistema SV Lotes?',
    context: withUi('/map', { role: 'BROKER' }),
  });
  assert(
    result.kind === 'forbidden' || result.text === ASSISTANT_FORBIDDEN_BROKER || /não tem acesso/.test(result.text),
    result.text,
  );
  console.log('OK testBrokerCannotReleaseLot');
}

async function testNoLiveWriteOrInventedPolicy() {
  const result = await ask({
    question: 'Preciso fazer o distrato desse lote.',
    context: withUi('/map'),
  });
  assert(!/\b\d+\s*%/.test(result.text), `não inventar percentual: ${result.text}`);
  assert(!/executei o distrato|lote liberado com sucesso|consultei a venda/i.test(result.text), result.text);
  assert(!/api[_-]?key|token|secret|service_role/i.test(result.text), result.text);
  console.log('OK testNoLiveWriteOrInventedPolicy');
}

function testDriftMySalesCovered() {
  const drift = auditAssistantCapabilityDrift();
  assert(drift.missingSources.length === 0, drift.missingSources.join(','));
  assert(drift.missingRoutes.length === 0, drift.missingRoutes.join(','));
  assert(drift.proceduresWithoutCapability.length === 0, drift.proceduresWithoutCapability.join(','));
  assert(!drift.uncoveredNav.includes('/my-sales'), `my-sales ainda descoberto: ${drift.uncoveredNav.join(',')}`);
  console.log('OK testDriftMySalesCovered', drift.summary);
}

async function testUnknownStillUnknown() {
  const result = await ask({
    question: 'Como lanço um foguete espacial no SV Lotes?',
    context: withUi('/dashboard'),
  });
  assert(result.kind === 'unknown', result.kind);
  assert(result.text === ASSISTANT_UNKNOWN_ANSWER, result.text);
  console.log('OK testUnknownStillUnknown');
}

function testTitleTransferAndSwapGoals() {
  assert(resolveAssistantActiveGoal({ question: 'Como faço transferência de titularidade?' })?.id === 'sale.title.transfer', 'titularidade');
  assert(resolveAssistantActiveGoal({ question: 'Quero trocar o lote da venda' })?.id === 'sale.lot.swap', 'swap');
  const retrieved = retrieveAssistantCapabilities({
    question: 'Como faço a troca de lote da venda?',
    context: withUi('/map'),
    activeGoal: resolveAssistantActiveGoal({ question: 'Como faço a troca de lote da venda?' }),
  });
  assert(retrieved.kind === 'answer', 'retrieve swap');
  assert(retrieved.capabilities.some((item) => item.id === 'sale.lot.swap'), retrieved.capabilities.map((item) => item.id).join(','));
  console.log('OK testTitleTransferAndSwapGoals');
}

async function main() {
  testExplicitCount();
  await testHistoricalGapsWereMissingCoverage();
  await testHomologationSynonymsWithoutExactPhrase();
  await testOperationsStayDistinct();
  await testPhase2aInventoryGapsNowCovered();
  await testDoesNotCollapseWithExistingGis();
  await testBrokerCannotReleaseLot();
  await testNoLiveWriteOrInventedPolicy();
  testDriftMySalesCovered();
  await testUnknownStillUnknown();
  testTitleTransferAndSwapGoals();
  console.log('ASSISTANT_SV_FASE_2B.1_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
