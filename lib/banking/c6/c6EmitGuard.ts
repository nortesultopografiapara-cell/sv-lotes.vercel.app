/**
 * Bloqueio de emissão C6 Bank — Fase 1 / 3B.
 * O cliente de boleto existe, mas a emissão real permanece bloqueada.
 */

import type { BankEnvironment } from '@/lib/banking/types';
import { isProductionSupabaseRuntime } from '@/lib/homolog/env';

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

/** Lança se o provider da conta/venda for C6. Não loga secrets. */
export function throwIfC6EmissionAttempt(provider: string | null | undefined): void {
  if (isC6ProviderCode(provider)) {
    throw new C6EmissionNotHomologatedError();
  }
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

/** Gravação de credencial C6. Nesta fase o host de Production recusa o cadastro. */
export function isC6ConfigPersistBlocked(supabaseUrl?: string): boolean {
  return isProductionSupabaseRuntime(supabaseUrl);
}

/** Chamada remota C6. Ambiente Production ou host de Production permanecem fechados. */
export function isC6RemoteOperationBlocked(
  environment: string | null | undefined,
  supabaseUrl?: string,
): boolean {
  if (String(environment || '').trim().toUpperCase() === 'PRODUCTION') return true;
  return isProductionSupabaseRuntime(supabaseUrl);
}
