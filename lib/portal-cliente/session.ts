/**
 * Sessão e cookies do Portal do Cliente.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import type { ClientPortalLinkType } from '@/lib/portal-cliente/types';

export const CLIENT_PORTAL_SESSION_COOKIE = 'client_portal_session' as const;
export const CLIENT_PORTAL_OTP_CHALLENGE_COOKIE = 'client_portal_otp_challenge' as const;

export const CLIENT_PORTAL_SESSION_TTL_SEC = 45 * 60;

export type ClientPortalSessionScope = {
  linkType: ClientPortalLinkType;
  companyId: string;
  customerId: string | null;
  saleId: string | null;
};

export type ClientPortalSessionPayload = {
  linkKey: string;
  documentHash: string;
  verifiedAt: string;
  scope: ClientPortalSessionScope;
};

export type ClientPortalOtpChallengePayload = {
  challengeId: string;
  linkKey: string;
  documentHash: string;
  phoneMasked: string | null;
  issuedAt: string;
};

function resolveSessionSecret(): string {
  return (
    process.env.CLIENT_PORTAL_SESSION_SECRET?.trim() ||
    process.env.CLIENT_PORTAL_LINK_SECRET?.trim() ||
    'portal-cliente-dev-session-secret'
  );
}

function signPayload(payload: object, ttlSec: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const sig = createHmac('sha256', resolveSessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySignedPayload<T extends { exp: number }>(token: string): T | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expected = createHmac('sha256', resolveSessionSecret()).update(body).digest('base64url');
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    if (!parsed?.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createClientPortalSessionToken(payload: ClientPortalSessionPayload): string {
  return signPayload(payload, CLIENT_PORTAL_SESSION_TTL_SEC);
}

export function readClientPortalSessionToken(token: string): ClientPortalSessionPayload | null {
  const parsed = verifySignedPayload<
    ClientPortalSessionPayload & { exp: number; scope?: ClientPortalSessionScope }
  >(token);
  if (!parsed) return null;
  if (!parsed.scope?.companyId || !parsed.scope?.linkType) return null;
  return {
    linkKey: parsed.linkKey,
    documentHash: parsed.documentHash,
    verifiedAt: parsed.verifiedAt,
    scope: parsed.scope,
  };
}

export function createClientPortalOtpChallengeToken(
  payload: ClientPortalOtpChallengePayload,
): string {
  return signPayload(payload, Math.ceil(5 * 60));
}

export function readClientPortalOtpChallengeToken(
  token: string,
): ClientPortalOtpChallengePayload | null {
  const parsed = verifySignedPayload<ClientPortalOtpChallengePayload & { exp: number }>(token);
  if (!parsed) return null;
  return {
    challengeId: parsed.challengeId,
    linkKey: parsed.linkKey,
    documentHash: parsed.documentHash,
    phoneMasked: parsed.phoneMasked,
    issuedAt: parsed.issuedAt,
  };
}

function cookieBaseOptions() {
  const secure = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true as const,
    secure,
    sameSite: 'lax' as const,
    path: '/',
  };
}

export async function setClientPortalSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(CLIENT_PORTAL_SESSION_COOKIE, token, {
    ...cookieBaseOptions(),
    maxAge: CLIENT_PORTAL_SESSION_TTL_SEC,
  });
}

export async function clearClientPortalSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(CLIENT_PORTAL_SESSION_COOKIE, '', {
    ...cookieBaseOptions(),
    maxAge: 0,
  });
}

export async function getClientPortalSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(CLIENT_PORTAL_SESSION_COOKIE)?.value;
}

export async function setClientPortalOtpChallengeCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(CLIENT_PORTAL_OTP_CHALLENGE_COOKIE, token, {
    ...cookieBaseOptions(),
    maxAge: 5 * 60,
  });
}

export async function clearClientPortalOtpChallengeCookie(): Promise<void> {
  const store = await cookies();
  store.set(CLIENT_PORTAL_OTP_CHALLENGE_COOKIE, '', {
    ...cookieBaseOptions(),
    maxAge: 0,
  });
}

export async function getClientPortalOtpChallengeCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(CLIENT_PORTAL_OTP_CHALLENGE_COOKIE)?.value;
}
