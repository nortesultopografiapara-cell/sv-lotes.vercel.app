import type { AsaasIntegrationConfigResponse } from './asaasIntegrationConfig';
import { isCompanyAsaasIntegrationReady } from './companyAsaasChargeTypes';

export type AsaasSetupCardStatus = 'configured' | 'pending' | 'error' | 'verified';

export type AsaasSetupCard = {
  id: string;
  label: string;
  status: AsaasSetupCardStatus;
  statusLabel: string;
};

export function asaasSetupStatusLabel(status: AsaasSetupCardStatus): string {
  switch (status) {
    case 'verified':
      return 'Verificado';
    case 'configured':
      return 'Configurado';
    case 'error':
      return 'Erro';
    default:
      return 'Pendente';
  }
}

export function isAsaasIntegrationVerified(config: AsaasIntegrationConfigResponse): boolean {
  return isCompanyAsaasIntegrationReady(config);
}

export function hasAsaasIntegrationStarted(config: AsaasIntegrationConfigResponse): boolean {
  return Boolean(
    config.id ||
      config.hasSandboxApiKey ||
      config.hasProductionApiKey ||
      config.webhookConfigured ||
      config.configuredAt,
  );
}

export function hasActiveEnvironmentApiKey(config: AsaasIntegrationConfigResponse): boolean {
  return config.environment === 'PRODUCTION'
    ? config.hasProductionApiKey
    : config.hasSandboxApiKey;
}

export function buildAsaasSetupStatusCards(
  config: AsaasIntegrationConfigResponse,
): AsaasSetupCard[] {
  const connectionError = config.connectionStatus === 'ERROR';
  const webhookError = config.connectionStatus === 'WEBHOOK_INVALID';
  const integrationReady = isCompanyAsaasIntegrationReady(config);

  const accountStatus: AsaasSetupCardStatus = connectionError
    ? 'error'
    : integrationReady
      ? 'verified'
      : config.accountValidated && config.connectionStatus === 'CONNECTED'
        ? 'verified'
        : config.connectionStatus === 'CONNECTED'
          ? 'configured'
          : 'pending';

  const apiKeyStatus: AsaasSetupCardStatus = connectionError
    ? 'error'
    : hasActiveEnvironmentApiKey(config)
      ? integrationReady || config.connectionStatus === 'CONNECTED'
        ? 'verified'
        : 'configured'
      : 'pending';

  const webhookStatus: AsaasSetupCardStatus = webhookError
    ? 'error'
    : config.webhookActive
      ? 'verified'
      : config.webhookConfigured
        ? 'configured'
        : 'pending';

  const pixStatus: AsaasSetupCardStatus = config.features.pix ? 'configured' : 'pending';
  const boletoStatus: AsaasSetupCardStatus = config.features.boleto ? 'configured' : 'pending';

  const syncStatus: AsaasSetupCardStatus = config.features.autoSync
    ? config.sync.lastAt
      ? 'verified'
      : 'configured'
    : 'pending';

  return [
    { id: 'account', label: 'Conta Asaas', status: accountStatus, statusLabel: asaasSetupStatusLabel(accountStatus) },
    { id: 'apiKey', label: 'API Key', status: apiKeyStatus, statusLabel: asaasSetupStatusLabel(apiKeyStatus) },
    { id: 'webhook', label: 'Webhook', status: webhookStatus, statusLabel: asaasSetupStatusLabel(webhookStatus) },
    { id: 'pix', label: 'PIX', status: pixStatus, statusLabel: asaasSetupStatusLabel(pixStatus) },
    { id: 'boleto', label: 'Boleto', status: boletoStatus, statusLabel: asaasSetupStatusLabel(boletoStatus) },
    { id: 'sync', label: 'Sincronização', status: syncStatus, statusLabel: asaasSetupStatusLabel(syncStatus) },
  ];
}

export function asaasSetupCardClasses(status: AsaasSetupCardStatus): string {
  switch (status) {
    case 'verified':
      return 'border-emerald-500/35 bg-emerald-500/10';
    case 'configured':
      return 'border-blue-500/30 bg-blue-500/8';
    case 'error':
      return 'border-red-500/35 bg-red-500/10';
    default:
      return 'border-[var(--border-color)] bg-[var(--bg-card)]';
  }
}

export function asaasSetupCardTextClasses(status: AsaasSetupCardStatus): string {
  switch (status) {
    case 'verified':
      return 'text-emerald-400';
    case 'configured':
      return 'text-blue-300';
    case 'error':
      return 'text-red-300';
    default:
      return 'text-[var(--text-muted)]';
  }
}
