/**
 * Homologação B_07: POST /v1/webhooks/ (API de notificações, service BANK_SLIP).
 * Não baixa financeiro. Production bloqueada. Cadastro C6 só com a frase explícita.
 */

import { isPlatformAdmin } from '@/lib/rls';
import type { C6AuthCredentials } from '@/lib/banking/c6/c6AuthClient';
import {
  capturePreparedC6BoletoEvidence,
  executeC6WebhookConsult,
  executeC6WebhookRegister,
  prepareC6WebhookConsult,
  prepareC6WebhookRegister,
  type C6BoletoExecuteOptions,
  type C6BoletoExecuteResult,
} from '@/lib/banking/c6/c6BoletoClient';
import type { C6BoletoPreparedHttp } from '@/lib/banking/c6/c6BoletoTypes';
import type { C6BoletoEvidencePublic } from '@/lib/banking/c6/c6BoletoEvidence';
import { C6BoletoValidationError, assertC6CompanyIsolation } from '@/lib/banking/c6/c6BoletoValidation';
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
import { C6_NOTIFICATIONS_SERVICE } from '@/lib/banking/c6/c6NotificationsOpenApi';
import {
  C6_WEBHOOK_FINANCE_MUTATION,
  buildC6WebhookCallbackUrl,
  createC6WebhookRouteToken,
} from '@/lib/banking/c6/c6WebhookReceiver';

export const C6_B07_CONFIRMATION_PHRASE = 'CADASTRAR_B07_WEBHOOK_SANDBOX';
export const C6_B07_IDEMPOTENCY_REF = 'B07S261027';

export type C6HomologB07Input = {
  role: string;
  confirmation: string;
  credentials: C6AuthCredentials;
  callbackUrl: string;
  now?: Date;
  integrationId?: string | null;
  persistedIdempotency?: C6HomologIdempotencyIndex;
  existingAtomic?: C6HomologIdempotencyRow | null;
  store?: C6HomologIdempotencyAdapter;
  sessionCompanyId?: string;
};

export function assertC6HomologB07SandboxOnly(
  credentialsEnv: string,
  configEnv?: string | null,
): void {
  const values = [credentialsEnv, configEnv]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);
  if (values.some((value) => value === 'PRODUCTION')) {
    throw new C6EmissionNotHomologatedError(
      'B_07 de homologação usa somente Sandbox. Production está bloqueada.',
    );
  }
}

export function buildC6HomologB07CallbackUrl(origin: string, integrationId: string): string {
  return buildC6WebhookCallbackUrl({
    origin,
    integrationId,
    token: createC6WebhookRouteToken(integrationId),
  });
}

export function authorizeC6HomologB07(input: C6HomologB07Input): C6BoletoPreparedHttp {
  if (!isPlatformAdmin(input.role)) {
    throw new C6HomologAuthorizationError('Executor B_07 restrito a administrador da plataforma.');
  }
  if (String(input.confirmation || '').trim() !== C6_B07_CONFIRMATION_PHRASE) {
    throw new C6HomologAuthorizationError(
      `Confirmação explícita ausente. Envie exatamente ${C6_B07_CONFIRMATION_PHRASE}.`,
    );
  }
  const sessionCompanyId = String(input.sessionCompanyId || input.credentials.companyId || '').trim();
  if (!sessionCompanyId || sessionCompanyId !== String(input.credentials.companyId || '').trim()) {
    throw new C6HomologAuthorizationError(
      'Administrador não pertence à empresa autorizada para este B_07.',
    );
  }
  assertC6HomologB07SandboxOnly(input.credentials.environment);
  assertC6CompanyIsolation(input.credentials.companyId, input.credentials.companyId);
  const callbackUrl = String(input.callbackUrl || '').trim();
  if (!callbackUrl.startsWith('https://')) {
    throw new C6BoletoValidationError('Webhook C6 exige URL HTTPS.', ['url']);
  }

  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  if (!integrationId) {
    throw new C6HomologAuthorizationError('Integração C6 obrigatória para o executor B_07.');
  }
  if (input.persistedIdempotency) {
    assertC6HomologRefAvailable(
      input.persistedIdempotency,
      input.credentials.companyId,
      integrationId,
      C6_B07_IDEMPOTENCY_REF,
    );
  }
  if (input.existingAtomic) {
    assertC6HomologRetryAllowed(input.existingAtomic);
  }

  return prepareC6WebhookRegister(input.credentials, {
    url: callbackUrl,
    service: C6_NOTIFICATIONS_SERVICE,
  });
}

export function prepareC6HomologB07Consult(
  creds: Pick<C6AuthCredentials, 'companyId' | 'environment' | 'integrationId'>,
): C6BoletoPreparedHttp {
  return prepareC6WebhookConsult(creds);
}

export function interpretC6WebhookConsultResult(result: C6BoletoExecuteResult): {
  outcome: 'absent' | 'present' | 'ambiguous';
  httpStatus: number | null;
  service: string | null;
  urlRedacted: string | null;
  webhookId: string | null;
} {
  const status = result.httpStatus;
  const body = result.evidence.responseBody;
  const record = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const list = Array.isArray(body) ? body : record ? [record] : [];
  const items = list
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => item as Record<string, unknown>)
    .filter((item) => Object.keys(item).length > 0);
  const match = items.find((item) => String(item.service || '') === C6_NOTIFICATIONS_SERVICE && Boolean(item.url));
  if (match) {
    return {
      outcome: 'present',
      httpStatus: status,
      service: String(match.service),
      urlRedacted: String(match.url),
      webhookId: match.id ? String(match.id) : null,
    };
  }
  if (status === 404 || (status === 200 && items.length === 0)) {
    return { outcome: 'absent', httpStatus: status, service: null, urlRedacted: null, webhookId: null };
  }
  return {
    outcome: 'ambiguous',
    httpStatus: status,
    service: null,
    urlRedacted: null,
    webhookId: null,
  };
}

export async function consultC6HomologB07Existing(
  credentials: C6HomologB07Input['credentials'],
  oauthToken: string,
  now?: Date,
): Promise<C6BoletoExecuteResult & { interpretation: ReturnType<typeof interpretC6WebhookConsultResult> }> {
  const result = await executeC6WebhookConsult(credentials, {
    accessToken: oauthToken,
    allowSandboxLive: true,
    now,
    testCase: 'B_07',
  });
  return { ...result, interpretation: interpretC6WebhookConsultResult(result) };
}

export function isC6HomologB07LiveAuthorized(): boolean {
  return isC6BoletoSandboxLiveAuthorized('SANDBOX');
}

export function c6HomologB07LiveExecuteOptions(
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

export function captureC6HomologB07Blocked(
  input: C6HomologB07Input,
): { prepared: C6BoletoPreparedHttp; evidence: C6BoletoEvidencePublic } {
  const prepared = authorizeC6HomologB07(input);
  const evidence = capturePreparedC6BoletoEvidence(prepared, {
    testCase: 'B_07',
    message: C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  });
  return { prepared, evidence };
}

export async function executeC6HomologB07WithIdempotency(
  input: C6HomologB07Input,
  options: Pick<
    C6BoletoExecuteOptions,
    'fetchFn' | 'accessToken' | 'authFetchFn' | 'now' | 'allowSandboxLive'
  > & {
    persistReservation?: boolean;
  } = {},
): Promise<C6BoletoExecuteResult & { idempotency: C6HomologIdempotencyRow | null }> {
  authorizeC6HomologB07(input);
  const integrationId = String(input.integrationId || input.credentials.integrationId || '').trim();
  const live =
    options.allowSandboxLive === true &&
    isC6HomologB07LiveAuthorized() &&
    input.credentials.environment === 'SANDBOX';
  return executeC6HomologReservedCall({
    credentials: input.credentials,
    store: input.store,
    persistReservation: options.persistReservation,
    integrationId,
    externalReferenceId: C6_B07_IDEMPOTENCY_REF,
    scenario: 'B_07',
    fingerprint: {
      amount: 0,
      dueDate: 'webhook',
      billingScheme: '21',
      extras: `webhook:${C6_NOTIFICATIONS_SERVICE}:financeMutation=${C6_WEBHOOK_FINANCE_MUTATION}`,
    },
    now: options.now || input.now,
    live: Boolean(options.fetchFn) || live,
    successStatuses: [200],
    execute: () =>
      executeC6WebhookRegister(
        input.credentials,
        { url: input.callbackUrl, service: C6_NOTIFICATIONS_SERVICE },
        {
          ...options,
          now: options.now || input.now,
          allowSimulatedHttp: Boolean(options.fetchFn),
          allowSandboxLive: live,
          testCase: 'B_07',
        },
      ),
  });
}
