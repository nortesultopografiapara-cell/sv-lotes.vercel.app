/**
 * Resolução de perfil no login — SUPER_ADMIN > ADMIN_EMPRESA/ADMIN > OWNER > BROKER.
 */

import {
  isBrokerRole,
  isMasterConsoleRole,
  isOwnerRole,
  isTenantEnterpriseAdminRole,
  normalizeUserRole,
} from '@/lib/rolePermissions';

export type LoginRedirectTarget = '/map' | '/dashboard' | '/master';

export function resolveEffectiveLoginRole(role?: string | null): string {
  const normalized = normalizeUserRole(role);
  if (isMasterConsoleRole(normalized)) return normalized;
  if (isTenantEnterpriseAdminRole(normalized)) return normalized;
  if (normalized === 'ADMIN') return normalized;
  if (isOwnerRole(normalized)) return normalized;
  if (isBrokerRole(normalized)) return normalized;
  return normalized || 'USER';
}

/**
 * Destino pós-login por papel.
 * SUPER_ADMIN → Painel Executivo (/master).
 * Demais papéis de empresa → /dashboard ou /map (inalterados).
 */
export function resolveLoginRedirectPath(role?: string | null): LoginRedirectTarget {
  const effective = resolveEffectiveLoginRole(role);
  if (isBrokerRole(effective)) return '/map';
  if (isMasterConsoleRole(effective)) return '/master';
  return '/dashboard';
}

export function shouldLoginAsAdmin(role?: string | null): boolean {
  const effective = resolveEffectiveLoginRole(role);
  return isMasterConsoleRole(effective) || isTenantEnterpriseAdminRole(effective) || effective === 'ADMIN';
}

export function shouldLoginAsBroker(role?: string | null): boolean {
  return isBrokerRole(resolveEffectiveLoginRole(role));
}
