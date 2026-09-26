/**
 * Assistente SV — Fase 3A (consultas operacionais read-only).
 * npx tsx scripts/mandatory-assistant-sv-fase-3a-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { ASSISTANT_FORBIDDEN_BROKER } from '../lib/assistant/constants';
import { buildSafeAssistantContext } from '../lib/assistant/context';
import { localGroundedProvider } from '../lib/assistant/model/localGroundedProvider';
import { runAssistantPipeline } from '../lib/assistant/pipeline';
import { executeAssistantReadonlyTool } from '../lib/assistant/readonly/execute';
import { resolveAssistantReadonlyIntent } from '../lib/assistant/readonly/intent';
import { packReadonlyFacts, packedReadonlyHasNoSecrets } from '../lib/assistant/readonly/sanitize';
import { ASSISTANT_READONLY_TOOL_IDS } from '../lib/assistant/readonly/types';
import { EMPTY_ASSISTANT_UI_STATE } from '../lib/assistant/uiSnapshot';
import type { AssistantReadonlyDb, AssistantReadonlyExecution, AssistantReadonlyFacts, AssistantReadonlySignatureFacts } from '../lib/assistant/readonly/types';
import type { AssistantAskInput, AssistantSafeContext } from '../lib/assistant/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const root = process.cwd();

function ctx(pathname: string, extras?: { role?: string; ui?: Partial<typeof EMPTY_ASSISTANT_UI_STATE> }): AssistantSafeContext {
  return buildSafeAssistantContext({
    pathname,
    role: extras?.role ?? 'ADMIN',
    tenantName: 'Empresa Homologada',
    projectName: extras?.ui?.projectName ?? null,
    ui: { ...EMPTY_ASSISTANT_UI_STATE, ...extras?.ui },
  });
}

const overdueFacts: AssistantReadonlyFacts = {
  toolId: 'finance.overdue_summary',
  referenceDate: '2026-09-26',
  overdueCount: 6,
  overdueAmount: 12340.5,
  customerCount: 4,
};

const latestSignature: AssistantReadonlySignatureFacts = {
  toolId: 'contract.latest_signature_status',
  found: true,
  contractNumber: '000000009/2026',
  overallState: 'parcial',
  partyTotal: 3,
  partySigned: 1,
  partyPending: 2,
  pendingRoles: ['Comprador', 'Testemunha 1'],
  pendingParties: [{ name: 'Maria Silva', role: 'Comprador' }],
  awaitingInternalVendor: true,
  sentAt: '2026-09-20',
};

const selectedSignature: AssistantReadonlyFacts = {
  ...latestSignature,
  toolId: 'contract.signature_status',
  overallState: 'assinado',
  partySigned: 3,
  partyPending: 0,
  pendingRoles: [],
  pendingParties: [],
  awaitingInternalVendor: false,
};

const latestSale: AssistantReadonlyFacts = {
  toolId: 'sale.latest',
  found: true,
  saleDate: '2026-09-18',
  status: 'ACTIVE',
  projectName: 'Chacreamento Araguaia',
  lotLabel: 'Quadra 03 / Lote 12',
  amount: 75000,
};

const inventory: AssistantReadonlyFacts = {
  toolId: 'project.inventory',
  found: true,
  projectName: 'Chacreamento Araguaia',
  available: 40,
  reserved: 5,
  sold: 12,
  paid: 3,
  total: 60,
};

function executeMap(facts: Partial<Record<string, AssistantReadonlyFacts>>) {
  return async (toolId: string): Promise<AssistantReadonlyExecution> => {
    const item = facts[toolId];
    if (!item) return { ok: false, reason: 'not_found' };
    return { ok: true, facts: item, rowCount: 8 };
  };
}

function deps(execute: (toolId: string) => Promise<AssistantReadonlyExecution>, role = 'ADMIN') {
  return {
    primary: localGroundedProvider,
    fallback: localGroundedProvider,
    readonly: {
      tenantId: 'tenant-a',
      userId: 'user-a',
      role,
      execute,
    },
  };
}

async function ask(question: string, pathname = '/dashboard', extras?: { role?: string; ui?: Partial<typeof EMPTY_ASSISTANT_UI_STATE>; history?: AssistantAskInput['history']; execute?: (toolId: string) => Promise<AssistantReadonlyExecution> }) {
  const execute =
    extras?.execute ||
    executeMap({
      'finance.overdue_summary': overdueFacts,
      'contract.latest_signature_status': latestSignature,
      'contract.signature_status': selectedSignature,
      'sale.latest': latestSale,
      'project.inventory': inventory,
    });
  return runAssistantPipeline(
    {
      question,
      context: ctx(pathname, { role: extras?.role, ui: extras?.ui }),
      history: extras?.history,
    },
    deps(execute, extras?.role),
  );
}

function testAllowlistAndHowTo() {
  assert(ASSISTANT_READONLY_TOOL_IDS.length === 5, 'allowlist');
  const howTo = resolveAssistantReadonlyIntent({
    question: 'Como vejo parcelas vencidas?',
    context: ctx('/dashboard'),
  });
  assert(howTo === null, 'how-to não dispara tool');
  const write = resolveAssistantReadonlyIntent({
    question: 'Cobre esse cliente',
    context: ctx('/finance'),
  });
  assert(write === null, 'comando de escrita não dispara tool');
  const live = resolveAssistantReadonlyIntent({
    question: 'Tem parcela vencida hoje?',
    context: ctx('/dashboard'),
  });
  assert(live?.toolId === 'finance.overdue_summary', String(live?.toolId));
  console.log('OK testAllowlistAndHowTo');
}

async function testOverdueLiveQuery() {
  const first = await ask('Tem parcela vencida hoje?');
  assert(first.kind === 'answer', first.text);
  assert(first.toolId === 'finance.overdue_summary', String(first.toolId));
  assert(/6/.test(first.text) && /4/.test(first.text), first.text);
  assert(/R\$/.test(first.text), first.text);

  const second = await ask('Quantas estão vencidas e qual o total?');
  assert(second.toolId === 'finance.overdue_summary', String(second.toolId));
  assert(/6/.test(second.text), second.text);
  console.log('OK testOverdueLiveQuery');
}

async function testSignatureQueries() {
  const latest = await ask('O último contrato enviado para assinatura já foi assinado por todos?');
  assert(latest.toolId === 'contract.latest_signature_status', String(latest.toolId));
  assert(/Ainda não|1\/3|Comprador/.test(latest.text), latest.text);

  const who = await ask('Quem ainda falta assinar?');
  assert(who.toolId === 'contract.latest_signature_status', String(who.toolId));
  assert(/Maria Silva|Comprador/.test(who.text), who.text);

  const selected = await ask('Já assinaram todos?', '/contracts', {
    ui: { contractId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contractNumber: '000000009/2026' },
  });
  assert(selected.toolId === 'contract.signature_status', String(selected.toolId));
  assert(/já está assinado|3\/3/i.test(selected.text), selected.text);
  console.log('OK testSignatureQueries');
}

async function testSaleAndInventory() {
  const sale = await ask('Qual foi a última venda?');
  assert(sale.toolId === 'sale.latest', String(sale.toolId));
  assert(/Quadra 03|Araguaia/.test(sale.text), sale.text);

  const lots = await ask('Quantos lotes estão disponíveis no Chacreamento Araguaia?');
  assert(lots.toolId === 'project.inventory', String(lots.toolId));
  assert(/40/.test(lots.text) && /disponív/.test(lots.text), lots.text);
  console.log('OK testSaleAndInventory');
}

async function testFollowUp() {
  const follow = await ask('De quantos clientes?', '/dashboard', {
    history: [
      { role: 'user', text: 'Tem parcela vencida?' },
      { role: 'assistant', text: 'Sim. Existem 6 parcelas vencidas, totalizando R$ 12.340,50.' },
    ],
  });
  assert(follow.toolId === 'finance.overdue_summary', String(follow.toolId));
  assert(/4 cliente/.test(follow.text), follow.text);
  console.log('OK testFollowUp');
}

async function testBrokerForbiddenFinance() {
  const result = await ask('Tem parcela vencida hoje?', '/map', { role: 'BROKER' });
  assert(result.kind === 'forbidden' || result.text === ASSISTANT_FORBIDDEN_BROKER || /não tem acesso/.test(result.text), result.text);
  const contracts = await ask('O último contrato enviado para assinatura já foi assinado por todos?', '/map', {
    role: 'BROKER',
  });
  assert(contracts.kind === 'forbidden' || contracts.text === ASSISTANT_FORBIDDEN_BROKER || /não tem acesso/.test(contracts.text), contracts.text);
  console.log('OK testBrokerForbiddenFinance');
}

async function testOwnerWithoutFinanceScope() {
  const db = createFakeDb({
    finance_receipts: [
      { id: '1', tenant_id: 'tenant-a', status: 'pendente', amount: 100, due_date: '2020-01-01', customer_id: 'c1', project_id: 'proj-a' },
    ],
    owner_project_access: [
      {
        id: 'acl-1',
        tenant_id: 'tenant-a',
        user_id: 'user-a',
        project_id: 'proj-a',
        can_view_dashboard: true,
        can_view_map: true,
        can_view_finance: false,
        can_view_contracts: false,
      },
    ],
  });
  const result = await executeAssistantReadonlyTool({
    toolId: 'finance.overdue_summary',
    args: {},
    runtime: {
      tenantId: 'tenant-a',
      userId: 'user-a',
      role: 'OWNER',
      client: db,
      now: new Date('2026-09-26T12:00:00Z'),
    },
  });
  assert(!result.ok && result.reason === 'forbidden', JSON.stringify(result));
  console.log('OK testOwnerWithoutFinanceScope');
}

function testSanitizedPayload() {
  const dirty: AssistantReadonlyFacts = {
    ...latestSignature,
    pendingParties: [
      {
        name: 'Maria Silva 123.456.789-00 token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb',
        role: 'Comprador',
      },
    ],
  };
  const packed = packReadonlyFacts(dirty);
  assert(packedReadonlyHasNoSecrets(packed), packed);
  assert(!/123\.456\.789-00/.test(packed), packed);
  assert(!/eyJ/.test(packed), packed);
  assert(!/aaaaaaaa-aaaa/.test(packed), packed);
  console.log('OK testSanitizedPayload');
}

function createFakeDb(store: Record<string, Array<Record<string, unknown>>>): AssistantReadonlyDb {
  return {
    from(table: string) {
      let rows = [...(store[table] || [])];
      const api: any = {
        select() {
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
        not(column: string, operator: string, value: string) {
          if (operator === 'is' && value === 'null') {
            rows = rows.filter((row) => row[column] != null);
          }
          return api;
        },
        lt(column: string, value: string) {
          rows = rows.filter((row) => String(row[column] || '') < value);
          return api;
        },
        ilike(column: string, value: string) {
          const needle = value.replace(/%/g, '').toLowerCase();
          rows = rows.filter((row) => String(row[column] || '').toLowerCase().includes(needle));
          return api;
        },
        order() {
          return api;
        },
        limit(count: number) {
          rows = rows.slice(0, count);
          return api;
        },
        range(from: number, to: number) {
          rows = rows.slice(from, to + 1);
          return api;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] || null, error: null });
        },
        then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
}

async function testTenantIsolation() {
  const db = createFakeDb({
    finance_receipts: [
      { id: '1', tenant_id: 'tenant-a', status: 'pendente', amount: 100, due_date: '2020-01-01', customer_id: 'c1' },
      { id: '2', tenant_id: 'tenant-a', status: 'pendente', amount: 50, due_date: '2020-01-01', customer_id: 'c2' },
      { id: '3', tenant_id: 'tenant-b', status: 'pendente', amount: 9999, due_date: '2020-01-01', customer_id: 'c9' },
    ],
  });
  const result = await executeAssistantReadonlyTool({
    toolId: 'finance.overdue_summary',
    args: {},
    runtime: {
      tenantId: 'tenant-a',
      userId: 'user-a',
      role: 'ADMIN',
      client: db,
      now: new Date('2026-09-26T12:00:00Z'),
    },
  });
  assert(result.ok, 'isolation ok');
  if (result.ok && result.facts.toolId === 'finance.overdue_summary') {
    assert(result.facts.overdueCount === 2, String(result.facts.overdueCount));
    assert(result.facts.overdueAmount === 150, String(result.facts.overdueAmount));
    assert(result.facts.customerCount === 2, String(result.facts.customerCount));
  }
  console.log('OK testTenantIsolation');
}

function testNoWritesInTools() {
  const dir = path.join(root, 'lib/assistant/readonly');
  const files = fs.readdirSync(dir).filter((item) => item.endsWith('.ts'));
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    assert(!/\.insert\s*\(/.test(text), `${file} insert`);
    assert(!/\.update\s*\(/.test(text), `${file} update`);
    assert(!/\.delete\s*\(/.test(text), `${file} delete`);
    assert(!/\.rpc\s*\(/.test(text), `${file} rpc`);
    assert(!/webhook/.test(text.toLowerCase()) || file === 'format.ts', `${file} webhook`);
  }
  const pipeline = fs.readFileSync(path.join(root, 'lib/assistant/pipeline.ts'), 'utf8');
  assert(!pipeline.includes('.insert('), 'pipeline insert');
  const execute = fs.readFileSync(path.join(root, 'lib/assistant/readonly/execute.ts'), 'utf8');
  assert(!/\.select\([\s\S]*?\bfinal_value\b/.test(execute), 'sale.latest não seleciona coluna órfã final_value');
  assert(!/projects\s*:\s*project_id\s*\(/.test(execute), 'sale.latest sem embed PostgREST de projects');
  assert(!/blocks\s*:\s*block_id\s*\(/.test(execute), 'sale.latest sem embed PostgREST de blocks');
  console.log('OK testNoWritesInTools');
}

async function testToolFailureDoesNotInvent() {
  const result = await ask('Tem parcela vencida hoje?', '/dashboard', {
    execute: async () => ({ ok: false, reason: 'error' }),
  });
  assert(!/9999/.test(result.text), result.text);
  assert(result.toolOk === false, String(result.toolOk));
  assert(result.source === 'readonly', String(result.source));
  assert(/Não consegui|não inventei/i.test(result.text), result.text);
  console.log('OK testToolFailureDoesNotInvent');
}

async function testLocalFormatterWhenModelEmpty() {
  const result = await ask('Tem parcela vencida hoje?');
  assert(result.source === 'readonly', String(result.source));
  assert(/6 parcela/.test(result.text), result.text);
  console.log('OK testLocalFormatterWhenModelEmpty');
}

async function testHowToStillOrientationWithRuntime() {
  const result = await ask('Como vejo parcelas vencidas?');
  assert(!result.toolId, String(result.toolId));
  assert(/Financeiro/.test(result.text), result.text);
  console.log('OK testHowToStillOrientationWithRuntime');
}

async function main() {
  testAllowlistAndHowTo();
  await testOverdueLiveQuery();
  await testSignatureQueries();
  await testSaleAndInventory();
  await testFollowUp();
  await testBrokerForbiddenFinance();
  await testOwnerWithoutFinanceScope();
  testSanitizedPayload();
  await testTenantIsolation();
  testNoWritesInTools();
  await testToolFailureDoesNotInvent();
  await testLocalFormatterWhenModelEmpty();
  await testHowToStillOrientationWithRuntime();
  console.log('ASSISTANT_SV_FASE_3A_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
