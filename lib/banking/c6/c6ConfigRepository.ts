/**
 * Persistência isolada da integração C6 Bank (Fase 2 — config local).
 * Reutiliza bank_integrations + bank_credentials + AES existente.
 * Sem client HTTP C6. Sem OAuth/webhook/emissão.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  encryptBankingSecret,
  decryptBankingSecret,
  isBankingCredentialsEncryptionConfigured,
  formatBankingEncryptionKeyError,
} from '@/lib/banking/credentialsCrypto';
import { normalizeBankEnvironmentInput } from '@/lib/banking/integrationConfig';
import type { BankEnvironment, BankIntegrationStatus } from '@/lib/banking/types';
import {
  EMPTY_C6_BANK_CONFIG,
  type C6BankConfigPublic,
  type C6BankConfigSaveInput,
} from '@/lib/banking/c6/c6ConfigTypes';
import {
  parseC6CertificateCredential,
  serializeC6CertificateCredential,
  validateC6CertificateKeyPair,
  validateC6ClientId,
  validateC6ClientSecret,
} from '@/lib/banking/c6/c6LocalValidation';

type IntegrationRow = {
  id: string;
  company_id: string;
  environment: BankEnvironment;
  status: BankIntegrationStatus;
  client_id: string | null;
  certificate_name: string | null;
  configured_at: string | null;
  updated_at: string | null;
  active: boolean;
};

type C6ConfigLookup = {
  integrationId?: string | null;
  financialAccountId?: string | null;
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

async function loadCredentialMap(
  admin: SupabaseClient,
  integrationId: string,
): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from('bank_credentials')
    .select('credential_type, encrypted_payload')
    .eq('integration_id', integrationId);
  if (error) throw new Error(error.message);
  const map = new Map<string, string>();
  for (const row of data || []) {
    map.set(String(row.credential_type), String(row.encrypted_payload || ''));
  }
  return map;
}

async function upsertCredential(
  admin: SupabaseClient,
  integrationId: string,
  companyId: string,
  credentialType: 'oauth' | 'certificate',
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

function buildPublicResponse(
  companyId: string,
  row: IntegrationRow | null,
  credTypes: Set<string>,
  certMeta: { certificateFileName: string | null; privateKeyFileName: string | null },
  financialAccountId: string | null = null,
): C6BankConfigPublic {
  if (!row) return EMPTY_C6_BANK_CONFIG(companyId);

  const clientId = row.client_id || '';
  const hasSecret = credTypes.has('oauth');
  const hasCertBundle = credTypes.has('certificate');
  const configured = Boolean(clientId) && hasSecret && hasCertBundle;

  return {
    id: row.id,
    companyId,
    provider: 'C6',
    environment: row.environment,
    status: row.status,
    clientId,
    clientIdConfigured: Boolean(clientId),
    hasClientSecret: hasSecret,
    hasCertificate: hasCertBundle,
    hasPrivateKey: hasCertBundle,
    certificateFileName: certMeta.certificateFileName,
    privateKeyFileName: certMeta.privateKeyFileName,
    configuredAt: row.configured_at,
    updatedAt: row.updated_at,
    message: configured
      ? 'Configuração salva. Emissão C6 ainda não homologada.'
      : 'Configuração incompleta. Preencha Client ID, Secret, certificado e chave.',
    financialAccountId,
  };
}

async function resolveC6IntegrationId(
  admin: SupabaseClient,
  companyId: string,
  lookup?: C6ConfigLookup,
): Promise<{ integrationId: string | null; financialAccountId: string | null }> {
  const requestedId = clean(lookup?.integrationId);
  if (requestedId) {
    return {
      integrationId: requestedId,
      financialAccountId: clean(lookup?.financialAccountId) || null,
    };
  }
  const faId = clean(lookup?.financialAccountId);
  if (faId) {
    const { data: fa, error: faErr } = await admin
      .from('company_financial_accounts')
      .select('id, bank_integration_id')
      .eq('id', faId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (faErr) throw new Error(faErr.message);
    return {
      integrationId: fa?.bank_integration_id ? String(fa.bank_integration_id) : null,
      financialAccountId: fa?.id ? String(fa.id) : faId,
    };
  }

  const { data, error } = await admin
    .from('bank_integrations')
    .select('id')
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    integrationId: data?.id ? String(data.id) : null,
    financialAccountId: null,
  };
}

export async function getCompanyC6BankConfig(
  admin: SupabaseClient,
  companyId: string,
  lookup?: C6ConfigLookup,
): Promise<C6BankConfigPublic> {
  const resolved = await resolveC6IntegrationId(admin, companyId, lookup);
  if (!resolved.integrationId) return EMPTY_C6_BANK_CONFIG(companyId);

  const { data, error } = await admin
    .from('bank_integrations')
    .select(
      'id, company_id, environment, status, client_id, certificate_name, configured_at, updated_at, active',
    )
    .eq('id', resolved.integrationId)
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return EMPTY_C6_BANK_CONFIG(companyId);

  const map = await loadCredentialMap(admin, String(data.id));
  const nameParts = String(data.certificate_name || '').split('||');
  const certMeta = {
    certificateFileName: nameParts[0]?.trim() || null,
    privateKeyFileName: nameParts[1]?.trim() || null,
  };
  const response = buildPublicResponse(
    companyId,
    data as IntegrationRow,
    new Set(map.keys()),
    certMeta,
    resolved.financialAccountId,
  );
  assertC6ConfigResponseSafe(response);
  return response;
}

export async function saveCompanyC6BankConfig(
  admin: SupabaseClient,
  companyId: string,
  input: C6BankConfigSaveInput,
  lookup?: C6ConfigLookup,
): Promise<C6BankConfigPublic> {
  if (!isBankingCredentialsEncryptionConfigured()) {
    throw new Error(formatBankingEncryptionKeyError());
  }

  const environment = normalizeBankEnvironmentInput(input.environment);
  const clientId = clean(input.clientId);
  const clientSecret = clean(input.clientSecret);
  const certificatePem = clean(input.certificatePem);
  const privateKeyPem = clean(input.privateKeyPem);
  const certificateFileName = clean(input.certificateFileName).slice(0, 180);
  const privateKeyFileName = clean(input.privateKeyFileName).slice(0, 180);

  if (clientId) {
    const idCheck = validateC6ClientId(clientId);
    if (!idCheck.ok) throw new Error(idCheck.message);
  }
  if (clientSecret) {
    const secretCheck = validateC6ClientSecret(clientSecret);
    if (!secretCheck.ok) throw new Error(secretCheck.message);
  }

  const replacingCert = Boolean(certificatePem || privateKeyPem);
  if (replacingCert) {
    if (!certificatePem || !privateKeyPem) {
      throw new Error('Envie certificado e chave privada juntos.');
    }
    const pair = validateC6CertificateKeyPair(certificatePem, privateKeyPem);
    if (!pair.ok) throw new Error(pair.message);
  }

  const needsEncrypt = Boolean(clientSecret || replacingCert);
  if (needsEncrypt && !isBankingCredentialsEncryptionConfigured()) {
    throw new Error(formatBankingEncryptionKeyError());
  }

  const existing = await getCompanyC6BankConfig(admin, companyId, lookup);
  if (!existing.id && !clientId) {
    throw new Error('Client ID obrigatório na primeira configuração C6.');
  }
  if (!existing.id && !clientSecret) {
    throw new Error('Client Secret obrigatório na primeira configuração C6.');
  }
  if (!existing.id && !replacingCert) {
    throw new Error('Certificado e chave privada obrigatórios na primeira configuração C6.');
  }

  const now = new Date().toISOString();
  const certName = replacingCert
    ? `${certificateFileName || 'certificado'}||${privateKeyFileName || 'chave'}`
    : existing.certificateFileName && existing.privateKeyFileName
      ? `${existing.certificateFileName}||${existing.privateKeyFileName}`
      : existing.certificateFileName || null;

  let integrationId = existing.id;
  if (!integrationId) {
    const { data, error } = await admin
      .from('bank_integrations')
      .insert({
        company_id: companyId,
        provider: 'C6',
        bank_provider: 'C6',
        environment,
        status: 'DRAFT',
        client_id: clientId,
        certificate_name: certName,
        is_default: false,
        active: true,
        configured_at: now,
        updated_at: now,
      })
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    integrationId = data?.id ? String(data.id) : null;
    if (!integrationId) throw new Error('Falha ao criar integração C6.');
  } else {
    const { error } = await admin
      .from('bank_integrations')
      .update({
        environment,
        client_id: clientId || existing.clientId,
        certificate_name: certName,
        updated_at: now,
        configured_at: existing.configuredAt || now,
      })
      .eq('id', integrationId)
      .eq('company_id', companyId)
      .eq('provider', 'C6');
    if (error) throw new Error(error.message);
  }

  if (clientSecret) {
    await upsertCredential(admin, integrationId, companyId, 'oauth', clientSecret);
  }
  if (replacingCert) {
    await upsertCredential(
      admin,
      integrationId,
      companyId,
      'certificate',
      serializeC6CertificateCredential({
        certificatePem,
        privateKeyPem,
        certificateFileName: certificateFileName || 'certificado',
        privateKeyFileName: privateKeyFileName || 'chave',
      }),
    );
  }

  const faId = clean(input.financialAccountId) || clean(lookup?.financialAccountId);
  if (faId && integrationId) {
    const { data: fa, error: faErr } = await admin
      .from('company_financial_accounts')
      .select('id, bank_integration_id')
      .eq('id', faId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (faErr) throw new Error(faErr.message);
    if (!fa?.id) throw new Error('Conta financeira não encontrada.');

    const currentIntegrationId = fa.bank_integration_id
      ? String(fa.bank_integration_id)
      : '';
    if (currentIntegrationId && currentIntegrationId !== integrationId) {
      const { data: currentInt } = await admin
        .from('bank_integrations')
        .select('provider')
        .eq('id', currentIntegrationId)
        .eq('company_id', companyId)
        .maybeSingle();
      const currentProvider = String(currentInt?.provider || '').toUpperCase();
      if (currentProvider === 'ASAAS_COMPANY' || currentProvider === 'ASAAS') {
        throw new Error(
          'Esta conta já está vinculada ao Asaas. Crie uma nova conta financeira C6 Bank.',
        );
      }
      if (currentProvider === 'INTER') {
        throw new Error(
          'Esta conta já está vinculada ao Banco Inter. Crie uma nova conta financeira C6 Bank.',
        );
      }
      if (currentProvider && currentProvider !== 'C6') {
        throw new Error(
          `Esta conta já está vinculada ao provider ${currentProvider}. Crie uma nova conta financeira C6 Bank.`,
        );
      }
      if (currentProvider === 'C6') {
        throw new Error(
          'Esta conta já está vinculada a outra integração C6. Use uma conta financeira própria.',
        );
      }
    }

    if (!currentIntegrationId) {
      const { error: linkErr } = await admin
        .from('company_financial_accounts')
        .update({
          bank_integration_id: integrationId,
          updated_at: now,
        })
        .eq('id', faId)
        .eq('company_id', companyId);
      if (linkErr) throw new Error(linkErr.message);
    }
  }

  return getCompanyC6BankConfig(admin, companyId, {
    integrationId,
    financialAccountId: faId || null,
  });
}

/** Garante que a resposta pública não contenha PEMs/secrets. */
export function assertC6ConfigResponseSafe(response: C6BankConfigPublic): void {
  const asRecord = response as unknown as Record<string, unknown>;
  for (const key of [
    'clientSecret',
    'certificatePem',
    'privateKeyPem',
    'encrypted_payload',
    'access_token',
    'accessToken',
  ]) {
    if (Object.prototype.hasOwnProperty.call(asRecord, key)) {
      throw new Error(`Resposta C6 expõe material sensível (${key}).`);
    }
  }
  const json = JSON.stringify(response);
  const forbidden = [
    'BEGIN CERTIFICATE',
    'BEGIN PRIVATE KEY',
    'BEGIN RSA PRIVATE KEY',
    'BEGIN EC PRIVATE KEY',
    '"clientSecret"',
    '"certificatePem"',
    '"privateKeyPem"',
    '"access_token"',
    '"accessToken"',
    'encrypted_payload',
  ];
  for (const token of forbidden) {
    if (json.includes(token)) {
      throw new Error(`Resposta C6 expõe material sensível (${token}).`);
    }
  }
}

/** Uso interno futuro — não exportar para rotas públicas nesta fase. */
export async function loadC6SecretsForServer(
  admin: SupabaseClient,
  companyId: string,
  lookup?: C6ConfigLookup,
): Promise<{
  clientId: string;
  clientSecret: string;
  certificatePem: string;
  privateKeyPem: string;
  environment: BankEnvironment;
  integrationId: string;
  financialAccountId: string | null;
} | null> {
  const resolved = await resolveC6IntegrationId(admin, companyId, lookup);
  if (!resolved.integrationId) return null;

  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, client_id, environment')
    .eq('id', resolved.integrationId)
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return null;

  const map = await loadCredentialMap(admin, String(data.id));
  const oauth = map.get('oauth');
  const cert = map.get('certificate');
  if (!oauth || !cert) return null;

  const parsed = parseC6CertificateCredential(decryptBankingSecret(cert));
  if (!parsed) return null;

  return {
    clientId: String(data.client_id || ''),
    clientSecret: decryptBankingSecret(oauth),
    certificatePem: parsed.certificatePem,
    privateKeyPem: parsed.privateKeyPem,
    environment: (data.environment as BankEnvironment) || 'SANDBOX',
    integrationId: String(data.id),
    financialAccountId: resolved.financialAccountId,
  };
}
