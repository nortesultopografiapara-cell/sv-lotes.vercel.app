/**
 * Núcleo financeiro transacional: chave, caixa, lote e contrato.
 * npx tsx scripts/mandatory-sale-financial-core-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  applySaleFinancialCore,
  clearSaleRequestKey,
  loadSaleRequestKey,
  persistSaleRequestKey,
  resolveContractRetry,
  saleFinancialFingerprint,
  type MemoryCoreState,
} from '../lib/finance/saleFinancialCore';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const tenant = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const project = '33333333-3333-4333-8333-333333333333';
const customer = '44444444-4444-4444-8444-444444444444';
const lot = '55555555-5555-4555-8555-555555555555';
const key = '66666666-6666-4666-8666-666666666666';
const otherKey = '77777777-7777-4777-8777-777777777777';

function baseState(): MemoryCoreState {
  return {
    sales: [],
    receipts: [],
    cash: [],
    lots: [{ id: lot, tenantId: tenant, projectId: project, status: 'Disponível', saleId: null }],
    contracts: [],
    customers: [
      { id: customer, tenantId: tenant },
      { id: customer, tenantId: other },
    ],
    projects: [
      { id: project, tenantId: tenant },
      { id: project, tenantId: other },
    ],
  };
}

function sale(partial: Record<string, unknown> = {}) {
  return {
    tenant_id: tenant,
    company_id: tenant,
    project_id: project,
    block_id: lot,
    customer_id: customer,
    total_value: 66188.05,
    down_payment: 3500,
    signal_contract_value: 3500,
    signal_paid_at_sale: 1000,
    installments_count: 120,
    signal_schedule_mode: 'SEPARATE',
    ...partial,
  };
}

function receipts(paid = 1000) {
  const rows: Array<Record<string, unknown>> = [];
  if (paid > 0) {
    rows.push({
      schedule_group: 'SIGNAL', installment_number: 0, amount: paid, paid_amount: paid,
      status: 'pago', due_date: '2026-11-07', tenant_id: tenant,
    });
  }
  for (let index = 1; index <= 5; index += 1) {
    rows.push({
      schedule_group: 'SIGNAL', installment_number: index, amount: 500, paid_amount: 0,
      status: 'pendente', due_date: `2026-12-0${index}`, tenant_id: tenant,
    });
  }
  for (let index = 1; index <= 120; index += 1) {
    rows.push({
      schedule_group: 'LOT', installment_number: index, amount: 551.57, paid_amount: 0,
      status: 'pendente', due_date: '2027-01-07', tenant_id: tenant,
    });
  }
  return rows;
}

const first = applySaleFinancialCore(baseState(), { sale: sale(), receipts: receipts(), requestKey: key });
assert(first.result.cashAmount === 1000 && first.state.cash.length === 1, 'entrada de 1000 gera um caixa');
assert(first.state.receipts.filter((row) => row.schedule_group === 'SIGNAL' && row.status === 'pendente').length === 5, 'cinco parcelas SIGNAL pendentes');
assert(first.state.receipts.filter((row) => row.schedule_group === 'LOT').length === 120, '120 parcelas do lote');
assert(first.state.lots[0].status === 'Vendido' && first.state.lots[0].saleId === first.result.saleId, 'lote vinculado à venda');

const replay = applySaleFinancialCore(first.state, { sale: sale(), receipts: receipts(), requestKey: key });
assert(replay.result.replayed && replay.state.sales.length === 1 && replay.state.cash.length === 1, 'repetição após timeout não duplica');
assert(replay.result.receipts.length === first.result.receipts.length, 'repetição devolve os mesmos recebíveis');

let mismatch = false;
try {
  applySaleFinancialCore(first.state, { sale: sale({ signal_paid_at_sale: 2000 }), receipts: receipts(2000), requestKey: key });
} catch (error) {
  mismatch = error instanceof Error && /dados diferentes|valores diferentes/.test(error.message);
}
assert(mismatch, 'chave reutilizada com valores diferentes é recusada');

for (const step of ['sale', 'receipts', 'cash', 'lot'] as const) {
  const before = baseState();
  let failed = false;
  try {
    applySaleFinancialCore(before, { sale: sale(), receipts: receipts(), requestKey: key, failAt: step });
  } catch {
    failed = true;
  }
  assert(failed && before.sales.length === 0 && before.lots[0].status === 'Disponível', `falha em ${step} não grava nada`);
}

let sold = false;
try {
  applySaleFinancialCore(first.state, { sale: sale(), receipts: receipts(), requestKey: otherKey });
} catch (error) {
  sold = error instanceof Error && /já possui venda/.test(error.message);
}
assert(sold, 'lote vendido não aceita outra venda');

const foreignSale = sale({ tenant_id: other, company_id: other });
let isolated = false;
try {
  applySaleFinancialCore(baseState(), {
    sale: foreignSale,
    receipts: receipts().map((row) => ({ ...row, tenant_id: other })),
    requestKey: otherKey,
  });
} catch (error) {
  isolated = error instanceof Error && /não pertence a esta empresa/.test(error.message);
}
assert(isolated, 'lote de outra empresa é recusado');

const legacy = applySaleFinancialCore(baseState(), {
  sale: sale({ signal_schedule_mode: null, signal_contract_value: null, signal_paid_at_sale: 800, down_payment: 800, installments_count: 12 }),
  receipts: [{ installment_number: 0, amount: 800, paid_amount: 800, status: 'pago', due_date: '2026-11-07', tenant_id: tenant }],
  requestKey: key,
});
assert(legacy.result.cashAmount === 800, 'fluxo legado com valor confirmado gera caixa');

const none = applySaleFinancialCore(baseState(), {
  sale: sale({ signal_paid_at_sale: 0 }),
  receipts: receipts(0),
  requestKey: key,
});
assert(none.result.cashId == null && none.state.cash.length === 0, 'sem pagamento inicial não gera caixa');

const zero = applySaleFinancialCore(baseState(), {
  sale: sale(),
  receipts: receipts().map((row) => Number(row.installment_number) === 0 ? { ...row, paid_amount: 0, status: 'pago' } : row),
  requestKey: key,
});
assert(zero.result.cashId == null, 'paid_amount zero não vira o valor da parcela');

const reused = resolveContractRetry(first.result.saleId, tenant, [
  { id: 'contract-old', saleId: 'other-sale', tenantId: tenant, current: true },
  { id: 'contract-this', saleId: first.result.saleId, tenantId: tenant, current: true },
]);
assert(reused.action === 'reuse' && reused.contractId === 'contract-this', 'repetição reutiliza o contrato desta venda');
const created = resolveContractRetry(first.result.saleId, tenant, [
  { id: 'contract-old', saleId: 'other-sale', tenantId: tenant, current: true },
]);
assert(created.action === 'create', 'contrato de outra venda não é reescrito');

const sameData = saleFinancialFingerprint(sale(), receipts());
const otherData = saleFinancialFingerprint(sale({ total_value: 10 }), receipts());
assert(sameData !== otherData && !sameData.includes(key), 'impressão não é a chave e muda com o valor');

const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261107133000_sale_financial_core.sql'), 'utf8');
assert(sql.includes('FOR UPDATE'), 'a função trava o lote');
assert(sql.includes('pg_advisory_xact_lock'), 'a mesma chave espera a outra transação');
assert(sql.includes('cash_movements_sale_create_receipt_uidx'), 'há índice único do caixa');
assert(sql.includes("metadata->>'provider' = 'SALE_CREATE'"), 'o índice é só da origem SALE_CREATE');
assert(sql.includes('SALE_REQUEST_MISMATCH'), '23505 não confirma sucesso sem comparar os dados');
assert(sql.includes('WHEN unique_violation'), 'violação única é tratada dentro da transação');
assert(!sql.includes('execute_authorized_manual_receipt_payment'), 'a baixa manual não é alterada');
assert(!/asaas_payment_id'\s*,/i.test(sql.split('INSERT INTO public.cash_movements')[1] || ''), 'o caixa inicial não emite cobrança');
assert(sql.includes('depois das contagens de duplicidade e da autorização'), 'a migration exige conferência antes de Production');
assert(sql.includes('REVOKE ALL ON FUNCTION public.sale_financial_core_fingerprint(jsonb, jsonb) FROM anon'), 'a função auxiliar revoga anon');
assert(sql.includes('REVOKE ALL ON FUNCTION public.sale_financial_core_fingerprint(jsonb, jsonb) FROM authenticated'), 'a função auxiliar revoga authenticated');

const service = fs.readFileSync(path.join(process.cwd(), 'lib/gisSaleCreateService.ts'), 'utf8');
assert(service.includes('invokeSaleFinancialCore'), 'a venda usa o núcleo transacional');
assert(!service.includes('rollbackPartialSale') && !service.includes('compensateSaleCreate'), 'falha de contrato não desfaz o lote por compensação');
assert(service.includes('lotReleased: false'), 'o catch não libera o lote');
assert(service.includes(".eq('sale_id', saleId)"), 'o contrato só vincula o lote desta venda');
assert(!service.includes("status: 'Disponível'"), 'a criação da venda não devolve o lote');
assert(!service.includes('create-charge'), 'não emite boleto nem pix');

const memory = new Map<string, string>();
const storage = {
  getItem: (id: string) => memory.get(id) ?? null,
  setItem: (id: string, value: string) => { memory.set(id, value); },
  removeItem: (id: string) => { memory.delete(id); },
};
const storedKey = persistSaleRequestKey([storage], tenant, lot, key);
const afterReload = loadSaleRequestKey([storage], tenant, lot);
assert(afterReload === storedKey, 'recarregar a página recupera a mesma chave');
const recovered = applySaleFinancialCore(first.state, { sale: sale(), receipts: receipts(), requestKey: afterReload || '' });
assert(recovered.result.replayed && recovered.result.contractId == null && recovered.state.sales.length === 1 && recovered.state.cash.length === 1, 'timeout recupera a mesma venda sem outro caixa');
assert(resolveContractRetry(recovered.result.saleId, tenant, []).action === 'create', 'timeout sem contrato pede um contrato desta venda');
recovered.state.contracts.push({ id: 'contract-timeout', saleId: recovered.result.saleId, tenantId: tenant, current: true });
const afterContract = applySaleFinancialCore(recovered.state, { sale: sale(), receipts: receipts(), requestKey: afterReload || '' });
assert(afterContract.result.replayed && afterContract.result.contractId === 'contract-timeout' && afterContract.state.sales.length === 1, 'a repetição devolve o contrato desta venda');
clearSaleRequestKey([storage], tenant, lot);
assert(loadSaleRequestKey([storage], tenant, lot) === null, 'a chave só sai depois do contrato concluído');
assert(loadSaleRequestKey([storage], tenant, 'outro-lote') === null, 'a chave de um lote não vale para outro');

const map = fs.readFileSync(path.join(process.cwd(), 'components/map/GISMap.tsx'), 'utf8');
const saleAttempt = map.slice(map.indexOf('const saleRequestStores'), map.indexOf('if (wasReserved)'));
assert(saleAttempt.includes('sessionStorage') && saleAttempt.includes('localStorage'), 'a chave sobrevive ao recarregamento');
assert(saleAttempt.indexOf('clearSaleRequestKey') > saleAttempt.indexOf('O lote não foi liberado'), 'a chave só é apagada depois do contrato');

console.log('ok sale financial core');
