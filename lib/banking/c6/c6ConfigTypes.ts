/**
 * Tipos públicos da configuração C6 Bank — Fase 1.
 * Sem URLs, OAuth, scopes ou webhook. Sem material sensível na resposta.
 */

import type { BankEnvironment, BankIntegrationStatus } from '@/lib/banking/types';

export type C6BankConfigPublic = {
  id: string | null;
  companyId: string;
  provider: 'C6';
  environment: BankEnvironment;
  status: BankIntegrationStatus;
  /** Client ID pode ser reexibido (não é secret). */
  clientId: string;
  clientIdConfigured: boolean;
  hasClientSecret: boolean;
  hasCertificate: boolean;
  hasPrivateKey: boolean;
  certificateFileName: string | null;
  privateKeyFileName: string | null;
  configuredAt: string | null;
  updatedAt: string | null;
  message: string;
  financialAccountId?: string | null;
};

export type C6BankConfigSaveInput = {
  environment: BankEnvironment;
  clientId?: string;
  clientSecret?: string;
  certificatePem?: string;
  certificateFileName?: string;
  privateKeyPem?: string;
  privateKeyFileName?: string;
  financialAccountId?: string | null;
};

export const EMPTY_C6_BANK_CONFIG = (companyId: string): C6BankConfigPublic => ({
  id: null,
  companyId,
  provider: 'C6',
  environment: 'SANDBOX',
  status: 'DRAFT',
  clientId: '',
  clientIdConfigured: false,
  hasClientSecret: false,
  hasCertificate: false,
  hasPrivateKey: false,
  certificateFileName: null,
  privateKeyFileName: null,
  configuredAt: null,
  updatedAt: null,
  message: 'C6 Bank ainda não configurado.',
  financialAccountId: null,
});
