/**
 * Preparação C6-H4: um TOKEN no host de Production do C6.
 * Independente de H1 e H3. Não altera o bloqueio global e não abre socket.
 *
 * A operação não entra no Preview. O executor futuro é um processo
 * administrativo local, com pacote cifrado fora do repositório e do Vercel.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import { isCompanyAdminUserRole } from '@/lib/companyAdminUsers';
import { isDevelopHomologRuntime, isProductionSupabaseRuntime } from '@/lib/homolog/env';
import { C6_AUTH_GRANT_TYPE, C6_AUTH_URL } from '@/lib/banking/c6/c6Endpoints';
import { sanitizeC6ErrorBody } from '@/lib/banking/c6/c6AuthClient';
import {
  assessC6H1OAuthScopes,
  C6_H1_AUTHORIZED_COMPANY_ID,
  C6_H1_PRODUCTION_COMPANY_ID,
  matchesC6H1OperationAuthorization,
  type C6H1Operation,
  type C6H1ScopeAssessment,
} from '@/lib/banking/c6/c6H1Authorization';
import {
  isC6BoletoSandboxLiveAuthorized,
  isC6RemoteOperationBlocked,
} from '@/lib/banking/c6/c6EmitGuard';

export const C6_H4_SANDBOX_INTEGRATION_ID = 'e4d0e3c1-29c3-47a1-a04d-156e45fa4b25';
export const C6_H4_AUTH_URL = C6_AUTH_URL.PRODUCTION;
export const C6_H4_SANDBOX_AUTH_URL = C6_AUTH_URL.SANDBOX;
export const C6_H4_OPERATION_ENV = 'C6_H4_TOKEN_OPERATION_AUTHORIZATION';
export const C6_H4_ATTEMPT_ENV = 'C6_H4_TOKEN_ATTEMPT_AUTHORIZATION';
export const C6_H4_PREVIEW_DEPLOYMENT_ENV = 'C6_H4_AUTHORIZED_PREVIEW_DEPLOYMENT';
export const C6_H4_SECRET_MIN_LENGTH = 24;
export const C6_H4_CREDENTIAL_STORE = 'operator_encrypted_bundle' as const;

const H1_OPERATIONS: C6H1Operation[] = ['token', 'emit', 'status', 'pdf'];

export type C6H4Denial =
  | 'session'
  | 'admin'
  | 'company'
  | 'supabase'
  | 'preview_deployment'
  | 'venue'
  | 'environment'
  | 'host'
  | 'integration'
  | 'credential_store'
  | 'credential_incomplete'
  | 'operation'
  | 'server_authorization'
  | 'attempt_authorization'
  | 'attempt_store'
  | 'attempt_used'
  | 'live_disarmed';

export type C6H4CredentialSource =
  | typeof C6_H4_CREDENTIAL_STORE
  | 'develop_bank_credentials'
  | 'production_database_copy'
  | 'preview_env';

export type C6H4CredentialFacts = {
  environment?: string | null;
  integrationId?: string | null;
  source?: C6H4CredentialSource | null;
  sandboxIntegrationRenamed?: boolean;
  clientIdPresent: boolean;
  clientSecretPresent: boolean;
  certificatePresent: boolean;
  privateKeyPresent: boolean;
};

export type C6H4TokenMaterial = {
  clientId: string;
  clientSecret: string;
  certificatePem: string;
  privateKeyPem: string;
};

export type C6H4Session = {
  authenticated: boolean;
  userId?: string | null;
  role?: string | null;
  tenantId?: string | null;
  status?: string | null;
};

export type C6H4TokenInput = {
  session: C6H4Session;
  companyId?: string | null;
  supabaseUrl?: string | null;
  environment?: string | null;
  requestedAuthUrl?: string | null;
  venue?: 'admin_executor' | 'preview' | null;
  previewDeploymentId?: string | null;
  operation?: string | null;
  serverAuthorization?: string | null;
  attemptAuthorization?: string | null;
  env?: Record<string, string | undefined>;
  credential?: C6H4CredentialFacts | null;
};

export type C6H4AttemptLedger = {
  durable: boolean;
  peek(companyId: string, integrationId: string): 'available' | 'already_used' | 'unreadable';
  reserve(input: {
    companyId: string;
    integrationId: string;
    attemptAuthorization: string;
  }): 'reserved' | 'already_used' | 'unreadable';
};

type AttemptRow = {
  companyId: string;
  integrationId: string;
  attemptHash: string;
  reservedAt: string;
};

export function hashC6H4Attempt(value: string): string {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

export function createMemoryC6H4AttemptLedger(): C6H4AttemptLedger {
  const used = new Set<string>();
  const key = (companyId: string, integrationId: string) => `${companyId}:${integrationId}`;
  return {
    durable: false,
    peek(companyId, integrationId) {
      return used.has(key(companyId, integrationId)) ? 'already_used' : 'available';
    },
    reserve(input) {
      const id = key(input.companyId, input.integrationId);
      if (used.has(id)) return 'already_used';
      used.add(id);
      return 'reserved';
    },
  };
}

function readAttemptRows(filePath: string): AttemptRow[] | null {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as AttemptRow[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Livro durável. Guarda só o hash da tentativa, nunca o segredo. */
export function createFileC6H4AttemptLedger(filePath: string): C6H4AttemptLedger {
  return {
    durable: true,
    peek(companyId, integrationId) {
      const rows = readAttemptRows(filePath);
      if (!rows) return 'unreadable';
      return rows.some((row) => row.companyId === companyId && row.integrationId === integrationId)
        ? 'already_used'
        : 'available';
    },
    reserve(input) {
      const rows = readAttemptRows(filePath);
      if (!rows) return 'unreadable';
      if (rows.some((row) => row.companyId === input.companyId && row.integrationId === input.integrationId)) {
        return 'already_used';
      }
      rows.push({
        companyId: input.companyId,
        integrationId: input.integrationId,
        attemptHash: hashC6H4Attempt(input.attemptAuthorization),
        reservedAt: new Date().toISOString(),
      });
      fs.writeFileSync(filePath, JSON.stringify(rows), 'utf8');
      return 'reserved';
    },
  };
}

export function isC6H4ProductionTokenLiveArmed(): false {
  return false;
}

function sameSecret(presented: string, expected: string): boolean {
  if (presented.length < C6_H4_SECRET_MIN_LENGTH || expected.length !== presented.length) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

function matchesExclusiveSecret(
  presented: string | null | undefined,
  envName: string,
  env: Record<string, string | undefined>,
): boolean {
  const expected = String(env[envName] || '');
  const candidate = String(presented || '');
  if (!expected || expected === 'true' || candidate === 'true') return false;
  return sameSecret(candidate, expected);
}

function overlapsH1(presented: string, env: Record<string, string | undefined>): boolean {
  return H1_OPERATIONS.some((operation) => matchesC6H1OperationAuthorization(operation, presented, env));
}

export function evaluateC6H4ProductionToken(
  input: C6H4TokenInput,
  ledger: C6H4AttemptLedger,
  options?: { consume?: boolean },
): {
  denials: C6H4Denial[];
  bankCallAllowed: false;
  emissionArmed: false;
  sharedClientBlocked: boolean;
  integrationId: string;
} {
  const env = input.env || {};
  const userId = String(input.session.userId || '').trim();
  const session = input.session.authenticated === true && userId.length > 0;
  const tenantMatches =
    String(input.session.tenantId || '').trim().toLowerCase() === C6_H1_AUTHORIZED_COMPANY_ID.toLowerCase();
  const active = String(input.session.status || 'ACTIVE').trim().toUpperCase() === 'ACTIVE';
  const admin = session && tenantMatches && active && isCompanyAdminUserRole(input.session.role);
  const companyId = String(input.companyId || '').trim().toLowerCase();
  const company =
    companyId === C6_H1_AUTHORIZED_COMPANY_ID.toLowerCase() &&
    companyId !== C6_H1_PRODUCTION_COMPANY_ID.toLowerCase();
  const supabaseUrl = String(input.supabaseUrl || '');
  const develop = isDevelopHomologRuntime(supabaseUrl) && !isProductionSupabaseRuntime(supabaseUrl);
  const previewDeployment = matchesExclusiveSecret(
    input.previewDeploymentId,
    C6_H4_PREVIEW_DEPLOYMENT_ENV,
    env,
  );
  const venue = input.venue === 'admin_executor';
  const environment = String(input.environment || '').trim().toUpperCase();
  const productionEnvironment = environment === 'PRODUCTION';
  const requestedUrl = String(input.requestedAuthUrl || C6_H4_AUTH_URL);
  const sandboxHost = requestedUrl === C6_H4_SANDBOX_AUTH_URL;
  const host = requestedUrl === C6_H4_AUTH_URL && sandboxHost === false;
  const integrationId = String(input.credential?.integrationId || '').trim();
  const integration =
    integrationId.length > 0 &&
    integrationId !== C6_H4_SANDBOX_INTEGRATION_ID &&
    input.credential?.sandboxIntegrationRenamed !== true &&
    String(input.credential?.environment || '').toUpperCase() === 'PRODUCTION';
  const store = input.credential?.source === C6_H4_CREDENTIAL_STORE;
  const complete = Boolean(
    input.credential?.clientIdPresent &&
      input.credential?.clientSecretPresent &&
      input.credential?.certificatePresent &&
      input.credential?.privateKeyPresent,
  );
  const operation = String(input.operation || '').trim().toLowerCase() === 'token';
  const operationSecret = String(input.serverAuthorization || '');
  const attemptSecret = String(input.attemptAuthorization || '');
  const serverAuthorization =
    operation &&
    matchesExclusiveSecret(operationSecret, C6_H4_OPERATION_ENV, env) &&
    operationSecret !== attemptSecret &&
    !overlapsH1(operationSecret, env);
  const attemptAuthorization =
    matchesExclusiveSecret(attemptSecret, C6_H4_ATTEMPT_ENV, env) && attemptSecret !== operationSecret;
  const durable = ledger.durable === true;
  const prior = integration ? ledger.peek(C6_H1_AUTHORIZED_COMPANY_ID, integrationId) : 'available';

  const gatesOpen =
    session &&
    admin &&
    company &&
    develop &&
    previewDeployment &&
    venue &&
    productionEnvironment &&
    host &&
    integration &&
    store &&
    complete &&
    operation &&
    serverAuthorization &&
    attemptAuthorization &&
    durable &&
    prior === 'available';

  let reserved: 'reserved' | 'already_used' | 'unreadable' | null = null;
  if (gatesOpen && options?.consume === true) {
    reserved = ledger.reserve({
      companyId: C6_H1_AUTHORIZED_COMPANY_ID,
      integrationId,
      attemptAuthorization: attemptSecret,
    });
  }

  const denials: C6H4Denial[] = [];
  if (!session) denials.push('session');
  if (!admin) denials.push('admin');
  if (!company) denials.push('company');
  if (!develop) denials.push('supabase');
  if (!previewDeployment) denials.push('preview_deployment');
  if (!venue) denials.push('venue');
  if (!productionEnvironment) denials.push('environment');
  if (!host) denials.push('host');
  if (!integration) denials.push('integration');
  if (!store) denials.push('credential_store');
  if (!complete) denials.push('credential_incomplete');
  if (!operation) denials.push('operation');
  if (!serverAuthorization) denials.push('server_authorization');
  if (!attemptAuthorization) denials.push('attempt_authorization');
  if (!durable || prior === 'unreadable' || reserved === 'unreadable') denials.push('attempt_store');
  if (prior === 'already_used' || reserved === 'already_used') denials.push('attempt_used');
  denials.push('live_disarmed');

  return {
    denials,
    bankCallAllowed: false,
    emissionArmed: false,
    sharedClientBlocked: isC6RemoteOperationBlocked('PRODUCTION', supabaseUrl),
    integrationId,
  };
}

export function prepareC6H4ProductionTokenCall(
  input: C6H4TokenInput,
  ledger: C6H4AttemptLedger,
): {
  ready: boolean;
  decision: ReturnType<typeof evaluateC6H4ProductionToken>;
  call: {
    phase: 'C6-H4';
    operation: 'token';
    url: typeof C6_H4_AUTH_URL;
    method: 'POST';
    grantType: typeof C6_AUTH_GRANT_TYPE;
    mtls: true;
    rejectUnauthorized: true;
    venue: 'admin_executor';
    credentialStore: typeof C6_H4_CREDENTIAL_STORE;
    credentialInvoked: false;
    tokenDiscardedAfterValidation: true;
  } | null;
  blocks: {
    emission: true;
    idempotencyReserve: true;
    boletoStatus: true;
    boletoPdf: true;
    webhook: true;
    financialWrite: true;
    pix: true;
    accounts: true;
    previewRoute: true;
    globalEmissionAuthorized: boolean;
  };
} {
  const decision = evaluateC6H4ProductionToken(input, ledger, { consume: false });
  const ready = decision.denials.length === 1 && decision.denials[0] === 'live_disarmed';
  return {
    ready,
    decision,
    call: ready
      ? {
          phase: 'C6-H4',
          operation: 'token',
          url: C6_H4_AUTH_URL,
          method: 'POST',
          grantType: C6_AUTH_GRANT_TYPE,
          mtls: true,
          rejectUnauthorized: true,
          venue: 'admin_executor',
          credentialStore: C6_H4_CREDENTIAL_STORE,
          credentialInvoked: false,
          tokenDiscardedAfterValidation: true,
        }
      : null,
    blocks: {
      emission: true,
      idempotencyReserve: true,
      boletoStatus: true,
      boletoPdf: true,
      webhook: true,
      financialWrite: true,
      pix: true,
      accounts: true,
      previewRoute: true,
      globalEmissionAuthorized: isC6BoletoSandboxLiveAuthorized('PRODUCTION'),
    },
  };
}

export type C6H4MockResponse = {
  status: number;
  bodyText: string;
  tlsError?: boolean;
};

export type C6H4TokenPublicResult = {
  phase: 'C6-H4';
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

function redact(value: string, material: C6H4TokenMaterial): string {
  let out = sanitizeC6ErrorBody(value);
  for (const secret of [material.clientSecret, material.clientId, material.certificatePem, material.privateKeyPem]) {
    const clean = String(secret || '').trim();
    if (clean.length >= 8) out = out.split(clean).join('[redacted]');
  }
  return out;
}

export async function rehearseC6H4ProductionToken(input: {
  authorization: C6H4TokenInput;
  ledger: C6H4AttemptLedger;
  material: C6H4TokenMaterial;
  fetchFn: (url: string, body: string) => Promise<C6H4MockResponse>;
}): Promise<
  | { ok: false; reason: C6H4Denial; liveDispatched: false; bankCallAllowed: false }
  | { ok: true; result: C6H4TokenPublicResult }
> {
  const decision = evaluateC6H4ProductionToken(input.authorization, input.ledger, { consume: true });
  const blocking = decision.denials.filter((reason) => reason !== 'live_disarmed');
  if (blocking.length > 0) {
    return { ok: false, reason: blocking[0], liveDispatched: false, bankCallAllowed: false };
  }

  let response: C6H4MockResponse;
  try {
    response = await input.fetchFn(C6_H4_AUTH_URL, 'grant_type=client_credentials');
  } catch {
    response = { status: 0, bodyText: '', tlsError: true };
  }

  if (response.tlsError) {
    return {
      ok: true,
      result: {
        phase: 'C6-H4',
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
        message: redact('mTLS rejeitado pelo certificado.', input.material),
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
  const accepted = response.status >= 200 && response.status < 300 && accessToken.length > 0;
  return {
    ok: true,
    result: {
      phase: 'C6-H4',
      transport: 'mock',
      liveDispatched: false,
      bankCallAllowed: false,
      httpStatus: response.status || null,
      tlsCompleted: true,
      certificateValidation: 'rejectUnauthorized',
      accessTokenPresent: accepted,
      expiresIn: accepted ? expiresIn : null,
      scopes: assessC6H1OAuthScopes(scopeText || null, scopeText.length > 0 && accepted),
      failureCode: accepted ? null : response.status === 401 || response.status === 403 ? 'AUTH_REJECTED' : 'AUTH_INVALID_RESPONSE',
      message: redact(
        accepted ? 'Autenticação simulada aceita. O access token não é exibido.' : 'Autenticação simulada recusada.',
        input.material,
      ),
    },
  };
}

/** Ponto único de envio real. Nesta fase não há rede. */
export function dispatchC6H4ProductionToken(): {
  dispatched: false;
  bankCallAllowed: false;
  reason: 'live_disarmed';
} {
  return { dispatched: false, bankCallAllowed: false, reason: 'live_disarmed' };
}
