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
 *
 * Rotas `/master` e `/master/**` SEMPRE usam o shell executivo para SUPER_ADMIN,
 * mesmo com a flag de rollout desligada — evita renderizar o dashboard V2
 * dentro do chrome SaaS legado (`h-dvh` + `overflow-hidden`), que corta o scroll.
 */
export function shouldUseMasterExecutiveShell(options: {
  role?: string | null;
  impersonatingTenant?: boolean;
  /** Override explícito da flag UI (testes). */
  flagEnabled?: boolean;
  /** Pathname atual — `/master/**` força o shell executivo. */
  pathname?: string | null;
}): boolean {
  if (options.impersonatingTenant) return false;
  if (!shouldUseMasterConsoleLayout(options.role)) return false;

  const path = String(options.pathname || '').split('?')[0].trim();
  if (path === '/master' || path.startsWith('/master/')) return true;

  const flag =
    typeof options.flagEnabled === 'boolean'
      ? options.flagEnabled
      : isMasterDashboardV2EnabledForUi();
  return flag;
}

/** Marcador de build para diagnóstico de deploy (visível no shell Master). */
export const MASTER_EXECUTIVE_BUILD_MARKER = '079d3dd-scroll-v3' as const;
