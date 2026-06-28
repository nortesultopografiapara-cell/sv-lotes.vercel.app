import type { BankEnvironment } from '@/lib/banking/types';

export const ASAAS_CONNECTION_STATUSES = [
  'CONNECTED',
  'DISCONNECTED',
  'ERROR',
  'WEBHOOK_INVALID',
] as const;

export type AsaasConnectionStatus = (typeof ASAAS_CONNECTION_STATUSES)[number];

export type AsaasIntegrationFeatures = {
  pix: boolean;
  boleto: boolean;
  card: boolean;
  paymentLink: boolean;
  autoSync: boolean;
};

export type AsaasIntegrationSyncMeta = {
  lastAt: string | null;
  chargesCount: number;
};

export type AsaasIntegrationMetadata = {
  features?: Partial<AsaasIntegrationFeatures>;
  sync?: Partial<AsaasIntegrationSyncMeta>;
  webhook?: {
    active?: boolean;
    validatedAt?: string | null;
  };
  accountValidated?: boolean;
  connectionStatus?: AsaasConnectionStatus;
  lastConnectionTestAt?: string | null;
  lastConnectionError?: string | null;
};

export type AsaasIntegrationConfigInput = {
  environment: BankEnvironment;
  sandboxApiKey?: string;
  productionApiKey?: string;
  webhookToken?: string;
  webhookUrl?: string;
  features?: Partial<AsaasIntegrationFeatures>;
  autoSync?: boolean;
};

export type AsaasIntegrationConfigResponse = {
  id: string | null;
  companyId: string;
  companyName: string;
  environment: BankEnvironment;
  status: string;
  connectionStatus: AsaasConnectionStatus;
  webhookUrl: string;
  hasSandboxApiKey: boolean;
  hasProductionApiKey: boolean;
  hasWebhookToken: boolean;
  webhookConfigured: boolean;
  webhookActive: boolean;
  accountValidated: boolean;
  features: AsaasIntegrationFeatures;
  sync: AsaasIntegrationSyncMeta;
  configuredAt: string | null;
  updatedAt: string | null;
  lastConnectionTestAt: string | null;
  lastConnectionError: string | null;
};

export const DEFAULT_ASAAS_FEATURES: AsaasIntegrationFeatures = {
  pix: true,
  boleto: true,
  card: true,
  paymentLink: true,
  autoSync: true,
};

export const EMPTY_ASAAS_INTEGRATION_CONFIG: Omit<
  AsaasIntegrationConfigResponse,
  'companyId' | 'companyName'
> = {
  id: null,
  environment: 'SANDBOX',
  status: 'DRAFT',
  connectionStatus: 'DISCONNECTED',
  webhookUrl: '',
  hasSandboxApiKey: false,
  hasProductionApiKey: false,
  hasWebhookToken: false,
  webhookConfigured: false,
  webhookActive: false,
  accountValidated: false,
  features: { ...DEFAULT_ASAAS_FEATURES },
  sync: { lastAt: null, chargesCount: 0 },
  configuredAt: null,
  updatedAt: null,
  lastConnectionTestAt: null,
  lastConnectionError: null,
};

export function normalizeAsaasEnvironment(value: unknown): BankEnvironment {
  const raw = String(value ?? 'SANDBOX').trim().toUpperCase();
  return raw === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
}

export function asaasEnvironmentLabel(code: string): string {
  return code === 'PRODUCTION' ? 'Produção' : 'Sandbox';
}

export function asaasConnectionStatusLabel(status: AsaasConnectionStatus): string {
  switch (status) {
    case 'CONNECTED':
      return 'Conectado';
    case 'DISCONNECTED':
      return 'Desconectado';
    case 'ERROR':
      return 'Erro';
    case 'WEBHOOK_INVALID':
      return 'Webhook inválido';
    default:
      return status;
  }
}

export function buildDefaultAsaasWebhookUrl(origin: string, companyId: string): string {
  const base = String(origin ?? '').replace(/\/$/, '');
  return `${base}/api/finance/asaas/webhook?companyId=${companyId}`;
}

export function resolveAsaasPanelUrl(environment: string): string {
  return environment === 'PRODUCTION' ? 'https://www.asaas.com' : 'https://sandbox.asaas.com';
}
