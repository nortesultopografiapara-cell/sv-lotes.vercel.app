/**
 * Gravação do sinal separado no fluxo da venda, sem banco e sem cobrança.
 * npx tsx scripts/mandatory-recanto-separate-signal-sale-create-tests.ts
 */

import { readFileSync } from 'node:fs';
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
  isRecantoSeparateSignalFormEnabled,
  isRecantoSeparateSignalWriteEnabled,
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
assertThrows(
  () => rejectUnpersistedSeparateSignalRequest(customer(), {}),
  'não pode ser gravado',
);
assertThrows(
  () => rejectUnpersistedSeparateSignalRequest(customer(), productionEnv),
  'não pode ser gravado',
);
rejectUnpersistedSeparateSignalRequest(customer(), developEnv);
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

const proposalPath = resolve(
  process.cwd(),
  'supabase/proposals/20261106140000_create_separate_signal_sale_with_receipts.sql',
);
const proposal = readFileSync(proposalPath, 'utf8');
assert(proposal.includes('CREATE OR REPLACE FUNCTION public.create_separate_signal_sale_with_receipts'), 'proposta sem função');
assert(proposal.includes('INSERT INTO public.sales'), 'proposta não grava a venda');
assert(proposal.includes('INSERT INTO public.finance_receipts'), 'proposta não grava os recebíveis');
assert(proposal.includes('SEPARATE_SIGNAL_RECEIPTS_INCOMPLETE'), 'proposta aceita lote incompleto');
assert(proposal.includes('GRANT EXECUTE ON FUNCTION public.create_separate_signal_sale_with_receipts(jsonb, jsonb) TO service_role'), 'proposta sem serviço');
assert(proposal.includes('REVOKE ALL ON FUNCTION public.create_separate_signal_sale_with_receipts(jsonb, jsonb) FROM anon'), 'cliente anônimo mantém execução');
assert(proposal.includes('REVOKE ALL ON FUNCTION public.create_separate_signal_sale_with_receipts(jsonb, jsonb) FROM authenticated'), 'cliente autenticado mantém execução');
assert(proposal.includes('SECURITY INVOKER'), 'função amplia privilégio');
assert(proposal.includes('tenant_id = v_tenant'), 'lote de outra empresa');
assert(proposal.includes('SEPARATE_SIGNAL_CUSTOMER_FORBIDDEN'), 'cliente de outro tenant aceito');
assert(proposal.includes('FROM public.customers'), 'cliente sem leitura no banco');
assert(proposal.includes('company_id IS NULL OR company_id = v_tenant'), 'company_id divergente aceito');
assert(!/UPDATE\s+public\.customers/i.test(proposal), 'função reatribui cliente');
const customerGuardAt = proposal.indexOf('SEPARATE_SIGNAL_CUSTOMER_FORBIDDEN');
const saleInsertAt = proposal.indexOf('INSERT INTO public.sales');
assert(customerGuardAt !== -1 && saleInsertAt !== -1 && customerGuardAt < saleInsertAt, 'cliente validado depois do insert');
const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20261106190000_separate_signal_customer_tenant_guard.sql',
);
const migration = readFileSync(migrationPath, 'utf8');
assert(migration.includes('CREATE OR REPLACE FUNCTION public.create_separate_signal_sale_with_receipts'), 'migration sem função');
assert(migration.includes('SEPARATE_SIGNAL_CUSTOMER_FORBIDDEN'), 'migration sem o cliente');
const companyTypeMigration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20261106201000_separate_signal_customer_id_types.sql',
), 'utf8');
assert(companyTypeMigration.includes('btrim(tenant_id)::uuid = v_tenant'), 'tenant texto comparado como uuid cru');
assert(companyTypeMigration.includes('company_id IS NULL OR company_id = v_tenant'), 'company_id uuid sem nulo');
assert(
  companyTypeMigration.indexOf('btrim(tenant_id)::uuid = v_tenant')
    < companyTypeMigration.indexOf('INSERT INTO public.sales'),
  'tipo do cliente conferido depois do insert',
);
assert(!/ALTER TABLE/i.test(companyTypeMigration), 'migration altera coluna');
assert(!/CREATE POLICY/i.test(companyTypeMigration), 'migration altera policy');
assert(companyTypeMigration.includes('REVOKE ALL ON FUNCTION public.create_separate_signal_sale_with_receipts(jsonb, jsonb) FROM authenticated'), 'migration devolve execução ao autenticado');
assert(proposal.includes('btrim(tenant_id)::uuid = v_tenant'), 'proposta mantém comparação inválida');
assert(migration.includes('GRANT EXECUTE ON FUNCTION public.create_separate_signal_sale_with_receipts(jsonb, jsonb) TO service_role'), 'migration amplia o serviço');
assert(migration.includes('REVOKE ALL ON FUNCTION public.create_separate_signal_sale_with_receipts(jsonb, jsonb) FROM authenticated'), 'migration devolve execução ao autenticado');
assert(!/GRANT EXECUTE[\s\S]*TO authenticated/i.test(migration), 'migration libera authenticated');
assert(!/CREATE POLICY/i.test(migration), 'migration altera policy');
assert(proposal.includes('round((item->>\'amount\')::numeric, 2) <> round((item->>\'base_amount\')::numeric, 2)'), 'complemento embutido no valor');
assert(!/UPDATE\s+public\.sales/i.test(proposal), 'proposta altera venda antiga');
assert(!/UPDATE\s+public\.contracts/i.test(proposal), 'proposta altera contrato');
assert(!/GRANT EXECUTE[\s\S]*TO authenticated/i.test(proposal), 'cliente autenticado executa a função');
assert(!/GRANT EXECUTE[\s\S]*TO anon/i.test(proposal), 'cliente anônimo executa a função');
assert(!proposal.includes('COMMIT;'), 'proposta quebra a transação');
assert(proposal.includes("ARRAY['asaas', 'pix', 'boleto', 'barcode', 'charge_id', 'asaas_payment_id']"), 'proposta não recusa cobrança');

const service = readFileSync(resolve(process.cwd(), 'lib/gisSaleCreateService.ts'), 'utf8');
assert(service.includes('rollbackPartialSale'), 'falha não reverte a venda');
assert(service.includes('buildSaleEditFinancePayloads'), 'fluxo antigo removido');
assert(service.includes('insertSeparateSignalSaleAtomically'), 'SEPARATE continua em dois inserts');
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
assert(service.includes('signal_remaining_payment_mode: recantoSignalMode'), 'sinal embutido removido');
const createBody = service.slice(service.indexOf('export async function executeGisSaleCreate'));
assert(
  createBody.indexOf('rejectUnpersistedSeparateSignalRequest(customerData)') < createBody.indexOf(".from('blocks')"),
  'recusa depois do lote',
);
assert(
  createBody.indexOf('insertSeparateSignalSaleAtomically') < createBody.indexOf('buildSaleEditFinancePayloads'),
  'o fluxo antigo passou a usar a função separada',
);
assert(!service.includes('create-charge'), 'serviço emite cobrança');

console.log('mandatory-recanto-separate-signal-sale-create-tests: ok');
}

main();
