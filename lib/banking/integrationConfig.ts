import type { BankEnvironment, BankIntegrationStatus, BankProvider } from './types';

/** Providers disponíveis na UI de cadastro (Fase 1.2). */
export const BANKING_CONFIG_PROVIDER_OPTIONS: {
  value: BankProvider | 'ITAU' | 'SANTANDER';
  label: string;
}[] = [
  { value: 'MOCK', label: 'MOCK' },
  { value: 'SICOOB', label: 'Sicoob' },
  { value: 'SICREDI', label: 'Sicredi' },
  { value: 'BANCO_DO_BRASIL', label: 'Banco do Brasil' },
  { value: 'CAIXA', label: 'Caixa' },
  { value: 'BRADESCO', label: 'Bradesco' },
  { value: 'ITAU', label: 'Itaú' },
  { value: 'SANTANDER', label: 'Santander' },
];

export const BANKING_CONFIG_ENVIRONMENT_OPTIONS: { value: BankEnvironment; label: string }[] = [
  { value: 'SANDBOX', label: 'Sandbox' },
  { value: 'PRODUCTION', label: 'Produção' },
];

export type BankIntegrationConfigInput = {
  bankProvider: string;
  environment: BankEnvironment;
  clientId?: string;
  clientSecret?: string;
  webhookSecret?: string;
  apiBaseUrl?: string;
  webhookUrl?: string;
  agency?: string;
  account?: string;
  accountDigit?: string;
  walletCode?: string;
  agreementCode?: string;
  beneficiaryCode?: string;
  pixKey?: string;
  certificateName?: string;
  certificatePassword?: string;
  active?: boolean;
};

export type BankIntegrationConfigResponse = {
  id: string | null;
  companyId: string;
  bankProvider: string;
  environment: BankEnvironment;
  status: BankIntegrationStatus;
  clientId: string;
  apiBaseUrl: string;
  webhookUrl: string;
  agency: string;
  account: string;
  accountDigit: string;
  walletCode: string;
  agreementCode: string;
  beneficiaryCode: string;
  pixKey: string;
  certificateName: string;
  active: boolean;
  configuredAt: string | null;
  updatedAt: string | null;
  hasClientSecret: boolean;
  hasWebhookSecret: boolean;
  hasCertificatePassword: boolean;
};

export const EMPTY_BANK_INTEGRATION_CONFIG: Omit<
  BankIntegrationConfigResponse,
  'companyId'
> = {
  id: null,
  bankProvider: 'MOCK',
  environment: 'SANDBOX',
  status: 'DRAFT',
  clientId: '',
  apiBaseUrl: '',
  webhookUrl: '',
  agency: '',
  account: '',
  accountDigit: '',
  walletCode: '',
  agreementCode: '',
  beneficiaryCode: '',
  pixKey: '',
  certificateName: '',
  active: false,
  configuredAt: null,
  updatedAt: null,
  hasClientSecret: false,
  hasWebhookSecret: false,
  hasCertificatePassword: false,
};

export function normalizeBankProviderInput(value: unknown): BankProvider | 'ITAU' | 'SANTANDER' {
  const raw = String(value ?? 'MOCK').trim().toUpperCase();
  const allowed = BANKING_CONFIG_PROVIDER_OPTIONS.map((o) => o.value);
  if (allowed.includes(raw as BankProvider)) return raw as BankProvider;
  return 'MOCK';
}

export function normalizeBankEnvironmentInput(value: unknown): BankEnvironment {
  const raw = String(value ?? 'SANDBOX').trim().toUpperCase();
  return raw === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
}

export function providerLabel(code: string): string {
  return BANKING_CONFIG_PROVIDER_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

export function environmentLabel(code: string): string {
  return BANKING_CONFIG_ENVIRONMENT_OPTIONS.find((o) => o.value === code)?.label ?? code;
}
