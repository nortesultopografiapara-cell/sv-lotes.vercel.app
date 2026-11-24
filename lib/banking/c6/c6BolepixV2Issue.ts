/**
 * Monta o POST /v2/bank_slips/ com a EVP decifrada.
 * A chamada real só existe para uma empresa e integração liberadas.
 * Nesta fase a lista está vazia e a flag global permanece falsa.
 */

import {
  C6_BOLEPIX_V2_URL,
  isC6BolepixV2LiveReceipt,
} from '@/lib/banking/c6/c6BolepixV2OpenApi';
import {
  buildC6BolepixV2EmissionBody,
  C6BolepixPixKeyRequiredError,
} from '@/lib/banking/c6/c6BolepixV2Emission';
import { recoverC6BolepixEmissionKey } from '@/lib/banking/c6/c6BolepixV2PixKey';
import type { C6BolepixV2CreateInput } from '@/lib/banking/c6/c6BolepixV2Validation';
import type { BankEnvironment } from '@/lib/banking/types';

const DEFINITIVE = new Set([400, 401, 403, 404, 422]);

export function c6BolepixV2Endpoint(environment: BankEnvironment): string {
  const url = environment === 'PRODUCTION' ? C6_BOLEPIX_V2_URL.PRODUCTION : C6_BOLEPIX_V2_URL.SANDBOX;
  if (!url.startsWith('https://') || !url.includes('/v2/bank_slips/')) {
    throw new Error('O Bolepix só pode ser enviado ao endpoint oficial v2.');
  }
  if (url.includes('/v1/bank_slips/')) {
    throw new Error('O Bolepix não usa a API v1.');
  }
  return url;
}

export function redactC6BolepixV2Body(body: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  const payment = clone.payment_method;
  if (payment && typeof payment === 'object') {
    const pix = (payment as Record<string, unknown>).pix;
    if (pix && typeof pix === 'object' && 'key' in pix) {
      (pix as Record<string, unknown>).key = '[redacted]';
    }
  }
  return clone;
}

export function redactC6BolepixSecret(message: string): string {
  return String(message || '').replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '[chave]',
  );
}

export function c6BolepixV2PayloadFromSealedKey(
  input: Omit<C6BolepixV2CreateInput, 'pixKey'> & {
    companyId: string;
    encryptedKey: string;
    fingerprint: string;
  },
  now = new Date(),
): { body: Record<string, unknown>; endpoint: string; pixKey: string } {
  const pixKey = recoverC6BolepixEmissionKey(
    {
      companyId: input.companyId,
      encryptedKey: input.encryptedKey,
      fingerprint: input.fingerprint,
    },
    input.companyId,
  );
  if (!pixKey || pixKey === input.fingerprint) throw new C6BolepixPixKeyRequiredError();
  const body = buildC6BolepixV2EmissionBody({ ...input, pixKey }, now);
  const payment = body.payment_method as { pix?: { type?: string; key?: string } };
  if (payment.pix?.type !== 'EVP' || payment.pix.key !== pixKey || payment.pix.key === input.fingerprint) {
    throw new C6BolepixPixKeyRequiredError();
  }
  return { body, endpoint: c6BolepixV2Endpoint(input.environment), pixKey };
}

export function c6BolepixV2MayCallBank(
  companyId: string,
  integrationId: string,
  simulated: boolean,
  receiptId?: string,
): boolean {
  if (simulated) return true;
  return isC6BolepixV2LiveReceipt(companyId, integrationId, receiptId || '');
}

export function completionForC6BolepixV2(result: {
  disposition: 'succeeded' | 'rejected' | 'uncertain';
  httpStatus: number | null;
  chargeId?: string | null;
}): {
  status: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  retryAllowed: boolean;
  chargeId: string | null;
  automaticRetry: false;
} {
  const chargeId = String(result.chargeId || '').trim() || null;
  if (result.disposition === 'succeeded' && result.httpStatus === 201 && chargeId) {
    return { status: 'SUCCEEDED', retryAllowed: false, chargeId, automaticRetry: false };
  }
  if (
    result.disposition === 'rejected' &&
    result.httpStatus != null &&
    DEFINITIVE.has(result.httpStatus) &&
    !chargeId
  ) {
    return { status: 'FAILED', retryAllowed: true, chargeId: null, automaticRetry: false };
  }
  if (result.disposition === 'rejected') {
    return { status: 'FAILED', retryAllowed: false, chargeId: null, automaticRetry: false };
  }
  return { status: 'UNKNOWN', retryAllowed: false, chargeId: null, automaticRetry: false };
}

export type C6BolepixOutcomeKind =
  | 'succeeded'
  | 'rejected'
  | 'authentication'
  | 'configuration'
  | 'timeout'
  | 'uncertain'
  | 'waiting';

function clipBankText(value: string | null, max: number): string | null {
  const text = String(value || '')
    .replace(/bearer\s+\S+/gi, '')
    .replace(/\bv1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+/g, '')
    .replace(/BEGIN [A-Z0-9 ]+KEY/gi, '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    .replace(/\d{11,14}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.slice(0, max);
}

function bankText(row: Record<string, unknown> | null, keys: string[]): string | null {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Lê só código, mensagem e rastreio. Não devolve o corpo cru do banco. */
export function readSanitizedC6BankError(body: unknown): {
  code: string | null;
  message: string | null;
  traceId: string | null;
} {
  const row = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const nested = Array.isArray(row?.errors) ? row?.errors[0] : null;
  const nestedRow =
    nested && typeof nested === 'object' && !Array.isArray(nested) ? (nested as Record<string, unknown>) : null;
  const field = bankText(nestedRow, ['field', 'path', 'property']);
  const detail = bankText(nestedRow, ['message', 'detail']) || bankText(row, ['message', 'detail', 'title', 'error_description']);
  const combined = [field ? `Campo ${field}` : null, detail].filter(Boolean).join(': ');
  const trace = bankText(row, ['trace_id', 'traceId', 'correlation_id', 'request_id']);
  const safeTrace = trace && /^[A-Za-z0-9._:-]{6,80}$/.test(trace) ? trace : null;
  return {
    code: clipBankText(bankText(row, ['code', 'error', 'type', 'error_code']), 40),
    message: clipBankText(combined, 180),
    traceId: safeTrace,
  };
}

export function describeC6BolepixV2Outcome(input: {
  status?: string | null;
  httpStatus?: number | null;
  chargeId?: string | null;
  transportCode?: 'TIMEOUT' | 'NETWORK' | 'UNEXPECTED' | null;
  bankCode?: string | null;
  bankMessage?: string | null;
}): { kind: C6BolepixOutcomeKind; message: string } {
  const status = String(input.status || '').toUpperCase();
  const http = input.httpStatus ?? null;
  const chargeId = String(input.chargeId || '').trim();
  if (input.transportCode === 'TIMEOUT') {
    return {
      kind: 'timeout',
      message: 'O C6 não respondeu a tempo. O resultado ficou incerto e nenhuma nova emissão foi feita.',
    };
  }
  if (status === 'CONFIGURATION') {
    return {
      kind: 'configuration',
      message: 'A configuração C6 está incompleta. Nenhuma emissão foi concluída.',
    };
  }
  if (status === 'WAITING_CONFIRMATION') {
    return {
      kind: 'waiting',
      message: 'A cobrança aguarda confirmação do C6. Isso não confirma o crédito.',
    };
  }
  if (status === 'SUCCEEDED') {
    return {
      kind: 'succeeded',
      message: 'O C6 criou a cobrança. CREATED não confirma pagamento.',
    };
  }
  if (
    status === 'UNKNOWN' ||
    status === 'PROCESSING' ||
    input.transportCode === 'NETWORK' ||
    Boolean(chargeId)
  ) {
    return {
      kind: 'uncertain',
      message: 'O resultado da cobrança ficou incerto. Nenhuma nova emissão foi feita.',
    };
  }
  if (http === 401 || http === 403) {
    return {
      kind: 'authentication',
      message: `O C6 não autorizou a emissão (HTTP ${http}). Isso não é uma recusa do boleto. Nenhuma nova emissão automática foi feita.`,
    };
  }
  if (status === 'FAILED' || http === 400 || http === 404 || http === 422) {
    const reason = clipBankText(input.bankMessage || null, 180);
    const code = clipBankText(input.bankCode || null, 40);
    const httpLabel = http != null ? ` (HTTP ${http})` : '';
    const detail = reason
      ? ` Motivo informado pelo banco: ${reason}.${code ? ` Código ${code}.` : ''}`
      : ' A mensagem original do banco não foi gravada.';
    return {
      kind: 'rejected',
      message: `O C6 recusou a cobrança${httpLabel}. Nenhuma nova emissão automática foi feita.${detail}`,
    };
  }
  return {
    kind: 'uncertain',
    message: 'O resultado da cobrança ficou incerto. Nenhuma nova emissão foi feita.',
  };
}
