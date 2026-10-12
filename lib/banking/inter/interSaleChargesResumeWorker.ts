/**
 * Worker de retomada Inter: um lote por tick, lock por venda, emissão ≠ artefatos.
 */

import {
  INTER_RESUME_BATCH_SIZE,
  INTER_RESUME_MAX_ATTEMPTS,
  applyInterResumeLease,
  buildInterSeuNumero,
  canAcquireInterResumeLease,
  canPersistInterResumeChargeStatus,
  classifyInterResumeHttpError,
  countInterResumeProgress,
  createInterResumeJob,
  interResumeBackoffMs,
  isInterResumeRateLimited,
  nextPostSpacingMs,
  planInterResumeBatch,
  releaseInterResumeLease,
  shouldSkipDuplicateInterCharge,
  type InterResumeExistingCharge,
  type InterResumeInstallmentResult,
  type InterSaleChargesResumeJob,
} from '@/lib/banking/inter/interSaleChargesResume';

export type InterResumeMissingInstallment = {
  id: string;
  installmentNumber: number | null;
  dueDate: string | null;
  amount: number;
  paid?: boolean;
};

export type InterResumeEmitResult =
  | { ok: true; codigoSolicitacao: string }
  | { ok: false; lost: true }
  | { ok: false; httpStatus: number; message: string; retryAfterMs?: number | null };

export type InterResumeReconcileHit = {
  codigoSolicitacao: string;
  situacao?: string | null;
};

export type InterResumeArtifactDetail = {
  codigoSolicitacao: string;
  linhaDigitavel?: string | null;
  codigoBarras?: string | null;
  pixCopiaECola?: string | null;
  nossoNumero?: string | null;
  txid?: string | null;
  situacao?: string | null;
};

export type InterResumeJobStore = {
  load(companyId: string, saleId: string): Promise<InterSaleChargesResumeJob | null>;
  save(
    job: InterSaleChargesResumeJob,
    expectedRevision: number,
  ): Promise<{ ok: boolean; current: InterSaleChargesResumeJob | null }>;
};

export type InterResumePorts = {
  now(): number;
  sleep(ms: number): Promise<void>;
  newJobId(): string;
  newLeaseOwner(): string;
  listMissing(saleId: string): Promise<InterResumeMissingInstallment[]>;
  findActiveCharge(installmentId: string): Promise<InterResumeExistingCharge | null>;
  persistEmittedCharge(input: {
    installmentId: string;
    codigoSolicitacao: string;
    seuNumero: string;
    amount: number;
    dueDate: string;
    attempts: number;
  }): Promise<void>;
  persistInstallmentError(input: {
    installmentId: string;
    message: string;
    attempts: number;
    currentStatus?: string | null;
  }): Promise<void>;
  emitCobranca(input: {
    installmentId: string;
    seuNumero: string;
    amount: number;
    dueDate: string;
  }): Promise<InterResumeEmitResult>;
  reconcileBySeuNumero(input: {
    seuNumero: string;
    dueDate: string;
  }): Promise<InterResumeReconcileHit | null>;
  listChargesNeedingArtifacts(saleId: string): Promise<
    Array<{ installmentId: string; codigoSolicitacao: string; status?: string | null }>
  >;
  fetchArtifacts(codigoSolicitacao: string): Promise<InterResumeArtifactDetail | null>;
  persistArtifacts(input: {
    installmentId: string;
    detail: InterResumeArtifactDetail;
    currentStatus?: string | null;
  }): Promise<void>;
};

export class InterResumeConflictError extends Error {
  constructor(message = 'Já existe uma geração Inter em andamento para esta venda.') {
    super(message);
    this.name = 'InterResumeConflictError';
  }
}

export class InterResumeBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InterResumeBlockedError';
  }
}

function syncProgress(job: InterSaleChargesResumeJob): InterSaleChargesResumeJob {
  const progress = countInterResumeProgress(job);
  return { ...job, ...progress };
}

function setResult(
  job: InterSaleChargesResumeJob,
  installmentId: string,
  patch: Partial<InterResumeInstallmentResult>,
): InterSaleChargesResumeJob {
  const prev = job.installmentResults[installmentId] || { status: 'pending' as const, attempts: 0 };
  const next: InterResumeInstallmentResult = {
    ...prev,
    ...patch,
    attempts: patch.attempts ?? prev.attempts,
  };
  return syncProgress({
    ...job,
    installmentResults: { ...job.installmentResults, [installmentId]: next },
  });
}

export async function startInterResumeJob(params: {
  store: InterResumeJobStore;
  ports: InterResumePorts;
  companyId: string;
  saleId: string;
  integrationId: string;
  financialAccountId?: string | null;
  createdBy?: string | null;
  mode: 'simulate' | 'live';
}): Promise<InterSaleChargesResumeJob> {
  const existing = await params.store.load(params.companyId, params.saleId);
  const now = params.ports.now();
  if (existing && existing.status === 'running' && !canAcquireInterResumeLease({
    job: existing,
    owner: 'start',
    nowMs: now,
  })) {
    throw new InterResumeConflictError();
  }
  if (existing && (existing.status === 'paused' || existing.status === 'failed' || existing.status === 'queued')) {
    const missing = await params.ports.listMissing(params.saleId);
    const plannedInstallmentIds = missing.map((row) => row.id);
    const installmentResults: InterSaleChargesResumeJob['installmentResults'] = {};
    for (const id of plannedInstallmentIds) {
      const prev = existing.installmentResults[id];
      if (!prev) continue;
      if (prev.status === 'failed' || prev.status === 'pending') {
        installmentResults[id] = {
          ...prev,
          status: 'pending',
          attempts: 0,
          lastError: null,
        };
      } else {
        installmentResults[id] = prev;
      }
    }
    const resumed: InterSaleChargesResumeJob = syncProgress({
      ...existing,
      status: 'queued',
      lastError: null,
      rateLimitedUntil: null,
      plannedInstallmentIds,
      cursorIndex: 0,
      installmentResults,
      updatedAt: new Date(now).toISOString(),
      revision: existing.revision + 1,
    });
    const saved = await params.store.save(resumed, existing.revision);
    if (!saved.ok) throw new InterResumeConflictError();
    return saved.current || resumed;
  }
  if (existing && existing.status === 'running') {
    return existing;
  }
  const expectedRevision = existing?.revision ?? 0;
  if (existing && existing.status === 'completed') {
    const leftover = await params.ports.listMissing(params.saleId);
    if (leftover.length === 0) return existing;
  }

  const missing = await params.ports.listMissing(params.saleId);
  const job = createInterResumeJob({
    id: params.ports.newJobId(),
    companyId: params.companyId,
    saleId: params.saleId,
    integrationId: params.integrationId,
    financialAccountId: params.financialAccountId,
    createdBy: params.createdBy,
    plannedInstallmentIds: missing.map((row) => row.id),
    nowMs: now,
    mode: params.mode,
  });
  const saved = await params.store.save(job, expectedRevision);
  if (!saved.ok) throw new InterResumeConflictError();
  return saved.current || job;
}

export async function pauseInterResumeJob(params: {
  store: InterResumeJobStore;
  companyId: string;
  saleId: string;
  nowMs: number;
}): Promise<InterSaleChargesResumeJob | null> {
  const existing = await params.store.load(params.companyId, params.saleId);
  if (!existing) return null;
  const paused = releaseInterResumeLease(
    { ...existing, status: 'paused', lastError: existing.lastError },
    params.nowMs,
    'paused',
  );
  const saved = await params.store.save(paused, existing.revision);
  if (!saved.ok) throw new InterResumeConflictError();
  return saved.current || paused;
}

async function persistJob(
  store: InterResumeJobStore,
  job: InterSaleChargesResumeJob,
  expectedRevision: number,
): Promise<InterSaleChargesResumeJob> {
  const saved = await store.save(job, expectedRevision);
  if (!saved.ok) throw new InterResumeConflictError();
  return saved.current || job;
}

export async function tickInterResumeJob(params: {
  store: InterResumeJobStore;
  ports: InterResumePorts;
  companyId: string;
  saleId: string;
  leaseOwner?: string;
  batchSize?: number;
  materializeLimit?: number;
}): Promise<InterSaleChargesResumeJob | null> {
  const loaded = await params.store.load(params.companyId, params.saleId);
  if (!loaded) return null;
  if (loaded.status === 'paused' || loaded.status === 'completed') return loaded;

  const now0 = params.ports.now();
  if (isInterResumeRateLimited(loaded, now0)) return loaded;

  const owner = params.leaseOwner || params.ports.newLeaseOwner();
  if (!canAcquireInterResumeLease({ job: loaded, owner, nowMs: now0 })) {
    throw new InterResumeConflictError();
  }
  const leased = applyInterResumeLease(loaded, owner, now0);
  let job = await persistJob(params.store, leased, loaded.revision);

  try {
    job = await materializePendingArtifacts(job, params.ports, params.materializeLimit ?? 8);

    if (isInterResumeRateLimited(job, params.ports.now())) {
      return persistJob(
        params.store,
        releaseInterResumeLease(job, params.ports.now(), 'running'),
        job.revision,
      );
    }

    const missingNow = await params.ports.listMissing(params.saleId);
    const missingSet = new Set(missingNow.map((row) => row.id));
    const paidSet = new Set(missingNow.filter((row) => row.paid).map((row) => row.id));
    const byId = new Map(missingNow.map((row) => [row.id, row]));

    const batch = planInterResumeBatch(job, params.batchSize ?? INTER_RESUME_BATCH_SIZE);
    const advanceCursor = () => {
      job = { ...job, cursorIndex: job.cursorIndex + 1 };
    };
    for (const installmentId of batch) {
      const now = params.ports.now();
      if (isInterResumeRateLimited(job, now)) break;

      const prev = job.installmentResults[installmentId];
      if (prev && ['emitted', 'reused', 'skipped_paid', 'reconciled', 'failed'].includes(prev.status)) {
        advanceCursor();
        continue;
      }

      if (paidSet.has(installmentId) || !missingSet.has(installmentId)) {
        const charge = await params.ports.findActiveCharge(installmentId);
        if (String(charge?.status || '').toUpperCase() === 'PAID' || paidSet.has(installmentId)) {
          job = setResult(job, installmentId, { status: 'skipped_paid', attempts: prev?.attempts || 0 });
          advanceCursor();
          continue;
        }
        if (shouldSkipDuplicateInterCharge(charge)) {
          job = setResult(job, installmentId, {
            status: 'reused',
            attempts: prev?.attempts || 0,
            codigoSolicitacao: String(charge?.external_id || '') || null,
          });
          advanceCursor();
          continue;
        }
        if (!missingSet.has(installmentId)) {
          job = setResult(job, installmentId, { status: 'reused', attempts: prev?.attempts || 0 });
          advanceCursor();
          continue;
        }
      }

      const active = await params.ports.findActiveCharge(installmentId);
      if (shouldSkipDuplicateInterCharge(active) && String(active?.external_id || '').trim()) {
        job = setResult(job, installmentId, {
          status: 'reused',
          attempts: prev?.attempts || 0,
          codigoSolicitacao: String(active?.external_id || ''),
        });
        advanceCursor();
        continue;
      }

      const row = byId.get(installmentId);
      const dueDate = String(row?.dueDate || '').slice(0, 10);
      const amount = Number(row?.amount || 0);
      const seuNumero = buildInterSeuNumero(row?.installmentNumber, installmentId);
      const attempts = (prev?.attempts || 0) + 1;

      if (active && !String(active.external_id || '').trim()) {
        const hit = await params.ports.reconcileBySeuNumero({ seuNumero, dueDate });
        if (hit?.codigoSolicitacao) {
          await params.ports.persistEmittedCharge({
            installmentId,
            codigoSolicitacao: hit.codigoSolicitacao,
            seuNumero,
            amount,
            dueDate,
            attempts,
          });
          job = setResult(job, installmentId, {
            status: 'reconciled',
            attempts,
            codigoSolicitacao: hit.codigoSolicitacao,
            seuNumero,
            lastError: null,
          });
          advanceCursor();
          continue;
        }
      }

      const wait = nextPostSpacingMs(job.lastPostAt, params.ports.now());
      if (wait > 0) await params.ports.sleep(wait);

      const emitted = await params.ports.emitCobranca({
        installmentId,
        seuNumero,
        amount,
        dueDate,
      });
      job = { ...job, lastPostAt: new Date(params.ports.now()).toISOString() };

      if (emitted.ok) {
        await params.ports.persistEmittedCharge({
          installmentId,
          codigoSolicitacao: emitted.codigoSolicitacao,
          seuNumero,
          amount,
          dueDate,
          attempts,
        });
        job = setResult(job, installmentId, {
          status: 'emitted',
          attempts,
          codigoSolicitacao: emitted.codigoSolicitacao,
          seuNumero,
          lastError: null,
        });
        advanceCursor();
        continue;
      }

      if ('lost' in emitted && emitted.lost) {
        const hit = await params.ports.reconcileBySeuNumero({ seuNumero, dueDate });
        if (hit?.codigoSolicitacao) {
          await params.ports.persistEmittedCharge({
            installmentId,
            codigoSolicitacao: hit.codigoSolicitacao,
            seuNumero,
            amount,
            dueDate,
            attempts,
          });
          job = setResult(job, installmentId, {
            status: 'reconciled',
            attempts,
            codigoSolicitacao: hit.codigoSolicitacao,
            seuNumero,
            lastError: null,
          });
          advanceCursor();
          continue;
        }
        const lostFail = attempts >= INTER_RESUME_MAX_ATTEMPTS;
        job = setResult(job, installmentId, {
          status: lostFail ? 'failed' : 'pending',
          attempts,
          seuNumero,
          lastError: 'Resposta perdida após POST; reconciliação sem hit.',
        });
        if (lostFail) {
          await params.ports.persistInstallmentError({
            installmentId,
            message: 'Resposta perdida após POST Inter.',
            attempts,
            currentStatus: active?.status,
          });
          advanceCursor();
          continue;
        }
        break;
      }

      const httpStatus = emitted.httpStatus;
      const kind = classifyInterResumeHttpError(httpStatus);
      if (kind === 'retry' && httpStatus === 429) {
        const backoff = interResumeBackoffMs({
          attempt: attempts,
          httpStatus,
          retryAfterMs: emitted.retryAfterMs,
        });
        job = {
          ...setResult(job, installmentId, {
            status: 'pending',
            attempts,
            lastError: emitted.message,
            seuNumero,
          }),
          lastError: emitted.message,
          rateLimitedUntil: new Date(params.ports.now() + backoff).toISOString(),
        };
        break;
      }
      const fail = kind === 'fail' || attempts >= INTER_RESUME_MAX_ATTEMPTS;
      job = setResult(job, installmentId, {
        status: fail ? 'failed' : 'pending',
        attempts,
        lastError: emitted.message,
        seuNumero,
      });
      if (fail) {
        await params.ports.persistInstallmentError({
          installmentId,
          message: emitted.message,
          attempts,
          currentStatus: active?.status,
        });
        advanceCursor();
        continue;
      }
      break;
    }

    const remainingIds = job.plannedInstallmentIds.slice(job.cursorIndex);
    const nextStatus =
      remainingIds.length === 0
        ? job.failed > 0
          ? 'failed'
          : 'completed'
        : 'running';
    const expectedRevision = job.revision;
    job = releaseInterResumeLease(syncProgress(job), params.ports.now(), nextStatus);
    return persistJob(params.store, job, expectedRevision);
  } catch (err) {
    if (err instanceof InterResumeConflictError) throw err;
    const message = err instanceof Error ? err.message : 'Falha no tick Inter.';
    const failed = releaseInterResumeLease(
      { ...job, lastError: message },
      params.ports.now(),
      job.cursorIndex >= job.plannedInstallmentIds.length ? 'failed' : 'running',
    );
    await persistJob(params.store, failed, job.revision).catch(() => null);
    throw err;
  }
}

async function materializePendingArtifacts(
  job: InterSaleChargesResumeJob,
  ports: InterResumePorts,
  limit: number,
): Promise<InterSaleChargesResumeJob> {
  const pending = await ports.listChargesNeedingArtifacts(job.saleId);
  let next = job;
  for (const row of pending.slice(0, Math.max(0, limit))) {
    if (!canPersistInterResumeChargeStatus({
      currentStatus: row.status,
      nextStatus: 'REGISTERED',
    })) {
      continue;
    }
    const detail = await ports.fetchArtifacts(row.codigoSolicitacao);
    if (!detail) continue;
    await ports.persistArtifacts({
      installmentId: row.installmentId,
      detail,
      currentStatus: row.status,
    });
  }
  return next;
}

export function createMemoryInterResumeStore(): InterResumeJobStore & {
  jobs: Map<string, InterSaleChargesResumeJob>;
} {
  const jobs = new Map<string, InterSaleChargesResumeJob>();
  const key = (companyId: string, saleId: string) => `${companyId}:${saleId}`;
  return {
    jobs,
    async load(companyId, saleId) {
      return jobs.get(key(companyId, saleId)) || null;
    },
    async save(job, expectedRevision) {
      const current = jobs.get(key(job.companyId, job.saleId)) || null;
      const currentRev = current?.revision ?? 0;
      if (expectedRevision !== currentRev && !(expectedRevision === 0 && !current)) {
        return { ok: false, current };
      }
      const stored = { ...job };
      jobs.set(key(job.companyId, job.saleId), stored);
      return { ok: true, current: stored };
    },
  };
}
