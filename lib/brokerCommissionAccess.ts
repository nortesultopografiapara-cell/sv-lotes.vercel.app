import { isPlatformAdmin } from '@/lib/rls';
import {
  isBrokerRole,
  isOwnerRole,
  normalizeUserRole,
} from '@/lib/rolePermissions';

const SALE_BROKER_COMMISSION_ADMIN_ROLES = [
  'ADMIN',
  'COMPANY_ADMIN',
  'ADMIN_EMPRESA',
  'MASTER-ADMIN',
  'MASTER_ADMIN',
] as const;

export function canManageSaleBrokerCommission(role?: string | null): boolean {
  if (isBrokerRole(role) || isOwnerRole(role)) return false;
  const normalized = normalizeUserRole(role);
  if (isPlatformAdmin(normalized)) return true;
  return (SALE_BROKER_COMMISSION_ADMIN_ROLES as readonly string[]).includes(
    normalized,
  );
}
