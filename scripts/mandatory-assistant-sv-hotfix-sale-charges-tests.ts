/**
 * Assistente SV — hotfix pré-go-live: aba Cobranças da venda + sale.latest.
 * npx tsx scripts/mandatory-assistant-sv-hotfix-sale-charges-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveAssistantActiveGoal } from '../lib/assistant/activeGoal';
import { retrieveAssistantCapabilities } from '../lib/assistant/capabilities/retrieve';
import { listExplicitAssistantCapabilities } from '../lib/assistant/capabilities/registry';
import { ASSISTANT_FORBIDDEN_BROKER } from '../lib/assistant/constants';
import { buildSafeAssistantContext } from '../lib/assistant/context';
import { hydrateAssistantUiContext, type AssistantEntityLoaders } from '../lib/assistant/hydrateUiContext';
import { localGroundedProvider } from '../lib/assistant/model/localGroundedProvider';
import { assertPackedContextHasNoPii, packAssistantContext } from '../lib/assistant/model/packKnowledge';
import { runAssistantPipeline } from '../lib/assistant/pipeline';
import { executeAssistantReadonlyTool } from '../lib/assistant/readonly/execute';
import { retrieveAssistantProcedures } from '../lib/assistant/retrieve';
import { looksLikeGlobalChargeQuestion, looksLikeSaleChargeQuestion } from '../lib/assistant/saleChargesIntent';
import { EMPTY_ASSISTANT_UI_STATE, scopeAssistantUiToRoute, type AssistantUiSafeState } from '../lib/assistant/uiSnapshot';
import type { AssistantReadonlyDb } from '../lib/assistant/readonly/types';
import type { AssistantAskInput, AssistantSafeContext } from '../lib/assistant/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const root = process.cwd();
const localDeps = { primary: localGroundedProvider, fallback: localGroundedProvider };
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const PROJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOT_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LOT_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function withUi(
  pathname: string,
  ui: Partial<AssistantUiSafeState>,
  extras?: { role?: string; projectName?: string | null },
): AssistantSafeContext {
  return buildSafeAssistantContext({
    pathname,
    role: extras?.role ?? 'ADMIN',
    tenantName: 'Empresa Homologada',
    projectName: extras?.projectName ?? ui.projectName ?? null,
    ui: { ...EMPTY_ASSISTANT_UI_STATE, ...ui },
  });
}

function cobrancasUi(overrides?: Partial<AssistantUiSafeState>): AssistantSafeContext {
  return withUi('/map', {
    lotModalOpen: true,
    saleEditOpen: true,
    saleEditTab: 'cobrancas',
    lotStatus: 'Vendido',
    blockNumber: '03',
    lotNumber: '12',
    saleChargesReady: true,
    saleChargesHasAccount: true,
    saleChargesInstallments: 10,
    saleChargesPaid: 2,
    saleChargesGenerated: 4,
    saleChargesMissing: 3,
    saleChargesCancelled: 0,
    saleChargesPending: 8,
    saleChargesEligible: 3,
    ...overrides,
  });
}

async function ask(input: AssistantAskInput) {
  return runAssistantPipeline(input, localDeps);
}

function mockLoaders(): AssistantEntityLoaders {
  return {
    async loadProject(id) {
      if (id === PROJECT_A) {
        return { id: PROJECT_A, tenantId: TENANT_A, name: 'Chacreamento Araguaia', contractModel: 'PADRAO' };
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
          lotNumber: '12',
          status: 'Vendido',
        };
      }
      if (id === LOT_B) {
        return {
          id: LOT_B,
          tenantId: TENANT_A,
          projectId: PROJECT_A,
          blockNumber: '04',
          lotNumber: '08',
          status: 'Vendido',
        };
      }
      return null;
    },
    async loadContract() {
      return null;
    },
  };
}

function createPreviewLikeDb(store: Record<string, Array<Record<string, unknown>>>): AssistantReadonlyDb {
  return {
    from(table: string) {
      let rows = [...(store[table] || [])];
      let selectError: string | null = null;
      const api: any = {
        select(columns?: string) {
          if (typeof columns === 'string') {
            if (/\bfinal_value\b/.test(columns)) selectError = 'column sales.final_value does not exist';
            if (/projects\s*:\s*project_id/.test(columns) || /blocks\s*:\s*block_id/.test(columns)) {
              selectError = 'Could not find a relationship between sales and projects in the schema cache';
            }
          }
          return api;
        },
        eq(column: string, value: string) {
          rows = rows.filter((row) => String(row[column]) === String(value));
          return api;
        },
        or(filter: string) {
          const values = [...filter.matchAll(/eq\.([^,]+)/g)].map((item) => item[1]);
          rows = rows.filter(
            (row) => values.includes(String(row.tenant_id || '')) || values.includes(String(row.company_id || '')),
          );
          return api;
        },
        in(column: string, values: string[]) {
          rows = rows.filter((row) => values.includes(String(row[column])));
          return api;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          const asc = opts?.ascending !== false;
          rows = [...rows].sort((a, b) => {
            const av = String(a[column] ?? '');
            const bv = String(b[column] ?? '');
            if (av === bv) return 0;
            return (av > bv ? 1 : -1) * (asc ? 1 : -1);
          });
          return api;
        },
        limit(count: number) {
          rows = rows.slice(0, count);
          return api;
        },
        maybeSingle() {
          if (selectError) return Promise.resolve({ data: null, error: { message: selectError } });
          return Promise.resolve({ data: rows[0] || null, error: null });
        },
        then(
          resolve: (value: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          if (selectError) {
            return Promise.resolve({ data: null, error: { message: selectError } }).then(resolve, reject);
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
}

function saleStore() {
  return {
    sales: [
      {
        id: 'sale-old',
        tenant_id: TENANT_A,
        status: 'ACTIVE',
        sale_date: '2026-09-01',
        created_at: '2026-09-01T10:00:00Z',
        total_value: 10000,
        agreed_price: 10000,
        broker_id: 'broker-a',
        project_id: PROJECT_A,
        block_id: 'block-old',
      },
      {
        id: 'sale-latest',
        tenant_id: TENANT_A,
        status: 'ACTIVE',
        sale_date: '2026-09-18',
        created_at: '2026-09-18T15:00:00Z',
        total_value: 75000,
        agreed_price: 75000,
        broker_id: 'broker-a',
        project_id: PROJECT_A,
        block_id: 'block-12',
      },
      {
        id: 'sale-other-tenant',
        tenant_id: TENANT_B,
        status: 'ACTIVE',
        sale_date: '2026-09-25',
        created_at: '2026-09-25T12:00:00Z',
        total_value: 999999,
        agreed_price: 999999,
        broker_id: 'broker-b',
        project_id: 'proj-b',
        block_id: 'block-b',
      },
    ],
    projects: [{ id: PROJECT_A, name: 'Chacreamento Araguaia', tenant_id: TENANT_A }],
    blocks: [
      { id: 'block-12', block_name: '03', name: '03', number: '12', lot_number: '12', tenant_id: TENANT_A },
      { id: 'block-old', block_name: '01', number: '01', tenant_id: TENANT_A },
    ],
    brokers: [{ id: 'broker-a', user_id: 'user-a', tenant_id: TENANT_A }],
  };
}

async function testGenerateBoletosOnSaleChargesTab() {
  const result = await ask({
    question: 'Como gero os boletos desta venda?',
    context: cobrancasUi(),
  });
  assert(result.kind === 'answer', result.text);
  assert(/já está na aba Cobranças/i.test(result.text), result.text);
  assert(/Gerar cobranças faltantes/.test(result.text), result.text);
  assert(!/módulo Cobranças|Central operacional|não na tela de edição/i.test(result.text), result.text);
  assert((result.capabilityIds || []).includes('sale.charges') || result.source === 'local', String(result.capabilityIds));
  console.log('OK testGenerateBoletosOnSaleChargesTab');
}

async function testThisScreenIsEasier() {
  const result = await ask({
    question: 'E nessa tela não é mais fácil para gerar as cobranças?',
    context: cobrancasUi(),
  });
  assert(result.kind === 'answer', result.text);
  assert(/já está na aba Cobranças/i.test(result.text), result.text);
  assert(/Gerar cobranças faltantes/.test(result.text), result.text);
  assert(!/não na tela de edição|não é feita na tela de edição|módulo Cobranças/i.test(result.text), result.text);
  console.log('OK testThisScreenIsEasier');
}

async function testMissingChargesRecognized() {
  const result = await ask({
    question: 'Quero gerar as cobranças que faltam desta venda',
    context: cobrancasUi({ saleChargesMissing: 3, saleChargesEligible: 3 }),
  });
  assert(/3 cobrança/.test(result.text), result.text);
  assert(/Gerar cobranças faltantes/.test(result.text), result.text);
  console.log('OK testMissingChargesRecognized');
}

async function testNoMissingDoesNotRegenerate() {
  const result = await ask({
    question: 'Como gero os boletos desta venda?',
    context: cobrancasUi({ saleChargesMissing: 0, saleChargesEligible: 0, saleChargesGenerated: 10 }),
  });
  assert(/Não há cobranças faltantes/.test(result.text), result.text);
  assert(!/Clique em Gerar cobranças faltantes/.test(result.text), result.text);
  assert(/Atualizar situação das cobranças/.test(result.text), result.text);
  console.log('OK testNoMissingDoesNotRegenerate');
}

async function testSyncStatusAndAlreadyGenerated() {
  const first = await ask({
    question: 'Como gero os boletos desta venda?',
    context: cobrancasUi(),
  });
  const follow = await ask({
    question: 'Já gerei. O que faço agora?',
    context: cobrancasUi({ saleChargesMissing: 0, saleChargesGenerated: 7 }),
    history: [
      { role: 'user', text: 'Como gero os boletos desta venda?' },
      { role: 'assistant', text: first.text },
    ],
  });
  assert(resolveAssistantActiveGoal({
    question: 'Já gerei. O que faço agora?',
    history: [
      { role: 'user', text: 'Como gero os boletos desta venda?' },
      { role: 'assistant', text: first.text },
    ],
    context: cobrancasUi({ saleChargesMissing: 0 }),
  })?.id === 'sale.charges', 'activeGoal deve permanecer em sale.charges');
  assert(/Atualizar situação das cobranças/.test(follow.text), follow.text);
  assert(!/Clique em Gerar cobranças faltantes/.test(follow.text), follow.text);
  assert(!/módulo Cobranças/i.test(follow.text), follow.text);
  console.log('OK testSyncStatusAndAlreadyGenerated');
}

async function testContinuityEAgora() {
  const result = await ask({
    question: 'E agora?',
    context: cobrancasUi(),
    history: [
      { role: 'user', text: 'Como gero os boletos desta venda?' },
      { role: 'assistant', text: 'Você já está na aba Cobranças desta venda. Clique em Gerar cobranças faltantes.' },
    ],
  });
  assert(resolveAssistantActiveGoal({
    question: 'E agora?',
    history: [{ role: 'user', text: 'Como gero os boletos desta venda?' }],
    context: cobrancasUi(),
  })?.id === 'sale.charges', 'E agora mantém sale.charges');
  assert(/Gerar cobranças faltantes|Atualizar situação/.test(result.text), result.text);
  assert(!/módulo Cobranças|Central operacional/i.test(result.text), result.text);
  console.log('OK testContinuityEAgora');
}

async function testGlobalMassChargesStayDistinct() {
  assert(looksLikeGlobalChargeQuestion('Quero gerar cobranças de várias vendas', '/map'), 'várias vendas é global');
  assert(!looksLikeSaleChargeQuestion('Quero gerar cobranças de várias vendas', '/map'), 'não colapsar em venda');
  const globalAsk = await ask({
    question: 'Quero gerar cobranças de várias vendas',
    context: withUi('/charges', {}),
  });
  assert(/Central operacional|Cobranças selecionadas|Gerar cobranças selecionadas|Abra Cobranças/i.test(globalAsk.text), globalAsk.text);
  assert(!/Gerar cobranças faltantes/.test(globalAsk.text), globalAsk.text);

  const saleAsk = await ask({
    question: 'Quero gerar as cobranças que faltam desta venda',
    context: cobrancasUi(),
  });
  assert(/Gerar cobranças faltantes/.test(saleAsk.text), saleAsk.text);
  assert(!/Gerar cobranças selecionadas/.test(saleAsk.text), saleAsk.text);

  const retrievedSale = retrieveAssistantCapabilities({
    question: 'Como gero os boletos desta venda?',
    context: cobrancasUi(),
    activeGoal: resolveAssistantActiveGoal({ question: 'Como gero os boletos desta venda?', context: cobrancasUi() }),
  });
  assert(retrievedSale.capabilities[0]?.id === 'sale.charges', String(retrievedSale.capabilities.map((item) => item.id)));

  const retrievedGlobal = retrieveAssistantCapabilities({
    question: 'Como emito uma cobrança?',
    context: withUi('/charges', {}),
  });
  assert(retrievedGlobal.capabilities.some((item) => item.id === 'charge.emit'), String(retrievedGlobal.capabilities.map((item) => item.id)));
  console.log('OK testGlobalMassChargesStayDistinct');
}

function testClosingEditSaleInvalidatesTab() {
  const closed = withUi('/map', {
    saleEditOpen: false,
    saleEditTab: 'cobrancas',
    saleChargesMissing: 3,
    saleChargesReady: true,
    lotModalOpen: false,
  });
  assert(closed.ui.saleEditOpen === false, 'modal fechado');
  assert(closed.ui.saleEditTab === null, 'aba invalidada ao fechar');
  assert(closed.ui.saleChargesMissing === null, 'contadores não sobrevivem ao fechar');
  const scoped = scopeAssistantUiToRoute('/map', {
    ...EMPTY_ASSISTANT_UI_STATE,
    saleEditOpen: false,
    saleEditTab: 'cobrancas',
    saleChargesMissing: 3,
  });
  assert(scoped.saleEditTab === null && scoped.saleChargesMissing === null, 'scope GIS reset');
  console.log('OK testClosingEditSaleInvalidatesTab');
}

async function testSwitchingSaleDropsPreviousCounters() {
  const first = await hydrateAssistantUiContext({
    tenantId: TENANT_A,
    pathname: '/map',
    hints: {
      projectId: PROJECT_A,
      lotId: LOT_A,
      saleEditOpen: true,
      saleEditTab: 'cobrancas',
      saleChargesReady: true,
      saleChargesMissing: 3,
    },
    loaders: mockLoaders(),
  });
  assert(first.ui.lotNumber === '12', String(first.ui.lotNumber));
  assert(first.ui.saleChargesMissing === 3, String(first.ui.saleChargesMissing));

  const second = await hydrateAssistantUiContext({
    tenantId: TENANT_A,
    pathname: '/map',
    hints: {
      projectId: PROJECT_A,
      lotId: LOT_B,
      saleEditOpen: true,
      saleEditTab: 'cobrancas',
      saleChargesReady: true,
      saleChargesMissing: 0,
    },
    loaders: mockLoaders(),
  });
  assert(second.ui.lotNumber === '08', 'lote B');
  assert(second.ui.saleChargesMissing === 0, 'contadores da venda A não permanecem');
  assert(second.ui.lotNumber !== first.ui.lotNumber, 'troca de venda');
  console.log('OK testSwitchingSaleDropsPreviousCounters');
}

async function testSaleLatestPreviewSchema() {
  const result = await executeAssistantReadonlyTool({
    toolId: 'sale.latest',
    args: {},
    runtime: {
      tenantId: TENANT_A,
      userId: 'user-a',
      role: 'ADMIN',
      client: createPreviewLikeDb(saleStore()),
      now: new Date('2026-09-26T12:00:00Z'),
    },
  });
  assert(result.ok, JSON.stringify(result));
  if (result.ok && result.facts.toolId === 'sale.latest') {
    assert(result.facts.found === true, 'encontrou venda');
    assert(result.facts.projectName === 'Chacreamento Araguaia', String(result.facts.projectName));
    assert(/Quadra 03/.test(String(result.facts.lotLabel)), String(result.facts.lotLabel));
    assert(result.facts.amount === 75000, String(result.facts.amount));
    assert(result.facts.saleDate === '2026-09-18', String(result.facts.saleDate));
  }
  console.log('OK testSaleLatestPreviewSchema');
}

async function testSaleLatestTenantIsolation() {
  const result = await executeAssistantReadonlyTool({
    toolId: 'sale.latest',
    args: {},
    runtime: {
      tenantId: TENANT_A,
      userId: 'user-a',
      role: 'ADMIN',
      client: createPreviewLikeDb(saleStore()),
      now: new Date('2026-09-26T12:00:00Z'),
    },
  });
  assert(result.ok && result.facts.toolId === 'sale.latest', 'ok');
  if (result.ok && result.facts.toolId === 'sale.latest') {
    assert(result.facts.amount !== 999999, 'não vaza tenant B');
    assert(result.facts.projectName !== null && !/tenant-b/i.test(String(result.facts.projectName)), 'projeto do tenant A');
  }
  console.log('OK testSaleLatestTenantIsolation');
}

async function testBrokerOwnerRbac() {
  const brokerCharges = await ask({
    question: 'Como gero os boletos desta venda?',
    context: cobrancasUi(),
  });
  const brokerCtx = withUi('/map', cobrancasUi().ui, { role: 'BROKER' });
  const brokerAsk = await ask({
    question: 'Como gero os boletos desta venda?',
    context: brokerCtx,
  });
  assert(
    brokerAsk.kind === 'forbidden' || brokerAsk.text === ASSISTANT_FORBIDDEN_BROKER || /não tem acesso/.test(brokerAsk.text),
    brokerAsk.text,
  );
  assert(brokerCharges.kind === 'answer', 'ADMIN continua orientando');

  const brokerLatest = await executeAssistantReadonlyTool({
    toolId: 'sale.latest',
    args: {},
    runtime: {
      tenantId: TENANT_A,
      userId: 'user-other',
      role: 'BROKER',
      client: createPreviewLikeDb(saleStore()),
      now: new Date('2026-09-26T12:00:00Z'),
    },
  });
  assert(brokerLatest.ok && brokerLatest.facts.toolId === 'sale.latest', 'broker tool allowed');
  if (brokerLatest.ok && brokerLatest.facts.toolId === 'sale.latest') {
    assert(brokerLatest.facts.found === false, 'broker sem vínculo não vê venda de outro');
    assert(brokerLatest.facts.amount == null, 'broker não recebe valor');
  }

  const ownerLatest = await executeAssistantReadonlyTool({
    toolId: 'sale.latest',
    args: {},
    runtime: {
      tenantId: TENANT_A,
      userId: 'owner-a',
      role: 'OWNER',
      client: createPreviewLikeDb({
        ...saleStore(),
        owner_project_access: [
          {
            id: 'acl-1',
            tenant_id: TENANT_A,
            user_id: 'owner-a',
            project_id: PROJECT_A,
            can_view_dashboard: true,
            can_view_map: true,
            can_view_finance: true,
            can_view_contracts: true,
          },
        ],
      }),
      now: new Date('2026-09-26T12:00:00Z'),
    },
  });
  assert(ownerLatest.ok && ownerLatest.facts.toolId === 'sale.latest' && ownerLatest.facts.found, JSON.stringify(ownerLatest));
  console.log('OK testBrokerOwnerRbac');
}

function testNoPiiInPackedUi() {
  const packed = packAssistantContext(cobrancasUi());
  assert(assertPackedContextHasNoPii(packed), packed);
  assert(!/123\.456\.789-00/.test(packed), packed);
  assert(!/eyJ/.test(packed), packed);
  assert(!/financialAccountName|Agência|conta bancária/i.test(packed), packed);
  assert(!/customerName|Maria Silva/.test(packed), packed);
  const bridge = fs.readFileSync(path.join(root, 'components/assistant/AssistantSaleChargesUiBridge.tsx'), 'utf8');
  assert(!/customerName|customerEmail|customerPhone|financialAccountName/.test(bridge), 'bridge não envia PII');
  console.log('OK testNoPiiInPackedUi');
}

function testAssistantStillReadOnly() {
  const files = [
    'lib/assistant/readonly/execute.ts',
    'lib/assistant/pipeline.ts',
    'lib/assistant/composeFromUi.ts',
    'components/assistant/AssistantSaleChargesUiBridge.tsx',
  ];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert(!/\.insert\s*\(/.test(text), `${file} insert`);
    assert(!/\.update\s*\(/.test(text), `${file} update`);
    assert(!/\.delete\s*\(/.test(text), `${file} delete`);
    assert(!/\.rpc\s*\(/.test(text), `${file} rpc`);
  }
  console.log('OK testAssistantStillReadOnly');
}

function testCapabilitiesRegistered() {
  const ids = listExplicitAssistantCapabilities().map((item) => item.id);
  assert(ids.includes('sale.charges'), 'sale.charges explícita');
  const sale = retrieveAssistantProcedures({
    question: 'Como gero os boletos desta venda?',
    context: cobrancasUi(),
    activeGoal: resolveAssistantActiveGoal({ question: 'Como gero os boletos desta venda?', context: cobrancasUi() }),
  });
  assert(sale.procedures.some((item) => item.id === 'gis-sale-charges'), sale.procedures.map((item) => item.id).join(','));
  const global = retrieveAssistantProcedures({
    question: 'Como emito uma cobrança?',
    context: withUi('/charges', {}),
  });
  assert(global.procedures.some((item) => item.id === 'charges-cobrancas'), global.procedures.map((item) => item.id).join(','));
  console.log('OK testCapabilitiesRegistered');
}

async function main() {
  await testGenerateBoletosOnSaleChargesTab();
  await testThisScreenIsEasier();
  await testMissingChargesRecognized();
  await testNoMissingDoesNotRegenerate();
  await testSyncStatusAndAlreadyGenerated();
  await testContinuityEAgora();
  await testGlobalMassChargesStayDistinct();
  testClosingEditSaleInvalidatesTab();
  await testSwitchingSaleDropsPreviousCounters();
  await testSaleLatestPreviewSchema();
  await testSaleLatestTenantIsolation();
  await testBrokerOwnerRbac();
  testNoPiiInPackedUi();
  testAssistantStillReadOnly();
  testCapabilitiesRegistered();
  console.log('ASSISTANT_SV_HOTFIX_SALE_CHARGES_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
