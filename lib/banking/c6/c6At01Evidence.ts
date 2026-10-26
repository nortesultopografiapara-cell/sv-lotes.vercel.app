/**
 * Evidência sanitizada AT_01 (autenticação C6).
 * Sem access_token, secret, certificado, chave ou headers.
 * Não persiste em banco, log ou monitoramento.
 */

import type { BankEnvironment } from '@/lib/banking/types';
import { C6_AUTH_GRANT_TYPE, C6_AUTH_HOST } from '@/lib/banking/c6/c6Endpoints';

export type C6AuthFieldSource = 'returned' | 'absent';

export type C6At01EvidencePublic = {
  testCase: 'AT_01';
  success: boolean;
  environment: BankEnvironment;
  method: 'POST';
  authUrlHost: string;
  path: '/v1/auth/';
  grantType: typeof C6_AUTH_GRANT_TYPE;
  httpStatus: number | null;
  testedAt: string;
  tokenType: string | null;
  tokenTypeSource: C6AuthFieldSource;
  expiresIn: number | null;
  expiresInSource: C6AuthFieldSource;
  scope: string | null;
  scopeSource: C6AuthFieldSource;
  scopes: string[];
  oauthCredentialReturned: boolean;
  fromCache: boolean;
};

export type C6ParsedOAuthBodyFields = {
  tokenTypeReturned: boolean;
  tokenType: string | null;
  tokenTypeForCache: string;
  expiresInReturned: boolean;
  expiresIn: number | null;
  expiresInForCache: number;
  scopeReturned: boolean;
  scopeRaw: string | null;
};

const DEFAULT_TOKEN_TYPE_FOR_CACHE = 'Bearer';
const DEFAULT_EXPIRES_IN_FOR_CACHE = 3600;

export function sanitizeC6Scopes(raw: string | undefined | null): string[] {
  return String(raw || '')
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => /^[A-Za-z0-9:._\-/]{1,80}$/.test(part))
    .slice(0, 40);
}

function hasOwn(parsed: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(parsed, key);
}

function asTrimmedString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

export function parseC6OAuthBodyFields(
  parsed: Record<string, unknown>,
): C6ParsedOAuthBodyFields {
  const tokenTypeReturned = hasOwn(parsed, 'token_type');
  const tokenTypeText = asTrimmedString(parsed.token_type).slice(0, 40);
  const tokenType = tokenTypeReturned && tokenTypeText ? tokenTypeText : null;

  const expiresInReturned = hasOwn(parsed, 'expires_in');
  const expiresInNum = Number(parsed.expires_in);
  const expiresInValid =
    expiresInReturned && Number.isFinite(expiresInNum) && expiresInNum > 0 && expiresInNum < 86_400 * 30;
  const expiresIn = expiresInValid ? expiresInNum : null;

  const scopeReturned = hasOwn(parsed, 'scope');
  const scopeText = asTrimmedString(parsed.scope);
  const scopeRaw = scopeReturned && scopeText ? scopeText : null;

  return {
    tokenTypeReturned,
    tokenType,
    tokenTypeForCache: tokenType || DEFAULT_TOKEN_TYPE_FOR_CACHE,
    expiresInReturned,
    expiresIn,
    expiresInForCache: expiresIn ?? DEFAULT_EXPIRES_IN_FOR_CACHE,
    scopeReturned,
    scopeRaw,
  };
}

export function c6AuthHostForEnvironment(environment: BankEnvironment): string {
  return environment === 'PRODUCTION' ? C6_AUTH_HOST.PRODUCTION : C6_AUTH_HOST.SANDBOX;
}

function fieldLabel(source: C6AuthFieldSource, displayed: string): string {
  return source === 'returned' ? `${displayed} [retornado pelo C6]` : 'não retornado [não usar valor padrão no AT_01]';
}

export function formatC6At01EvidenceReport(evidence: C6At01EvidencePublic): string {
  const testedAt = evidence.testedAt || '';
  let local = '';
  try {
    local = testedAt
      ? new Date(testedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : '';
  } catch {
    local = '';
  }

  const scopeDisplay =
    evidence.scopeSource === 'returned'
      ? evidence.scope || '(presente; vazio após sanitização)'
      : null;

  const lines = [
    'AT_01 — Autenticação C6 Bank (sanitizado)',
    `Caso: ${evidence.testCase}`,
    `Resultado: ${evidence.success ? 'sucesso' : 'falha'}`,
    `Ambiente: ${evidence.environment === 'PRODUCTION' ? 'Produção' : 'Sandbox'}`,
    `Endpoint: ${evidence.method} https://${evidence.authUrlHost}${evidence.path}`,
    `grant_type: ${evidence.grantType}`,
    `HTTP status (C6): ${evidence.httpStatus == null ? 'não capturado' : String(evidence.httpStatus)}`,
    `Data/hora (UTC): ${testedAt || 'não capturada'}`,
    `Data/hora (America/Sao_Paulo): ${local || 'não capturada'}`,
    `token_type: ${fieldLabel(evidence.tokenTypeSource, evidence.tokenType || '')}`,
    `expires_in: ${fieldLabel(
      evidence.expiresInSource,
      evidence.expiresIn == null ? '' : String(evidence.expiresIn),
    )}`,
    `scope: ${
      evidence.scopeSource === 'returned'
        ? `${scopeDisplay} [retornado pelo C6]`
        : 'não retornado [não usar valor padrão no AT_01]'
    }`,
    evidence.oauthCredentialReturned
      ? 'oauth_credential: presente na resposta do banco (valor omitido)'
      : 'oauth_credential: não confirmada',
    evidence.fromCache
      ? 'Origem: cache em memória — não usar como evidência AT_01'
      : 'Origem: resposta HTTP desta chamada',
    'Campos omitidos: oauth credential, Client Secret, certificado, chave privada, headers.',
  ];

  return lines.join('\n');
}

export function toC6At01EvidencePublic(input: {
  success: boolean;
  environment: BankEnvironment;
  httpStatus?: number | null;
  testedAt: string;
  tokenType?: string | null;
  tokenTypeSource?: C6AuthFieldSource;
  expiresIn?: number | null;
  expiresInSource?: C6AuthFieldSource;
  scopeRaw?: string | null;
  scopeSource?: C6AuthFieldSource;
  oauthCredentialReturned?: boolean;
  fromCache?: boolean;
  authUrlHost?: string;
}): C6At01EvidencePublic {
  const tokenTypeSource = input.tokenTypeSource || 'absent';
  const expiresInSource = input.expiresInSource || 'absent';
  const scopeSource = input.scopeSource || 'absent';
  const scopes = scopeSource === 'returned' ? sanitizeC6Scopes(input.scopeRaw) : [];
  const scope = scopes.length > 0 ? scopes.join(' ') : null;

  return {
    testCase: 'AT_01',
    success: input.success,
    environment: input.environment,
    method: 'POST',
    authUrlHost: input.authUrlHost || c6AuthHostForEnvironment(input.environment),
    path: '/v1/auth/',
    grantType: C6_AUTH_GRANT_TYPE,
    httpStatus: typeof input.httpStatus === 'number' ? input.httpStatus : null,
    testedAt: input.testedAt,
    tokenType: tokenTypeSource === 'returned' ? input.tokenType || null : null,
    tokenTypeSource,
    expiresIn: expiresInSource === 'returned' ? input.expiresIn ?? null : null,
    expiresInSource,
    scope,
    scopeSource,
    scopes,
    oauthCredentialReturned: Boolean(input.oauthCredentialReturned),
    fromCache: Boolean(input.fromCache),
  };
}

export function isC6At01EvidencePublic(value: unknown): value is C6At01EvidencePublic {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    row.testCase === 'AT_01' &&
    typeof row.success === 'boolean' &&
    (row.environment === 'SANDBOX' || row.environment === 'PRODUCTION') &&
    (row.httpStatus === null || typeof row.httpStatus === 'number') &&
    typeof row.testedAt === 'string' &&
    (row.tokenTypeSource === 'returned' || row.tokenTypeSource === 'absent') &&
    (row.expiresInSource === 'returned' || row.expiresInSource === 'absent') &&
    (row.scopeSource === 'returned' || row.scopeSource === 'absent') &&
    typeof row.oauthCredentialReturned === 'boolean'
  );
}

export const C6_AT01_FORBIDDEN_PUBLIC_FRAGMENTS = [
  'access_token',
  'accessToken',
  'client_secret',
  'clientSecret',
  'BEGIN CERTIFICATE',
  'BEGIN PRIVATE KEY',
  'BEGIN RSA PRIVATE KEY',
  'BEGIN EC PRIVATE KEY',
  'encrypted_payload',
  'Authorization',
] as const;
