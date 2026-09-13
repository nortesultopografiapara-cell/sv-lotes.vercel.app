/**
 * Probe seguro do ambiente Asaas (Fase 3). Nunca imprime chave/token.
 * Não cria cobrança se o ambiente não for SANDBOX inequívoco.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { asaasCompanyBaseUrl, asaasCompanyFetchCommercialInfo } from '../lib/finance/asaasCompanyClient';
import { loadAsaasApiKeyForFinancialAccount } from '../lib/finance/companyFinancialAccountRepository';
import { getBankingEncryptionKeyDiagnostics } from '../lib/banking/credentialsCrypto';

const DEVELOP_REF = 'hoynysmynxncdlptuzub';
const PRODUCTION_REF = 'aezktedncttwpqeunjej';
const HOMOLOG_COMPANY = 'b5b05aaa-5b01-4000-8000-000000000001';
const HOMOLOG_PROJECT = 'b5b05aaa-5b01-4000-8000-000000000010';

function loadEnvLocal(): void {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) throw new Error('.env.local ausente');
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function projectRefFromUrl(url: string): string {
  try {
    return new URL(url).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

function walletLooksSynthetic(value: string): boolean {
  return /^wal_homolog_/i.test(value) || !/^[0-9a-f-]{8,}$/i.test(value);
}

async function main() {
  loadEnvLocal();
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const ref = projectRefFromUrl(url);
  if (!url || !service) throw new Error('Supabase env incompleto');
  if (ref === PRODUCTION_REF) {
    console.log(JSON.stringify({ ok: false, reason: 'PRODUCTION_SUPABASE_BLOCKED', ref }, null, 2));
    process.exit(2);
  }
  if (ref !== DEVELOP_REF) {
    console.log(JSON.stringify({ ok: false, reason: 'UNKNOWN_SUPABASE_REF', ref }, null, 2));
    process.exit(2);
  }

  const sandboxUrl = asaasCompanyBaseUrl('SANDBOX');
  const productionUrl = asaasCompanyBaseUrl('PRODUCTION');
  const cryptoDiag = getBankingEncryptionKeyDiagnostics();

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: accounts, error: accountsError } = await admin
    .from('company_financial_accounts')
    .select('id, name, environment, active, bank_integration_id, is_default')
    .eq('company_id', HOMOLOG_COMPANY)
    .eq('active', true);
  if (accountsError) throw new Error(accountsError.message);

  const integrationIds = [
    ...new Set((accounts || []).map((row) => String(row.bank_integration_id || '').trim()).filter(Boolean)),
  ];
  const { data: integrations } = integrationIds.length
    ? await admin
        .from('bank_integrations')
        .select('id, provider, environment, status')
        .in('id', integrationIds)
    : { data: [] as Array<{ id: string; provider: string; environment: string; status: string }> };

  const { data: creds } = integrationIds.length
    ? await admin
        .from('bank_credentials')
        .select('integration_id, credential_type')
        .in('integration_id', integrationIds)
    : { data: [] as Array<{ integration_id: string; credential_type: string }> };

  const { data: destinations } = await admin
    .from('financial_account_provider_destinations')
    .select('financial_account_id, destination_identifier, provider, status')
    .eq('company_id', HOMOLOG_COMPANY);

  const { data: splitConfig } = await admin
    .from('project_revenue_split_configs')
    .select('id, enabled, status')
    .eq('project_id', HOMOLOG_PROJECT)
    .maybeSingle();

  const { data: allSandboxAccounts } = await admin
    .from('company_financial_accounts')
    .select('id, company_id, environment, bank_integration_id, active')
    .eq('active', true)
    .eq('environment', 'SANDBOX');
  const allIntegrationIds = [
    ...new Set(
      (allSandboxAccounts || [])
        .map((row) => String(row.bank_integration_id || '').trim())
        .filter(Boolean),
    ),
  ];
  const { data: allIntegrations } = allIntegrationIds.length
    ? await admin
        .from('bank_integrations')
        .select('id, provider, environment')
        .in('id', allIntegrationIds)
    : { data: [] as Array<{ id: string; provider: string; environment: string }> };
  const { data: allCreds } = allIntegrationIds.length
    ? await admin
        .from('bank_credentials')
        .select('integration_id, credential_type')
        .in('integration_id', allIntegrationIds)
    : { data: [] as Array<{ integration_id: string; credential_type: string }> };
  const developSandboxAsaasWithOauth = (allSandboxAccounts || []).filter((account) => {
    const integration = (allIntegrations || []).find((row) => row.id === account.bank_integration_id);
    const types = (allCreds || [])
      .filter((row) => row.integration_id === account.bank_integration_id)
      .map((row) => row.credential_type);
    const provider = String(integration?.provider || '').toUpperCase();
    return (
      provider.includes('ASAAS') &&
      integration?.environment === 'SANDBOX' &&
      types.includes('oauth') &&
      !types.includes('api_key')
    );
  }).length;
  const developSandboxAsaasWithProductionKey = (allSandboxAccounts || []).filter((account) => {
    const integration = (allIntegrations || []).find((row) => row.id === account.bank_integration_id);
    const types = (allCreds || [])
      .filter((row) => row.integration_id === account.bank_integration_id)
      .map((row) => row.credential_type);
    const provider = String(integration?.provider || '').toUpperCase();
    return provider.includes('ASAAS') && types.includes('api_key');
  }).length;

  const accountReport = (accounts || []).map((account) => {
    const integration = (integrations || []).find((row) => row.id === account.bank_integration_id);
    const types = (creds || [])
      .filter((row) => row.integration_id === account.bank_integration_id)
      .map((row) => row.credential_type);
    return {
      accountId: account.id,
      name: account.name,
      accountEnvironment: account.environment,
      integrationProvider: integration?.provider || null,
      integrationEnvironment: integration?.environment || null,
      hasSandboxCredential: types.includes('oauth'),
      hasProductionCredential: types.includes('api_key'),
      isDefault: account.is_default,
    };
  });

  const walletReport = (destinations || []).map((row) => {
    const raw = String(row.destination_identifier || '');
    return {
      financialAccountId: row.financial_account_id,
      provider: row.provider,
      status: row.status,
      identifierLength: raw.length,
      synthetic: walletLooksSynthetic(raw),
      prefix: raw.slice(0, 12),
    };
  });

  const asaasSandboxAccounts = accountReport.filter(
    (row) =>
      row.accountEnvironment === 'SANDBOX' &&
      row.integrationEnvironment === 'SANDBOX' &&
      String(row.integrationProvider || '').toUpperCase().includes('ASAAS') &&
      row.hasSandboxCredential &&
      !row.hasProductionCredential,
  );

  const provenSandbox =
    sandboxUrl === 'https://api-sandbox.asaas.com/v3' &&
    productionUrl === 'https://api.asaas.com/v3' &&
    asaasSandboxAccounts.length > 0;

  let commercialInfoOk = false;
  let commercialName: string | null = null;
  let liveChargeSkipped = 'not_attempted';

  if (provenSandbox && cryptoDiag.encryptionKeyConfigured && asaasSandboxAccounts[0]) {
    try {
      const credsLoaded = await loadAsaasApiKeyForFinancialAccount(
        admin,
        asaasSandboxAccounts[0].accountId,
        HOMOLOG_COMPANY,
        'SANDBOX',
      );
      if (credsLoaded.environment !== 'SANDBOX') {
        liveChargeSkipped = 'credential_environment_not_sandbox';
      } else if (asaasCompanyBaseUrl(credsLoaded.environment) !== sandboxUrl) {
        liveChargeSkipped = 'base_url_not_sandbox';
      } else {
        const info = await asaasCompanyFetchCommercialInfo(
          credsLoaded.apiKey,
          credsLoaded.environment,
        );
        commercialInfoOk = Boolean(info);
        commercialName = String(info?.companyName || info?.name || '').slice(0, 80) || null;
        const realWallets = walletReport.filter((row) => !row.synthetic && row.identifierLength >= 8);
        if (realWallets.length < 1) {
          liveChargeSkipped = 'synthetic_wallets_only';
        } else {
          liveChargeSkipped = 'wallets_present_but_live_charge_not_created_in_probe';
        }
      }
    } catch (err) {
      liveChargeSkipped = err instanceof Error ? err.message.slice(0, 120) : 'commercial_info_failed';
    }
  } else if (!provenSandbox) {
    liveChargeSkipped = 'sandbox_not_proven';
  } else if (!cryptoDiag.encryptionKeyConfigured) {
    liveChargeSkipped = 'banking_encryption_key_missing_locally';
  }

  console.log(
    JSON.stringify(
      {
        ok: provenSandbox,
        supabase: 'develop',
        asaasBaseSandbox: sandboxUrl,
        splitConfig: splitConfig || null,
        accounts: accountReport,
        wallets: walletReport,
        provenSandbox,
        commercialInfoOk,
        commercialName,
        liveChargeSkipped,
        bankingKeyConfigured: cryptoDiag.encryptionKeyConfigured,
        bankingKeyLength: cryptoDiag.bankingEncryptionKeyLength,
        developSandboxAsaasWithOauthOnly: developSandboxAsaasWithOauth,
        developSandboxAsaasWithProductionKey: developSandboxAsaasWithProductionKey,
      },
      null,
      2,
    ),
  );
  if (!provenSandbox) process.exit(2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'probe_failed');
  process.exit(1);
});
