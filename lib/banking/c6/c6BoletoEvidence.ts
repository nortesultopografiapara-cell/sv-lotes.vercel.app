/**
 * Evidência sanitizada B_01–B_08 (boleto C6).
 * Sem token, secret, certificado, Authorization, tax_id completo ou PDF.
 */

import type { BankEnvironment } from '@/lib/banking/types';
import type { C6BoletoPreparedHttp } from '@/lib/banking/c6/c6BoletoTypes';
import type { C6BoletoOperation } from '@/lib/banking/c6/c6BoletoOpenApi';
import { C6_AT01_FORBIDDEN_PUBLIC_FRAGMENTS } from '@/lib/banking/c6/c6At01Evidence';
import {
  C6_BOLETO_HOMOLOG_CASES,
  isC6BoletoHomologCase,
  type C6BoletoEvidenceCase,
} from '@/lib/banking/c6/c6BoletoHomologCatalog';

export const C6_BOLETO_FORBIDDEN_PUBLIC_FRAGMENTS = [
  ...C6_AT01_FORBIDDEN_PUBLIC_FRAGMENTS,
] as const;

export type C6BoletoEvidencePublic = {
  testCase: C6BoletoEvidenceCase;
  success: boolean;
  blocked: boolean;
  environment: BankEnvironment;
  companyId: string;
  operation: C6BoletoOperation | 'webhook';
  method: string;
  host: string;
  path: string;
  httpStatus: number | null;
  roteiroExpectedStatus: number | null;
  openapiExpectedStatus: number | null;
  billingScheme: string | null;
  executed: boolean;
  testedAt: string;
  requestBody: Record<string, unknown> | null;
  responseBody: Record<string, unknown> | string | null;
  responseContentType: string | null;
  message: string;
};

function maskTaxId(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}*****${digits.slice(-2)}`;
  if (digits.length === 14) return `${digits.slice(0, 4)}********${digits.slice(-2)}`;
  return '[tax_id-redacted]';
}

function sanitizeJsonValue(value: unknown, key = ''): unknown {
  if (value == null) return value;
  const lower = key.toLowerCase();
  if (
    lower.includes('tax_id') ||
    lower.includes('taxid') ||
    lower === 'cpf' ||
    lower === 'cnpj'
  ) {
    return maskTaxId(value);
  }
  if (lower.includes('email')) return '[email-redacted]';
  if (lower.includes('authorization') || lower.includes('access_token') || lower.includes('secret')) {
    return '[redacted]';
  }
  if (lower.includes('base64') || lower.includes('pdf')) {
    const len = String(value || '').length;
    return `[pdf-redacted:${len}]`;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonValue(item));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeJsonValue(v, k);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 400) return `${value.slice(0, 120)}…[truncated]`;
  return value;
}

export function sanitizeC6BoletoJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return sanitizeJsonValue(value) as Record<string, unknown>;
}

function classifyC6BoletoResponseKind(
  bodyText: string,
  contentType: string,
): 'pdf' | 'json' | 'binary' {
  const raw = String(bodyText || '');
  const type = String(contentType || '').toLowerCase();
  if (/^\[(pdf|binary)-bytes:\d+/.test(raw)) return 'pdf';
  if (type.includes('pdf') || raw.startsWith('%PDF')) return 'pdf';
  if (type.includes('json')) return 'json';
  if (type.includes('octet-stream')) return 'binary';
  return 'json';
}

export function parseC6BoletoResponseBody(
  bodyText: string,
  contentType = '',
): Record<string, unknown> | string | null {
  const raw = String(bodyText || '');
  if (!raw) return null;
  const kind = classifyC6BoletoResponseKind(raw, contentType);
  if (kind === 'pdf' || kind === 'binary') {
    if (/^\[(pdf|binary)-bytes:\d+/.test(raw)) return raw;
    return `[pdf-bytes:${raw.length}]`;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return sanitizeC6BoletoJson(parsed);
    }
    return { value: sanitizeJsonValue(parsed) };
  } catch {
    return raw.slice(0, 400);
  }
}

export function toC6BoletoEvidencePublic(input: {
  testCase: C6BoletoEvidenceCase;
  success: boolean;
  blocked?: boolean;
  executed?: boolean;
  environment: BankEnvironment;
  companyId: string;
  operation: C6BoletoOperation | 'webhook';
  method: string;
  host: string;
  path: string;
  httpStatus?: number | null;
  billingScheme?: string | null;
  testedAt?: string;
  requestBody?: Record<string, unknown> | null;
  responseBody?: Record<string, unknown> | string | null;
  responseText?: string;
  contentType?: string;
  message: string;
}): C6BoletoEvidencePublic {
  const responseBody =
    input.responseBody !== undefined
      ? input.responseBody
      : parseC6BoletoResponseBody(input.responseText || '', input.contentType || '');
  const homolog = isC6BoletoHomologCase(input.testCase)
    ? C6_BOLETO_HOMOLOG_CASES[input.testCase]
    : null;

  return {
    testCase: input.testCase,
    success: Boolean(input.success),
    blocked: input.blocked !== false && !input.executed,
    environment: input.environment,
    companyId: String(input.companyId || '').trim(),
    operation: input.operation,
    method: String(input.method || '').toUpperCase(),
    host: String(input.host || ''),
    path: String(input.path || ''),
    httpStatus: input.httpStatus ?? null,
    roteiroExpectedStatus: homolog?.roteiroExpectedStatus ?? null,
    openapiExpectedStatus: homolog?.openapiExpectedStatus ?? null,
    billingScheme: input.billingScheme ?? null,
    executed: Boolean(input.executed),
    testedAt: input.testedAt || new Date().toISOString(),
    requestBody: input.requestBody ? sanitizeC6BoletoJson(input.requestBody) : null,
    responseBody,
    responseContentType: input.contentType ? String(input.contentType).slice(0, 120) : null,
    message: String(input.message || '').slice(0, 300),
  };
}

export function evidenceFromPreparedC6Boleto(
  prepared: C6BoletoPreparedHttp,
  extras: {
    testCase: C6BoletoEvidenceCase;
    success: boolean;
    blocked?: boolean;
    executed?: boolean;
    httpStatus?: number | null;
    responseText?: string;
    contentType?: string;
    message: string;
    testedAt?: string;
  },
): C6BoletoEvidencePublic {
  return toC6BoletoEvidencePublic({
    ...extras,
    environment: prepared.environment,
    companyId: prepared.companyId,
    operation: prepared.operation,
    method: prepared.method,
    host: prepared.host,
    path: prepared.path,
    billingScheme: prepared.billingScheme,
    requestBody: prepared.jsonBody,
  });
}

export type C6HomologWordEvidence = {
  testCase: C6BoletoEvidenceCase;
  title: string;
  httpStatus: number | null;
  roteiroExpectedStatus: number | null;
  openapiExpectedStatus: number | null;
  responseBody: Record<string, unknown> | string | null;
  responseContentType: string | null;
  executed: boolean;
  blocked: boolean;
  wordColumnsReady: boolean;
};

/**
 * Campos do Word de homologação C6 (Status retornado + Body sanitizado).
 * wordColumnsReady só fica true após HTTP real autorizado; bloqueio não preenche o roteiro.
 */
export function collectC6HomologWordEvidence(
  evidence: C6BoletoEvidencePublic,
): C6HomologWordEvidence {
  assertC6BoletoEvidencePublicSafe(evidence);
  const catalog = isC6BoletoHomologCase(evidence.testCase)
    ? C6_BOLETO_HOMOLOG_CASES[evidence.testCase]
    : null;
  return {
    testCase: evidence.testCase,
    title: catalog?.title || evidence.testCase,
    httpStatus: evidence.httpStatus,
    roteiroExpectedStatus: evidence.roteiroExpectedStatus,
    openapiExpectedStatus: evidence.openapiExpectedStatus,
    responseBody: evidence.responseBody,
    responseContentType: evidence.responseContentType,
    executed: evidence.executed,
    blocked: evidence.blocked,
    wordColumnsReady: Boolean(evidence.executed && evidence.httpStatus != null),
  };
}

export function formatC6BoletoEvidenceReport(evidence: C6BoletoEvidencePublic): string {
  const lines = [
    `${evidence.testCase} — Boleto C6 Bank (sanitizado)`,
    `Caso: ${evidence.testCase}`,
    `Operação: ${evidence.operation} ${evidence.method} ${evidence.path}`,
    `Ambiente: ${evidence.environment}`,
    `Empresa: ${evidence.companyId || '(ausente)'}`,
    `Carteira (billing_scheme): ${evidence.billingScheme || '(não enviada)'}`,
    `HTTP: ${evidence.httpStatus == null ? 'não executado' : evidence.httpStatus}`,
    `Content-Type: ${evidence.responseContentType || '(ausente)'}`,
    `Status roteiro: ${evidence.roteiroExpectedStatus ?? 'n/a'}`,
    `Status OpenAPI: ${evidence.openapiExpectedStatus ?? 'n/a'}`,
    `Executado: ${evidence.executed ? 'sim' : 'não'}`,
    `Bloqueado: ${evidence.blocked ? 'sim' : 'não'}`,
    `Resultado: ${evidence.success ? 'sucesso' : 'falha'}`,
    `Mensagem: ${evidence.message}`,
    `Testado em: ${evidence.testedAt}`,
    `Request: ${JSON.stringify(evidence.requestBody)}`,
    `Response: ${JSON.stringify(evidence.responseBody)}`,
  ];
  return lines.join('\n');
}

export function assertC6BoletoEvidencePublicSafe(payload: unknown): void {
  const json = JSON.stringify(payload);
  for (const token of C6_BOLETO_FORBIDDEN_PUBLIC_FRAGMENTS) {
    if (json.includes(token)) {
      throw new Error(`Evidência C6 boleto expõe material sensível (${token}).`);
    }
  }
}
