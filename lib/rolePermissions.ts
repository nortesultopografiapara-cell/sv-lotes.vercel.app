import { isPlatformAdmin } from '@/lib/rls';

export const BROKER_ROLES = ['BROKER', 'CORRETOR'] as const;
export const OWNER_ROLES = ['OWNER'] as const;

export const OWNER_READ_ONLY_DENIED_MESSAGE =
  'Perfil OWNER possui acesso somente leitura. Esta ação não é permitida.';

export const ENTERPRISE_ADMIN_ROLES = [
  'ADMIN',
  'SUPER_ADMIN',
  'COMPANY_ADMIN',
  'ADMIN_EMPRESA',
  'MASTER-ADMIN',
  'MASTER_ADMIN',
] as const;

export const TENANT_ENTERPRISE_ADMIN_ROLES = [
  'ADMIN',
  'ADMIN_EMPRESA',
  'COMPANY_ADMIN',
] as const;

export function normalizeUserRole(role?: string | null): string {
  return String(role || '').trim().toUpperCase();
}

export function isTenantEnterpriseAdminRole(role?: string | null): boolean {
  const normalized = normalizeUserRole(role);
  return (TENANT_ENTERPRISE_ADMIN_ROLES as readonly string[]).includes(normalized);
}

/** Painel Master (SaaS) — SUPER_ADMIN e aliases MASTER-ADMIN / MASTER_ADMIN. */
export function isMasterConsoleRole(role?: string | null): boolean {
  return isPlatformAdmin(role);
}

export function shouldUseMasterConsoleLayout(role?: string | null): boolean {
  return isMasterConsoleRole(role);
}

/** Menu completo da empresa: ADMIN principal e admins secundários. */
export function shouldShowFullTenantAdminMenu(role?: string | null): boolean {
  if (isMasterConsoleRole(role)) return false;
  return isTenantEnterpriseAdminRole(role);
}

export function resolveRoleDisplayLabel(role?: string | null): string {
  const normalized = normalizeUserRole(role);
  if (isMasterConsoleRole(normalized)) return 'Painel Master · SaaS';
  if (isBrokerRole(normalized)) return 'Corretor / Vendedor';
  if (isOwnerRole(normalized)) return 'Proprietário / Sócio';
  if (normalized === 'ADMIN') return 'Administrador da Empresa';
  if (isTenantEnterpriseAdminRole(normalized)) return 'Admin Empresa';
  return 'Usuário';
}

export function isBrokerRole(role?: string | null): boolean {
  const normalized = normalizeUserRole(role);
  return (BROKER_ROLES as readonly string[]).includes(normalized);
}

export function isOwnerRole(role?: string | null): boolean {
  const normalized = normalizeUserRole(role);
  return (OWNER_ROLES as readonly string[]).includes(normalized);
}

/** OWNER só visualiza — nunca grava no sistema. */
export function canOwnerPerformWrites(role?: string | null): boolean {
  return !isOwnerRole(role);
}

/** ADMIN / SUPER_ADMIN e equivalentes de empresa — não inclui corretor nem proprietário. */
export function canViewEnterpriseValues(role?: string | null): boolean {
  if (isBrokerRole(role) || isOwnerRole(role)) return false;
  const normalized = normalizeUserRole(role);
  if (isPlatformAdmin(normalized)) return true;
  return (ENTERPRISE_ADMIN_ROLES as readonly string[]).includes(normalized);
}

/** Exportação de relatório de lotes — ADMIN/SUPER_ADMIN e OWNER (escopo por projeto). */
export function canExportLotReport(role?: string | null): boolean {
  if (isBrokerRole(role)) return false;
  if (isOwnerRole(role)) return true;
  return canViewEnterpriseValues(role);
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

/** ADMIN da empresa ou SUPER_ADMIN (incl. impersonation) — gestão de sócios/proprietários. */
export function canManageOwners(role?: string | null): boolean {
  if (isBrokerRole(role) || isOwnerRole(role)) return false;
  const normalized = normalizeUserRole(role);
  if (isPlatformAdmin(normalized)) return true;
  return isTenantEnterpriseAdminRole(normalized);
}

export const OWNERS_ADMIN_ROUTE = '/owners' as const;

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
  '/owners',
  '/saas-finance',
  '/offline-sync',
  '/reports',
] as const;

export function isBrokerBlockedRoute(pathname: string): boolean {
  return BROKER_BLOCKED_ROUTE_PREFIXES.some((route) => pathname.startsWith(route));
}
