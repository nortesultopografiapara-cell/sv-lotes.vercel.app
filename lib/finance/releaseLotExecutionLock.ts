/**
 * Trava de execução da liberação de lote (anti-concorrência).
 * Sem migration: usa calculation_snapshot._execLock + CAS em updated_at.
 * TTL cobre o caso do runtime morrer sem finally (timeout 60s).
 */

export const RELEASE_IN_PROGRESS_CODE = 'RELEASE_IN_PROGRESS';
export const RELEASE_IN_PROGRESS_STATUS = 409;
export const RELEASE_EXEC_LOCK_TTL_MS = 70_000;
export const RELEASE_EXEC_LOCK_KEY = '_execLock';

export type ReleaseExecLock = {
  token: string;
  until: string;
  ownerUserId: string;
};

export function readReleaseExecLock(snapshot: unknown): ReleaseExecLock | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const raw = (snapshot as Record<string, unknown>)[RELEASE_EXEC_LOCK_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const token = String(rec.token || '').trim();
  const until = String(rec.until || '').trim();
  const ownerUserId = String(rec.ownerUserId || '').trim();
  if (!token || !until) return null;
  return { token, until, ownerUserId };
}

export function isReleaseExecLockHeld(
  lock: ReleaseExecLock | null,
  nowMs: number,
  ourToken?: string | null,
): boolean {
  if (!lock) return false;
  const untilMs = Date.parse(lock.until);
  if (!Number.isFinite(untilMs) || untilMs <= nowMs) return false;
  if (ourToken && lock.token === ourToken) return false;
  return true;
}

export function buildReleaseExecLock(params: {
  token: string;
  ownerUserId: string;
  nowMs: number;
  ttlMs?: number;
}): ReleaseExecLock {
  const ttlMs = params.ttlMs ?? RELEASE_EXEC_LOCK_TTL_MS;
  return {
    token: params.token,
    ownerUserId: params.ownerUserId,
    until: new Date(params.nowMs + ttlMs).toISOString(),
  };
}

export function withReleaseExecLock(
  snapshot: Record<string, unknown>,
  lock: ReleaseExecLock,
): Record<string, unknown> {
  return { ...snapshot, [RELEASE_EXEC_LOCK_KEY]: lock };
}

export function withoutReleaseExecLock(
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...snapshot };
  delete next[RELEASE_EXEC_LOCK_KEY];
  return next;
}

export function releaseInProgressMessage(): string {
  return (
    'Outra liberação desta venda já está em andamento. Aguarde a conclusão ' +
    'e tente novamente. O lote NÃO foi alterado por esta tentativa.'
  );
}
