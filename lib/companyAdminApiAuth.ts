/**
 * Gate SUPER_ADMIN para APIs administrativas de empresas.
 * Identidade vem só da sessão (`getRequestAuthUser`). Não usa identidade do body.
 * Reutiliza assertSuperAdmin + createAdminSupabase (mesmo padrão de /api/regenerate).
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';

export const COMPANY_ADMIN_API_PATHS = [
  '/api/companies/cleanup',
  '/api/companies/delete-test',
  '/api/companies/create',
] as const;

export type CompanyAdminApiPath = (typeof COMPANY_ADMIN_API_PATHS)[number];

export type CompanyAdminAuthUserResult = {
  user: User | null;
  configError: string | null;
};

export type CompanyAdminAdminResult = {
  client: SupabaseClient | null;
  configError?: string | null;
};

export type CompanyAdminAuthDeps = {
  getRequestAuthUser: (request: Request) => Promise<CompanyAdminAuthUserResult>;
  createAdminSupabase: () => CompanyAdminAdminResult;
  assertSuperAdmin: (
    supabaseAdmin: SupabaseClient,
    userId?: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
};

export function isCompanyAdminApiPath(pathname: string): boolean {
  return COMPANY_ADMIN_API_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function companyAdminUnauthorizedJson() {
  return { error: 'Não autenticado.', code: 'UNAUTHORIZED' as const };
}

export function companyAdminForbiddenJson() {
  return { error: 'Permissão negada.', code: 'FORBIDDEN' as const };
}

export function companyAdminUnavailableJson() {
  return { error: 'Serviço indisponível.', code: 'SERVICE_UNAVAILABLE' as const };
}

function isConfigUnavailable(configError: string | null | undefined): boolean {
  if (!configError) return false;
  return !/token inválido|sessão inválida/i.test(configError);
}

export type CompanyAdminGateDenied = {
  ok: false;
  status: 401 | 403 | 503;
  body: ReturnType<
    | typeof companyAdminUnauthorizedJson
    | typeof companyAdminForbiddenJson
    | typeof companyAdminUnavailableJson
  >;
};

export type CompanyAdminGateAllowed = {
  ok: true;
  userId: string;
  supabaseAdmin: SupabaseClient;
};

export type CompanyAdminGateResult = CompanyAdminGateDenied | CompanyAdminGateAllowed;

/**
 * Autoriza somente SUPER_ADMIN da sessão.
 * Anônimo: 401 (sem createAdminSupabase).
 * Autenticado não SUPER_ADMIN: 403 (role lookup apenas; sem escrita).
 */
export async function authorizeCompanyAdminRequest(
  request: Request,
  deps: CompanyAdminAuthDeps,
): Promise<CompanyAdminGateResult> {
  const { user, configError } = await deps.getRequestAuthUser(request);
  if (!user) {
    if (isConfigUnavailable(configError)) {
      return { ok: false, status: 503, body: companyAdminUnavailableJson() };
    }
    return { ok: false, status: 401, body: companyAdminUnauthorizedJson() };
  }

  const { client: supabaseAdmin } = deps.createAdminSupabase();
  if (!supabaseAdmin) {
    return { ok: false, status: 503, body: companyAdminUnavailableJson() };
  }

  const auth = await deps.assertSuperAdmin(supabaseAdmin, user.id);
  if (!auth.ok) {
    return { ok: false, status: 403, body: companyAdminForbiddenJson() };
  }

  return { ok: true, userId: user.id, supabaseAdmin };
}

export type CompanyAdminHttpResult = {
  status: number;
  body: Record<string, unknown>;
  authorized: boolean;
};

export async function executeCompanyAdminPost(
  request: Request,
  deps: CompanyAdminAuthDeps,
  onAuthorized: () => Promise<{ status: number; body: Record<string, unknown> }>,
): Promise<CompanyAdminHttpResult> {
  const gate = await authorizeCompanyAdminRequest(request, deps);
  if (!gate.ok) {
    return { status: gate.status, body: gate.body, authorized: false };
  }
  const result = await onAuthorized();
  return { status: result.status, body: result.body, authorized: true };
}
