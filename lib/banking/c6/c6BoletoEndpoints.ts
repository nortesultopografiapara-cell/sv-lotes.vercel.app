/**
 * Endpoints oficiais C6 Bank Boleto bancário — OpenAPI 1.7.2.
 * Hosts iguais à autenticação; path /v1/bank_slips/.
 */

import type { BankEnvironment } from '@/lib/banking/types';
import { C6_AUTH_HOST } from '@/lib/banking/c6/c6Endpoints';
import { C6_BOLETO_BILLING_SCHEME } from '@/lib/banking/c6/c6BoletoOpenApi';

export const C6_BANK_SLIPS_URL = {
  SANDBOX: 'https://baas-api-sandbox.c6bank.info/v1/bank_slips/',
  PRODUCTION: 'https://baas-api.c6bank.info/v1/bank_slips/',
} as const;

export function getC6BankSlipsBaseUrl(environment: BankEnvironment): string {
  return environment === 'PRODUCTION' ? C6_BANK_SLIPS_URL.PRODUCTION : C6_BANK_SLIPS_URL.SANDBOX;
}

export function getC6BankSlipsHost(environment: BankEnvironment): string {
  return environment === 'PRODUCTION' ? C6_AUTH_HOST.PRODUCTION : C6_AUTH_HOST.SANDBOX;
}

export function getC6BillingScheme(environment: BankEnvironment): '21' | '15' {
  return environment === 'PRODUCTION'
    ? C6_BOLETO_BILLING_SCHEME.PRODUCTION
    : C6_BOLETO_BILLING_SCHEME.SANDBOX;
}

function encodeBankSlipId(id: string): string {
  return encodeURIComponent(String(id || '').trim());
}

export function buildC6BankSlipEmitUrl(environment: BankEnvironment): string {
  return getC6BankSlipsBaseUrl(environment);
}

export function buildC6BankSlipResourceUrl(
  environment: BankEnvironment,
  id: string,
): string {
  return `${getC6BankSlipsBaseUrl(environment)}${encodeBankSlipId(id)}`;
}

export function buildC6BankSlipPdfUrl(environment: BankEnvironment, id: string): string {
  return `${buildC6BankSlipResourceUrl(environment, id)}/pdf`;
}

export function buildC6BankSlipCancelUrl(environment: BankEnvironment, id: string): string {
  return `${buildC6BankSlipResourceUrl(environment, id)}/cancel`;
}
