/**
 * HMAC-SHA256 para comunicação receptor mTLS → SV LOTES.
 * Headers: X-SV-Timestamp, X-SV-Nonce, X-SV-Signature
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export const INTER_WEBHOOK_HMAC_TOLERANCE_MS = 5 * 60 * 1000; // 5 min

export function buildInterWebhookHmacPayload(
  timestamp: string,
  nonce: string,
  body: string,
): string {
  return `${timestamp}.${nonce}.${body}`;
}

export function signInterWebhookHmac(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  const payload = buildInterWebhookHmacPayload(timestamp, nonce, body);
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export function createInterWebhookNonce(): string {
  return randomBytes(16).toString('hex');
}

export type InterWebhookHmacValidation =
  | { ok: true }
  | { ok: false; code: 'MISSING' | 'SKEW' | 'INVALID'; message: string };

const seenNonces = new Map<string, number>();

/** Limpa nonces antigos (processo local; DB idempotency é a fonte final). */
export function pruneInterWebhookNonces(now = Date.now()): void {
  for (const [nonce, ts] of seenNonces) {
    if (now - ts > INTER_WEBHOOK_HMAC_TOLERANCE_MS * 2) seenNonces.delete(nonce);
  }
}

export function clearInterWebhookNoncesForTests(): void {
  seenNonces.clear();
}

export function validateInterWebhookHmac(input: {
  secret: string;
  timestamp: string | null;
  nonce: string | null;
  signature: string | null;
  body: string;
  nowMs?: number;
}): InterWebhookHmacValidation {
  const timestamp = String(input.timestamp || '').trim();
  const nonce = String(input.nonce || '').trim();
  const signature = String(input.signature || '').trim().toLowerCase();
  if (!timestamp || !nonce || !signature) {
    return { ok: false, code: 'MISSING', message: 'Assinatura HMAC incompleta.' };
  }

  const now = input.nowMs ?? Date.now();
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, code: 'INVALID', message: 'Timestamp HMAC inválido.' };
  }
  if (Math.abs(now - tsNum) > INTER_WEBHOOK_HMAC_TOLERANCE_MS) {
    return { ok: false, code: 'SKEW', message: 'Timestamp HMAC fora da tolerância (possível replay).' };
  }

  pruneInterWebhookNonces(now);
  if (seenNonces.has(nonce)) {
    return { ok: false, code: 'SKEW', message: 'Nonce HMAC já utilizado (replay).' };
  }

  const expected = signInterWebhookHmac(input.secret, timestamp, nonce, input.body);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, code: 'INVALID', message: 'Assinatura HMAC inválida.' };
  }

  seenNonces.set(nonce, now);
  return { ok: true };
}

export function getInterWebhookHmacSecretFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return String(env.INTER_WEBHOOK_HMAC_SECRET || '').trim();
}
