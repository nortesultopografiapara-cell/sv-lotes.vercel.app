/**
 * Persistência isolada da integração INTER (Fase A).
 * NÃO usa get/saveCompanyBankIntegrationConfig (is_default / Asaas).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { clearCachedInterToken } from '@/lib/banking/inter/interTokenCache';
import {
  encryptBankingSecret,
  formatBankingEncryptionKeyError,
  getBankingEncryptionKeyDiagnostics,
  isBankingCredentialsEncryptionConfigured,
} from '@/lib/banking/credentialsCrypto';
import { normalizeBankEnvironmentInput } from '@/lib/banking/integrationConfig';
import type { BankEnvironment, BankIntegrationStatus } from '@/lib/banking/types';
import {
  EMPTY_INTER_BANK_CONFIG,
  type InterBankConfigPublic,
  type InterBankConfigSaveInput,
} from '@/lib/banking/inter/interConfigTypes';
import {
  parseInterCertificateCredential,
  serializeInterCertificateCredential,
  validateInterCertificateKeyPair,
  validateInterCertificatePem,
  validateInterPrivateKeyPem,
} from '@/lib/banking/inter/interPemValidation';

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
  metadata?: Record<string, unknown> | null;
  last_error?: string | null;
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function readConnectionMeta(row: IntegrationRow): {
  connectionVerified: boolean;
  lastConnectionTestAt: string | null;
  authStatus: InterBankConfigPublic['authStatus'];
} {
  const meta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata
      : {};
  const connectionVerified = Boolean(meta.connectionVerified);
  const lastConnectionTestAt =
    typeof meta.lastConnectionTestAt === 'string' ? meta.lastConnectionTestAt : null;
  const authRaw = meta.authStatus;
  const authStatus =
    authRaw === 'VERIFIED' || authRaw === 'FAILED' || authRaw === 'DRAFT' ? authRaw : null;
  return { connectionVerified, lastConnectionTestAt, authStatus };
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
): InterBankConfigPublic {
  if (!row) return EMPTY_INTER_BANK_CONFIG(companyId);

  const clientId = row.client_id || '';
  const hasSecret = credTypes.has('oauth');
  const hasCertBundle = credTypes.has('certificate');
  const configured = Boolean(clientId) && hasSecret && hasCertBundle;
  const { connectionVerified, lastConnectionTestAt, authStatus } = readConnectionMeta(row);

  let message: string;
  if (!configured) {
    message = 'Configuração incompleta. Preencha Client ID, Secret, certificado e chave.';
  } else if (connectionVerified) {
    message = 'Configuração salva. Integração verificada (OAuth+mTLS).';
  } else if (authStatus === 'FAILED' && row.last_error) {
    message = `Configuração salva. Último teste falhou: ${String(row.last_error).slice(0, 180)}`;
  } else {
    message = 'Configuração salva. Conexão OAuth+mTLS ainda não verificada.';
  }

  return {
    id: row.id,
    companyId,
    provider: 'INTER',
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
    connectionVerified,
    lastConnectionTestAt,
    authStatus,
    message,
  };
}

/**
 * Carrega integração INTER da empresa (não usa is_default).
 */
export async function getCompanyInterBankConfig(
  admin: SupabaseClient,
  companyId: string,
): Promise<InterBankConfigPublic> {
  const { data, error } = await admin
    .from('bank_integrations')
    .select(
      'id, company_id, environment, status, client_id, certificate_name, configured_at, updated_at, active, metadata, last_error',
    )
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const row = (data as IntegrationRow | null) ?? null;
  if (!row) return EMPTY_INTER_BANK_CONFIG(companyId);

  const credMap = await loadCredentialMap(admin, row.id);
  const credTypes = new Set(credMap.keys());

  let certificateFileName: string | null = null;
  let privateKeyFileName: string | null = null;

  // Metadados de nome: preferir certificate_name "cert||key"; fallback parse só se decrypt disponível
  const nameParts = String(row.certificate_name || '').split('||');
  if (nameParts[0]) certificateFileName = nameParts[0].trim() || null;
  if (nameParts[1]) privateKeyFileName = nameParts[1].trim() || null;

  return buildPublicResponse(companyId, row, credTypes, {
    certificateFileName,
    privateKeyFileName,
  });
}

export async function saveCompanyInterBankConfig(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  input: InterBankConfigSaveInput,
): Promise<InterBankConfigPublic> {
  const environment = normalizeBankEnvironmentInput(input.environment);
  const clientId = clean(input.clientId);
  const clientSecret = clean(input.clientSecret);
  const certificatePem = clean(input.certificatePem);
  const privateKeyPem = clean(input.privateKeyPem);
  const certificateFileName = clean(input.certificateFileName).slice(0, 180);
  const privateKeyFileName = clean(input.privateKeyFileName).slice(0, 180);

  const existing = await getCompanyInterBankConfig(admin, companyId);

  const replacingCert = Boolean(certificatePem || privateKeyPem);
  if (replacingCert) {
    if (!certificatePem || !privateKeyPem) {
      throw new Error(
        'Para atualizar o certificado, envie certificado e chave privada juntos.',
      );
    }
    const pair = validateInterCertificateKeyPair(certificatePem, privateKeyPem);
    if (!pair.ok) throw new Error(pair.message);
  } else if (certificatePem) {
    const c = validateInterCertificatePem(certificatePem);
    if (!c.ok) throw new Error(c.message);
  } else if (privateKeyPem) {
    const k = validateInterPrivateKeyPem(privateKeyPem);
    if (!k.ok) throw new Error(k.message);
  }

  const needsEncrypt = Boolean(clientSecret || replacingCert);
  if (needsEncrypt && !isBankingCredentialsEncryptionConfigured()) {
    console.warn('[banking/inter] encryption diagnostics', getBankingEncryptionKeyDiagnostics());
    throw new Error(formatBankingEncryptionKeyError());
  }

  if (!existing.id && !clientId) {
    throw new Error('Client ID é obrigatório na primeira configuração.');
  }
  if (!existing.id && !clientSecret) {
    throw new Error('Client Secret é obrigatório na primeira configuração.');
  }
  if (!existing.id && !replacingCert) {
    throw new Error('Certificado e chave privada são obrigatórios na primeira configuração.');
  }

  const now = new Date().toISOString();
  const nextClientId = clientId || existing.clientId || null;
  const nextCertName = replacingCert
    ? `${certificateFileName || 'certificado'}||${privateKeyFileName || 'chave'}`
    : existing.certificateFileName && existing.privateKeyFileName
      ? `${existing.certificateFileName}||${existing.privateKeyFileName}`
      : existing.certificateFileName || null;

  // is_default=false → não rouba a integração padrão (Asaas).
  // Ao salvar credenciais, invalida verificação OAuth anterior.
  const payload = {
    company_id: companyId,
    provider: 'INTER',
    bank_provider: 'INTER',
    environment,
    status: 'DRAFT' as BankIntegrationStatus,
    client_id: nextClientId,
    certificate_name: nextCertName,
    active: false,
    is_default: false,
    configured_at: now,
    updated_at: now,
    created_by: userId,
    last_error: null as string | null,
    metadata: {
      connectionVerified: false,
      authStatus: 'DRAFT',
      lastConnectionTestAt: null,
      lastConnectionTestOk: null,
      verifiedAt: null,
      credentialsUpdatedAt: now,
    },
  };

  let integrationId = existing.id;

  if (integrationId) {
    const { error } = await admin
      .from('bank_integrations')
      .update(payload)
      .eq('id', integrationId)
      .eq('company_id', companyId)
      .eq('provider', 'INTER');
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await admin
      .from('bank_integrations')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    integrationId = String(data.id);
  }

  if (clientSecret) {
    await upsertCredential(admin, integrationId!, companyId, 'oauth', clientSecret);
  }

  if (replacingCert) {
    const serialized = serializeInterCertificateCredential({
      certificatePem,
      privateKeyPem,
      certificateFileName: certificateFileName || 'certificado',
      privateKeyFileName: privateKeyFileName || 'chave',
    });
    await upsertCredential(admin, integrationId!, companyId, 'certificate', serialized);
  }

  clearCachedInterToken(companyId);

  return getCompanyInterBankConfig(admin, companyId);
}

/** Garante que a resposta pública não contenha PEMs/secrets. */
export function assertInterConfigResponseSafe(response: InterBankConfigPublic): void {
  const asRecord = response as unknown as Record<string, unknown>;
  for (const key of ['clientSecret', 'certificatePem', 'privateKeyPem', 'encrypted_payload', 'access_token', 'accessToken']) {
    if (Object.prototype.hasOwnProperty.call(asRecord, key)) {
      throw new Error(`Resposta Inter expõe material sensível (${key}).`);
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
      throw new Error(`Resposta Inter expõe material sensível (${token}).`);
    }
  }
}

/** Uso interno Fase B+: decrypt (não exportar para routes públicas). */
export async function loadInterSecretsForServer(
  admin: SupabaseClient,
  companyId: string,
): Promise<{
  clientId: string;
  clientSecret: string;
  certificatePem: string;
  privateKeyPem: string;
  environment: BankEnvironment;
} | null> {
  const { decryptBankingSecret } = await import('@/lib/banking/credentialsCrypto');
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, client_id, environment')
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return null;

  const map = await loadCredentialMap(admin, String(data.id));
  const oauth = map.get('oauth');
  const cert = map.get('certificate');
  if (!oauth || !cert) return null;

  const parsed = parseInterCertificateCredential(decryptBankingSecret(cert));
  if (!parsed) return null;

  return {
    clientId: String(data.client_id || ''),
    clientSecret: decryptBankingSecret(oauth),
    certificatePem: parsed.certificatePem,
    privateKeyPem: parsed.privateKeyPem,
    environment: (data.environment as BankEnvironment) || 'SANDBOX',
  };
}
