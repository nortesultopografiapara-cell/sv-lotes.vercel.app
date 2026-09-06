/**
 * Fase 5A — cobranças externas da Troca de lote (classificação, sem API).
 * npx tsx scripts/mandatory-sale-lot-swap-phase5a-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  asaasExternalChargeProvider,
  createUnimplementedExternalChargeProvider,
  ensureExternalChargeProvidersRegistered,
  EXTERNAL_CHARGE_PROVIDER_ASAAS,
  EXTERNAL_CHARGE_PROVIDER_INTER,
  getExternalChargeProvider,
  getRegisteredExternalChargeProvider,
  interExternalChargeProvider,
  listRegisteredExternalChargeProviders,
  LOT_SWAP_CHARGES_MUTATION_DISABLED,
  normalizeExternalChargeProviderCode,
  registerExternalChargeProvider,
  resetExternalChargeProviderRegistryForTests,
} from '../lib/finance/externalCharges';
import type { ExternalChargeRecord } from '../lib/finance/externalCharges/types';
import { ExternalChargeMutationDisabledError } from '../lib/finance/externalCharges/types';
import {
  buildLotSwapExternalChargePreviewFromPlan,
  classifyLotSwapExternalCharges,
  loadLotSwapExternalChargePreview,
  LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE,
} from '../lib/finance/saleLotSwapExternalCharges';
import { buildLotSwapFinancialPlan } from '../lib/finance/saleLotSwapPlan';
import { LOT_SWAP_EXECUTE_RPC } from '../lib/finance/saleLotSwapExecute';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function charge(
  extra: Partial<ExternalChargeRecord> & Pick<ExternalChargeRecord, 'chargeId' | 'provider'>,
): ExternalChargeRecord {
  return {
    companyId: extra.companyId || 'co-1',
    saleId: extra.saleId || 'sale-1',
    receiptId: extra.receiptId ?? null,
    status: extra.status ?? null,
    externalId: extra.externalId ?? null,
    classification: extra.classification || 'absent',
    ...extra,
  };
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

class MockQuery {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  constructor(private rows: Record<string, unknown>[]) {}
  select() {
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
  private result() {
    const data = this.rows.filter((row) => this.filters.every((fn) => fn(row)));
    return { data, error: null };
  }
  async maybeSingle() {
    const { data } = this.result();
    return { data: data[0] || null, error: null };
  }
  then<T>(
    resolve?: (value: { data: Record<string, unknown>[] | null; error: null }) => T,
    reject?: (reason: unknown) => T,
  ) {
    return Promise.resolve(this.result()).then(resolve as never, reject as never);
  }
}

function mockAdmin(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      return new MockQuery([...(tables[table] || [])]);
    },
  };
}

function testAsaasClassificationMatrix() {
  const p = asaasExternalChargeProvider;
  assert(p.classifyChargeStatus('PAID') === 'paid', 'Asaas paga');
  assert(p.classifyChargeStatus('RECEIVED') === 'paid', 'Asaas RECEIVED = paga');
  assert(p.classifyChargeStatus('PENDING') === 'cancelable', 'Asaas pendente cancelável');
  assert(p.classifyChargeStatus('OVERDUE') === 'cancelable', 'Asaas vencida cancelável');
  assert(p.classifyChargeStatus('REGISTERED') === 'non_cancelable', 'Asaas REGISTERED bloqueia');
  assert(p.classifyChargeStatus('CANCELLED') === 'absent', 'Asaas já cancelada = ausente operacional');
  assert(p.classifyChargeStatus('FAILED') === 'absent', 'Asaas FAILED encerrada');
  console.log('OK testAsaasClassificationMatrix');
}

function testInterClassificationMatrix() {
  const p = interExternalChargeProvider;
  assert(p.classifyChargeStatus('PAID') === 'paid', 'Inter paga');
  assert(p.classifyChargeStatus('PENDING') === 'cancelable', 'Inter pendente');
  assert(p.classifyChargeStatus('REGISTERED') === 'cancelable', 'Inter REGISTERED cancelável');
  assert(p.classifyChargeStatus('OVERDUE') === 'cancelable', 'Inter vencida cancelável');
  assert(p.classifyChargeStatus('UNKNOWN_X') === 'non_cancelable', 'Inter desconhecido bloqueia');
  assert(p.classifyChargeStatus('CANCELLED') === 'absent', 'Inter cancelada');
  console.log('OK testInterClassificationMatrix');
}

function testAsaasLotSwapActions() {
  const plan = planWithReceipts();
  const paid = charge({
    provider: 'ASAAS',
    chargeId: 'a-paid',
    receiptId: 'r-paid',
    status: 'PAID',
    classification: 'paid',
  });
  const open = charge({
    provider: 'ASAAS',
    chargeId: 'a-open',
    receiptId: 'r-future',
    status: 'PENDING',
    classification: 'cancelable',
  });
  const overdue = charge({
    provider: 'ASAAS',
    chargeId: 'a-overdue',
    receiptId: 'r-future-2',
    status: 'OVERDUE',
    classification: 'cancelable',
  });
  const registered = charge({
    provider: 'ASAAS',
    chargeId: 'a-reg',
    receiptId: 'r-future',
    status: 'REGISTERED',
    classification: 'non_cancelable',
  });
  const previewOk = buildLotSwapExternalChargePreviewFromPlan(plan, [paid, open], {
    code: 'ASAAS',
    provider: asaasExternalChargeProvider,
  });
  assert(previewOk.wouldPreservePaid.some((row) => row.chargeId === 'a-paid'), 'Asaas paga preservada');
  assert(previewOk.wouldCancel.some((row) => row.chargeId === 'a-open'), 'Asaas pendente iria cancelar na 5B');
  assert(previewOk.wouldGenerate.length === 1, 'Asaas gera cobrança da nova parcela');
  assert(previewOk.wouldBlock === false, 'Asaas cancelável não bloqueia 5A');

  const overduePreview = classifyLotSwapExternalCharges({
    charges: [overdue],
    cancelReceiptIds: ['r-future-2'],
    createCount: 1,
    activeProvider: 'ASAAS',
    provider: asaasExternalChargeProvider,
  });
  assert(overduePreview.wouldCancel.length === 1, 'Asaas vencida cancelável entra em wouldCancel');

  const blocked = buildLotSwapExternalChargePreviewFromPlan(plan, [registered], {
    code: 'ASAAS',
    provider: asaasExternalChargeProvider,
  });
  assert(blocked.wouldBlock === true, 'Asaas REGISTERED bloqueia Fase 5B');
  assert(blocked.blockCode === LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE, 'código de bloqueio');

  const retry = classifyLotSwapExternalCharges({
    charges: [
      charge({
        provider: 'ASAAS',
        chargeId: 'a-new',
        receiptId: 'r-new',
        classification: 'cancelable',
      }),
    ],
    createReceiptIds: ['r-new'],
    createCount: 1,
    activeProvider: 'ASAAS',
    provider: asaasExternalChargeProvider,
  });
  assert(retry.wouldGenerate.length === 0, 'retry não duplica se já existe cobrança ativa');
  assert(retry.wouldSkipGenerate[0]?.reason === 'already_exists', 'motivo already_exists');
  console.log('OK testAsaasLotSwapActions');
}

function testInterLotSwapActions() {
  const plan = planWithReceipts();
  const paid = charge({
    provider: 'INTER',
    chargeId: 'i-paid',
    receiptId: 'r-paid',
    classification: 'paid',
  });
  const open = charge({
    provider: 'INTER',
    chargeId: 'i-open',
    receiptId: 'r-future',
    classification: 'cancelable',
  });
  const preview = buildLotSwapExternalChargePreviewFromPlan(plan, [paid, open], {
    code: 'INTER',
    provider: interExternalChargeProvider,
  });
  assert(preview.wouldPreservePaid.length === 1, 'Inter paga preservada');
  assert(preview.wouldCancel.length === 1, 'Inter pendente cancelável');
  assert(preview.wouldGenerate.length === 1, 'Inter gera nova cobrança');
  const blocked = classifyLotSwapExternalCharges({
    charges: [
      charge({
        provider: 'INTER',
        chargeId: 'i-x',
        receiptId: 'r-future',
        classification: 'non_cancelable',
      }),
    ],
    cancelReceiptIds: ['r-future'],
    createCount: 1,
    activeProvider: 'INTER',
    provider: interExternalChargeProvider,
  });
  assert(blocked.wouldBlock === true, 'Inter não cancelável bloqueia');
  const retry = classifyLotSwapExternalCharges({
    charges: [
      charge({
        provider: 'INTER',
        chargeId: 'i-new',
        receiptId: 'r-new',
        classification: 'paid',
      }),
    ],
    createReceiptIds: ['r-new'],
    createCount: 1,
    activeProvider: 'INTER',
    provider: interExternalChargeProvider,
  });
  assert(retry.wouldSkipGenerate[0]?.reason === 'paid', 'não gera em cima de paga');
  console.log('OK testInterLotSwapActions');
}

function testMultiproviderAndTenants() {
  ensureExternalChargeProvidersRegistered();
  const codes = listRegisteredExternalChargeProviders().map((p) => p.code).sort();
  assert(codes.includes('ASAAS') && codes.includes('INTER'), 'Asaas e Inter registrados');
  assert(normalizeExternalChargeProviderCode('ASAAS_COMPANY') === 'ASAAS', 'alias Asaas');
  const none = classifyLotSwapExternalCharges({
    charges: [],
    cancelReceiptIds: ['r-future'],
    createCount: 0,
    activeProvider: 'ASAAS',
    provider: asaasExternalChargeProvider,
  });
  assert(none.charges.length === 0, 'empresa sem cobrança: ausente');
  assert(none.wouldBlock === false, 'sem cobrança não bloqueia');

  const future = getExternalChargeProvider('C6');
  assert(future.supportsCancellation === false, 'C6 sem cancelamento real');
  assert(future.supportsGeneration === false, 'C6 sem geração real');
  assert(future.classifyChargeStatus('PENDING') === 'non_cancelable', 'C6 sempre non_cancelable');
  const c6Preview = classifyLotSwapExternalCharges({
    charges: [
      charge({
        provider: 'C6',
        chargeId: 'c6-1',
        receiptId: 'r-future',
        classification: 'non_cancelable',
      }),
    ],
    cancelReceiptIds: ['r-future'],
    createCount: 1,
    activeProvider: 'C6',
    provider: future,
  });
  assert(c6Preview.wouldBlock === true, 'provider futuro bloqueia com segurança');
  assert(c6Preview.wouldGenerate.length === 0, 'C6 não planeja geração');
  assert(c6Preview.wouldSkipGenerate[0]?.reason === 'unsupported_provider', 'geração unsupported');

  let threw = false;
  try {
    future.cancelCancelableCharge({} as never, { companyId: 'co-1', chargeId: 'x' });
  } catch (err) {
    threw =
      err instanceof ExternalChargeMutationDisabledError &&
      err.code === LOT_SWAP_CHARGES_MUTATION_DISABLED;
  }
  assert(threw, 'C6 não chama API ao cancelar');
  console.log('OK testMultiproviderAndTenants');
}

async function testTenantIsolationOnList() {
  const admin = mockAdmin({
    company_asaas_charges: [
      {
        id: 'a1',
        company_id: 'co-a',
        sale_id: 'sale-a',
        installment_id: 'r1',
        status: 'PENDING',
        asaas_payment_id: 'pay_a',
      },
      {
        id: 'a2',
        company_id: 'co-b',
        sale_id: 'sale-a',
        installment_id: 'r1',
        status: 'PENDING',
        asaas_payment_id: 'pay_b',
      },
    ],
    bank_charges: [
      {
        id: 'i1',
        company_id: 'co-a',
        sale_id: 'sale-a',
        finance_receipt_id: 'r1',
        status: 'PENDING',
        provider: 'INTER',
        external_id: 'sol-a',
      },
      {
        id: 'i2',
        company_id: 'co-b',
        sale_id: 'sale-a',
        finance_receipt_id: 'r1',
        status: 'PENDING',
        provider: 'INTER',
        external_id: 'sol-b',
      },
    ],
  });
  const asaasA = await asaasExternalChargeProvider.listChargesForReceipts(admin as never, {
    companyId: 'co-a',
    saleId: 'sale-a',
    receiptIds: ['r1'],
  });
  const asaasB = await asaasExternalChargeProvider.listChargesForReceipts(admin as never, {
    companyId: 'co-b',
    saleId: 'sale-a',
    receiptIds: ['r1'],
  });
  assert(asaasA.every((row) => row.companyId === 'co-a'), 'Asaas tenant A');
  assert(!asaasA.some((row) => row.chargeId === 'a2'), 'Asaas A não vê B');
  assert(asaasB.every((row) => row.companyId === 'co-b'), 'Asaas tenant B');
  const interA = await interExternalChargeProvider.listChargesForReceipts(admin as never, {
    companyId: 'co-a',
    saleId: 'sale-a',
    receiptIds: ['r1'],
  });
  assert(interA.map((row) => row.chargeId).join() === 'i1', 'Inter A não cruza B');
  console.log('OK testTenantIsolationOnList');
}

async function testLoadPreviewDoesNotCallRemoteApis() {
  const plan = planWithReceipts();
  const admin = mockAdmin({
    sales: [
      {
        id: 'sale-1',
        company_id: 'co-1',
        tenant_id: 'co-1',
        financial_account_id: null,
        project_id: 'p1',
      },
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
  });
  const preview = await loadLotSwapExternalChargePreview(admin as never, {
    companyId: 'co-1',
    saleId: 'sale-1',
    plan,
  });
  assert(preview.remoteApiCalled === false, 'sem API remota');
  assert(preview.mutation === false && preview.persistCharges === false, 'sem mutação');
  assert(preview.paid.length === 1, 'pagamento histórico preservado');
  assert(preview.wouldCancel.length === 1, 'antiga aberta classificada para cancelar');
  assert(preview.wouldGenerate.length === 1, 'nova parcela geraria cobrança na 5B');
  assert(preview.phase5Status === 'PREPARED', '5A prepared');
  console.log('OK testLoadPreviewDoesNotCallRemoteApis');
}

function testUnimplementedStillRefusesMutation() {
  const c6 = createUnimplementedExternalChargeProvider('C6');
  let cancel = false;
  let gen = false;
  try {
    c6.cancelCancelableCharge({} as never, { companyId: 'x', chargeId: 'y' });
  } catch (err) {
    cancel = err instanceof ExternalChargeMutationDisabledError;
  }
  try {
    c6.generateMissingCharges({} as never, {
      companyId: 'x',
      saleId: 's',
      receiptIds: ['r'],
    });
  } catch (err) {
    gen = err instanceof ExternalChargeMutationDisabledError;
  }
  assert(cancel && gen, 'C6/unimplemented continua sem mutação');
  assert(
    asaasExternalChargeProvider.supportsCancellation &&
      asaasExternalChargeProvider.supportsGeneration,
    'Asaas 5B implementa mutação',
  );
  assert(
    interExternalChargeProvider.supportsCancellation &&
      interExternalChargeProvider.supportsGeneration,
    'Inter 5B implementa mutação',
  );
  console.log('OK testUnimplementedStillRefusesMutation');
}

function testPhase4StillIdempotentAndUntouched() {
  const execute = read('lib/finance/saleLotSwapExecute.ts');
  const svc = read('lib/finance/saleLotSwapExecuteService.ts');
  const rpc = read(
    'supabase/migrations/20261014120200_fix_execute_sale_lot_swap_due_date_contract_insert.sql',
  );
  assert(svc.includes("status === 'EXECUTED'"), 'Fase 4 idempotente');
  assert(svc.includes('chargesUntouched: true') || svc.includes('charges_untouched'), 'Fase 4 chargesUntouched');
  assert(!svc.includes('cancelCompanyCharge'), 'execute sem cancel Asaas');
  assert(!svc.includes('cancelInterCobranca'), 'execute sem cancel Inter');
  assert(!svc.includes('createCompanyInstallmentCharge'), 'execute sem gerar Asaas');
  assert(!svc.includes('createInterInstallmentCharge'), 'execute sem gerar Inter');
  assert(!rpc.includes('company_asaas_charges'), 'RPC sem Asaas');
  assert(!rpc.includes('bank_charges'), 'RPC sem Inter');
  assert(execute.includes(LOT_SWAP_EXECUTE_RPC) || svc.includes('LOT_SWAP_EXECUTE_RPC'), 'RPC intacta');
  console.log('OK testPhase4StillIdempotentAndUntouched');
}

function testSourceNoRealBankApisAndNoReleaseLot() {
  const files = [
    'lib/finance/externalCharges/types.ts',
    'lib/finance/externalCharges/registry.ts',
    'lib/finance/externalCharges/unimplementedAdapter.ts',
    'lib/finance/externalCharges/index.ts',
    'lib/finance/saleLotSwapExternalCharges.ts',
  ];
  for (const rel of files) {
    const src = read(rel);
    assert(!src.includes('cancelCompanyCharge'), `${rel} sem cancelCompanyCharge`);
    assert(!src.includes('asaasCompanyCancelPayment'), `${rel} sem DELETE Asaas`);
    assert(!src.includes('cancelInterCobranca'), `${rel} sem cancel Inter`);
    assert(!src.includes('createCompanyInstallmentCharge'), `${rel} sem create Asaas`);
    assert(!src.includes('createInterInstallmentCharge'), `${rel} sem create Inter`);
    assert(!src.includes('createInterCobranca'), `${rel} sem create cobranca Inter`);
    assert(!src.includes('releaseLotService'), `${rel} sem ReleaseLot`);
    assert(!src.includes('resolveInterChargesForRelease'), `${rel} sem cancel ReleaseLot Inter`);
    assert(!src.includes('interCancelMotivoFromReleaseMotive'), `${rel} sem motivo ReleaseLot`);
    assert(!src.includes('seller_parties_json'), `${rel} sem Mundo Novo`);
  }
  const asaas = read('lib/finance/externalCharges/asaasAdapter.ts');
  const inter = read('lib/finance/externalCharges/interAdapter.ts');
  assert(asaas.includes('cancelCompanyCharge'), 'adapter Asaas reusa cancel oficial');
  assert(asaas.includes('createCompanyInstallmentCharge'), 'adapter Asaas reusa create oficial');
  assert(inter.includes('cancelInterInstallmentCharge'), 'adapter Inter reusa cancel oficial');
  assert(inter.includes('createInterInstallmentCharge'), 'adapter Inter reusa create oficial');
  assert(!asaas.includes('fetch('), 'adapter Asaas sem HTTP próprio');
  assert(!inter.includes('cancelInterCobranca'), 'adapter Inter sem HTTP próprio');
  assert(!inter.includes('createInterCobranca'), 'adapter Inter sem create HTTP próprio');
  const ui = read('components/map/LotSwapPreviewPanel.tsx');
  assert(ui.includes('Fase 5A'), 'UI mostra classificação 5A');
  const previewSvc = read('lib/finance/saleLotSwapPreviewService.ts');
  assert(previewSvc.includes('loadLotSwapExternalChargePreview'), 'preview carrega 5A');
  assert(!/\.insert\(/.test(previewSvc), 'preview continua sem INSERT');
  const registry = read('lib/finance/externalCharges/registry.ts');
  assert(registry.includes('registerExternalChargeProvider'), 'registry extensível');
  assert(
    getRegisteredExternalChargeProvider('ASAAS')?.code === EXTERNAL_CHARGE_PROVIDER_ASAAS,
    'Asaas no registry',
  );
  assert(
    getRegisteredExternalChargeProvider('INTER')?.code === EXTERNAL_CHARGE_PROVIDER_INTER,
    'Inter no registry',
  );
  resetExternalChargeProviderRegistryForTests();
  registerExternalChargeProvider(createUnimplementedExternalChargeProvider('BRADESCO'));
  assert(
    getExternalChargeProvider('BRADESCO').supportsGeneration === false,
    'Bradesco futuro entra pelo registry sem API',
  );
  ensureExternalChargeProvidersRegistered();
  console.log('OK testSourceNoRealBankApisAndNoReleaseLot');
}

async function main() {
  ensureExternalChargeProvidersRegistered();
  testAsaasClassificationMatrix();
  testInterClassificationMatrix();
  testAsaasLotSwapActions();
  testInterLotSwapActions();
  testMultiproviderAndTenants();
  await testTenantIsolationOnList();
  await testLoadPreviewDoesNotCallRemoteApis();
  testUnimplementedStillRefusesMutation();
  testPhase4StillIdempotentAndUntouched();
  testSourceNoRealBankApisAndNoReleaseLot();
  console.log('OK mandatory-sale-lot-swap-phase5a-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
