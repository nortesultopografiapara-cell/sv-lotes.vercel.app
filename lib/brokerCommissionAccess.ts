import { isPartnerPanelAdmin } from '@/lib/partnerPanelAdmin';
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
