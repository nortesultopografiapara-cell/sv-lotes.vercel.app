/**
 * Orquestra teste de autenticação C6 (Fase 3A) — sem emissão de cobrança.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadC6SecretsForServer,
  getCompanyC6BankConfig,
} from '@/lib/banking/c6/c6ConfigRepository';
import {
  requestC6AccessToken,
  toPublicC6ConnectionTest,
  type C6AuthFetchFn,
  type C6ConnectionTestPublic,
} from '@/lib/banking/c6/c6AuthClient';
import { clearCachedC6Token } from '@/lib/banking/c6/c6TokenCache';
import {
  hasMinimumC6AuthConfig,
  type C6BankConfigPublic,
} from '@/lib/banking/c6/c6ConfigTypes';

export type C6ConnectionTestBundle = {
  test: C6ConnectionTestPublic;
  config: C6BankConfigPublic;
};

export async function runCompanyC6ConnectionTest(
  admin: SupabaseClient,
  companyId: string,
  options?: {
    bypassCache?: boolean;
    fetchFn?: C6AuthFetchFn;
    financialAccountId?: string | null;
    integrationId?: string | null;
  },
): Promise<C6ConnectionTestBundle> {
  const lookup = {
    financialAccountId: options?.financialAccountId || null,
    integrationId: options?.integrationId || null,
  };
  const existing = await getCompanyC6BankConfig(admin, companyId, lookup);
  if (!existing.id || !hasMinimumC6AuthConfig(existing)) {
    const missingCode = !existing.clientIdConfigured
      ? 'MISSING_CLIENT_ID'
      : !existing.hasClientSecret
        ? 'MISSING_CLIENT_SECRET'
        : !existing.hasCertificate
          ? 'MISSING_CERTIFICATE'
          : 'MISSING_PRIVATE_KEY';
    const test = toPublicC6ConnectionTest({
      ok: false,
      code: missingCode,
      message:
        missingCode === 'MISSING_CLIENT_ID'
          ? 'Client ID ausente. Salve a configuração antes de testar.'
          : missingCode === 'MISSING_CLIENT_SECRET'
            ? 'Client Secret ausente. Salve o Client Secret antes de testar.'
            : missingCode === 'MISSING_CERTIFICATE'
              ? 'Certificado ausente. Envie o certificado .crt do C6 antes de testar.'
              : 'Chave privada ausente. Envie a chave .key do C6 antes de testar.',
      environment: existing.environment,
    });
    return { test, config: existing };
  }

  if (existing.environment === 'PRODUCTION') {
    const test = toPublicC6ConnectionTest({
      ok: false,
      code: 'PRODUCTION_AUTH_BLOCKED',
      message: 'Nesta fase o teste C6 usa somente Sandbox. Produção não é chamada.',
      environment: existing.environment,
    });
    return { test, config: existing };
  }

  const secrets = await loadC6SecretsForServer(admin, companyId, lookup);
  if (!secrets) {
    const test = toPublicC6ConnectionTest({
      ok: false,
      code: 'MISSING_CLIENT_SECRET',
      message: 'Credenciais C6 incompletas no servidor. Salve Client Secret, certificado e chave.',
      environment: existing.environment,
    });
    return { test, config: existing };
  }

  clearCachedC6Token(companyId, secrets.environment, secrets.integrationId);

  const oauth = await requestC6AccessToken(
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
      allowProduction: false,
    },
  );

  return {
    test: toPublicC6ConnectionTest(oauth),
    config: existing,
  };
}
