/**
 * Receptor HTTPS de notificações C6 (Sandbox).
 * Não baixa financeiro, não altera parcelas, não toca Asaas/Inter/Production.
 * C6 não documenta assinatura no payload; origem = token de rota em tempo constante.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readBankingCredentialsEncryptionKey } from '@/lib/banking/credentialsCrypto';
import { C6_NOTIFICATIONS_SERVICE } from '@/lib/banking/c6/c6NotificationsOpenApi';
import { redactC6WebhookUrl } from '@/lib/banking/c6/c6WebhookEndpoints';

export const C6_WEBHOOK_FINANCE_MUTATION = false;
export const C6_WEBHOOK_RECEIVER_PATH = '/api/banking/c6/webhooks' as const;

export function buildC6WebhookReceiverPath(integrationId: string): string {
  return `${C6_WEBHOOK_RECEIVER_PATH}/${encodeURIComponent(String(integrationId || '').trim())}`;
}

export function resolveC6WebhookPublicOrigin(requestUrl?: string): string {
  const configured = String(process.env.C6_WEBHOOK_RECEIVER_PUBLIC_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (configured) return configured;
  const vercel = String(process.env.VERCEL_URL || '').trim().replace(/^https?:\/\//, '');
  if (vercel) return `https://${vercel}`;
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      /* ignore */
    }
  }
  return '';
}

export function createC6WebhookRouteToken(integrationId: string): string {
  const secret = readBankingCredentialsEncryptionKey();
  if (!secret) {
    throw new Error('Secret de criptografia ausente para o token de webhook C6.');
  }
  return createHmac('sha256', secret)
    .update(`c6-webhook-v1:${String(integrationId || '').trim()}`)
    .digest('hex')
    .slice(0, 32);
}

export function timingSafeEqualText(left: string, right: string): boolean {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function assertC6WebhookRouteToken(integrationId: string, provided: string): boolean {
  try {
    const expected = createC6WebhookRouteToken(integrationId);
    return timingSafeEqualText(expected, String(provided || '').trim());
  } catch {
    return false;
  }
}

export function buildC6WebhookCallbackUrl(input: {
  origin: string;
  integrationId: string;
  token: string;
}): string {
  const origin = String(input.origin || '').replace(/\/$/, '');
  const path = buildC6WebhookReceiverPath(input.integrationId);
  const url = new URL(`${origin}${path}`);
  url.searchParams.set('token', input.token);
  return url.toString();
}

export function publicC6WebhookCallbackUrl(input: {
  origin: string;
  integrationId: string;
  token: string;
}): { url: string; urlRedacted: string; https: boolean } {
  const url = buildC6WebhookCallbackUrl(input);
  return {
    url,
    urlRedacted: redactC6WebhookUrl(url),
    https: url.startsWith('https://'),
  };
}

function sanitizeInboundValue(value: unknown, key = '', depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  const lower = key.toLowerCase();
  if (lower.includes('tax') || lower === 'cpf' || lower === 'cnpj') return '[tax_id-redacted]';
  if (lower.includes('email')) return '[email-redacted]';
  if (lower.includes('token') || lower.includes('secret') || lower.includes('authorization')) {
    return '[redacted]';
  }
  if (typeof value === 'string' && /[?&]token=/i.test(value)) {
    return redactC6WebhookUrl(value);
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeInboundValue(item, key, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      out[k] = sanitizeInboundValue(v, k, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 240) return `${value.slice(0, 80)}…[truncated]`;
  return value;
}

export function inspectC6WebhookInbound(bodyText: string): {
  ok: boolean;
  financeMutation: false;
  service: typeof C6_NOTIFICATIONS_SERVICE;
  keys: string[];
  sanitized: Record<string, unknown> | null;
} {
  let parsed: unknown = null;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    parsed = null;
  }
  const record =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  return {
    ok: Boolean(record),
    financeMutation: C6_WEBHOOK_FINANCE_MUTATION,
    service: C6_NOTIFICATIONS_SERVICE,
    keys: record ? Object.keys(record).slice(0, 40) : [],
    sanitized: record ? (sanitizeInboundValue(record) as Record<string, unknown>) : null,
  };
}

export function c6WebhookReceiverPublicMeta(integrationId: string) {
  return {
    receiver: true,
    provider: 'C6',
    service: C6_NOTIFICATIONS_SERVICE,
    integrationId,
    sandboxOnly: true,
    financeMutation: C6_WEBHOOK_FINANCE_MUTATION,
    accepts: 'POST',
  };
}
