/**
 * Tipos públicos da configuração Inter (Fase A) — sem segredos.
 */

import type { BankEnvironment, BankIntegrationStatus } from '@/lib/banking/types';

export type InterBankConfigPublic = {
  id: string | null;
  companyId: string;
  provider: 'INTER';
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
  /** true somente após OAuth+mTLS com access_token válido (Fase B). */
  connectionVerified: boolean;
  lastConnectionTestAt: string | null;
  authStatus: 'VERIFIED' | 'FAILED' | 'DRAFT' | null;
  message: string;
};

export type InterBankConfigSaveInput = {
  environment: BankEnvironment;
  clientId?: string;
  clientSecret?: string;
  /** PEM do certificado (conteúdo, não caminho). */
  certificatePem?: string;
  certificateFileName?: string;
  /** PEM da chave privada (conteúdo, não caminho). */
  privateKeyPem?: string;
  privateKeyFileName?: string;
};

export const EMPTY_INTER_BANK_CONFIG = (
  companyId: string,
): InterBankConfigPublic => ({
  id: null,
  companyId,
  provider: 'INTER',
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
  connectionVerified: false,
  lastConnectionTestAt: null,
  authStatus: null,
  message: 'Banco Inter ainda não configurado.',
});
