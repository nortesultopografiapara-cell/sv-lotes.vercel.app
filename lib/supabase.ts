import { createBrowserClient } from '@supabase/ssr';
import { getClientConfigErrorMessage, getSupabaseConfigStatus } from '@/lib/supabase-config';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = getSupabaseConfigStatus().configured;

if (typeof window !== 'undefined') {
  const status = getSupabaseConfigStatus();
  if (!status.configured) {
    console.warn('[Supabase] Configuração incompleta:', status.issues);
    console.warn(
      '[Supabase] Copie .env.example → .env.local, preencha URL e ANON_KEY e reinicie npm run dev.',
    );
  } else {
    console.log('[Supabase] URL:', supabaseUrl.replace(/^(https:\/\/[^.]+).*/, '$1...'));
  }
}

/**
 * Cliente browser — sem URL mock (mock.supabase.co causava "TypeError: Failed to fetch").
 * Se env estiver ausente, usa placeholder local apenas para evitar crash na importação;
 * chamadas falham com mensagem clara via getClientConfigErrorMessage().
 */
export const supabase = createBrowserClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseAnonKey || 'missing-anon-key',
  {
    auth: {
      lock: async (_name, _timeout, fn) => await fn(),
    },
  },
);

export { getClientConfigErrorMessage, getSupabaseConfigStatus };
