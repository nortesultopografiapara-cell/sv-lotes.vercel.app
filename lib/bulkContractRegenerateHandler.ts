import {
  bulkRegenerateForbiddenJson,
  bulkRegenerateUnauthorizedJson,
  bulkRegenerateUnavailableJson,
} from '@/lib/bulkContractRegenerateAuth';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export type BulkRegenerateAuthUserResult = {
  user: User | null;
  configError: string | null;
};

export type BulkRegenerateAdminResult = {
  client: SupabaseClient | null;
  configError: string | null;
};

export type BulkRegenerateHandlerDeps = {
  getRequestAuthUser: (request: Request) => Promise<BulkRegenerateAuthUserResult>;
  createAdminSupabase: () => BulkRegenerateAdminResult;
  assertSuperAdmin: (
    supabaseAdmin: SupabaseClient,
    userId?: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
  refreshAllContractGeneratedHtml: (
    supabaseAdmin: SupabaseClient,
  ) => Promise<{ updatedCount: number }>;
};

export type BulkRegenerateHttpResult = {
  status: number;
  body: Record<string, unknown>;
};

function isConfigUnavailable(configError: string | null): boolean {
  if (!configError) return false;
  return !/token inválido|sessão inválida/i.test(configError);
}

export async function executeBulkRegenerate(
  request: Request,
  method: 'GET' | 'POST',
  deps: BulkRegenerateHandlerDeps,
): Promise<BulkRegenerateHttpResult> {
  const { user, configError } = await deps.getRequestAuthUser(request);
  if (!user) {
    if (isConfigUnavailable(configError)) {
      return { status: 503, body: bulkRegenerateUnavailableJson() };
    }
    return { status: 401, body: bulkRegenerateUnauthorizedJson() };
  }

  const { client: supabaseAdmin } = deps.createAdminSupabase();
  if (!supabaseAdmin) {
    return { status: 503, body: bulkRegenerateUnavailableJson() };
  }

  const auth = await deps.assertSuperAdmin(supabaseAdmin, user.id);
  if (!auth.ok) {
    return { status: 403, body: bulkRegenerateForbiddenJson() };
  }

  if (method === 'GET') {
    return {
      status: 200,
      body: {
        ok: true,
        write: false,
        method: 'GET',
      },
    };
  }

  try {
    const result = await deps.refreshAllContractGeneratedHtml(supabaseAdmin);
    return { status: 200, body: { success: true, updatedCount: result.updatedCount } };
  } catch (err) {
    console.error('[api/regenerate] POST failed');
    void err;
    return {
      status: 500,
      body: { error: 'Falha ao regenerar contratos.', code: 'REGENERATE_FAILED' },
    };
  }
}
