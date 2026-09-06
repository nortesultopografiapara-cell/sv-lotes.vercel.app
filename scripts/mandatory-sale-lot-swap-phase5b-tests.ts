/**
 * Fase 5B — cobranças externas da Troca de lote (mutação com APIs mockadas).
 * npx tsx scripts/mandatory-sale-lot-swap-phase5b-tests.ts
 *
 * Sem chamada Asaas/Inter real. Live só entra via override `live: true` + inject.
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
  LOT_SWAP_CHARGES_GENERATE_FAILED,
  LOT_SWAP_CHARGES_LIVE_DISABLED,
} from '../lib/finance/saleLotSwapChargesPhase';
import type { LotSwapExecutedResult } from '../lib/finance/saleLotSwapExecuteService';
import { LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE } from '../lib/finance/saleLotSwapExternalCharges';
import { LOT_SWAP_CROSS_TENANT } from '../lib/finance/saleLotSwapPreview';

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

async function withHarness<T>(fn: () => Promise<T>): Promise<T> {
  try {
    ensureExternalChargeProvidersRegistered();
    return await fn();
  } finally {
    resetExternalChargeMutationFnsForTests();
    setSaleLotSwapLocalExecuteForTests(null);
  }
}

async function testLiveOffDoesNotCancelOrExecute() {
  await withHarness(async () => {
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
    const ctx = createStore(baseTables());
    const localCalls = installLocalExecute(ctx);
    const canceled: string[] = [];
    const generated: string[][] = [];
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async (_admin, companyId, chargeId) => {
        assert(companyId === 'co-1', 'tenant no cancel');
        canceled.push(chargeId);
        return { ok: true, reused: canceled.filter((id) => id === chargeId).length > 1, chargeId, status: 'CANCELLED' };
      },
      generateAsaasCharges: async (_admin, input) => {
        assert(input.companyId === 'co-1', 'tenant no generate');
        generated.push([...input.receiptIds]);
        const reused = generated.length > 1;
        return { ok: true, created: reused ? 0 : input.receiptIds.length, reused: reused ? input.receiptIds.length : 0, skipped: 0, errors: [] };
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
    assert(generated.length === 1 && generated[0].includes('r-new'), 'gerou nova parcela');
    assert(!generated[0].includes('r-paid'), 'não gera para paga');
    assert(String(ctx.store.sale_lot_swaps[0].status) === 'EXECUTED', 'local EXECUTED');

    const second = await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      swapId: 'swap-1',
      live: true,
    });
    assert(second.chargesPhase === 'COMPLETED', 'retry COMPLETED');
    assert(canceled.length === 1, 'retry não cancela de novo');
    assert(localCalls() === 2 && second.local?.reused === true, 'Fase 4 reused');
    assert(generated.length === 2, 'retry gera de novo via service idempotente');
    assert(generated[1].join() === generated[0].join(), 'mesmos receipts no retry');
  });
  console.log('OK testPaidNeverCancelledAndPendingCancelled');
}

async function testCancelFailureDoesNotExecuteLocal() {
  await withHarness(async () => {
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

async function testGenerateFailKeepsLocalAndRetryReuses() {
  await withHarness(async () => {
    const ctx = createStore(baseTables());
    const localCalls = installLocalExecute(ctx);
    let generateCalls = 0;
    setExternalChargeMutationFnsForTests({
      cancelAsaasCharge: async (_a, _c, chargeId) => ({
        ok: true,
        reused: false,
        chargeId,
        status: 'CANCELLED',
      }),
      generateAsaasCharges: async (_a, input) => {
        generateCalls += 1;
        if (generateCalls === 1) {
          return {
            ok: false,
            created: 0,
            reused: 0,
            skipped: 0,
            errors: [{ receiptId: input.receiptIds[0] || 'r-new', message: 'mock generate 500' }],
          };
        }
        return { ok: true, created: 0, reused: input.receiptIds.length, skipped: 0, errors: [] };
      },
    });
    try {
      await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
        saleId: 'sale-1',
        userId: 'user-1',
        swapId: 'swap-1',
        live: true,
      });
      throw new Error('deveria falhar generate');
    } catch (err) {
      assert(err instanceof LotSwapChargesPhaseError, 'erro de fase');
      assert(err.code === LOT_SWAP_CHARGES_GENERATE_FAILED, 'generate failed');
      assert(err.local?.status === 'EXECUTED', 'local executado');
    }
    assert(String(ctx.store.sale_lot_swaps[0].status) === 'EXECUTED', 'troca permanece EXECUTED');
    assert(String(ctx.store.sale_lot_swaps[0].charges_phase) === 'FAILED', 'pendência externa');
    assert(localCalls() === 1, 'uma execução local');

    const retry = await executeSaleLotSwapWithExternalCharges(ctx.admin as never, {
      saleId: 'sale-1',
      userId: 'user-1',
      swapId: 'swap-1',
      live: true,
    });
    assert(retry.chargesPhase === 'COMPLETED', 'retry COMPLETED');
    assert(retry.local?.reused === true, 'retry não remuta Fase 4');
    assert(generateCalls === 2, 'retry só generate');
    assert(localCalls() === 2, 'segunda chamada reused');
  });
  console.log('OK testGenerateFailKeepsLocalAndRetryReuses');
}

async function testInterMockCancelAndGenerate() {
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
    const canceled: string[] = [];
    let generateCalls = 0;
    setExternalChargeMutationFnsForTests({
      cancelInterCharge: async (_a, companyId, chargeId) => {
        assert(companyId === 'co-1', 'Inter tenant');
        canceled.push(chargeId);
        return { ok: true, reused: false, chargeId, status: 'CANCELLED' };
      },
      generateInterCharges: async (_a, input) => {
        generateCalls += 1;
        return { ok: true, created: input.receiptIds.length, reused: 0, skipped: 0, errors: [] };
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
    assert(generateCalls === 1, 'Inter gerou uma vez');
    assert(localCalls() === 1, 'Fase 4 após cancel Inter');
  });
  console.log('OK testInterMockCancelAndGenerate');
}

async function testC6BlockedNoApi() {
  await withHarness(async () => {
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
      throw new Error('C6 deveria bloquear');
    } catch (err) {
      assert(err instanceof LotSwapChargesPhaseError, 'erro de fase');
      assert(err.code === LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE, 'C6 non_cancelable');
    }
    assert(mutation === 0, 'C6 sem API');
    assert(localCalls() === 0, 'C6 não executa Fase 4');
    const c6 = createUnimplementedExternalChargeProvider('C6');
    let refused = false;
    try {
      c6.cancelCancelableCharge({} as never, { companyId: 'co-1', chargeId: 'c6-1' });
    } catch (err) {
      refused = err instanceof ExternalChargeMutationDisabledError;
    }
    assert(refused, 'C6 unimplemented recusa mutação');
  });
  console.log('OK testC6BlockedNoApi');
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

function testSourceArchitecture() {
  const orch = read('lib/finance/saleLotSwapChargesExecuteService.ts');
  assert(orch.includes('getExternalChargeProvider(charge.provider)'), 'cancel via registry');
  assert(orch.includes('getExternalChargeProvider(preview.activeProvider)'), 'generate via registry');
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

  const apply = read('scripts/develop/apply-sale-lot-swaps-charges-phase.ts');
  assert(apply.includes('assertDevelopWriteAllowed'), 'apply só DEVELOP');
  assert(apply.includes('20261015120000_sale_lot_swaps_charges_phase.sql'), 'migration 5B');

  assert(
    String(process.env.LOT_SWAP_EXTERNAL_CHARGES_LIVE || '') !== 'true',
    'live default off neste processo',
  );
  console.log('OK testSourceArchitecture');
}

async function main() {
  ensureExternalChargeProvidersRegistered();
  await testLiveOffDoesNotCancelOrExecute();
  await testPaidNeverCancelledAndPendingCancelled();
  await testCancelFailureDoesNotExecuteLocal();
  await testNonCancelableBlocksBeforePhase4();
  await testGenerateFailKeepsLocalAndRetryReuses();
  await testInterMockCancelAndGenerate();
  await testC6BlockedNoApi();
  await testCrossTenantBlocked();
  await testAdapterPaidAndReusedWithoutOfficialHttp();
  testSourceArchitecture();
  console.log('OK mandatory-sale-lot-swap-phase5b-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
