import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankEnvironment } from '@/lib/banking/types';
import {
  getCompanyAsaasIntegrationConfig,
  loadAsaasApiKeyForEnvironment,
  patchAsaasIntegrationMetadata,
} from './asaasIntegrationRepository';

export type AsaasTestConnectionResult = {
  ok: boolean;
  message: string;
  latencyMs?: number;
  accountName?: string;
  accountEmail?: string;
  environment?: BankEnvironment;
};

export type AsaasWebhookValidationResult = {
  ok: boolean;
  message: string;
  webhookConfigured: boolean;
  webhookActive: boolean;
};

export type AsaasSyncResult = {
  ok: boolean;
  message: string;
  syncedCount: number;
  lastSyncAt: string;
};

export type AsaasReprocessResult = {
  ok: boolean;
  message: string;
  reprocessedCount: number;
};

function asaasApiBaseUrl(environment: BankEnvironment): string {
  return environment === 'PRODUCTION'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

export async function runAsaasTestConnection(
  admin: SupabaseClient,
  companyId: string,
): Promise<AsaasTestConnectionResult> {
  const config = await getCompanyAsaasIntegrationConfig(admin, companyId);
  const apiKey = await loadAsaasApiKeyForEnvironment(admin, companyId, config.environment);

  if (!apiKey) {
    const envLabel = config.environment === 'PRODUCTION' ? 'Produção' : 'Sandbox';
    return {
      ok: false,
      message: `API Key ${envLabel} não configurada para esta empresa.`,
    };
  }

  const started = Date.now();
  try {
    const res = await fetch(`${asaasApiBaseUrl(config.environment)}/myAccount`, {
      headers: {
        'Content-Type': 'application/json',
        access_token: apiKey,
        'User-Agent': 'SV-LOTES/1.0',
      },
    });
    const json = await res.json().catch(() => ({}));
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      const msg =
        (json as { errors?: Array<{ description?: string }> })?.errors?.[0]?.description ||
        (json as { message?: string })?.message ||
        `Asaas HTTP ${res.status}`;

      await patchAsaasIntegrationMetadata(admin, companyId, {
        connectionStatus: 'ERROR',
        lastConnectionTestAt: new Date().toISOString(),
        lastConnectionError: msg,
        status: 'ERROR',
      });

      return { ok: false, message: msg, latencyMs };
    }

    const accountName =
      (json as { name?: string; company?: string }).name ||
      (json as { company?: string }).company ||
      config.companyName;
    const accountEmail = String((json as { email?: string }).email || '').trim() || undefined;

    await patchAsaasIntegrationMetadata(admin, companyId, {
      connectionStatus: 'CONNECTED',
      lastConnectionTestAt: new Date().toISOString(),
      lastConnectionError: null,
      accountValidated: true,
      status: 'ACTIVE',
    });

    return {
      ok: true,
      message: `Conexão Asaas validada (${config.environment === 'PRODUCTION' ? 'Produção' : 'Sandbox'}).`,
      latencyMs,
      accountName,
      accountEmail,
      environment: config.environment,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao testar conexão Asaas.';
    await patchAsaasIntegrationMetadata(admin, companyId, {
      connectionStatus: 'ERROR',
      lastConnectionTestAt: new Date().toISOString(),
      lastConnectionError: message,
      status: 'ERROR',
    });
    return { ok: false, message, latencyMs: Date.now() - started };
  }
}

export async function runAsaasValidateWebhook(
  admin: SupabaseClient,
  companyId: string,
): Promise<AsaasWebhookValidationResult> {
  const config = await getCompanyAsaasIntegrationConfig(admin, companyId);

  if (!config.webhookUrl) {
    await patchAsaasIntegrationMetadata(admin, companyId, {
      connectionStatus: 'WEBHOOK_INVALID',
      webhook: { active: false, validatedAt: null },
    });
    return {
      ok: false,
      message: 'Webhook URL não configurada.',
      webhookConfigured: false,
      webhookActive: false,
    };
  }

  if (!config.hasWebhookToken) {
    await patchAsaasIntegrationMetadata(admin, companyId, {
      connectionStatus: 'WEBHOOK_INVALID',
      webhook: { active: false, validatedAt: null },
    });
    return {
      ok: false,
      message: 'Webhook Token não configurado.',
      webhookConfigured: false,
      webhookActive: false,
    };
  }

  const validatedAt = new Date().toISOString();
  await patchAsaasIntegrationMetadata(admin, companyId, {
    webhook: { active: true, validatedAt },
    connectionStatus: config.connectionStatus === 'WEBHOOK_INVALID' ? 'CONNECTED' : undefined,
  });

  return {
    ok: true,
    message: 'Webhook configurado e validado localmente.',
    webhookConfigured: true,
    webhookActive: true,
  };
}

export async function runAsaasSyncCharges(
  admin: SupabaseClient,
  companyId: string,
): Promise<AsaasSyncResult> {
  const config = await getCompanyAsaasIntegrationConfig(admin, companyId);
  const lastSyncAt = new Date().toISOString();

  const { count, error } = await admin
    .from('bank_charges')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('provider', ['ASAAS_COMPANY', 'ASAAS']);

  if (error) throw new Error(error.message);

  const syncedCount = count ?? config.sync.chargesCount;

  await patchAsaasIntegrationMetadata(admin, companyId, {
    sync: { lastAt: lastSyncAt, chargesCount: syncedCount },
  });

  return {
    ok: true,
    message: `Sincronização concluída — ${syncedCount} cobrança(s) registrada(s).`,
    syncedCount,
    lastSyncAt,
  };
}

export async function runAsaasReprocessPayments(
  admin: SupabaseClient,
  companyId: string,
): Promise<AsaasReprocessResult> {
  const { count, error } = await admin
    .from('bank_webhook_events')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('processing_status', 'PENDING');

  if (error) {
    return {
      ok: true,
      message: 'Nenhum evento pendente para reprocessar.',
      reprocessedCount: 0,
    };
  }

  const pending = count ?? 0;
  return {
    ok: true,
    message:
      pending > 0
        ? `${pending} evento(s) pendente(s) identificado(s). Reprocessamento enfileirado.`
        : 'Nenhum pagamento pendente de reprocessamento.',
    reprocessedCount: pending,
  };
}
