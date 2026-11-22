/**
 * Autorização exclusiva da homologação C6-H1.
 * Exige empresa, Develop, Sandbox, uma referência e a chave da operação.
 * Não arma emissão, não lê o flag global e não chama o banco.
 */

import { timingSafeEqual } from 'node:crypto';
import type { BankEnvironment } from '@/lib/banking/types';
import { DEVELOP_PROJECT_REF, isDevelopHomologRuntime } from '@/lib/homolog/env';
import {
  C6_BOLETO_READ_SCOPE,
  C6_BOLETO_WRITE_SCOPE,
  hasC6BankSlipReadScope,
  hasC6BankSlipWriteScope,
} from '@/lib/banking/c6/c6BoletoOpenApi';
import {
  C6_BOLETO_SANDBOX_LIVE_ENV_KEY,
  isC6BoletoSandboxLiveAuthorized,
  isC6RemoteOperationBlocked,
} from '@/lib/banking/c6/c6EmitGuard';

/** S.V TOPOGRAFIA E PROJETO LTDA, empresa de teste já existente no Develop. */
export const C6_H1_AUTHORIZED_COMPANY_ID = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
/** UUID de configuração da empresa real. Não autoriza homologação neste banco. */
export const C6_H1_PRODUCTION_COMPANY_ID = '5ebfe934-e1ae-4252-b3dd-808390c32551';
export const C6_H1_DEVELOP_PROJECT_REF = DEVELOP_PROJECT_REF;
/** Única referência aceita nesta fase. Nove caracteres, padrão do boleto C6. */
export const C6_H1_EXTERNAL_REFERENCE = 'C6H1SBX01';
export const C6_H1_SERVER_AUTHORIZATION_MIN_LENGTH = 24;

export const C6_H1_OPERATIONS = ['token', 'emit', 'status', 'pdf'] as const;
export type C6H1Operation = (typeof C6_H1_OPERATIONS)[number];

/** Uma variável por operação. O flag global de boleto não substitui nenhuma delas. */
export const C6_H1_OPERATION_AUTHORIZATION_ENV = {
  token: 'C6_H1_TOKEN_OPERATION_AUTHORIZATION',
  emit: 'C6_H1_EMIT_OPERATION_AUTHORIZATION',
  status: 'C6_H1_STATUS_OPERATION_AUTHORIZATION',
  pdf: 'C6_H1_PDF_OPERATION_AUTHORIZATION',
} as const;

export const C6_H1_ACTION_DISARMED_MESSAGE =
  'Homologação C6 H1 permanece desabilitada. Nenhuma chamada bancária foi autorizada.';

export type C6H1Denial =
  | 'company'
  | 'supabase'
  | 'environment'
  | 'reference'
  | 'server_authorization'
  | 'action_disarmed';

export type C6H1AuthorizationInput = {
  companyId: string | null | undefined;
  supabaseUrl?: string | null;
  environment: string | null | undefined;
  externalReferenceId: string | null | undefined;
  operation: C6H1Operation;
  serverAuthorization?: string | null;
  env?: Record<string, string | undefined>;
};

export type C6H1AuthorizationDecision = {
  company: boolean;
  develop: boolean;
  sandbox: boolean;
  reference: boolean;
  serverAuthorization: boolean;
  actionEnabled: false;
  bankCallAllowed: false;
  globalEmissionAuthorized: boolean;
  productionBlocked: boolean;
  denials: C6H1Denial[];
};

export function isC6H1Operation(value: string | null | undefined): value is C6H1Operation {
  return C6_H1_OPERATIONS.includes(String(value || '').trim() as C6H1Operation);
}

/**
 * Fase C6-H1. Permanece falsa até uma autorização posterior e explícita.
 * Não consulta variável de ambiente.
 */
export function isC6H1HomologActionArmed(): false {
  return false;
}

function sameOperationSecret(presented: string, expected: string): boolean {
  if (presented.length < C6_H1_SERVER_AUTHORIZATION_MIN_LENGTH) return false;
  if (expected.length !== presented.length) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

export function matchesC6H1OperationAuthorization(
  operation: C6H1Operation,
  presented: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const expected = String(env[C6_H1_OPERATION_AUTHORIZATION_ENV[operation]] || '');
  const candidate = String(presented || '');
  if (!expected || expected === 'true') return false;
  if (String(env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY] || '') === candidate && candidate === 'true') {
    return false;
  }
  return sameOperationSecret(candidate, expected);
}

export function evaluateC6H1Authorization(
  input: C6H1AuthorizationInput,
): C6H1AuthorizationDecision {
  const company =
    String(input.companyId || '').trim().toLowerCase() === C6_H1_AUTHORIZED_COMPANY_ID.toLowerCase();
  const develop = isDevelopHomologRuntime(String(input.supabaseUrl || ''));
  const environment = String(input.environment || '').trim().toUpperCase();
  const sandbox = environment === 'SANDBOX';
  const reference = String(input.externalReferenceId || '') === C6_H1_EXTERNAL_REFERENCE;
  const serverAuthorization = matchesC6H1OperationAuthorization(
    input.operation,
    input.serverAuthorization,
    input.env,
  );
  const productionBlocked = isC6RemoteOperationBlocked(
    environment,
    String(input.supabaseUrl || ''),
  );
  const denials: C6H1Denial[] = [];
  if (!company) denials.push('company');
  if (!develop) denials.push('supabase');
  if (!sandbox) denials.push('environment');
  if (!reference) denials.push('reference');
  if (!serverAuthorization) denials.push('server_authorization');
  denials.push('action_disarmed');

  return {
    company,
    develop,
    sandbox,
    reference,
    serverAuthorization,
    actionEnabled: isC6H1HomologActionArmed(),
    bankCallAllowed: false,
    globalEmissionAuthorized: isC6BoletoSandboxLiveAuthorized(
      sandbox ? 'SANDBOX' : (environment as BankEnvironment),
    ),
    productionBlocked,
    denials,
  };
}

export type C6H1ScopeAssessment = {
  scopeFieldPresent: boolean;
  conclusive: boolean;
  writeConfirmed: boolean;
  readConfirmed: boolean;
  scopes: string[];
  required: readonly [typeof C6_BOLETO_WRITE_SCOPE, typeof C6_BOLETO_READ_SCOPE];
  confirmation: 'campo scope da resposta OAuth; ausência não confirma o escopo';
};

/** Lê somente o campo scope já separado do access token. Não chama o C6. */
export function assessC6H1OAuthScopes(
  scopeField: string | null | undefined,
  scopeFieldPresent: boolean,
): C6H1ScopeAssessment {
  const scopes = scopeFieldPresent ? String(scopeField || '').split(/[\s,]+/).filter(Boolean) : [];
  const writeConfirmed = scopeFieldPresent && hasC6BankSlipWriteScope(scopes);
  const readConfirmed = scopeFieldPresent && hasC6BankSlipReadScope(scopes);
  return {
    scopeFieldPresent,
    conclusive: scopeFieldPresent,
    writeConfirmed,
    readConfirmed,
    scopes: scopes.filter((scope) => scope === C6_BOLETO_WRITE_SCOPE || scope === C6_BOLETO_READ_SCOPE || scope.endsWith('.bankslip.write') || scope.endsWith('.bankslip.read')),
    required: [C6_BOLETO_WRITE_SCOPE, C6_BOLETO_READ_SCOPE],
    confirmation: 'campo scope da resposta OAuth; ausência não confirma o escopo',
  };
}
