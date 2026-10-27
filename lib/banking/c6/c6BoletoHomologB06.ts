/**
 * Homologação B_06: GET /v1/bank_slips/{id}/pdf do boleto B_01.
 * Não emite. Não altera. Production bloqueada.
 */

import { isPlatformAdmin } from '@/lib/rls';
import type { C6AuthCredentials } from '@/lib/banking/c6/c6AuthClient';
import {
  capturePreparedC6BoletoEvidence,
  executeC6BankSlipPdf,
  prepareC6BankSlipPdf,
  type C6BoletoExecuteOptions,
  type C6BoletoExecuteResult,
} from '@/lib/banking/c6/c6BoletoClient';
import type { C6BoletoPreparedHttp } from '@/lib/banking/c6/c6BoletoTypes';
import type { C6BoletoEvidencePublic } from '@/lib/banking/c6/c6BoletoEvidence';
import {
  C6BoletoValidationError,
  assertC6BankSlipId,
  assertC6CompanyIsolation,
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
import { C6HomologAuthorizationError } from '@/lib/banking/c6/c6BoletoHomologB01';
import {
  C6_HOMOLOG_B01_BANK_SLIP_ID,
  C6_HOMOLOG_B02_BANK_SLIP_ID,
  C6_HOMOLOG_B03_BANK_SLIP_ID,
} from '@/lib/banking/c6/c6BoletoHomologIssuedIds';

export const C6_B06_CONFIRMATION_PHRASE = 'CONSULTAR_B06_PDF_SANDBOX';
export const C6_B06_IDEMPOTENCY_REF = 'B06S261027';
export const C6_B06_AUTHORIZED_BANK_SLIP_ID = C6_HOMOLOG_B01_BANK_SLIP_ID;
export const C6_B06_SOURCE_AMOUNT = 123.45;
export const C6_B06_SOURCE_DUE = '2026-11-15';

export type C6HomologB06Input = {
  role: string;
  confirmation: string;
  credentials: C6AuthCredentials;
  bankSlipId: string;
  now?: Date;
  integrationId?: string | null;
  persistedIdempotency?: C6HomologIdempotencyIndex;
  existingAtomic?: C6HomologIdempotencyRow | null;
  store?: C6HomologIdempotencyAdapter;
  sessionCompanyId?: string;
};

export function assertC6HomologB06SandboxOnly(
  credentialsEnv: string,
  configEnv?: string | null,
): void {
  const values = [credentialsEnv, configEnv]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);
  if (values.some((value) => value === 'PRODUCTION')) {
    throw new C6EmissionNotHomologatedError(
      'B_06 de homologação usa somente Sandbox. Production está bloqueada.',
    );
  }
}

export function authorizeC6HomologB06(input: C6HomologB06Input): C6BoletoPreparedHttp {
  if (!isPlatformAdmin(input.role)) {
    throw new C6HomologAuthorizationError('Executor B_06 restrito a administrador da plataforma.');
  }
  if (String(input.confirmation || '').trim() !== C6_B06_CONFIRMATION_PHRASE) {
    throw new C6HomologAuthorizationError(
      `Confirmação explícita ausente. Envie exatamente ${C6_B06_CONFIRMATION_PHRASE}.`,
    );
  }
  const sessionCompanyId = String(input.sessionCompanyId || input.credentials.companyId || '').trim();
  if (!sessionCompanyId || sessionCompanyId !== String(input.credentials.companyId || '').trim()) {
    throw new C6HomologAuthorizationError(
      'Administrador não pertence à empresa autorizada para este B_06.',
    );
  }
  assertC6HomologB06SandboxOnly(input.credentials.environment);
  assertC6CompanyIsolation(input.credentials.companyId, input.credentials.companyId);
  const bankSlipId = assertC6BankSlipId(input.bankSlipId);
  if (bankSlipId !== C6_B06_AUTHORIZED_BANK_SLIP_ID) {
    throw new C6BoletoValidationError(
      'B_06 gera o PDF somente do boleto B_01. Não use B_02, B_03 nem o boleto exclusivo B_04.',
      ['id'],
    );
  }
  if (bankSlipId === C6_HOMOLOG_B02_BANK_SLIP_ID || bankSlipId === C6_HOMOLOG_B03_BANK_SLIP_ID) {
    throw new C6BoletoValidationError('B_06 não consulta B_02 nem B_03.', ['id']);
  }

  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  if (!integrationId) {
    throw new C6HomologAuthorizationError('Integração C6 obrigatória para o executor B_06.');
  }
  if (input.persistedIdempotency) {
    assertC6HomologRefAvailable(
      input.persistedIdempotency,
      input.credentials.companyId,
      integrationId,
      C6_B06_IDEMPOTENCY_REF,
    );
  }
  if (input.existingAtomic) {
    assertC6HomologRetryAllowed(input.existingAtomic);
  }

  return prepareC6BankSlipPdf(input.credentials, bankSlipId);
}

export function isC6HomologB06LiveAuthorized(): boolean {
  return isC6BoletoSandboxLiveAuthorized('SANDBOX');
}

export function c6HomologB06LiveExecuteOptions(
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

export function captureC6HomologB06Blocked(
  input: C6HomologB06Input,
): { prepared: C6BoletoPreparedHttp; evidence: C6BoletoEvidencePublic } {
  const prepared = authorizeC6HomologB06(input);
  const evidence = capturePreparedC6BoletoEvidence(prepared, {
    testCase: 'B_06',
    message: C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  });
  return { prepared, evidence };
}

export async function executeC6HomologB06WithIdempotency(
  input: C6HomologB06Input,
  options: Pick<
    C6BoletoExecuteOptions,
    'fetchFn' | 'accessToken' | 'authFetchFn' | 'now' | 'allowSandboxLive'
  > & {
    persistReservation?: boolean;
  } = {},
): Promise<C6BoletoExecuteResult & { idempotency: C6HomologIdempotencyRow | null }> {
  authorizeC6HomologB06(input);
  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  const live =
    options.allowSandboxLive === true &&
    isC6HomologB06LiveAuthorized() &&
    input.credentials.environment === 'SANDBOX';
  return executeC6HomologReservedCall({
    credentials: input.credentials,
    store: input.store,
    persistReservation: options.persistReservation,
    integrationId,
    externalReferenceId: C6_B06_IDEMPOTENCY_REF,
    scenario: 'B_06',
    fingerprint: {
      amount: C6_B06_SOURCE_AMOUNT,
      dueDate: C6_B06_SOURCE_DUE,
      billingScheme: '21',
      extras: `pdf:${C6_B06_AUTHORIZED_BANK_SLIP_ID}`,
    },
    now: options.now || input.now,
    live: Boolean(options.fetchFn) || live,
    successStatuses: [200],
    fallbackBankSlipId: C6_B06_AUTHORIZED_BANK_SLIP_ID,
    execute: () =>
      executeC6BankSlipPdf(input.credentials, C6_B06_AUTHORIZED_BANK_SLIP_ID, {
        ...options,
        now: options.now || input.now,
        allowSimulatedHttp: Boolean(options.fetchFn),
        allowSandboxLive: live,
        testCase: 'B_06',
      }),
  });
}
