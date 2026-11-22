/**
 * Teste OAuth/mTLS. O token não sai desta função.
 * Production só segue quando a empresa tem a concessão de conexão.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isC6CompanyOperationEnabled } from '@/lib/banking/c6/c6CompanyAccess';
import {
  requestC6AccessToken,
  type C6AuthCredentials,
  type C6AuthFetchFn,
} from '@/lib/banking/c6/c6AuthClient';
import { loadC6SecretsForGrantedOperation } from '@/lib/banking/c6/c6ConfigRepository';

export type C6ConnectionProbePublic = {
  ok: boolean;
  executed: boolean;
  environment: string | null;
  httpStatus: number | null;
  scopeReturned: boolean;
  message: string;
};

function publicProbe(input: C6ConnectionProbePublic): C6ConnectionProbePublic {
  return {
    ok: input.ok,
    executed: input.executed,
    environment: input.environment,
    httpStatus: input.httpStatus,
    scopeReturned: input.scopeReturned,
    message: input.message,
  };
}

export async function probeC6Connection(
  creds: C6AuthCredentials,
  options?: { fetchFn?: C6AuthFetchFn; allowProduction?: boolean },
): Promise<C6ConnectionProbePublic> {
  const productionAllowed =
    options?.allowProduction === true &&
    isC6CompanyOperationEnabled(creds.companyId, 'connection');
  const result = await requestC6AccessToken(creds, {
    fetchFn: options?.fetchFn,
    bypassCache: true,
    allowProduction: productionAllowed,
  });
  if (!result.ok) {
    return publicProbe({
      ok: false,
      executed: result.code !== 'PRODUCTION_AUTH_BLOCKED',
      environment: result.environment,
      httpStatus: result.httpStatus ?? null,
      scopeReturned: false,
      message: result.message,
    });
  }
  return publicProbe({
    ok: true,
    executed: true,
    environment: result.environment,
    httpStatus: result.httpStatus,
    scopeReturned: result.scopeReturned,
    message: 'Conexão C6 aceita. O token não é devolvido.',
  });
}

export async function runC6ConnectionTest(
  admin: SupabaseClient,
  companyId: string,
  options?: { fetchFn?: C6AuthFetchFn },
): Promise<C6ConnectionProbePublic> {
  if (!isC6CompanyOperationEnabled(companyId, 'connection')) {
    return publicProbe({
      ok: false,
      executed: false,
      environment: null,
      httpStatus: null,
      scopeReturned: false,
      message: 'Teste de conexão C6 ainda não autorizado para esta empresa.',
    });
  }
  const secrets = await loadC6SecretsForGrantedOperation(admin, companyId, 'connection');
  if (!secrets) {
    return publicProbe({
      ok: false,
      executed: false,
      environment: null,
      httpStatus: null,
      scopeReturned: false,
      message: 'Configuração C6 incompleta para o teste de conexão.',
    });
  }
  return probeC6Connection(
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
      fetchFn: options?.fetchFn,
      allowProduction: secrets.environment === 'PRODUCTION',
    },
  );
}
