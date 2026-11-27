/**
 * Autorização administrativa vinculada à sessão.
 * O papel é lido no servidor. userId e callerUserId do navegador não autorizam.
 * Em produção, o gancho de teste não pode ser instalado.
 */
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { sessionCallerDecision } from '@/lib/security/usersIdentityGuard';
import { getRequestAuthUser } from '@/lib/supabase/server';

export const PLATFORM_ADMIN_ROLE = 'SUPER_ADMIN';

export type PlatformCaller = {
  role: string;
  status: string | null;
};

export type PlatformAdminDeps = {
  getRequestAuthUser: (
    request: Request,
  ) => Promise<{ user: { id: string } | null; configError: string | null }>;
  loadCaller: (
    userId: string,
  ) => Promise<{ ok: true; caller: PlatformCaller } | { ok: false; reason: 'not_found' | 'lookup_failed' }>;
};

export type PlatformAdminGate =
  | { ok: true; userId: string; role: typeof PLATFORM_ADMIN_ROLE }
  | { ok: false; status: 401 | 403 | 503; error: string };

let testDeps: Partial<PlatformAdminDeps> | null = null;

export function useAdminAuthDepsForTests(deps: Partial<PlatformAdminDeps> | null) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dependências de teste da autorização administrativa não podem ser usadas em produção.');
  }
  testDeps = deps;
}

async function loadCallerFromServer(userId: string): Promise<
  { ok: true; caller: PlatformCaller } | { ok: false; reason: 'not_found' | 'lookup_failed' }
> {
  const { client } = createServiceSupabase();
  if (!client) return { ok: false, reason: 'lookup_failed' };
  const { data, error } = await client
    .from('users')
    .select('role, status')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { ok: false, reason: 'lookup_failed' };
  if (!data) return { ok: false, reason: 'not_found' };
  return {
    ok: true,
    caller: {
      role: String(data.role || ''),
      status: data.status ? String(data.status) : null,
    },
  };
}

function sessionFailure(configError: string | null): PlatformAdminGate {
  if (configError && /token inválido|sessão inválida/i.test(configError)) {
    return { ok: false, status: 401, error: 'Sessão inválida.' };
  }
  if (configError) {
    return { ok: false, status: 503, error: 'Serviço de autenticação indisponível.' };
  }
  return { ok: false, status: 401, error: 'Sessão expirada.' };
}

export async function authorizePlatformAdminRequest(
  request: Request,
  claimedCallerId?: string | null,
  deps?: Partial<PlatformAdminDeps>,
): Promise<PlatformAdminGate> {
  const resolved: PlatformAdminDeps = {
    getRequestAuthUser,
    loadCaller: loadCallerFromServer,
    ...testDeps,
    ...deps,
  };
  const { user, configError } = await resolved.getRequestAuthUser(request);
  if (!user?.id) return sessionFailure(configError);

  const session = sessionCallerDecision({
    sessionUserId: user.id,
    claimedCallerId,
  });
  if (!session.allow) {
    return { ok: false, status: 403, error: 'Permissão negada.' };
  }

  const loaded = await resolved.loadCaller(user.id);
  if (!loaded.ok) {
    if (loaded.reason === 'lookup_failed') {
      return { ok: false, status: 503, error: 'Não foi possível confirmar a autorização.' };
    }
    return { ok: false, status: 403, error: 'Permissão negada.' };
  }
  if (String(loaded.caller.status || 'ACTIVE').toUpperCase() === 'INACTIVE') {
    return { ok: false, status: 403, error: 'Permissão negada.' };
  }
  if (String(loaded.caller.role || '').trim().toUpperCase() !== PLATFORM_ADMIN_ROLE) {
    return { ok: false, status: 403, error: 'Permissão negada.' };
  }
  return { ok: true, userId: user.id, role: PLATFORM_ADMIN_ROLE };
}
