/**
 * Feature flag do Painel Master Executivo V2 (casca visual).
 * Desativado por padrão — ativar apenas em develop/preview para homologação.
 *
 * UI: NEXT_PUBLIC_MASTER_DASHBOARD_V2_ENABLED (obrigatório no client).
 * API/server: MASTER_DASHBOARD_V2_ENABLED (runtime, nunca exposto ao browser).
 */

import { shouldUseMasterConsoleLayout } from '@/lib/rolePermissions';

export const MASTER_DASHBOARD_V2_FLAG = 'MASTER_DASHBOARD_V2_ENABLED' as const;
export const MASTER_DASHBOARD_V2_UI_FLAG = 'NEXT_PUBLIC_MASTER_DASHBOARD_V2_ENABLED' as const;

/** Aceita apenas a string literal "true" (case-insensitive, trim). */
export function parseMasterDashboardV2EnvFlag(value: string | undefined | null): boolean {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function readPublicMasterDashboardV2EnvRaw(): string | undefined {
  // Acesso estático obrigatório no client: Next.js só embute NEXT_PUBLIC_*
  // com propriedade literal. Chave dinâmica quebra o bake no Preview/Vercel.
  return process.env.NEXT_PUBLIC_MASTER_DASHBOARD_V2_ENABLED;
}

/** Valor bruto de NEXT_PUBLIC (diagnóstico). */
export function getPublicMasterDashboardV2FlagRaw(): string {
  const raw = readPublicMasterDashboardV2EnvRaw();
  return raw === undefined ? '(undefined)' : raw;
}

/** Gate server/API — runtime. */
export function isMasterDashboardV2Enabled(): boolean {
  return parseMasterDashboardV2EnvFlag(process.env[MASTER_DASHBOARD_V2_FLAG]);
}

/**
 * Fallback client — NEXT_PUBLIC obrigatório.
 * Preferir resolução via Server Component quando disponível.
 */
export function isMasterDashboardV2EnabledForUi(): boolean {
  return parseMasterDashboardV2EnvFlag(readPublicMasterDashboardV2EnvRaw());
}

/**
 * Resolução server-side em request time (RSC).
 * Usa NEXT_PUBLIC — disponível no servidor Vercel em runtime por request.
 */
export function resolveMasterDashboardV2UiEnabled(): boolean {
  return parseMasterDashboardV2EnvFlag(readPublicMasterDashboardV2EnvRaw());
}

export const MASTER_TOPOGRAFIA_LOGO_PATH = '/brand/sv-topografia-projetos-logo.png' as const;

/**
 * Quando usar o shell executivo V2 (sidebar/header novos).
 * Nunca em impersonation de tenant — nesse caso o chrome da empresa deve prevalecer.
 */
export function shouldUseMasterExecutiveShell(options: {
  role?: string | null;
  impersonatingTenant?: boolean;
  /** Override explícito da flag UI (testes). */
  flagEnabled?: boolean;
}): boolean {
  const flag =
    typeof options.flagEnabled === 'boolean'
      ? options.flagEnabled
      : isMasterDashboardV2EnabledForUi();
  if (!flag) return false;
  if (options.impersonatingTenant) return false;
  return shouldUseMasterConsoleLayout(options.role);
}
