/**
 * Bloqueio de emissão C6 Bank — Fase 1 / 3B.
 * O cliente de boleto existe, mas a emissão real permanece bloqueada.
 */

import type { BankEnvironment } from '@/lib/banking/types';
import { isC6CompanyOperationEnabled } from '@/lib/banking/c6/c6CompanyAccess';
import { isProductionSupabaseRuntime } from '@/lib/homolog/env';
import { isExecutionEnvironmentBlockingRealOutbound } from '@/lib/homolog/executionEnvironment';

export const C6_EMIT_NOT_HOMOLOGATED_MESSAGE =
  'Integração C6 Bank ainda não homologada para emissão.';

/** Resposta da rota de provider quando a venda está ligada ao C6. */
export const C6_CHARGES_ROUTE_BLOCKED_CODE = 'C6_NOT_HOMOLOGATED';

/** Flag futuro, Sandbox-only. Exige valor exatamente "true". Não habilita Production. */
export const C6_BOLETO_SANDBOX_LIVE_ENV_KEY = 'C6_BOLETO_SANDBOX_LIVE_ENABLED';

export class C6EmissionNotHomologatedError extends Error {
  constructor(message = C6_EMIT_NOT_HOMOLOGATED_MESSAGE) {
    super(message);
    this.name = 'C6EmissionNotHomologatedError';
  }
}

export function isC6ProviderCode(provider: string | null | undefined): boolean {
  return String(provider || '').trim().toUpperCase() === 'C6';
}

/** Lança se o provider for C6 e a empresa não tiver emissão autorizada. Não loga secrets. */
export function throwIfC6EmissionAttempt(
  provider: string | null | undefined,
  companyId?: string | null,
): void {
  if (!isC6ProviderCode(provider)) return;
  if (isC6CompanyOperationEnabled(companyId, 'emission')) return;
  throw new C6EmissionNotHomologatedError();
}

export function isC6BoletoSandboxLiveEnabled(): boolean {
  return process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY] === 'true';
}

/**
 * Mecanismo projetado para autorização futura de HTTP real de boleto.
 * Nunca libera Production. Sozinho não emite: o cliente ainda exige
 * allowSimulatedHttp (testes) ou autorização expressa posterior.
 */
export function isC6BoletoSandboxLiveAuthorized(
  _environment: BankEnvironment | null | undefined,
): boolean {
  return false;
}

/**
 * Gravação de credencial C6.
 * A configuração fica disponível ao administrador da empresa da sessão, em qualquer host.
 * A emissão real continua em isC6RemoteOperationBlocked e nas concessões por empresa.
 */
export function isC6ConfigPersistBlocked(
  _supabaseUrl?: string,
  _companyId?: string | null,
): boolean {
  return false;
}

/**
 * Chamada remota C6.
 * Sandbox fora do host de Production permanece no comportamento já homologado.
 * Production só abre a operação nomeada para a empresa com essa concessão.
 */
export function isC6RemoteOperationBlocked(
  environment: string | null | undefined,
  supabaseUrl?: string,
  companyId?: string | null,
  operation: 'connection' | 'emission' = 'emission',
): boolean {
  const production =
    String(environment || '').trim().toUpperCase() === 'PRODUCTION' ||
    isProductionSupabaseRuntime(supabaseUrl);
  if (!production) return false;
  if (isExecutionEnvironmentBlockingRealOutbound()) return true;
  return !isC6CompanyOperationEnabled(companyId, operation);
}
