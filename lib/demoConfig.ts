/** Empresa sandbox isolada — não usar tenant de produção. */
export const DEMO_COMPANY_ID = 'a0c1d2e3-f4a5-6789-abcd-ef0123456789';

export const DEMO_USER_EMAIL = 'demo@svlotes.com.br';
export const DEMO_USER_NAME = 'Usuário Demonstração';
export const DEMO_COMPANY_NAME = 'Empresa Demonstração SV LOTES';
export const DEMO_PROJECT_NAME = 'Loteamento Demonstração SV LOTES';

export const DEMO_LOGIN_PATH = '/login?demo=1';

/** Rotas internas bloqueadas para usuários demo (Master/SaaS/config crítica). */
export const DEMO_BLOCKED_ROUTE_PREFIXES = [
  '/companies',
  '/plans',
  '/saas-finance',
  '/master',
  '/users',
  '/logs',
  '/billing',
  '/super-admin',
] as const;

/** APIs sensíveis bloqueadas para usuários demo (escritas e integrações). */
export const DEMO_BLOCKED_API_PREFIXES = [
  '/api/master/',
  '/api/companies/delete',
  '/api/companies/create',
  '/api/companies/cleanup',
  '/api/companies/update',
  '/api/companies/status',
  '/api/company-admins',
  '/api/super-admin/change-password',
  '/api/saas/',
  '/api/cron/',
  '/api/payments/webhook',
] as const;

export function isDemoBlockedRoute(pathname: string): boolean {
  return DEMO_BLOCKED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isDemoBlockedApi(pathname: string, method: string): boolean {
  const verb = method.toUpperCase();
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return false;
  return DEMO_BLOCKED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isDemoProfile(profile?: { is_demo?: boolean | null } | null): boolean {
  return profile?.is_demo === true;
}
