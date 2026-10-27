/**
 * Executor administrativo do cenário oficial B_03 (desconto).
 * Isolado de B_01 e B_02. Fora de vendas/Central. Production bloqueada.
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
  C6BoletoDiscount,
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

export const C6_B03_CONFIRMATION_PHRASE = 'EMITIR_B03_SANDBOX';
export const C6_B03_AUTHORIZED_REF = 'B03S261027';
export const C6_B01_FORBIDDEN_REF = 'B01S261027';
export const C6_B02_FORBIDDEN_REF = 'B02S261027';
export const C6_B03_AUTHORIZED_AMOUNT = 300;
export const C6_B03_AUTHORIZED_DUE = '2026-11-25';
export const C6_B03_AUTHORIZED_DISCOUNT: C6BoletoDiscount = {
  discount_type: 'V',
  first: { value: 15, dead_line: 5 },
};
export const C6_B03_AUTHORIZED_DISCOUNT_LIMIT_DATE = '2026-11-20';

export const C6_B03_AUTHORIZED_PAYER: C6BoletoCreateInput['payer'] = {
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

export function buildC6HomologB03AuthorizedPayload(companyId: string): C6BoletoCreateInput {
  return {
    companyId,
    environment: 'SANDBOX',
    billing_scheme: '21',
    external_reference_id: C6_B03_AUTHORIZED_REF,
    amount: C6_B03_AUTHORIZED_AMOUNT,
    due_date: C6_B03_AUTHORIZED_DUE,
    payer: C6_B03_AUTHORIZED_PAYER,
    discount: C6_B03_AUTHORIZED_DISCOUNT,
  };
}

export type C6HomologB03Input = {
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

function sameDiscount(actual: C6BoletoDiscount | undefined, expected: C6BoletoDiscount): boolean {
  return (
    actual?.discount_type === expected.discount_type &&
    Number(actual?.first?.value) === Number(expected.first?.value) &&
    Number(actual?.first?.dead_line) === Number(expected.first?.dead_line) &&
    actual?.second == null &&
    actual?.third == null
  );
}

function assertB03AuthorizedPayload(input: C6BoletoCreateInput): void {
  const ref = String(input.external_reference_id || '').trim();
  if (ref === C6_B01_FORBIDDEN_REF || ref === C6_B02_FORBIDDEN_REF) {
    throw new C6BoletoValidationError('B_03 não pode reutilizar as referências B_01 ou B_02.', [
      'external_reference_id',
    ]);
  }
  if (ref !== C6_B03_AUTHORIZED_REF) {
    throw new C6BoletoValidationError('B_03 exige a referência autorizada B03S261027.', ['external_reference_id']);
  }
  if (Number(input.amount) !== C6_B03_AUTHORIZED_AMOUNT) {
    throw new C6BoletoValidationError('B_03 exige amount 300.', ['amount']);
  }
  if (String(input.due_date || '') !== C6_B03_AUTHORIZED_DUE) {
    throw new C6BoletoValidationError('B_03 exige due_date 2026-11-25.', ['due_date']);
  }
  if (!sameDiscount(input.discount, C6_B03_AUTHORIZED_DISCOUNT)) {
    throw new C6BoletoValidationError(
      'B_03 exige discount_type V, first.value 15, first.dead_line 5.',
      ['discount'],
    );
  }
  if (input.interest || input.fine || input.instructions || input.our_number) {
    throw new C6BoletoValidationError('B_03 não admite juros, multa, instruções ou our_number.', ['B_03']);
  }
}

export function assertC6HomologB03SandboxOnly(
  credentialsEnv: string,
  payloadEnv: string,
  configEnv?: string | null,
): void {
  const values = [credentialsEnv, payloadEnv, configEnv]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);
  if (values.some((value) => value === 'PRODUCTION')) {
    throw new C6EmissionNotHomologatedError(
      'B_03 de homologação usa somente Sandbox. Production está bloqueada.',
    );
  }
}

export function authorizeC6HomologB03(input: C6HomologB03Input): C6BoletoPreparedHttp {
  if (!isPlatformAdmin(input.role)) {
    throw new C6HomologAuthorizationError(
      'Executor B_03 restrito a administrador da plataforma.',
    );
  }
  if (String(input.confirmation || '').trim() !== C6_B03_CONFIRMATION_PHRASE) {
    throw new C6HomologAuthorizationError(
      `Confirmação explícita ausente. Envie exatamente ${C6_B03_CONFIRMATION_PHRASE}.`,
    );
  }
  const sessionCompanyId = String(input.sessionCompanyId || input.credentials.companyId || '').trim();
  if (!sessionCompanyId || sessionCompanyId !== String(input.payload.companyId || '').trim()) {
    throw new C6HomologAuthorizationError(
      'Administrador não pertence à empresa autorizada para este B_03.',
    );
  }
  assertC6HomologB03SandboxOnly(input.credentials.environment, input.payload.environment);
  assertC6CompanyIsolation(input.credentials.companyId, input.payload.companyId);
  assertB03AuthorizedPayload(input.payload);
  buildC6BankSlipCreateBody(input.payload, input.now);

  const ref = String(input.payload.external_reference_id || '').trim();
  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  if (!integrationId) {
    throw new C6HomologAuthorizationError('Integração C6 obrigatória para o executor B_03.');
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
    throw new C6BoletoValidationError('B_03 Sandbox exige billing_scheme "21".', ['billing_scheme']);
  }
  const extras = Object.keys(prepared.jsonBody || {}).filter(
    (field) =>
      !['external_reference_id', 'amount', 'due_date', 'payer', 'billing_scheme', 'discount'].includes(field),
  );
  if (extras.length) {
    throw new C6BoletoValidationError('B_03 não deve enviar campos extras além de discount.', extras);
  }
  return prepared;
}

export function isC6HomologB03LiveAuthorized(): boolean {
  return isC6BoletoSandboxLiveAuthorized('SANDBOX');
}

export function c6HomologB03LiveExecuteOptions(
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

export function captureC6HomologB03Blocked(
  input: C6HomologB03Input,
): { prepared: C6BoletoPreparedHttp; evidence: C6BoletoEvidencePublic } {
  const prepared = authorizeC6HomologB03(input);
  const evidence = capturePreparedC6BoletoEvidence(prepared, {
    testCase: 'B_03',
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

export async function executeC6HomologB03WithIdempotency(
  input: C6HomologB03Input,
  options: Pick<
    C6BoletoExecuteOptions,
    'fetchFn' | 'accessToken' | 'authFetchFn' | 'now' | 'allowSandboxLive'
  > & {
    persistReservation?: boolean;
  } = {},
): Promise<C6BoletoExecuteResult & { idempotency: C6HomologIdempotencyRow | null }> {
  const prepared = authorizeC6HomologB03(input);
  const store = input.store;
  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  const persist = Boolean(options.persistReservation && store);
  let reserved: C6HomologIdempotencyRow | null = null;

  if (persist && store) {
    const fingerprint = buildC6HomologRequestFingerprint({
      companyId: input.credentials.companyId,
      integrationId,
      externalReferenceId: C6_B03_AUTHORIZED_REF,
      amount: C6_B03_AUTHORIZED_AMOUNT,
      dueDate: C6_B03_AUTHORIZED_DUE,
      billingScheme: String(prepared.billingScheme || '21'),
      extras: 'discount:V:15:5',
    });
    const reservedResult = await store.reserve({
      companyId: input.credentials.companyId,
      integrationId,
      externalReferenceId: C6_B03_AUTHORIZED_REF,
      environment: 'SANDBOX',
      scenario: 'B_03',
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
    isC6HomologB03LiveAuthorized() &&
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
      testCase: 'B_03',
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
