/**
 * Preparação do teste OAuth Sandbox C6-H3.
 * Somente TOKEN, somente o host de Sandbox, somente credencial já cifrada.
 * Esta fase não abre socket, não lê o banco e não emite boleto.
 *
 * Acionamento futuro, depois de autorização explícita:
 * sessão de administrador da empresa de homologação, chave exclusiva de TOKEN
 * e leitura de bank_credentials por loadC6SecretsForServer.
 */

import { isCompanyAdminUserRole } from '@/lib/companyAdminUsers';
import { isDevelopHomologRuntime } from '@/lib/homolog/env';
import { sanitizeC6ErrorBody } from '@/lib/banking/c6/c6AuthClient';
import { C6_AUTH_GRANT_TYPE, C6_AUTH_URL, buildC6AuthFormBody } from '@/lib/banking/c6/c6Endpoints';
import {
  assessC6H1OAuthScopes,
  C6_H1_AUTHORIZED_COMPANY_ID,
  C6_H1_OPERATION_AUTHORIZATION_ENV,
  C6_H1_PRODUCTION_COMPANY_ID,
  isC6H1HomologActionArmed,
  matchesC6H1OperationAuthorization,
  type C6H1ScopeAssessment,
} from '@/lib/banking/c6/c6H1Authorization';
import { isC6BoletoSandboxLiveAuthorized, isC6RemoteOperationBlocked } from '@/lib/banking/c6/c6EmitGuard';

export const C6_H3_INTEGRATION_ID = 'e4d0e3c1-29c3-47a1-a04d-156e45fa4b25';
export const C6_H3_AUTH_URL = C6_AUTH_URL.SANDBOX;
export const C6_H3_CREDENTIAL_LOADER = 'loadC6SecretsForServer' as const;
export const C6_H3_TOKEN_MAX_ATTEMPTS = 3;
export const C6_H3_TOKEN_WINDOW_MS = 15 * 60 * 1000;

const attempts = new Map<string, number[]>();

export type C6H3Denial =
  | 'session'
  | 'admin'
  | 'company'
  | 'supabase'
  | 'environment'
  | 'integration'
  | 'operation'
  | 'server_authorization'
  | 'rate_limited'
  | 'credential_not_sandbox'
  | 'credential_incomplete'
  | 'live_disarmed';

export type C6H3Session = {
  authenticated: boolean;
  userId?: string | null;
  role?: string | null;
  tenantId?: string | null;
  status?: string | null;
};

export type C6H3StoredCredentialFacts = {
  environment?: string | null;
  integrationId?: string | null;
  clientIdPresent: boolean;
  clientSecretPresent: boolean;
  certificatePresent: boolean;
  privateKeyPresent: boolean;
};

export type C6H3TokenMaterial = {
  clientId: string;
  clientSecret: string;
  certificatePem: string;
  privateKeyPem: string;
};

export type C6H3TokenInput = {
  session: C6H3Session;
  companyId?: string | null;
  supabaseUrl?: string | null;
  environment?: string | null;
  operation?: string | null;
  serverAuthorization?: string | null;
  env?: Record<string, string | undefined>;
  credential?: C6H3StoredCredentialFacts | null;
};

export type C6H3TokenDecision = {
  session: boolean;
  admin: boolean;
  company: boolean;
  develop: boolean;
  sandbox: boolean;
  integration: boolean;
  operation: boolean;
  serverAuthorization: boolean;
  credentialSandbox: boolean;
  credentialComplete: boolean;
  withinRateLimit: boolean;
  liveArmed: false;
  bankCallAllowed: false;
  emissionArmed: false;
  denials: C6H3Denial[];
};

export type C6H3PreparedCall = {
  phase: 'C6-H3';
  operation: 'token';
  url: typeof C6_H3_AUTH_URL;
  method: 'POST';
  path: '/v1/auth/';
  grantType: typeof C6_AUTH_GRANT_TYPE;
  mtls: true;
  rejectUnauthorized: true;
  contentType: 'application/x-www-form-urlencoded';
  credentialSource: typeof C6_H3_CREDENTIAL_LOADER;
  credentialInvoked: false;
  companyId: typeof C6_H1_AUTHORIZED_COMPANY_ID;
  integrationId: typeof C6_H3_INTEGRATION_ID;
  environment: 'SANDBOX';
};

export function isC6H3SandboxTokenLiveArmed(): false {
  return false;
}

export function resetC6H3TokenRateLimit(): void {
  attempts.clear();
}

function rateKey(userId: string, companyId: string): string {
  return `${userId}:${companyId}`;
}

function withinRateLimit(userId: string, companyId: string, nowMs: number): boolean {
  const recent = (attempts.get(rateKey(userId, companyId)) || []).filter(
    (at) => nowMs - at < C6_H3_TOKEN_WINDOW_MS,
  );
  return recent.length < C6_H3_TOKEN_MAX_ATTEMPTS;
}

function consumeRateLimit(userId: string, companyId: string, nowMs: number): boolean {
  const key = rateKey(userId, companyId);
  const recent = (attempts.get(key) || []).filter((at) => nowMs - at < C6_H3_TOKEN_WINDOW_MS);
  if (recent.length >= C6_H3_TOKEN_MAX_ATTEMPTS) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(nowMs);
  attempts.set(key, recent);
  return true;
}

function credentialFacts(input: C6H3StoredCredentialFacts | null | undefined): {
  sandbox: boolean;
  complete: boolean;
  integration: boolean;
} {
  const environment = String(input?.environment || '').trim().toUpperCase();
  const integration = String(input?.integrationId || '') === C6_H3_INTEGRATION_ID;
  const complete = Boolean(
    input?.clientIdPresent &&
      input?.clientSecretPresent &&
      input?.certificatePresent &&
      input?.privateKeyPresent,
  );
  return {
    sandbox: environment === 'SANDBOX',
    complete,
    integration,
  };
}

export function evaluateC6H3SandboxToken(
  input: C6H3TokenInput,
  options?: { nowMs?: number; consume?: boolean },
): C6H3TokenDecision {
  const nowMs = options?.nowMs ?? Date.now();
  const userId = String(input.session.userId || '').trim();
  const session = input.session.authenticated === true && userId.length > 0;
  const tenantMatches =
    String(input.session.tenantId || '').trim().toLowerCase() === C6_H1_AUTHORIZED_COMPANY_ID.toLowerCase();
  const active = String(input.session.status || 'ACTIVE').trim().toUpperCase() === 'ACTIVE';
  const admin = session && tenantMatches && active && isCompanyAdminUserRole(input.session.role);
  const company =
    String(input.companyId || '').trim().toLowerCase() === C6_H1_AUTHORIZED_COMPANY_ID.toLowerCase() &&
    String(input.companyId || '').trim().toLowerCase() !== C6_H1_PRODUCTION_COMPANY_ID.toLowerCase();
  const develop = isDevelopHomologRuntime(String(input.supabaseUrl || ''));
  const environment = String(input.environment || '').trim().toUpperCase();
  const sandbox =
    environment === 'SANDBOX' && !isC6RemoteOperationBlocked(environment, String(input.supabaseUrl || ''));
  const operation = String(input.operation || '').trim().toLowerCase() === 'token';
  const serverAuthorization =
    operation &&
    matchesC6H1OperationAuthorization('token', input.serverAuthorization, input.env) &&
    !matchesC6H1OperationAuthorization('emit', input.serverAuthorization, input.env) &&
    !matchesC6H1OperationAuthorization('status', input.serverAuthorization, input.env) &&
    !matchesC6H1OperationAuthorization('pdf', input.serverAuthorization, input.env);
  const facts = credentialFacts(input.credential);
  const gatesOpen =
    session &&
    admin &&
    company &&
    develop &&
    sandbox &&
    facts.integration &&
    operation &&
    serverAuthorization &&
    facts.sandbox &&
    facts.complete;
  const rateOk = !gatesOpen
    ? true
    : options?.consume === true
      ? consumeRateLimit(userId, C6_H1_AUTHORIZED_COMPANY_ID, nowMs)
      : withinRateLimit(userId, C6_H1_AUTHORIZED_COMPANY_ID, nowMs);

  const denials: C6H3Denial[] = [];
  if (!session) denials.push('session');
  if (!admin) denials.push('admin');
  if (!company) denials.push('company');
  if (!develop) denials.push('supabase');
  if (!sandbox) denials.push('environment');
  if (!facts.integration) denials.push('integration');
  if (!operation) denials.push('operation');
  if (!serverAuthorization) denials.push('server_authorization');
  if (!facts.sandbox) denials.push('credential_not_sandbox');
  if (!facts.complete) denials.push('credential_incomplete');
  if (!rateOk) denials.push('rate_limited');
  denials.push('live_disarmed');

  return {
    session,
    admin,
    company,
    develop,
    sandbox,
    integration: facts.integration,
    operation,
    serverAuthorization,
    credentialSandbox: facts.sandbox,
    credentialComplete: facts.complete,
    withinRateLimit: rateOk,
    liveArmed: isC6H3SandboxTokenLiveArmed(),
    bankCallAllowed: false,
    emissionArmed: isC6H1HomologActionArmed(),
    denials,
  };
}

export function prepareC6H3SandboxTokenCall(input: C6H3TokenInput): {
  ready: boolean;
  decision: C6H3TokenDecision;
  call: C6H3PreparedCall | null;
  blocks: {
    emission: true;
    idempotencyReserve: true;
    boletoStatus: true;
    boletoPdf: true;
    webhook: true;
    financialWrite: true;
    production: true;
    globalEmissionAuthorized: boolean;
  };
} {
  const decision = evaluateC6H3SandboxToken(input, { consume: false });
  const ready = decision.denials.length === 1 && decision.denials[0] === 'live_disarmed';
  return {
    ready,
    decision,
    call: ready
      ? {
          phase: 'C6-H3',
          operation: 'token',
          url: C6_H3_AUTH_URL,
          method: 'POST',
          path: '/v1/auth/',
          grantType: C6_AUTH_GRANT_TYPE,
          mtls: true,
          rejectUnauthorized: true,
          contentType: 'application/x-www-form-urlencoded',
          credentialSource: C6_H3_CREDENTIAL_LOADER,
          credentialInvoked: false,
          companyId: C6_H1_AUTHORIZED_COMPANY_ID,
          integrationId: C6_H3_INTEGRATION_ID,
          environment: 'SANDBOX',
        }
      : null,
    blocks: {
      emission: true,
      idempotencyReserve: true,
      boletoStatus: true,
      boletoPdf: true,
      webhook: true,
      financialWrite: true,
      production: true,
      globalEmissionAuthorized: isC6BoletoSandboxLiveAuthorized('SANDBOX'),
    },
  };
}

export type C6H3MockResponse = {
  status: number;
  bodyText: string;
  tlsError?: boolean;
};

export type C6H3TokenPublicResult = {
  phase: 'C6-H3';
  transport: 'mock';
  liveDispatched: false;
  bankCallAllowed: false;
  httpStatus: number | null;
  tlsCompleted: boolean;
  certificateValidation: 'rejectUnauthorized';
  accessTokenPresent: boolean;
  expiresIn: number | null;
  scopes: C6H1ScopeAssessment;
  failureCode: 'AUTH_REJECTED' | 'MTLS_ERROR' | 'AUTH_INVALID_RESPONSE' | null;
  message: string;
};

function redactMaterial(value: string, material: C6H3TokenMaterial): string {
  let out = sanitizeC6ErrorBody(value);
  for (const secret of [material.clientSecret, material.clientId, material.certificatePem, material.privateKeyPem]) {
    const clean = String(secret || '').trim();
    if (clean.length >= 8) out = out.split(clean).join('[redacted]');
  }
  return out;
}

export async function rehearseC6H3SandboxToken(input: {
  authorization: C6H3TokenInput;
  material: C6H3TokenMaterial;
  nowMs?: number;
  fetchFn: (url: string, body: string) => Promise<C6H3MockResponse>;
}): Promise<
  | { ok: false; reason: C6H3Denial; liveDispatched: false; bankCallAllowed: false }
  | { ok: true; result: C6H3TokenPublicResult }
> {
  const decision = evaluateC6H3SandboxToken(input.authorization, {
    nowMs: input.nowMs,
    consume: true,
  });
  const blocking = decision.denials.filter((reason) => reason !== 'live_disarmed');
  if (blocking.length > 0) {
    return { ok: false, reason: blocking[0], liveDispatched: false, bankCallAllowed: false };
  }

  const body = buildC6AuthFormBody(input.material.clientId, input.material.clientSecret);
  let response: C6H3MockResponse;
  try {
    response = await input.fetchFn(C6_H3_AUTH_URL, body);
  } catch {
    response = { status: 0, bodyText: '', tlsError: true };
  }

  if (response.tlsError) {
    return {
      ok: true,
      result: {
        phase: 'C6-H3',
        transport: 'mock',
        liveDispatched: false,
        bankCallAllowed: false,
        httpStatus: null,
        tlsCompleted: false,
        certificateValidation: 'rejectUnauthorized',
        accessTokenPresent: false,
        expiresIn: null,
        scopes: assessC6H1OAuthScopes(null, false),
        failureCode: 'MTLS_ERROR',
        message: redactMaterial('mTLS rejeitado pelo certificado.', input.material),
      },
    };
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(response.bodyText) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  const accessToken = String(parsed?.access_token || '').trim();
  const expiresIn = typeof parsed?.expires_in === 'number' ? parsed.expires_in : null;
  const scopeText =
    parsed && Object.prototype.hasOwnProperty.call(parsed, 'scope') ? String(parsed.scope ?? '').trim() : '';
  const scopePresent = scopeText.length > 0;
  const accepted = response.status >= 200 && response.status < 300 && accessToken.length > 0;
  const message = redactMaterial(
    accepted
      ? 'Autenticação simulada aceita. O access token não é exibido.'
      : response.status === 401 || response.status === 403
        ? 'Autenticação simulada recusada.'
        : 'Resposta simulada sem access token.',
    input.material,
  );

  return {
    ok: true,
    result: {
      phase: 'C6-H3',
      transport: 'mock',
      liveDispatched: false,
      bankCallAllowed: false,
      httpStatus: response.status || null,
      tlsCompleted: true,
      certificateValidation: 'rejectUnauthorized',
      accessTokenPresent: accepted,
      expiresIn: accepted ? expiresIn : null,
      scopes: assessC6H1OAuthScopes(scopePresent ? String(parsed?.scope || '') : null, scopePresent && accepted),
      failureCode: accepted
        ? null
        : accessToken
          ? 'AUTH_REJECTED'
          : response.status === 401 || response.status === 403
            ? 'AUTH_REJECTED'
            : 'AUTH_INVALID_RESPONSE',
      message,
    },
  };
}

/** Ponto único de envio real. Nesta fase não há rede. */
export function dispatchC6H3SandboxToken(): {
  dispatched: false;
  bankCallAllowed: false;
  reason: 'live_disarmed';
} {
  return { dispatched: false, bankCallAllowed: false, reason: 'live_disarmed' };
}
