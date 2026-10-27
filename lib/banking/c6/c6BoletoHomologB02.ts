/**
 * Executor administrativo do cenário oficial B_02 (juros e multa variáveis).
 * Isolado do B_01. Fora de vendas/Central. Production bloqueada.
 */

import { isPlatformAdmin } from '@/lib/rls';
import type { C6AuthCredentials } from '@/lib/banking/c6/c6AuthClient';
import {
  capturePreparedC6BoletoEvidence,
  executeC6BankSlipCreate,
  prepareC6BankSlipCreate,
  type C6BoletoExecuteOptions,
  type C6BoletoExecuteResult,
} from '@/lib/banking/c6/c6BoletoClient';
import type {
  C6BoletoCreateInput,
  C6BoletoFine,
  C6BoletoInterest,
  C6BoletoPreparedHttp,
} from '@/lib/banking/c6/c6BoletoTypes';
import {
  assertC6BoletoEvidencePublicSafe,
  type C6BoletoEvidencePublic,
} from '@/lib/banking/c6/c6BoletoEvidence';
import {
  C6BoletoValidationError,
  assertC6CompanyIsolation,
  buildC6BankSlipCreateBody,
} from '@/lib/banking/c6/c6BoletoValidation';
import {
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  C6EmissionNotHomologatedError,
  isC6BoletoSandboxLiveAuthorized,
  throwIfC6EmissionAttempt,
} from '@/lib/banking/c6/c6EmitGuard';
import {
  assertC6HomologRefAvailable,
  type C6HomologIdempotencyIndex,
} from '@/lib/banking/c6/c6BoletoIdempotency';
import {
  assertC6HomologRetryAllowed,
  buildC6HomologRequestFingerprint,
  classifyC6HomologExecuteError,
  classifyC6HomologHttpOutcome,
  throwIfC6HomologNotAcquired,
  type C6HomologIdempotencyAdapter,
  type C6HomologIdempotencyRow,
} from '@/lib/banking/c6/c6HomologIdempotency';
import { getC6BillingScheme } from '@/lib/banking/c6/c6BoletoEndpoints';
import { C6HomologAuthorizationError } from '@/lib/banking/c6/c6BoletoHomologB01';

export const C6_B02_CONFIRMATION_PHRASE = 'EMITIR_B02_SANDBOX';
export const C6_B02_AUTHORIZED_REF = 'B02S261027';
export const C6_B01_FORBIDDEN_REF = 'B01S261027';
export const C6_B02_AUTHORIZED_AMOUNT = 234.56;
export const C6_B02_AUTHORIZED_DUE = '2026-11-20';
export const C6_B02_AUTHORIZED_INTEREST: C6BoletoInterest = {
  type: 'V',
  value: 2,
  dead_line: 0,
};
export const C6_B02_AUTHORIZED_FINE: C6BoletoFine = {
  type: 'V',
  value: 10,
  dead_line: 0,
};

export const C6_B02_AUTHORIZED_PAYER: C6BoletoCreateInput['payer'] = {
  name: 'José da Silva',
  tax_id: '11144477735',
  address: {
    street: 'Av. Nove de Julho',
    number: 123,
    city: 'Rio de Janeiro',
    state: 'RJ',
    zip_code: '05093000',
  },
};

export function buildC6HomologB02AuthorizedPayload(companyId: string): C6BoletoCreateInput {
  return {
    companyId,
    environment: 'SANDBOX',
    billing_scheme: '21',
    external_reference_id: C6_B02_AUTHORIZED_REF,
    amount: C6_B02_AUTHORIZED_AMOUNT,
    due_date: C6_B02_AUTHORIZED_DUE,
    payer: C6_B02_AUTHORIZED_PAYER,
    interest: C6_B02_AUTHORIZED_INTEREST,
    fine: C6_B02_AUTHORIZED_FINE,
  };
}

export type C6HomologB02Input = {
  role: string;
  confirmation: string;
  credentials: C6AuthCredentials;
  payload: C6BoletoCreateInput;
  now?: Date;
  integrationId?: string | null;
  persistedIdempotency?: C6HomologIdempotencyIndex;
  existingAtomic?: C6HomologIdempotencyRow | null;
  store?: C6HomologIdempotencyAdapter;
  sessionCompanyId?: string;
};

function sameCharge(
  actual: C6BoletoInterest | C6BoletoFine | undefined,
  expected: C6BoletoInterest | C6BoletoFine,
): boolean {
  return (
    actual?.type === expected.type &&
    Number(actual?.value) === expected.value &&
    Number(actual?.dead_line) === expected.dead_line
  );
}

function assertB02AuthorizedPayload(input: C6BoletoCreateInput): void {
  const ref = String(input.external_reference_id || '').trim();
  if (ref === C6_B01_FORBIDDEN_REF) {
    throw new C6BoletoValidationError('B_02 não pode reutilizar a referência B_01.', ['external_reference_id']);
  }
  if (ref !== C6_B02_AUTHORIZED_REF) {
    throw new C6BoletoValidationError('B_02 exige a referência autorizada B02S261027.', ['external_reference_id']);
  }
  if (Number(input.amount) !== C6_B02_AUTHORIZED_AMOUNT) {
    throw new C6BoletoValidationError('B_02 exige amount 234.56.', ['amount']);
  }
  if (String(input.due_date || '') !== C6_B02_AUTHORIZED_DUE) {
    throw new C6BoletoValidationError('B_02 exige due_date 2026-11-20.', ['due_date']);
  }
  if (!sameCharge(input.interest, C6_B02_AUTHORIZED_INTEREST)) {
    throw new C6BoletoValidationError('B_02 exige interest type V, value 2, dead_line 0.', ['interest']);
  }
  if (!sameCharge(input.fine, C6_B02_AUTHORIZED_FINE)) {
    throw new C6BoletoValidationError('B_02 exige fine type V, value 10, dead_line 0.', ['fine']);
  }
  if (input.discount || input.instructions || input.our_number) {
    throw new C6BoletoValidationError('B_02 não admite desconto, instruções ou our_number.', ['B_02']);
  }
}

export function assertC6HomologB02SandboxOnly(
  credentialsEnv: string,
  payloadEnv: string,
  configEnv?: string | null,
): void {
  const values = [credentialsEnv, payloadEnv, configEnv]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);
  if (values.some((value) => value === 'PRODUCTION')) {
    throw new C6EmissionNotHomologatedError(
      'B_02 de homologação usa somente Sandbox. Production está bloqueada.',
    );
  }
}

export function authorizeC6HomologB02(input: C6HomologB02Input): C6BoletoPreparedHttp {
  if (!isPlatformAdmin(input.role)) {
    throw new C6HomologAuthorizationError(
      'Executor B_02 restrito a administrador da plataforma.',
    );
  }
  if (String(input.confirmation || '').trim() !== C6_B02_CONFIRMATION_PHRASE) {
    throw new C6HomologAuthorizationError(
      `Confirmação explícita ausente. Envie exatamente ${C6_B02_CONFIRMATION_PHRASE}.`,
    );
  }
  const sessionCompanyId = String(input.sessionCompanyId || input.credentials.companyId || '').trim();
  if (!sessionCompanyId || sessionCompanyId !== String(input.payload.companyId || '').trim()) {
    throw new C6HomologAuthorizationError(
      'Administrador não pertence à empresa autorizada para este B_02.',
    );
  }
  assertC6HomologB02SandboxOnly(input.credentials.environment, input.payload.environment);
  assertC6CompanyIsolation(input.credentials.companyId, input.payload.companyId);
  assertB02AuthorizedPayload(input.payload);
  buildC6BankSlipCreateBody(input.payload, input.now);

  const ref = String(input.payload.external_reference_id || '').trim();
  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  if (!integrationId) {
    throw new C6HomologAuthorizationError('Integração C6 obrigatória para o executor B_02.');
  }
  if (input.persistedIdempotency) {
    assertC6HomologRefAvailable(
      input.persistedIdempotency,
      input.credentials.companyId,
      integrationId,
      ref,
    );
  }
  if (input.existingAtomic) {
    assertC6HomologRetryAllowed(input.existingAtomic);
  }

  const prepared = prepareC6BankSlipCreate(input.credentials, input.payload, { now: input.now });
  if (prepared.billingScheme !== '21' || prepared.billingScheme !== getC6BillingScheme('SANDBOX')) {
    throw new C6BoletoValidationError('B_02 Sandbox exige billing_scheme "21".', ['billing_scheme']);
  }
  const extras = Object.keys(prepared.jsonBody || {}).filter(
    (field) =>
      !['external_reference_id', 'amount', 'due_date', 'payer', 'billing_scheme', 'interest', 'fine'].includes(
        field,
      ),
  );
  if (extras.length) {
    throw new C6BoletoValidationError('B_02 não deve enviar campos extras além de interest e fine.', extras);
  }
  return prepared;
}

export function isC6HomologB02LiveAuthorized(): boolean {
  return isC6BoletoSandboxLiveAuthorized('SANDBOX');
}

export function c6HomologB02LiveExecuteOptions(
  oauthToken: string,
  now?: Date,
): Pick<C6BoletoExecuteOptions, 'accessToken' | 'allowSandboxLive' | 'now'> & {
  persistReservation: true;
} {
  return {
    persistReservation: true,
    allowSandboxLive: true,
    accessToken: oauthToken,
    now,
  };
}

export function captureC6HomologB02Blocked(
  input: C6HomologB02Input,
): { prepared: C6BoletoPreparedHttp; evidence: C6BoletoEvidencePublic } {
  const prepared = authorizeC6HomologB02(input);
  const evidence = capturePreparedC6BoletoEvidence(prepared, {
    testCase: 'B_02',
    message: C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  });
  return { prepared, evidence };
}

function extractC6BankSlipId(evidence: C6BoletoEvidencePublic): string | null {
  const body = evidence.responseBody;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const id = (body as Record<string, unknown>).id;
  return id ? String(id).slice(0, 80) : null;
}

export async function executeC6HomologB02WithIdempotency(
  input: C6HomologB02Input,
  options: Pick<
    C6BoletoExecuteOptions,
    'fetchFn' | 'accessToken' | 'authFetchFn' | 'now' | 'allowSandboxLive'
  > & {
    persistReservation?: boolean;
  } = {},
): Promise<C6BoletoExecuteResult & { idempotency: C6HomologIdempotencyRow | null }> {
  const prepared = authorizeC6HomologB02(input);
  const store = input.store;
  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  const persist = Boolean(options.persistReservation && store);
  let reserved: C6HomologIdempotencyRow | null = null;

  if (persist && store) {
    const fingerprint = buildC6HomologRequestFingerprint({
      companyId: input.credentials.companyId,
      integrationId,
      externalReferenceId: C6_B02_AUTHORIZED_REF,
      amount: C6_B02_AUTHORIZED_AMOUNT,
      dueDate: C6_B02_AUTHORIZED_DUE,
      billingScheme: String(prepared.billingScheme || '21'),
      extras: 'interest:V:2:0|fine:V:10:0',
    });
    const reservedResult = await store.reserve({
      companyId: input.credentials.companyId,
      integrationId,
      externalReferenceId: C6_B02_AUTHORIZED_REF,
      environment: 'SANDBOX',
      scenario: 'B_02',
      requestFingerprint: fingerprint,
      now: options.now || input.now,
    });
    reserved = throwIfC6HomologNotAcquired(reservedResult);
    const processing = await store.markProcessing({
      companyId: reserved.companyId,
      integrationId: reserved.integrationId,
      externalReferenceId: reserved.externalReferenceId,
      attemptCount: reserved.attemptCount,
      now: options.now || input.now,
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
      now: options.now || input.now,
    });
    return done.row || reserved;
  };

  const live =
    options.allowSandboxLive === true &&
    isC6HomologB02LiveAuthorized() &&
    input.credentials.environment === 'SANDBOX';

  if (!options.fetchFn && !live) {
    await finish('FAILED', null, 'EMIT_NOT_HOMOLOGATED', C6_EMIT_NOT_HOMOLOGATED_MESSAGE, null);
    throwIfC6EmissionAttempt('C6');
  }

  try {
    const result = await executeC6BankSlipCreate(input.credentials, input.payload, {
      ...options,
      now: options.now || input.now,
      allowSimulatedHttp: Boolean(options.fetchFn),
      allowSandboxLive: live,
      testCase: 'B_02',
    });
    assertC6BoletoEvidencePublicSafe(result.evidence);
    const transport =
      result.evidence.testCase === 'INT_TIMEOUT'
        ? 'TIMEOUT'
        : result.httpStatus == null && !result.ok
          ? 'NETWORK'
          : 'ok';
    const outcome = classifyC6HomologHttpOutcome({
      httpStatus: result.httpStatus,
      transport,
    });
    const row = await finish(
      outcome,
      result.httpStatus,
      outcome === 'SUCCEEDED' ? null : `HTTP_${result.httpStatus ?? 'NONE'}`,
      result.evidence.message,
      extractC6BankSlipId(result.evidence),
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
