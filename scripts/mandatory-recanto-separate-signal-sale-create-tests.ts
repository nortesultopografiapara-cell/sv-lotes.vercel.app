/**
 * Gravação do sinal separado no fluxo da venda, sem banco e sem cobrança.
 * npx tsx scripts/mandatory-recanto-separate-signal-sale-create-tests.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSeparateSignalContractSchedule } from '../lib/recantoSeparateSignalContract';
import { RECANTO_SEPARATE_SIGNAL_ENABLED } from '../lib/recantoSeparateSignalForm';
import {
  RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED,
  RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED,
  clientRequestedSeparateSignal,
  rejectUnpersistedSeparateSignalRequest,
} from '../lib/recantoSeparateSignalPersistence';
import {
  isRecantoSeparateSignalAllowed,
  isRecantoSeparateSignalFormEnabled,
  isRecantoSeparateSignalWriteEnabled,
  RECANTO_SEPARATE_SIGNAL_DEVELOP_COMPANY_ID,
  RECANTO_SEPARATE_SIGNAL_DEVELOP_PROJECT_ID,
} from '../lib/recantoSeparateSignalRuntime';
import {
  assertSeparateSignalAtomicBatch,
  assertSeparateSignalConfirmationAvailable,
  buildRecantoSeparateSaleCreate,
  insertSeparateSignalSaleAtomically,
  requireCompleteSeparateReceipts,
  SEPARATE_SIGNAL_ATOMIC_RPC,
  separateSignalReceiptRows,
  type SeparateSaleCreateContext,
} from '../lib/recantoSeparateSignalSaleCreate';
import {
  classifySaleCustomerOwnership,
  prepareSaleCustomerPersistence,
  SALE_CUSTOMER_TENANT_FORBIDDEN,
} from '../lib/customerIdentity';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => void, fragment: string) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(fragment), message);
    return;
  }
  throw new Error(`deveria falhar: ${fragment}`);
}

const developEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://hoynysmynxncdlptuzub.supabase.co',
  RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED: 'true',
  RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED: 'true',
  RECANTO_SEPARATE_SIGNAL_ENABLED: 'true',
};

const productionEnv = {
  ...developEnv,
  NEXT_PUBLIC_SUPABASE_URL: 'https://aezktedncttwpqeunjej.supabase.co',
};

const context: SeparateSaleCreateContext = {
  tenantId: 'develop-ficticio-recanto-sinal',
  customerId: 'cliente-ficticio-sinal-b',
  projectId: 'empreendimento-ficticio-recanto',
  blockId: 'lote-ficticio-sinal-b',
  lotPrice: 60000,
  contractModel: 'RECANTO_PRIMAVERA',
};

function customer(overrides: Record<string, unknown> = {}) {
  return {
    signal_schedule_mode: 'SEPARATE',
    signal_contract_value: 3500,
    signal_paid_at_sale: 1000,
    signal_installment_count: 5,
    installments_count: 12,
    down_payment_due_date: '2026-11-06',
    signal_first_due_date: '2026-12-10',
    lot_schedule_start_mode: 'SIMULTANEOUS',
    final_value: 60000,
    company_id: 'outra-empresa',
    client_schedule: [{ scheduleGroup: 'LOT', amount: 1 }],
    ...overrides,
  };
}

function rowsOf(data: Record<string, unknown>) {
  const draft = buildRecantoSeparateSaleCreate(data, context);
  const receipts = separateSignalReceiptRows(draft, {
    saleId: 'venda-ficticia-nao-gravada',
    tenantId: context.tenantId,
    customerId: context.customerId,
    projectId: context.projectId,
    blockId: context.blockId,
  });
  return { draft, receipts };
}

function cents(rows: Record<string, unknown>[], group: string) {
  return rows
    .filter((row) => row.schedule_group === group)
    .reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
}

assert(RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED === false, 'constante de schema');
assert(RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED === false, 'constante de persistência');
assert(RECANTO_SEPARATE_SIGNAL_ENABLED === false, 'constante do formulário');
assert(isRecantoSeparateSignalWriteEnabled({}) === false, 'ambiente vazio grava');
assert(isRecantoSeparateSignalWriteEnabled(productionEnv) === false, 'production grava');
assert(isRecantoSeparateSignalWriteEnabled({
  ...developEnv,
  RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED: 'false',
}) === false, 'uma flag basta');
assert(isRecantoSeparateSignalWriteEnabled(developEnv) === true, 'develop com as duas flags de gravação');
assert(isRecantoSeparateSignalFormEnabled(developEnv) === true, 'formulário só depois da gravação');
const authorized = {
  companyId: RECANTO_SEPARATE_SIGNAL_DEVELOP_COMPANY_ID,
  projectId: RECANTO_SEPARATE_SIGNAL_DEVELOP_PROJECT_ID,
};
assert(isRecantoSeparateSignalAllowed(authorized.companyId, authorized.projectId, developEnv), 'par autorizado no Develop');
assert(!isRecantoSeparateSignalAllowed('11111111-1111-4111-8111-111111111111', authorized.projectId, developEnv), 'empresa não autorizada');
assert(!isRecantoSeparateSignalAllowed(authorized.companyId, '22222222-2222-4222-8222-222222222222', developEnv), 'empreendimento não autorizado');
assert(!isRecantoSeparateSignalAllowed(undefined, undefined, developEnv), 'API sem os identificadores');
assert(!isRecantoSeparateSignalAllowed(authorized.companyId, authorized.projectId, productionEnv), 'Production bloqueada mesmo com os UUIDs');
assertThrows(
  () => rejectUnpersistedSeparateSignalRequest(customer(), {}),
  'não pode ser gravado',
);
assertThrows(
  () => rejectUnpersistedSeparateSignalRequest(customer(), productionEnv),
  'não pode ser gravado',
);
rejectUnpersistedSeparateSignalRequest(customer(), developEnv, authorized);
assertThrows(
  () => rejectUnpersistedSeparateSignalRequest(customer(), developEnv, {
    companyId: '11111111-1111-4111-8111-111111111111',
    projectId: authorized.projectId,
  }),
  'não está liberado',
);
assertThrows(
  () => rejectUnpersistedSeparateSignalRequest(customer(), developEnv),
  'não está liberado',
);
assertThrows(
  () => rejectUnpersistedSeparateSignalRequest(customer(), productionEnv, authorized),
  'não pode ser gravado',
);
rejectUnpersistedSeparateSignalRequest({ signal_remaining_payment_mode: 'ALL_INSTALLMENTS' }, {});

const scenarioB = rowsOf(customer());
const signalB = scenarioB.receipts.filter((row) => row.schedule_group === 'SIGNAL');
const lotB = scenarioB.receipts.filter((row) => row.schedule_group === 'LOT');
assert(signalB.length === 6, 'cenário B sem seis recebíveis de sinal');
assert(lotB.length === 12, 'cenário B sem doze recebíveis de lote');
assert(scenarioB.receipts.length === 18, 'cenário B sem dezoito recebíveis');
assert(cents(scenarioB.receipts, 'SIGNAL') === 350_000, 'sinal do cenário B');
assert(cents(scenarioB.receipts, 'LOT') === 6_000_000, 'lote do cenário B');
assert(cents(scenarioB.receipts, 'SIGNAL') + cents(scenarioB.receipts, 'LOT') === 6_350_000, 'soma do cenário B');
assert(scenarioB.draft.saleFields.signal_schedule_mode === 'SEPARATE', 'modalidade');
assert(scenarioB.draft.saleFields.signal_remaining_payment_mode === null, 'modo embutido');
assert(scenarioB.draft.saleFields.signal_remaining_installments === null, 'parcelas embutidas');
assert(scenarioB.draft.saleFields.signal_remaining_installment_value === null, 'valor embutido');
assert(scenarioB.draft.saleFields.total_value === 60000, 'preço do lote reduzido');
assert(scenarioB.draft.plan.sale.companyId === context.tenantId, 'empresa do cliente');
assert(scenarioB.draft.plan.charges.length === 0, 'cobrança no plano');
assert(lotB.every((row) => row.signal_addon_amount === 0), 'complemento no lote');
assert(signalB.filter((row) => Number(row.installment_number) > 0).every((row) => row.amount === 500), 'parcela do sinal');
assert(signalB.some((row) => row.installment_number === 0 && row.status === 'pago' && row.amount === 1000), 'pagamento inicial');

const scenarioC = rowsOf(customer({
  signal_paid_at_sale: 0,
  signal_installment_count: 7,
}));
const signalC = scenarioC.receipts.filter((row) => row.schedule_group === 'SIGNAL');
assert(signalC.length === 7, 'cenário sem pagamento inicial');
assert(signalC.every((row) => row.status === 'pendente' && row.amount === 500), 'parcelas integrais do saldo');
assert(cents(scenarioC.receipts, 'SIGNAL') + cents(scenarioC.receipts, 'LOT') === 6_350_000, 'soma sem pagamento inicial');

const scenarioA = rowsOf(customer({
  signal_paid_at_sale: 3500,
  signal_installment_count: 99,
}));
const signalA = scenarioA.receipts.filter((row) => row.schedule_group === 'SIGNAL');
assert(signalA.length === 1 && signalA[0]?.installment_number === 0 && signalA[0]?.status === 'pago', 'sinal integral');
assert(scenarioA.receipts.filter((row) => row.schedule_group === 'LOT').length === 12, 'lote do sinal integral');

const repeated = rowsOf(customer());
assert(repeated.draft.requestKey === scenarioB.draft.requestKey, 'chave instável');
assertThrows(
  () => assertSeparateSignalConfirmationAvailable(
    { tenantId: context.tenantId },
    context.tenantId,
  ),
  'já foi registrada',
);
assertThrows(
  () => assertSeparateSignalConfirmationAvailable(
    { tenantId: 'outra-empresa' },
    context.tenantId,
  ),
  'outra empresa',
);
assertSeparateSignalConfirmationAvailable(null, context.tenantId);
assertThrows(() => requireCompleteSeparateReceipts(18, 17), 'Nenhuma venda foi mantida');

const contract = buildSeparateSignalContractSchedule({
  sale: {
    signal_schedule_mode: 'SEPARATE',
    signal_contract_value: 3500,
    signal_paid_at_sale: 1000,
  },
  receipts: scenarioB.receipts.map((row) => ({
    schedule_group: String(row.schedule_group),
    installment_number: Number(row.installment_number),
    amount: Number(row.amount),
    due_date: String(row.due_date),
    signal_addon_amount: Number(row.signal_addon_amount),
  })),
});
assert(contract?.signalInstallmentCount === 5, 'contrato sem cinco parcelas');
assert(contract?.lotLines.length === 12, 'contrato sem o lote');
assert(contract?.clauseText.includes('SINAL') === true, 'contrato sem a palavra SINAL');
assert(!/corretagem/i.test(`${contract?.clauseText}${contract?.scheduleHtml}`), 'contrato usa corretagem');

assert(clientRequestedSeparateSignal({ signal_remaining_payment_mode: 'FIRST_INSTALLMENTS' }) === false, 'fluxo antigo virou SEPARATE');
const forbidden = ['asaas', 'pix', 'boleto', 'barcode', 'charge_id'];
for (const row of scenarioB.receipts) {
  for (const key of forbidden) {
    assert(!(key in row), `recebível contém ${key}`);
  }
}

const atomicSale = {
  ...scenarioB.draft.saleFields,
  tenant_id: context.tenantId,
  company_id: context.tenantId,
};
assertSeparateSignalAtomicBatch(atomicSale, scenarioB.receipts);
assertThrows(
  () => assertSeparateSignalAtomicBatch(atomicSale, scenarioB.receipts.map((row) => ({
    ...row,
    tenant_id: 'outra-empresa',
  }))),
  'não pertencem a esta empresa',
);
assertThrows(
  () => assertSeparateSignalAtomicBatch(
    { ...atomicSale, signal_remaining_payment_mode: 'ALL_INSTALLMENTS' },
    scenarioB.receipts,
  ),
  'parcelamento embutido',
);

const saleTenant = 'empresa-da-venda';
const sameCustomer = { id: 'cliente-da-empresa', tenant_id: saleTenant, company_id: null };
assert(classifySaleCustomerOwnership(sameCustomer, saleTenant) === 'same_tenant', 'cliente do mesmo tenant');
assert(classifySaleCustomerOwnership({ ...sameCustomer, company_id: saleTenant }, saleTenant) === 'same_tenant', 'company_id do mesmo tenant');
assert(classifySaleCustomerOwnership({ id: 'cliente-alheio', tenant_id: 'outra-empresa', company_id: 'outra-empresa' }, saleTenant) === 'other_tenant', 'cliente de outro tenant');
assert(classifySaleCustomerOwnership({ id: 'cliente-misto', tenant_id: saleTenant, company_id: 'outra-empresa' }, saleTenant) === 'other_tenant', 'company_id de outra empresa');
assert(classifySaleCustomerOwnership(null, saleTenant) === 'missing', 'cliente inexistente');
assert(classifySaleCustomerOwnership({ id: 'sem-tenant', tenant_id: null, company_id: saleTenant }, saleTenant) === 'unassigned', 'cliente sem tenant seria adotado');
assert(classifySaleCustomerOwnership({ id: 'sem-tenant', tenant_id: '  ', company_id: null }, saleTenant) === 'unassigned', 'tenant vazio');

const sameUpdate = prepareSaleCustomerPersistence({
  requireOwnedCustomer: true,
  saleTenantId: saleTenant,
  existing: sameCustomer,
  payload: { name: 'CLIENTE TESTE', tenant_id: saleTenant, company_id: null },
});
assert(sameUpdate.action === 'update', 'cliente do tenant não atualiza');
assert(!('tenant_id' in sameUpdate.payload), 'update regrava tenant_id');
assert(!('company_id' in sameUpdate.payload), 'update regrava company_id');
assert(sameUpdate.payload.name === 'CLIENTE TESTE', 'dados do próprio cliente');

assertThrows(
  () => prepareSaleCustomerPersistence({
    requireOwnedCustomer: true,
    saleTenantId: saleTenant,
    existing: { id: 'cliente-alheio', tenant_id: 'outra-empresa', company_id: 'outra-empresa' },
    payload: { tenant_id: saleTenant, company_id: saleTenant, name: 'NAO PODE' },
  }),
  SALE_CUSTOMER_TENANT_FORBIDDEN,
);
assertThrows(
  () => prepareSaleCustomerPersistence({
    requireOwnedCustomer: true,
    saleTenantId: saleTenant,
    existing: null,
    payload: { name: 'INEXISTENTE' },
  }),
  SALE_CUSTOMER_TENANT_FORBIDDEN,
);
assertThrows(
  () => prepareSaleCustomerPersistence({
    requireOwnedCustomer: true,
    saleTenantId: saleTenant,
    existing: { id: 'sem-tenant', tenant_id: null, company_id: null },
    payload: { tenant_id: saleTenant, company_id: saleTenant },
  }),
  SALE_CUSTOMER_TENANT_FORBIDDEN,
);
assertThrows(
  () => prepareSaleCustomerPersistence({
    requireOwnedCustomer: true,
    saleTenantId: saleTenant,
    existing: sameCustomer,
    payload: { tenant_id: 'outra-empresa', company_id: saleTenant, name: 'TROCA' },
  }),
  SALE_CUSTOMER_TENANT_FORBIDDEN,
);

const created = prepareSaleCustomerPersistence({
  requireOwnedCustomer: true,
  saleTenantId: saleTenant,
  existing: null,
  payload: { name: 'CLIENTE NOVO', tenant_id: saleTenant, company_id: saleTenant },
});
assert(created.action === 'insert', 'cliente novo bloqueado');
assert(created.payload.tenant_id === saleTenant && created.payload.company_id === saleTenant, 'cliente novo sem empresa');

const legacy = prepareSaleCustomerPersistence({
  requireOwnedCustomer: false,
  saleTenantId: saleTenant,
  existing: { id: 'cliente-antigo', tenant_id: saleTenant, company_id: null, name: 'ANTIGO' },
  payload: { name: 'ANTIGO', tenant_id: saleTenant, signal_remaining_payment_mode: 'FIRST_INSTALLMENTS' },
});
assert(legacy.action === 'update' && legacy.payload.tenant_id === saleTenant, 'modalidade antiga perdeu o tenant');
assert(legacy.payload.signal_remaining_payment_mode === 'FIRST_INSTALLMENTS', 'modalidade antiga alterada');

async function main() {
await insertSeparateSignalSaleAtomically(
  {
    rpc: async () => ({
      data: { sale_id: 'nao-pode-gravar', receipt_count: scenarioB.receipts.length },
      error: { message: 'SEPARATE_SIGNAL_CUSTOMER_FORBIDDEN:O cliente não pertence a esta empresa.' },
    }),
  },
  atomicSale,
  scenarioB.receipts,
).then(
  () => { throw new Error('cliente alheio gravou a venda'); },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    assert(message === 'O cliente não pertence a esta empresa.', message);
    assert(!/cpf|e-mail|@|nome do/i.test(message), 'erro expõe dados do cliente');
  },
);

await insertSeparateSignalSaleAtomically(
  {
    rpc: async () => ({
      data: null,
      error: { message: 'Could not find the function public.create_separate_signal_sale_with_receipts in the schema cache' },
    }),
  },
  atomicSale,
  scenarioB.receipts,
).then(
  () => { throw new Error('função ausente foi aceita'); },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes('ainda não está disponível'), message);
  },
);

let rpcName = '';
let receiptHadClientSaleId = false;
const stored = await insertSeparateSignalSaleAtomically(
  {
    rpc: async (fn, args) => {
      rpcName = fn;
      const rows = args.p_receipts as Record<string, unknown>[];
      receiptHadClientSaleId = rows.some((row) => 'sale_id' in row);
      return { data: { sale_id: 'venda-atomica', receipt_count: rows.length }, error: null };
    },
  },
  atomicSale,
  scenarioB.receipts,
);
assert(rpcName === SEPARATE_SIGNAL_ATOMIC_RPC, 'função atômica');
assert(receiptHadClientSaleId === false, 'venda do cliente foi reaproveitada');
assert(stored.saleId === 'venda-atomica' && stored.receiptCount === 18, 'retorno atômico');

await insertSeparateSignalSaleAtomically(
  {
    rpc: async () => ({ data: { sale_id: 'venda-parcial', receipt_count: 17 }, error: null }),
  },
  atomicSale,
  scenarioB.receipts,
).then(
  () => { throw new Error('contagem parcial foi aceita'); },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes('Nenhuma venda foi mantida'), message);
  },
);

const excluded = [
  'supabase/proposals/20261106140000_create_separate_signal_sale_with_receipts.sql',
  'supabase/proposals/20261107120000_sale_initial_cash_uniqueness.sql',
  'supabase/proposals/20261107143000_separate_signal_allowlist.sql',
  'supabase/migrations/20261106190000_separate_signal_customer_tenant_guard.sql',
  'supabase/migrations/20261106201000_separate_signal_customer_id_types.sql',
  'supabase/migrations/20261106221000_separate_signal_block_tenant_text.sql',
  'supabase/migrations/20261106233000_manual_receipt_payment_reject_cancelled.sql',
];
for (const relative of excluded) {
  assert(!existsSync(resolve(process.cwd(), relative)), `pacote de Production inclui ${relative}`);
}
const coreMigration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20261107133000_sale_financial_core.sql',
), 'utf8');
assert(coreMigration.includes('btrim(tenant_id)::uuid = v_tenant'), 'núcleo compara tenant texto');
assert(!coreMigration.includes('CREATE OR REPLACE FUNCTION public.create_separate_signal_sale_with_receipts'), 'núcleo substitui a RPC antiga');
assert(!coreMigration.includes('CREATE OR REPLACE FUNCTION public.execute_authorized_manual_receipt_payment'), 'núcleo altera a baixa manual');
const service = readFileSync(resolve(process.cwd(), 'lib/gisSaleCreateService.ts'), 'utf8');
assert(!service.includes('rollbackPartialSale'), 'falha do contrato não libera o lote');
assert(service.includes('buildSaleEditFinancePayloads'), 'fluxo antigo removido');
assert(service.includes('invokeSaleFinancialCore'), 'SEPARATE e legado usam a mesma transação');
assert(service.includes('isRecantoSeparateSignalAllowed(tenantId, projectId)'), 'a gravação consulta a allowlist');
assert(service.includes('companyId: tenantId'), 'a API informa a empresa à allowlist');
const runtime = readFileSync(resolve(process.cwd(), 'lib/recantoSeparateSignalRuntime.ts'), 'utf8');
assert(runtime.includes('if (isProductionSupabaseRuntime(runtimeUrl(env))) return false;'), 'Production segue bloqueada antes da allowlist');
const statusRoute = readFileSync(resolve(process.cwd(), 'app/api/recanto-separate-signal/status/route.ts'), 'utf8');
assert(statusRoute.includes("params.get('companyId')") && statusRoute.includes('isProductionSupabaseRuntime'), 'o formulário exige o par e bloqueia Production');
const map = readFileSync(resolve(process.cwd(), 'components/map/GISMap.tsx'), 'utf8');
assert(map.includes("params.set('companyId'") && map.includes("params.set('projectId'"), 'o mapa só pede a modalidade para o par informado');
assert(service.includes('callerTenantId'), 'SEPARATE aceita outra empresa');
assert(
  service.includes('requireOwnedCustomer: clientRequestedSeparateSignal(customerData)'),
  'SEPARATE grava cliente de outra empresa',
);
const identity = readFileSync(resolve(process.cwd(), 'lib/customerIdentity.ts'), 'utf8');
const resolveBody = identity.slice(identity.indexOf('export async function resolveOrCreateCustomer'));
assert(
  resolveBody.indexOf('prepareSaleCustomerPersistence') !== -1
  && resolveBody.indexOf('prepareSaleCustomerPersistence') < resolveBody.indexOf(".from('customers')"),
  'update do cliente acontece antes da validação',
);
assert(
  resolveBody.indexOf('assertSaleCustomerOwned(existingRecord, tenantId)') < resolveBody.indexOf('CUSTOMER_RESOLVE_SELECTED'),
  'cliente alheio é tratado como selecionado',
);
assert(!service.includes('insertRowPreservingColumns'), 'SEPARATE ainda remove coluna obrigatória');
assert(
  service.includes('signal_remaining_payment_mode: splitPersist.signalRemainingPaymentMode'),
  'sinal embutido removido',
);
const createBody = service.slice(service.indexOf('export async function executeGisSaleCreate'));
assert(
  createBody.indexOf('rejectUnpersistedSeparateSignalRequest(customerData,') > 0
  && createBody.indexOf('rejectUnpersistedSeparateSignalRequest(customerData,') < createBody.indexOf(".from('blocks')"),
  'recusa depois do lote',
);
assert(
  createBody.indexOf('separateSignalReceiptRows') < createBody.indexOf('buildSaleEditFinancePayloads'),
  'o fluxo antigo passou a usar a função separada',
);
assert(!service.includes('create-charge'), 'serviço emite cobrança');

assert(coreMigration.includes("project_id = NULLIF(p_sale->>'project_id', '')::uuid") || coreMigration.includes('v_project'), 'núcleo confere o empreendimento');

const lotUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const saleTenant = '11111111-1111-4111-8111-111111111111';
const saleProject = '33333333-3333-4333-8333-333333333331';
const saleBlock = '44444444-4444-4444-8444-444444444444';
function lotAccepted(block: { id: string; tenant_id: string | null; project_id: string | null } | null): boolean {
  if (!block || !lotUuid.test(saleBlock) || !lotUuid.test(saleProject) || block.id !== saleBlock) return false;
  const tenant = String(block.tenant_id ?? '').trim();
  if (!lotUuid.test(tenant) || tenant.toLowerCase() !== saleTenant) return false;
  return block.project_id === saleProject;
}
assert(lotAccepted({ id: saleBlock, tenant_id: saleTenant, project_id: saleProject }), 'lote do mesmo tenant e empreendimento');
assert(!lotAccepted({ id: saleBlock, tenant_id: '55555555-5555-4555-8555-555555555555', project_id: saleProject }), 'lote de outro tenant');
assert(!lotAccepted({ id: saleBlock, tenant_id: null, project_id: saleProject }), 'lote sem tenant');
assert(!lotAccepted({ id: saleBlock, tenant_id: 'tenant-invalido', project_id: saleProject }), 'tenant em formato inválido');
assert(!lotAccepted({ id: saleBlock, tenant_id: saleTenant, project_id: '66666666-6666-4666-8666-666666666666' }), 'lote de outro empreendimento');
assert(!lotAccepted(null), 'lote inexistente');

const longSchedule = buildRecantoSeparateSaleCreate(customer({
  signal_contract_value: 3500,
  signal_paid_at_sale: 1000,
  signal_installment_count: 5,
  installments_count: 120,
  down_payment_due_date: '2026-11-06',
  signal_first_due_date: '2026-12-10',
  lot_schedule_start_mode: 'AFTER_BROKERAGE',
  first_installment_due_date: '2027-05-10',
}), {
  ...context,
  lotPrice: 66188.05,
});
const longReceipts = separateSignalReceiptRows(longSchedule, {
  saleId: 'venda-ficticia-nao-gravada',
  tenantId: context.tenantId,
  customerId: context.customerId,
  projectId: context.projectId,
  blockId: context.blockId,
});
assert(longReceipts.filter((row) => row.schedule_group === 'SIGNAL').length === 6, 'cronograma sem 6 recebíveis de sinal');
assert(longReceipts.filter((row) => row.schedule_group === 'LOT').length === 120, 'cronograma sem 120 parcelas do lote');
const signalCents = longReceipts.filter((row) => row.schedule_group === 'SIGNAL').reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
const lotCents = longReceipts.filter((row) => row.schedule_group === 'LOT').reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
assert(signalCents === 350_000 && lotCents === 6_618_805, 'cronograma longo não fecha os valores');

console.log('mandatory-recanto-separate-signal-sale-create-tests: ok');
}

main();
