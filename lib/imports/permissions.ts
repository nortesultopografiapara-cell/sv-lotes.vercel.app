/**
 * Permissões — módulo Migração de Dados.
 * Acesso restrito a SUPER_ADMIN (plataforma) e ADMIN (empresa).
 */

import {
  isMasterConsoleRole,
  normalizeUserRole,
} from '@/lib/rolePermissions';

export function canAccessDataMigrationModule(role?: string | null): boolean {
  const normalized = normalizeUserRole(role);
  if (isMasterConsoleRole(normalized)) return true;
  return normalized === 'ADMIN';
}
