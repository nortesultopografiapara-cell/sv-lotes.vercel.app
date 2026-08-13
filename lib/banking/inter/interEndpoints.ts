/**
 * Endpoints oficiais Banco Inter — API Cobrança / OAuth v2.
 * Fontes: developers.inter.co + SDKs oficiais de referência (sandbox/prod).
 */

import type { BankEnvironment } from '@/lib/banking/types';

export const INTER_OAUTH_SCOPES = 'boleto-cobranca.read boleto-cobranca.write' as const;

export const INTER_OAUTH_TOKEN_URL = {
  SANDBOX: 'https://cdpj-sandbox.partners.uatinter.co/oauth/v2/token',
  PRODUCTION: 'https://cdpj.partners.bancointer.com.br/oauth/v2/token',
} as const;

export const INTER_COBRANCA_V3_BASE_URL = {
  SANDBOX: 'https://cdpj-sandbox.partners.uatinter.co/cobranca/v3',
  PRODUCTION: 'https://cdpj.partners.bancointer.com.br/cobranca/v3',
} as const;

export function getInterOAuthTokenUrl(environment: BankEnvironment): string {
  return environment === 'PRODUCTION'
    ? INTER_OAUTH_TOKEN_URL.PRODUCTION
    : INTER_OAUTH_TOKEN_URL.SANDBOX;
}

export function getInterCobrancaV3BaseUrl(environment: BankEnvironment): string {
  return environment === 'PRODUCTION'
    ? INTER_COBRANCA_V3_BASE_URL.PRODUCTION
    : INTER_COBRANCA_V3_BASE_URL.SANDBOX;
}
