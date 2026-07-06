/**
 * Permissões — módulo Contratos Antigos (gestão).
 */

import { canAccessDataMigrationModule } from '@/lib/imports/permissions';
import {
  isBrokerRole,
  isMasterConsoleRole,
  isOwnerRole,
  isTenantEnterpriseAdminRole,
  normalizeUserRole,
} from '@/lib/rolePermissions';

export function canAccessLegacyContractsModule(role?: string | null): boolean {
  const normalized = normalizeUserRole(role);
  if (isBrokerRole(normalized)) return false;
  if (isMasterConsoleRole(normalized)) return true;
  if (isOwnerRole(normalized)) return true;
  if (normalized === 'ADMIN') return true;
  return isTenantEnterpriseAdminRole(normalized);
}

/** Exclusão/arquivamento — mesmo critério da migração (ADMIN + plataforma). */
export function canManageLegacyContractsModule(role?: string | null): boolean {
  return canAccessDataMigrationModule(role);
}
