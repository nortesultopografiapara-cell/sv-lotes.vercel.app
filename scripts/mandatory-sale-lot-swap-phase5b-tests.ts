/**
 * Fase 5B — cobranças externas da Troca de lote (mutação com APIs mockadas).
 * npx tsx scripts/mandatory-sale-lot-swap-phase5b-tests.ts
 *
 * Sem chamada Asaas/Inter real. LIVE só via helper scoped + inject mockado.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  asaasExternalChargeProvider,
  createUnimplementedExternalChargeProvider,
  ensureExternalChargeProvidersRegistered,
  interExternalChargeProvider,
  resetExternalChargeMutationFnsForTests,
  setExternalChargeMutationFnsForTests,
} from '../lib/finance/externalCharges';
import { ExternalChargeMutationDisabledError } from '../lib/finance/externalCharges/types';
import { buildLotSwapFinancialPlan } from '../lib/finance/saleLotSwapPlan';
import {
  executeSaleLotSwapWithExternalCharges,
  LotSwapChargesPhaseError,
  setSaleLotSwapLocalExecuteForTests,
} from '../lib/finance/saleLotSwapChargesExecuteService';
import {
  LOT_SWAP_CHARGES_CANCEL_FAILED,
  LOT_SWAP_CHARGES_LIVE_DISABLED,
} from '../lib/finance/saleLotSwapChargesPhase';
import { setLotSwapChargesLiveScopeEnvForTests } from '../lib/finance/saleLotSwapChargesLiveScope';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';
import type { LotSwapExecutedResult } from '../lib/finance/saleLotSwapExecuteService';
import {
  LOT_SWAP_CHARGES_CANCEL_THEN_OFFICIAL_GENERATE_NOTICE,
  LOT_SWAP_CHARGES_NO_OLD_CANCEL_NOTICE,
  LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE,
} from '../lib/finance/saleLotSwapExternalCharges';
import { LOT_SWAP_CROSS_TENANT } from '../lib/finance/saleLotSwapPreview';
import { buildSaleChargesSummaryFromRows } from '../lib/finance/saleChargesShared';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function planWithReceipts() {
  return buildLotSwapFinancialPlan({
    oldSalePrice: 100000,
    newLotPrice: 120000,
    receipts: [
      { id: 'r-paid', installment_number: 3, status: 'pago', amount: 1166.01, paid_at: '2026-08-10' },
      { id: 'r-future', installment_number: 4, status: 'pendente', amount: 1166.01, due_date: '2026-09-10' },
    ],
  });
}

function executedResult(saleId: string, swapId: string, reused: boolean): LotSwapExecutedResult {
  return {
    mutation: true,
    execute: true,
    persistCharges: false,
    reused,
    status: 'EXECUTED',
    swapId,
    saleId,
    fromBlockId: 'from-1',
    toBlockId: 'to-1',
    fromContractId: 'c-old',
    toContractId: 'c-new',
    toContractNumber: '000000099/2026',
    saleIdUnchanged: true,
    chargesUntouched: true,
  };
}

class TableApi {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private patch: Record<string, unknown> | null = null;
  constructor(
    private table: string,
    private store: Record<string, Record<string, unknown>[]>,
  ) {}
  select() {
    return this;
  }
  update(patch: Record<string, unknown>) {
    this.patch = patch;
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push((row) => String(row[key] ?? '') === String(value ?? ''));
    return this;
  }
  in(key: string, values: unknown[]) {
    const set = new Set(values.map((v) => String(v)));
    this.filters.push((row) => set.has(String(row[key] ?? '')));
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  private rows(): Record<string, unknown>[] {
    return (this.store[this.table] || []).filter((row) => this.filters.every((fn) => fn(row)));
  }
  result() {
    const matched = this.rows();
    if (this.patch) {
      for (const row of matched) Object.assign(row, this.patch);
    }
    return { data: matched, error: null };
  }
  async maybeSingle() {
    const { data, error } = this.result();
    return { data: data[0] || null, error };
  }
  then<T>(
    resolve?: (value: { data: Record<string, unknown>[] | null; error: null }) => T,
    reject?: (reason: unknown) => T,
  ) {
    return Promise.resolve(this.result()).then(resolve as never, reject as never);
  }
}

function createStore(tables: Record<string, Record<string, unknown>[]>) {
  const store: Record<string, Record<string, unknown>[]> = {};
  for (const [key, rows] of Object.entries(tables)) {
    store[key] = rows.map((row) => ({ ...row }));
  }
  return {
    store,
    admin: {
      from(table: string) {
        return new TableApi(table, store);
      },
    },
  };
}

function baseTables(extra?: Record<string, Record<string, unknown>[]>) {
  const plan = planWithReceipts();
  return {
    users: [{ id: 'user-1', role: 'ADMIN', tenant_id: 'co-1', company_id: 'co-1' }],
    sales: [
      {
        id: 'sale-1',
        company_id: 'co-1',
        tenant_id: 'co-1',
        financial_account_id: null,
        project_id: 'p1',
      },
    ],
    sale_lot_swaps: [
      {
        id: 'swap-1',
        company_id: 'co-1',
        tenant_id: 'co-1',
        sale_id: 'sale-1',
        status: 'CALCULATED',
        financial_snapshot: { plan },
        charges_phase: null,
        charges_snapshot: {},
      },
    ],
    finance_receipts: [
      { id: 'r-paid', sale_id: 'sale-1', status: 'pago', paid_at: '2026-08-10', installment_number: 3 },
      { id: 'r-future', sale_id: 'sale-1', status: 'pendente', installment_number: 4 },
    ],
    company_asaas_charges: [
      {
        id: 'a-paid',
        company_id: 'co-1',
        sale_id: 'sale-1',
        installment_id: 'r-paid',
        status: 'PAID',
      },
      {
        id: 'a-open',
        company_id: 'co-1',
        sale_id: 'sale-1',
        installment_id: 'r-future',
        status: 'PENDING',
      },
    ],
    bank_charges: [],
    bank_integrations: [],
    company_financial_accounts: [],
    bank_credentials: [],
    projects: [{ id: 'p1', financial_account_id: null }],
    ...extra,
  };
}

function installLocalExecute(ctx: ReturnType<typeof createStore>, opts?: { fail?: boolean }) {
  let calls = 0;
  setSaleLotSwapLocalExecuteForTests(async (_admin, input) => {
    calls += 1;
    if (opts?.fail) throw new Error('local execute should not run');
    const swap = ctx.store.sale_lot_swaps.find((row) => String(row.id) === String(input.swapId));
    const reused = String(swap?.status || '') === 'EXECUTED';
    if (swap) {
      swap.status = 'EXECUTED';
      swap.executed_at = new Date().toISOString();
    }
    for (const row of ctx.store.finance_receipts || []) {
      if (String(row.id) === 'r-future') row.status = 'cancelado';
    }
    if (!(ctx.store.finance_receipts || []).some((row) => String(row.id) === 'r-new')) {
      ctx.store.finance_receipts = ctx.store.finance_receipts || [];
      ctx.store.finance_receipts.push({
        id: 'r-new',
        sale_id: input.saleId,
        status: 'pendente',
        installment_number: 1,
      });
    }
    return executedResult(input.saleId, String(input.swapId || 'swap-1'), reused);
  });
  return () => calls;
}

function developScopedLiveEnv(extra?: Record<string, string | undefined>): Record<string, string> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: `https://${DEVELOP_PROJECT_REF}.supabase.co`,
    LOT_SWAP_EXTERNAL_CHARGES_LIVE: 'scoped',
    LOT_SWAP_CHARGES_LIVE_PROVIDERS: 'ASAAS',
    LOT_SWAP_CHARGES_LIVE_COMPANY_IDS: 'co-1',
    LOT_SWAP_CHARGES_LIVE_SALE_IDS: 'sale-1',
    LOT_SWAP_CHARGES_LIVE_SWAP_IDS: 'swap-1',
    ...extra,
  };
}

async function withHarness<T>(fn: () => Promise<T>): Promise<T> {
  try {
    ensureExternalChargeProvidersRegistered();
    return await fn();
  } finally {
    resetExternalChargeMutationFnsForTests();
    setSaleLotSwapLocalExecuteForTests(null);
    setLotSwapChargesLiveScopeEnvForTests(null);
  }
}

async function testLiveOffDoesNotCancelOrExecute() {
  await withHarness(async () => {
    setLotSwapChargesLiveScopeEnvForTests({
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    });
    const ctx = createStore(baseTables());
    const localCalls = installLocalExecute(ctx, { fail: true });
    let cancelCalls = 0;
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async () => {
        cancelCalls += 1;
        return { ok: true, reused: false, chargeId: 'a-open', status: 'CANCELLED' };
      },
    });
    try {
      await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
        saleId: 'sale-1',
        userId: 'user-1',
        swapId: 'swap-1',
        live: false,
      });
      throw new Error('deveria bloquear live off');
    } catch (err) {
      assert(err instanceof LotSwapChargesPhaseError, 'erro de fase');
      assert(err.code === LOT_SWAP_CHARGES_LIVE_DISABLED, 'live disabled');
      assert(err.chargesPhase === 'PREPARED', 'permanece PREPARED');
    }
    assert(cancelCalls === 0, 'sem cancel mock');
    assert(localCalls() === 0, 'Fase 4 não executou');
    assert(String(ctx.store.sale_lot_swaps[0].status) === 'CALCULATED', 'status Fase 4 intacto');
    assert(String(ctx.store.sale_lot_swaps[0].charges_phase) === 'PREPARED', 'phase PREPARED');
  });
  console.log('OK testLiveOffDoesNotCancelOrExecute');
}

async function testPaidNeverCancelledAndPendingCancelled() {
  await withHarness(async () => {
    setLotSwapChargesLiveScopeEnvForTests(developScopedLiveEnv());
    const ctx = createStore(baseTables());
    const localCalls = installLocalExecute(ctx);
    const canceled: string[] = [];
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async (_admin, companyId, chargeId) => {
        assert(companyId === 'co-1', 'tenant no cancel');
        canceled.push(chargeId);
        return { ok: true, reused: canceled.filter((id) => id === chargeId).length > 1, chargeId, status: 'CANCELLED' };
      },
      generateAsaasCharges: async () => {
        throw new Error('5B cancel-only não gera cobrança Asaas');
      },
    });
    const first = await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      swapId: 'swap-1',
      live: true,
    });
    assert(first.chargesPhase === 'COMPLETED', 'COMPLETED');
    assert(canceled.join() === 'a-open', 'só a pendente foi cancelada');
    assert(!canceled.includes('a-paid'), 'paga nunca cancelada');
    assert(localCalls() === 1, 'Fase 4 uma vez');
    assert(first.generatedReceiptIds.length === 0, 'não gera parcelas novas');
    assert(String(ctx.store.sale_lot_swaps[0].status) === 'EXECUTED', 'local EXECUTED');
    const phases = (ctx.store.sale_lot_swaps[0].charges_snapshot as { phase?: string }).phase;
    assert(phases === 'COMPLETED', 'snapshot COMPLETED');

    const second = await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      swapId: 'swap-1',
      live: true,
    });
    assert(second.chargesPhase === 'COMPLETED', 'retry COMPLETED');
    assert(canceled.length === 1, 'retry não cancela de novo');
    assert(localCalls() === 2 && second.local?.reused === true, 'Fase 4 reused');
  });
  console.log('OK testPaidNeverCancelledAndPendingCancelled');
}

async function testCancelFailureDoesNotExecuteLocal() {
  await withHarness(async () => {
    setLotSwapChargesLiveScopeEnvForTests(developScopedLiveEnv());
    const ctx = createStore(baseTables());
    const localCalls = installLocalExecute(ctx, { fail: true });
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async () => {
        throw new Error('asaas mock 500');
      },
    });
    try {
      await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
        saleId: 'sale-1',
        userId: 'user-1',
        swapId: 'swap-1',
        live: true,
      });
      throw new Error('deveria falhar cancel');
    } catch (err) {
      assert(err instanceof LotSwapChargesPhaseError, 'erro de fase');
      assert(err.code === LOT_SWAP_CHARGES_CANCEL_FAILED, 'cancel failed');
      assert(/1 cobrança\(s\) no ASAAS/.test(err.message), 'informa provider e quantidade');
      assert(!err.local, 'sem execute local');
    }
    assert(localCalls() === 0, 'Fase 4 não rodou');
    assert(String(ctx.store.sale_lot_swaps[0].status) === 'CALCULATED', 'não executou');
    assert(String(ctx.store.sale_lot_swaps[0].charges_phase) === 'FAILED', 'FAILED');
    const snap = ctx.store.sale_lot_swaps[0].charges_snapshot as { failedStage?: string };
    assert(snap.failedStage === 'CANCEL', 'failedStage CANCEL');
  });
  console.log('OK testCancelFailureDoesNotExecuteLocal');
}

async function testNonCancelableBlocksBeforePhase4() {
  await withHarness(async () => {
    const tables = baseTables();
    tables.company_asaas_charges = [
      {
        id: 'a-reg',
        company_id: 'co-1',
        sale_id: 'sale-1',
        installment_id: 'r-future',
        status: 'REGISTERED',
      },
    ];
    const ctx = createStore(tables);
    const localCalls = installLocalExecute(ctx, { fail: true });
    let cancelCalls = 0;
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async () => {
        cancelCalls += 1;
        return { ok: true, reused: false, chargeId: 'a-reg', status: 'CANCELLED' };
      },
    });
    try {
      await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
        saleId: 'sale-1',
        userId: 'user-1',
        swapId: 'swap-1',
        live: true,
      });
      throw new Error('deveria bloquear REGISTERED');
    } catch (err) {
      assert(err instanceof LotSwapChargesPhaseError, 'erro de fase');
      assert(err.code === LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE, 'non_cancelable');
    }
    assert(cancelCalls === 0, 'não chama cancel');
    assert(localCalls() === 0, 'não executa Fase 4');
  });
  console.log('OK testNonCancelableBlocksBeforePhase4');
}

async function testNoOldChargesCompletesWithoutLive() {
  await withHarness(async () => {
    const tables = baseTables({ company_asaas_charges: [], bank_charges: [] });
    const ctx = createStore(tables);
    const localCalls = installLocalExecute(ctx);
    let http = 0;
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async () => {
        http += 1;
        throw new Error('HTTP Asaas não autorizado');
      },
      generateAsaasCharges: async () => {
        http += 1;
        throw new Error('generate não deve rodar');
      },
    });
    const result = await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      swapId: 'swap-1',
      live: false,
    });
    assert(result.chargesPhase === 'COMPLETED', 'COMPLETED sem cobrança antiga');
    assert(result.live === false, 'sem LIVE');
    assert(result.remoteApiCalled === false, 'zero API remota');
    assert(result.canceledChargeIds.length === 0, 'nada a cancelar');
    assert(localCalls() === 1, 'Fase 4 executou');
    assert(http === 0, 'zero HTTP');
    assert(String(ctx.store.sale_lot_swaps[0].status) === 'EXECUTED', 'Fase 4 EXECUTED');
    assert(String(ctx.store.sale_lot_swaps[0].charges_phase) === 'COMPLETED', 'phase COMPLETED');
  });
  console.log('OK testNoOldChargesCompletesWithoutLive');
}

async function testDevelopHomologAutoCancelsWithoutScopedLive() {
  await withHarness(async () => {
    setLotSwapChargesLiveScopeEnvForTests({
      NEXT_PUBLIC_SUPABASE_URL: `https://${DEVELOP_PROJECT_REF}.supabase.co`,
    });
    const ctx = createStore(baseTables());
    const localCalls = installLocalExecute(ctx);
    const canceled: string[] = [];
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async (_a, _c, chargeId) => {
        canceled.push(chargeId);
        return { ok: true, reused: false, chargeId, status: 'CANCELLED' };
      },
      generateAsaasCharges: async () => {
        throw new Error('não gera boleto novo');
      },
    });
    const result = await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      swapId: 'swap-1',
    });
    assert(result.chargesPhase === 'COMPLETED', 'COMPLETED no DEVELOP sem scoped');
    assert(canceled.join() === 'a-open', 'cancelou a aberta');
    assert(!canceled.includes('a-paid'), 'paga preservada');
    assert(localCalls() === 1, 'Fase 4 depois do cancel');
    assert(result.generatedReceiptIds.length === 0, 'não gera boleto');
  });
  console.log('OK testDevelopHomologAutoCancelsWithoutScopedLive');
}

async function testOnePaidFourOpenThenPhase4() {
  await withHarness(async () => {
    setLotSwapChargesLiveScopeEnvForTests({
      NEXT_PUBLIC_SUPABASE_URL: `https://${DEVELOP_PROJECT_REF}.supabase.co`,
    });
    const plan = buildLotSwapFinancialPlan({
      oldSalePrice: 100,
      newLotPrice: 80,
      receipts: [
        { id: 'r-paid', installment_number: 0, status: 'pago', amount: 20, paid_at: '2026-08-10' },
        { id: 'r-f1', installment_number: 1, status: 'pendente', amount: 20, due_date: '2026-09-10' },
        { id: 'r-f2', installment_number: 2, status: 'pendente', amount: 20, due_date: '2026-10-10' },
        { id: 'r-f3', installment_number: 3, status: 'pendente', amount: 20, due_date: '2026-11-10' },
        { id: 'r-f4', installment_number: 4, status: 'pendente', amount: 20, due_date: '2026-12-10' },
      ],
    });
    assert(plan.receipts.preserve.length === 1, '1 parcela paga preservada');
    assert(plan.receipts.cancel.length === 4, '4 parcelas futuras a cancelar internamente');
    assert(plan.financials.new_balance === 60, 'saldo 80-20=60');
    const tables = baseTables();
    tables.sale_lot_swaps[0].financial_snapshot = { plan };
    tables.finance_receipts = [
      { id: 'r-paid', sale_id: 'sale-1', status: 'pago', paid_at: '2026-08-10', installment_number: 0 },
      { id: 'r-f1', sale_id: 'sale-1', status: 'pendente', installment_number: 1 },
      { id: 'r-f2', sale_id: 'sale-1', status: 'pendente', installment_number: 2 },
      { id: 'r-f3', sale_id: 'sale-1', status: 'pendente', installment_number: 3 },
      { id: 'r-f4', sale_id: 'sale-1', status: 'pendente', installment_number: 4 },
    ];
    tables.company_asaas_charges = [
      { id: 'a-paid', company_id: 'co-1', sale_id: 'sale-1', installment_id: 'r-paid', status: 'PAID' },
      { id: 'a-1', company_id: 'co-1', sale_id: 'sale-1', installment_id: 'r-f1', status: 'PENDING' },
      { id: 'a-2', company_id: 'co-1', sale_id: 'sale-1', installment_id: 'r-f2', status: 'PENDING' },
      { id: 'a-3', company_id: 'co-1', sale_id: 'sale-1', installment_id: 'r-f3', status: 'PENDING' },
      { id: 'a-4', company_id: 'co-1', sale_id: 'sale-1', installment_id: 'r-f4', status: 'PENDING' },
    ];
    const ctx = createStore(tables);
    const localCalls = installLocalExecute(ctx);
    const canceled: string[] = [];
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async (_a, _c, chargeId) => {
        canceled.push(chargeId);
        return { ok: true, reused: false, chargeId, status: 'CANCELLED' };
      },
      generateAsaasCharges: async () => {
        throw new Error('não gera boleto das novas parcelas');
      },
    });
    const first = await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      swapId: 'swap-1',
    });
    assert(first.chargesPhase === 'COMPLETED', 'COMPLETED');
    assert(canceled.sort().join() === 'a-1,a-2,a-3,a-4', '4 abertas canceladas');
    assert(!canceled.includes('a-paid'), 'paga nunca cancelada');
    assert(localCalls() === 1, 'Fase 4 uma vez');
    assert(first.generatedReceiptIds.length === 0, 'sem boleto novo');
    const retry = await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      swapId: 'swap-1',
    });
    assert(retry.local?.reused === true, 'retry reused');
    assert(canceled.length === 4, 'retry não cancela de novo');
    assert(localCalls() === 2, 'Fase 4 reused na segunda');
  });
  console.log('OK testOnePaidFourOpenThenPhase4');
}

async function testRetryAfterPartialCancelIsIdempotent() {
  await withHarness(async () => {
    setLotSwapChargesLiveScopeEnvForTests(developScopedLiveEnv());
    const tables = baseTables();
    tables.company_asaas_charges = [
      {
        id: 'a-paid',
        company_id: 'co-1',
        sale_id: 'sale-1',
        installment_id: 'r-paid',
        status: 'PAID',
      },
      {
        id: 'a-open-1',
        company_id: 'co-1',
        sale_id: 'sale-1',
        installment_id: 'r-future',
        status: 'PENDING',
      },
      {
        id: 'a-open-2',
        company_id: 'co-1',
        sale_id: 'sale-1',
        installment_id: 'r-future',
        status: 'PENDING',
      },
    ];
    const ctx = createStore(tables);
    const localCalls = installLocalExecute(ctx);
    const canceled: string[] = [];
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async (_a, _c, chargeId) => {
        canceled.push(chargeId);
        if (chargeId === 'a-open-2' && canceled.filter((id) => id === 'a-open-2').length === 1) {
          throw new Error('asaas mock 500 na segunda');
        }
        return { ok: true, reused: false, chargeId, status: 'CANCELLED' };
      },
      generateAsaasCharges: async () => {
        throw new Error('generate não deve rodar');
      },
    });
    try {
      await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
        saleId: 'sale-1',
        userId: 'user-1',
        swapId: 'swap-1',
        live: true,
      });
      throw new Error('deveria falhar no segundo cancel');
    } catch (err) {
      assert(err instanceof LotSwapChargesPhaseError, 'erro de fase');
      assert(err.code === LOT_SWAP_CHARGES_CANCEL_FAILED, 'cancel failed');
    }
    assert(localCalls() === 0, 'Fase 4 não rodou no fail');
    assert(canceled.join() === 'a-open-1,a-open-2', 'tentou as duas');
    assert(String(ctx.store.sale_lot_swaps[0].status) === 'CALCULATED', 'Fase 4 intacta');
    assert(String(ctx.store.sale_lot_swaps[0].charges_phase) === 'FAILED', 'FAILED');

    const retry = await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      swapId: 'swap-1',
      live: true,
    });
    assert(retry.chargesPhase === 'COMPLETED', 'retry COMPLETED');
    assert(canceled.filter((id) => id === 'a-open-1').length === 1, 'não recancela a primeira');
    assert(canceled.filter((id) => id === 'a-open-2').length === 2, 'retry só a segunda');
    assert(localCalls() === 1, 'Fase 4 só depois do cancel ok');
  });
  console.log('OK testRetryAfterPartialCancelIsIdempotent');
}

async function testInterMockCancelOnly() {
  await withHarness(async () => {
    const tables = baseTables({
      company_asaas_charges: [],
      bank_charges: [
        {
          id: 'i-open',
          company_id: 'co-1',
          sale_id: 'sale-1',
          finance_receipt_id: 'r-future',
          status: 'PENDING',
          provider: 'INTER',
          external_id: 'sol-1',
        },
        {
          id: 'i-paid',
          company_id: 'co-1',
          sale_id: 'sale-1',
          finance_receipt_id: 'r-paid',
          status: 'PAID',
          provider: 'INTER',
          external_id: 'sol-paid',
        },
      ],
      company_financial_accounts: [
        {
          id: 'fa-inter',
          company_id: 'co-1',
          name: 'Inter',
          account_type: 'PROPRIETARIO',
          beneficiary_name: 'X',
          document: '1',
          email: null,
          phone: null,
          environment: 'sandbox',
          bank_integration_id: 'bi-inter',
          is_default: true,
          active: true,
          notes: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      bank_integrations: [
        {
          id: 'bi-inter',
          company_id: 'co-1',
          provider: 'INTER',
          status: 'ACTIVE',
          metadata: { connectionStatus: 'CONNECTED' },
        },
      ],
    });
    tables.sales[0].financial_account_id = 'fa-inter';
    const ctx = createStore(tables);
    const localCalls = installLocalExecute(ctx);
    setLotSwapChargesLiveScopeEnvForTests(
      developScopedLiveEnv({ LOT_SWAP_CHARGES_LIVE_PROVIDERS: 'INTER' }),
    );
    const canceled: string[] = [];
    setExternalChargeMutationFnsForTests({
      cancelInterCharge: async (_a, companyId, chargeId) => {
        assert(companyId === 'co-1', 'Inter tenant');
        canceled.push(chargeId);
        return { ok: true, reused: false, chargeId, status: 'CANCELLED' };
      },
      generateInterCharges: async () => {
        throw new Error('5B cancel-only não gera cobrança Inter');
      },
    });
    const result = await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      swapId: 'swap-1',
      live: true,
    });
    assert(result.chargesPhase === 'COMPLETED', 'Inter COMPLETED');
    assert(canceled.join() === 'i-open', 'Inter cancelou só a aberta');
    assert(!canceled.includes('i-paid'), 'Inter não cancela paga');
    assert(result.generatedReceiptIds.length === 0, 'Inter não gera na 5B');
    assert(localCalls() === 1, 'Fase 4 após cancel Inter');
  });
  console.log('OK testInterMockCancelOnly');
}

async function testUnimplementedProvidersRemainBlocked() {
  for (const provider of ['C6', 'BRADESCO', 'NUBANK'] as const) {
    await withHarness(async () => {
      const tables = baseTables({
        company_asaas_charges: [],
        bank_charges: [
          {
            id: `${provider.toLowerCase()}-1`,
            company_id: 'co-1',
            sale_id: 'sale-1',
            finance_receipt_id: 'r-future',
            status: 'PENDING',
            provider,
          },
        ],
      });
      const ctx = createStore(tables);
      const localCalls = installLocalExecute(ctx, { fail: true });
      let mutation = 0;
      setExternalChargeMutationFnsForTests({
        cancelAsaasCharge: async () => {
          mutation += 1;
          return { ok: true, reused: false, chargeId: 'x', status: 'CANCELLED' };
        },
        cancelInterCharge: async () => {
          mutation += 1;
          return { ok: true, reused: false, chargeId: 'x', status: 'CANCELLED' };
        },
      });
      try {
        await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
          saleId: 'sale-1',
          userId: 'user-1',
          swapId: 'swap-1',
          live: true,
        });
        throw new Error(`${provider} deveria bloquear`);
      } catch (err) {
        assert(err instanceof LotSwapChargesPhaseError, `${provider} erro de fase`);
        assert(
          err.code === LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE,
          `${provider} non_cancelable`,
        );
      }
      assert(mutation === 0, `${provider} sem API`);
      assert(localCalls() === 0, `${provider} não executa Fase 4`);
      const unimplemented = createUnimplementedExternalChargeProvider(provider);
      let refused = false;
      try {
        unimplemented.cancelCancelableCharge({} as never, {
          companyId: 'co-1',
          chargeId: `${provider.toLowerCase()}-1`,
        });
      } catch (err) {
        refused = err instanceof ExternalChargeMutationDisabledError;
      }
      assert(refused, `${provider} unimplemented recusa mutação`);
    });
  }
  console.log('OK testUnimplementedProvidersRemainBlocked');
}

async function testCrossTenantBlocked() {
  await withHarness(async () => {
    const tables = baseTables();
    tables.users = [{ id: 'user-b', role: 'ADMIN', tenant_id: 'co-b', company_id: 'co-b' }];
    const ctx = createStore(tables);
    const localCalls = installLocalExecute(ctx, { fail: true });
    let cancelCalls = 0;
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async () => {
        cancelCalls += 1;
        return { ok: true, reused: false, chargeId: 'a-open', status: 'CANCELLED' };
      },
    });
    try {
      await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
        saleId: 'sale-1',
        userId: 'user-b',
        swapId: 'swap-1',
        live: true,
      });
      throw new Error('deveria recusar CROSS_TENANT');
    } catch (err) {
      assert(err instanceof Error, 'erro');
      assert(
        (err as { code?: string }).code === LOT_SWAP_CROSS_TENANT,
        'CROSS_TENANT',
      );
    }
    assert(cancelCalls === 0, 'não cancela outro tenant');
    assert(localCalls() === 0, 'não executa outro tenant');
  });
  console.log('OK testCrossTenantBlocked');
}

async function testParkedLocalExecutedLiveOffDoesNotRestamp() {
  await withHarness(async () => {
    const executedAt = '2026-09-07T10:03:33.308762+00:00';
    const parkedAt = '2026-09-07T10:03:33.902+00:00';
    const snapshotUpdatedAt = '2026-09-07T10:03:33.902Z';
    const chargesSnapshot = {
      live: false,
      error: 'Geração remota desligada nesta entrega. Retry seguro depois da autorização.',
      phase: 'LOCAL_EXECUTED',
      updatedAt: snapshotUpdatedAt,
      failedStage: null,
      localExecuted: true,
      reusedReceiptIds: [] as string[],
      canceledChargeIds: [] as string[],
      generatedReceiptIds: [] as string[],
    };
    const tables = baseTables({ company_asaas_charges: [], bank_charges: [] });
    Object.assign(tables.sale_lot_swaps[0], {
      status: 'EXECUTED',
      executed_at: executedAt,
      idempotency_key: 'idem-parked-1',
      charges_phase: 'LOCAL_EXECUTED',
      charges_error: LOT_SWAP_CHARGES_LIVE_DISABLED,
      charges_phase_updated_at: parkedAt,
      updated_at: parkedAt,
      charges_snapshot: { ...chargesSnapshot },
    });
    tables.finance_receipts = [
      {
        id: 'r-paid',
        sale_id: 'sale-1',
        status: 'pago',
        paid_at: '2026-08-10',
        installment_number: 3,
      },
      {
        id: 'r-future',
        sale_id: 'sale-1',
        status: 'cancelado',
        installment_number: 4,
      },
      { id: 'r-new', sale_id: 'sale-1', status: 'pendente', installment_number: 1 },
    ];
    const ctx = createStore(tables);
    let localCalls = 0;
    setSaleLotSwapLocalExecuteForTests(async (_admin, input) => {
      localCalls += 1;
      const swap = ctx.store.sale_lot_swaps[0];
      assert(String(swap.status) === 'EXECUTED', 'Fase 4 já EXECUTED');
      assert(String(swap.executed_at) === executedAt, 'executed_at não pode mudar');
      assert(ctx.store.finance_receipts.length === 3, 'não criar parcela no reused');
      return executedResult(input.saleId, String(input.swapId || 'swap-1'), true);
    });
    let http = 0;
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async () => {
        http += 1;
        throw new Error('HTTP Asaas cancel não autorizado');
      },
      generateAsaasCharges: async () => {
        http += 1;
        throw new Error('HTTP Asaas generate não autorizado');
      },
      cancelInterCharge: async () => {
        http += 1;
        throw new Error('HTTP Inter cancel não autorizado');
      },
      generateInterCharges: async () => {
        http += 1;
        throw new Error('HTTP Inter generate não autorizado');
      },
    });

    const receiptsBefore = JSON.stringify(ctx.store.finance_receipts);
    const asaasBefore = JSON.stringify(ctx.store.company_asaas_charges);
    const bankBefore = JSON.stringify(ctx.store.bank_charges);
    const swapCountBefore = ctx.store.sale_lot_swaps.length;

    const second = await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      swapId: 'swap-1',
      idempotencyKey: 'idem-parked-1',
      live: false,
    });

    assert(second.chargesPhase === 'LOCAL_EXECUTED', 'permanece LOCAL_EXECUTED');
    assert(second.local?.reused === true, 'local.reused');
    assert(second.remoteApiCalled === false, 'sem API remota');
    assert(second.live === false, 'LIVE OFF');
    assert(http === 0, 'nenhum HTTP de provider');
    assert(localCalls === 1, 'Fase 4 reused uma vez');
    const swap = ctx.store.sale_lot_swaps[0];
    assert(String(swap.charges_phase) === 'LOCAL_EXECUTED', 'phase intacta');
    assert(String(swap.charges_error) === LOT_SWAP_CHARGES_LIVE_DISABLED, 'erro intacto');
    assert(String(swap.charges_phase_updated_at) === parkedAt, 'charges_phase_updated_at intacto');
    assert(String(swap.updated_at) === parkedAt, 'sale_lot_swaps.updated_at intacto');
    const snap = swap.charges_snapshot as { updatedAt?: string };
    assert(String(snap.updatedAt) === snapshotUpdatedAt, 'charges_snapshot.updatedAt intacto');
    assert(JSON.stringify(swap.charges_snapshot) === JSON.stringify(chargesSnapshot), 'snapshot material intacto');
    assert(String(swap.status) === 'EXECUTED', 'status Fase 4 intacto');
    assert(String(swap.executed_at) === executedAt, 'executed_at intacto');
    assert(ctx.store.sale_lot_swaps.length === swapCountBefore, 'nenhum swap novo');
    assert(JSON.stringify(ctx.store.finance_receipts) === receiptsBefore, 'parcelas intactas');
    assert(JSON.stringify(ctx.store.company_asaas_charges) === asaasBefore, 'Asaas intacto');
    assert(JSON.stringify(ctx.store.bank_charges) === bankBefore, 'bank_charges intacto');
  });
  console.log('OK testParkedLocalExecutedLiveOffDoesNotRestamp');
}

async function testProductionScopedEnvStaysOff() {
  await withHarness(async () => {
    setLotSwapChargesLiveScopeEnvForTests(
      developScopedLiveEnv({
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
      }),
    );
    const ctx = createStore(baseTables());
    const localCalls = installLocalExecute(ctx, { fail: true });
    let http = 0;
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async () => {
        http += 1;
        throw new Error('HTTP Asaas não autorizado');
      },
    });
    try {
      await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
        saleId: 'sale-1',
        userId: 'user-1',
        swapId: 'swap-1',
      });
      throw new Error('Production deveria permanecer OFF');
    } catch (err) {
      assert(err instanceof LotSwapChargesPhaseError, 'erro de fase');
      assert(err.code === LOT_SWAP_CHARGES_LIVE_DISABLED, 'LIVE_DISABLED');
    }
    assert(http === 0, 'zero HTTP');
    assert(localCalls() === 0, 'Fase 4 não executou');
  });
  console.log('OK testProductionScopedEnvStaysOff');
}

async function testDevelopTrueDoesNotEnableLive() {
  await withHarness(async () => {
    setLotSwapChargesLiveScopeEnvForTests(
      developScopedLiveEnv({ LOT_SWAP_EXTERNAL_CHARGES_LIVE: 'true' }),
    );
    const ctx = createStore(baseTables());
    const localCalls = installLocalExecute(ctx, { fail: true });
    let http = 0;
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async () => {
        http += 1;
        return { ok: true, reused: false, chargeId: 'a-open', status: 'CANCELLED' };
      },
    });
    try {
      await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
        saleId: 'sale-1',
        userId: 'user-1',
        swapId: 'swap-1',
        live: true,
      });
      throw new Error('true global deveria ser OFF');
    } catch (err) {
      assert(err instanceof LotSwapChargesPhaseError, 'erro de fase');
      assert(err.code === LOT_SWAP_CHARGES_LIVE_DISABLED, 'true inválido');
    }
    assert(http === 0 && localCalls() === 0, 'sem HTTP e sem Fase 4');
  });
  console.log('OK testDevelopTrueDoesNotEnableLive');
}

async function testAsaasAllowlistDoesNotCancelInter() {
  await withHarness(async () => {
    setLotSwapChargesLiveScopeEnvForTests(developScopedLiveEnv());
    const tables = baseTables({
      company_asaas_charges: [],
      bank_charges: [
        {
          id: 'i-open',
          company_id: 'co-1',
          sale_id: 'sale-1',
          finance_receipt_id: 'r-future',
          status: 'PENDING',
          provider: 'INTER',
        },
      ],
      company_financial_accounts: [
        {
          id: 'fa-inter',
          company_id: 'co-1',
          name: 'Inter',
          account_type: 'PROPRIETARIO',
          beneficiary_name: 'X',
          document: '1',
          email: null,
          phone: null,
          environment: 'sandbox',
          bank_integration_id: 'bi-inter',
          is_default: true,
          active: true,
          notes: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      bank_integrations: [
        {
          id: 'bi-inter',
          company_id: 'co-1',
          provider: 'INTER',
          status: 'ACTIVE',
          metadata: { connectionStatus: 'CONNECTED' },
        },
      ],
    });
    tables.sales[0].financial_account_id = 'fa-inter';
    const ctx = createStore(tables);
    const localCalls = installLocalExecute(ctx, { fail: true });
    let http = 0;
    setExternalChargeMutationFnsForTests({
      cancelInterCharge: async () => {
        http += 1;
        return { ok: true, reused: false, chargeId: 'i-open', status: 'CANCELLED' };
      },
    });
    try {
      await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
        saleId: 'sale-1',
        userId: 'user-1',
        swapId: 'swap-1',
      });
      throw new Error('INTER não deveria passar com allowlist ASAAS');
    } catch (err) {
      assert(err instanceof LotSwapChargesPhaseError, 'erro de fase');
      assert(err.code === LOT_SWAP_CHARGES_LIVE_DISABLED, 'INTER bloqueado');
    }
    assert(http === 0 && localCalls() === 0, 'sem HTTP Inter');
  });
  console.log('OK testAsaasAllowlistDoesNotCancelInter');
}

async function testC6BlockedEvenWithScopedLive() {
  await withHarness(async () => {
    setLotSwapChargesLiveScopeEnvForTests(
      developScopedLiveEnv({ LOT_SWAP_CHARGES_LIVE_PROVIDERS: 'C6' }),
    );
    const tables = baseTables({
      company_asaas_charges: [],
      bank_charges: [
        {
          id: 'c6-1',
          company_id: 'co-1',
          sale_id: 'sale-1',
          finance_receipt_id: 'r-future',
          status: 'PENDING',
          provider: 'C6',
        },
      ],
    });
    const ctx = createStore(tables);
    const localCalls = installLocalExecute(ctx, { fail: true });
    let http = 0;
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async () => {
        http += 1;
        return { ok: true, reused: false, chargeId: 'x', status: 'CANCELLED' };
      },
      cancelInterCharge: async () => {
        http += 1;
        return { ok: true, reused: false, chargeId: 'x', status: 'CANCELLED' };
      },
    });
    try {
      await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
        saleId: 'sale-1',
        userId: 'user-1',
        swapId: 'swap-1',
      });
      throw new Error('C6 deveria bloquear mesmo com LIVE scoped');
    } catch (err) {
      assert(err instanceof LotSwapChargesPhaseError, 'erro de fase');
      assert(err.code === LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE, 'C6 non_cancelable');
    }
    assert(http === 0 && localCalls() === 0, 'C6 sem API');
  });
  console.log('OK testC6BlockedEvenWithScopedLive');
}

async function testAdapterPaidAndReusedWithoutOfficialHttp() {
  const paidAdmin = createStore({
    company_asaas_charges: [
      { id: 'a-paid', company_id: 'co-1', status: 'PAID' },
    ],
    bank_charges: [{ id: 'i-paid', company_id: 'co-1', provider: 'INTER', status: 'PAID' }],
  }).admin;
  try {
    await asaasExternalChargeProvider.cancelCancelableCharge(paidAdmin as never, {
      companyId: 'co-1',
      chargeId: 'a-paid',
    });
    throw new Error('Asaas paga deveria recusar');
  } catch (err) {
    assert(/paga/i.test(err instanceof Error ? err.message : ''), 'Asaas recusa paga');
  }
  try {
    await interExternalChargeProvider.cancelCancelableCharge(paidAdmin as never, {
      companyId: 'co-1',
      chargeId: 'i-paid',
    });
    throw new Error('Inter paga deveria recusar');
  } catch (err) {
    assert(/paga/i.test(err instanceof Error ? err.message : ''), 'Inter recusa paga');
  }

  const reusedAdmin = createStore({
    company_asaas_charges: [
      { id: 'a-can', company_id: 'co-1', status: 'CANCELLED' },
    ],
    bank_charges: [
      { id: 'i-can', company_id: 'co-1', provider: 'INTER', status: 'CANCELLED' },
    ],
  }).admin;
  const asaasReused = await asaasExternalChargeProvider.cancelCancelableCharge(
    reusedAdmin as never,
    { companyId: 'co-1', chargeId: 'a-can' },
  );
  const interReused = await interExternalChargeProvider.cancelCancelableCharge(
    reusedAdmin as never,
    { companyId: 'co-1', chargeId: 'i-can' },
  );
  assert(asaasReused.reused && interReused.reused, 'cancel já encerrado = reused sem HTTP');
  console.log('OK testAdapterPaidAndReusedWithoutOfficialHttp');
}

function testOfficialChargesSummaryAfterSwap() {
  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: 'co-1',
    installments: [
      {
        id: 'r-paid',
        sale_id: 'sale-1',
        installment_number: 3,
        due_date: '2026-08-10',
        amount: 100,
        status: 'pago',
        paid_at: '2026-08-10',
      },
      {
        id: 'r-future',
        sale_id: 'sale-1',
        installment_number: 4,
        due_date: '2026-09-10',
        amount: 100,
        status: 'cancelado',
      },
      {
        id: 'r-new',
        sale_id: 'sale-1',
        installment_number: 1,
        due_date: '2026-10-10',
        amount: 100,
        status: 'pendente',
      },
    ],
    charges: [],
    context: {
      customerName: 'Cliente',
      customerEmail: null,
      customerPhone: null,
      projectName: 'Emp',
      quadra: '1',
      lote: '1',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: 'acc1',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
    installmentCorrectionType: 'FIXED',
  });
  assert(summary.missingInstallmentIds.includes('r-new'), 'parcela nova entra como faltante');
  assert(
    !summary.missingInstallmentIds.includes('r-future'),
    'parcela antiga cancelada não entra como faltante',
  );
  assert(!summary.missingInstallmentIds.includes('r-paid'), 'paga não entra como faltante');
  assert(summary.totalInstallments === 2, 'ativa = paga + nova');
  assert(summary.totalAmount === 200, 'total vigente sem cancelada');
  assert(summary.totalPaid === 100, 'paga preservada');
  assert(summary.totalPending === 100, 'só a nova pendente');
  console.log('OK testOfficialChargesSummaryAfterSwap');
}

function testSourceArchitecture() {
  const orch = read('lib/finance/saleLotSwapChargesExecuteService.ts');
  assert(orch.includes('isParkedAfterLocalExecute'), 'retry parked sem restamp');
  assert(orch.includes('resolveLotSwapExternalChargesLiveScope'), 'LIVE via helper');
  assert(orch.includes('isLotSwapExternalChargesLiveAuthorized'), 'LIVE por provider do registry');
  assert(!orch.includes("isLotSwapExternalChargeLiveEnabled"), 'orquestrador sem flag global');
  assert(!/LOT_SWAP_EXTERNAL_CHARGES_LIVE \|\| ''\)\.trim\(\) === 'true'/.test(orch), 'sem true global');
  assert(orch.includes('getExternalChargeProvider(charge.provider)'), 'cancel via registry');
  assert(!orch.includes('generateMissingCharges'), 'orquestrador sem generate');
  assert(
    !orch.includes('getExternalChargeProvider(preview.activeProvider)'),
    'sem generate via activeProvider',
  );
  assert(!orch.includes("phase: 'GENERATING'"), 'não grava GENERATING');
  assert(!orch.includes("phase: 'LOCAL_EXECUTED'"), 'não grava LOCAL_EXECUTED novo');
  assert(!orch.includes('cancelCompanyCharge'), 'orquestrador sem Asaas direto');
  assert(!orch.includes('cancelInterCobranca'), 'orquestrador sem Inter HTTP');
  assert(!orch.includes('createCompanyInstallmentCharge'), 'orquestrador sem create Asaas');
  assert(!orch.includes('createInterInstallmentCharge'), 'orquestrador sem create Inter');
  assert(!orch.includes("if (") || !/if\s*\([^)]*ASAAS/.test(orch), 'sem if ASAAS');
  assert(!/switch\s*\([^)]*provider/.test(orch), 'sem switch de banco');
  assert(!orch.includes('releaseLotService'), 'sem ReleaseLot');
  assert(!orch.includes('seller_parties_json'), 'sem Mundo Novo');
  assert(!orch.includes('resolveInterChargesForRelease'), 'sem cancel ReleaseLot Inter');

  const execute = read('lib/finance/saleLotSwapExecuteService.ts');
  assert(execute.includes('chargesUntouched: true'), 'Fase 4 intacta');
  assert(!execute.includes('executeSaleLotSwapWithExternalCharges'), 'Fase 4 não chama 5B');

  const rpc = read(
    'supabase/migrations/20261014120200_fix_execute_sale_lot_swap_due_date_contract_insert.sql',
  );
  assert(!rpc.includes('company_asaas_charges'), 'RPC sem Asaas');
  assert(!rpc.includes('charges_phase'), 'RPC sem Fase 5');

  const mig = read('supabase/migrations/20261015120000_sale_lot_swaps_charges_phase.sql');
  assert(mig.includes('ADD COLUMN IF NOT EXISTS charges_phase'), 'migration aditiva');
  assert(!/\bDROP COLUMN\b/i.test(mig), 'sem DROP');
  assert(!/\bDELETE FROM\b/i.test(mig), 'sem DELETE');
  assert(mig.includes("'PREPARED'"), 'estado PREPARED');
  assert(mig.includes("'COMPLETED'"), 'estado COMPLETED');

  const route4 = read('app/api/sales/[saleId]/lot-swap/execute/route.ts');
  assert(route4.includes('persistCharges: false'), 'rota Fase 4 sem 5B');
  const route5 = read('app/api/sales/[saleId]/lot-swap/charges/execute/route.ts');
  assert(route5.includes('executeSaleLotSwapWithExternalCharges'), 'rota 5B');
  assert(!route5.includes('cancelCompanyCharge'), 'rota 5B sem if de banco');
  assert(route5.includes('Não gera cobranças'), 'rota 5B cancela só');

  const apply = read('scripts/develop/apply-sale-lot-swaps-charges-phase.ts');
  assert(apply.includes('assertDevelopWriteAllowed'), 'apply só DEVELOP');
  assert(apply.includes('20261015120000_sale_lot_swaps_charges_phase.sql'), 'migration 5B');

  const ui = read('components/map/LotSwapPreviewPanel.tsx');
  assert(!ui.includes('Novas a gerar'), 'UI sem card de geração 5B');
  assert(!/geradas automaticamente/i.test(ui), 'UI sem geração automática');
  assert(ui.includes('Editar venda → Cobranças'), 'UI aponta módulo Cobranças');
  assert(ui.includes('canceladas automaticamente'), 'UI cancela automaticamente');
  assert(!/cancelar manualmente/i.test(ui), 'UI sem instrução de cancelar na mão');
  assert(!/homologação bancária real ainda não está autorizada/i.test(ui), 'UI sem aviso de homologação');

  const notices = read('lib/finance/saleLotSwapExternalCharges.ts');
  assert(
    notices.includes(LOT_SWAP_CHARGES_CANCEL_THEN_OFFICIAL_GENERATE_NOTICE),
    'aviso cancel then official',
  );
  assert(notices.includes(LOT_SWAP_CHARGES_NO_OLD_CANCEL_NOTICE), 'aviso nenhuma antiga');

  assert(
    String(process.env.LOT_SWAP_EXTERNAL_CHARGES_LIVE || '') !== 'true' &&
      String(process.env.LOT_SWAP_EXTERNAL_CHARGES_LIVE || '') !== 'scoped',
    'live scoped default off neste processo',
  );
  const helper = read('lib/finance/saleLotSwapChargesLiveScope.ts');
  assert(helper.includes("mode === LOT_SWAP_CHARGES_LIVE_MODE_SCOPED"), 'só scoped');
  assert(helper.includes('isProductionSupabaseRuntime'), 'Production sempre OFF');
  assert(!helper.includes('14e1b66b'), 'sem swap de homolog');
  assert(!helper.includes('1ce13cf0'), 'sem sale de homolog');
  assert(!helper.includes('59d38b25'), 'sem company de homolog');
  console.log('OK testSourceArchitecture');
}

async function main() {
  ensureExternalChargeProvidersRegistered();
  await testNoOldChargesCompletesWithoutLive();
  await testLiveOffDoesNotCancelOrExecute();
  await testDevelopHomologAutoCancelsWithoutScopedLive();
  await testOnePaidFourOpenThenPhase4();
  await testPaidNeverCancelledAndPendingCancelled();
  await testCancelFailureDoesNotExecuteLocal();
  await testRetryAfterPartialCancelIsIdempotent();
  await testNonCancelableBlocksBeforePhase4();
  await testInterMockCancelOnly();
  await testUnimplementedProvidersRemainBlocked();
  await testCrossTenantBlocked();
  await testParkedLocalExecutedLiveOffDoesNotRestamp();
  await testProductionScopedEnvStaysOff();
  await testDevelopTrueDoesNotEnableLive();
  await testAsaasAllowlistDoesNotCancelInter();
  await testC6BlockedEvenWithScopedLive();
  await testAdapterPaidAndReusedWithoutOfficialHttp();
  testOfficialChargesSummaryAfterSwap();
  testSourceArchitecture();
  console.log('OK mandatory-sale-lot-swap-phase5b-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
