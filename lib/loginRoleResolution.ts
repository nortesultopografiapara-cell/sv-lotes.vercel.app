/**
 * Resolução de perfil no login — ADMIN_EMPRESA > OWNER > BROKER.
 */

import {
  isBrokerRole,
  isOwnerRole,
  isTenantEnterpriseAdminRole,
  normalizeUserRole,
} from '@/lib/rolePermissions';

export type LoginRedirectTarget = '/map' | '/dashboard';

export function resolveEffectiveLoginRole(role?: string | null): string {
  const normalized = normalizeUserRole(role);
  if (isTenantEnterpriseAdminRole(normalized)) return normalized;
  if (isOwnerRole(normalized)) return normalized;
  if (isBrokerRole(normalized)) return normalized;
  return normalized || 'USER';
}

export function resolveLoginRedirectPath(role?: string | null): LoginRedirectTarget {
  const effective = resolveEffectiveLoginRole(role);
  if (isBrokerRole(effective)) return '/map';
  return '/dashboard';
}

export function shouldLoginAsAdmin(role?: string | null): boolean {
  return isTenantEnterpriseAdminRole(resolveEffectiveLoginRole(role));
}

export function shouldLoginAsBroker(role?: string | null): boolean {
  return isBrokerRole(resolveEffectiveLoginRole(role));
}
