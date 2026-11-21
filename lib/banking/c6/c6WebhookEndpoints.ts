import type { BankEnvironment } from '@/lib/banking/types';
import { C6_AUTH_HOST } from '@/lib/banking/c6/c6Endpoints';
import { C6_NOTIFICATIONS_SERVICE } from '@/lib/banking/c6/c6NotificationsOpenApi';

export const C6_WEBHOOKS_URL = {
  SANDBOX: 'https://baas-api-sandbox.c6bank.info/v1/webhooks/',
  PRODUCTION: 'https://baas-api.c6bank.info/v1/webhooks/',
} as const;

export function getC6WebhooksBaseUrl(environment: BankEnvironment): string {
  return environment === 'PRODUCTION' ? C6_WEBHOOKS_URL.PRODUCTION : C6_WEBHOOKS_URL.SANDBOX;
}

export function getC6WebhooksHost(environment: BankEnvironment): string {
  return environment === 'PRODUCTION' ? C6_AUTH_HOST.PRODUCTION : C6_AUTH_HOST.SANDBOX;
}

export function buildC6WebhookRegisterUrl(environment: BankEnvironment): string {
  return getC6WebhooksBaseUrl(environment);
}

export function buildC6WebhookConsultUrl(
  environment: BankEnvironment,
  service: string = C6_NOTIFICATIONS_SERVICE,
): string {
  const base = getC6WebhooksBaseUrl(environment);
  const params = new URLSearchParams({ service: String(service || '').trim() || C6_NOTIFICATIONS_SERVICE });
  return `${base}?${params.toString()}`;
}

export function redactC6WebhookUrl(url: string): string {
  return String(url || '').replace(/([?&]token=)[^&]*/gi, '$1[redacted]');
}
