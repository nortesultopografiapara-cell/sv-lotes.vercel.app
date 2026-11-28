import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serviceClientGate } from '@/lib/security/supabaseProjectGuard';

export function createServiceSupabase(): { client: SupabaseClient | null; error?: string } {
  const gate = serviceClientGate(process.env);
  if (!gate.ok) return { client: null, error: gate.error };
  return {
    client: createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { autoRefreshToken: false, persistSession: false } },
    ),
  };
}

/**
 * Confere o papel de um id que já veio da sessão validada.
 * Não aceita, sozinho, o userId enviado pelo navegador.
 * Rotas novas usam authorizePlatformAdminRequest.
 */
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
