import type { SupabaseClient } from '@supabase/supabase-js';
import {
  encryptBankingSecret,
  formatBankingEncryptionKeyError,
  getBankingEncryptionKeyDiagnostics,
  isBankingCredentialsEncryptionConfigured,
} from '@/lib/banking/credentialsCrypto';
import type { BankEnvironment, BankIntegrationStatus } from '@/lib/banking/types';
import {
  DEFAULT_ASAAS_FEATURES,
  EMPTY_ASAAS_INTEGRATION_CONFIG,
  type AsaasConnectionStatus,
  type AsaasIntegrationConfigInput,
  type AsaasIntegrationConfigResponse,
  type AsaasIntegrationMetadata,
  normalizeAsaasEnvironment,
} from './asaasIntegrationConfig';

const ASAAS_PROVIDER = 'ASAAS_COMPANY';

type IntegrationRow = {
  id: string;
  company_id: string;
  provider: string;
  environment: BankEnvironment;
  status: BankIntegrationStatus;
  webhook_url: string | null;
  metadata: AsaasIntegrationMetadata | null;
  configured_at: string | null;
  updated_at: string | null;
  active: boolean;
};

type CredentialRow = {
  credential_type: string;
  encrypted_payload: string;
};

const SECRET_TYPES = ['oauth', 'api_key', 'webhook_secret'] as const;

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function parseMetadata(raw: unknown): AsaasIntegrationMetadata {
  if (!raw || typeof raw !== 'object') return {};
  return raw as AsaasIntegrationMetadata;
}

function resolveConnectionStatus(
  row: IntegrationRow | null,
  credentialTypes: Set<string>,
  metadata: AsaasIntegrationMetadata,
): AsaasConnectionStatus {
  if (metadata.connectionStatus === 'WEBHOOK_INVALID') return 'WEBHOOK_INVALID';
  if (row?.status === 'ERROR') return 'ERROR';
  if (metadata.connectionStatus === 'CONNECTED') return 'CONNECTED';
  if (metadata.connectionStatus === 'ERROR') return 'ERROR';

  const env = row?.environment ?? 'SANDBOX';
  const hasActiveKey =
    env === 'PRODUCTION' ? credentialTypes.has('api_key') : credentialTypes.has('oauth');
  if (!hasActiveKey) return 'DISCONNECTED';
  if (row?.status === 'ACTIVE') return 'CONNECTED';
  return 'DISCONNECTED';
}

function mapRowToResponse(
  row: IntegrationRow | null,
  companyId: string,
  companyName: string,
  credentialTypes: Set<string>,
  syncedChargesCount: number,
): AsaasIntegrationConfigResponse {
  if (!row) {
    return {
      ...EMPTY_ASAAS_INTEGRATION_CONFIG,
      companyId,
      companyName,
      sync: { lastAt: null, chargesCount: syncedChargesCount },
    };
  }

  const metadata = parseMetadata(row.metadata);
  const features = {
    ...DEFAULT_ASAAS_FEATURES,
    ...(metadata.features ?? {}),
  };
  const sync = {
    lastAt: metadata.sync?.lastAt ?? null,
    chargesCount: metadata.sync?.chargesCount ?? syncedChargesCount,
  };
  const webhookUrl = row.webhook_url ?? '';
  const hasWebhookToken = credentialTypes.has('webhook_secret');

  return {
    id: row.id,
    companyId,
    companyName,
    environment: row.environment,
    status: row.status,
    connectionStatus: resolveConnectionStatus(row, credentialTypes, metadata),
    webhookUrl,
    hasSandboxApiKey: credentialTypes.has('oauth'),
    hasProductionApiKey: credentialTypes.has('api_key'),
    hasWebhookToken,
    webhookConfigured: Boolean(webhookUrl && hasWebhookToken),
    webhookActive: Boolean(metadata.webhook?.active),
    accountValidated: Boolean(metadata.accountValidated),
    features,
    sync,
    configuredAt: row.configured_at,
    updatedAt: row.updated_at,
    lastConnectionTestAt: metadata.lastConnectionTestAt ?? null,
    lastConnectionError: metadata.lastConnectionError ?? null,
  };
}

async function loadCredentialTypes(
  admin: SupabaseClient,
  integrationId: string,
): Promise<Set<string>> {
  const { data } = await admin
    .from('bank_credentials')
    .select('credential_type')
    .eq('integration_id', integrationId);
  return new Set((data as { credential_type: string }[] | null)?.map((r) => r.credential_type) ?? []);
}

async function countSyncedCharges(admin: SupabaseClient, companyId: string): Promise<number> {
  const { count, error } = await admin
    .from('bank_charges')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('provider', ['ASAAS_COMPANY', 'ASAAS']);
  if (error) return 0;
  return count ?? 0;
}

async function loadCompanyName(admin: SupabaseClient, companyId: string): Promise<string> {
  const { data } = await admin.from('companies').select('name').eq('id', companyId).maybeSingle();
  return String((data as { name?: string } | null)?.name ?? 'Empresa');
}

export async function getCompanyAsaasIntegrationConfig(
  admin: SupabaseClient,
  companyId: string,
): Promise<AsaasIntegrationConfigResponse> {
  const companyName = await loadCompanyName(admin, companyId);
  const syncedChargesCount = await countSyncedCharges(admin, companyId);

  const { data, error } = await admin
    .from('bank_integrations')
    .select(
      'id, company_id, provider, environment, status, webhook_url, metadata, configured_at, updated_at, active',
    )
    .eq('company_id', companyId)
    .eq('provider', ASAAS_PROVIDER)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const row = (data as IntegrationRow | null) ?? null;
  const credentialTypes = row ? await loadCredentialTypes(admin, row.id) : new Set<string>();
  return mapRowToResponse(row, companyId, companyName, credentialTypes, syncedChargesCount);
}

async function upsertCredential(
  admin: SupabaseClient,
  integrationId: string,
  companyId: string,
  credentialType: (typeof SECRET_TYPES)[number],
  plaintext: string,
): Promise<void> {
  const encrypted_payload = encryptBankingSecret(plaintext);
  const { data: existing } = await admin
    .from('bank_credentials')
    .select('id')
    .eq('integration_id', integrationId)
    .eq('credential_type', credentialType)
    .maybeSingle();

  const now = new Date().toISOString();
  if (existing?.id) {
    const { error } = await admin
      .from('bank_credentials')
      .update({ encrypted_payload, updated_at: now })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin.from('bank_credentials').insert({
    integration_id: integrationId,
    company_id: companyId,
    credential_type: credentialType,
    encrypted_payload,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
}

export async function saveCompanyAsaasIntegrationConfig(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  input: AsaasIntegrationConfigInput,
): Promise<AsaasIntegrationConfigResponse> {
  const environment = normalizeAsaasEnvironment(input.environment);
  const now = new Date().toISOString();

  const secretsToSave: { type: (typeof SECRET_TYPES)[number]; value: string }[] = [];
  if (cleanText(input.sandboxApiKey)) {
    secretsToSave.push({ type: 'oauth', value: cleanText(input.sandboxApiKey) });
  }
  if (cleanText(input.productionApiKey)) {
    secretsToSave.push({ type: 'api_key', value: cleanText(input.productionApiKey) });
  }
  if (cleanText(input.webhookToken)) {
    secretsToSave.push({ type: 'webhook_secret', value: cleanText(input.webhookToken) });
  }

  if (secretsToSave.length > 0 && !isBankingCredentialsEncryptionConfigured()) {
    console.warn('[finance/asaas] encryption key diagnostics', getBankingEncryptionKeyDiagnostics());
    throw new Error(formatBankingEncryptionKeyError());
  }

  const existing = await getCompanyAsaasIntegrationConfig(admin, companyId);
  const existingMeta = existing.id
    ? parseMetadata(
        (
          await admin
            .from('bank_integrations')
            .select('metadata')
            .eq('id', existing.id)
            .maybeSingle()
        ).data?.metadata,
      )
    : {};

  const metadata: AsaasIntegrationMetadata = {
    ...existingMeta,
    features: {
      ...DEFAULT_ASAAS_FEATURES,
      ...(existingMeta.features ?? {}),
      ...(input.features ?? {}),
    },
    sync: existingMeta.sync ?? { lastAt: null, chargesCount: existing.sync.chargesCount },
  };

  if (input.autoSync !== undefined) {
    metadata.features = { ...metadata.features, autoSync: Boolean(input.autoSync) };
  }

  const payload = {
    company_id: companyId,
    provider: ASAAS_PROVIDER,
    bank_provider: ASAAS_PROVIDER,
    environment,
    status: 'DRAFT' as BankIntegrationStatus,
    webhook_url: cleanText(input.webhookUrl) || existing.webhookUrl || null,
    metadata,
    configured_at: now,
    updated_at: now,
    is_default: false,
    active: true,
    created_by: userId,
  };

  let integrationId = existing.id;

  if (integrationId) {
    const { error } = await admin
      .from('bank_integrations')
      .update(payload)
      .eq('id', integrationId)
      .eq('company_id', companyId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await admin
      .from('bank_integrations')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    integrationId = data.id as string;
  }

  for (const secret of secretsToSave) {
    await upsertCredential(admin, integrationId!, companyId, secret.type, secret.value);
  }

  return getCompanyAsaasIntegrationConfig(admin, companyId);
}

export async function loadAsaasApiKeyForEnvironment(
  admin: SupabaseClient,
  companyId: string,
  environment: BankEnvironment,
): Promise<string | null> {
  const config = await getCompanyAsaasIntegrationConfig(admin, companyId);
  if (!config.id) return null;

  const credentialType = environment === 'PRODUCTION' ? 'api_key' : 'oauth';
  const { data, error } = await admin
    .from('bank_credentials')
    .select('encrypted_payload')
    .eq('integration_id', config.id)
    .eq('credential_type', credentialType)
    .maybeSingle();

  if (error || !data) return null;

  const { decryptBankingSecret } = await import('@/lib/banking/credentialsCrypto');
  try {
    return decryptBankingSecret((data as CredentialRow).encrypted_payload);
  } catch {
    return null;
  }
}

export async function patchAsaasIntegrationMetadata(
  admin: SupabaseClient,
  companyId: string,
  patch: Partial<AsaasIntegrationMetadata> & { status?: BankIntegrationStatus },
): Promise<void> {
  const config = await getCompanyAsaasIntegrationConfig(admin, companyId);
  if (!config.id) throw new Error('Integração Asaas não configurada.');

  const { data } = await admin
    .from('bank_integrations')
    .select('metadata, status')
    .eq('id', config.id)
    .maybeSingle();

  const current = parseMetadata((data as { metadata?: unknown } | null)?.metadata);
  const metadata: AsaasIntegrationMetadata = {
    ...current,
    ...patch,
    features: { ...current.features, ...patch.features },
    sync: { ...current.sync, ...patch.sync },
    webhook: { ...current.webhook, ...patch.webhook },
  };

  const updatePayload: Record<string, unknown> = {
    metadata,
    updated_at: new Date().toISOString(),
  };
  if (patch.status) updatePayload.status = patch.status;

  const { error } = await admin
    .from('bank_integrations')
    .update(updatePayload)
    .eq('id', config.id)
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
}

/** Garante resposta segura — nunca incluir segredos. */
export function assertAsaasIntegrationResponseSafe(response: AsaasIntegrationConfigResponse): void {
  const forbidden = [
    'sandboxApiKey',
    'productionApiKey',
    'webhookToken',
    'encrypted_payload',
    'apiKey',
  ];
  const json = JSON.stringify(response);
  for (const key of forbidden) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Resposta Asaas expõe campo proibido: ${key}`);
    }
  }
}
