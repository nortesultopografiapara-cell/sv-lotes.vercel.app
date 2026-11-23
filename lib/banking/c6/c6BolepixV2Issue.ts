/**
 * Monta o POST /v2/bank_slips/ com a EVP decifrada.
 * A chamada real só existe para uma empresa e integração liberadas.
 * Nesta fase a lista está vazia e a flag global permanece falsa.
 */

import {
  C6_BOLEPIX_V2_URL,
  isC6BolepixV2LiveRelease,
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

export function c6BolepixV2MayCallBank(companyId: string, integrationId: string, simulated: boolean): boolean {
  if (simulated) return true;
  return isC6BolepixV2LiveRelease(companyId, integrationId);
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
