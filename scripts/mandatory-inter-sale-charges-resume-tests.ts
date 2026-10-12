/**
 * Testes obrigatórios — retomada de cobranças Banco Inter.
 * npm run test:inter-sale-charges-resume
 *
 * Homologação simulada: sem POST real, sem Asaas/C6, sem alterar parcelas.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  INTER_RESUME_BATCH_SIZE,
  INTER_RESUME_MAX_ATTEMPTS,
  applyInterResumeLease,
  buildInterSeuNumero,
  canPersistInterResumeChargeStatus,
  classifyInterResumeHttpError,
  interResumeBackoffMs,
  resolveInterResumeEmitMode,
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

function makeInstallments(count: number): InterResumeMissingInstallment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `inst-${String(i + 1).padStart(3, '0')}`,
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
  setEmit(fn: (input: { installmentId: string; seuNumero: string }) => Promise<InterResumeEmitResult>): void;
  setReconcile(fn: (seuNumero: string) => Promise<{ codigoSolicitacao: string } | null>): void;
  active: Map<string, InterResumeExistingCharge>;
  missing: InterResumeMissingInstallment[];
  needingArtifacts: Array<{ installmentId: string; codigoSolicitacao: string; status?: string | null }>;
  clock: { now: number };
};

function createHarness(missing: InterResumeMissingInstallment[]): Harness {
  const store = createMemoryInterResumeStore();
  const emitCalls: Harness['emitCalls'] = [];
  const reconcileCalls: string[] = [];
  const persistEmitted: string[] = [];
  const persistErrors: string[] = [];
  const persistArtifacts: string[] = [];
  const fetchArtifacts: string[] = [];
  const active = new Map<string, InterResumeExistingCharge>();
  const needingArtifacts: Harness['needingArtifacts'] = [];
  const clock = { now: 1_700_000_000_000 };
  let emitImpl: Harness extends never ? never : (input: {
    installmentId: string;
    seuNumero: string;
  }) => Promise<InterResumeEmitResult> = async (input) => {
    emitCalls.push(input);
    return { ok: true, codigoSolicitacao: `SIM-${input.seuNumero}` };
  };
  let reconcileImpl = async (seuNumero: string) => {
    reconcileCalls.push(seuNumero);
    return null as { codigoSolicitacao: string } | null;
  };
  const paidOverwriteAttempts = { n: 0 };

  const ports: InterResumePorts = {
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += Math.max(0, ms);
    },
    newJobId: () => 'job-test-1',
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
    reconcileBySeuNumero: async (input) => {
      return reconcileImpl(input.seuNumero);
    },
    listChargesNeedingArtifacts: async () => needingArtifacts.filter((row) => String(row.status || '').toUpperCase() !== 'PAID'),
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
      if (!canPersistInterResumeChargeStatus({
        currentStatus: input.currentStatus,
        nextStatus: 'REGISTERED',
      })) {
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

async function startTick(h: Harness, saleId = 'sale-1') {
  await startInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId,
    integrationId: 'int-1',
    financialAccountId: 'acc-1',
    mode: 'simulate',
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
  assert(INTER_RESUME_BATCH_SIZE === 5, 'lote efetivo de 5 POSTs');
  assert(buildInterSeuNumero(12, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee').length <= 15, 'seuNumero cabe em 15 dígitos');
  assert(shouldSkipDuplicateInterCharge({ status: 'REGISTERED', external_id: 'SOL-1' }), 'pula cobrança ativa');
  assert(shouldSkipDuplicateInterCharge({ status: 'PAID', id: 'x' }), 'pula paga');
  assert(!shouldSkipDuplicateInterCharge({ status: 'FAILED' }), 'FAILED não é ativa');
  assert(!canPersistInterResumeChargeStatus({ currentStatus: 'PAID', nextStatus: 'FAILED' }), 'PAID não é sobrescrito');
  assert(canPersistInterResumeChargeStatus({ currentStatus: 'PENDING', nextStatus: 'REGISTERED' }), 'PENDING pode evoluir');
  assert(classifyInterResumeHttpError(429) === 'retry', '429 é retry');
  assert(classifyInterResumeHttpError(408) === 'retry', 'timeout 408 é retry');
  assert(classifyInterResumeHttpError(400) === 'fail', '400 é fail');
  assert(interResumeBackoffMs({ attempt: 1, httpStatus: 429 }) >= 60_000, 'backoff 429 padrão 60s');
  assert(resolveInterResumeEmitMode({ isProductionSupabase: true }) === 'blocked', 'Production supabase bloqueada');
  assert(resolveInterResumeEmitMode({ isDevelopHomolog: true }) === 'simulate', 'Develop homolog simula');
  assert(resolveInterResumeEmitMode({ vercelEnv: 'preview' }) === 'simulate', 'Preview simula');
  assert(resolveInterResumeEmitMode({ vercelEnv: 'production', isProductionSupabase: true }) === 'blocked', 'Vercel production + supabase prod bloqueada');
}

async function testScale(count: number) {
  const h = createHarness(makeInstallments(count));
  const { job, ticks } = await drain(h);
  assert(job?.status === 'completed', `${count} parcelas concluídas`);
  assert(h.emitCalls.length === count, `${count} emissões simuladas, uma por parcela`);
  assert(job?.emitted === count, `${count} marcadas emitidas`);
  assert(job?.failed === 0, `${count} sem erro`);
  assert(job?.remaining === 0, `${count} remaining 0`);
  assert(ticks === Math.ceil(count / INTER_RESUME_BATCH_SIZE), `${count} ticks = ceil(n/5)`);
}

async function testIdempotency() {
  const missing = makeInstallments(3);
  const h = createHarness(missing);
  h.active.set('inst-001', { id: 'chg-1', status: 'REGISTERED', external_id: 'SOL-EXISTING' });
  const job = await startTick(h);
  assert(job?.reused === 1, 'parcela com cobrança ativa foi reaproveitada');
  assert(h.emitCalls.every((c) => c.installmentId !== 'inst-001'), 'não reemitiu parcela já ativa');
  assert(h.emitCalls.length === 2, 'emitiu só as duas faltantes do lote');
}

async function testPaidLock() {
  const missing = makeInstallments(2);
  missing[0].paid = true;
  const h = createHarness(missing);
  h.active.set('inst-001', { id: 'chg-paid', status: 'PAID', external_id: 'SOL-PAID' });
  h.needingArtifacts.push({
    installmentId: 'inst-001',
    codigoSolicitacao: 'SOL-PAID',
    status: 'PAID',
  });
  const { job } = await drain(h);
  assert(job?.status === 'completed', 'job conclui sem mexer na paga');
  assert(!h.persistEmitted.includes('inst-001'), 'não persiste emissão em PAID');
  assert(!h.persistErrors.includes('inst-001'), 'não persiste erro em PAID');
  assert(!h.persistArtifacts.includes('inst-001'), 'não materializa artefato de PAID');
  assert(h.paidOverwriteAttempts === 0, 'nenhuma tentativa de sobrescrever PAID chegou a persistir');
}

async function test429() {
  const h = createHarness(makeInstallments(8));
  h.setEmit(async (input) => {
    h.emitCalls.push(input);
    if (h.emitCalls.length === 3) {
      return { ok: false, httpStatus: 429, message: 'rate limit', retryAfterMs: 90_000 };
    }
    return { ok: true, codigoSolicitacao: `SIM-${input.seuNumero}` };
  });
  const job = await startTick(h);
  assert(job?.status === 'running', '429 pausa o lote, job segue running');
  assert(job?.rateLimitedUntil, 'grava rateLimitedUntil');
  assert(h.emitCalls.length === 3, 'para no 429, não continua o lote');
  assert((job?.emitted || 0) === 2, 'duas emitidas antes do 429');
  const blocked = await tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
  });
  assert(blocked?.rateLimitedUntil, 'tick durante backoff não avança');
  assert(h.emitCalls.length === 3, 'nenhuma emissão extra durante 429');
  h.clock.now = Date.parse(String(blocked?.rateLimitedUntil)) + 1;
  const resumed = await tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
  });
  assert((resumed?.emitted || 0) >= 2, 'retoma após backoff 429');
  assert(h.emitCalls.length > 3, 'novas emissões depois do 429');
}

async function testTimeoutRetry() {
  const h = createHarness(makeInstallments(1));
  h.setEmit(async (input) => {
    h.emitCalls.push(input);
    return { ok: false, httpStatus: 408, message: 'timeout' };
  });
  const first = await startTick(h);
  assert(first?.installmentResults['inst-001']?.status === 'pending', 'timeout não falha de imediato');
  assert((first?.installmentResults['inst-001']?.attempts || 0) === 1, 'conta tentativa de timeout');
  for (let i = 0; i < INTER_RESUME_MAX_ATTEMPTS; i += 1) {
    await tickInterResumeJob({ store: h.store, ports: h.ports, companyId: 'co-1', saleId: 'sale-1' });
  }
  const last = await h.store.load('co-1', 'sale-1');
  assert(last?.installmentResults['inst-001']?.status === 'failed', 'timeout esgota tentativas');
  assert(h.persistErrors.includes('inst-001'), 'erro persistido após esgotar timeout');
}

async function testLostResponse() {
  const h = createHarness(makeInstallments(1));
  h.setEmit(async (input) => {
    h.emitCalls.push(input);
    return { ok: false, lost: true };
  });
  h.setReconcile(async (seuNumero) => {
    h.reconcileCalls.push(seuNumero);
    if (h.reconcileCalls.length >= 1) {
      return { codigoSolicitacao: `REC-${seuNumero}` };
    }
    return null;
  });
  const job = await startTick(h);
  assert(job?.installmentResults['inst-001']?.status === 'reconciled', 'POST perdido reconcilia por seuNumero');
  assert(h.persistEmitted.includes('inst-001'), 'persiste cobrança reconciliada');
  assert(h.emitCalls.length === 1, 'não emite segunda vez após hit de reconciliação');
}

async function testLostWithoutHitThenResume() {
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
  assert(first?.installmentResults['inst-001']?.status === 'pending', 'sem hit permanece pending');
  const second = await tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
  });
  assert(second?.installmentResults['inst-001']?.status === 'reconciled', 'retomada reconcilia POST perdido');
}

async function testPauseResume() {
  const h = createHarness(makeInstallments(12));
  const first = await startTick(h);
  assert(first?.status === 'running', 'primeiro lote deixa job running');
  assert(h.emitCalls.length === 5, 'primeiro tick emite lote de 5');
  const paused = await pauseInterResumeJob({
    store: h.store,
    companyId: 'co-1',
    saleId: 'sale-1',
    nowMs: h.clock.now,
  });
  assert(paused?.status === 'paused', 'pausa persistida');
  const ignored = await tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
  });
  assert(ignored?.status === 'paused', 'tick respeita pausa');
  assert(h.emitCalls.length === 5, 'pausa não emite');
  const { job } = await drain(h);
  assert(job?.status === 'completed', 'retomada após pausa conclui as 12');
  assert(h.emitCalls.length === 12, '12 emissões no total após pausa/retomada');
}

async function testConcurrency() {
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
  const leased = applyInterResumeLease(loaded, 'owner-a', h.clock.now, 60_000);
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
  assert(conflict, 'o concorrente recebe conflito de exclusão mútua');
  assert(h.emitCalls.length === 0, 'lease alheio não emite');
  h.clock.now += 61_000;
  const after = await tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
    leaseOwner: 'owner-b',
  });
  assert((after?.emitted || 0) > 0, 'após expirar o lease outro worker pode retomar');
  const uniqueEmits = new Set(h.emitCalls.map((c) => c.installmentId));
  assert(uniqueEmits.size === h.emitCalls.length, 'concorrência não duplica emissão da mesma parcela');
}

async function testArtifactsSeparated() {
  const h = createHarness(makeInstallments(2));
  h.needingArtifacts.push({
    installmentId: 'inst-099',
    codigoSolicitacao: 'SOL-OLD',
    status: 'PENDING',
  });
  await startTick(h);
  assert(h.fetchArtifacts.includes('SOL-OLD'), 'materializa artefatos de emissão anterior');
  assert(h.persistArtifacts.includes('inst-099'), 'persiste PDF/linha digitável à parte');
  assert(h.emitCalls.every((c) => c.installmentId !== 'inst-099'), 'materialização não reemite');
}

async function testSourceGuards() {
  const panel = read('components/sales/SaleChargesPanel.tsx');
  const resumeRoute = read('app/api/finance/inter/sale-charges/resume/route.ts');
  const cron = read('app/api/cron/inter-sale-charges-resume/route.ts');
  const service = read('lib/banking/inter/interSaleChargesResumeService.ts');
  const worker = read('lib/banking/inter/interSaleChargesResumeWorker.ts');
  const vercel = read('vercel.json');
  const saleCharges = read('app/api/finance/inter/sale-charges/route.ts');

  assert(panel.includes('Continuar cobranças faltantes'), 'botão Continuar cobranças faltantes');
  assert(panel.includes('Pausar retomada'), 'botão pausar');
  assert(panel.includes('/api/finance/inter/sale-charges/resume'), 'UI chama API de retomada');
  assert(resumeRoute.includes("confirmed !== true"), 'confirmação obrigatória');
  assert(cron.includes('isProductionSupabaseRuntime'), 'cron não processa Production supabase');
  assert(cron.includes('skipped'), 'cron responde skipped em Production');
  assert(service.includes("mode === 'simulate'"), 'emissão simulada no homolog');
  assert(service.includes('InterResumeBlockedError'), 'bloqueio explícito em Production');
  assert(worker.includes('reconcileBySeuNumero'), 'reconciliação por seuNumero');
  assert(worker.includes('listChargesNeedingArtifacts'), 'artefatos separados da emissão');
  assert(vercel.includes('/api/cron/inter-sale-charges-resume'), 'cron no vercel.json');
  assert(saleCharges.includes('getInterResumeJobView'), 'GET summary devolve job');
  assert(!/\.from\('finance_receipts'\)[\s\S]{0,400}\.update\(/.test(service), 'não atualiza valores/datas de parcelas');
  assert(!worker.toLowerCase().includes('asaas'), 'worker de retomada não toca Asaas');
  assert(!service.includes('/api/finance/asaas'), 'serviço de retomada não chama rotas Asaas');
  assert(service.includes("mode === 'simulate'"), 'simulate curto-circuita POST live');
}

async function main() {
  testDomain();
  await testIdempotency();
  await testPaidLock();
  await test429();
  await testTimeoutRetry();
  await testLostResponse();
  await testLostWithoutHitThenResume();
  await testPauseResume();
  await testConcurrency();
  await testArtifactsSeparated();
  await testScale(12);
  await testScale(60);
  await testScale(180);
  await testScale(240);
  await testSourceGuards();
  console.log('\nOK mandatory-inter-sale-charges-resume-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
