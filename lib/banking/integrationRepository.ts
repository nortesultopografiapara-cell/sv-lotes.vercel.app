import type { SupabaseClient } from '@supabase/supabase-js';
import {
  encryptBankingSecret,
  formatBankingEncryptionKeyError,
  getBankingEncryptionKeyDiagnostics,
  isBankingCredentialsEncryptionConfigured,
} from './credentialsCrypto';
import type { BankIntegrationConfigInput, BankIntegrationConfigResponse } from './integrationConfig';
import { EMPTY_BANK_INTEGRATION_CONFIG, normalizeBankEnvironmentInput, normalizeBankProviderInput } from './integrationConfig';
import type { BankEnvironment, BankIntegrationStatus } from './types';

type IntegrationRow = {
  id: string;
  company_id: string;
  provider: string;
  bank_provider: string | null;
  environment: BankEnvironment;
  status: BankIntegrationStatus;
  client_id: string | null;
  api_base_url: string | null;
  agency: string | null;
  account_number: string | null;
  account_digit: string | null;
  wallet_code: string | null;
  covenant_code: string | null;
  beneficiary_code: string | null;
  pix_key: string | null;
  certificate_name: string | null;
  webhook_url: string | null;
  active: boolean;
  configured_at: string | null;
  updated_at: string | null;
};

type CredentialRow = {
  credential_type: string;
};

const SECRET_TYPES = ['oauth', 'webhook_secret', 'certificate'] as const;

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function mapRowToResponse(
  row: IntegrationRow | null,
  companyId: string,
  credentialTypes: Set<string>,
): BankIntegrationConfigResponse {
  if (!row) {
    return { ...EMPTY_BANK_INTEGRATION_CONFIG, companyId };
  }
  return {
    id: row.id,
    companyId,
    bankProvider: row.bank_provider || row.provider || 'MOCK',
    environment: row.environment,
    status: row.status,
    clientId: row.client_id ?? '',
    apiBaseUrl: row.api_base_url ?? '',
    webhookUrl: row.webhook_url ?? '',
    agency: row.agency ?? '',
    account: row.account_number ?? '',
    accountDigit: row.account_digit ?? '',
    walletCode: row.wallet_code ?? '',
    agreementCode: row.covenant_code ?? '',
    beneficiaryCode: row.beneficiary_code ?? '',
    pixKey: row.pix_key ?? '',
    certificateName: row.certificate_name ?? '',
    active: Boolean(row.active),
    configuredAt: row.configured_at,
    updatedAt: row.updated_at,
    hasClientSecret: credentialTypes.has('oauth'),
    hasWebhookSecret: credentialTypes.has('webhook_secret'),
    hasCertificatePassword: credentialTypes.has('certificate'),
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
  return new Set((data as CredentialRow[] | null)?.map((r) => r.credential_type) ?? []);
}

export async function getCompanyBankIntegrationConfig(
  admin: SupabaseClient,
  companyId: string,
): Promise<BankIntegrationConfigResponse> {
  const { data, error } = await admin
    .from('bank_integrations')
    .select(
      'id, company_id, provider, bank_provider, environment, status, client_id, api_base_url, agency, account_number, account_digit, wallet_code, covenant_code, beneficiary_code, pix_key, certificate_name, webhook_url, active, configured_at, updated_at',
    )
    .eq('company_id', companyId)
    .eq('is_default', true)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const row = (data as IntegrationRow | null) ?? null;
  const credentialTypes = row ? await loadCredentialTypes(admin, row.id) : new Set<string>();
  return mapRowToResponse(row, companyId, credentialTypes);
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

export async function saveCompanyBankIntegrationConfig(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  input: BankIntegrationConfigInput,
): Promise<BankIntegrationConfigResponse> {
  const bankProvider = normalizeBankProviderInput(input.bankProvider);
  const environment = normalizeBankEnvironmentInput(input.environment);
  const now = new Date().toISOString();

  const secretsToSave: { type: (typeof SECRET_TYPES)[number]; value: string }[] = [];
  if (cleanText(input.clientSecret)) {
    secretsToSave.push({ type: 'oauth', value: cleanText(input.clientSecret) });
  }
  if (cleanText(input.webhookSecret)) {
    secretsToSave.push({ type: 'webhook_secret', value: cleanText(input.webhookSecret) });
  }
  if (cleanText(input.certificatePassword)) {
    secretsToSave.push({ type: 'certificate', value: cleanText(input.certificatePassword) });
  }

  if (secretsToSave.length > 0 && !isBankingCredentialsEncryptionConfigured()) {
    const diag = getBankingEncryptionKeyDiagnostics();
    console.warn('[banking/integration] encryption key diagnostics', diag);
    throw new Error(formatBankingEncryptionKeyError());
  }

  const existing = await getCompanyBankIntegrationConfig(admin, companyId);
  const payload = {
    company_id: companyId,
    provider: bankProvider,
    bank_provider: bankProvider,
    environment,
    status: 'DRAFT' as BankIntegrationStatus,
    client_id: cleanText(input.clientId) || null,
    api_base_url: cleanText(input.apiBaseUrl) || null,
    agency: cleanText(input.agency) || null,
    account_number: cleanText(input.account) || null,
    account_digit: cleanText(input.accountDigit) || null,
    wallet_code: cleanText(input.walletCode) || null,
    covenant_code: cleanText(input.agreementCode) || null,
    beneficiary_code: cleanText(input.beneficiaryCode) || null,
    pix_key: cleanText(input.pixKey) || null,
    certificate_name: cleanText(input.certificateName) || null,
    webhook_url: cleanText(input.webhookUrl) || null,
    active: Boolean(input.active),
    configured_at: now,
    updated_at: now,
    is_default: true,
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

  return getCompanyBankIntegrationConfig(admin, companyId);
}

/** Garante resposta segura — nunca incluir segredos. */
export function assertIntegrationResponseSafe(response: BankIntegrationConfigResponse): void {
  const forbidden = ['clientSecret', 'webhookSecret', 'certificatePassword', 'encrypted_payload'];
  const json = JSON.stringify(response);
  for (const key of forbidden) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Resposta de integração expõe campo proibido: ${key}`);
    }
  }
}
