/**
 * Homologação B_04: boleto exclusivo + PUT de alteração (due_date).
 * Não altera B_01, B_02 nem B_03. Production bloqueada.
 */

import { isPlatformAdmin } from '@/lib/rls';
import type { C6AuthCredentials } from '@/lib/banking/c6/c6AuthClient';
import {
  capturePreparedC6BoletoEvidence,
  executeC6BankSlipAlter,
  executeC6BankSlipCreate,
  prepareC6BankSlipAlter,
  prepareC6BankSlipCreate,
  type C6BoletoExecuteOptions,
  type C6BoletoExecuteResult,
} from '@/lib/banking/c6/c6BoletoClient';
import type {
  C6BankSlipAlterRequest,
  C6BoletoCreateInput,
  C6BoletoPreparedHttp,
} from '@/lib/banking/c6/c6BoletoTypes';
import type { C6BoletoEvidencePublic } from '@/lib/banking/c6/c6BoletoEvidence';
import {
  C6BoletoValidationError,
  assertC6BankSlipId,
  assertC6CompanyIsolation,
  buildC6BankSlipAlterBody,
  buildC6BankSlipCreateBody,
} from '@/lib/banking/c6/c6BoletoValidation';
import {
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  C6EmissionNotHomologatedError,
  isC6BoletoSandboxLiveAuthorized,
} from '@/lib/banking/c6/c6EmitGuard';
import {
  assertC6HomologRefAvailable,
  type C6HomologIdempotencyIndex,
} from '@/lib/banking/c6/c6BoletoIdempotency';
import {
  assertC6HomologRetryAllowed,
  type C6HomologIdempotencyAdapter,
  type C6HomologIdempotencyRow,
} from '@/lib/banking/c6/c6HomologIdempotency';
import { executeC6HomologReservedCall } from '@/lib/banking/c6/c6HomologReservedExecute';
import { getC6BillingScheme } from '@/lib/banking/c6/c6BoletoEndpoints';
import { C6HomologAuthorizationError } from '@/lib/banking/c6/c6BoletoHomologB01';
import {
  isC6HomologProtectedBankSlipId,
} from '@/lib/banking/c6/c6BoletoHomologIssuedIds';

export const C6_B04_SOURCE_CONFIRMATION_PHRASE = 'EMITIR_B04_ORIGEM_SANDBOX';
export const C6_B04_ALTER_CONFIRMATION_PHRASE = 'ALTERAR_B04_SANDBOX';
export const C6_B04_SOURCE_REF = 'B04S261027';
export const C6_B04_ALTER_REF = 'B04A261027';
export const C6_B01_FORBIDDEN_REF = 'B01S261027';
export const C6_B02_FORBIDDEN_REF = 'B02S261027';
export const C6_B03_FORBIDDEN_REF = 'B03S261027';
export const C6_B04_SOURCE_AMOUNT = 150;
export const C6_B04_SOURCE_DUE = '2026-12-01';
export const C6_B04_ALTER_DUE = '2026-12-10';
export const C6_B04_AUTHORIZED_ALTER: C6BankSlipAlterRequest = {
  due_date: C6_B04_ALTER_DUE,
};

export const C6_B04_AUTHORIZED_PAYER: C6BoletoCreateInput['payer'] = {
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

export function buildC6HomologB04SourcePayload(companyId: string): C6BoletoCreateInput {
  return {
    companyId,
    environment: 'SANDBOX',
    billing_scheme: '21',
    external_reference_id: C6_B04_SOURCE_REF,
    amount: C6_B04_SOURCE_AMOUNT,
    due_date: C6_B04_SOURCE_DUE,
    payer: C6_B04_AUTHORIZED_PAYER,
  };
}

export function buildC6HomologB04AlterPatch(): C6BankSlipAlterRequest {
  return { due_date: C6_B04_ALTER_DUE };
}

export type C6HomologB04SourceInput = {
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

export type C6HomologB04AlterInput = {
  role: string;
  confirmation: string;
  credentials: C6AuthCredentials;
  bankSlipId: string;
  patch: C6BankSlipAlterRequest;
  now?: Date;
  integrationId?: string | null;
  persistedIdempotency?: C6HomologIdempotencyIndex;
  existingAtomic?: C6HomologIdempotencyRow | null;
  store?: C6HomologIdempotencyAdapter;
  sessionCompanyId?: string;
};

function isForbiddenPriorRef(ref: string): boolean {
  return (
    ref === C6_B01_FORBIDDEN_REF ||
    ref === C6_B02_FORBIDDEN_REF ||
    ref === C6_B03_FORBIDDEN_REF
  );
}

function assertB04SourcePayload(input: C6BoletoCreateInput): void {
  const ref = String(input.external_reference_id || '').trim();
  if (isForbiddenPriorRef(ref)) {
    throw new C6BoletoValidationError(
      'B_04 não pode reutilizar as referências B_01, B_02 ou B_03.',
      ['external_reference_id'],
    );
  }
  if (ref !== C6_B04_SOURCE_REF) {
    throw new C6BoletoValidationError('Boleto exclusivo B_04 exige a referência B04S261027.', [
      'external_reference_id',
    ]);
  }
  if (Number(input.amount) !== C6_B04_SOURCE_AMOUNT) {
    throw new C6BoletoValidationError('Boleto exclusivo B_04 exige amount 150.', ['amount']);
  }
  if (String(input.due_date || '') !== C6_B04_SOURCE_DUE) {
    throw new C6BoletoValidationError('Boleto exclusivo B_04 exige due_date 2026-12-01.', ['due_date']);
  }
  if (input.interest || input.fine || input.discount || input.instructions || input.our_number) {
    throw new C6BoletoValidationError(
      'Boleto exclusivo B_04 admite somente os campos obrigatórios.',
      ['B_04'],
    );
  }
}

function assertB04AlterPatch(patch: C6BankSlipAlterRequest): void {
  if ('payer' in patch) {
    throw new C6BoletoValidationError(
      'OpenAPI 1.7.2 não permite alterar payer. B_04 altera somente due_date.',
      ['payer'],
    );
  }
  const keys = Object.keys(patch).filter((key) => (patch as Record<string, unknown>)[key] != null);
  if (keys.length !== 1 || keys[0] !== 'due_date') {
    throw new C6BoletoValidationError(
      'B_04 autorizado altera somente due_date (OpenAPI: amount, due_date, discount, interest, fine).',
      keys,
    );
  }
  if (String(patch.due_date || '') !== C6_B04_ALTER_DUE) {
    throw new C6BoletoValidationError('B_04 exige due_date 2026-12-10.', ['due_date']);
  }
}

export function assertC6HomologB04SandboxOnly(
  credentialsEnv: string,
  payloadEnv: string,
  configEnv?: string | null,
): void {
  const values = [credentialsEnv, payloadEnv, configEnv]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);
  if (values.some((value) => value === 'PRODUCTION')) {
    throw new C6EmissionNotHomologatedError(
      'B_04 de homologação usa somente Sandbox. Production está bloqueada.',
    );
  }
}

function assertHomologAdmin(
  role: string,
  confirmation: string,
  expected: string,
  sessionCompanyId: string,
  payloadCompanyId: string,
): void {
  if (!isPlatformAdmin(role)) {
    throw new C6HomologAuthorizationError('Executor B_04 restrito a administrador da plataforma.');
  }
  if (String(confirmation || '').trim() !== expected) {
    throw new C6HomologAuthorizationError(
      `Confirmação explícita ausente. Envie exatamente ${expected}.`,
    );
  }
  if (!sessionCompanyId || sessionCompanyId !== String(payloadCompanyId || '').trim()) {
    throw new C6HomologAuthorizationError(
      'Administrador não pertence à empresa autorizada para este B_04.',
    );
  }
}

export function authorizeC6HomologB04Source(input: C6HomologB04SourceInput): C6BoletoPreparedHttp {
  const sessionCompanyId = String(input.sessionCompanyId || input.credentials.companyId || '').trim();
  assertHomologAdmin(
    input.role,
    input.confirmation,
    C6_B04_SOURCE_CONFIRMATION_PHRASE,
    sessionCompanyId,
    input.payload.companyId,
  );
  assertC6HomologB04SandboxOnly(input.credentials.environment, input.payload.environment);
  assertC6CompanyIsolation(input.credentials.companyId, input.payload.companyId);
  assertB04SourcePayload(input.payload);
  buildC6BankSlipCreateBody(input.payload, input.now);

  const ref = String(input.payload.external_reference_id || '').trim();
  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  if (!integrationId) {
    throw new C6HomologAuthorizationError('Integração C6 obrigatória para o boleto exclusivo B_04.');
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
    throw new C6BoletoValidationError('B_04 Sandbox exige billing_scheme "21".', ['billing_scheme']);
  }
  const extras = Object.keys(prepared.jsonBody || {}).filter(
    (field) =>
      !['external_reference_id', 'amount', 'due_date', 'payer', 'billing_scheme'].includes(field),
  );
  if (extras.length) {
    throw new C6BoletoValidationError('Boleto exclusivo B_04 não deve enviar campos extras.', extras);
  }
  return prepared;
}

export function authorizeC6HomologB04Alter(input: C6HomologB04AlterInput): C6BoletoPreparedHttp {
  const sessionCompanyId = String(input.sessionCompanyId || input.credentials.companyId || '').trim();
  assertHomologAdmin(
    input.role,
    input.confirmation,
    C6_B04_ALTER_CONFIRMATION_PHRASE,
    sessionCompanyId,
    input.credentials.companyId,
  );
  assertC6HomologB04SandboxOnly(input.credentials.environment, 'SANDBOX');
  assertC6CompanyIsolation(input.credentials.companyId, input.credentials.companyId);
  assertB04AlterPatch(input.patch);
  const bankSlipId = assertC6BankSlipId(input.bankSlipId);
  if (isC6HomologProtectedBankSlipId(bankSlipId)) {
    throw new C6BoletoValidationError(
      'B_04 não altera os boletos B_01, B_02 ou B_03. Use o boleto exclusivo B04S261027.',
      ['id'],
    );
  }
  buildC6BankSlipAlterBody(input.patch, input.now);

  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  if (!integrationId) {
    throw new C6HomologAuthorizationError('Integração C6 obrigatória para o executor B_04.');
  }
  if (input.persistedIdempotency) {
    assertC6HomologRefAvailable(
      input.persistedIdempotency,
      input.credentials.companyId,
      integrationId,
      C6_B04_ALTER_REF,
    );
  }
  if (input.existingAtomic) {
    assertC6HomologRetryAllowed(input.existingAtomic);
  }

  return prepareC6BankSlipAlter(input.credentials, bankSlipId, input.patch, { now: input.now });
}

export function isC6HomologB04LiveAuthorized(): boolean {
  return isC6BoletoSandboxLiveAuthorized('SANDBOX');
}

export function c6HomologB04LiveExecuteOptions(
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

export function captureC6HomologB04SourceBlocked(
  input: C6HomologB04SourceInput,
): { prepared: C6BoletoPreparedHttp; evidence: C6BoletoEvidencePublic } {
  const prepared = authorizeC6HomologB04Source(input);
  const evidence = capturePreparedC6BoletoEvidence(prepared, {
    testCase: 'B_04',
    message: C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  });
  return { prepared, evidence };
}

export function captureC6HomologB04AlterBlocked(
  input: C6HomologB04AlterInput,
): { prepared: C6BoletoPreparedHttp; evidence: C6BoletoEvidencePublic } {
  const prepared = authorizeC6HomologB04Alter(input);
  const evidence = capturePreparedC6BoletoEvidence(prepared, {
    testCase: 'B_04',
    message: C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  });
  return { prepared, evidence };
}

export async function executeC6HomologB04SourceWithIdempotency(
  input: C6HomologB04SourceInput,
  options: Pick<
    C6BoletoExecuteOptions,
    'fetchFn' | 'accessToken' | 'authFetchFn' | 'now' | 'allowSandboxLive'
  > & {
    persistReservation?: boolean;
  } = {},
): Promise<C6BoletoExecuteResult & { idempotency: C6HomologIdempotencyRow | null }> {
  const prepared = authorizeC6HomologB04Source(input);
  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  const live =
    options.allowSandboxLive === true &&
    isC6HomologB04LiveAuthorized() &&
    input.credentials.environment === 'SANDBOX';
  return executeC6HomologReservedCall({
    credentials: input.credentials,
    store: input.store,
    persistReservation: options.persistReservation,
    integrationId,
    externalReferenceId: C6_B04_SOURCE_REF,
    scenario: 'B_04',
    fingerprint: {
      amount: C6_B04_SOURCE_AMOUNT,
      dueDate: C6_B04_SOURCE_DUE,
      billingScheme: String(prepared.billingScheme || '21'),
      extras: 'source',
    },
    now: options.now || input.now,
    live: Boolean(options.fetchFn) || live,
    successStatuses: [201],
    execute: () =>
      executeC6BankSlipCreate(input.credentials, input.payload, {
        ...options,
        now: options.now || input.now,
        allowSimulatedHttp: Boolean(options.fetchFn),
        allowSandboxLive: live,
        testCase: 'B_04',
      }),
  });
}

export async function executeC6HomologB04AlterWithIdempotency(
  input: C6HomologB04AlterInput,
  options: Pick<
    C6BoletoExecuteOptions,
    'fetchFn' | 'accessToken' | 'authFetchFn' | 'now' | 'allowSandboxLive'
  > & {
    persistReservation?: boolean;
  } = {},
): Promise<C6BoletoExecuteResult & { idempotency: C6HomologIdempotencyRow | null }> {
  authorizeC6HomologB04Alter(input);
  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  const live =
    options.allowSandboxLive === true &&
    isC6HomologB04LiveAuthorized() &&
    input.credentials.environment === 'SANDBOX';
  return executeC6HomologReservedCall({
    credentials: input.credentials,
    store: input.store,
    persistReservation: options.persistReservation,
    integrationId,
    externalReferenceId: C6_B04_ALTER_REF,
    scenario: 'B_04',
    fingerprint: {
      amount: C6_B04_SOURCE_AMOUNT,
      dueDate: C6_B04_ALTER_DUE,
      billingScheme: '21',
      extras: 'alter:due_date',
    },
    now: options.now || input.now,
    live: Boolean(options.fetchFn) || live,
    successStatuses: [200],
    fallbackBankSlipId: input.bankSlipId,
    execute: () =>
      executeC6BankSlipAlter(input.credentials, input.bankSlipId, input.patch, {
        ...options,
        now: options.now || input.now,
        allowSimulatedHttp: Boolean(options.fetchFn),
        allowSandboxLive: live,
        testCase: 'B_04',
      }),
  });
}
