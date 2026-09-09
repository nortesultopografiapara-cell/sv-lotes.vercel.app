/**
 * Endpoints oficiais C6 Bank BaaS — somente autenticação (Fase 3A).
 * OpenAPI: POST /v1/auth/  application/x-www-form-urlencoded
 * Sem Pix, boleto, conciliação ou webhook.
 */

import type { BankEnvironment } from '@/lib/banking/types';

export const C6_AUTH_GRANT_TYPE = 'client_credentials' as const;

export const C6_AUTH_URL = {
  SANDBOX: 'https://baas-api-sandbox.c6bank.info/v1/auth/',
  PRODUCTION: 'https://baas-api.c6bank.info/v1/auth/',
} as const;

export const C6_AUTH_HOST = {
  SANDBOX: 'baas-api-sandbox.c6bank.info',
  PRODUCTION: 'baas-api.c6bank.info',
} as const;

export function getC6AuthUrl(environment: BankEnvironment): string {
  return environment === 'PRODUCTION' ? C6_AUTH_URL.PRODUCTION : C6_AUTH_URL.SANDBOX;
}

export function getC6AuthHost(environment: BankEnvironment): string {
  return environment === 'PRODUCTION' ? C6_AUTH_HOST.PRODUCTION : C6_AUTH_HOST.SANDBOX;
}

export function buildC6AuthFormBody(clientId: string, clientSecret: string): string {
  return new URLSearchParams({
    client_id: String(clientId || '').trim(),
    client_secret: String(clientSecret || '').trim(),
    grant_type: C6_AUTH_GRANT_TYPE,
  }).toString();
}

export function parseC6AuthFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}
