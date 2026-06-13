import { isPlatformAdmin } from '@/lib/rls';

export const BROKER_ROLES = ['BROKER', 'CORRETOR'] as const;
export const OWNER_ROLES = ['OWNER'] as const;

export const ENTERPRISE_ADMIN_ROLES = [
  'ADMIN',
  'SUPER_ADMIN',
  'COMPANY_ADMIN',
  'ADMIN_EMPRESA',
  'MASTER-ADMIN',
  'MASTER_ADMIN',
] as const;

export function normalizeUserRole(role?: string | null): string {
  return String(role || '').trim().toUpperCase();
}

export function isBrokerRole(role?: string | null): boolean {
  const normalized = normalizeUserRole(role);
  return (BROKER_ROLES as readonly string[]).includes(normalized);
}

export function isOwnerRole(role?: string | null): boolean {
  const normalized = normalizeUserRole(role);
  return (OWNER_ROLES as readonly string[]).includes(normalized);
}

/** ADMIN / SUPER_ADMIN e equivalentes de empresa — não inclui corretor nem proprietário. */
export function canViewEnterpriseValues(role?: string | null): boolean {
  if (isBrokerRole(role) || isOwnerRole(role)) return false;
  const normalized = normalizeUserRole(role);
  if (isPlatformAdmin(normalized)) return true;
  return (ENTERPRISE_ADMIN_ROLES as readonly string[]).includes(normalized);
}

export function canViewGlobalEnterpriseValues(role?: string | null): boolean {
  return canViewEnterpriseValues(role);
}

export function canAccessFinanceModule(role?: string | null): boolean {
  if (isOwnerRole(role)) return true;
  return canViewEnterpriseValues(role);
}

export function canAccessAdminDashboard(role?: string | null): boolean {
  if (isOwnerRole(role)) return true;
  return canViewEnterpriseValues(role);
}

export function canManageGisProject(role?: string | null): boolean {
  if (isBrokerRole(role) || isOwnerRole(role)) return false;
  const normalized = normalizeUserRole(role);
  if (isPlatformAdmin(normalized)) return true;
  return (ENTERPRISE_ADMIN_ROLES as readonly string[]).includes(normalized);
}

export const BROKER_BLOCKED_ROUTE_PREFIXES = [
  '/dashboard',
  '/customers',
  '/finance',
  '/contracts',
  '/settings',
  '/companies',
  '/crm',
  '/logs',
  '/plans',
  '/users',
  '/saas-finance',
  '/offline-sync',
  '/reports',
] as const;

export function isBrokerBlockedRoute(pathname: string): boolean {
  return BROKER_BLOCKED_ROUTE_PREFIXES.some((route) => pathname.startsWith(route));
}
