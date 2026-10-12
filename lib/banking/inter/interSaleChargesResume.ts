/**
 * Domínio da retomada de cobranças Inter — sem I/O.
 * Emissão e artefatos são fases distintas; lote pequeno; 429 com backoff compartilhado.
 */

import { isInterResumeLiveEmitFlagEnabled } from '@/lib/banking/inter/interResumeLiveEmitFlag';

export const INTER_RESUME_BATCH_SIZE = 5;
export const INTER_RESUME_POSTS_PER_MINUTE = 10;
/** Cobre maxDuration=60s da rota/cron + folga para renew. */
export const INTER_RESUME_LEASE_MS = 75_000;
export const INTER_RESUME_MAX_ATTEMPTS = 5;
export const INTER_RESUME_MIN_SPACING_MS = Math.ceil(
  60_000 / INTER_RESUME_POSTS_PER_MINUTE,
);
export const INTER_RESUME_DEFAULT_429_MS = 60_000;
export const INTER_RESUME_JOBS_METADATA_KEY = 'inter_sale_charge_jobs';
export const INTER_RESUME_JOBS_REV_KEY = '_rev';
export const INTER_RESUME_JOBS_RATE_KEY = '_rate';
export const INTER_RESUME_CAS_RPC = 'cas_inter_resume_jobs';

export const INTER_RESUME_ACTIVE_STATUSES = new Set([
  'PENDING',
  'REGISTERED',
  'OVERDUE',
  'PAID',
]);

export const INTER_RESUME_TERMINAL_STATUSES = new Set([
  'emitted',
  'reused',
  'skipped_paid',
  'reconciled',
  'failed',
  'manual_reconcile',
]);

export type InterResumeJobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export type InterResumeInstallmentStatus =
  | 'pending'
  | 'intent'
  | 'emitted'
  | 'reused'
  | 'skipped_paid'
  | 'failed'
  | 'reconciled'
  | 'manual_reconcile';

export type InterResumeInstallmentResult = {
  status: InterResumeInstallmentStatus;
  attempts: number;
  lastError?: string | null;
  codigoSolicitacao?: string | null;
  seuNumero?: string | null;
  lastHttpStatus?: number | null;
  postAttempted?: boolean;
  intentAt?: string | null;
};

export type InterResumeSharedRate = {
  lastPostAt: string | null;
  rateLimitedUntil: string | null;
};

export type InterResumeJobsBundle = {
  _rev: number;
  _rate: InterResumeSharedRate;
  jobs: Record<string, InterSaleChargesResumeJob>;
};

export type InterSaleChargesResumeJob = {
  id: string;
  revision: number;
  companyId: string;
  saleId: string;
  integrationId: string;
  financialAccountId: string | null;
  status: InterResumeJobStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  leaseOwner: string | null;
  leaseUntil: string | null;
  cursorIndex: number;
  plannedInstallmentIds: string[];
  emitted: number;
  reused: number;
  skippedPaid: number;
  failed: number;
  remaining: number;
  lastError: string | null;
  rateLimitedUntil: string | null;
  lastPostAt: string | null;
  installmentResults: Record<string, InterResumeInstallmentResult>;
  mode: 'simulate' | 'live' | 'deferred';
};

export type InterResumeExistingCharge = {
  id?: string | null;
  status?: string | null;
  external_id?: string | null;
  finance_receipt_id?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function buildInterSeuNumero(
  installmentNumber: number | string | null | undefined,
  installmentId: string,
): string {
  const digits = `${String(installmentNumber ?? '')}${String(installmentId || '').replace(/-/g, '')}`.replace(
    /\D/g,
    '',
  );
  return digits.slice(-15) || String(installmentId || '').replace(/-/g, '').slice(0, 15);
}

export function isInterResumeLeaseExpired(
  job: Pick<InterSaleChargesResumeJob, 'leaseUntil'> | null | undefined,
  nowMs: number,
): boolean {
  if (!job?.leaseUntil) return true;
  const until = Date.parse(job.leaseUntil);
  if (!Number.isFinite(until)) return true;
  return until <= nowMs;
}

export function canAcquireInterResumeLease(params: {
  job: InterSaleChargesResumeJob;
  owner: string;
  nowMs: number;
}): boolean {
  if (params.job.status === 'paused' || params.job.status === 'completed') {
    return false;
  }
  if (!params.job.leaseOwner || isInterResumeLeaseExpired(params.job, params.nowMs)) {
    return true;
  }
  return params.job.leaseOwner === params.owner;
}

export function applyInterResumeLease(
  job: InterSaleChargesResumeJob,
  owner: string,
  nowMs: number,
  leaseMs = INTER_RESUME_LEASE_MS,
): InterSaleChargesResumeJob {
  return {
    ...job,
    status: job.status === 'queued' ? 'running' : job.status,
    leaseOwner: owner,
    leaseUntil: new Date(nowMs + leaseMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };
}

export function releaseInterResumeLease(
  job: InterSaleChargesResumeJob,
  nowMs: number,
  nextStatus?: InterResumeJobStatus,
): InterSaleChargesResumeJob {
  const remaining = Math.max(0, job.plannedInstallmentIds.length - job.cursorIndex);
  const status =
    nextStatus ||
    (remaining <= 0 && job.failed === 0
      ? 'completed'
      : remaining <= 0 && job.failed > 0
        ? 'failed'
        : job.status);
  return {
    ...job,
    status,
    remaining,
    leaseOwner: null,
    leaseUntil: null,
    updatedAt: new Date(nowMs).toISOString(),
  };
}

export function planInterResumeBatch(
  job: InterSaleChargesResumeJob,
  batchSize: number = INTER_RESUME_BATCH_SIZE,
): string[] {
  if (job.status === 'paused' || job.status === 'completed') return [];
  const size = Math.max(1, Math.floor(batchSize));
  return job.plannedInstallmentIds.slice(job.cursorIndex, job.cursorIndex + size);
}

export function shouldSkipDuplicateInterCharge(
  charge: InterResumeExistingCharge | null | undefined,
): boolean {
  if (!charge) return false;
  const status = String(charge.status || '').toUpperCase();
  if (status === 'PAID') return true;
  if (!INTER_RESUME_ACTIVE_STATUSES.has(status)) return false;
  return Boolean(String(charge.external_id || '').trim());
}

export function canPersistInterResumeChargeStatus(params: {
  currentStatus?: string | null;
  nextStatus: string;
}): boolean {
  const current = String(params.currentStatus || '').toUpperCase();
  if (current === 'PAID') return false;
  return true;
}

export function classifyInterResumeHttpError(
  status: number,
): 'retry_post' | 'indeterminate' | 'fail' {
  if (status === 429) return 'retry_post';
  if (status === 408 || status >= 500) return 'indeterminate';
  return 'fail';
}

export function interResumeBackoffMs(params: {
  attempt: number;
  httpStatus?: number | null;
  retryAfterMs?: number | null;
}): number {
  if (params.retryAfterMs && params.retryAfterMs > 0) {
    return Math.min(120_000, Math.floor(params.retryAfterMs));
  }
  if (params.httpStatus === 429) return INTER_RESUME_DEFAULT_429_MS;
  const attempt = Math.max(1, params.attempt);
  return Math.min(60_000, 400 * 2 ** (attempt - 1));
}

export function parseRetryAfterMs(raw: string | null | undefined, nowMs: number): number | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.floor(seconds * 1000);
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - nowMs);
  return null;
}

export function nextPostSpacingMs(lastPostAt: string | null | undefined, nowMs: number): number {
  if (!lastPostAt) return 0;
  const last = Date.parse(lastPostAt);
  if (!Number.isFinite(last)) return 0;
  const elapsed = nowMs - last;
  return Math.max(0, INTER_RESUME_MIN_SPACING_MS - elapsed);
}

export function laterTimestamp(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  const aMs = a ? Date.parse(a) : NaN;
  const bMs = b ? Date.parse(b) : NaN;
  const aOk = Number.isFinite(aMs);
  const bOk = Number.isFinite(bMs);
  if (aOk && bOk) return aMs >= bMs ? String(a) : String(b);
  if (aOk) return String(a);
  if (bOk) return String(b);
  return null;
}

export function countInterResumeProgress(job: InterSaleChargesResumeJob): {
  emitted: number;
  reused: number;
  skippedPaid: number;
  failed: number;
  remaining: number;
} {
  let emitted = 0;
  let reused = 0;
  let skippedPaid = 0;
  let failed = 0;
  for (const item of Object.values(job.installmentResults || {})) {
    if (item.status === 'emitted' || item.status === 'reconciled') emitted += 1;
    else if (item.status === 'reused') reused += 1;
    else if (item.status === 'skipped_paid') skippedPaid += 1;
    else if (item.status === 'failed' || item.status === 'manual_reconcile') failed += 1;
  }
  const done = emitted + reused + skippedPaid + failed;
  return {
    emitted,
    reused,
    skippedPaid,
    failed,
    remaining: Math.max(0, job.plannedInstallmentIds.length - done),
  };
}

export function createInterResumeJob(input: {
  id: string;
  companyId: string;
  saleId: string;
  integrationId: string;
  financialAccountId?: string | null;
  createdBy?: string | null;
  plannedInstallmentIds: string[];
  nowMs: number;
  mode: 'simulate' | 'live' | 'deferred';
}): InterSaleChargesResumeJob {
  const now = new Date(input.nowMs).toISOString();
  const ids = [...new Set(input.plannedInstallmentIds.filter(Boolean))];
  return {
    id: input.id,
    revision: 0,
    companyId: input.companyId,
    saleId: input.saleId,
    integrationId: input.integrationId,
    financialAccountId: input.financialAccountId || null,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy || null,
    leaseOwner: null,
    leaseUntil: null,
    cursorIndex: 0,
    plannedInstallmentIds: ids,
    emitted: 0,
    reused: 0,
    skippedPaid: 0,
    failed: 0,
    remaining: ids.length,
    lastError: null,
    rateLimitedUntil: null,
    lastPostAt: null,
    installmentResults: {},
    mode: input.mode,
  };
}

export function isInterResumeRateLimited(
  job: Pick<InterSaleChargesResumeJob, 'rateLimitedUntil'> | InterResumeSharedRate,
  nowMs: number,
): boolean {
  if (!job.rateLimitedUntil) return false;
  const until = Date.parse(job.rateLimitedUntil);
  return Number.isFinite(until) && until > nowMs;
}

export function emptyInterResumeJobsBundle(): InterResumeJobsBundle {
  return {
    _rev: 0,
    _rate: { lastPostAt: null, rateLimitedUntil: null },
    jobs: {},
  };
}

export function parseInterResumeJobsBundle(raw: unknown): InterResumeJobsBundle {
  const rec = asRecord(raw);
  const rev = Number(rec[INTER_RESUME_JOBS_REV_KEY] || 0);
  const rateRec = asRecord(rec[INTER_RESUME_JOBS_RATE_KEY]);
  const jobs: Record<string, InterSaleChargesResumeJob> = {};
  for (const [key, value] of Object.entries(rec)) {
    if (key === INTER_RESUME_JOBS_REV_KEY || key === INTER_RESUME_JOBS_RATE_KEY) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    jobs[key] = value as InterSaleChargesResumeJob;
  }
  return {
    _rev: Number.isFinite(rev) ? rev : 0,
    _rate: {
      lastPostAt: rateRec.lastPostAt ? String(rateRec.lastPostAt) : null,
      rateLimitedUntil: rateRec.rateLimitedUntil ? String(rateRec.rateLimitedUntil) : null,
    },
    jobs,
  };
}

export function serializeInterResumeJobsBundle(
  bundle: InterResumeJobsBundle,
): Record<string, unknown> {
  return {
    [INTER_RESUME_JOBS_REV_KEY]: bundle._rev,
    [INTER_RESUME_JOBS_RATE_KEY]: bundle._rate,
    ...bundle.jobs,
  };
}

export function hydrateJobFromBundle(
  bundle: InterResumeJobsBundle,
  saleId: string,
): InterSaleChargesResumeJob | null {
  const job = bundle.jobs[saleId];
  if (!job) return null;
  return {
    ...job,
    revision: bundle._rev,
    lastPostAt: bundle._rate.lastPostAt,
    rateLimitedUntil: bundle._rate.rateLimitedUntil,
  };
}

/**
 * CAS puro do mapa de jobs. Dois writers com o mesmo expectedRev: só o primeiro aplica.
 */
export function casWriteInterResumeJob(params: {
  bundle: InterResumeJobsBundle;
  expectedRev: number;
  job: InterSaleChargesResumeJob;
  rate?: Partial<InterResumeSharedRate>;
}): { ok: true; bundle: InterResumeJobsBundle } | { ok: false; bundle: InterResumeJobsBundle } {
  if (params.bundle._rev !== params.expectedRev) {
    return { ok: false, bundle: params.bundle };
  }
  const rate: InterResumeSharedRate = {
    lastPostAt:
      params.rate?.lastPostAt !== undefined
        ? params.rate.lastPostAt
        : laterTimestamp(params.job.lastPostAt, params.bundle._rate.lastPostAt),
    rateLimitedUntil:
      params.rate?.rateLimitedUntil !== undefined
        ? laterTimestamp(params.rate.rateLimitedUntil, params.bundle._rate.rateLimitedUntil)
        : laterTimestamp(params.job.rateLimitedUntil, params.bundle._rate.rateLimitedUntil),
  };
  const nextRev = params.expectedRev + 1;
  const nextJob: InterSaleChargesResumeJob = {
    ...params.job,
    revision: nextRev,
    lastPostAt: rate.lastPostAt,
    rateLimitedUntil: rate.rateLimitedUntil,
  };
  return {
    ok: true,
    bundle: {
      _rev: nextRev,
      _rate: rate,
      jobs: { ...params.bundle.jobs, [params.job.saleId]: nextJob },
    },
  };
}

export function canRetryInterResumePost(
  result: InterResumeInstallmentResult | null | undefined,
): boolean {
  if (!result) return true;
  if (INTER_RESUME_TERMINAL_STATUSES.has(result.status)) return false;
  if (result.lastHttpStatus === 429) return true;
  if (result.status === 'pending' && !result.postAttempted && !result.seuNumero) return true;
  return false;
}

export function mustReconcileBeforeInterResumePost(
  result: InterResumeInstallmentResult | null | undefined,
): boolean {
  if (!result) return false;
  if (result.status === 'manual_reconcile') return false;
  if (result.status === 'intent') return result.lastHttpStatus !== 429;
  if (result.postAttempted && result.lastHttpStatus !== 429) return true;
  if (result.seuNumero && result.lastHttpStatus !== 429 && result.status === 'pending') return true;
  return false;
}

export function resolveInterChargeEnvironment(params: {
  mode: 'simulate' | 'live' | 'deferred';
  bankEnvironment?: string | null;
}): 'SANDBOX' | 'PRODUCTION' {
  if (params.mode !== 'live') return 'SANDBOX';
  return String(params.bankEnvironment || '').toUpperCase() === 'PRODUCTION'
    ? 'PRODUCTION'
    : 'SANDBOX';
}

export function resolveInterResumeEmitMode(params: {
  vercelEnv?: string | null;
  isProductionSupabase?: boolean;
  isDevelopHomolog?: boolean;
  bankEnvironment?: string | null;
  liveEmitFlag?: boolean;
}): 'simulate' | 'deferred' | 'live' {
  const flag =
    params.liveEmitFlag !== undefined
      ? params.liveEmitFlag
      : isInterResumeLiveEmitFlagEnabled();
  if (params.isDevelopHomolog) return 'simulate';
  const vercel = String(params.vercelEnv || '').toLowerCase();
  if (vercel === 'preview' || vercel === 'development') return 'simulate';
  const productionRuntime = Boolean(params.isProductionSupabase) || vercel === 'production';
  if (productionRuntime) {
    const bank = String(params.bankEnvironment || '').toUpperCase();
    if (flag && bank === 'PRODUCTION') return 'live';
    return 'deferred';
  }
  const bank = String(params.bankEnvironment || '').toUpperCase();
  if (bank === 'SANDBOX') return 'simulate';
  return 'simulate';
}

export function interResumePublicView(job: InterSaleChargesResumeJob | null) {
  if (!job) return null;
  const progress = countInterResumeProgress(job);
  const manual = Object.values(job.installmentResults || {}).filter(
    (item) => item.status === 'manual_reconcile',
  ).length;
  return {
    id: job.id,
    saleId: job.saleId,
    status: job.status,
    emitted: progress.emitted,
    reused: progress.reused,
    skippedPaid: progress.skippedPaid,
    failed: progress.failed,
    remaining: progress.remaining,
    planned: job.plannedInstallmentIds.length,
    cursorIndex: job.cursorIndex,
    lastError: job.lastError,
    rateLimitedUntil: job.rateLimitedUntil,
    updatedAt: job.updatedAt,
    mode: job.mode,
    manualReconcile: manual,
  };
}
