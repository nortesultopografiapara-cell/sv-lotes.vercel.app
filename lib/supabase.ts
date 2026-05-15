import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const supabase = createBrowserClient(
  supabaseUrl || 'https://mock.supabase.co', 
  supabaseAnonKey || 'mock-key',
  {
    auth: {
      lock: async (name, timeout, fn) => { return await fn(); }
    }
  }
);
