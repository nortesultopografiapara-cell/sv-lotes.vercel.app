'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function handleAuthCallback() {
      try {
        // Supabase client automatically parses the hash fragment (#access_token=...)
        // and establishes the session.
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;

        if (session) {
          // If we have a session, let's check if the user needs to force change password
          const { data: userData } = await supabase
            .from('users')
            .select('force_password_change')
            .eq('id', session.user.id)
            .single();

          if (userData?.force_password_change) {
            router.push('/onboarding');
          } else {
            router.push('/');
          }
        } else {
          // If there's no session and it didn't parse from Hash, redirect to login
          router.push('/login');
        }
      } catch (err: any) {
        if (mounted) {
          console.error('Auth callback error:', err);
          setError(err.message || 'Ocorreu um erro ao validar seu acesso.');
        }
      }
    }

    handleAuthCallback();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-background)]">
         <div className="bg-[var(--color-surface)] p-8 border border-[var(--color-border)] rounded-2xl max-w-md w-full text-center">
            <h2 className="text-red-500 font-bold mb-4 text-xl">Erro de Autenticação</h2>
            <p className="text-[var(--color-text-muted)] text-sm mb-6">{error}</p>
            <button 
              onClick={() => router.push('/login')}
              className="px-6 py-2 bg-[var(--color-surface-bright)] text-white font-medium rounded-lg hover:bg-[var(--color-border)] transition-colors w-full"
            >
               Voltar para Login
            </button>
         </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-background)] flex-col gap-4">
      <Loader2 className="w-8 h-8 text-[#06b6d4] animate-spin" />
      <p className="text-[var(--color-text-muted)] font-mono text-sm tracking-wider uppercase animate-pulse">
        Autenticando...
      </p>
    </div>
  );
}
