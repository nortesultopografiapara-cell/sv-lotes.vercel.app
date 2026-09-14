import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankEnvironment } from '@/lib/banking/types';
import {
  getCompanyAsaasIntegrationConfig,
  loadAsaasApiKeyForEnvironment,
  patchAsaasIntegrationMetadata,
  type AsaasIntegrationLookup,
} from './asaasIntegrationRepository';
import { bulkUpdateCompanyChargeStatuses } from './companyAsaasBulkStatusUpdate';
import { listCompanyAsaasChargeInstallmentIds } from './companyAsaasChargeRepository';
import { reprocessCompanyAsaasPaidCharges } from './companyAsaasPaymentReconciliation';
import {
  listActiveFinancialAccountsForProvider,
  parseFinancialAccountId,
} from './financialAccountRequired';

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

function asaasLookup(financialAccountId?: string | null): AsaasIntegrationLookup {
  return { financialAccountId: parseFinancialAccountId(financialAccountId) };
}

export async function runAsaasTestConnection(
  admin: SupabaseClient,
  companyId: string,
  lookup?: AsaasIntegrationLookup,
): Promise<AsaasTestConnectionResult> {
  const config = await getCompanyAsaasIntegrationConfig(admin, companyId, lookup);
  const apiKey = await loadAsaasApiKeyForEnvironment(admin, companyId, config.environment, lookup);

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

      await patchAsaasIntegrationMetadata(
        admin,
        companyId,
        {
          connectionStatus: 'ERROR',
          lastConnectionTestAt: new Date().toISOString(),
          lastConnectionError: msg,
          status: 'ERROR',
        },
        lookup,
      );

      return { ok: false, message: msg, latencyMs };
    }

    const accountName =
      (json as { name?: string; company?: string }).name ||
      (json as { company?: string }).company ||
      config.companyName;
    const accountEmail = String((json as { email?: string }).email || '').trim() || undefined;

    await patchAsaasIntegrationMetadata(
      admin,
      companyId,
      {
        connectionStatus: 'CONNECTED',
        lastConnectionTestAt: new Date().toISOString(),
        lastConnectionError: null,
        accountValidated: true,
        status: 'ACTIVE',
      },
      lookup,
    );

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
    await patchAsaasIntegrationMetadata(
      admin,
      companyId,
      {
        connectionStatus: 'ERROR',
        lastConnectionTestAt: new Date().toISOString(),
        lastConnectionError: message,
        status: 'ERROR',
      },
      lookup,
    );
    return { ok: false, message, latencyMs: Date.now() - started };
  }
}

export async function runAsaasValidateWebhook(
  admin: SupabaseClient,
  companyId: string,
  lookup?: AsaasIntegrationLookup,
): Promise<AsaasWebhookValidationResult> {
  const config = await getCompanyAsaasIntegrationConfig(admin, companyId, lookup);

  if (!config.webhookUrl) {
    await patchAsaasIntegrationMetadata(
      admin,
      companyId,
      {
        connectionStatus: 'WEBHOOK_INVALID',
        webhook: { active: false, validatedAt: null },
      },
      lookup,
    );
    return {
      ok: false,
      message: 'Webhook URL não configurada.',
      webhookConfigured: false,
      webhookActive: false,
    };
  }

  if (!config.hasWebhookToken) {
    await patchAsaasIntegrationMetadata(
      admin,
      companyId,
      {
        connectionStatus: 'WEBHOOK_INVALID',
        webhook: { active: false, validatedAt: null },
      },
      lookup,
    );
    return {
      ok: false,
      message: 'Webhook Token não configurado.',
      webhookConfigured: false,
      webhookActive: false,
    };
  }

  const validatedAt = new Date().toISOString();
  await patchAsaasIntegrationMetadata(
    admin,
    companyId,
    {
      webhook: { active: true, validatedAt },
      connectionStatus: 'CONNECTED',
      status: 'ACTIVE',
    },
    lookup,
  );

  return {
    ok: true,
    message: 'Webhook configurado e validado localmente.',
    webhookConfigured: true,
    webhookActive: true,
  };
}

async function resolveAsaasSyncAccountIds(
  admin: SupabaseClient,
  companyId: string,
  lookup?: AsaasIntegrationLookup,
): Promise<string[]> {
  const explicit = parseFinancialAccountId(lookup?.financialAccountId);
  if (explicit) return [explicit];
  const accounts = await listActiveFinancialAccountsForProvider(admin, companyId, 'ASAAS_COMPANY');
  return accounts.map((account) => account.id);
}

export async function runAsaasSyncCharges(
  admin: SupabaseClient,
  companyId: string,
  lookup?: AsaasIntegrationLookup,
): Promise<AsaasSyncResult> {
  const lastSyncAt = new Date().toISOString();
  const accountIds = await resolveAsaasSyncAccountIds(admin, companyId, lookup);

  let syncedCount = 0;
  let paidCount = 0;
  let receiptUpdatedCount = 0;
  let failedCount = 0;

  if (accountIds.length === 0) {
    const config = await getCompanyAsaasIntegrationConfig(admin, companyId, lookup);
    const { count, error } = await admin
      .from('bank_charges')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('provider', ['ASAAS_COMPANY', 'ASAAS']);
    if (error) throw new Error(error.message);
    syncedCount = count ?? config.sync.chargesCount;
    await patchAsaasIntegrationMetadata(
      admin,
      companyId,
      { sync: { lastAt: lastSyncAt, chargesCount: syncedCount } },
      lookup,
    );
  } else {
    for (const financialAccountId of accountIds) {
      const installmentIds = await listCompanyAsaasChargeInstallmentIds(admin, companyId, {
        financialAccountId,
      });
      const accountLookup = asaasLookup(financialAccountId);
      if (installmentIds.length === 0) {
        await patchAsaasIntegrationMetadata(
          admin,
          companyId,
          { sync: { lastAt: lastSyncAt, chargesCount: 0 } },
          accountLookup,
        );
        continue;
      }

      const result = await bulkUpdateCompanyChargeStatuses(admin, companyId, installmentIds);
      syncedCount += result.updated;
      paidCount += result.paid;
      receiptUpdatedCount += result.receiptUpdatedCount;
      failedCount += result.failed;
      await patchAsaasIntegrationMetadata(
        admin,
        companyId,
        { sync: { lastAt: lastSyncAt, chargesCount: installmentIds.length } },
        accountLookup,
      );
    }
  }

  const parts = [`Sincronização concluída — ${syncedCount} cobrança(s) atualizada(s).`];
  if (paidCount > 0) parts.push(`${paidCount} paga(s).`);
  if (receiptUpdatedCount > 0) parts.push(`${receiptUpdatedCount} parcela(s) baixada(s).`);
  if (failedCount > 0) parts.push(`${failedCount} falha(s).`);

  return {
    ok: failedCount === 0,
    message: parts.join(' '),
    syncedCount,
    lastSyncAt,
  };
}

export async function runAsaasReprocessPayments(
  admin: SupabaseClient,
  companyId: string,
  options?: { userId?: string | null; financialAccountId?: string | null },
): Promise<AsaasReprocessResult> {
  try {
    const result = await reprocessCompanyAsaasPaidCharges(admin, companyId, {
      userId: options?.userId,
      financialAccountId: parseFinancialAccountId(options?.financialAccountId),
    });
    if (result.reprocessedCount === 0) {
      return {
        ok: true,
        message: 'Nenhum pagamento Company pendente de baixa automática.',
        reprocessedCount: 0,
      };
    }

    const parts = [`${result.reprocessedCount} cobrança(s) reprocessada(s).`];
    if (result.receiptUpdatedCount > 0) {
      parts.push(`${result.receiptUpdatedCount} parcela(s) baixada(s).`);
    }
    if (result.cashMovementCreatedCount > 0) {
      parts.push(`${result.cashMovementCreatedCount} entrada(s) no caixa criada(s).`);
    }

    return {
      ok: true,
      message: parts.join(' '),
      reprocessedCount: result.reprocessedCount,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Erro ao reprocessar pagamentos Company.',
      reprocessedCount: 0,
    };
  }
}
