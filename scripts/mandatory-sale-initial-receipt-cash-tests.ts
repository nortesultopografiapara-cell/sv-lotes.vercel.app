/**
 * Entrada recebida no ato: valor confirmado, reversão restrita e corrida do caixa.
 * npx tsx scripts/mandatory-sale-initial-receipt-cash-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureSaleInitialReceiptCash,
  planSaleInitialCashMovements,
  SALE_INITIAL_CASH_PROVIDER,
  SALE_INITIAL_CASH_UNIQUE_INDEX,
  SaleInitialCashError,
  type SaleInitialReceipt,
} from '../lib/finance/saleInitialReceiptCash';
import {
  compensateSaleCreate,
  deleteOwnedSaleCreateCash,
  type SaleCreateRollbackDb,
} from '../lib/finance/saleCreateRollback';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const tenant = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const sale = '83125621-5dfa-45c5-b795-55f435f59ae0';

function receipt(partial: Partial<SaleInitialReceipt> & Pick<SaleInitialReceipt, 'id'>): SaleInitialReceipt {
  return {
    tenantId: tenant,
    companyId: tenant,
    saleId: sale,
    amount: 1000,
    paidAmount: 1000,
    status: 'pago',
    installmentNumber: 0,
    scheduleGroup: 'SIGNAL',
    ...partial,
  };
}

function plan(receipts: SaleInitialReceipt[]) {
  return planSaleInitialCashMovements({
    tenantId: tenant,
    saleId: sale,
    userId: 'operator-1',
    contractNumber: '000000046/2026',
    receipts,
    paidAt: '2026-11-07T12:00:00.000Z',
  });
}

const full = plan([receipt({ id: 'full', amount: 3500, paidAmount: 3500 })]);
assert(full.length === 1 && full[0].amount === 3500, 'pagamento integral gera uma entrada de 3500');

const partial = plan([
  receipt({ id: 'initial', amount: 1000, paidAmount: 1000 }),
  ...Array.from({ length: 5 }, (_, index) => receipt({
    id: `future-${index}`,
    amount: 500,
    paidAmount: 0,
    status: 'pendente',
    installmentNumber: index + 1,
  })),
  ...Array.from({ length: 120 }, (_, index) => receipt({
    id: `lot-${index}`,
    amount: 551.57,
    paidAmount: 0,
    status: 'pendente',
    installmentNumber: index + 1,
    scheduleGroup: 'LOT',
  })),
]);
assert(partial.length === 1 && partial[0].amount === 1000, 'pagamento parcial gera uma entrada de 1000');

assert(plan([receipt({
  id: 'forecast',
  amount: 3500,
  paidAmount: 0,
  status: 'pendente',
  scheduleGroup: null,
})]).length === 0, 'venda sem pagamento inicial não gera caixa');

assert(plan([receipt({
  id: 'zero-paid',
  amount: 1000,
  paidAmount: 0,
  status: 'pago',
  scheduleGroup: null,
})]).length === 0, 'paid_amount zero não usa o valor da parcela');

assert(plan([receipt({
  id: 'missing-paid',
  amount: 1000,
  paidAmount: null,
  status: 'pago',
  scheduleGroup: null,
})]).length === 0, 'venda legada sem paid_amount não lança o valor previsto');

let negative = false;
try {
  plan([receipt({ id: 'negative', paidAmount: -10 })]);
} catch (error) {
  negative = error instanceof SaleInitialCashError;
}
assert(negative, 'valor negativo é recusado');

const legacy = plan([receipt({
  id: 'legacy',
  scheduleGroup: null,
  amount: 800,
  paidAmount: 800,
})]);
assert(legacy.length === 1 && legacy[0].amount === 800, 'legado com paid_amount confirmado gera caixa');

type Stored = {
  id: string;
  tenant_id: string;
  company_id: string;
  sale_id: string;
  type: string;
  status: string;
  metadata: { provider?: string; installment_id?: string };
};

function cashClient(rows: Stored[], constraint: boolean) {
  return {
    from() {
      return {
        insert(payload: Record<string, unknown>) {
          const metadata = payload.metadata as Stored['metadata'];
          return {
            select() { return this; },
            maybeSingle: async () => {
              const receiptId = String(metadata.installment_id || '');
              if (
                constraint
                && rows.some((row) => row.metadata.installment_id === receiptId && row.status === 'ativo')
              ) {
                return { data: null, error: { code: '23505', message: 'duplicate key value' } };
              }
              const id = `cash-${rows.length + 1}`;
              rows.push({
                id,
                tenant_id: String(payload.tenant_id),
                company_id: String(payload.company_id),
                sale_id: String(payload.sale_id),
                type: String(payload.type),
                status: String(payload.status),
                metadata,
              });
              return { data: { id }, error: null };
            },
          };
        },
      };
    },
  };
}

function deleteClient(rows: Stored[], options: { fail?: boolean; stillThere?: boolean }) {
  const filters: Array<[string, string]> = [];
  const builder = {
    delete() { return builder; },
    select(columns?: string) {
      if (columns === 'id' && filters.length > 2) {
        return Promise.resolve(run());
      }
      return builder;
    },
    eq(key: string, value: string) { filters.push([key, String(value)]); return builder; },
    filter(expression: string, _op: string, value: string) {
      const key = expression.includes('provider') ? 'provider' : 'installment_id';
      filters.push([key, String(value)]);
      return builder;
    },
    maybeSingle: async () => ({ data: options.stillThere ? { id: filters.find(([key]) => key === 'id')?.[1] } : null, error: null }),
  };
  function run() {
    if (options.fail) return { data: null, error: { message: 'falha ao excluir caixa' } };
    const removed = rows.filter((row) => filters.every(([key, value]) => {
      if (key === 'provider') return row.metadata.provider === value;
      if (key === 'installment_id') return row.metadata.installment_id === value;
      return String((row as Record<string, string>)[key]) === value;
    }));
    for (const row of removed) {
      const index = rows.indexOf(row);
      if (index >= 0) rows.splice(index, 1);
    }
    return { data: removed.map((row) => ({ id: row.id })), error: null };
  }
  return { from: () => builder };
}

function rollbackDb(overrides: Partial<SaleCreateRollbackDb> = {}): SaleCreateRollbackDb & { released: boolean } {
  const state = { released: false };
  return {
    get released() { return state.released; },
    async deleteOwnedCash() { return { error: null, removed: true }; },
    async deleteBySale() { return { error: null }; },
    async deleteContractById() { return { error: null }; },
    async deleteSale() { return { error: null }; },
    async saleExists() { return { error: null, exists: false }; },
    async releaseLot() { state.released = true; return { error: null }; },
    ...overrides,
    releaseLot: overrides.releaseLot || (async () => { state.released = true; return { error: null }; }),
  };
}

async function main() {
  const constrained: Stored[] = [];
  const client = cashClient(constrained, true);
  const first = await ensureSaleInitialReceiptCash(client as never, {
    tenantId: tenant,
    saleId: sale,
    userId: 'operator-1',
    receipts: [receipt({ id: 'same' })],
  });
  const second = await ensureSaleInitialReceiptCash(client as never, {
    tenantId: tenant,
    saleId: sale,
    userId: 'operator-1',
    receipts: [receipt({ id: 'same' })],
  });
  assert(constrained.length === 1 && first.length === 1 && second.length === 0, 'índice único impede a segunda requisição do mesmo recebível');
  assert(second.every((row) => row.id !== first[0].id) || second.length === 0, 'a requisição perdedora não assume o caixa da vencedora');

  const open: Stored[] = [];
  const openClient = cashClient(open, false);
  await Promise.all([
    ensureSaleInitialReceiptCash(openClient as never, {
      tenantId: tenant, saleId: sale, userId: 'operator-1', receipts: [receipt({ id: 'race' })],
    }),
    ensureSaleInitialReceiptCash(openClient as never, {
      tenantId: tenant, saleId: sale, userId: 'operator-1', receipts: [receipt({ id: 'race' })],
    }),
  ]);
  assert(open.length === 2, 'sem o índice, duas requisições simultâneas duplicam o caixa');

  const proposal = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261107133000_sale_financial_core.sql'),
    'utf8',
  );
  assert(proposal.includes('depois das contagens de duplicidade'), 'migration exige a conferência antes de Production');
  assert(proposal.includes(SALE_INITIAL_CASH_UNIQUE_INDEX), 'migration cria o índice do recebível');
  assert(proposal.includes('sale_create_request_key'), 'migration cobre a repetição da venda');
  assert(!proposal.includes('execute_authorized_manual_receipt_payment'), 'migration não altera a baixa manual');

  let insertFailed = false;
  try {
    await ensureSaleInitialReceiptCash({
      from: () => ({
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'falha de caixa' } }),
          }),
        }),
      }),
    } as never, {
      tenantId: tenant,
      saleId: sale,
      userId: 'operator-1',
      receipts: [receipt({ id: 'broken' })],
    });
  } catch (error) {
    insertFailed = error instanceof SaleInitialCashError;
  }
  assert(insertFailed, 'falha no INSERT interrompe a venda');

  let foreign = false;
  try {
    await ensureSaleInitialReceiptCash(cashClient([], true) as never, {
      tenantId: tenant,
      saleId: sale,
      userId: 'operator-1',
      receipts: [receipt({ id: 'foreign', tenantId: other, companyId: other })],
    });
  } catch (error) {
    foreign = error instanceof SaleInitialCashError;
  }
  assert(foreign, 'recebível de outra empresa é recusado');

  const manual: Stored = {
    id: 'manual-1',
    tenant_id: tenant,
    company_id: tenant,
    sale_id: sale,
    type: 'entrada',
    status: 'ativo',
    metadata: { provider: 'MANUAL_FINANCE', installment_id: 'parcel-2' },
  };
  const owned: Stored = {
    id: 'cash-owned',
    tenant_id: tenant,
    company_id: tenant,
    sale_id: sale,
    type: 'entrada',
    status: 'ativo',
    metadata: { provider: SALE_INITIAL_CASH_PROVIDER, installment_id: 'initial' },
  };
  const book = [manual, owned];
  const removed = await deleteOwnedSaleCreateCash(deleteClient(book, {}) as never, {
    id: 'cash-owned',
    tenantId: tenant,
    saleId: sale,
    receiptId: 'initial',
  });
  assert(removed.removed && book.some((row) => row.id === 'manual-1') && !book.some((row) => row.id === 'cash-owned'), 'reversão não apaga a baixa manual');

  const cashFail = await compensateSaleCreate(rollbackDb({
    async deleteOwnedCash() { return { error: 'falha ao excluir caixa', removed: false }; },
  }), {
    tenantId: tenant, saleId: sale, contractId: 'contract-1', lotId: 'lot-1',
    ownedCash: [{ id: 'cash-owned', tenantId: tenant, saleId: sale, receiptId: 'initial' }],
  });
  assert(!cashFail.lotReleased && cashFail.failures.some((failure) => failure.step === 'cash'), 'falha na exclusão do caixa não libera o lote');

  const receiptFail = await compensateSaleCreate(rollbackDb({
    async deleteBySale(table) {
      return table === 'finance_receipts' ? { error: 'falha nos recebíveis' } : { error: null };
    },
  }), {
    tenantId: tenant, saleId: sale, contractId: null, lotId: 'lot-1', ownedCash: [],
  });
  assert(!receiptFail.lotReleased && receiptFail.failures.some((failure) => failure.step === 'finance_receipts'), 'falha na exclusão dos recebíveis não libera o lote');

  const saleFail = await compensateSaleCreate(rollbackDb({
    async deleteSale() { return { error: 'falha na venda' }; },
  }), {
    tenantId: tenant, saleId: sale, contractId: null, lotId: 'lot-1', ownedCash: [],
  });
  assert(!saleFail.lotReleased && saleFail.failures.some((failure) => failure.step === 'sale'), 'falha na exclusão da venda não libera o lote');

  const stillThere = await compensateSaleCreate(rollbackDb({
    async saleExists() { return { error: null, exists: true }; },
  }), {
    tenantId: tenant, saleId: sale, contractId: null, lotId: 'lot-1', ownedCash: [],
  });
  assert(!stillThere.lotReleased && stillThere.failures.some((failure) => failure.step === 'sale_still_exists'), 'lote não fica disponível com venda existente');

  let soldReleased = false;
  const soldLot = await compensateSaleCreate(rollbackDb({
    async lotHasSale() { return { error: null, exists: true }; },
    async releaseLot() { soldReleased = true; return { error: null }; },
  }), {
    tenantId: tenant, saleId: null, contractId: null, lotId: 'lot-1', ownedCash: [],
  });
  assert(!soldLot.lotReleased && !soldReleased && soldLot.failures.some((failure) => failure.step === 'lot_still_linked'), 'reversão antiga não libera lote que ainda tem venda');

  const closed = await compensateSaleCreate({
    async deleteOwnedCash() { return { error: null, removed: true }; },
    async deleteBySale() { return { error: null }; },
    async deleteContractById() { return { error: null }; },
    async deleteSale() { return { error: null }; },
    async saleExists() { return { error: null, exists: false }; },
    async releaseLot() { throw new Error('não deveria liberar'); },
  }, {
    tenantId: tenant, saleId: null, contractId: null, lotId: 'lot-1', ownedCash: [],
  });
  assert(!closed.lotReleased && closed.failures.some((failure) => failure.step === 'lot_still_linked'), 'sem consulta da venda o lote permanece vendido');

  const rollbackSource = fs.readFileSync(path.join(process.cwd(), 'lib/finance/saleCreateRollback.ts'), 'utf8');
  assert(rollbackSource.includes(".is('sale_id', null)"), 'a liberação antiga só alcança lote sem venda');

  const service = fs.readFileSync(path.join(process.cwd(), 'lib/gisSaleCreateService.ts'), 'utf8');
  assert(service.includes('paid_amount'), 'consulta legada pede paid_amount');
  assert(service.includes('invokeSaleFinancialCore'), 'caixa inicial entra na transação');
  assert(!service.includes('rollbackPartialSale'), 'reversão não apaga o caixa de outra operação');
  assert(!service.includes("from('cash_movements').delete().eq('sale_id'"), 'reversão não apaga todo o caixa da venda');
  assert(!service.includes('create-charge'), 'criação da venda não emite cobrança');
  const helper = fs.readFileSync(path.join(process.cwd(), 'lib/finance/saleInitialReceiptCash.ts'), 'utf8');
  assert(!helper.includes(".from('cash_movements')\n      .select"), 'idempotência não depende de consulta anterior');
  assert(!helper.includes('asaas') && !helper.includes('boleto') && !helper.includes('pix'), 'entrada não emite boleto nem pix');

  console.log('ok sale initial receipt cash');
}

main();
