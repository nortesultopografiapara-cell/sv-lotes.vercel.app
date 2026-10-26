/**
 * Executor administrativo do cenário oficial B_01 (emissão simples Sandbox).
 * Não entra no fluxo de vendas nem na Central de Cobranças.
 * HTTP real permanece bloqueado nesta etapa.
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
import type { C6BoletoCreateInput, C6BoletoPreparedHttp } from '@/lib/banking/c6/c6BoletoTypes';
import type { C6BoletoEvidencePublic } from '@/lib/banking/c6/c6BoletoEvidence';
import {
  C6BoletoValidationError,
  assertC6CompanyIsolation,
  buildC6BankSlipCreateBody,
} from '@/lib/banking/c6/c6BoletoValidation';
import {
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  C6EmissionNotHomologatedError,
  throwIfC6EmissionAttempt,
} from '@/lib/banking/c6/c6EmitGuard';
import {
  assertC6HomologRefAvailable,
  type C6HomologIdempotencyIndex,
} from '@/lib/banking/c6/c6BoletoIdempotency';

export const C6_B01_CONFIRMATION_PHRASE = 'EMITIR_B01_SANDBOX';

export class C6HomologAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'C6HomologAuthorizationError';
  }
}

export type C6HomologB01Input = {
  role: string;
  confirmation: string;
  credentials: C6AuthCredentials;
  payload: C6BoletoCreateInput;
  now?: Date;
  integrationId?: string | null;
  persistedIdempotency?: C6HomologIdempotencyIndex;
  sessionCompanyId?: string;
};

function assertB01SimplePayload(input: C6BoletoCreateInput): void {
  if (input.interest || input.fine || input.discount || input.instructions || input.our_number) {
    throw new C6BoletoValidationError(
      'B_01 admite somente os campos obrigatórios (sem juros, multa, desconto, instruções ou our_number).',
      ['B_01'],
    );
  }
}

export function assertC6HomologB01SandboxOnly(
  credentialsEnv: string,
  payloadEnv: string,
  configEnv?: string | null,
): void {
  const values = [credentialsEnv, payloadEnv, configEnv]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);
  if (values.some((value) => value === 'PRODUCTION')) {
    throw new C6EmissionNotHomologatedError(
      'B_01 de homologação usa somente Sandbox. Production está bloqueada.',
    );
  }
}

export function authorizeC6HomologB01(input: C6HomologB01Input): C6BoletoPreparedHttp {
  if (!isPlatformAdmin(input.role)) {
    throw new C6HomologAuthorizationError(
      'Executor B_01 restrito a administrador da plataforma.',
    );
  }
  if (String(input.confirmation || '').trim() !== C6_B01_CONFIRMATION_PHRASE) {
    throw new C6HomologAuthorizationError(
      `Confirmação explícita ausente. Envie exatamente ${C6_B01_CONFIRMATION_PHRASE}.`,
    );
  }
  const sessionCompanyId = String(input.sessionCompanyId || input.credentials.companyId || '').trim();
  if (!sessionCompanyId || sessionCompanyId !== String(input.payload.companyId || '').trim()) {
    throw new C6HomologAuthorizationError(
      'Administrador não pertence à empresa autorizada para este B_01.',
    );
  }
  assertC6HomologB01SandboxOnly(
    input.credentials.environment,
    input.payload.environment,
  );
  assertC6CompanyIsolation(input.credentials.companyId, input.payload.companyId);
  assertB01SimplePayload(input.payload);
  buildC6BankSlipCreateBody(input.payload, input.now);

  const ref = String(input.payload.external_reference_id || '').trim();
  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  if (input.persistedIdempotency && integrationId) {
    assertC6HomologRefAvailable(
      input.persistedIdempotency,
      input.credentials.companyId,
      integrationId,
      ref,
    );
  }

  const prepared = prepareC6BankSlipCreate(input.credentials, input.payload, { now: input.now });
  const extras = Object.keys(prepared.jsonBody || {}).filter(
    (field) => !['external_reference_id', 'amount', 'due_date', 'payer', 'billing_scheme'].includes(field),
  );
  if (extras.length) {
    throw new C6BoletoValidationError('B_01 não deve enviar campos extras.', extras);
  }
  return prepared;
}

export function captureC6HomologB01Blocked(
  input: C6HomologB01Input,
): { prepared: C6BoletoPreparedHttp; evidence: C6BoletoEvidencePublic } {
  const prepared = authorizeC6HomologB01(input);
  const evidence = capturePreparedC6BoletoEvidence(prepared, {
    testCase: 'B_01',
    message: C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  });
  return { prepared, evidence };
}

export async function executeC6HomologB01Simulated(
  input: C6HomologB01Input,
  options: Pick<C6BoletoExecuteOptions, 'fetchFn' | 'accessToken' | 'authFetchFn' | 'now'>,
): Promise<C6BoletoExecuteResult> {
  authorizeC6HomologB01(input);
  if (!options.fetchFn) {
    throwIfC6EmissionAttempt('C6');
  }
  return executeC6BankSlipCreate(input.credentials, input.payload, {
    ...options,
    now: options.now || input.now,
    allowSimulatedHttp: true,
    testCase: 'B_01',
  });
}
