/**
 * Constantes e utilitários OTP do Portal do Cliente.
 */

import { createHash, randomInt, timingSafeEqual } from 'crypto';

export const CLIENT_PORTAL_OTP_LENGTH = 6;
export const CLIENT_PORTAL_OTP_TTL_MS = 5 * 60 * 1000;
export const CLIENT_PORTAL_OTP_MAX_ATTEMPTS = 5;
export const CLIENT_PORTAL_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const CLIENT_PORTAL_OTP_MAX_RESENDS = 3;

export function generateClientPortalOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(CLIENT_PORTAL_OTP_LENGTH, '0');
}

export function createClientPortalOtpSalt(): string {
  return createHash('sha256')
    .update(`${Date.now()}:${randomInt(0, 1_000_000_000)}`)
    .digest('hex')
    .slice(0, 32);
}

function resolveOtpPepper(): string {
  return (
    process.env.CLIENT_PORTAL_SESSION_SECRET?.trim() ||
    process.env.CLIENT_PORTAL_LINK_SECRET?.trim() ||
    'portal-cliente-dev-otp-pepper'
  );
}

export function hashClientPortalOtp(code: string, salt: string): string {
  return createHash('sha256')
    .update(`${resolveOtpPepper()}:${salt}:${code}`)
    .digest('hex');
}

export function hashClientPortalDocument(documentDigits: string): string {
  return createHash('sha256')
    .update(`${resolveOtpPepper()}:doc:${documentDigits}`)
    .digest('hex');
}

export function verifyClientPortalOtpCode(
  code: string,
  salt: string,
  expectedHash: string,
): boolean {
  const actual = hashClientPortalOtp(code, salt);
  try {
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expectedHash));
  } catch {
    return false;
  }
}

export function isClientPortalOtpExpired(expiresAt: string | Date): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

export function buildClientPortalOtpExpiresAt(from = Date.now()): string {
  return new Date(from + CLIENT_PORTAL_OTP_TTL_MS).toISOString();
}

export function normalizeOtpInput(value: string): string {
  return String(value || '').replace(/\D/g, '').slice(0, CLIENT_PORTAL_OTP_LENGTH);
}

export function isValidClientPortalOtpInput(value: string): boolean {
  return normalizeOtpInput(value).length === CLIENT_PORTAL_OTP_LENGTH;
}
