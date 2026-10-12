/**
 * Testes — emissão progressiva Inter (limite 1000 dias).
 * npm run test:inter-boleto-due-window
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  INTER_BOLETO_EFFECTIVE_MAX_ADVANCE_DAYS,
  INTER_BOLETO_MAX_ADVANCE_DAYS,
  INTER_WAITING_BANK_WINDOW_CODE,
  addCalendarDaysIso,
  calendarDaysBetween,
  classifyInterBoletoDueWindow,
  isInterBoletoDueWithinBankWindow,
  isInterBoletoDueWindowError,
  isoDateFromMs,
  partitionInstallmentsByInterDueWindow,
} from '../lib/banking/inter/interBoletoDueWindow';
import {
  INTER_RESUME_BATCH_SIZE,
  canRetryInterResumePost,
  mustReconcileBeforeInterResumePost,
  planInterResumeWindowSplit,
} from '../lib/banking/inter/interSaleChargesResume';
import {
  createMemoryInterResumeStore,
  reopenInterResumeWaitingWindow,
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

const CLOCK = 1_700_000_000_000;
const EMIT = isoDateFromMs(CLOCK);

function inst(
  n: number,
  dueOffsetDays: number,
  prefix = 'inst',
): InterResumeMissingInstallment {
  return {
    id: `${prefix}-${String(n).padStart(3, '0')}`,
    installmentNumber: n,
    dueDate: addCalendarDaysIso(EMIT, dueOffsetDays),
    amount: 500,
    paid: false,
  };
}

type Harness = {
  store: ReturnType<typeof createMemoryInterResumeStore>;
  ports: InterResumePorts;
  emitCalls: Array<{ installmentId: string; seuNumero: string }>;
  persistErrors: string[];
  missing: InterResumeMissingInstallment[];
  clock: { now: number };
  setEmit(fn: (input: { installmentId: string; seuNumero: string }) => Promise<InterResumeEmitResult>): void;
};

function createHarness(missing: InterResumeMissingInstallment[]): Harness {
  const store = createMemoryInterResumeStore();
  const emitCalls: Harness['emitCalls'] = [];
  const persistErrors: string[] = [];
  const clock = { now: CLOCK };
  const active = new Map<string, InterResumeExistingCharge>();
  let emitImpl: (input: { installmentId: string; seuNumero: string }) => Promise<InterResumeEmitResult> =
    async (input) => {
      emitCalls.push(input);
      return { ok: true, codigoSolicitacao: `SIM-${input.seuNumero}` };
    };
  const ports: InterResumePorts = {
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += Math.max(0, ms);
    },
    newJobId: () => 'job-sale-1',
    newLeaseOwner: () => `lease-${Math.random().toString(36).slice(2, 8)}`,
    listMissing: async () => missing,
    findActiveCharge: async (id) => active.get(id) || null,
    persistEmittedCharge: async (input) => {
      emitCalls.length;
      active.set(input.installmentId, {
        id: `chg-${input.installmentId}`,
        status: 'PENDING',
        external_id: input.codigoSolicitacao,
        finance_receipt_id: input.installmentId,
      });
    },
    persistInstallmentError: async (input) => {
      persistErrors.push(input.installmentId);
    },
    emitCobranca: async (input) => emitImpl(input),
    reconcileBySeuNumero: async () => null,
    listChargesNeedingArtifacts: async () => [],
    fetchArtifacts: async () => null,
    persistArtifacts: async () => undefined,
  };
  return {
    store,
    ports,
    emitCalls,
    persistErrors,
    missing,
    clock,
    setEmit(fn) {
      emitImpl = fn;
    },
  };
}

async function startTick(h: Harness) {
  await startInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
    integrationId: 'int-1',
    mode: 'simulate',
  });
  return tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
    batchSize: INTER_RESUME_BATCH_SIZE,
  });
}

function testWindowDomain() {
  assert(INTER_BOLETO_MAX_ADVANCE_DAYS === 1000, 'limite bancário 1000');
  assert(INTER_BOLETO_EFFECTIVE_MAX_ADVANCE_DAYS === 993, 'margem 7 → 993');
  assert(calendarDaysBetween('2026-10-12', '2026-10-12') === 0, 'mesmo dia = 0');
  assert(calendarDaysBetween('2026-10-12', '2029-07-15') === 1007, 'Canaã parcela 33 ≈ 1007 dias');

  const emit = '2026-10-12';
  assert(isInterBoletoDueWithinBankWindow({ dueDate: '2026-10-12', emitDate: emit }), 'hoje é elegível');
  assert(isInterBoletoDueWithinBankWindow({ dueDate: '2026-09-01', emitDate: emit }), 'vencido permanece elegível');
  assert(
    isInterBoletoDueWithinBankWindow({ dueDate: addCalendarDaysIso(emit, 992), emitDate: emit }),
    '992 dias dentro da margem',
  );
  assert(
    !isInterBoletoDueWithinBankWindow({ dueDate: addCalendarDaysIso(emit, 993), emitDate: emit }),
    '993 dias aguarda (margem)',
  );
  assert(
    !isInterBoletoDueWithinBankWindow({ dueDate: addCalendarDaysIso(emit, 999), emitDate: emit }),
    '999 dias aguarda pela margem',
  );
  assert(
    !isInterBoletoDueWithinBankWindow({ dueDate: addCalendarDaysIso(emit, 1000), emitDate: emit }),
    '1000 dias fora do banco',
  );
  assert(
    classifyInterBoletoDueWindow({ dueDate: addCalendarDaysIso(emit, 1001), emitDate: emit }) ===
      'waiting_window',
    '1001 = AGUARDANDO_JANELA_BANCARIA',
  );

  const due993 = addCalendarDaysIso(emit, 993);
  assert(
    classifyInterBoletoDueWindow({ dueDate: due993, emitDate: emit }) === 'waiting_window',
    'limite efetivo aguarda',
  );
  assert(
    classifyInterBoletoDueWindow({ dueDate: due993, emitDate: addCalendarDaysIso(emit, 1) }) ===
      'eligible',
    'no dia seguinte 993 vira elegível',
  );

  assert(
    isInterBoletoDueWindowError(
      'A data de vencimento do documento deve ser menor do que 1000 dias da data de emissão!',
      400,
    ),
    'HTTP 400 do Inter é erro de janela',
  );
  assert(!mustReconcileBeforeInterResumePost({
    status: 'failed',
    attempts: 1,
    postAttempted: true,
    lastHttpStatus: 400,
    lastError: 'menor do que 1000 dias da data de emissão',
  }), '400 de janela não exige conciliação');
  assert(canRetryInterResumePost({
    status: 'waiting_window',
    attempts: 1,
    lastError: INTER_WAITING_BANK_WINDOW_CODE,
  }), 'waiting_window pode emitir quando entrar na janela');
}

function testPartition180() {
  const rows = Array.from({ length: 180 }, (_, i) => inst(i + 1, 20 + i * 30));
  const split = partitionInstallmentsByInterDueWindow(rows, { emitDate: EMIT });
  assert(split.eligible.length + split.waiting.length === 180, '180 parcelas classificadas');
  assert(split.eligible.length > 0, 'há parcelas elegíveis no início');
  assert(split.waiting.length > 0, 'há parcelas fora da janela em 180 meses');
  assert(
    split.eligible.every((row) => calendarDaysBetween(EMIT, String(row.dueDate))! < 993),
    'elegíveis < 993 dias',
  );
  assert(
    split.waiting.every((row) => calendarDaysBetween(EMIT, String(row.dueDate))! >= 993),
    'aguardando ≥ 993 dias',
  );
}

function testPlannerDoesNotFailWaiting() {
  const missing = [inst(1, 10), inst(2, 1200)];
  const split = planInterResumeWindowSplit({
    missing,
    previous: {
      'inst-002': {
        status: 'failed',
        attempts: 1,
        postAttempted: true,
        lastHttpStatus: 400,
        lastError: 'A data de vencimento do documento deve ser menor do que 1000 dias da data de emissão!',
      },
    },
    emitDate: EMIT,
  });
  assert(split.plannedInstallmentIds.includes('inst-001'), 'elegível entra no plano');
  assert(!split.plannedInstallmentIds.includes('inst-002'), 'fora da janela não vai a POST');
  assert(split.waitingInstallmentIds.includes('inst-002'), 'fora da janela aguarda');
  assert(split.installmentResults['inst-002']?.status === 'waiting_window', 'não permanece failed');
}

async function testWorkerSkipsWaiting() {
  const missing = [inst(1, 15), inst(2, 20), inst(3, 1200), inst(4, 1230), inst(5, 1260)];
  const h = createHarness(missing);
  const job = await startTick(h);
  assert(h.emitCalls.length === 2, 'só as 2 elegíveis recebem POST');
  assert(h.persistErrors.length === 0, 'aguardando não grava falha');
  assert(job?.waitingWindow === 3, '3 aguardando janela');
  assert(job?.failed === 0, '0 falha real');
  assert(job?.status === 'waiting_window' || (job?.emitted || 0) === 2, 'conclui elegíveis e espera o resto');
}

async function testHttp400WindowIsNotFailure() {
  const missing = [inst(1, 15)];
  const h = createHarness(missing);
  h.setEmit(async (input) => {
    h.emitCalls.push(input);
    return {
      ok: false,
      httpStatus: 400,
      message: 'A data de vencimento do documento deve ser menor do que 1000 dias da data de emissão!',
    };
  });
  const job = await startTick(h);
  assert(h.emitCalls.length === 1, 'uma tentativa');
  assert(job?.installmentResults['inst-001']?.status === 'waiting_window', '400 de janela → aguardando');
  assert((job?.failed || 0) === 0, 'não conta como falha');
  assert(h.persistErrors.length === 0, 'não persiste FAILED');

  const again = await tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
  });
  assert(h.emitCalls.length === 1, 'sem novo POST enquanto fora da janela');
  assert(again?.status === 'waiting_window' || again?.installmentResults['inst-001']?.status === 'waiting_window', 'permanece aguardando');
}

async function testDateChangeReopens() {
  const due = addCalendarDaysIso(EMIT, 993);
  const missing: InterResumeMissingInstallment[] = [
    { id: 'inst-001', installmentNumber: 1, dueDate: due, amount: 500, paid: false },
  ];
  const h = createHarness(missing);
  const first = await startTick(h);
  assert(h.emitCalls.length === 0, '993 dias não emite');
  assert(first?.status === 'waiting_window', 'job aguarda janela');

  h.clock.now += 24 * 60 * 60 * 1000;
  const reopened = await reopenInterResumeWaitingWindow({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
    mode: 'simulate',
  });
  assert(reopened?.status === 'queued', 'no dia seguinte reabre');
  const second = await tickInterResumeJob({
    store: h.store,
    ports: h.ports,
    companyId: 'co-1',
    saleId: 'sale-1',
  });
  assert(h.emitCalls.length === 1, 'emite após entrar na janela');
  assert(second?.emitted === 1, '1 emitida');
  assert((second?.failed || 0) === 0, 'sem falha');
}

async function testCanaaLike180() {
  const paidEntry: InterResumeMissingInstallment[] = [];
  const monthly = Array.from({ length: 180 }, (_, i) => inst(i + 1, 20 + i * 30));
  const alreadyEmitted = new Set(monthly.slice(0, 32).map((row) => row.id));
  const missing = monthly.filter((row) => !alreadyEmitted.has(row.id));
  assert(missing.length === 148, '148 faltantes após 32 emitidos');
  const h = createHarness(missing);
  for (const id of alreadyEmitted) {
    h.ports.findActiveCharge = async (installmentId) =>
      alreadyEmitted.has(installmentId)
        ? { id: `chg-${installmentId}`, status: 'REGISTERED', external_id: `SOL-${installmentId}` }
        : null;
  }
  const { job } = await (async () => {
    const started = await startTick(h);
    let current = started;
    let ticks = 1;
    while (current && (current.status === 'running' || current.status === 'queued') && ticks < 80) {
      current = await tickInterResumeJob({
        store: h.store,
        ports: h.ports,
        companyId: 'co-1',
        saleId: 'sale-1',
        batchSize: INTER_RESUME_BATCH_SIZE,
      });
      ticks += 1;
    }
    return { job: current };
  })();
  assert((job?.failed || 0) === 0, 'Canaã: 0 falha real');
  assert(h.persistErrors.length === 0, 'Canaã: não grava FAILED nas 148');
  assert((job?.waitingWindow || 0) + (job?.emitted || 0) === 148, '148 classificadas entre emitidas e aguardando');
}

async function testRestartDoesNotChangeAmounts() {
  const missing = [inst(33, 1200)];
  missing[0].amount = 500;
  missing[0].dueDate = '2029-07-15';
  const h = createHarness(missing);
  await startTick(h);
  const job = await h.store.load('co-1', 'sale-1');
  assert(h.missing[0].amount === 500, 'valor 500 preservado');
  assert(h.missing[0].dueDate === '2029-07-15', 'vencimento original preservado');
  assert(job?.installmentResults['inst-033']?.status === 'waiting_window', 'parcela 33 aguarda');
}

function testSourceGuards() {
  const panel = read('components/sales/SaleChargesPanel.tsx');
  const worker = read('lib/banking/inter/interSaleChargesResumeWorker.ts');
  const service = read('lib/banking/inter/interSaleChargeService.ts');
  const resumeService = read('lib/banking/inter/interSaleChargesResumeService.ts');
  const cron = read('app/api/cron/inter-sale-charges-window/route.ts');
  const vercel = read('vercel.json');
  const asaasGen = read('app/api/finance/asaas/sale-charges/generate-missing/route.ts');

  assert(panel.includes('Aguardando janela'), 'KPI aguardando janela');
  assert(panel.includes('Elegíveis agora'), 'KPI elegíveis');
  assert(panel.includes('Cronograma financeiro'), 'cronograma do comprador');
  assert(panel.includes('falhas reais'), 'falhas reais distintas da janela');
  assert(worker.includes('waiting_window'), 'worker classifica janela');
  assert(worker.includes('persistInstallmentError'), 'falha real ainda persiste só no caminho fail');
  assert(service.includes('assertInterBoletoDueWithinBankWindow'), 'create Inter respeita janela');
  assert(service.includes('AGUARDANDO_JANELA_BANCARIA'), 'lote legado não trata janela como erro');
  assert(resumeService.includes('tickWaitingInterResumeWindows'), 'cron diário da janela');
  assert(cron.includes('isCronSecretValid'), 'cron da janela autenticado');
  assert(vercel.includes('/api/cron/inter-sale-charges-window'), 'cron diário no vercel.json');
  assert(asaasGen.includes('generateMissingAsaas') || asaasGen.includes('asaas'), 'Asaas intacto');
  assert(!asaasGen.includes('assertInterBoletoDueWithinBankWindow'), 'Asaas não usa janela Inter');
}

async function main() {
  console.log('\n=== Inter janela 1000 dias ===\n');
  testWindowDomain();
  testPartition180();
  testPlannerDoesNotFailWaiting();
  await testWorkerSkipsWaiting();
  await testHttp400WindowIsNotFailure();
  await testDateChangeReopens();
  await testCanaaLike180();
  await testRestartDoesNotChangeAmounts();
  testSourceGuards();
  console.log('\nOK mandatory-inter-boleto-due-window-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
