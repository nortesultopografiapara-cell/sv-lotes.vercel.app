import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getServerConfigErrorMessage, getSupabaseConfigStatus } from '@/lib/supabase-config';

export async function createRouteHandlerSupabase(): Promise<{
  client: SupabaseClient | null;
  configError: string | null;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey || url.includes('mock.supabase.co')) {
    return {
      client: null,
      configError:
        getServerConfigErrorMessage() ||
        'Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  const cookieStore = await cookies();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* setAll em Server Components pode falhar; em Route Handlers funciona */
        }
      },
    },
  });

  return { client, configError: null };
}

export function createAdminSupabase(): {
  client: SupabaseClient | null;
  configError: string | null;
} {
  const configError = getServerConfigErrorMessage();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (configError || !url || !serviceKey) {
    return { client: null, configError: configError || 'Supabase admin não configurado.' };
  }

  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { client, configError: null };
}

/** Sessão via cookies da requisição ou Authorization: Bearer */
export async function getRequestAuthUser(request: Request) {
  const { client, configError } = await createRouteHandlerSupabase();
  if (!client) return { user: null, configError };

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data, error } = await client.auth.getUser(token);
    if (error) {
      return { user: null, configError: `Token inválido: ${error.message}` };
    }
    return { user: data.user, configError: null };
  }

  const { data, error } = await client.auth.getUser();
  if (error) {
    return { user: null, configError: `Sessão inválida: ${error.message}` };
  }
  return { user: data.user, configError: null };
}

/** Perfil em public.users (tenant_id, role) para APIs de empresa parceira. */
export const CALLER_PROFILE_SELECT =
  'id, role, tenant_id, email, full_name, status';

export async function resolveCallerProfile(
  supabase: SupabaseClient,
  authUserId: string,
) {
  const { data, error } = await supabase
    .from('users')
    .select(CALLER_PROFILE_SELECT)
    .eq('id', authUserId)
    .maybeSingle();
  if (error) {
    console.warn('[resolveCallerProfile]', error.message);
  }
  return data;
}

export function logSupabaseConfigDebug(context: string) {
  const status = getSupabaseConfigStatus();
  console.log(`[${context}] Supabase config`, {
    url: status.url ? `${status.url.slice(0, 32)}...` : '(vazio)',
    hasAnonKey: status.hasAnonKey,
    hasServiceRole: status.hasServiceRole,
    isMockUrl: status.isMockUrl,
    issues: status.issues,
  });
}
