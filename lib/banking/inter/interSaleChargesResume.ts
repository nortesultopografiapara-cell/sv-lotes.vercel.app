/**
 * Domínio da retomada de cobranças Inter — sem I/O.
 * Emissão e artefatos são fases distintas; lote pequeno; 429 com backoff.
 */

export const INTER_RESUME_BATCH_SIZE = 5;
export const INTER_RESUME_POSTS_PER_MINUTE = 10;
export const INTER_RESUME_LEASE_MS = 45_000;
export const INTER_RESUME_MAX_ATTEMPTS = 5;
export const INTER_RESUME_MIN_SPACING_MS = Math.ceil(
  60_000 / INTER_RESUME_POSTS_PER_MINUTE,
);
export const INTER_RESUME_DEFAULT_429_MS = 60_000;
export const INTER_RESUME_JOBS_METADATA_KEY = 'inter_sale_charge_jobs';

export const INTER_RESUME_ACTIVE_STATUSES = new Set([
  'PENDING',
  'REGISTERED',
  'OVERDUE',
  'PAID',
]);

export type InterResumeJobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export type InterResumeInstallmentStatus =
  | 'pending'
  | 'emitted'
  | 'reused'
  | 'skipped_paid'
  | 'failed'
  | 'reconciled';

export type InterResumeInstallmentResult = {
  status: InterResumeInstallmentStatus;
  attempts: number;
  lastError?: string | null;
  codigoSolicitacao?: string | null;
  seuNumero?: string | null;
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
  mode: 'simulate' | 'live';
};

export type InterResumeExistingCharge = {
  id?: string | null;
  status?: string | null;
  external_id?: string | null;
  finance_receipt_id?: string | null;
};

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
    revision: job.revision + 1,
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
    revision: job.revision + 1,
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
  return Boolean(String(charge.external_id || '').trim() || charge.id);
}

export function canPersistInterResumeChargeStatus(params: {
  currentStatus?: string | null;
  nextStatus: string;
}): boolean {
  const current = String(params.currentStatus || '').toUpperCase();
  if (current === 'PAID') return false;
  return true;
}

export function classifyInterResumeHttpError(status: number): 'retry' | 'fail' {
  if (status === 429 || status === 408 || status >= 500) return 'retry';
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
    else if (item.status === 'failed') failed += 1;
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
  mode: 'simulate' | 'live';
}): InterSaleChargesResumeJob {
  const now = new Date(input.nowMs).toISOString();
  const ids = [...new Set(input.plannedInstallmentIds.filter(Boolean))];
  return {
    id: input.id,
    revision: 1,
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
  job: Pick<InterSaleChargesResumeJob, 'rateLimitedUntil'>,
  nowMs: number,
): boolean {
  if (!job.rateLimitedUntil) return false;
  const until = Date.parse(job.rateLimitedUntil);
  return Number.isFinite(until) && until > nowMs;
}

export function resolveInterResumeEmitMode(params: {
  vercelEnv?: string | null;
  isProductionSupabase?: boolean;
  isDevelopHomolog?: boolean;
  bankEnvironment?: string | null;
}): 'simulate' | 'blocked' | 'live' {
  if (params.isProductionSupabase) return 'blocked';
  if (params.isDevelopHomolog) return 'simulate';
  const vercel = String(params.vercelEnv || '').toLowerCase();
  if (vercel === 'preview' || vercel === 'development') return 'simulate';
  const bank = String(params.bankEnvironment || '').toUpperCase();
  if (bank === 'SANDBOX') return 'live';
  if (vercel === 'production' && bank === 'PRODUCTION') return 'blocked';
  return 'simulate';
}

export function interResumePublicView(job: InterSaleChargesResumeJob | null) {
  if (!job) return null;
  const progress = countInterResumeProgress(job);
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
  };
}
