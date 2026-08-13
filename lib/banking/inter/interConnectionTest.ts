/**
 * Orquestra teste real OAuth+mTLS Inter e atualiza metadata local (isolado do Asaas).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadInterSecretsForServer,
  getCompanyInterBankConfig,
} from '@/lib/banking/inter/interConfigRepository';
import {
  requestInterAccessToken,
  toPublicInterConnectionTest,
  type InterConnectionTestPublic,
  type InterOAuthFetchFn,
} from '@/lib/banking/inter/interOAuthClient';
import { clearCachedInterToken } from '@/lib/banking/inter/interTokenCache';
import type { InterBankConfigPublic } from '@/lib/banking/inter/interConfigTypes';

export type InterConnectionTestBundle = {
  test: InterConnectionTestPublic;
  config: InterBankConfigPublic;
};

export async function runCompanyInterConnectionTest(
  admin: SupabaseClient,
  companyId: string,
  options?: {
    bypassCache?: boolean;
    fetchFn?: InterOAuthFetchFn;
    financialAccountId?: string | null;
    integrationId?: string | null;
  },
): Promise<InterConnectionTestBundle> {
  const lookup = {
    financialAccountId: options?.financialAccountId || null,
    integrationId: options?.integrationId || null,
  };
  const existing = await getCompanyInterBankConfig(admin, companyId, lookup);
  if (!existing.id) {
    const test = toPublicInterConnectionTest({
      ok: false,
      code: 'MISSING_CLIENT_ID',
      message: 'Configuração Inter ausente. Salve Client ID, Secret, certificado e chave antes de testar.',
      environment: existing.environment,
    });
    return { test, config: existing };
  }

  const secrets = await loadInterSecretsForServer(admin, companyId, lookup);
  if (!secrets) {
    const missingCode =
      !existing.clientIdConfigured
        ? 'MISSING_CLIENT_ID'
        : !existing.hasClientSecret
          ? 'MISSING_CLIENT_SECRET'
          : !existing.hasCertificate
            ? 'MISSING_CERTIFICATE'
            : 'MISSING_PRIVATE_KEY';
    const test = toPublicInterConnectionTest({
      ok: false,
      code: missingCode,
      message:
        missingCode === 'MISSING_CLIENT_ID'
          ? 'Client ID ausente. Salve a configuração antes de testar.'
          : missingCode === 'MISSING_CLIENT_SECRET'
            ? 'Client Secret ausente. Salve o Client Secret antes de testar.'
            : missingCode === 'MISSING_CERTIFICATE'
              ? 'Certificado ausente. Envie o certificado do Inter antes de testar.'
              : 'Chave privada ausente. Envie a chave privada do Inter antes de testar.',
      environment: existing.environment,
    });
    await persistInterConnectionTestResult(admin, companyId, existing.id, test);
    return { test, config: await getCompanyInterBankConfig(admin, companyId, lookup) };
  }

  clearCachedInterToken(companyId, secrets.environment, secrets.integrationId);

  const oauth = await requestInterAccessToken(
    {
      companyId,
      integrationId: secrets.integrationId,
      environment: secrets.environment,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      certificatePem: secrets.certificatePem,
      privateKeyPem: secrets.privateKeyPem,
    },
    {
      bypassCache: options?.bypassCache !== false,
      fetchFn: options?.fetchFn,
    },
  );

  const test = toPublicInterConnectionTest(oauth);
  await persistInterConnectionTestResult(admin, companyId, existing.id, test);
  const config = await getCompanyInterBankConfig(admin, companyId, lookup);
  return { test, config };
}

async function persistInterConnectionTestResult(
  admin: SupabaseClient,
  companyId: string,
  integrationId: string,
  test: InterConnectionTestPublic,
): Promise<void> {
  const { data: row } = await admin
    .from('bank_integrations')
    .select('metadata')
    .eq('id', integrationId)
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .maybeSingle();

  const prevMeta =
    row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  const metadata = {
    ...prevMeta,
    connectionVerified: test.connectionVerified,
    authStatus: test.authStatus,
    lastConnectionTestAt: test.testedAt,
    lastConnectionTestOk: test.ok,
    lastConnectionTestMessage: test.message.slice(0, 300),
    lastConnectionTestCode: test.code || null,
    // equivalente local a VERIFIED — não ativa emissão
    verifiedAt: test.connectionVerified ? test.testedAt : null,
  };

  const now = new Date().toISOString();
  const { error } = await admin
    .from('bank_integrations')
    .update({
      metadata,
      // Mantém DRAFT até emissão (Fase C); ERROR só em falha técnica persistente opcional
      status: test.authStatus === 'FAILED' ? 'DRAFT' : 'DRAFT',
      last_error: test.ok ? null : test.message.slice(0, 500),
      updated_at: now,
      // Nunca ativa emissão nesta fase
      active: false,
      is_default: false,
    })
    .eq('id', integrationId)
    .eq('company_id', companyId)
    .eq('provider', 'INTER');

  if (error) throw new Error(error.message);
}
