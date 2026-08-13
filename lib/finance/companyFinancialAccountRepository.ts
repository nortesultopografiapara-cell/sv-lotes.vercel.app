import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankEnvironment } from '@/lib/banking/types';
import {
  type CompanyFinancialAccountResponse,
  type CompanyFinancialAccountRow,
  type CompanyFinancialAccountType,
  mapCompanyFinancialAccountRow,
} from './companyFinancialAccountTypes';

const ASAAS_PROVIDER = 'ASAAS_COMPANY';

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

async function loadCredentialTypes(
  admin: SupabaseClient,
  integrationId: string | null,
): Promise<Set<string>> {
  if (!integrationId) return new Set();
  const { data } = await admin
    .from('bank_credentials')
    .select('credential_type')
    .eq('integration_id', integrationId);
  return new Set((data as { credential_type: string }[] | null)?.map((r) => r.credential_type) ?? []);
}

async function loadIntegrationConnectionStatus(
  admin: SupabaseClient,
  integrationId: string | null,
): Promise<CompanyFinancialAccountResponse['connectionStatus']> {
  if (!integrationId) return 'DISCONNECTED';
  const { data } = await admin
    .from('bank_integrations')
    .select('status, metadata')
    .eq('id', integrationId)
    .maybeSingle();
  if (!data) return 'DISCONNECTED';
  const metadata = (data as { metadata?: { connectionStatus?: string } }).metadata ?? {};
  if (metadata.connectionStatus === 'WEBHOOK_INVALID') return 'WEBHOOK_INVALID';
  if ((data as { status?: string }).status === 'ERROR') return 'ERROR';
  if (metadata.connectionStatus === 'CONNECTED') return 'CONNECTED';
  return 'DISCONNECTED';
}

async function loadIntegrationProvider(
  admin: SupabaseClient,
  integrationId: string | null,
): Promise<string | null> {
  if (!integrationId) return null;
  const { data } = await admin
    .from('bank_integrations')
    .select('provider')
    .eq('id', integrationId)
    .maybeSingle();
  return data?.provider ? String(data.provider).toUpperCase() : null;
}

async function mapRowWithIntegration(
  admin: SupabaseClient,
  row: CompanyFinancialAccountRow,
): Promise<CompanyFinancialAccountResponse> {
  const credentialTypes = await loadCredentialTypes(admin, row.bank_integration_id);
  const connectionStatus = await loadIntegrationConnectionStatus(admin, row.bank_integration_id);
  const provider = await loadIntegrationProvider(admin, row.bank_integration_id);
  return mapCompanyFinancialAccountRow(row, {
    hasSandboxApiKey: credentialTypes.has('oauth'),
    hasProductionApiKey: credentialTypes.has('api_key'),
    hasWebhookToken: credentialTypes.has('webhook_secret'),
    connectionStatus,
    provider,
  });
}

export async function listCompanyFinancialAccounts(
  admin: SupabaseClient,
  companyId: string,
  options?: { activeOnly?: boolean },
): Promise<CompanyFinancialAccountResponse[]> {
  let query = admin
    .from('company_financial_accounts')
    .select('*')
    .eq('company_id', companyId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (options?.activeOnly !== false) {
    query = query.eq('active', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data as CompanyFinancialAccountRow[]) ?? [];
  return Promise.all(rows.map((row) => mapRowWithIntegration(admin, row)));
}

export async function getCompanyFinancialAccountById(
  admin: SupabaseClient,
  companyId: string,
  accountId: string,
): Promise<CompanyFinancialAccountResponse | null> {
  const { data, error } = await admin
    .from('company_financial_accounts')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', accountId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRowWithIntegration(admin, data as CompanyFinancialAccountRow);
}

export async function getDefaultFinancialAccountForCompany(
  admin: SupabaseClient,
  companyId: string,
): Promise<CompanyFinancialAccountResponse | null> {
  const { data, error } = await admin
    .from('company_financial_accounts')
    .select('*')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRowWithIntegration(admin, data as CompanyFinancialAccountRow);
}

async function clearOtherDefaults(
  admin: SupabaseClient,
  companyId: string,
  exceptId?: string,
): Promise<void> {
  let query = admin
    .from('company_financial_accounts')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('is_default', true);

  if (exceptId) query = query.neq('id', exceptId);

  const { error } = await query;
  if (error) throw new Error(error.message);
}

async function upsertIntegrationCredential(
  admin: SupabaseClient,
  integrationId: string,
  companyId: string,
  credentialType: 'oauth' | 'api_key' | 'webhook_secret',
  plaintext: string,
): Promise<void> {
  if (!plaintext) return;
  const {
    encryptBankingSecret,
    formatBankingEncryptionKeyError,
    isBankingCredentialsEncryptionConfigured,
  } = await import('@/lib/banking/credentialsCrypto');
  if (!isBankingCredentialsEncryptionConfigured()) {
    throw new Error(formatBankingEncryptionKeyError());
  }

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

async function ensureBankIntegrationForAccount(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  account: CompanyFinancialAccountRow,
  input: {
    environment: BankEnvironment;
    webhookUrl?: string | null;
  },
): Promise<string> {
  if (account.bank_integration_id) {
    const { error } = await admin
      .from('bank_integrations')
      .update({
        environment: input.environment,
        webhook_url: cleanText(input.webhookUrl) || null,
        label: account.name,
        updated_at: new Date().toISOString(),
        active: account.active,
      })
      .eq('id', account.bank_integration_id)
      .eq('company_id', companyId);
    if (error) throw new Error(error.message);
    return account.bank_integration_id;
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('bank_integrations')
    .insert({
      company_id: companyId,
      provider: ASAAS_PROVIDER,
      bank_provider: ASAAS_PROVIDER,
      environment: input.environment,
      status: 'DRAFT',
      label: account.name,
      webhook_url: cleanText(input.webhookUrl) || null,
      metadata: {},
      configured_at: now,
      updated_at: now,
      is_default: account.is_default,
      active: account.active,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

export type SaveCompanyFinancialAccountInput = {
  name: string;
  accountType: CompanyFinancialAccountType;
  beneficiaryName?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  environment: BankEnvironment;
  isDefault?: boolean;
  active?: boolean;
  notes?: string | null;
  webhookUrl?: string | null;
  sandboxApiKey?: string | null;
  productionApiKey?: string | null;
  webhookToken?: string | null;
};

export async function createCompanyFinancialAccount(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  input: SaveCompanyFinancialAccountInput,
): Promise<CompanyFinancialAccountResponse> {
  const now = new Date().toISOString();
  const isDefault = Boolean(input.isDefault);

  if (isDefault) {
    await clearOtherDefaults(admin, companyId);
  }

  const { data, error } = await admin
    .from('company_financial_accounts')
    .insert({
      company_id: companyId,
      name: cleanText(input.name),
      account_type: input.accountType,
      beneficiary_name: cleanText(input.beneficiaryName) || null,
      document: cleanText(input.document) || null,
      email: cleanText(input.email) || null,
      phone: cleanText(input.phone) || null,
      environment: input.environment,
      is_default: isDefault,
      active: input.active !== false,
      notes: cleanText(input.notes) || null,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  const row = data as CompanyFinancialAccountRow;

  const integrationId = await ensureBankIntegrationForAccount(admin, companyId, userId, row, {
    environment: input.environment,
    webhookUrl: input.webhookUrl,
  });

  if (integrationId !== row.bank_integration_id) {
    const { error: linkError } = await admin
      .from('company_financial_accounts')
      .update({ bank_integration_id: integrationId, updated_at: now })
      .eq('id', row.id);
    if (linkError) throw new Error(linkError.message);
    row.bank_integration_id = integrationId;
  }

  if (cleanText(input.sandboxApiKey) || cleanText(input.productionApiKey) || cleanText(input.webhookToken)) {
    await upsertIntegrationCredential(admin, integrationId, companyId, 'oauth', cleanText(input.sandboxApiKey));
    await upsertIntegrationCredential(admin, integrationId, companyId, 'api_key', cleanText(input.productionApiKey));
    await upsertIntegrationCredential(admin, integrationId, companyId, 'webhook_secret', cleanText(input.webhookToken));
  }

  return (await getCompanyFinancialAccountById(admin, companyId, row.id))!;
}

export async function updateCompanyFinancialAccount(
  admin: SupabaseClient,
  companyId: string,
  accountId: string,
  userId: string,
  input: Partial<SaveCompanyFinancialAccountInput>,
): Promise<CompanyFinancialAccountResponse> {
  const existing = await getCompanyFinancialAccountById(admin, companyId, accountId);
  if (!existing) throw new Error('Conta financeira não encontrada.');

  const now = new Date().toISOString();
  if (input.isDefault) {
    await clearOtherDefaults(admin, companyId, accountId);
  }

  const patch: Record<string, unknown> = { updated_at: now };
  if (input.name !== undefined) patch.name = cleanText(input.name);
  if (input.accountType !== undefined) patch.account_type = input.accountType;
  if (input.beneficiaryName !== undefined) patch.beneficiary_name = cleanText(input.beneficiaryName) || null;
  if (input.document !== undefined) patch.document = cleanText(input.document) || null;
  if (input.email !== undefined) patch.email = cleanText(input.email) || null;
  if (input.phone !== undefined) patch.phone = cleanText(input.phone) || null;
  if (input.environment !== undefined) patch.environment = input.environment;
  if (input.isDefault !== undefined) patch.is_default = Boolean(input.isDefault);
  if (input.active !== undefined) patch.active = Boolean(input.active);
  if (input.notes !== undefined) patch.notes = cleanText(input.notes) || null;

  const { data, error } = await admin
    .from('company_financial_accounts')
    .update(patch)
    .eq('id', accountId)
    .eq('company_id', companyId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  const row = data as CompanyFinancialAccountRow;

  const integrationId = await ensureBankIntegrationForAccount(admin, companyId, userId, row, {
    environment: (input.environment ?? row.environment) as BankEnvironment,
    webhookUrl: input.webhookUrl,
  });

  if (integrationId !== row.bank_integration_id) {
    const { error: linkError } = await admin
      .from('company_financial_accounts')
      .update({ bank_integration_id: integrationId, updated_at: now })
      .eq('id', accountId);
    if (linkError) throw new Error(linkError.message);
  }

  if (cleanText(input.sandboxApiKey) || cleanText(input.productionApiKey) || cleanText(input.webhookToken)) {
    await upsertIntegrationCredential(admin, integrationId, companyId, 'oauth', cleanText(input.sandboxApiKey));
    await upsertIntegrationCredential(admin, integrationId, companyId, 'api_key', cleanText(input.productionApiKey));
    await upsertIntegrationCredential(admin, integrationId, companyId, 'webhook_secret', cleanText(input.webhookToken));
  }

  return (await getCompanyFinancialAccountById(admin, companyId, accountId))!;
}

export async function loadAsaasApiKeyForFinancialAccount(
  admin: SupabaseClient,
  financialAccountId: string,
  companyId: string,
  environment?: BankEnvironment,
): Promise<{ apiKey: string; environment: BankEnvironment; integrationId: string; financialAccountId: string }> {
  const account = await getCompanyFinancialAccountById(admin, companyId, financialAccountId);
  if (!account || !account.active) {
    throw new Error('Conta financeira não encontrada ou inativa.');
  }
  if (!account.bankIntegrationId) {
    throw new Error('Conta financeira sem integração Asaas configurada.');
  }

  const env = environment ?? account.environment;
  const credentialType = env === 'PRODUCTION' ? 'api_key' : 'oauth';
  const { data, error } = await admin
    .from('bank_credentials')
    .select('encrypted_payload')
    .eq('integration_id', account.bankIntegrationId)
    .eq('credential_type', credentialType)
    .maybeSingle();

  if (error || !data) {
    throw new Error('API Key Asaas não configurada para esta conta financeira.');
  }

  const { decryptBankingSecret } = await import('@/lib/banking/credentialsCrypto');
  const apiKey = decryptBankingSecret((data as { encrypted_payload: string }).encrypted_payload);
  if (!apiKey) throw new Error('API Key Asaas inválida para esta conta financeira.');

  return {
    apiKey,
    environment: env,
    integrationId: account.bankIntegrationId,
    financialAccountId: account.id,
  };
}
