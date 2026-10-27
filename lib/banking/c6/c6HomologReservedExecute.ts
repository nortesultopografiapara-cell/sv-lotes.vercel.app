/**
 * Reserva atômica + execução C6 para B_04/B_05/B_06.
 * Não altera o fluxo homologado de B_01/B_02/B_03.
 */

import type { C6AuthCredentials } from '@/lib/banking/c6/c6AuthClient';
import type { C6BoletoExecuteResult } from '@/lib/banking/c6/c6BoletoClient';
import { assertC6BoletoEvidencePublicSafe } from '@/lib/banking/c6/c6BoletoEvidence';
import {
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  throwIfC6EmissionAttempt,
} from '@/lib/banking/c6/c6EmitGuard';
import {
  buildC6HomologRequestFingerprint,
  classifyC6HomologExecuteError,
  classifyC6HomologHttpOutcome,
  throwIfC6HomologNotAcquired,
  type C6HomologIdempotencyAdapter,
  type C6HomologIdempotencyRow,
} from '@/lib/banking/c6/c6HomologIdempotency';

export function extractC6BankSlipIdFromEvidence(
  evidence: C6BoletoExecuteResult['evidence'],
): string | null {
  const body = evidence.responseBody;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const id = (body as Record<string, unknown>).id;
  return id ? String(id).slice(0, 80) : null;
}

export async function executeC6HomologReservedCall(input: {
  credentials: C6AuthCredentials;
  store?: C6HomologIdempotencyAdapter;
  persistReservation?: boolean;
  integrationId: string;
  externalReferenceId: string;
  scenario: string;
  fingerprint: {
    amount: number;
    dueDate: string;
    billingScheme: string;
    extras?: string;
  };
  now?: Date;
  live: boolean;
  successStatuses: readonly number[];
  fallbackBankSlipId?: string | null;
  execute: () => Promise<C6BoletoExecuteResult>;
}): Promise<C6BoletoExecuteResult & { idempotency: C6HomologIdempotencyRow | null }> {
  const store = input.store;
  const persist = Boolean(input.persistReservation && store);
  let reserved: C6HomologIdempotencyRow | null = null;

  if (persist && store) {
    const fingerprint = buildC6HomologRequestFingerprint({
      companyId: input.credentials.companyId,
      integrationId: input.integrationId,
      externalReferenceId: input.externalReferenceId,
      amount: input.fingerprint.amount,
      dueDate: input.fingerprint.dueDate,
      billingScheme: input.fingerprint.billingScheme,
      extras: input.fingerprint.extras,
    });
    const reservedResult = await store.reserve({
      companyId: input.credentials.companyId,
      integrationId: input.integrationId,
      externalReferenceId: input.externalReferenceId,
      environment: 'SANDBOX',
      scenario: input.scenario,
      requestFingerprint: fingerprint,
      now: input.now,
    });
    reserved = throwIfC6HomologNotAcquired(reservedResult);
    const processing = await store.markProcessing({
      companyId: reserved.companyId,
      integrationId: reserved.integrationId,
      externalReferenceId: reserved.externalReferenceId,
      attemptCount: reserved.attemptCount,
      now: input.now,
    });
    reserved = throwIfC6HomologNotAcquired(processing);
  }

  const finish = async (
    status: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN',
    httpStatus: number | null,
    errorCode: string | null,
    errorMessage: string | null,
    c6BankSlipId: string | null,
  ) => {
    if (!persist || !store || !reserved) return reserved;
    const done = await store.complete({
      companyId: reserved.companyId,
      integrationId: reserved.integrationId,
      externalReferenceId: reserved.externalReferenceId,
      status,
      attemptCount: reserved.attemptCount,
      httpStatus,
      errorCode,
      errorMessage,
      c6BankSlipId,
      now: input.now,
    });
    return done.row || reserved;
  };

  if (!input.live) {
    await finish('FAILED', null, 'EMIT_NOT_HOMOLOGATED', C6_EMIT_NOT_HOMOLOGATED_MESSAGE, null);
    throwIfC6EmissionAttempt('C6');
  }

  try {
    const result = await input.execute();
    assertC6BoletoEvidencePublicSafe(result.evidence);
    const transport =
      result.evidence.testCase === 'INT_TIMEOUT'
        ? 'TIMEOUT'
        : result.httpStatus == null && !result.ok
          ? 'NETWORK'
          : 'ok';
    let outcome = classifyC6HomologHttpOutcome({
      httpStatus: result.httpStatus,
      transport,
      successStatuses: input.successStatuses,
    });
    let errorCode = outcome === 'SUCCEEDED' ? null : `HTTP_${result.httpStatus ?? 'NONE'}`;
    if (result.evidence.operation === 'pdf' && outcome === 'SUCCEEDED' && !result.ok) {
      outcome = 'FAILED';
      errorCode = 'PDF_INVALID';
    }
    const row = await finish(
      outcome,
      result.httpStatus,
      errorCode,
      result.evidence.message,
      extractC6BankSlipIdFromEvidence(result.evidence) || input.fallbackBankSlipId || null,
    );
    return { ...result, idempotency: row };
  } catch (err) {
    const classified = classifyC6HomologExecuteError(err);
    await finish(
      classified.status,
      classified.httpStatus,
      classified.errorCode,
      classified.errorMessage,
      null,
    );
    throw err;
  }
}
