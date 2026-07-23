/**
 * Tokens públicos dos participantes — hash seguro para lookup.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { generateSignatureToken } from '@/lib/saasContractSignatureService';

export function hashSaleSignaturePartyToken(token: string): string {
  return createHash('sha256')
    .update(String(token || '').trim(), 'utf8')
    .digest('hex');
}

export function createSaleSignaturePartyToken(): {
  token: string;
  tokenHash: string;
} {
  const token = generateSignatureToken();
  return {
    token,
    tokenHash: hashSaleSignaturePartyToken(token),
  };
}

export function safeCompareTokenHash(
  leftHash: string | null | undefined,
  rightHash: string | null | undefined,
): boolean {
  const a = String(leftHash || '');
  const b = String(rightHash || '');
  if (!a || !b || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/** Prefixo seguro para logs — nunca o token completo. */
export function maskSignatureTokenForLog(token?: string | null): string | null {
  const value = String(token || '').trim();
  if (!value) return null;
  return `${value.slice(0, 8)}…`;
}
