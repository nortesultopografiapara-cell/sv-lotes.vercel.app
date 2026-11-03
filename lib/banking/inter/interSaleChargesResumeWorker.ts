/**
 * Worker de retomada Inter: lote, lease com renew, emissão ≠ artefatos.
 * Intent persistida antes do POST. Sem re-POST se a tentativa anterior for indeterminada.
 */

import { INTER_RESUME_LIVE_EMIT_DISABLED_MESSAGE } from '@/lib/banking/inter/interResumeLiveEmitFlag';
import {
  INTER_RESUME_BATCH_SIZE,
  INTER_RESUME_LEASE_MS,
  INTER_RESUME_MAX_ATTEMPTS,
  INTER_RESUME_TERMINAL_STATUSES,
  applyInterResumeLease,
  buildInterSeuNumero,
  canAcquireInterResumeLease,
  canPersistInterResumeChargeStatus,
  canRetryInterResumePost,
  casWriteInterResumeJob,
  classifyInterResumeHttpError,
  countInterResumeProgress,
  createInterResumeJob,
  emptyInterResumeJobsBundle,
  hydrateJobFromBundle,
  interResumeBackoffMs,
  isInterResumeRateLimited,
  mustReconcileBeforeInterResumePost,
  nextPostSpacingMs,
  planInterResumeBatch,
  releaseInterResumeLease,
  shouldSkipDuplicateInterCharge,
  type InterResumeExistingCharge,
  type InterResumeInstallmentResult,
  type InterResumeJobsBundle,
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
  | { ok: false; blocked: true; message: string }
  | { ok: false; httpStatus: number; message: string; retryAfterMs?: number | null };

export type InterResumeReconcileHit = {
  codigoSolicitacao: string;
  situacao?: string | null;
  confirmedEmpty?: boolean;
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
  ): Promise<{ ok: boolean; current: InterSaleChargesResumeJob | null; mapRev: number }>;
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

async function persistJob(
  store: InterResumeJobStore,
  job: InterSaleChargesResumeJob,
  expectedRevision: number,
): Promise<InterSaleChargesResumeJob> {
  let expected = expectedRevision;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const saved = await store.save(job, expected);
    if (saved.ok) return saved.current || job;
    if (saved.current && saved.current.saleId === job.saleId) {
      throw new InterResumeConflictError();
    }
    expected = saved.mapRev;
  }
  throw new InterResumeConflictError();
}

async function persistAndRenew(params: {
  store: InterResumeJobStore;
  job: InterSaleChargesResumeJob;
  owner: string;
  nowMs: number;
}): Promise<InterSaleChargesResumeJob> {
  const expected = params.job.revision;
  const renewed = applyInterResumeLease(syncProgress(params.job), params.owner, params.nowMs);
  return persistJob(params.store, renewed, expected);
}

export async function startInterResumeJob(params: {
  store: InterResumeJobStore;
  ports: InterResumePorts;
  companyId: string;
  saleId: string;
  integrationId: string;
  financialAccountId?: string | null;
  createdBy?: string | null;
  mode: 'simulate' | 'live' | 'deferred';
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
      if (prev.status === 'intent' || prev.status === 'manual_reconcile') {
        installmentResults[id] = prev;
        continue;
      }
      if (prev.status === 'failed' || prev.status === 'pending') {
        if (mustReconcileBeforeInterResumePost(prev) || prev.postAttempted) {
          installmentResults[id] = prev;
        } else {
          installmentResults[id] = {
            ...prev,
            status: 'pending',
            attempts: 0,
            lastError: null,
          };
        }
      } else {
        installmentResults[id] = prev;
      }
    }
    const resumed = syncProgress({
      ...existing,
      status: 'queued',
      lastError: null,
      plannedInstallmentIds,
      cursorIndex: 0,
      installmentResults,
      mode: params.mode,
      updatedAt: new Date(now).toISOString(),
    });
    return persistJob(params.store, resumed, existing.revision);
  }
  if (existing && existing.status === 'running') {
    return existing;
  }
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
  return persistJob(params.store, job, existing?.revision ?? 0);
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
  return persistJob(params.store, paused, existing.revision);
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
  let job = await persistJob(
    params.store,
    applyInterResumeLease(loaded, owner, now0),
    loaded.revision,
  );

  try {
    job = await materializePendingArtifacts(job, params.ports, params.materializeLimit ?? 8);

    if (isInterResumeRateLimited(job, params.ports.now())) {
      return persistJob(
        params.store,
        releaseInterResumeLease(job, params.ports.now(), 'running'),
        job.revision,
      );
    }

    if (job.mode === 'deferred') {
      const deferred = releaseInterResumeLease(
        {
          ...job,
          lastError: INTER_RESUME_LIVE_EMIT_DISABLED_MESSAGE,
        },
        params.ports.now(),
        'running',
      );
      return persistJob(params.store, deferred, job.revision);
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
      if (prev && INTER_RESUME_TERMINAL_STATUSES.has(prev.status)) {
        advanceCursor();
        continue;
      }

      if (paidSet.has(installmentId) || !missingSet.has(installmentId)) {
        const charge = await params.ports.findActiveCharge(installmentId);
        if (String(charge?.status || '').toUpperCase() === 'PAID' || paidSet.has(installmentId)) {
          job = setResult(job, installmentId, { status: 'skipped_paid', attempts: prev?.attempts || 0 });
          advanceCursor();
          job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
          continue;
        }
        if (shouldSkipDuplicateInterCharge(charge)) {
          job = setResult(job, installmentId, {
            status: 'reused',
            attempts: prev?.attempts || 0,
            codigoSolicitacao: String(charge?.external_id || '') || null,
          });
          advanceCursor();
          job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
          continue;
        }
        if (!missingSet.has(installmentId)) {
          job = setResult(job, installmentId, { status: 'reused', attempts: prev?.attempts || 0 });
          advanceCursor();
          job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
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
        job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
        continue;
      }

      const row = byId.get(installmentId);
      const dueDate = String(row?.dueDate || '').slice(0, 10);
      const amount = Number(row?.amount || 0);
      const seuNumero = prev?.seuNumero || buildInterSeuNumero(row?.installmentNumber, installmentId);

      if (mustReconcileBeforeInterResumePost(prev)) {
        const hit = await params.ports.reconcileBySeuNumero({ seuNumero, dueDate });
        if (hit?.codigoSolicitacao) {
          await params.ports.persistEmittedCharge({
            installmentId,
            codigoSolicitacao: hit.codigoSolicitacao,
            seuNumero,
            amount,
            dueDate,
            attempts: prev?.attempts || 0,
          });
          job = setResult(job, installmentId, {
            status: 'reconciled',
            codigoSolicitacao: hit.codigoSolicitacao,
            seuNumero,
            lastError: null,
          });
          advanceCursor();
          job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
          continue;
        }
        job = setResult(job, installmentId, {
          status: 'manual_reconcile',
          seuNumero,
          lastError:
            'Tentativa anterior indeterminada. Sem confirmação no Inter — conciliação manual, sem novo POST.',
        });
        advanceCursor();
        job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
        continue;
      }

      if (!canRetryInterResumePost(prev)) {
        job = setResult(job, installmentId, {
          status: 'manual_reconcile',
          seuNumero,
          lastError: 'Parcela marcada para conciliação manual; emissão automática bloqueada.',
        });
        advanceCursor();
        job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
        continue;
      }

      const attempts = (prev?.attempts || 0) + 1;
      const intentAt = new Date(params.ports.now()).toISOString();
      job = setResult(job, installmentId, {
        status: 'intent',
        attempts,
        seuNumero,
        intentAt,
        postAttempted: false,
        lastError: null,
      });
      job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });

      const wait = nextPostSpacingMs(job.lastPostAt, params.ports.now());
      if (wait > 0) await params.ports.sleep(wait);

      const emitted = await params.ports.emitCobranca({
        installmentId,
        seuNumero,
        amount,
        dueDate,
      });
      job = {
        ...job,
        lastPostAt: new Date(params.ports.now()).toISOString(),
      };

      if ('blocked' in emitted && emitted.blocked) {
        job = setResult(job, installmentId, {
          status: 'pending',
          postAttempted: false,
          lastError: emitted.message,
        });
        job = {
          ...job,
          lastError: emitted.message,
        };
        break;
      }

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
          postAttempted: true,
          codigoSolicitacao: emitted.codigoSolicitacao,
          seuNumero,
          lastError: null,
        });
        advanceCursor();
        job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
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
            postAttempted: true,
            codigoSolicitacao: hit.codigoSolicitacao,
            seuNumero,
            lastError: null,
          });
          advanceCursor();
          job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
          continue;
        }
        job = setResult(job, installmentId, {
          status: 'intent',
          attempts,
          postAttempted: true,
          seuNumero,
          lastHttpStatus: null,
          lastError: 'Resposta perdida após POST; sem reemissão automática.',
        });
        job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
        break;
      }

      const httpStatus = emitted.httpStatus;
      const kind = classifyInterResumeHttpError(httpStatus);
      if (kind === 'retry_post') {
        const backoff = interResumeBackoffMs({
          attempt: attempts,
          httpStatus,
          retryAfterMs: emitted.retryAfterMs,
        });
        job = {
          ...setResult(job, installmentId, {
            status: 'intent',
            attempts,
            postAttempted: true,
            lastHttpStatus: 429,
            lastError: emitted.message,
            seuNumero,
          }),
          lastError: emitted.message,
          rateLimitedUntil: new Date(params.ports.now() + backoff).toISOString(),
        };
        job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
        break;
      }
      if (kind === 'indeterminate') {
        job = setResult(job, installmentId, {
          status: 'intent',
          attempts,
          postAttempted: true,
          lastHttpStatus: httpStatus,
          lastError: emitted.message,
          seuNumero,
        });
        job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
        break;
      }
      const fail = attempts >= INTER_RESUME_MAX_ATTEMPTS || kind === 'fail';
      job = setResult(job, installmentId, {
        status: fail ? 'failed' : 'pending',
        attempts,
        postAttempted: true,
        lastHttpStatus: httpStatus,
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
      }
      job = await persistAndRenew({ store: params.store, job, owner, nowMs: params.ports.now() });
      if (!fail) break;
    }

    const remainingIds = job.plannedInstallmentIds.slice(job.cursorIndex);
    const nextStatus =
      remainingIds.length === 0
        ? job.failed > 0
          ? 'failed'
          : 'completed'
        : 'running';
    return persistJob(
      params.store,
      releaseInterResumeLease(syncProgress(job), params.ports.now(), nextStatus),
      job.revision,
    );
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
  return job;
}

export function createMemoryInterResumeStore(): InterResumeJobStore & {
  bundles: Map<string, InterResumeJobsBundle>;
} {
  const bundles = new Map<string, InterResumeJobsBundle>();
  const keyOf = (companyId: string, integrationId: string) => `${companyId}:${integrationId}`;
  return {
    bundles,
    async load(companyId, saleId) {
      const match = [...bundles.entries()].find(([k, bundle]) => {
        if (!k.startsWith(`${companyId}:`)) return false;
        return Boolean(bundle.jobs[saleId]);
      });
      if (match) return hydrateJobFromBundle(match[1], saleId);
      const any = [...bundles.entries()].find(([k]) => k.startsWith(`${companyId}:`));
      return any ? hydrateJobFromBundle(any[1], saleId) : null;
    },
    async save(job, expectedRevision) {
      const mapKey = keyOf(job.companyId, job.integrationId);
      const current = bundles.get(mapKey) || emptyInterResumeJobsBundle();
      const applied = casWriteInterResumeJob({
        bundle: current,
        expectedRev: expectedRevision,
        job,
      });
      if (!applied.ok) {
        return {
          ok: false,
          current: hydrateJobFromBundle(current, job.saleId),
          mapRev: current._rev,
        };
      }
      bundles.set(mapKey, applied.bundle);
      return {
        ok: true,
        current: hydrateJobFromBundle(applied.bundle, job.saleId),
        mapRev: applied.bundle._rev,
      };
    },
  };
}
