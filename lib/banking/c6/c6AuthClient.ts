/**
 * Cliente OAuth2 client_credentials + mTLS do C6 Bank (Fase 3A).
 * Somente POST /v1/auth/. Nunca logar token, secret, certificado ou chave.
 */

import https from 'node:https';
import type { BankEnvironment } from '@/lib/banking/types';
import {
  buildC6AuthFormBody,
  getC6AuthHost,
  getC6AuthUrl,
} from '@/lib/banking/c6/c6Endpoints';
import {
  getCachedC6Token,
  setCachedC6Token,
  type C6CachedToken,
} from '@/lib/banking/c6/c6TokenCache';
import {
  C6_AT01_FORBIDDEN_PUBLIC_FRAGMENTS,
  parseC6OAuthBodyFields,
  toC6At01EvidencePublic,
  type C6At01EvidencePublic,
  type C6AuthFieldSource,
} from '@/lib/banking/c6/c6At01Evidence';
import type { C6CertificateInspectPublic } from '@/lib/banking/c6/c6LocalValidation';

export { sanitizeC6Scopes, formatC6At01EvidenceReport } from '@/lib/banking/c6/c6At01Evidence';
export type { C6At01EvidencePublic, C6AuthFieldSource } from '@/lib/banking/c6/c6At01Evidence';

export type C6AuthCredentials = {
  companyId: string;
  integrationId?: string | null;
  environment: BankEnvironment;
  clientId: string;
  clientSecret: string;
  certificatePem: string;
  privateKeyPem: string;
};

export type C6AuthSuccess = {
  ok: true;
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAtMs: number;
  scope?: string;
  environment: BankEnvironment;
  authUrlHost: string;
  fromCache: boolean;
  httpStatus: number | null;
  tokenTypeReturned: boolean;
  expiresInReturned: boolean;
  scopeReturned: boolean;
  tokenTypeRaw: string | null;
  expiresInRaw: number | null;
  scopeRaw: string | null;
};

export type C6AuthFailureCode =
  | 'MISSING_CLIENT_ID'
  | 'MISSING_CLIENT_SECRET'
  | 'MISSING_CERTIFICATE'
  | 'MISSING_PRIVATE_KEY'
  | 'MTLS_ERROR'
  | 'AUTH_REJECTED'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_INVALID_RESPONSE'
  | 'AUTH_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'PRODUCTION_AUTH_BLOCKED'
  | 'UNKNOWN';

export type C6AuthHttpDiagnosticPublic = {
  tlsCompleted: boolean;
  durationMs: number | null;
  contentType: string | null;
  retryAfter: string | null;
  server: string | null;
  requestId: string | null;
  headerNames: string[];
  sanitizedBody: string | null;
  remoteHost: string;
};

export type C6AuthFailure = {
  ok: false;
  code: C6AuthFailureCode;
  message: string;
  httpStatus?: number;
  environment: BankEnvironment;
  diagnostic?: C6AuthHttpDiagnosticPublic;
};

export type C6AuthResult = C6AuthSuccess | C6AuthFailure;

export type C6AuthFetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    agent: https.Agent;
  },
) => Promise<{
  status: number;
  bodyText: string;
  headers?: Record<string, string>;
  durationMs?: number;
}>;

const C6_AUTH_DIAGNOSTIC_HEADER_ALLOWLIST = [
  'content-type',
  'content-length',
  'date',
  'server',
  'retry-after',
  'x-request-id',
  'x-correlation-id',
  'x-amzn-requestid',
  'x-amzn-trace-id',
  'cf-ray',
  'x-cache',
  'via',
] as const;

export function sanitizeC6ErrorBody(raw: string): string {
  return String(raw || '')
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '[pem-redacted]')
    .replace(/"access_token"\s*:\s*"[^"]*"/gi, '"oauth":"[redacted]"')
    .replace(/access_token/gi, '[redacted]')
    .replace(/"client_secret"\s*:\s*"[^"]*"/gi, '"secret":"[redacted]"')
    .replace(/client_secret/gi, '[redacted]')
    .replace(/client_id=[^&\s]*/gi, 'client=[redacted]')
    .slice(0, 400);
}

function sanitizeC6HeaderValue(raw: string): string {
  return sanitizeC6ErrorBody(raw).slice(0, 120);
}

export function pickC6AuthDiagnosticHeaders(
  headers: Record<string, string> | undefined,
): Pick<
  C6AuthHttpDiagnosticPublic,
  'contentType' | 'retryAfter' | 'server' | 'requestId' | 'headerNames'
> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const name = String(key || '').trim().toLowerCase();
    if (!name || !C6_AUTH_DIAGNOSTIC_HEADER_ALLOWLIST.includes(name as typeof C6_AUTH_DIAGNOSTIC_HEADER_ALLOWLIST[number])) {
      continue;
    }
    const clean = sanitizeC6HeaderValue(String(value || ''));
    if (clean) normalized[name] = clean;
  }
  const requestId =
    normalized['x-request-id'] ||
    normalized['x-correlation-id'] ||
    normalized['x-amzn-requestid'] ||
    normalized['cf-ray'] ||
    null;
  return {
    contentType: normalized['content-type'] || null,
    retryAfter: normalized['retry-after'] || null,
    server: normalized['server'] || null,
    requestId,
    headerNames: Object.keys(normalized).sort(),
  };
}

export function buildC6AuthHttpDiagnostic(input: {
  tlsCompleted: boolean;
  durationMs?: number;
  headers?: Record<string, string>;
  bodyText?: string;
  remoteHost: string;
}): C6AuthHttpDiagnosticPublic {
  const picked = pickC6AuthDiagnosticHeaders(input.headers);
  const sanitizedBody = input.bodyText ? sanitizeC6ErrorBody(input.bodyText) : null;
  return {
    tlsCompleted: input.tlsCompleted,
    durationMs:
      typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
        ? Math.max(0, Math.round(input.durationMs))
        : null,
    contentType: picked.contentType,
    retryAfter: picked.retryAfter,
    server: picked.server,
    requestId: picked.requestId,
    headerNames: picked.headerNames,
    sanitizedBody: sanitizedBody || null,
    remoteHost: input.remoteHost,
  };
}

export function mapC6AuthHttpError(status: number): C6AuthFailureCode {
  if (status === 401) return 'AUTH_REJECTED';
  if (status === 403) return 'AUTH_FORBIDDEN';
  if (status === 502 || status === 503 || status === 504) return 'AUTH_UNAVAILABLE';
  return 'AUTH_REJECTED';
}

export function humanizeC6AuthFailure(
  code: C6AuthFailureCode,
  httpStatus?: number,
): string {
  switch (code) {
    case 'MISSING_CLIENT_ID':
      return 'Client ID ausente. Salve a configuração antes de testar.';
    case 'MISSING_CLIENT_SECRET':
      return 'Client Secret ausente. Salve o Client Secret antes de testar.';
    case 'MISSING_CERTIFICATE':
      return 'Certificado ausente. Envie o certificado .crt do C6 antes de testar.';
    case 'MISSING_PRIVATE_KEY':
      return 'Chave privada ausente. Envie a chave .key do C6 antes de testar.';
    case 'MTLS_ERROR':
      return 'mTLS rejeitado. Verifique se o certificado .crt e a chave .key correspondem e são os arquivos do C6.';
    case 'AUTH_REJECTED':
      if (httpStatus === 401) {
        return 'Autenticação rejeitada (401). Client ID ou Client Secret inválidos.';
      }
      return 'Autenticação rejeitada pelo C6 Bank. Verifique Client ID, Secret e certificado.';
    case 'AUTH_FORBIDDEN':
      return 'Autenticação recusada (403). A aplicação C6 não está autorizada para este ambiente.';
    case 'AUTH_UNAVAILABLE':
      return `O C6 Bank Sandbox retornou indisponibilidade (HTTP ${httpStatus || 503}). As credenciais não foram classificadas como inválidas.`;
    case 'AUTH_INVALID_RESPONSE':
      return 'Resposta de autenticação inválida (sem access_token).';
    case 'NETWORK_ERROR':
      return 'Falha de rede ao contatar o C6 Bank.';
    case 'PRODUCTION_AUTH_BLOCKED':
      return 'Nesta fase o teste C6 usa somente Sandbox. Produção não é chamada.';
    default:
      return 'Falha ao autenticar no C6 Bank.';
  }
}

function isTlsOrCertError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  return (
    /cert|SSL|TLS|UNABLE_TO|ECONNRESET|ERR_OSSL|unable to verify|certificate/i.test(msg) ||
    /CERT|SSL|TLS|ECONNRESET|ERR_OSSL/i.test(code)
  );
}

const defaultFetch: C6AuthFetchFn = async (url, init) => {
  const started = Date.now();
  const { statusCode, body, headers } = await new Promise<{
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: init.method,
        headers: init.headers,
        agent: init.agent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const hdrs: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers || {})) {
            if (typeof value === 'string') hdrs[key.toLowerCase()] = value;
            else if (Array.isArray(value) && value[0]) hdrs[key.toLowerCase()] = String(value[0]);
          }
          resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: hdrs,
          });
        });
      },
    );
    req.on('error', reject);
    req.write(init.body);
    req.end();
  });
  return {
    status: statusCode,
    bodyText: body,
    headers,
    durationMs: Date.now() - started,
  };
};

export async function requestC6AccessToken(
  creds: C6AuthCredentials,
  options?: {
    bypassCache?: boolean;
    fetchFn?: C6AuthFetchFn;
    nowMs?: number;
    allowProduction?: boolean;
  },
): Promise<C6AuthResult> {
  const environment = creds.environment;
  const clientId = String(creds.clientId || '').trim();
  const clientSecret = String(creds.clientSecret || '').trim();
  const certificatePem = String(creds.certificatePem || '').trim();
  const privateKeyPem = String(creds.privateKeyPem || '').trim();

  if (environment === 'PRODUCTION' && options?.allowProduction !== true) {
    return {
      ok: false,
      code: 'PRODUCTION_AUTH_BLOCKED',
      message: humanizeC6AuthFailure('PRODUCTION_AUTH_BLOCKED'),
      environment,
    };
  }

  if (!clientId) {
    return {
      ok: false,
      code: 'MISSING_CLIENT_ID',
      message: humanizeC6AuthFailure('MISSING_CLIENT_ID'),
      environment,
    };
  }
  if (!clientSecret) {
    return {
      ok: false,
      code: 'MISSING_CLIENT_SECRET',
      message: humanizeC6AuthFailure('MISSING_CLIENT_SECRET'),
      environment,
    };
  }
  if (!certificatePem) {
    return {
      ok: false,
      code: 'MISSING_CERTIFICATE',
      message: humanizeC6AuthFailure('MISSING_CERTIFICATE'),
      environment,
    };
  }
  if (!privateKeyPem) {
    return {
      ok: false,
      code: 'MISSING_PRIVATE_KEY',
      message: humanizeC6AuthFailure('MISSING_PRIVATE_KEY'),
      environment,
    };
  }

  if (!options?.bypassCache) {
    const cached = getCachedC6Token(
      creds.companyId,
      environment,
      30_000,
      creds.integrationId,
    );
    if (cached) {
      return {
        ok: true,
        accessToken: cached.accessToken,
        tokenType: cached.tokenType,
        expiresIn: Math.max(0, Math.floor((cached.expiresAtMs - Date.now()) / 1000)),
        expiresAtMs: cached.expiresAtMs,
        scope: cached.scope,
        environment,
        authUrlHost: getC6AuthHost(environment),
        fromCache: true,
        httpStatus: null,
        tokenTypeReturned: false,
        expiresInReturned: false,
        scopeReturned: false,
        tokenTypeRaw: null,
        expiresInRaw: null,
        scopeRaw: null,
      };
    }
  }

  const authUrl = getC6AuthUrl(environment);
  const authUrlHost = getC6AuthHost(environment);

  let agent: https.Agent;
  try {
    agent = new https.Agent({
      cert: certificatePem,
      key: privateKeyPem,
      rejectUnauthorized: true,
      keepAlive: false,
    });
  } catch {
    return {
      ok: false,
      code: 'MTLS_ERROR',
      message: humanizeC6AuthFailure('MTLS_ERROR'),
      environment,
    };
  }

  const body = buildC6AuthFormBody(clientId, clientSecret);
  const fetchFn = options?.fetchFn || defaultFetch;

  let status = 0;
  let bodyText = '';
  let responseHeaders: Record<string, string> | undefined;
  let durationMs: number | undefined;
  const requestStarted = Date.now();
  try {
    const res = await fetchFn(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
      agent,
    });
    status = res.status;
    bodyText = res.bodyText;
    responseHeaders = res.headers;
    durationMs = res.durationMs ?? Date.now() - requestStarted;
  } catch (err) {
    const code = isTlsOrCertError(err) ? 'MTLS_ERROR' : 'NETWORK_ERROR';
    return {
      ok: false,
      code,
      message: humanizeC6AuthFailure(code),
      environment,
      diagnostic: buildC6AuthHttpDiagnostic({
        tlsCompleted: false,
        durationMs: Date.now() - requestStarted,
        remoteHost: authUrlHost,
      }),
    };
  } finally {
    try {
      agent.destroy();
    } catch {
      /* ignore */
    }
  }

  if (status < 200 || status >= 300) {
    const code = mapC6AuthHttpError(status);
    return {
      ok: false,
      code,
      message: humanizeC6AuthFailure(code, status),
      httpStatus: status,
      environment,
      diagnostic: buildC6AuthHttpDiagnostic({
        tlsCompleted: true,
        durationMs,
        headers: responseHeaders,
        bodyText,
        remoteHost: authUrlHost,
      }),
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      code: 'AUTH_INVALID_RESPONSE',
      message: humanizeC6AuthFailure('AUTH_INVALID_RESPONSE'),
      httpStatus: status,
      environment,
    };
  }

  const accessToken = String(parsed.access_token || '').trim();
  if (!accessToken) {
    return {
      ok: false,
      code: 'AUTH_INVALID_RESPONSE',
      message: humanizeC6AuthFailure('AUTH_INVALID_RESPONSE'),
      httpStatus: status,
      environment,
    };
  }

  const fields = parseC6OAuthBodyFields(parsed);
  const now = options?.nowMs ?? Date.now();
  const expiresAtMs = now + fields.expiresInForCache * 1000;
  const scope = fields.scopeRaw || undefined;

  const cached: C6CachedToken = {
    accessToken,
    expiresAtMs,
    tokenType: fields.tokenTypeForCache,
    scope,
  };
  setCachedC6Token(creds.companyId, environment, cached, creds.integrationId);

  return {
    ok: true,
    accessToken,
    tokenType: fields.tokenTypeForCache,
    expiresIn: fields.expiresInForCache,
    expiresAtMs,
    scope,
    environment,
    authUrlHost,
    fromCache: false,
    httpStatus: status,
    tokenTypeReturned: fields.tokenTypeReturned,
    expiresInReturned: fields.expiresInReturned,
    scopeReturned: fields.scopeReturned,
    tokenTypeRaw: fields.tokenType,
    expiresInRaw: fields.expiresIn,
    scopeRaw: fields.scopeRaw,
  };
}

/** Resposta pública do teste — sem token. */
export type C6ConnectionTestPublic = {
  success: boolean;
  environment: BankEnvironment;
  tokenType: string | null;
  tokenTypeSource: C6AuthFieldSource;
  expiresIn: number | null;
  expiresInSource: C6AuthFieldSource;
  scope: string | null;
  scopeSource: C6AuthFieldSource;
  scopes: string[];
  message: string;
  status: 'UNTESTED' | 'VALIDATED' | 'FAILED';
  testedAt: string;
  httpStatus: number | null;
  authUrlHost?: string;
  method: 'POST';
  path: '/v1/auth/';
  grantType: 'client_credentials';
  oauthCredentialReturned: boolean;
  fromCache: boolean;
  evidence: C6At01EvidencePublic;
  code?: C6AuthFailureCode;
  inspectOnly?: boolean;
  certificateInspect?: C6CertificateInspectPublic | null;
  httpDiagnostic?: C6AuthHttpDiagnosticPublic | null;
};

export function toPublicC6ConnectionTest(
  result: C6AuthResult,
  testedAt = new Date().toISOString(),
): C6ConnectionTestPublic {
  if (result.ok) {
    const tokenTypeSource: C6AuthFieldSource = result.fromCache
      ? 'absent'
      : result.tokenTypeReturned
        ? 'returned'
        : 'absent';
    const expiresInSource: C6AuthFieldSource = result.fromCache
      ? 'absent'
      : result.expiresInReturned
        ? 'returned'
        : 'absent';
    const scopeSource: C6AuthFieldSource = result.fromCache
      ? 'absent'
      : result.scopeReturned
        ? 'returned'
        : 'absent';
    const evidence = toC6At01EvidencePublic({
      success: true,
      environment: result.environment,
      httpStatus: result.fromCache ? null : result.httpStatus,
      testedAt,
      tokenType: result.tokenTypeRaw,
      tokenTypeSource,
      expiresIn: result.expiresInRaw,
      expiresInSource,
      scopeRaw: result.scopeRaw,
      scopeSource,
      oauthCredentialReturned: true,
      fromCache: result.fromCache,
      authUrlHost: result.authUrlHost,
    });
    return {
      success: true,
      environment: result.environment,
      tokenType: evidence.tokenType,
      tokenTypeSource: evidence.tokenTypeSource,
      expiresIn: evidence.expiresIn,
      expiresInSource: evidence.expiresInSource,
      scope: evidence.scope,
      scopeSource: evidence.scopeSource,
      scopes: evidence.scopes,
      message: 'Conexão validada.',
      status: 'VALIDATED',
      testedAt,
      httpStatus: evidence.httpStatus,
      authUrlHost: evidence.authUrlHost,
      method: evidence.method,
      path: evidence.path,
      grantType: evidence.grantType,
      oauthCredentialReturned: true,
      fromCache: evidence.fromCache,
      evidence,
    };
  }

  const evidence = toC6At01EvidencePublic({
    success: false,
    environment: result.environment,
    httpStatus: result.httpStatus ?? null,
    testedAt,
    tokenTypeSource: 'absent',
    expiresInSource: 'absent',
    scopeSource: 'absent',
    oauthCredentialReturned: false,
    fromCache: false,
  });
  return {
    success: false,
    environment: result.environment,
    tokenType: null,
    tokenTypeSource: 'absent',
    expiresIn: null,
    expiresInSource: 'absent',
    scope: null,
    scopeSource: 'absent',
    scopes: [],
    message: result.message,
    status: 'FAILED',
    testedAt,
    httpStatus: evidence.httpStatus,
    authUrlHost: evidence.authUrlHost,
    method: evidence.method,
    path: evidence.path,
    grantType: evidence.grantType,
    oauthCredentialReturned: false,
    fromCache: false,
    evidence,
    code: result.code,
    httpDiagnostic: result.diagnostic || null,
  };
}

export function assertC6ConnectionTestPublicSafe(payload: C6ConnectionTestPublic): void {
  const json = JSON.stringify(payload);
  for (const token of C6_AT01_FORBIDDEN_PUBLIC_FRAGMENTS) {
    if (json.includes(token)) {
      throw new Error(`Resposta C6 de teste expõe material sensível (${token}).`);
    }
  }
}
