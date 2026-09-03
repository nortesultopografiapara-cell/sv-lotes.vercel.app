/**
 * Bloqueio de emissão C6 Bank — Fase 1.
 * Sem client HTTP, sem OAuth, sem webhook.
 */

export const C6_EMIT_NOT_HOMOLOGATED_MESSAGE =
  'Integração C6 Bank ainda não homologada para emissão.';

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
