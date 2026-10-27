/**
 * Idempotência transacional C6 B_01.
 * Espelha supabase/migrations/20261026200000_c6_homolog_idempotency.sql
 * UNKNOWN nunca é retry seguro.
 */

import { createHash } from 'node:crypto';
import { C6_BOLETO_EXTERNAL_REFERENCE_PATTERN } from '@/lib/banking/c6/c6BoletoOpenApi';

export const C6_HOMOLOG_IDEMPOTENCY_STATUSES = [
  'RESERVED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'UNKNOWN',
] as const;

export type C6HomologIdempotencyStatus = (typeof C6_HOMOLOG_IDEMPOTENCY_STATUSES)[number];

export type C6HomologReserveReason =
  | 'acquired'
  | 'in_flight'
  | 'already_succeeded'
  | 'needs_reconciliation'
  | 'needs_bank_confirmation'
  | 'production_blocked'
  | 'integration_mismatch'
  | 'invalid_reference'
  | 'invalid_fingerprint'
  | 'payload_mismatch'
  | 'invalid_transition'
  | 'invalid_confirmation';

export const C6_B01_RECONCILE_PHRASE = 'RECONCILIAR_B01_SANDBOX';
/** 15s do cliente HTTP + 5s de margem. Igual ao interval '20 seconds' do SQL. */
export const C6_HOMOLOG_STALE_IN_FLIGHT_MS = 20_000;
export const C6_HOMOLOG_RESERVE_RPC = 'reserve_c6_homolog_idempotency';
export const C6_HOMOLOG_PROCESSING_RPC = 'mark_c6_homolog_idempotency_processing';
export const C6_HOMOLOG_COMPLETE_RPC = 'complete_c6_homolog_idempotency';
export const C6_HOMOLOG_RECONCILE_RPC = 'reconcile_c6_homolog_idempotency';
export const C6_HOMOLOG_TABLE = 'c6_homolog_idempotency';

export type C6HomologKey = {
  companyId: string;
  integrationId: string;
  externalReferenceId: string;
};

export type C6HomologIdempotencyRow = C6HomologKey & {
  id: string;
  environment: 'SANDBOX';
  scenario: string;
  status: C6HomologIdempotencyStatus;
  attemptCount: number;
  requestFingerprint: string | null;
  lastHttpStatus: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  c6BankSlipId: string | null;
  lastAttemptAt: string;
  processingAt: string | null;
  completedAt: string | null;
};

export type C6HomologReserveResult = {
  acquired: boolean;
  reason: C6HomologReserveReason;
  row: C6HomologIdempotencyRow | null;
};

export type C6HomologIntegrationRef = {
  companyId: string;
  integrationId: string;
  provider: string;
  environment: string;
};

export type C6HomologReserveInput = C6HomologKey & {
  environment: string;
  scenario?: string;
  requestFingerprint?: string | null;
  createdBy?: string | null;
  now?: Date;
};

export type C6HomologCompleteInput = C6HomologKey & {
  status: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  attemptCount: number;
  httpStatus?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  c6BankSlipId?: string | null;
  now?: Date;
};

export type C6HomologMarkProcessingInput = C6HomologKey & {
  attemptCount: number;
  now?: Date;
};

export type C6HomologReconcileInput = C6HomologKey & {
  confirmation: string;
  operatorNote?: string | null;
  now?: Date;
};

export type C6HomologIdempotencyAdapter = {
  reserve(input: C6HomologReserveInput): Promise<C6HomologReserveResult>;
  markProcessing(input: C6HomologMarkProcessingInput): Promise<C6HomologReserveResult>;
  complete(input: C6HomologCompleteInput): Promise<C6HomologReserveResult>;
  get(key: C6HomologKey): Promise<C6HomologIdempotencyRow | null>;
  reconcile(input: C6HomologReconcileInput): Promise<C6HomologReserveResult>;
};

export class C6HomologIdempotencyError extends Error {
  readonly reason: C6HomologReserveReason;
  readonly row: C6HomologIdempotencyRow | null;

  constructor(reason: C6HomologReserveReason, message: string, row: C6HomologIdempotencyRow | null = null) {
    super(message);
    this.name = 'C6HomologIdempotencyError';
    this.reason = reason;
    this.row = row;
  }
}

export function c6HomologKey(input: C6HomologKey): string {
  return `${String(input.companyId || '').trim()}::${String(input.integrationId || '').trim()}::${String(input.externalReferenceId || '').trim()}`;
}

export function buildC6HomologRequestFingerprint(input: {
  companyId: string;
  integrationId: string;
  externalReferenceId: string;
  amount: number;
  dueDate: string;
  billingScheme: string;
  extras?: string;
}): string {
  const canonical = [
    String(input.companyId || '').trim(),
    String(input.integrationId || '').trim(),
    String(input.externalReferenceId || '').trim(),
    String(input.amount),
    String(input.dueDate || '').trim(),
    String(input.billingScheme || '').trim(),
    String(input.extras || '').trim(),
  ]
    .filter((part, index) => index < 6 || part.length > 0)
    .join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

export const C6_HOMOLOG_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

export function isValidC6HomologFingerprint(value: string | null | undefined): boolean {
  return C6_HOMOLOG_FINGERPRINT_PATTERN.test(String(value || '').trim().toLowerCase());
}

export function sanitizeC6HomologErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  const redacted = String(message)
    .replace(/(access_token|client_secret)\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(access_token|client_secret|BEGIN [A-Z ]*PRIVATE KEY|BEGIN CERTIFICATE)/gi, '[redacted]')
    .replace(/\d{11,14}/g, '[id-redacted]');
  return redacted.slice(0, 240);
}

export function classifyC6HomologHttpOutcome(input: {
  httpStatus: number | null;
  transport?: 'ok' | 'TIMEOUT' | 'NETWORK' | 'UNEXPECTED';
}): C6HomologCompleteInput['status'] {
  if (input.transport === 'TIMEOUT' || input.transport === 'NETWORK') return 'UNKNOWN';
  const status = input.httpStatus;
  if (status == null) return 'UNKNOWN';
  if (status === 201) return 'SUCCEEDED';
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
    return 'FAILED';
  }
  return 'UNKNOWN';
}

export function classifyC6HomologExecuteError(err: unknown): {
  status: C6HomologCompleteInput['status'];
  httpStatus: number | null;
  errorCode: string;
  errorMessage: string;
} {
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code || '') : '';
  if (code === 'TIMEOUT' || code === 'NETWORK') {
    return {
      status: 'UNKNOWN',
      httpStatus: null,
      errorCode: code,
      errorMessage: err instanceof Error ? err.message : 'Falha de transporte ao C6.',
    };
  }
  if (err instanceof Error) {
    return {
      status: 'FAILED',
      httpStatus: null,
      errorCode: err.name,
      errorMessage: err.message,
    };
  }
  return {
    status: 'UNKNOWN',
    httpStatus: null,
    errorCode: 'UNEXPECTED',
    errorMessage: 'Falha desconhecida na emissão C6.',
  };
}

export function assertC6HomologRetryAllowed(row: C6HomologIdempotencyRow | null): void {
  if (!row) return;
  if (row.status === 'FAILED') return;
  if (row.status === 'UNKNOWN') {
    throw new C6HomologIdempotencyError(
      'needs_reconciliation',
      'Resultado desconhecido. Reconcilie o boleto no C6 antes de nova tentativa.',
      row,
    );
  }
  if (row.status === 'SUCCEEDED') {
    throw new C6HomologIdempotencyError(
      'already_succeeded',
      'external_reference_id já emitido com sucesso para esta empresa/integração.',
      row,
    );
  }
  throw new C6HomologIdempotencyError(
    'in_flight',
    'Há uma reserva ou emissão em andamento para esta referência.',
    row,
  );
}

function rejectReasonMessage(reason: C6HomologReserveReason): string {
  switch (reason) {
    case 'already_succeeded':
      return 'external_reference_id já emitido com sucesso para esta empresa/integração.';
    case 'needs_reconciliation':
      return 'Resultado desconhecido. Reconcilie o boleto no C6 antes de nova tentativa.';
    case 'in_flight':
      return 'Há uma reserva ou emissão em andamento para esta referência.';
    case 'production_blocked':
      return 'B_01 de homologação usa somente Sandbox. Production está bloqueada.';
    case 'integration_mismatch':
      return 'Integração C6 Sandbox não vinculada à empresa autorizada.';
    case 'invalid_reference':
      return 'external_reference_id inválido.';
    case 'invalid_confirmation':
      return `Confirmação de reconciliação ausente. Envie exatamente ${C6_B01_RECONCILE_PHRASE}.`;
    case 'invalid_fingerprint':
      return 'Reserva C6 exige fingerprint SHA-256 válido e imutável.';
    case 'payload_mismatch':
      return 'external_reference_id já existe com payload diferente. Nova emissão exige nova referência.';
    case 'needs_bank_confirmation':
      return 'UNKNOWN permanece bloqueado. JSON do cliente e HTTP 404 isolado não comprovam o boleto no C6.';
    default:
      return 'Transição de idempotência C6 inválida.';
  }
}

export function throwIfC6HomologNotAcquired(result: C6HomologReserveResult): C6HomologIdempotencyRow {
  if (result.acquired && result.row) return result.row;
  throw new C6HomologIdempotencyError(
    result.reason,
    rejectReasonMessage(result.reason),
    result.row,
  );
}

function nowIso(now?: Date): string {
  return (now || new Date()).toISOString();
}

function cloneRow(row: C6HomologIdempotencyRow): C6HomologIdempotencyRow {
  return { ...row };
}

type MemoryIntegration = C6HomologIntegrationRef;

export function createMemoryC6HomologIdempotencyStore(
  integrations: C6HomologIntegrationRef[] = [],
): C6HomologIdempotencyAdapter & {
  registerIntegration(integration: C6HomologIntegrationRef): void;
  snapshot(): C6HomologIdempotencyRow[];
} {
  const rows = new Map<string, C6HomologIdempotencyRow>();
  const known = new Map<string, MemoryIntegration>();
  const locks = new Map<string, Promise<void>>();

  for (const item of integrations) {
    known.set(`${item.companyId}::${item.integrationId}`, item);
  }

  async function withLock<T>(key: string, fn: () => T | Promise<T>): Promise<T> {
    const previous = locks.get(key) || Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(
      key,
      previous.then(() => gate),
    );
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  function integrationOk(companyId: string, integrationId: string): boolean {
    const item = known.get(`${companyId}::${integrationId}`);
    if (!item) return false;
    return (
      item.companyId === companyId &&
      String(item.provider || '').toUpperCase() === 'C6' &&
      String(item.environment || '').toUpperCase() === 'SANDBOX'
    );
  }

  return {
    registerIntegration(integration) {
      known.set(`${integration.companyId}::${integration.integrationId}`, integration);
    },
    snapshot() {
      return [...rows.values()].map(cloneRow);
    },
    async get(key) {
      const row = rows.get(c6HomologKey(key));
      return row ? cloneRow(row) : null;
    },
    async reserve(input) {
      const key = c6HomologKey(input);
      return withLock(key, () => {
        if (String(input.environment || '').trim().toUpperCase() !== 'SANDBOX') {
          return { acquired: false, reason: 'production_blocked' as const, row: null };
        }
        if (!C6_BOLETO_EXTERNAL_REFERENCE_PATTERN.test(String(input.externalReferenceId || ''))) {
          return { acquired: false, reason: 'invalid_reference' as const, row: null };
        }
        const fingerprint = String(input.requestFingerprint || '').trim().toLowerCase();
        if (!isValidC6HomologFingerprint(fingerprint)) {
          return { acquired: false, reason: 'invalid_fingerprint' as const, row: null };
        }
        if (!integrationOk(input.companyId, input.integrationId)) {
          return { acquired: false, reason: 'integration_mismatch' as const, row: null };
        }

        const existing = rows.get(key);
        const ts = nowIso(input.now);
        if (existing) {
          if (existing.requestFingerprint && existing.requestFingerprint !== fingerprint) {
            return { acquired: false, reason: 'payload_mismatch' as const, row: cloneRow(existing) };
          }
          if (existing.status === 'SUCCEEDED') {
            return { acquired: false, reason: 'already_succeeded' as const, row: cloneRow(existing) };
          }
          if (existing.status === 'UNKNOWN') {
            return { acquired: false, reason: 'needs_reconciliation' as const, row: cloneRow(existing) };
          }
          if (existing.status === 'RESERVED' || existing.status === 'PROCESSING') {
            const last = Date.parse(existing.lastAttemptAt);
            const nowMs = (input.now || new Date()).getTime();
            if (Number.isFinite(last) && nowMs - last >= C6_HOMOLOG_STALE_IN_FLIGHT_MS) {
              existing.status = 'UNKNOWN';
              existing.lastErrorCode = 'STALE_IN_FLIGHT';
              existing.lastErrorMessage =
                'Reserva em voo expirou sem resultado HTTP conhecido. Reconciliação obrigatória.';
              existing.completedAt = ts;
              existing.lastAttemptAt = ts;
              return { acquired: false, reason: 'needs_reconciliation' as const, row: cloneRow(existing) };
            }
            return { acquired: false, reason: 'in_flight' as const, row: cloneRow(existing) };
          }
          if (existing.status !== 'FAILED' || existing.requestFingerprint !== fingerprint) {
            return { acquired: false, reason: 'payload_mismatch' as const, row: cloneRow(existing) };
          }
          existing.status = 'RESERVED';
          existing.attemptCount += 1;
          existing.lastHttpStatus = null;
          existing.lastErrorCode = null;
          existing.lastErrorMessage = null;
          existing.c6BankSlipId = null;
          existing.processingAt = null;
          existing.completedAt = null;
          existing.lastAttemptAt = ts;
          return { acquired: true, reason: 'acquired' as const, row: cloneRow(existing) };
        }

        const created: C6HomologIdempotencyRow = {
          id: `mem-${key}`,
          companyId: input.companyId,
          integrationId: input.integrationId,
          externalReferenceId: input.externalReferenceId,
          environment: 'SANDBOX',
          scenario: String(input.scenario || 'B_01'),
          status: 'RESERVED',
          attemptCount: 1,
          requestFingerprint: fingerprint,
          lastHttpStatus: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          c6BankSlipId: null,
          lastAttemptAt: ts,
          processingAt: null,
          completedAt: null,
        };
        rows.set(key, created);
        return { acquired: true, reason: 'acquired' as const, row: cloneRow(created) };
      });
    },
    async markProcessing(input) {
      const key = c6HomologKey(input);
      return withLock(key, () => {
        const existing = rows.get(key);
        if (!existing) {
          return { acquired: false, reason: 'invalid_transition' as const, row: null };
        }
        if (!Number.isInteger(input.attemptCount) || input.attemptCount < 1) {
          return { acquired: false, reason: 'invalid_transition' as const, row: cloneRow(existing) };
        }
        if (existing.attemptCount !== input.attemptCount) {
          return { acquired: false, reason: 'invalid_transition' as const, row: cloneRow(existing) };
        }
        if (existing.status !== 'RESERVED') {
          const reason: C6HomologReserveReason =
            existing.status === 'UNKNOWN'
              ? 'needs_reconciliation'
              : existing.status === 'SUCCEEDED'
                ? 'already_succeeded'
                : 'in_flight';
          return { acquired: false, reason, row: cloneRow(existing) };
        }
        const ts = nowIso(input.now);
        existing.status = 'PROCESSING';
        existing.processingAt = ts;
        existing.lastAttemptAt = ts;
        return { acquired: true, reason: 'acquired' as const, row: cloneRow(existing) };
      });
    },
    async complete(input) {
      const key = c6HomologKey(input);
      return withLock(key, () => {
        const existing = rows.get(key);
        if (
          !existing ||
          existing.status !== 'PROCESSING' ||
          existing.attemptCount !== input.attemptCount
        ) {
          return {
            acquired: false,
            reason: 'invalid_transition' as const,
            row: existing ? cloneRow(existing) : null,
          };
        }
        if (input.status === 'SUCCEEDED' && !String(input.c6BankSlipId || '').trim()) {
          return {
            acquired: false,
            reason: 'invalid_transition' as const,
            row: cloneRow(existing),
          };
        }
        const ts = nowIso(input.now);
        existing.status = input.status;
        existing.lastHttpStatus = input.httpStatus ?? null;
        existing.lastErrorCode = input.errorCode ? String(input.errorCode).slice(0, 80) : null;
        existing.lastErrorMessage = sanitizeC6HomologErrorMessage(input.errorMessage);
        existing.c6BankSlipId =
          input.status === 'SUCCEEDED'
            ? String(input.c6BankSlipId || '').slice(0, 80)
            : existing.c6BankSlipId;
        existing.completedAt = ts;
        existing.lastAttemptAt = ts;
        return { acquired: true, reason: 'acquired' as const, row: cloneRow(existing) };
      });
    },
    async reconcile(input) {
      const key = c6HomologKey(input);
      return withLock(key, () => {
        if (String(input.confirmation || '').trim() !== C6_B01_RECONCILE_PHRASE) {
          return { acquired: false, reason: 'invalid_confirmation' as const, row: null };
        }
        const existing = rows.get(key);
        if (!existing || existing.status !== 'UNKNOWN') {
          const reason: C6HomologReserveReason =
            existing?.status === 'SUCCEEDED' ? 'already_succeeded' : 'invalid_transition';
          return { acquired: false, reason, row: existing ? cloneRow(existing) : null };
        }
        existing.lastErrorMessage =
          'Reconciliação registrada. UNKNOWN permanece bloqueado até confirmação bancária verificável. Sem reemissão automática.';
        existing.lastAttemptAt = nowIso(input.now);
        return {
          acquired: false,
          reason: 'needs_bank_confirmation' as const,
          row: cloneRow(existing),
        };
      });
    },
  };
}
