import { isPartnerPanelAdmin } from '@/lib/partnerPanelAdmin';
import { isPlatformAdmin } from '@/lib/rls';
import {
  isBrokerRole,
  isOwnerRole,
  normalizeUserRole,
} from '@/lib/rolePermissions';

/** Resolve papel efetivo (users.role, auth metadata ou fallback explícito). */
export function resolveManageBrokerCommissionRole(
  ...roles: Array<string | null | undefined>
): string {
  for (const role of roles) {
    const normalized = normalizeUserRole(role);
    if (normalized) return normalized;
  }
  return '';
}

export function canManageSaleBrokerCommission(role?: string | null): boolean {
  if (isBrokerRole(role) || isOwnerRole(role)) return false;
  return isPartnerPanelAdmin(role);
}

/** Ajuste/zerar em massa: recurso oculto de manutenção, só SUPER_ADMIN com ?manutencao=1. */
export const BROKER_COMMISSION_MAINTENANCE_QUERY = 'manutencao';

export function canShowBrokerCommissionMaintenanceUi(
  role?: string | null,
  queryValue?: string | null,
): boolean {
  if (!isPlatformAdmin(role)) return false;
  return String(queryValue || '').trim() === '1';
}
