import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createServiceSupabase(): { client: SupabaseClient | null; error?: string } {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { client: null, error: 'Service role não configurada.' };
  }
  return {
    client: createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    ),
  };
}

export async function assertSuperAdmin(
  supabaseAdmin: SupabaseClient,
  userId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!userId) return { ok: false, error: 'userId é obrigatório.' };
  const { data, error } = await supabaseAdmin.from('users').select('role').eq('id', userId).single();
  if (error || data?.role !== 'SUPER_ADMIN') {
    return { ok: false, error: 'Permissão negada.' };
  }
  return { ok: true };
}
