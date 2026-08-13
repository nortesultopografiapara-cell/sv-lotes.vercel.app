/**
 * Cliente OAuth2 client_credentials + mTLS do Banco Inter (Fase B).
 * Nunca logar token, secret, certificado ou chave.
 */

import https from 'node:https';
import type { BankEnvironment } from '@/lib/banking/types';
import {
  INTER_OAUTH_SCOPES,
  getInterOAuthTokenUrl,
} from '@/lib/banking/inter/interEndpoints';
import {
  getCachedInterToken,
  setCachedInterToken,
  type InterCachedToken,
} from '@/lib/banking/inter/interTokenCache';

export type InterOAuthCredentials = {
  companyId: string;
  /** Identidade da conta Inter (token cache e mTLS isolados). */
  integrationId?: string | null;
  environment: BankEnvironment;
  clientId: string;
  clientSecret: string;
  certificatePem: string;
  privateKeyPem: string;
};

export type InterOAuthSuccess = {
  ok: true;
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAtMs: number;
  scope?: string;
  environment: BankEnvironment;
  tokenUrlHost: string;
  fromCache: boolean;
};

export type InterOAuthFailure = {
  ok: false;
  code:
    | 'MISSING_CLIENT_ID'
    | 'MISSING_CLIENT_SECRET'
    | 'MISSING_CERTIFICATE'
    | 'MISSING_PRIVATE_KEY'
    | 'MTLS_ERROR'
    | 'OAUTH_REJECTED'
    | 'OAUTH_INVALID_RESPONSE'
    | 'INTEGRATION_NOT_READY'
    | 'SCOPE_UNAUTHORIZED'
    | 'NETWORK_ERROR'
    | 'UNKNOWN';
  message: string;
  httpStatus?: number;
  environment: BankEnvironment;
};

export type InterOAuthResult = InterOAuthSuccess | InterOAuthFailure;

export type InterOAuthFetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    agent: https.Agent;
  },
) => Promise<{ status: number; bodyText: string }>;

function sanitizeInterErrorBody(raw: string): string {
  return String(raw || '')
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '[pem-redacted]')
    .replace(/"access_token"\s*:\s*"[^"]*"/gi, '"access_token":"[redacted]"')
    .replace(/"client_secret"\s*:\s*"[^"]*"/gi, '"client_secret":"[redacted]"')
    .slice(0, 400);
}

export function mapInterOAuthHttpError(status: number, bodyText: string): InterOAuthFailure['code'] {
  const lower = bodyText.toLowerCase();
  if (
    lower.includes('invalid_scope') ||
    (lower.includes('scope') &&
      (lower.includes('unauthorized') || lower.includes('not authorized')))
  ) {
    return 'SCOPE_UNAUTHORIZED';
  }
  if (
    (lower.includes('aplicação') && lower.includes('novo')) ||
    lower.includes('not approved') ||
    lower.includes('aguardando') ||
    (lower.includes('pending') && lower.includes('approv')) ||
    status === 403
  ) {
    return 'INTEGRATION_NOT_READY';
  }
  if (
    status === 401 ||
    lower.includes('invalid_client') ||
    lower.includes('unauthorized') ||
    lower.includes('client authentication failed')
  ) {
    return 'OAUTH_REJECTED';
  }
  return 'OAUTH_REJECTED';
}

export function humanizeInterOAuthFailure(
  code: InterOAuthFailure['code'],
  httpStatus?: number,
): string {
  switch (code) {
    case 'MISSING_CLIENT_ID':
      return 'Client ID ausente. Salve a configuração antes de testar.';
    case 'MISSING_CLIENT_SECRET':
      return 'Client Secret ausente. Salve o Client Secret antes de testar.';
    case 'MISSING_CERTIFICATE':
      return 'Certificado ausente. Envie o certificado do Inter antes de testar.';
    case 'MISSING_PRIVATE_KEY':
      return 'Chave privada ausente. Envie a chave privada do Inter antes de testar.';
    case 'MTLS_ERROR':
      return 'mTLS rejeitado. Verifique se certificado e chave privada correspondem e são os arquivos do Inter.';
    case 'SCOPE_UNAUTHORIZED':
      return 'Scope não autorizado. Confirme boleto-cobranca.read e boleto-cobranca.write na aplicação Inter.';
    case 'INTEGRATION_NOT_READY':
      return 'Integração ainda não liberada pelo Banco Inter (status Novo/aguardando aprovação). Mantendo DRAFT.';
    case 'OAUTH_REJECTED':
      if (httpStatus === 401) {
        return 'OAuth rejeitado. Client ID inválido ou Client Secret rejeitado.';
      }
      return 'OAuth rejeitado pelo Banco Inter. Verifique Client ID, Secret e status da aplicação.';
    case 'OAUTH_INVALID_RESPONSE':
      return 'Resposta OAuth inválida (sem access_token).';
    case 'NETWORK_ERROR':
      return 'Falha de rede ao contatar o Banco Inter.';
    default:
      return 'Falha ao autenticar no Banco Inter.';
  }
}

function isTlsOrCertError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
  return (
    /cert|SSL|TLS|UNABLE_TO|ECONNRESET|ERR_OSSL|unable to verify|certificate/i.test(msg) ||
    /CERT|SSL|TLS|ECONNRESET|ERR_OSSL/i.test(code)
  );
}

const defaultFetch: InterOAuthFetchFn = async (url, init) => {
  const { statusCode, body } = await new Promise<{ statusCode: number; body: string }>(
    (resolve, reject) => {
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
            resolve({
              statusCode: res.statusCode || 0,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );
      req.on('error', reject);
      req.write(init.body);
      req.end();
    },
  );
  return { status: statusCode, bodyText: body };
};

export async function requestInterAccessToken(
  creds: InterOAuthCredentials,
  options?: {
    bypassCache?: boolean;
    fetchFn?: InterOAuthFetchFn;
    nowMs?: number;
  },
): Promise<InterOAuthResult> {
  const environment = creds.environment;
  const clientId = String(creds.clientId || '').trim();
  const clientSecret = String(creds.clientSecret || '').trim();
  const certificatePem = String(creds.certificatePem || '').trim();
  const privateKeyPem = String(creds.privateKeyPem || '').trim();

  if (!clientId) {
    return {
      ok: false,
      code: 'MISSING_CLIENT_ID',
      message: humanizeInterOAuthFailure('MISSING_CLIENT_ID'),
      environment,
    };
  }
  if (!clientSecret) {
    return {
      ok: false,
      code: 'MISSING_CLIENT_SECRET',
      message: humanizeInterOAuthFailure('MISSING_CLIENT_SECRET'),
      environment,
    };
  }
  if (!certificatePem) {
    return {
      ok: false,
      code: 'MISSING_CERTIFICATE',
      message: humanizeInterOAuthFailure('MISSING_CERTIFICATE'),
      environment,
    };
  }
  if (!privateKeyPem) {
    return {
      ok: false,
      code: 'MISSING_PRIVATE_KEY',
      message: humanizeInterOAuthFailure('MISSING_PRIVATE_KEY'),
      environment,
    };
  }

  if (!options?.bypassCache) {
    const cached = getCachedInterToken(
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
        tokenUrlHost: new URL(getInterOAuthTokenUrl(environment)).host,
        fromCache: true,
      };
    }
  }

  const tokenUrl = getInterOAuthTokenUrl(environment);
  const tokenUrlHost = new URL(tokenUrl).host;

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
      message: humanizeInterOAuthFailure('MTLS_ERROR'),
      environment,
    };
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: INTER_OAUTH_SCOPES,
  }).toString();

  const fetchFn = options?.fetchFn || defaultFetch;

  let status = 0;
  let bodyText = '';
  try {
    const res = await fetchFn(tokenUrl, {
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
  } catch (err) {
    const code = isTlsOrCertError(err) ? 'MTLS_ERROR' : 'NETWORK_ERROR';
    return {
      ok: false,
      code,
      message: humanizeInterOAuthFailure(code),
      environment,
    };
  } finally {
    try {
      agent.destroy();
    } catch {
      /* ignore */
    }
  }

  if (status < 200 || status >= 300) {
    const code = mapInterOAuthHttpError(status, bodyText);
    // body sanitizado só para diagnóstico interno — não logamos aqui
    void sanitizeInterErrorBody(bodyText);
    return {
      ok: false,
      code,
      message: humanizeInterOAuthFailure(code, status),
      httpStatus: status,
      environment,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      code: 'OAUTH_INVALID_RESPONSE',
      message: humanizeInterOAuthFailure('OAUTH_INVALID_RESPONSE'),
      httpStatus: status,
      environment,
    };
  }

  const accessToken = String(parsed.access_token || '').trim();
  if (!accessToken) {
    return {
      ok: false,
      code: 'OAUTH_INVALID_RESPONSE',
      message: humanizeInterOAuthFailure('OAUTH_INVALID_RESPONSE'),
      httpStatus: status,
      environment,
    };
  }

  const expiresIn = Number(parsed.expires_in);
  const ttlSec = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  const now = options?.nowMs ?? Date.now();
  const expiresAtMs = now + ttlSec * 1000;
  const tokenType = String(parsed.token_type || 'Bearer');
  const scope = parsed.scope ? String(parsed.scope) : INTER_OAUTH_SCOPES;

  const cached: InterCachedToken = {
    accessToken,
    expiresAtMs,
    tokenType,
    scope,
  };
  setCachedInterToken(creds.companyId, environment, cached, creds.integrationId);

  return {
    ok: true,
    accessToken,
    tokenType,
    expiresIn: ttlSec,
    expiresAtMs,
    scope,
    environment,
    tokenUrlHost,
    fromCache: false,
  };
}

/** Resposta pública do teste — sem token. */
export type InterConnectionTestPublic = {
  ok: boolean;
  message: string;
  environment: BankEnvironment;
  authStatus: 'VERIFIED' | 'FAILED' | 'DRAFT';
  testedAt: string;
  connectionVerified: boolean;
  code?: InterOAuthFailure['code'];
  tokenUrlHost?: string;
  expiresIn?: number;
  fromCache?: boolean;
};

export function toPublicInterConnectionTest(
  result: InterOAuthResult,
  testedAt = new Date().toISOString(),
): InterConnectionTestPublic {
  if (result.ok) {
    return {
      ok: true,
      message: 'Conexão com Banco Inter realizada com sucesso.',
      environment: result.environment,
      authStatus: 'VERIFIED',
      testedAt,
      connectionVerified: true,
      tokenUrlHost: result.tokenUrlHost,
      expiresIn: result.expiresIn,
      fromCache: result.fromCache,
    };
  }
  return {
    ok: false,
    message: result.message,
    environment: result.environment,
    authStatus: result.code === 'INTEGRATION_NOT_READY' ? 'DRAFT' : 'FAILED',
    testedAt,
    connectionVerified: false,
    code: result.code,
  };
}
