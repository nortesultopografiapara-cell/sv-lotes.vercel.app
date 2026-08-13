/**
 * HMAC helpers (cópia isolada do receptor — sem dependência do Next app).
 */
import { createHmac, randomBytes } from 'node:crypto';

export function signInterWebhookHmac(secret, timestamp, nonce, body) {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.${body}`, 'utf8')
    .digest('hex');
}

export function createNonce() {
  return randomBytes(16).toString('hex');
}
