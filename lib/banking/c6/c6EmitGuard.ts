/**
 * Bloqueio de emissão C6 Bank — Fase 1 / 3B.
 * O cliente de boleto existe, mas a emissão real permanece bloqueada.
 */

import type { BankEnvironment } from '@/lib/banking/types';

export const C6_EMIT_NOT_HOMOLOGATED_MESSAGE =
  'Integração C6 Bank ainda não homologada para emissão.';

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
  environment: BankEnvironment | null | undefined,
): boolean {
  return environment === 'SANDBOX' && isC6BoletoSandboxLiveEnabled();
}
