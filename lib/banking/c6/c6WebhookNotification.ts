/**
 * Notificação C6 (webhook-api 1.0.12).
 * O corpo não é assinado e não autoriza baixa. information permanece texto.
 */

import { timingSafeEqual } from 'node:crypto';
import {
  C6_BANK_SLIP_NOTIFICATION_STATUSES,
  C6_NOTIFICATIONS_SERVICE,
} from '@/lib/banking/c6/c6NotificationsOpenApi';

export const C6_WEBHOOK_MAX_BODY_BYTES = 16_384;
const MAX_ID = 80;
const MAX_INFORMATION = 4_000;

export type C6BankSlipNotificationStatus = (typeof C6_BANK_SLIP_NOTIFICATION_STATUSES)[number];

export type C6WebhookNotice = {
  externalId: string;
  dateTime: string;
  clientId: string;
  partnerId: string;
  service: typeof C6_NOTIFICATIONS_SERVICE;
  status: C6BankSlipNotificationStatus;
};

export function parseC6WebhookNotification(
  body: unknown,
): { ok: true; notice: C6WebhookNotice } | { ok: false; reason: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'Notificação C6 malformada.' };
  }
  const row = body as Record<string, unknown>;
  if ('information' in row && row.information != null && typeof row.information !== 'string') {
    return { ok: false, reason: 'Notificação C6 malformada.' };
  }
  if (typeof row.information === 'string' && row.information.length > MAX_INFORMATION) {
    return { ok: false, reason: 'Notificação C6 malformada.' };
  }
  const externalId = readToken(row.external_id, MAX_ID);
  const dateTime = readToken(row.date_time, 40);
  const clientId = readToken(row.client_id, MAX_ID);
  const partnerId = typeof row.partner_id === 'string' ? row.partner_id.trim().slice(0, MAX_ID) : null;
  const service = readToken(row.service, 40);
  const status = readToken(row.status, 40).toUpperCase();
  if (!externalId || !dateTime || !clientId || partnerId == null || !service || !status) {
    return { ok: false, reason: 'Notificação C6 malformada.' };
  }
  if (service !== C6_NOTIFICATIONS_SERVICE) {
    return { ok: false, reason: 'Evento C6 fora do serviço BANK_SLIP.' };
  }
  if (!C6_BANK_SLIP_NOTIFICATION_STATUSES.includes(status as C6BankSlipNotificationStatus)) {
    return { ok: false, reason: 'Status C6 não previsto para BANK_SLIP.' };
  }
  return {
    ok: true,
    notice: {
      externalId,
      dateTime,
      clientId,
      partnerId,
      service: C6_NOTIFICATIONS_SERVICE,
      status: status as C6BankSlipNotificationStatus,
    },
  };
}

export function buildC6WebhookIdempotencyKey(input: {
  integrationId: string;
  notice: C6WebhookNotice;
}): string {
  return `C6:${input.integrationId}:${input.notice.externalId}:${input.notice.status}:${input.notice.dateTime}`;
}

export function redactC6WebhookPayload(notice: C6WebhookNotice): Record<string, unknown> {
  return {
    service: notice.service,
    status: notice.status,
    external_id: notice.externalId,
    date_time: notice.dateTime,
    client_id_present: true,
  };
}

export function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const attempts = new Map<string, number[]>();

export function consumeC6WebhookAttempt(
  key: string,
  nowMs: number,
  limit = 30,
  windowMs = 60_000,
): boolean {
  const recent = (attempts.get(key) || []).filter((stamp) => nowMs - stamp < windowMs);
  if (recent.length >= limit) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(nowMs);
  attempts.set(key, recent);
  return true;
}

function readToken(value: unknown, max: number): string {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) return '';
  return text;
}
