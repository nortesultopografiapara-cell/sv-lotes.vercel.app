/**
 * Testes obrigatórios — retomada Inter (CAS atômico, flag, reconcile-before-POST).
 * npm run test:inter-sale-charges-resume
 */
import fs from 'node:fs';
import path from 'node:path';
import { isCronSecretValid } from '../lib/saasCronAuth';
import { isInterResumeLiveEmitFlagEnabled } from '../lib/banking/inter/interResumeLiveEmitFlag';
import {
  INTER_RESUME_BATCH_SIZE,
  INTER_RESUME_CAS_RPC,
  INTER_RESUME_LEASE_MS,
  buildInterSeuNumero,
  canPersistInterResumeChargeStatus,
  canRetryInterResumePost,
  casWriteInterResumeJob,
  classifyInterResumeHttpError,
  emptyInterResumeJobsBundle,
  hydrateJobFromBundle,
  mustReconcileBeforeInterResumePost,
  parseInterResumeJobsBundle,
  resolveInterChargeEnvironment,
  resolveInterResumeEmitMode,
  serializeInterResumeJobsBundle,
  shouldSkipDuplicateInterCharge,
} from '../lib/banking/inter/interSaleChargesResume';
import {
  InterResumeConflictError,
  createMemoryInterResumeStore,
  pauseInterResumeJob,
  startInterResumeJob,
  tickInterResumeJob,
  type InterResumeEmitResult,
  type InterResumeExistingCharge,
  type InterResumeMissingInstallment,
  type InterResumePorts,
} from '../lib/banking/inter/interSaleChargesResumeWorker';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function makeInstallments(count: number, prefix = 'inst'): InterResumeMissingInstallment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${String(i + 1).padStart(3, '0')}`,
    installmentNumber: i + 1,
    dueDate: `2027-01-${String((i % 28) + 1).padStart(2, '0')}`,
    amount: 150 + i,
    paid: false,
  }));
}

type Harness = {
  store: ReturnType<typeof createMemoryInterResumeStore>;
  ports: InterResumePorts;
  emitCalls: Array<{ installmentId: string; seuNumero: string }>;
  reconcileCalls: string[];
  persistEmitted: string[];
  persistErrors: string[];
  persistArtifacts: string[];
  fetchArtifacts: string[];
  paidOverwriteAttempts: number;
  sleeps: number[];
  setEmit(fn: (input: { installmentId: string; seuNumero: string }) => Promise<InterResumeEmitResult>): void;
  setReconcile(fn: (seuNumero: string) => Promise<{ codigoSolicitacao: string } | null>): void;
  active: Map<string, InterResumeExistingCharge>;
  missing: InterResumeMissingInstallment[];
  needingArtifacts: Array<{ installmentId: string; codigoSolicitacao: string; status?: string | null }>;
  clock: { now: number };
};

function createHarness(
  missing: InterResumeMissingInstallment[],
  opts?: { saleId?: string; integrationId?: string; mode?: 'simulate' | 'live' | 'deferred' },
): Harness {
  const store = createMemoryInterResumeStore();
  const emitCalls: Harness['emitCalls'] = [];
  const reconcileCalls: string[] = [];
  const persistEmitted: string[] = [];
  const persistErrors: string[] = [];
  const persistArtifacts: string[] = [];
  const fetchArtifacts: string[] = [];
  const sleeps: number[] = [];
  const active = new Map<string, InterResumeExistingCharge>();
  const needingArtifacts: Harness['needingArtifacts'] = [];
  const clock = { now: 1_700_000_000_000 };
  const paidOverwriteAttempts = { n: 0 };
  let emitImpl: (input: { installmentId: string; seuNumero: string }) => Promise<InterResumeEmitResult> =
    async (input) => {
      emitCalls.push(input);
      return { ok: true, codigoSolicitacao: `SIM-${input.seuNumero}` };
    };
  let reconcileImpl = async (seuNumero: string) => {
    reconcileCalls.push(seuNumero);
    return null as { codigoSolicitacao: string } | null;
  };

  const ports: InterResumePorts = {
    now: () => clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.now += Math.max(0, ms);
    },
    newJobId: () => `job-${opts?.saleId || 'sale-1'}`,
    newLeaseOwner: () => `lease-${Math.random().toString(36).slice(2, 8)}`,
    listMissing: async () => missing,
    findActiveCharge: async (installmentId) => active.get(installmentId) || null,
    persistEmittedCharge: async (input) => {
      const current = active.get(input.installmentId);
      if (String(current?.status || '').toUpperCase() === 'PAID') {
        paidOverwriteAttempts.n += 1;
        return;
      }
      persistEmitted.push(input.installmentId);
      active.set(input.installmentId, {
        id: `chg-${input.installmentId}`,
        status: 'PENDING',
        external_id: input.codigoSolicitacao,
        finance_receipt_id: input.installmentId,
      });
    },
    persistInstallmentError: async (input) => {
      const current = active.get(input.installmentId);
      if (String(current?.status || '').toUpperCase() === 'PAID' || String(input.currentStatus || '').toUpperCase() === 'PAID') {
        paidOverwriteAttempts.n += 1;
        return;
      }
      persistErrors.push(input.installmentId);
    },
    emitCobranca: async (input) => emitImpl(input),
    reconcileBySeuNumero: async (input) => reconcileImpl(input.seuNumero),
    listChargesNeedingArtifacts: async () =>
      needingArtifacts.filter((row) => String(row.status || '').toUpperCase() !== 'PAID'),
    fetchArtifacts: async (codigo) => {
      fetchArtifacts.push(codigo);
      return {
        codigoSolicitacao: codigo,
        linhaDigitavel: '00000',
        codigoBarras: '00000',
        pixCopiaECola: 'pix',
        nossoNumero: 'nn',
        txid: 'tx',
        situacao: 'A_RECEBER',
      };
    },
    persistArtifacts: async (input) => {
      if (!canPersistInterResumeChargeStatus({ currentStatus: input.currentStatus, nextStatus: 'REGISTERED' })) {
        paidOverwriteAttempts.n += 1;
        return;
      }
      persistArtifacts.push(input.installmentId);
    },
  };

  return {
    store,
    ports,
    emitCalls,
    reconcileCalls,
    persistEmitted,
    persistErrors,
    persistArtifacts,
    fetchArtifacts,
    sleeps,
    get paidOverwriteAttempts() {
      return paidOverwriteAttempts.n;
    },
    setEmit(fn) {
      emitImpl = fn;
    },
    setReconcile(fn) {
      reconcileImpl = fn;
    },
    active,
    missing,
    needingArtifacts,
    clock,
  };
}

async function startTick(h: Harness, saleId = 'sale-1', mode: 'simulate' | 'live' | 'deferred' = 'simulate') {
  await startInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId,
    integrationId: 'int-1',
    financialAccountId: 'acc-1',
    mode,
  });
  return tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId,
    batchSize: INTER_RESUME_BATCH_SIZE,
  });
}

async function drain(h: Harness, saleId = 'sale-1', maxTicks = 400) {
  let job = await startTick(h, saleId);
  let ticks = 1;
  while (job && (job.status === 'running' || job.status === 'queued') && ticks < maxTicks) {
    if (job.rateLimitedUntil && h.clock.now < Date.parse(job.rateLimitedUntil)) {
      h.clock.now = Date.parse(job.rateLimitedUntil) + 1;
    }
    job = await tickInterResumeJob({
      store: h.store,
      ports: h.ports,
      companyId: 'co-1',
      saleId,
      batchSize: INTER_RESUME_BATCH_SIZE,
    });
    ticks += 1;
  }
  return { job, ticks };
}

function testDomain() {
  assert(INTER_RESUME_LEASE_MS >= 60_000, 'lease cobre maxDuration 60s');
  assert(classifyInterResumeHttpError(429) === 'retry_post', '429 pode repetir POST');
  assert(classifyInterResumeHttpError(408) === 'indeterminate', '408 é indeterminado');
  assert(classifyInterResumeHttpError(500) === 'indeterminate', '500 é indeterminado');
  assert(classifyInterResumeHttpError(400) === 'fail', '400 falha');
  assert(mustReconcileBeforeInterResumePost({ status: 'intent', attempts: 1, postAttempted: true }), 'intent com POST tentado reconcilia');
  assert(!mustReconcileBeforeInterResumePost({ status: 'intent', attempts: 1, lastHttpStatus: 429 }), '429 não força reconciliação no lugar do retry');
  assert(canRetryInterResumePost({ status: 'intent', attempts: 1, lastHttpStatus: 429 }), '429 permite novo POST');
  assert(!canRetryInterResumePost({ status: 'intent', attempts: 1, postAttempted: true }), 'indeterminado não reemite');
  assert(!shouldSkipDuplicateInterCharge({ status: 'PENDING', id: 'x' }), 'stub sem external_id não bloqueia como duplicata');
  assert(shouldSkipDuplicateInterCharge({ status: 'REGISTERED', external_id: 'SOL-1' }), 'cobrança ativa com codigo é reaproveitada');
  assert(resolveInterResumeEmitMode({ vercelEnv: 'preview' }) === 'simulate', 'Preview simula');
  assert(resolveInterResumeEmitMode({ isDevelopHomolog: true }) === 'simulate', 'Develop homolog simula');
  assert(
    resolveInterResumeEmitMode({
      vercelEnv: 'production',
      isProductionSupabase: true,
      bankEnvironment: 'PRODUCTION',
      liveEmitFlag: false,
    }) === 'deferred',
    'Production sem flag não emite',
  );
  assert(
    resolveInterResumeEmitMode({
      vercelEnv: 'production',
      isProductionSupabase: true,
      bankEnvironment: 'PRODUCTION',
      liveEmitFlag: true,
    }) === 'live',
    'Production só emite com flag',
  );
  assert(!isInterResumeLiveEmitFlagEnabled(''), 'flag vazia é off');
  assert(!isInterResumeLiveEmitFlagEnabled('false'), 'flag false é off');
  assert(isInterResumeLiveEmitFlagEnabled('true'), 'flag true só quando explícita');
  assert(resolveInterChargeEnvironment({ mode: 'simulate', bankEnvironment: 'PRODUCTION' }) === 'SANDBOX', 'simulate não grava PRODUCTION');
  assert(resolveInterChargeEnvironment({ mode: 'live', bankEnvironment: 'PRODUCTION' }) === 'PRODUCTION', 'live usa PRODUCTION');
  assert(resolveInterChargeEnvironment({ mode: 'deferred', bankEnvironment: 'PRODUCTION' }) === 'SANDBOX', 'deferred não persiste PRODUCTION');
}

function testCasAtomic() {
  const jobA = {
    ...emptyInterResumeJobsBundle(),
  };
  const base = emptyInterResumeJobsBundle();
  const job1 = {
    id: 'j1',
    revision: 0,
    companyId: 'co-1',
    saleId: 'sale-a',
    integrationId: 'int-1',
    financialAccountId: null,
    status: 'running' as const,
    createdAt: '',
    updatedAt: '',
    createdBy: null,
    leaseOwner: 'a',
    leaseUntil: null,
    cursorIndex: 0,
    plannedInstallmentIds: ['1'],
    emitted: 0,
    reused: 0,
    skippedPaid: 0,
    failed: 0,
    remaining: 1,
    lastError: null,
    rateLimitedUntil: null,
    lastPostAt: null,
    installmentResults: {},
    mode: 'simulate' as const,
  };
  const first = casWriteInterResumeJob({ bundle: base, expectedRev: 0, job: { ...job1, lastPostAt: 't1' } });
  assert(first.ok && first.bundle._rev === 1, 'primeiro CAS aplica _rev=1');
  const second = casWriteInterResumeJob({
    bundle: first.bundle,
    expectedRev: 0,
    job: { ...job1, saleId: 'sale-b', id: 'j2' },
  });
  assert(!second.ok, 'segundo writer com a mesma revisão perde (cópia stale)');
  const third = casWriteInterResumeJob({
    bundle: first.bundle,
    expectedRev: 1,
    job: { ...job1, saleId: 'sale-b', id: 'j2' },
  });
  assert(third.ok && Object.keys(third.bundle.jobs).length === 2, 'após reload o segundo sale entra sem apagar o primeiro');
  void jobA;
}

async function testFakePostgresCas() {
  const row = { rev: 0, payload: '' };
  const lock = { p: Promise.resolve() };
  async function pgUpdate(expected: number, payload: string) {
    const prev = lock.p;
    let release!: () => void;
    lock.p = new Promise<void>((r) => {
      release = r;
    });
    await prev;
    await new Promise((r) => setTimeout(r, 5));
    try {
      if (row.rev !== expected) return 0;
      row.rev = expected + 1;
      row.payload = payload;
      return 1;
    } finally {
      release();
    }
  }
  const results = await Promise.all([pgUpdate(0, 'A'), pgUpdate(0, 'B')]);
  assert(results.filter((n) => n === 1).length === 1, 'PostgreSQL simulado: só um UPDATE com WHERE rev ganha');
  assert(results.filter((n) => n === 0).length === 1, 'PostgreSQL simulado: o outro UPDATE afeta 0 linhas');
  assert(row.rev === 1, 'revisão final = 1');
}

async function testTwoWorkers() {
  const h = createHarness(makeInstallments(6));
  await startInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
    integrationId: 'int-1',
    mode: 'simulate',
  });
  const loaded = await h.store.load('co-1', 'sale-1');
  if (!loaded) throw new Error('job ausente');
  const { applyInterResumeLease } = await import('../lib/banking/inter/interSaleChargesResume');
  const leased = applyInterResumeLease(loaded, 'owner-a', h.clock.now, INTER_RESUME_LEASE_MS);
  const saved = await h.store.save(leased, loaded.revision);
  assert(saved.ok, 'lease owner-a persistido');
  let conflict = false;
  try {
    await tickInterResumeJob({
      store: h.store,
      ports: h.ports,
      companyId: 'co-1',
      saleId: 'sale-1',
      leaseOwner: 'owner-b',
    });
  } catch (err) {
    conflict = err instanceof InterResumeConflictError;
  }
  assert(conflict, 'segunda instância não processa a mesma venda');
  h.clock.now += INTER_RESUME_LEASE_MS + 1;
  const after = await tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
    leaseOwner: 'owner-b',
  });
  assert((after?.emitted || 0) > 0, 'após expirar o lease outro worker retoma');
}

async function testSharedRateLimit() {
  const missingA = makeInstallments(2, 'sa');
  const missingB = makeInstallments(2, 'sb');
  const h = createHarness(missingA);
  await startTick(h, 'sale-a');
  assert(h.emitCalls.length >= 1, 'venda A emitiu');
  const lastA = h.emitCalls.length;
  const portsB: InterResumePorts = {
    ...h.ports,
    listMissing: async () => missingB,
  };
  await startInterResumeJob({
    store: h.store,
    ports: portsB,
    companyId: 'co-1',
    saleId: 'sale-b',
    integrationId: 'int-1',
    mode: 'simulate',
  });
  const beforeSleeps = h.sleeps.length;
  await tickInterResumeJob({
    store: h.store,
    ports: portsB,
    companyId: 'co-1',
    saleId: 'sale-b',
  });
  assert(h.emitCalls.length > lastA, 'venda B também emite na mesma conta');
  assert(h.sleeps.length > beforeSleeps, 'espaçamento compartilhado entre vendas da mesma integração');
}

async function testLostReconcileBeforePost() {
  const h = createHarness(makeInstallments(1));
  h.setEmit(async (input) => {
    h.emitCalls.push(input);
    return { ok: false, lost: true };
  });
  h.setReconcile(async (seuNumero) => {
    h.reconcileCalls.push(seuNumero);
    return h.reconcileCalls.length >= 2 ? { codigoSolicitacao: `REC-${seuNumero}` } : null;
  });
  const first = await startTick(h);
  assert(h.emitCalls.length === 1, 'um único POST na tentativa perdida');
  assert(first?.installmentResults['inst-001']?.status === 'intent', 'intenção permanece após POST perdido');
  const second = await tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
  });
  assert(h.emitCalls.length === 1, 'retomada reconcilia ANTES de qualquer novo POST');
  assert(second?.installmentResults['inst-001']?.status === 'reconciled', 'hit de seuNumero evita reemissão');
}

async function testLostEmptyGoesManual() {
  const h = createHarness(makeInstallments(1));
  h.setEmit(async (input) => {
    h.emitCalls.push(input);
    return { ok: false, lost: true };
  });
  const first = await startTick(h);
  assert(first?.installmentResults['inst-001']?.postAttempted === true, 'POST tentado ficou registrado');
  const second = await tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
  });
  assert(h.emitCalls.length === 1, 'sem GET confirmado não há segundo POST');
  assert(second?.installmentResults['inst-001']?.status === 'manual_reconcile', 'marca conciliação manual');
}

async function testTimeoutThenReconcile() {
  const h = createHarness(makeInstallments(1));
  h.setEmit(async (input) => {
    h.emitCalls.push(input);
    return { ok: false, httpStatus: 408, message: 'timeout' };
  });
  await startTick(h);
  h.setReconcile(async (seuNumero) => {
    h.reconcileCalls.push(seuNumero);
    return { codigoSolicitacao: `REC-${seuNumero}` };
  });
  const second = await tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
  });
  assert(h.emitCalls.length === 1, 'timeout não gera segundo POST');
  assert(second?.installmentResults['inst-001']?.status === 'reconciled', 'timeout retoma via reconciliação');
}

async function test429Retry() {
  const h = createHarness(makeInstallments(3));
  h.setEmit(async (input) => {
    h.emitCalls.push(input);
    if (h.emitCalls.length === 1) {
      return { ok: false, httpStatus: 429, message: 'rate limit', retryAfterMs: 90_000 };
    }
    return { ok: true, codigoSolicitacao: `SIM-${input.seuNumero}` };
  });
  const first = await startTick(h);
  assert(first?.rateLimitedUntil, '429 grava backoff compartilhado');
  assert(h.emitCalls.length === 1, 'para no 429');
  h.clock.now = Date.parse(String(first?.rateLimitedUntil)) + 1;
  await tickInterResumeJob({ store: h.store, ports: h.ports, companyId: 'co-1', saleId: 'sale-1' });
  assert(h.emitCalls.length > 1, 'após 429 pode repetir POST');
}

async function testPaidLock() {
  const missing = makeInstallments(2);
  missing[0].paid = true;
  const h = createHarness(missing);
  h.active.set('inst-001', { id: 'chg-paid', status: 'PAID', external_id: 'SOL-PAID' });
  const { job } = await drain(h);
  assert(job?.status === 'completed', 'conclui sem mexer na paga');
  assert(!h.persistEmitted.includes('inst-001'), 'não persiste emissão em PAID');
  assert(h.paidOverwriteAttempts === 0, 'PAID intacto');
}

async function testDeferredNoEmit() {
  const h = createHarness(makeInstallments(5));
  const job = await startTick(h, 'sale-1', 'deferred');
  assert(h.emitCalls.length === 0, 'deferred não chama POST');
  assert(String(job?.lastError || '').includes('desabilitada'), 'explica flag desligada');
}

async function testPauseResume() {
  const h = createHarness(makeInstallments(12));
  const first = await startTick(h);
  assert(h.emitCalls.length === 5, 'primeiro tick emite lote de 5');
  await pauseInterResumeJob({ store: h.store, companyId: 'co-1', saleId: 'sale-1', nowMs: h.clock.now });
  const ignored = await tickInterResumeJob({ store: h.store, ports: h.ports, companyId: 'co-1', saleId: 'sale-1' });
  assert(ignored?.status === 'paused', 'tick respeita pausa (continuidade não depende do browser)');
  const { job } = await drain(h);
  assert(job?.status === 'completed', 'retomada conclui');
  assert(h.emitCalls.length === 12, '12 emissões simuladas no total');
}

async function testScale(count: number) {
  const h = createHarness(makeInstallments(count));
  const { job } = await drain(h);
  assert(job?.status === 'completed', `${count} parcelas concluídas`);
  assert(h.emitCalls.length === count, `${count} POSTs simulados`);
}

async function testIntentBeforeEmit() {
  const h = createHarness(makeInstallments(1));
  let sawIntent = false;
  h.setEmit(async (input) => {
    const job = await h.store.load('co-1', 'sale-1');
    sawIntent = job?.installmentResults['inst-001']?.status === 'intent';
    h.emitCalls.push(input);
    return { ok: true, codigoSolicitacao: 'SIM-1' };
  });
  await startTick(h);
  assert(sawIntent, 'intenção persistida antes da chamada externa');
}

function testSourceGuards() {
  const panel = read('components/sales/SaleChargesPanel.tsx');
  const cron = read('app/api/cron/inter-sale-charges-resume/route.ts');
  const sql = read('supabase/migrations/20261012180000_cas_inter_resume_jobs.sql');
  const store = read('lib/banking/inter/interSaleChargesResumeSupabase.ts');
  const worker = read('lib/banking/inter/interSaleChargesResumeWorker.ts');
  const service = read('lib/banking/inter/interSaleChargesResumeService.ts');
  const vercel = read('vercel.json');

  assert(panel.includes('Continuar cobranças faltantes'), 'botão Continuar');
  assert(cron.includes('isCronSecretValid'), 'cron autenticado');
  assert(!cron.includes('isProductionSupabaseRuntime'), 'cron não dá skip em Production');
  assert(cron.includes('skipped: false'), 'cron reporta execução (emissão ainda via flag)');
  assert(sql.includes('FOR UPDATE'), 'RPC com row lock');
  assert(sql.includes("->>'_rev'"), 'RPC compara revisão');
  assert(sql.includes(INTER_RESUME_CAS_RPC) || sql.includes('cas_inter_resume_jobs'), 'RPC nomeada');
  assert(store.includes('p_expected_rev'), 'store chama CAS');
  assert(worker.includes('mustReconcileBeforeInterResumePost'), 'worker reconcilia antes de POST');
  assert(service.includes('chargeEnvironment'), 'environment não é SANDBOX hardcoded');
  assert(!/environment: 'SANDBOX'/.test(service), 'insert usa environment resolvido');
  assert(vercel.includes('/api/cron/inter-sale-charges-resume'), 'cron no vercel.json');
  assert(worker.includes('INTER_RESUME_LEASE_MS') || read('lib/banking/inter/interSaleChargesResume.ts').includes('75_000'), 'lease 75s');
}

function testCronAuth() {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret';
  try {
    const ok = isCronSecretValid(
      new Request('https://svlotes.local/api/cron/inter-sale-charges-resume', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );
    const bad = isCronSecretValid(new Request('https://svlotes.local/api/cron/inter-sale-charges-resume'));
    assert(ok, 'cron aceita Bearer CRON_SECRET');
    assert(!bad, 'cron rejeita sem segredo');
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
}

async function main() {
  testDomain();
  testCasAtomic();
  await testFakePostgresCas();
  await testTwoWorkers();
  await testSharedRateLimit();
  await testLostReconcileBeforePost();
  await testLostEmptyGoesManual();
  await testTimeoutThenReconcile();
  await test429Retry();
  await testPaidLock();
  await testDeferredNoEmit();
  await testPauseResume();
  await testIntentBeforeEmit();
  await testScale(12);
  await testScale(60);
  testCronAuth();
  testSourceGuards();
  console.log('\nOK mandatory-inter-sale-charges-resume-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
