/**
 * Feature flag do Portal do Cliente (somente leitura, público).
 * Desativado por padrão — ativar em develop/preview quando pronto.
 *
 * UI: NEXT_PUBLIC_CLIENT_PORTAL_ENABLED
 * API/server: CLIENT_PORTAL_ENABLED
 */

export const CLIENT_PORTAL_FLAG = 'CLIENT_PORTAL_ENABLED' as const;
export const CLIENT_PORTAL_UI_FLAG = 'NEXT_PUBLIC_CLIENT_PORTAL_ENABLED' as const;

export const CLIENT_PORTAL_PATH = '/portal-cliente' as const;

/** Aceita apenas a string literal "true" (case-insensitive, trim). */
export function parseClientPortalEnvFlag(value: string | undefined | null): boolean {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function readPublicClientPortalEnvRaw(): string | undefined {
  const envKey = CLIENT_PORTAL_UI_FLAG;
  return process.env[envKey];
}

/** Gate server/API — runtime. */
export function isClientPortalEnabled(): boolean {
  return parseClientPortalEnvFlag(process.env[CLIENT_PORTAL_FLAG]);
}

/** Gate client — NEXT_PUBLIC obrigatório. */
export function isClientPortalEnabledForUi(): boolean {
  return parseClientPortalEnvFlag(readPublicClientPortalEnvRaw());
}

/** Resolução server-side em request time (RSC). */
export function resolveClientPortalUiEnabled(): boolean {
  return parseClientPortalEnvFlag(readPublicClientPortalEnvRaw());
}
