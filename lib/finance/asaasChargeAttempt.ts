/**
 * Reserva da cobrança Asaas antes da chamada externa.
 * A API não tem Idempotency-Key. externalReference só serve para achar a cobrança depois.
 * Timeout não autoriza um segundo POST enquanto a consulta não confirmar a ausência.
 */

export const ASAAS_CHARGE_ATTEMPT_LEASE_MS = 180_000;

export type AsaasChargeAttemptStatus = 'reserved' | 'unknown' | 'completed' | 'failed';

export type AsaasChargeAttemptRow = {
  status: AsaasChargeAttemptStatus;
  ownerToken: string;
  leaseUntilMs: number;
  asaasPaymentId: string | null;
  idempotencyKey: string;
};

export function buildAsaasChargeIdempotencyKey(companyId: string, installmentId: string): string {
  return `asaas-company:${String(companyId || '').trim()}:${String(installmentId || '').trim()}`;
}

export function isInconclusiveAsaasCreateError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  if (!message) return true;
  if (/http 5\d\d/.test(message)) return true;
  if (/timeout|timed out|network|fetch failed|econnreset|econnrefused|socket|aborted/.test(message)) {
    return true;
  }
  return false;
}

export type AsaasAttemptDecision =
  | { kind: 'insert' }
  | { kind: 'in_flight' }
  | { kind: 'reuse'; asaasPaymentId: string }
  | { kind: 'lookup_only' }
  | { kind: 'lookup_then_create' };

export function decideAsaasChargeAttempt(input: {
  existing: AsaasChargeAttemptRow | null;
  nowMs: number;
  ownerToken: string;
}): AsaasAttemptDecision {
  const existing = input.existing;
  if (!existing) return { kind: 'insert' };
  if (existing.status === 'unknown' || existing.status === 'completed') return { kind: 'lookup_only' };
  const leaseOpen = existing.leaseUntilMs > input.nowMs;
  const sameOwner = existing.ownerToken === input.ownerToken;
  if (existing.status === 'reserved' && leaseOpen && !sameOwner) return { kind: 'in_flight' };
  if (existing.status === 'reserved' || existing.status === 'failed') return { kind: 'lookup_then_create' };
  return { kind: 'lookup_only' };
}

export type GuardedAsaasCreatePorts<T> = {
  now: () => number;
  leaseMs: number;
  newOwnerToken: () => string;
  loadAttempt: () => Promise<AsaasChargeAttemptRow | null>;
  insertAttempt: (row: AsaasChargeAttemptRow) => Promise<'inserted' | 'conflict'>;
  stealAttempt: (ownerToken: string, leaseUntilMs: number) => Promise<boolean>;
  confirmOwner: (ownerToken: string) => Promise<boolean>;
  markUnknown: (ownerToken: string) => Promise<void>;
  markFailed: (ownerToken: string, message: string) => Promise<void>;
  markCompleted: (ownerToken: string, asaasPaymentId: string) => Promise<void>;
  findRemote: () => Promise<{ id: string } | null>;
  createRemote: () => Promise<{ id: string; result: T }>;
};

export class AsaasChargeAttemptInFlightError extends Error {
  constructor() {
    super('A emissão desta parcela já está em andamento. Aguarde a consulta do resultado antes de tentar de novo.');
    this.name = 'AsaasChargeAttemptInFlightError';
  }
}

export class AsaasChargeAttemptInconclusiveError extends Error {
  constructor() {
    super('A resposta do Asaas não chegou. Nenhuma segunda cobrança será criada até a consulta pela referência confirmar o resultado.');
    this.name = 'AsaasChargeAttemptInconclusiveError';
  }
}

async function resolveDecision<T>(
  ports: GuardedAsaasCreatePorts<T>,
  ownerToken: string,
): Promise<{ decision: AsaasAttemptDecision; ownerToken: string }> {
  const nowMs = ports.now();
  const existing = await ports.loadAttempt();
  const decision = decideAsaasChargeAttempt({ existing, nowMs, ownerToken });
  if (decision.kind !== 'insert') return { decision, ownerToken };
  const inserted = await ports.insertAttempt({
    status: 'reserved',
    ownerToken,
    leaseUntilMs: nowMs + ports.leaseMs,
    asaasPaymentId: null,
    idempotencyKey: '',
  });
  if (inserted === 'inserted') return { decision: { kind: 'lookup_then_create' }, ownerToken };
  const afterConflict = await ports.loadAttempt();
  return {
    decision: decideAsaasChargeAttempt({
      existing: afterConflict,
      nowMs: ports.now(),
      ownerToken,
    }),
    ownerToken,
  };
}

export async function runGuardedAsaasCreate<T>(
  ports: GuardedAsaasCreatePorts<T>,
): Promise<{ kind: 'created' | 'reused'; asaasPaymentId: string; result: T | null }> {
  const ownerToken = ports.newOwnerToken();
  const first = await resolveDecision(ports, ownerToken);
  if (first.decision.kind === 'in_flight') throw new AsaasChargeAttemptInFlightError();
  if (first.decision.kind === 'reuse') {
    return { kind: 'reused', asaasPaymentId: first.decision.asaasPaymentId, result: null };
  }

  if (first.decision.kind === 'lookup_only') {
    const found = await findRemoteWithoutPost(ports);
    if (found?.id) {
      await ports.markCompleted(ownerToken, found.id);
      return { kind: 'reused', asaasPaymentId: found.id, result: null };
    }
    throw new AsaasChargeAttemptInconclusiveError();
  }

  const existing = await ports.loadAttempt();
  const ownsReserved = existing?.ownerToken === ownerToken && existing.status === 'reserved';
  if (!ownsReserved) {
    if (existing?.status === 'unknown' || existing?.status === 'completed') {
      throw new AsaasChargeAttemptInconclusiveError();
    }
    const stolen = await ports.stealAttempt(ownerToken, ports.now() + ports.leaseMs);
    if (!stolen) throw new AsaasChargeAttemptInFlightError();
  }

  const found = await findRemoteWithoutPost(ports);
  if (found?.id) {
    await ports.markCompleted(ownerToken, found.id);
    return { kind: 'reused', asaasPaymentId: found.id, result: null };
  }

  if (!(await ports.confirmOwner(ownerToken))) throw new AsaasChargeAttemptInFlightError();
  await ports.markUnknown(ownerToken);

  try {
    const created = await ports.createRemote();
    const paymentId = String(created.id || '').trim();
    if (!paymentId) throw new Error('Asaas Company não retornou payment id.');
    await ports.markCompleted(ownerToken, paymentId);
    return { kind: 'created', asaasPaymentId: paymentId, result: created.result };
  } catch (error) {
    let recovered: { id: string } | null = null;
    let lookupFailed = false;
    try {
      recovered = await ports.findRemote();
    } catch {
      lookupFailed = true;
    }
    if (recovered?.id) {
      await ports.markCompleted(ownerToken, recovered.id);
      return { kind: 'reused', asaasPaymentId: recovered.id, result: null };
    }
    if (!lookupFailed && !isInconclusiveAsaasCreateError(error)) {
      await ports.markFailed(ownerToken, error instanceof Error ? error.message : 'falha na criação');
      throw error;
    }
    throw new AsaasChargeAttemptInconclusiveError();
  }
}

async function findRemoteWithoutPost<T>(
  ports: GuardedAsaasCreatePorts<T>,
): Promise<{ id: string } | null> {
  try {
    return await ports.findRemote();
  } catch {
    throw new AsaasChargeAttemptInconclusiveError();
  }
}
