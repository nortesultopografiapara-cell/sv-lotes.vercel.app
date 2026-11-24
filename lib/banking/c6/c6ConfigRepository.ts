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
import { SAVE_COMPANY_C6_BANK_CONFIG_RPC } from '@/lib/banking/c6/c6ConfigAtomic';
import {
  isC6CompanyOperationEnabled,
  type C6CompanyOperation,
} from '@/lib/banking/c6/c6CompanyAccess';
import {
  isC6EmissionActivated,
  readC6BolepixActivationRequested,
  readC6EmissionEnabled,
} from '@/lib/banking/c6/c6EmissionAuthorization';
import { isC6ConfigPersistBlocked, isC6RemoteOperationBlocked } from '@/lib/banking/c6/c6EmitGuard';
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
  metadata: unknown;
};

type C6ConfigLookup = {
  integrationId?: string | null;
  financialAccountId?: string | null;
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function isMissingC6AtomicRpc(error: { code?: string; message?: string }): boolean {
  const code = String(error.code || '');
  const message = String(error.message || '');
  return code === 'PGRST202' || code === '42883' || /could not find the function/i.test(message) || /function .* does not exist/i.test(message);
}

function readIntent(metadata: unknown, key: 'boleto' | 'bolepix'): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const box = (metadata as { c6?: unknown }).c6;
  if (!box || typeof box !== 'object' || Array.isArray(box)) return false;
  return (box as Record<string, unknown>)[key] === true;
}

/** O atalho só vale quando a linha C6 já está inativa e sem operação bancária. */
export function isProvenSafeC6StoredState(row: {
  status?: unknown;
  active?: unknown;
  is_default?: unknown;
  metadata?: unknown;
}): boolean {
  if (row.status !== 'DRAFT' || row.active !== false || row.is_default !== false) return false;
  const metadata = row.metadata;
  if (metadata == null) return true;
  if (typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const box = (metadata as { c6?: unknown }).c6;
  if (box == null) return true;
  if (typeof box !== 'object' || Array.isArray(box)) return false;
  const flags = box as Record<string, unknown>;
  return ['emission_enabled', 'webhook_enabled', 'settlement_enabled'].every(
    (key) => flags[key] == null || flags[key] === false,
  );
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

async function loadCredentialTypes(
  admin: SupabaseClient,
  integrationId: string,
): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from('bank_credentials')
    .select('credential_type')
    .eq('integration_id', integrationId);
  if (error) throw new Error(error.message);
  const map = new Map<string, string>();
  for (const row of data || []) map.set(String(row.credential_type), 'present');
  return map;
}

async function readCredentialPayload(
  admin: SupabaseClient,
  integrationId: string,
  credentialType: 'oauth' | 'certificate',
): Promise<string | null> {
  const { data, error } = await admin
    .from('bank_credentials')
    .select('encrypted_payload')
    .eq('integration_id', integrationId)
    .eq('credential_type', credentialType)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const payload = data?.encrypted_payload ? String(data.encrypted_payload) : '';
  return payload || null;
}

async function assertNoDuplicateC6Credentials(
  admin: SupabaseClient,
  companyId: string,
  integrationId: string,
): Promise<void> {
  const { data, error } = await admin
    .from('bank_credentials')
    .select('credential_type')
    .eq('integration_id', integrationId)
    .eq('company_id', companyId);
  if (error || !Array.isArray(data)) {
    throw new Error(error?.message || 'Não foi possível verificar a integridade das credenciais C6.');
  }
  let oauth = 0;
  let certificate = 0;
  for (const row of data) {
    const type = String((row as { credential_type?: unknown }).credential_type || '');
    if (type === 'oauth') oauth += 1;
    else if (type === 'certificate') certificate += 1;
  }
  if (oauth > 1) throw new Error('Credencial OAuth duplicada nesta integração C6.');
  if (certificate > 1) throw new Error('Credencial de certificado duplicada nesta integração C6.');
}

async function inspectC6FinancialAccountLink(
  admin: SupabaseClient,
  companyId: string,
  financialAccountId: string,
  integrationId: string | null,
): Promise<'link' | 'keep'> {
  const { data: fa, error: faErr } = await admin
    .from('company_financial_accounts')
    .select('id, bank_integration_id')
    .eq('id', financialAccountId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (faErr) throw new Error(faErr.message);
  if (!fa?.id) throw new Error('Conta financeira não encontrada.');

  const currentIntegrationId = fa.bank_integration_id ? String(fa.bank_integration_id) : '';
  if (!currentIntegrationId) return 'link';
  if (integrationId && currentIntegrationId === integrationId) return 'keep';

  const { data: currentInt, error: integrationError } = await admin
    .from('bank_integrations')
    .select('provider')
    .eq('id', currentIntegrationId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (integrationError) throw new Error(integrationError.message);
  const currentProvider = String(currentInt?.provider || '').toUpperCase();
  if (currentProvider === 'ASAAS_COMPANY' || currentProvider === 'ASAAS') {
    throw new Error('Esta conta já está vinculada ao Asaas. Crie uma nova conta financeira C6 Bank.');
  }
  if (currentProvider === 'INTER') {
    throw new Error('Esta conta já está vinculada ao Banco Inter. Crie uma nova conta financeira C6 Bank.');
  }
  if (currentProvider && currentProvider !== 'C6') {
    throw new Error(
      `Esta conta já está vinculada ao provider ${currentProvider}. Crie uma nova conta financeira C6 Bank.`,
    );
  }
  if (currentProvider === 'C6') {
    throw new Error('Esta conta já está vinculada a outra integração C6. Use uma conta financeira própria.');
  }
  throw new Error('Conta financeira não encontrada.');
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
      ? 'Configuração salva. Emissão, webhook e liquidação permanecem desativados.'
      : 'Configuração incompleta. Preencha Client ID, Secret, certificado e chave.',
    financialAccountId,
    active: false,
    emissionEnabled: readC6EmissionEnabled(row.metadata),
    bolepixActivationRequested: readC6BolepixActivationRequested(row.metadata),
    boletoIntent: readIntent(row.metadata, 'boleto'),
    bolepixIntent: readIntent(row.metadata, 'bolepix'),
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
    if (fa?.bank_integration_id) {
      return {
        integrationId: String(fa.bank_integration_id),
        financialAccountId: String(fa.id),
      };
    }
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
  const integrationId = data?.id ? String(data.id) : null;
  if (!integrationId) return { integrationId: null, financialAccountId: null };

  const { data: linked, error: linkedError } = await admin
    .from('company_financial_accounts')
    .select('id, company_id, bank_integration_id')
    .eq('company_id', companyId)
    .eq('bank_integration_id', integrationId)
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if (linkedError) throw new Error(linkedError.message);
  const financialAccountId =
    linked?.id &&
    String(linked.company_id) === companyId &&
    String(linked.bank_integration_id) === integrationId
      ? String(linked.id)
      : null;
  return { integrationId, financialAccountId };
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
      'id, company_id, environment, status, client_id, certificate_name, configured_at, updated_at, active, metadata',
    )
    .eq('id', resolved.integrationId)
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return EMPTY_C6_BANK_CONFIG(companyId);

  const map = await loadCredentialTypes(admin, String(data.id));
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
  options?: { supabaseUrl?: string },
): Promise<C6BankConfigPublic> {
  if (isC6ConfigPersistBlocked(options?.supabaseUrl, companyId)) {
    throw new Error('Cadastro C6 permanece bloqueado em Production.');
  }
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
  if (clean(lookup?.integrationId) && !existing.id) {
    throw new Error('Integração C6 não encontrada nesta empresa.');
  }
  if (!existing.id && !clientId) {
    throw new Error('Client ID obrigatório na primeira configuração C6.');
  }
  if (!existing.id && !clientSecret) {
    throw new Error('Client Secret obrigatório na primeira configuração C6.');
  }
  if (!existing.id && !replacingCert) {
    throw new Error('Certificado e chave privada obrigatórios na primeira configuração C6.');
  }

  const faId = clean(input.financialAccountId) || clean(lookup?.financialAccountId);
  const linkMode = faId
    ? await inspectC6FinancialAccountLink(admin, companyId, faId, existing.id)
    : 'omit';

  const certName = replacingCert
    ? `${certificateFileName || 'certificado'}||${privateKeyFileName || 'chave'}`
    : existing.certificateFileName && existing.privateKeyFileName
      ? `${existing.certificateFileName}||${existing.privateKeyFileName}`
      : existing.certificateFileName || null;
  const intents = {
    boleto: input.boletoIntent === true,
    bolepix: input.bolepixIntent === true,
  };

  if (existing.id) {
    const { data: stored, error: storedError } = await admin
      .from('bank_integrations')
      .select('environment, client_id, certificate_name, metadata, status, active, is_default')
      .eq('id', existing.id)
      .eq('company_id', companyId)
      .eq('provider', 'C6')
      .maybeSingle();
    if (storedError) throw new Error(storedError.message);
    if (!stored) throw new Error('Integração C6 não encontrada nesta empresa.');
    const fieldsMatch =
      !clientSecret &&
      !replacingCert &&
      linkMode !== 'link' &&
      String(environment) === String(stored.environment || '') &&
      (clientId || String(stored.client_id || '')) === String(stored.client_id || '') &&
      String(certName ?? '') === String(stored.certificate_name ?? '') &&
      readIntent(stored.metadata, 'boleto') === intents.boleto &&
      readIntent(stored.metadata, 'bolepix') === intents.bolepix;
    if (fieldsMatch && isProvenSafeC6StoredState(stored)) {
      await assertNoDuplicateC6Credentials(admin, companyId, existing.id);
      return getCompanyC6BankConfig(admin, companyId, {
        integrationId: existing.id,
        financialAccountId: linkMode === 'omit' ? null : faId,
      });
    }
    if (fieldsMatch && isC6ConfigPersistBlocked(options?.supabaseUrl, companyId)) {
      throw new Error('Cadastro C6 permanece bloqueado em Production.');
    }
  }

  const oauthPayload = clientSecret ? encryptBankingSecret(clientSecret) : null;
  const certificatePayload = replacingCert
    ? encryptBankingSecret(
        serializeC6CertificateCredential({
          certificatePem,
          privateKeyPem,
          certificateFileName: certificateFileName || 'certificado',
          privateKeyFileName: privateKeyFileName || 'chave',
        }),
      )
    : null;
  const { error } = await admin.rpc(SAVE_COMPANY_C6_BANK_CONFIG_RPC, {
    p_company_id: companyId,
    p_environment: environment,
    p_client_id: clientId || existing.clientId || null,
    p_certificate_name: certName,
    p_boleto: intents.boleto,
    p_bolepix: intents.bolepix,
    p_oauth_payload: oauthPayload,
    p_certificate_payload: certificatePayload,
    p_financial_account_id: faId || null,
  });
  if (error) {
    if (isMissingC6AtomicRpc(error)) {
      throw new Error('Persistência atômica C6 ainda não está instalada neste ambiente.');
    }
    throw new Error(redactC6ErrorMessage(error, 'Erro ao salvar configuração C6.'));
  }

  return getCompanyC6BankConfig(admin, companyId, {
    integrationId: existing.id,
    financialAccountId: faId || null,
  });
}

/** Remove material sensível de mensagens que podem ir para log ou resposta HTTP. */
export function redactC6ErrorMessage(error: unknown, fallback: string): string {
  const raw =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : '';
  const message = raw || fallback;
  if (
    /BEGIN |PRIVATE KEY|clientSecret|certificatePem|privateKeyPem|encrypted_payload|access_token|webhook_receipt_token|\/api\/banking\/c6\/webhook\/[A-Za-z0-9_-]{43}|\bv1:/i.test(
      message,
    )
  ) {
    return fallback;
  }
  return message;
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
  if (isC6RemoteOperationBlocked('SANDBOX')) {
    throw new Error('Leitura de segredo C6 permanece bloqueada em Production.');
  }
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
  if (String(data.environment || '').toUpperCase() === 'PRODUCTION') return null;

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

/**
 * Leitura de segredo para o teste de conexão autorizado da própria empresa.
 * Sem a concessão, não consulta credencial. O retorno não sai em rota pública.
 */
export async function loadC6SecretsForGrantedOperation(
  admin: SupabaseClient,
  companyId: string,
  operation: Extract<C6CompanyOperation, 'connection' | 'emission'>,
): Promise<{
  clientId: string;
  clientSecret: string;
  certificatePem: string;
  privateKeyPem: string;
  environment: BankEnvironment;
  integrationId: string;
  financialAccountId: string | null;
} | null> {
  if (operation === 'connection') {
    if (!isC6CompanyOperationEnabled(companyId, 'connection')) {
      throw new Error('Teste de conexão C6 ainda não autorizado para esta empresa.');
    }
  } else if (!(await isC6EmissionActivated(admin, companyId))) {
    throw new Error('Emissão C6 ainda não autorizada para esta empresa.');
  }
  const resolved = await resolveC6IntegrationId(admin, companyId);
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
  const environment = String(data.environment || '').toUpperCase();
  if (environment !== 'SANDBOX' && environment !== 'PRODUCTION') return null;
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
    environment,
    integrationId: String(data.id),
    financialAccountId: resolved.financialAccountId,
  };
}
