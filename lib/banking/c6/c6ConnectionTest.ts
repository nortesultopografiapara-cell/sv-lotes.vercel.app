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
import { inspectC6LoadedCertificatePublic } from '@/lib/banking/c6/c6LocalValidation';
import { clearCachedC6Token } from '@/lib/banking/c6/c6TokenCache';
import {
  hasMinimumC6AuthConfig,
  type C6BankConfigPublic,
} from '@/lib/banking/c6/c6ConfigTypes';

export type C6ConnectionTestBundle = {
  test: C6ConnectionTestPublic;
  config: C6BankConfigPublic;
};

function attachInspect(
  test: C6ConnectionTestPublic,
  extras: Partial<C6ConnectionTestPublic>,
): C6ConnectionTestPublic {
  return { ...test, ...extras };
}

export async function runCompanyC6ConnectionTest(
  admin: SupabaseClient,
  companyId: string,
  options?: {
    bypassCache?: boolean;
    fetchFn?: C6AuthFetchFn;
    financialAccountId?: string | null;
    integrationId?: string | null;
    inspectOnly?: boolean;
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

  const certificateInspect = inspectC6LoadedCertificatePublic(
    secrets.certificatePem,
    secrets.privateKeyPem,
  );
  const localMaterialOk =
    certificateInspect.pemCertificateOk &&
    certificateInspect.pemPrivateKeyOk &&
    certificateInspect.pairMatches &&
    !certificateInspect.expired &&
    !certificateInspect.notYetValid;

  if (options?.inspectOnly) {
    const test = attachInspect(
      toPublicC6ConnectionTest({
        ok: false,
        code: 'UNKNOWN',
        message: localMaterialOk
          ? 'Inspeção local do certificado concluída. C6 não foi chamado.'
          : 'Inspeção local do certificado encontrou problema. C6 não foi chamado.',
        environment: secrets.environment,
      }),
      {
        status: 'UNTESTED',
        inspectOnly: true,
        certificateInspect,
        httpDiagnostic: null,
      },
    );
    return { test, config: existing };
  }

  if (!localMaterialOk) {
    const test = attachInspect(
      toPublicC6ConnectionTest({
        ok: false,
        code: certificateInspect.expired
          ? 'MTLS_ERROR'
          : !certificateInspect.pairMatches
            ? 'MTLS_ERROR'
            : !certificateInspect.pemCertificateOk
              ? 'MISSING_CERTIFICATE'
              : 'MISSING_PRIVATE_KEY',
        message: certificateInspect.expired
          ? 'Certificado C6 expirado. Autenticação não foi enviada.'
          : !certificateInspect.pairMatches
            ? 'Certificado e chave privada não correspondem. Autenticação não foi enviada.'
            : 'Material PEM inválido. Autenticação não foi enviada.',
        environment: secrets.environment,
      }),
      { certificateInspect, inspectOnly: false, httpDiagnostic: null },
    );
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
    test: attachInspect(toPublicC6ConnectionTest(oauth), { certificateInspect }),
    config: existing,
  };
}
